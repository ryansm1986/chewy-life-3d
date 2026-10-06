// Room purposes for a Burrow floor. After DungeonWorld has built the walls, wall props, lights and centrepieces, every
// non-boss room gets a purpose that fits its biome (a camp, a vegetable patch, a tea room, an altar hall, a prep
// kitchen, a bakery, a geode, a miners' camp...) and a few set pieces in the room INTERIOR that tell it.
//  - Placement is a small constraint search per piece: it stays inside its room, off corridor mouths, off the painted
//    trails that join the mouths to the room's heart, off the shrine runners, away from monster spawns, chests, pots,
//    shrines, stairs, the arrival and the waypoint (clear(): DungeonWorld.keepClear with a tighter arrival circle), off
//    the burrow's painted puddles, and keeps an open fighting ring in the middle of the room. Colliding pieces keep a
//    walkable moat and walking lanes between each other, so fights never meet a chokepoint.
//  - Only the big pieces get (round) colliders; low things (mats, crops, cushions, roots, ponds) are walked over.
//  - Everything appends into DungeonWorld's chunked batches (solid / clutter / glow / halos), so the whole pass adds no
//    materials and only a few chunk draw calls; flat things are floor decals painted by the floor shader (DECAL_PARS).
//  - Corridors get sparse, low wall-foot clutter (dressCorridors), never colliders.
//  - The clutter pass that runs afterwards (buildDressing) keeps off every footprint claimed here (W.noClutterAt).
//  - W.roomPlan / W.roomDressStats record what each room became (debugging / QA).
import * as THREE from 'three';
import { CELL } from './gen.js';
import { SH, M, MD, col, tplOf, DECAL_MAX, RUG_KINDS } from './dungeonWorld.js';
import { tube, mergeGeometries } from '../gfx/geom.js';
import { mulberry32, clamp, TAU } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const CAM = Math.PI / 4; // yaw whose local +z looks at the (fixed-yaw) dungeon camera
const CX = Math.SQRT1_2, CZ = Math.SQRT1_2;
const TPL = new Map();
const tpl = (k, make, flat) => { let t = TPL.get(k); if (!t) TPL.set(k, t = tplOf(make(), flat)); return t; };
// extra low-poly templates (local y up, unit size)
const X = {
  frond: () => tpl('frond', frondGeo),
  bowl: () => tpl('bowl', () => new THREE.LatheGeometry([[0.001, 0], [0.55, 0.02], [0.9, 0.3], [1, 0.62], [0.88, 0.62], [0.78, 0.34], [0.5, 0.12], [0.001, 0.1]].map(([a, b]) => new THREE.Vector2(a, b)), 12)),
  panel: () => tpl('panel', () => new THREE.PlaneGeometry(1, 1, 8, 12).translate(0, 0.5, 0)), // vertical, faces +z
  skin: () => tpl('skin', () => new THREE.RingGeometry(0.001, 1, 18, 4).rotateX(-Math.PI / 2)), // faces +y
  spike: () => tpl('spike', () => new THREE.ConeGeometry(1, 1, 7, 4).translate(0, 0.5, 0)),
  ringLo: () => tpl('ringLo', () => new THREE.TorusGeometry(1, 0.2, 4, 10).rotateX(Math.PI / 2)),
  cushion: () => tpl('cushion', () => { // puffy square cushion (zabuton), 1 x 1 x 1 around y 0..1
    const g = new THREE.BoxGeometry(1, 1, 1, 3, 1, 3).translate(0, 0.5, 0), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), k = 1 - 4 * Math.max(x * x, z * z); p.setY(i, p.getY(i) > 0.5 ? 0.62 + 0.38 * Math.max(0, k) : 0); p.setX(i, x * (1 - 0.06 * (1 - k))); p.setZ(i, z * (1 - 0.06 * (1 - k))); }
    g.computeVertexNormals();
    return g;
  }),
  canopy: () => tpl('canopy', () => new THREE.ConeGeometry(1, 1, 16, 4).translate(0, 0.5, 0)),
  dome: () => tpl('dome', () => new THREE.SphereGeometry(1, 14, 7, 0, TAU, 0, Math.PI / 2)),
  clover: () => tpl('clover', () => { // three round leaflets
    const L = [0, 1, 2].map(i => { const a = i / 3 * TAU + 0.3; return new THREE.SphereGeometry(1, 6, 3).scale(0.55, 0.14, 0.5).translate(Math.cos(a) * 0.5, 0.1, Math.sin(a) * 0.5).toNonIndexed(); });
    return mergeGeometries(L, false);
  }),
  tent: () => tpl('tent', () => { // A-frame tent, ridge along x (-0.5..0.5), apex y 1, base z -0.5..0.5; dark inner ends
    const P = [], q = (a, b, c, d) => P.push(...a, ...b, ...c, ...a, ...c, ...d);
    q([-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 1, 0], [-0.5, 1, 0]); q([0.5, 0, -0.5], [-0.5, 0, -0.5], [-0.5, 1, 0], [0.5, 1, 0]);
    for (const x of [-0.4, 0.4]) { P.push(x, 0, 0.47, x, 0, -0.47, x, 0.94, 0); P.push(x, 0, -0.47, x, 0, 0.47, x, 0.94, 0); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); return g;
  }, true),
  lump: () => tpl('lump', () => { // lumpy boulder with enough faces for a moss cap
    const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position, r = mulberry32(77);
    const seen = new Map();
    for (let i = 0; i < p.count; i++) { const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`; let s = seen.get(k); if (s == null) seen.set(k, s = 0.86 + r() * 0.26); p.setXYZ(i, p.getX(i) * s, p.getY(i) * s, p.getZ(i) * s); }
    return g;
  }, true),
};
// an arching fern frond along +z (length 1), leaflets serrating both edges
function frondGeo() {
  const P = [], n = 9;
  const pt = (t, s) => { const w = 0.17 * Math.pow(Math.sin(Math.min(1, t * 1.08) * Math.PI), 0.75); return [s * w, 0.62 * t * (1.45 - t) + (s ? -0.035 : 0.03), t]; };
  const tri = (a, b, c) => { const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]; if (uz * vx - ux * vz < 0) P.push(...a, ...c, ...b); else P.push(...a, ...b, ...c); };
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, tm = (t0 + t1) / 2;
    for (const s of [-1, 1]) { const a0 = pt(t0, 0), a1 = pt(t1, 0), e0 = pt(t0, s * 0.45), em = pt(tm, s), e1 = pt(t1, s * 0.45); tri(a0, em, a1); tri(a0, e0, em); tri(a1, em, e1); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.computeVertexNormals();
  return g;
}
// float32 port of NOISE_GLSL's h1 / vn (dungeonWorld.js), so placement can see what the floor shader paints
const f32 = Math.fround, fract = v => f32(v - Math.floor(v));
function h1JS(x, y) {
  let a = fract(f32(x * 0.1031)), b = fract(f32(y * 0.1031)), c = fract(f32(x * 0.1031));
  const d = f32(f32(a * f32(b + 33.33)) + f32(b * f32(c + 33.33)) + f32(c * f32(a + 33.33)));
  a = f32(a + d); b = f32(b + d); c = f32(c + d);
  return fract(f32(f32(a + b) * c));
}
function vnJS(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = h1JS(ix, iy), b = h1JS(ix + 1, iy), c = h1JS(ix, iy + 1), d = h1JS(ix + 1, iy + 1);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}
const segDist = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-6, t = clamp(((px - ax) * dx + (pz - az) * dz) / l2); return Math.hypot(px - ax - dx * t, pz - az - dz * t); };
// painters
const grad = (c0, c1, k0 = 0.8, k1 = 0.1) => (px, py, pz, nx, ny, nz, o) => o.copy(col(c0)).lerp(col(c1), clamp(ny * k0 + k1));
const barkP = (c0 = '#6a4630', c1 = '#8e6444') => (px, py, pz, nx, ny, nz, o) => o.copy(col(c0)).lerp(col(c1), 0.5 + 0.5 * Math.sin(px * 17 + pz * 13 + py * 4));
const mossTop = (c0, c1 = '#7c9a5a', c2 = '#a8c07a') => (px, py, pz, nx, ny, nz, o) => o.copy(col(c0)).multiplyScalar(0.84 + 0.2 * clamp(ny * 0.5 + 0.5)).lerp(col(c1), clamp(ny * 2.2 - 1.1)).lerp(col(c2), clamp(ny * 3 - 2.4) * 0.6);

// room purposes per biome kit (each floor shuffles its list, so neighbouring rooms differ)
const PURPOSES = {
  burrow: ['camp', 'garden', 'grove', 'fallen', 'pond', 'den', 'rocks'],
  shrine: ['tea', 'altar', 'garden', 'study', 'dojo', 'koi'],
  kitchen: ['prep', 'hearth', 'bakery', 'dining', 'pantry', 'scullery'],
  crystal: ['geode', 'spires', 'stalagmites', 'drift', 'pool', 'mine'],
};

// purposes that would repeat a room's centrepiece (spring pond / crystal heart / fox shrine / cauldron): skipped there
const DUPES = { burrow: ['pond'], crystal: ['spires', 'geode'], shrine: ['altar'], kitchen: ['hearth'] };

export function dressRooms(W) { const D = new RoomDresser(W); D.run(); return D; }

class RoomDresser {
  constructor(W) {
    this.W = W; this.L = W.L; this.th = W.th; this.moon = W.variant === 'moon';
    const L = this.L;
    this.r = mulberry32(L.floor * 6151 + L.rooms.length * 97 + (L.rooms[0]?.x || 0) * 53 + (L.rooms[0]?.y || 0) * 7 + 1);
    this.B = W.solid; this.CL = W.clutter; this.GL = W.glow; this.HA = W.halos;
    this.taken = []; this.nLights = 0; this.plan = []; this.nPieces = 0;
  }
  rnd(a, b) { return a + this.r() * (b - a); }
  pick(a) { return a[Math.floor(this.r() * a.length)]; }
  run() {
    const L = this.L, W = this.W, th = this.th;
    const K = 4, GW = L.W * K, GH = L.H * K; this.nc = new Uint8Array(GW * GH); this.ncW = GW; this.ncH = GH;
    W.noClutterAt = (x, z) => { const i = Math.floor(x * K / CELL), j = Math.floor(z * K / CELL); return i >= 0 && j >= 0 && i < GW && j < GH && this.nc[j * GW + i] === 1; };
    const ZK = W.kit; // (a zone dungeon's kit brings its own purposes: dungeon/zoneKits)
    const list = ZK?.purposes || PURPOSES[th]; if (!list) return;
    const order = list.slice(); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(this.r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    let k = 0;
    for (const rm of L.rooms) {
      if (rm.kind === 'boss') continue;
      const A = this.A = this.analyze(rm);
      if (A.cells.length < 12) continue;
      if (rm.kind === 'start') { if (ZK?.arrival) ZK.arrival(this, A); else this.arrival(A); }
      const next = () => { let p = order[k++ % order.length]; if (A.center && (ZK?.dupes || DUPES[th])?.includes(p)) p = order[k++ % order.length]; return p; };
      const purpose = next(), second = A.cells.length > 85 ? next() : null;
      this.plan.push(`${rm.id}:${purpose}${second ? '+' + second : ''}`);
      for (const p of second ? [purpose, second] : [purpose]) { const n0 = this.nPieces; if (ZK) ZK.rooms[p]?.(this, A); else this[`${th}_${p}`]?.(A); if (this.nPieces === n0) (this.failed ||= []).push(`${rm.id}:${p}`); }
      if (ZK) ZK.extras?.(this, A); else this[`${th}_extras`]?.(A);
      if (rm.kind === 'treasure') { if (ZK?.hoard) ZK.hoard(this, A); else this.hoard(A); }
    }
    this.dressCorridors();
    this.flushDecals();
    W.roomPlan = this.plan; W.roomDressStats = { pieces: this.nPieces, decals: W.decals.n, lights: this.nLights, corridor: this.corridorBits, failed: this.failed || [] };
  }
  // ------------------------------------------------------------------ room analysis & placement
  analyze(rm) {
    const L = this.L, W = this.W, GW = L.W, at = L.at, rid = L.roomId, id = rm.id;
    const cells = [];
    for (let y = rm.y - 1; y <= rm.y + rm.h; y++) for (let x = rm.x - 1; x <= rm.x + rm.w; x++) if (at(x, y) && rid[y * GW + x] === id) cells.push([x, y]);
    const mq = [];
    for (const [x, y] of cells) {
      let m = false; for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (at(x + ox, y + oy) && rid[(y + oy) * GW + x + ox] !== id) m = true;
      if (!m) continue;
      const near = mq.find(q => Math.abs(q.x / q.n - x) + Math.abs(q.y / q.n - y) < 4);
      if (near) { near.x += x; near.y += y; near.n++; } else mq.push({ x, y, n: 1 });
    }
    const cx = (rm.cx + 0.5) * CELL, cz = (rm.cy + 0.5) * CELL;
    const mouths = mq.map(q => [(q.x / q.n + 0.5) * CELL, (q.y / q.n + 0.5) * CELL]);
    const spawns = L.spawns.filter(s => rid[s.y * GW + s.x] === id).map(s => [(s.x + 0.5) * CELL, (s.y + 0.5) * CELL]);
    const lanes = mouths.map(m => [m[0], m[1], cx, cz, 0.9, 0]); // the painted trails, mouth -> heart
    const R = [rm.x * CELL, rm.y * CELL, (rm.x + rm.w) * CELL, (rm.y + rm.h) * CELL];
    if (this.th === 'shrine' && rm.kind !== 'shrine') { // the red runner down the long axis (FLOOR_THEME.shrine)
      const ax = R[2] - R[0] >= R[3] - R[1], lo = [R[0] + 1.3, R[1] + 1.3], hi = [R[2] - 1.3, R[3] - 1.3];
      if (ax) lanes.push([lo[0] - 0.4, (R[1] + R[3]) / 2, hi[0] + 0.4, (R[1] + R[3]) / 2, 0.95, 1]);
      else lanes.push([(R[0] + R[2]) / 2, lo[1] - 0.4, (R[0] + R[2]) / 2, hi[1] + 0.4, 0.95, 1]);
    }
    let rug = null;
    if (this.th === 'kitchen' && RUG_KINDS.has(rm.kind)) { const hx = clamp((R[2] - R[0]) * 0.5 - 2.4, 1.2, 4.2), hz = clamp((R[3] - R[1]) * 0.5 - 2.4, 1.2, 4.2); rug = [(R[0] + R[2]) / 2, (R[1] + R[3]) / 2, hx + 0.35, hz + 0.35]; }
    const center = (L.centers || []).some(c => rid[c.y * GW + c.x] === id); // the room already has a centrepiece (buildCenterpieces)
    const big = rm.w >= 7 && rm.h >= 6 && rm.w * rm.h >= 48 && !center; // room for a piece at its heart
    return { rm, cells, mouths, spawns, lanes, cx, cz, rug, big, center, W };
  }
  // a free floor spot for a loose item of a set piece (a cushion, a stool): in the current room, walkable, not on a
  // runner, not in a keep-clear zone, not inside a collider
  ok(x, z, pad = 0.2) {
    const W = this.W, A = this.A;
    if (!W.walkable(x, z) || (A && this.roomAt(x, z) !== A.rm.id) || this.clear(x, z, 0, false) || this.puddle(x, z) || W.collision.solidAt(x, z, pad)) return false;
    return !A || !A.lanes.some(l => l[5] && segDist(x, z, l[0], l[1], l[2], l[3]) < l[4] + 0.3);
  }
  // DungeonWorld.keepClear with a tighter arrival circle for the set dressing: Chewy lands on the start cell and the
  // exit portal stands 2.3 m NW of it (dungeonMode.buildInteractables), so pieces may furnish the arrival room's edges
  // (colliders from 4.6 m, low decor from 3.6 m) where keepClear keeps the older clutter 6.4 m away. Everything else
  // (stairs, waypoint, chests, shrines, pots, boss ring) is the same test as keepClear.
  clear(x, z, pad = 0, collide = true) {
    const L = this.L, c = (cx, cy, r) => Math.hypot(x - (cx + 0.5) * CELL, z - (cy + 0.5) * CELL) < r * CELL + pad;
    const sx = (L.start.x + 0.5) * CELL, sz = (L.start.y + 0.5) * CELL;
    if (Math.hypot(x - sx, z - sz) < (collide ? 4.6 : 3.6) + pad || Math.hypot(x - sx + 1.6, z - sz + 1.6) < 1.9 + pad) return true;
    if (L.stairs && c(L.stairs.x, L.stairs.y, 1.8)) return true;
    if (L.waypoint && c(L.waypoint.x, L.waypoint.y, 2)) return true;
    for (const o of L.chests) if (c(o.x, o.y, 0.75)) return true;
    for (const o of L.shrines) if (c(o.x, o.y, 0.8)) return true;
    for (const o of L.pots) if (c(o.x, o.y, 0.55)) return true;
    const ar = this.W.arena;
    return !!ar && Math.hypot(x - ar.x, z - ar.z) < ar.R + 1.2 + pad;
  }
  // the burrow floor shader paints puddles where vn(p * 0.11 + 41) > ~0.7 (FLOOR_THEME.burrow): nothing stands in one
  puddle(x, z) { return this.th === 'burrow' && vnJS(x * 0.11 + 41, z * 0.11 + 41) > 0.675; }
  roomAt(x, z) { const L = this.L, cx = Math.floor(x / CELL), cz = Math.floor(z / CELL); return L.at(cx, cz) ? L.roomId[cz * L.W + cx] : -1; }
  // Find a spot for a piece of footprint radius rad. o.mode: 'open' (interior), 'wall' (back against a wall, facing the
  // room), 'center' (near the room's heart: only for a big room's main piece). o.collide (default true): it will carry
  // colliders, so it keeps clear of trails, spawns and the fighting ring. o.decal: a flat floor decal.
  spot(A, rad, o = {}) {
    const W = this.W, L = this.L, r = this.r, at = L.at, mode = o.mode || 'open', collide = o.collide !== false;
    let best = null, bs = -1e9;
    for (let t = 0; t < (o.tries || 48); t++) {
      let x, z, face = CAM + (r() - 0.5) * 1.4, fx = 0, fz = 0;
      if (mode === 'center') {
        const a = r() * TAU, d = Math.sqrt(r()) * (o.spread ?? 2.4); x = A.cx + Math.cos(a) * d; z = A.cz + Math.sin(a) * d;
      } else {
        const c = A.cells[Math.floor(r() * A.cells.length)], wd = W.wallDist[c[1] * L.W + c[0]];
        if (mode === 'wall') {
          if (wd !== 1) continue;
          const dx = (at(c[0] + 1, c[1]) ? 0 : 1) - (at(c[0] - 1, c[1]) ? 0 : 1), dz = (at(c[0], c[1] + 1) ? 0 : 1) - (at(c[0], c[1] - 1) ? 0 : 1);
          if (!dx && !dz) continue;
          const l = Math.hypot(dx, dz); fx = -dx / l; fz = -dz / l; face = Math.atan2(fx, fz);
          const back = CELL * 0.5 - (rad * (o.hug ?? 0.75) + 0.3), slide = (r() - 0.5) * 0.8;
          x = (c[0] + 0.5) * CELL - fx * back + fz * slide; z = (c[1] + 0.5) * CELL - fz * back - fx * slide;
        } else {
          if (wd < (o.minWd ?? 2)) continue;
          x = (c[0] + 0.5 + (r() - 0.5) * 0.9) * CELL; z = (c[1] + 0.5 + (r() - 0.5) * 0.9) * CELL;
        }
      }
      if (!this.fits(A, x, z, rad, o, mode, collide, fx, fz)) continue;
      let s = r();
      if (mode === 'wall') s += (fx * CX + fz * CZ) * (o.camPref ?? 0.9); // walls whose face the camera sees
      if (o.nearLane) s -= Math.abs(this.laneDist(A, x, z) - o.nearLane) * 0.6;
      if (o.near) s -= Math.hypot(x - o.near[0], z - o.near[1]) * 0.4;
      s += Math.min(4, this.nearestTaken(x, z)) * 0.12;
      if (s > bs) { bs = s; best = { x, z, face, fx, fz }; }
    }
    return best;
  }
  // rad = the whole footprint (mats, cushions, crops: walked over); core = the part that carries colliders (o.core,
  // default 0.8 rad). Footprints never overlap each other, props, walls or keep-clear zones; cores keep a walkable moat
  // round themselves (no chokepoints against walls or other colliders), stay off corridor mouths, off the trails'
  // centre lines and off monster spawn points, and keep walking lanes between each other.
  fits(A, x, z, rad, o, mode, collide, fx, fz) {
    const W = this.W, id = A.rm.id, wall = mode === 'wall', core = collide ? (o.core ?? rad * 0.8) : 0;
    if (this.clear(x, z, rad * 0.85 + (collide ? 0.25 : 0), collide)) return false;
    if (this.puddle(x, z) || this.puddle(x + rad * 0.7, z) || this.puddle(x - rad * 0.7, z) || this.puddle(x, z + rad * 0.7) || this.puddle(x, z - rad * 0.7)) return false;
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * TAU, ox = Math.cos(a) * rad * 0.95, oz = Math.sin(a) * rad * 0.95, px = x + ox, pz = z + oz;
      const ra = this.roomAt(px, pz);
      if (wall && ox * fx + oz * fz < -0.1 * rad) { if (ra !== -1 && ra !== id) return false; continue; } // behind: wall or own room
      if (ra !== id || !W.walkable(px, pz) || W.collision.solidAt(px, pz, 0.1)) return false;
    }
    if (!wall && (!W.walkable(x, z) || this.roomAt(x, z) !== id)) return false;
    if (W.collision.solidAt(x, z, collide ? core : 0.1)) return false;
    if (collide) {
      if (!wall) { for (let k = 0; k < 12; k++) { const a = k / 12 * TAU, px = x + Math.cos(a) * (core + 1.3), pz = z + Math.sin(a) * (core + 1.3); if (!W.walkable(px, pz) || W.collision.solidAt(px, pz, 0.05)) return false; } }
      else for (const d of [core * 2 + 1.5, core * 2 + 0.8]) { const px = x + fx * d, pz = z + fz * d; if (!W.walkable(px, pz) || W.collision.solidAt(px, pz, 0.3)) return false; } // leaves room in front
    }
    for (const m of A.mouths) if (Math.hypot(x - m[0], z - m[1]) < (collide ? core + 2.4 : rad + 0.9)) return false;
    for (const ln of A.lanes) {
      const d = segDist(x, z, ln[0], ln[1], ln[2], ln[3]);
      if (ln[5] ? d < rad + ln[4] + 0.1 : (collide && mode !== 'center' && d < core + 0.6) || (o.decal && d < rad * 0.4)) return false;
    }
    if (collide) for (const s of A.spawns) if (Math.hypot(x - s[0], z - s[1]) < core + 1.0) return false; // (a pack spawning on it is pushed out by the collider)
    if (collide && mode !== 'center' && Math.hypot(x - A.cx, z - A.cz) < core + (o.ring ?? 1.0)) return false;
    for (const c of this.L.centers || []) { const cx = (c.x + 0.5) * CELL, cz = (c.y + 0.5) * CELL; if (Math.hypot(x - cx, z - cz) < rad + 2.7) return false; }
    for (const t of this.taken) { const d = Math.hypot(x - t[0], z - t[1]); if (d < rad + t[2] + 0.2 || (collide && t[3] && d < core + t[4] + 2.0)) return false; }
    if (o.decal && A.rug && Math.abs(x - A.rug[0]) < A.rug[2] + rad && Math.abs(z - A.rug[1]) < A.rug[3] + rad) return false;
    for (const l of this.W.L.lights) { const lx = (l.x + 0.5) * CELL, lz = (l.y + 0.5) * CELL; if (Math.hypot(x - lx, z - lz) < rad + 0.8) return false; }
    return true;
  }
  laneDist(A, x, z) { let d = 1e9; for (const ln of A.lanes) d = Math.min(d, segDist(x, z, ln[0], ln[1], ln[2], ln[3])); return d; }
  nearestTaken(x, z) { let d = 9; for (const t of this.taken) d = Math.min(d, Math.hypot(x - t[0], z - t[1]) - t[2]); return d; }
  claim(x, z, rad, collide = true, ncRad = rad, core = rad * 0.8) {
    this.taken.push([x, z, rad, collide, collide ? core : 0]); this.nPieces++;
    const K = 4, i0 = Math.floor((x - ncRad) * K / CELL), i1 = Math.ceil((x + ncRad) * K / CELL), j0 = Math.floor((z - ncRad) * K / CELL), j1 = Math.ceil((z + ncRad) * K / CELL);
    for (let j = Math.max(0, j0); j <= Math.min(this.ncH - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(this.ncW - 1, i1); i++) {
      if (Math.hypot((i + 0.5) * CELL / K - x, (j + 0.5) * CELL / K - z) < ncRad) this.nc[j * this.ncW + i] = 1;
    }
  }
  // place + claim in one go; returns the spot or null
  put(A, rad, o = {}) { const s = this.spot(A, rad, o); if (s) { s.rad = rad; this.claim(s.x, s.z, rad, o.collide !== false, o.ncRad ?? rad, o.core ?? rad * 0.8); } return s; }
  coll(x, z, r) { this.W.collision.addCircle(x, z, r); }
  light(x, y, z, c, i = 5, rad = 6, fl = 0.4) { if (this.nLights >= 9) return; this.nLights++; this.W.lightPool.addSource({ pos: V(x, y, z), color: new THREE.Color(c), intensity: i, radius: rad, flicker: fl }); }
  // local (lx along the piece's right, lz toward its front) -> world
  lp(s, lx, lz) { const c = Math.cos(s.face), n = Math.sin(s.face); return [s.x + lx * c + lz * n, s.z - lx * n + lz * c]; }
  decal(kind, x, z, hx, hz, ang, va = 0, extra = [0, 0, 0, 0]) {
    const D = this.W.decals; if (D.n >= DECAL_MAX) return false;
    const i = D.n++;
    D.A[i].set(x, z, hx, hz); D.B[i].set(kind, ang, this.r(), va); D.C[i].set(...extra);
    const L = this.L, map = this.W.decMap.image.data, R = Math.hypot(hx, hz) + 0.7;
    for (let cy = Math.floor((z - R) / CELL); cy <= Math.floor((z + R) / CELL); cy++) for (let cx = Math.floor((x - R) / CELL); cx <= Math.floor((x + R) / CELL); cx++) {
      if (cx < 0 || cy < 0 || cx >= L.W || cy >= L.H) continue;
      const k = (cy * L.W + cx) * 4;
      if (!map[k]) map[k] = i + 1; else if (!map[k + 1]) map[k + 1] = i + 1;
    }
    return true;
  }
  flushDecals() { this.W.decMap.needsUpdate = true; }
  // ------------------------------------------------------------------ shared little builders
  fern(b, x, z, s = 1, c0 = '#3a6a2c', c1 = '#9ccc64') {
    const r = this.r, n = 6 + Math.floor(r() * 3), a0 = col(c0), a1 = col(c1);
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + r() * 0.5, sc = s * (0.6 + r() * 0.5);
      b.add(X.frond(), M(x, 0, z, sc * 0.9, sc * (0.7 + r() * 0.5), sc, 0, a, 0), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => o.copy(a0).lerp(a1, clamp(lz * 0.85 + 0.1)).multiplyScalar(0.8 + 0.25 * clamp(ny)));
    }
  }
  rockLump(b, x, z, sx, sy, sz, c = '#a89c94', moss = true) {
    const r = this.r;
    b.add(X.lump(), M(x, sy * 0.45, z, sx, sy, sz, (r() - 0.5) * 0.3, r() * TAU, (r() - 0.5) * 0.3), null, moss ? mossTop(c) : grad(c, '#e8e0da', 0.5, 0.3));
  }
  leafPile(b, x, z, s = 1) {
    const r = this.r;
    b.add(SH.hemiLo(), M(x, -0.03, z, 0.42 * s, 0.17 * s, 0.36 * s, 0, r() * TAU, 0), null, grad('#8a5a34', '#b87a44', 0.6, 0.2));
    for (let i = 0; i < 26 * s; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 0.75 * s, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, h = Math.max(0.01, 0.16 * s * (1 - (d / (0.5 * s)) ** 2));
      const lc = col(this.pick(['#c89a50', '#d67a48', '#e0b060', '#b8643e', '#9cae62']));
      b.add(SH.leaf(), M(px, h, pz, 0.11, 0.05, 0.11, (r() - 0.5) * 0.6, r() * TAU, (r() - 0.5) * 0.6), null, (qx, qy, qz, nx, ny, nz, o, lx, ly, lz) => o.copy(lc).multiplyScalar(ly > 0.1 ? 1 : 0.8));
    }
  }
  cushion(b, x, z, face, c, s = 1) {
    b.add(X.cushion(), M(x, 0, z, 0.56 * s, 0.13 * s, 0.56 * s, 0, face, 0), null, (px, py, pz, nx, ny, nz, o) => o.copy(col(c)).multiplyScalar(0.8 + 0.25 * clamp(ny)));
    b.add(SH.sphLo(), M(x, 0.13 * s, z, 0.035), col('#ffd24a'));
  }
  // ------------------------------------------------------------------ the arrival: the way home
  // The exit portal (2.3 m NW of the start cell, dungeonMode.buildInteractables) gets a pair of biome lamps either side,
  // a landing mat under it and a signboard, so the first room reads as the Burrow's front door.
  arrival(A) {
    const W = this.W, L = this.L, th = this.th, B = this.B, GL = this.GL, HA = this.HA, r = this.r, P = th === 'shrine' ? this.SP : null;
    const px = (L.start.x + 0.5) * CELL - 1.6, pz = (L.start.y + 0.5) * CELL - 1.6, rx = CX, rz = -CZ; // screen-right along the floor
    if (th !== 'kitchen') this.decal(th === 'shrine' ? 1 : 2, px, pz, th === 'shrine' ? 1.25 : 1.1, th === 'shrine' ? 0.85 : 1.1, -Math.PI / 4, th === 'shrine' ? 3 : this.moon ? 1 : 0);
    for (const e of [-1, 1]) {
      const x = px + rx * e * 1.4, z = pz + rz * e * 1.4;
      if (!W.walkable(x, z) || W.collision.solidAt(x, z, 0.2)) continue;
      if (th === 'burrow' || th === 'kitchen') { // lantern hung from a crook (burrow: stick; kitchen: iron)
        const pc = th === 'burrow' ? '#6a4a34' : '#3a3438';
        B.add(SH.cyl6(), M(x, 0, z, 0.04, 1.3, 0.04), col(pc));
        B.add(SH.cyl6(), MD(x, 1.28, z, V(rx * e * -1, 0, rz * e * -1), 0.025, 0.3, 0.025), col(pc));
        const lx = x - rx * e * 0.28, lz = z - rz * e * 0.28;
        B.add(SH.cyl(), M(lx, 1.05, lz, 0.006, 0.23, 0.006), col('#2a2020'));
        GL.add(SH.sph(), M(lx, 0.98, lz, 0.11, 0.14, 0.11), null, (qx, qy, qz, nx, ny, nz, o) => o.set(Math.abs(qy - 0.98) > 0.11 ? '#8a5a3a' : '#ffd890'));
        B.add(SH.cone(), M(lx, 1.08, lz, 0.13, 0.08, 0.13), col(pc));
        HA.add(lx, 0.98, lz, 1.3, '#ffc47a', 0.6, 1);
      } else if (th === 'shrine') W.toro(B, GL, x, z, CAM, 0.8, P.fire, P.flame);
      else { // crystal lamp: a tall pale shard on a frosted rock
        W.ddPebble(B, x, z, 0.24, col('#5a4c8c'), '#dfe6ff');
        GL.add(SH.crys(), MD(x, 0.1, z, V(0, 1, 0), 0.1, 0.8, 0.1, r()), null, (qx, qy, qz, nx, ny, nz, o, lx2, ly) => o.copy(col('#8af0ff')).lerp(col('#ffffff'), clamp(ly * 0.6)));
        HA.add(x, 0.6, z, 1.5, '#8af0ff', 0.5);
      }
      this.coll(x, z, 0.16);
    }
    // a signboard beside the portal: two posts, a board with painted lines and a paw
    const sx = px + rx * 2.5 - CX * 0.3, sz = pz + rz * 2.5 - CZ * 0.3;
    if (W.walkable(sx, sz) && !W.collision.solidAt(sx, sz, 0.4) && !this.puddle(sx, sz)) {
      const board = th === 'kitchen' ? '#3a3a3e' : th === 'crystal' ? '#8a7cc4' : th === 'shrine' ? (this.moon ? '#6a6a8a' : '#c8a878') : '#c8a070';
      const ink = th === 'kitchen' ? '#f4f0e8' : '#5a3a2a', post = th === 'crystal' ? '#5a4c8c' : '#6a4a34', ax = Math.cos(CAM), az = -Math.sin(CAM);
      for (const e of [-1, 1]) B.add(SH.cyl6(), M(sx + ax * e * 0.36, 0, sz + az * e * 0.36, 0.035, 1.05, 0.035), col(post));
      const at = (lx, y, f) => [sx + ax * lx + CX * f, y, sz + az * lx + CZ * f], FD = V(CX, 0, CZ); // board-local -> world (f: toward the camera)
      B.add(SH.box(), M(...at(0, 0.47, -0.01), 0.9, 0.56, 0.04, 0, CAM, 0), col(post)); // frame
      B.add(SH.box(), M(...at(0, 0.5, 0.005), 0.8, 0.5, 0.04, 0, CAM, 0), col(board));
      for (const [lx0, y, len] of [[-0.3, 0.86, 0.36], [-0.3, 0.76, 0.42], [-0.3, 0.66, 0.3], [-0.3, 0.56, 0.38]]) B.add(SH.box(), M(...at(lx0 + len / 2 - 0.04, y, 0.028), len, 0.026, 0.008, 0, CAM, 0), col(ink)); // lines of writing
      const pw = th === 'kitchen' ? '#ff9ab8' : '#e8604a'; // and a paw print
      B.add(SH.cyl6(), MD(...at(0.25, 0.64, 0.022), FD, 0.065, 0.012, 0.055), col(pw));
      for (const [a, b] of [[0.17, 0.73], [0.225, 0.765], [0.285, 0.765], [0.335, 0.73]]) B.add(SH.cyl6(), MD(...at(a, b, 0.022), FD, 0.024, 0.012, 0.024), col(pw));
      this.coll(sx, sz, 0.2);
    }
    this.claim(px, pz, 1.4, false);
  }
  // ------------------------------------------------------------------ corridors
  // Low things gathered at the wall foot of the tunnels between rooms (never a collider, so a corridor can't clog):
  // ferns, toadstools, leaf drifts and acorns in the burrow; candles, scrolls and book stacks in the shrine; crocks,
  // dishes and dropped veg in the kitchen; glowing sprouts, frosted rubble and snow in the grotto.
  dressCorridors() {
    const W = this.W, L = this.L, r = this.r, at = L.at, th = this.th; this.A = null;
    let n = 0;
    for (let y = 2; y < L.H - 2; y++) for (let x = 2; x < L.W - 2; x++) {
      const k = y * L.W + x;
      if (!at(x, y) || L.roomId[k] || W.wallDist[k] !== 1 || r() > 0.2) continue;
      const dx = (at(x + 1, y) ? 0 : 1) - (at(x - 1, y) ? 0 : 1), dz = (at(x, y + 1) ? 0 : 1) - (at(x, y - 1) ? 0 : 1);
      if (!dx && !dz) continue;
      const l = Math.hypot(dx, dz), px = (x + 0.5 + dx / l * 0.24 + (r() - 0.5) * 0.3) * CELL, pz = (y + 0.5 + dz / l * 0.24 + (r() - 0.5) * 0.3) * CELL;
      if (!W.walkable(px, pz) || W.keepClear(px, pz) || this.puddle(px, pz) || W.noClutterAt(px, pz) || W.collision.solidAt(px, pz, 0.25)) continue;
      const face = Math.atan2(-dx, -dz), q = r(); n++;
      if (W.kit) W.kit.corridor?.(this, px, pz, face, q);
      else if (th === 'burrow') {
        if (q < 0.3) this.fern(this.CL, px, pz, 0.7 + r() * 0.3);
        else if (q < 0.5) W.ddMushrooms(this.CL, px, pz, 0.8 + r() * 0.5, this.pick(['#d8563e', '#c89a64', '#e8604a']));
        else if (q < 0.65) this.leafPile(this.CL, px, pz, 0.7);
        else if (q < 0.75) W.acorns(this.CL, px, pz);
        else if (q < 0.85) W.mushrooms(this.GL, px, 0, pz, this.pick(['#8ad8ff', '#ff9ad0']), 0.6, this.HA);
        else for (let i = 0; i < 3; i++) W.ddPebble(this.CL, px + (r() - 0.5) * 0.5, pz + (r() - 0.5) * 0.5, 0.06 + r() * 0.07, col('#a89888'));
      } else if (th === 'shrine') {
        if (q < 0.3) W.ddCandles(px, pz);
        else if (q < 0.5) W.scrolls(this.CL, px, pz, face);
        else if (q < 0.65) this.bookStack(px, pz);
        else if (q < 0.8) this.cushion(this.CL, px, pz, face + (r() - 0.5) * 0.4, this.pick(this.SP.cush));
        else this.vaseSprig(this.CL, px, 0, pz);
      } else if (th === 'kitchen') {
        if (q < 0.3) this.crocks(px, pz);
        else if (q < 0.5) W.ddVeggies(px, pz);
        else if (q < 0.65) this.dishes(px, pz);
        else if (q < 0.8) W.bottles(this.CL, px, pz);
        else W.ddEggs(px, pz);
      } else {
        if (q < 0.35) W.ddSprouts(this.GL, px, pz, 0.9 + r() * 0.5, this.pick(['#7af0ff', '#ff8ae0', '#c8a8ff']));
        else if (q < 0.7) for (let i = 0; i < 3; i++) W.ddPebble(this.CL, px + (r() - 0.5) * 0.5, pz + (r() - 0.5) * 0.5, 0.06 + r() * 0.08, col('#6a5c9c'), '#e4ecff');
        else W.snowMound(this.CL, px, pz);
      }
    }
    this.corridorBits = n;
  }
  // ------------------------------------------------------------------ treasure rooms: a scattered hoard round the gold chest
  hoard(A) {
    const W = this.W, r = this.r, CL = this.CL, GL = this.GL;
    for (const c of this.L.chests) {
      if (c.quality !== 'gold' || this.roomAt((c.x + 0.5) * CELL, (c.y + 0.5) * CELL) !== A.rm.id) continue;
      const x0 = (c.x + 0.5) * CELL, z0 = (c.y + 0.5) * CELL;
      for (let i = 0; i < 26; i++) {
        const a = r() * TAU, d = 1.55 + Math.pow(r(), 1.6) * 1.2, x = x0 + Math.cos(a) * d, z = z0 + Math.sin(a) * d;
        if (!W.walkable(x, z) || W.collision.solidAt(x, z, 0.1)) continue;
        if (r() < 0.78) { // gold coins, the odd little stack
          const st = r() < 0.25 ? 2 + Math.floor(r() * 3) : 1;
          for (let q = 0; q < st; q++) CL.add(SH.cyl6(), M(x + (r() - 0.5) * 0.02, q * 0.025, z + (r() - 0.5) * 0.02, 0.07, 0.022, 0.07, (r() - 0.5) * (st > 1 ? 0.1 : 0.5), r() * TAU, 0), null, (px, py, pz, nx, ny, nz, o) => o.set(ny > 0.6 ? '#ffe070' : '#d8a030'));
        } else GL.add(SH.crys(), MD(x, 0, z, V((r() - 0.5) * 0.6, 1, (r() - 0.5) * 0.6).normalize(), 0.05, 0.14, 0.05, r() * TAU), col(this.pick(['#ff7ab0', '#7ae0ff', '#a8ff9a', '#c8a8ff'])));
      }
      this.HA.add(x0, 0.4, z0, 3.2, '#ffe07a', 0.22);
    }
  }
  // ================================================================== BURROW (mossy grass & dirt)
  burrow_camp(A) { // a critter camp: campfire with log seats, a pot on a tripod, a bedroll and a signpost to it
    const s = this.put(A, 2.0, A.big ? { mode: 'center', spread: 2.6, core: 1.0 } : { core: 1.0 }) || this.put(A, 1.7, { core: 1.0 });
    if (!s) return;
    const B = this.B, CL = this.CL, GL = this.GL, r = this.r, { x, z } = s;
    CL.add(SH.disc(), M(x, 0.004, z, 0.52, 0.015, 0.52), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => o.copy(col('#3e3232')).lerp(col('#7a6a60'), clamp(Math.hypot(lx, lz))));
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + r() * 0.2; B.add(SH.rock(), M(x + Math.cos(a) * 0.6, 0.07, z + Math.sin(a) * 0.6, 0.15 + r() * 0.05, 0.12, 0.14, r(), r() * TAU, r()), null, grad('#8a8088', '#d4ccc8', 0.9, 0.2)); }
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + r() * 0.4, bx = x + Math.cos(a) * 0.42, bz = z + Math.sin(a) * 0.42, d = V(x - bx, 0.62, z - bz).normalize(); B.add(SH.cyl6(), MD(bx, 0.02, bz, d, 0.055, 0.62, 0.055, r()), null, (px, py, pz, nx, ny, nz, o) => o.copy(col('#6a4630')).lerp(col('#2a1e1e'), clamp((py - 0.25) * 3))); }
    GL.add(SH.sphLo(), M(x, 0.05, z, 0.3, 0.08, 0.3), null, (px, py, pz, nx, ny, nz, o) => o.copy(col('#ff5a1a')).lerp(col('#ffc050'), clamp(ny)));
    GL.add(SH.cone(), M(x, 0.08, z, 0.16, 0.42, 0.16), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => o.copy(col('#ff8a2a')).lerp(col('#fff0a0'), clamp(ly * 1.4)));
    this.W.flames.push({ p: V(x, 0.45, z) });
    this.HA.add(x, 0.45, z, 2.0, '#ff9a40', 0.8, 1.5);
    this.W.floorGlows.add(x, 0.03, z, 2.0, '#ff9a3a', 0.28, 1);
    this.light(x, 1.0, z, '#ffb070', 7, 8, 1.3);
    this.coll(x, z, 0.72);
    // tripod + little kettle hung over the fire
    for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + 0.5, bx = x + Math.cos(a) * 0.7, bz = z + Math.sin(a) * 0.7; const d = V(x - bx, 1.25, z - bz); const L = d.length(); B.add(SH.cyl6(), MD(bx, 0, bz, d.normalize(), 0.025, L, 0.025), col('#5a3e2c')); }
    B.add(SH.cyl6(), M(x, 0.9, z, 0.008, 0.34, 0.008), col('#2a2020'));
    B.add(SH.sph(), M(x, 0.78, z, 0.17, 0.15, 0.17), null, grad('#2e2a30', '#5a5460'));
    B.add(SH.cyl6(), M(x, 0.88, z, 0.1, 0.04, 0.1), col('#3a3440'));
    // log seats round the fire, a stump stool, a bedroll and a mug
    const seats = 2 + Math.floor(r() * 2), a0 = r() * TAU;
    for (let i = 0; i < seats; i++) {
      const a = a0 + i / seats * TAU + (r() - 0.5) * 0.4, sx = x + Math.cos(a) * 1.55, sz = z + Math.sin(a) * 1.55;
      if (!this.W.walkable(sx, sz)) continue;
      if (i === 1 && r() < 0.6) { this.stump(sx, sz, 0.8); continue; }
      const t = a + Math.PI / 2, L = 1.0 + r() * 0.2;
      B.add(SH.cyl(), MD(sx - Math.cos(t) * L / 2, 0.2, sz - Math.sin(t) * L / 2, V(Math.cos(t), 0, Math.sin(t)), 0.2, L, 0.2, r()), null, this.logPaint(Math.cos(t), Math.sin(t)));
      this.coll(sx, sz, 0.32);
    }
    const ba = a0 + 0.5 * TAU / seats, bx = x + Math.cos(ba) * 1.7, bz = z + Math.sin(ba) * 1.7;
    if (this.W.walkable(bx, bz)) {
      CL.add(SH.cyl(), MD(bx - Math.cos(ba + 1.57) * 0.4, 0.13, bz - Math.sin(ba + 1.57) * 0.4, V(Math.cos(ba + 1.57), 0, Math.sin(ba + 1.57)), 0.13, 0.8, 0.13), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => o.set(Math.sin(ly * 26) > 0.3 ? '#c8504a' : '#f4e4c8'));
      CL.add(SH.cyl6(), M(bx + Math.cos(ba) * 0.35, 0, bz + Math.sin(ba) * 0.35, 0.06, 0.12, 0.06), null, (px, py, pz, nx, ny, nz, o) => o.set(ny > 0.9 ? '#6a3a24' : '#5a8ac8'));
    }
    const tn = this.put(A, 1.2, { near: [x, z] }); if (tn) this.tent(tn.x, tn.z, Math.atan2(x - tn.x, z - tn.z)); // the tent's door looks at the fire
    this.signpost(A, x, z);
    this.fern(this.CL, x + 2.1, z - 0.6, 0.9); if (r() < 0.6) this.leafPile(this.CL, x - 1.9, z + 1.2, 0.8);
  }
  burrow_garden(A) { // the critters' vegetable patch: tilled rows of carrots, turnips and cabbages, a fence, a scarecrow
    const s = this.put(A, 2.2, { collide: false, decal: true, ncRad: 2.3 }) || this.put(A, 1.7, { collide: false, decal: true });
    if (!s) return;
    const B = this.B, CL = this.CL, r = this.r, big = s.rad > 2;
    const hx = big ? 1.75 : 1.3, hz = big ? 1.05 : 0.85, ang = s.face; // local x along (cos ang, -sin ang)
    const dx = Math.cos(ang), dz = -Math.sin(ang);
    this.decal(6, s.x, s.z, hx, hz, Math.atan2(dz, dx), 0);
    const L = (lx, lz) => [s.x + dx * lx - dz * lz, s.z + dz * lx + dx * lz];
    const rows = Math.max(2, Math.floor(hz * 2 / 0.55));
    for (let ri = 0; ri < rows; ri++) {
      const lz = -hz + 0.3 + ri * ((hz * 2 - 0.6) / Math.max(1, rows - 1)), crop = this.pick(['carrot', 'turnip', 'cabbage', 'carrot']);
      for (let lx = -hx + 0.3; lx <= hx - 0.25; lx += 0.42 + r() * 0.1) {
        const [px, pz] = L(lx + (r() - 0.5) * 0.08, lz + (r() - 0.5) * 0.08);
        this.crop(CL, px, pz, crop);
      }
    }
    // fence along the back and one end, a scarecrow at the corner, a watering can and a basket of pickings
    const fence = (ax, az, bx, bz) => {
      const [x0, z0] = L(ax, az), [x1, z1] = L(bx, bz), len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.round(len / 0.7));
      for (let i = 0; i <= n; i++) { const t = i / n; B.add(SH.cyl6(), M(x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t, 0.045, 0.58 + (i % 2) * 0.05, 0.045, (r() - 0.5) * 0.08, r(), (r() - 0.5) * 0.08), null, grad('#7a5436', '#b48a5e', 0.3, 0.5)); }
      const d = V(x1 - x0, 0, z1 - z0).normalize();
      for (const y of [0.22, 0.44]) B.add(SH.box(), MD(x0, y, z0, d, 0.07, len, 0.03, Math.atan2(d.x, d.z)), null, grad('#8e6440', '#c4966a', 0.4, 0.5));
    };
    const back = r() < 0.5 ? -1 : 1;
    fence(-hx - 0.15, back * (hz + 0.2), hx + 0.15, back * (hz + 0.2));
    fence(-hx - 0.15 * 1, back * (hz + 0.2), -hx - 0.15, -back * (hz * 0.2));
    const [sx, sz] = L(hx + 0.45, back * (hz - 0.1));
    if (this.W.walkable(sx, sz)) this.scarecrow(sx, sz, s.face);
    const [wx, wz] = L(-hx - 0.1, -back * (hz + 0.45));
    if (this.W.walkable(wx, wz)) this.wateringCan(wx, wz, r() * TAU);
    const [kx, kz] = L(hx * 0.3, -back * (hz + 0.5));
    if (this.W.walkable(kx, kz)) this.basket(kx, kz, 'carrot');
  }
  burrow_grove(A) { // a glowing mushroom grove on a mossy mound
    const s = this.put(A, 1.6, A.big && this.r() < 0.5 ? { mode: 'center', spread: 2.6, core: 0.8 } : { core: 0.8 });
    if (!s) return;
    const B = this.B, GL = this.GL, r = this.r, { x, z } = s, cap = this.pick([['#8ad8ff', '#bff0ff'], ['#ff9ad0', '#ffd0ea'], ['#b89aff', '#e0d0ff']]);
    B.add(SH.hemi(), M(x, -0.05, z, 1.35, 0.4, 1.15, 0, r() * TAU, 0), null, mossTop('#6a8a4a', '#6e9a4a', '#a8c878'));
    const big = [[0, 0, 1.75], [0.62, 0.3, 1.2], [-0.5, 0.45, 0.95], [0.2, -0.65, 0.8]];
    for (const [ox, oz, h] of big) this.bigShroom(x + ox, z + oz, h, cap[0], true);
    for (let i = 0; i < 9; i++) { const a = r() * TAU, d = 1.1 + r() * 0.6; this.W.mushrooms(GL, x + Math.cos(a) * d, 0, z + Math.sin(a) * d, cap[0], 0.5 + r() * 0.35, null); }
    for (let i = 0; i < 5; i++) this.HA.add(x + (r() - 0.5) * 2.4, 0.6 + r() * 1.6, z + (r() - 0.5) * 2.4, 0.35, cap[1], 0.7, 0.5); // floating spores
    this.HA.add(x, 1.6, z, 4.2, cap[0], 0.35);
    this.W.floorGlows.add(x, 0.03, z, 2.6, cap[0], 0.3, 1);
    this.light(x, 2.0, z, cap[0], 5, 7, 0.2);
    this.coll(x, z, 0.75);
    this.fern(this.CL, x - 1.4, z + 0.9, 0.9); this.fern(this.CL, x + 1.3, z - 1.1, 0.8);
  }
  burrow_fallen(A) { // a fallen mossy tree trunk with a hollow end, a stump beside it and ferns
    let len = this.rnd(3.4, 4.4), s = this.put(A, len * 0.5 + 0.2, { core: 0.9 });
    if (!s) { len = 2.6; s = this.put(A, 1.5, { core: 0.8 }); }
    if (!s) return;
    const ang = s.face + Math.PI / 2;
    this.bigLog(s.x, s.z, ang, len, 0.44);
    const r = this.r, dx = Math.cos(ang), dz = Math.sin(ang);
    this.fern(this.CL, s.x + dx * (len / 2 + 0.35), s.z + dz * (len / 2 + 0.35), 1.0);
    this.fern(this.CL, s.x - dx * (len / 2 + 0.3) + dz * 0.5, s.z - dz * (len / 2 + 0.3) - dx * 0.5, 0.8);
    const st = this.put(A, 0.6, { near: [s.x, s.z] });
    if (st) { this.stump(st.x, st.z, 1.1, true); this.fern(this.CL, st.x + 0.55, st.z + 0.3, 0.7); }
    if (r() < 0.7) { const lp = this.put(A, 0.7, { collide: false, near: [s.x, s.z] }); if (lp) this.leafPile(this.CL, lp.x, lp.z, 1.1); }
  }
  burrow_pond(A) { // a spring pond with stepping stones, reeds, lily pads and a frog
    const s = this.put(A, 2.0, { collide: false, decal: true, ncRad: 2.1, ...(A.big && this.r() < 0.4 ? { mode: 'center', spread: 2.4 } : {}) }) || this.put(A, 1.6, { collide: false, decal: true });
    if (!s) return;
    const B = this.B, CL = this.CL, r = this.r, R = s.rad, hx = R * 0.88, hz = R * 0.62, ang = s.face;
    this.decal(4, s.x, s.z, hx, hz, ang, 0);
    const P = (lx, lz) => [s.x + Math.cos(ang) * lx - Math.sin(ang) * lz, s.z + Math.sin(ang) * lx + Math.cos(ang) * lz];
    for (let i = 0; i < 4; i++) { const [px, pz] = P(-hx * 0.75 + i * hx * 0.5, (r() - 0.5) * 0.3); CL.add(X.lump(), M(px, 0, pz, 0.26 + r() * 0.06, 0.09, 0.22 + r() * 0.05, 0, r() * TAU, 0), null, grad('#8a8286', '#dcd4d0', 0.9, 0.1)); }
    for (let i = 0; i < 5; i++) { const [px, pz] = P((r() - 0.5) * hx * 1.2, (r() < 0.5 ? -1 : 1) * hz * (0.35 + r() * 0.3)); CL.add(SH.disc(), M(px, 0.012, pz, 0.2 + r() * 0.08, 0.012, 0.2), null, (qx, qy, qz, nx, ny, nz, o, lx, ly, lz) => o.set(Math.abs(Math.atan2(lz, lx)) < 0.3 && Math.hypot(lx, lz) > 0.1 ? '#3e7a3a' : '#5eac4c')); if (r() < 0.4) this.W.flower(CL, px + 0.05, 0.0, pz, '#ffb8d0', 0.6); }
    const [fx, fz] = P(hx * 0.2, hz * 0.45); this.frog(fx, fz, r() * TAU);
    for (let k = 0; k < 2; k++) { const [px, pz] = P((k ? 1 : -1) * hx * 1.02, (r() - 0.5) * hz * 0.8); this.reeds(px, pz); }
    for (let i = 0; i < 4; i++) { const a = r() * TAU, [px, pz] = P(Math.cos(a) * hx * 1.12, Math.sin(a) * hz * 1.15); if (this.W.walkable(px, pz)) this.rockLump(B, px, pz, 0.26 + r() * 0.14, 0.2, 0.22); }
  }
  burrow_den(A) { // a critter's burrow: a grassy mound with a round door, a doormat, a mailbox and a lamp
    const s = this.put(A, 1.5, { mode: 'wall', hug: 0.45 }) || this.put(A, 1.4);
    if (!s) return;
    const B = this.B, CL = this.CL, GL = this.GL, r = this.r, fx = Math.sin(s.face), fz = Math.cos(s.face), tx = fz, tz = -fx;
    B.add(SH.hemi(), M(s.x, -0.05, s.z, 1.35, 1.3, 1.2, 0, s.face, 0), null, (px, py, pz, nx, ny, nz, o) => { o.copy(col('#a07a58')).lerp(col('#7e9e5a'), clamp(ny * 2.2 - 0.9)).lerp(col('#a8c47a'), clamp(ny * 3 - 2.4) * 0.5); });
    const d = V(fx, 0.3, fz).normalize(), dx = s.x + fx * 0.86, dz = s.z + fz * 0.86, dc = this.pick(['#5a8a6a', '#c8644a', '#4a6a9a', '#d8a040', '#8a5aa0']);
    B.add(SH.disc(), MD(dx, 0.42, dz, d, 0.38, 0.07, 0.38), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => { o.set(dc); if (Math.abs(Math.sin(lx * 9)) < 0.16) o.multiplyScalar(0.7); });
    B.add(X.ringLo(), MD(dx + fx * 0.03, 0.42, dz + fz * 0.03, d, 0.42, 0.42, 0.42), null, grad('#6a4630', '#b07a4e', 0.5, 0.5));
    B.add(SH.sphLo(), M(dx + fx * 0.09 + tx * 0.2, 0.42, dz + fz * 0.09 + tz * 0.2, 0.045), col('#f4c04a'));
    CL.add(SH.box(), M(dx + fx * 0.5, 0.005, dz + fz * 0.5, 0.7, 0.02, 0.4, 0, s.face, 0), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => o.set(Math.abs(Math.sin(lx * 20)) > 0.6 ? '#c8a060' : '#a8744a'));
    // mailbox on a post, lamp on a crooked stick, flower pots
    const [mx, mz] = [dx + fx * 0.6 + tx * 0.95, dz + fz * 0.6 + tz * 0.95];
    B.add(SH.cyl6(), M(mx, 0, mz, 0.04, 0.72, 0.04), col('#7a5436'));
    B.add(SH.box(), M(mx, 0.7, mz, 0.18, 0.2, 0.3, 0, s.face, 0), null, (px, py, pz, nx, ny, nz, o) => o.set(ny > 0.5 ? '#c8504a' : '#d8604a'));
    B.add(SH.box(), M(mx + tx * 0.1, 0.8, mz + tz * 0.1, 0.02, 0.2, 0.05, 0, s.face, 0), col('#ffd24a'));
    const [lx, lz] = [dx + fx * 0.45 - tx * 0.95, dz + fz * 0.45 - tz * 0.95];
    B.add(SH.cyl6(), M(lx, 0, lz, 0.03, 1.1, 0.03, 0.06, 0, 0.04), col('#6a4a34'));
    GL.add(SH.sph(), M(lx, 0.98, lz, 0.1, 0.13, 0.1), null, (px, py, pz, nx, ny, nz, o) => o.set(Math.abs(py - 0.98) > 0.1 ? '#8a5a3a' : '#ffd890'));
    this.HA.add(lx, 0.98, lz, 1.3, '#ffc47a', 0.6, 1);
    this.light(lx + fx * 0.4, 1.1, lz + fz * 0.4, '#ffc47a', 3.5, 5, 0.6);
    for (const e of [-1, 1]) { const px = dx + fx * 0.35 + tx * e * 0.55, pz = dz + fz * 0.35 + tz * e * 0.55; B.add(SH.taper(), M(px, 0, pz, 0.1, 0.16, 0.1, Math.PI, 0, 0), col('#c8704a')); this.W.flower(CL, px, 0.14, pz, this.pick(['#ffb8d0', '#fff0a0', '#c8b0ff']), 0.8); }
    this.coll(s.x, s.z, 1.15);
    const ac = this.put(A, 0.6, { collide: false, near: [dx, dz] }); if (ac) this.acornCache(ac.x, ac.z);
    this.signpost(A, dx, dz);
  }
  burrow_rocks(A) { // a mossy rock outcrop with ferns and flowers, and a big mushroom ring nearby
    const s = this.put(A, 1.5);
    if (!s) return;
    const B = this.B, CL = this.CL, r = this.r, { x, z } = s;
    const n = 3 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + r() * 0.6, d = i ? 0.6 + r() * 0.35 : 0, sc = i ? 0.45 + r() * 0.2 : 0.8;
      this.rockLump(B, x + Math.cos(a) * d, z + Math.sin(a) * d, sc, sc * (0.8 + r() * 0.4), sc * 0.9);
    }
    for (let i = 0; i < 6; i++) { const a = r() * TAU, d = 1.1 + r() * 0.5; this.rockLump(CL, x + Math.cos(a) * d, z + Math.sin(a) * d, 0.12 + r() * 0.1, 0.1, 0.12, '#a89c94', false); }
    this.fern(CL, x + 1.0, z + 0.7, 1.0); this.fern(CL, x - 0.9, z - 0.8, 0.8);
    for (let i = 0; i < 4; i++) { const a = r() * TAU, d = 1.0 + r() * 0.4; this.W.flower(CL, x + Math.cos(a) * d, 0, z + Math.sin(a) * d, this.pick(['#ffb8d0', '#fff0a0', '#ffffff', '#c8b0ff']), 1.0); }
    this.coll(x, z, 1.1);
    const m = this.put(A, 1.0, { collide: false });
    if (m) { const R = 0.8; for (let i = 0; i < 11; i++) { const a = i / 11 * TAU + r() * 0.3; this.W.mushrooms(this.CL, m.x + Math.cos(a) * R, 0, m.z + Math.sin(a) * R, this.pick(['#e8604a', '#f0e4d0', '#e8604a']), 0.45 + r() * 0.25, null); } }
  }
  burrow_extras(A) { // every burrow room: roots snaking in from the walls, fern clumps, a leaf drift, an acorn cache or signpost
    const r = this.r;
    const pool = ['stump', 'bush', 'woodpile', 'barrow', 'shrooms', 'boulders', 'bush', 'log', 'tent'];
    for (let i = 0, n = 2 + (A.cells.length > 70 ? 1 : 0); i < n; i++) this.burrowSecondary(A, this.pick(pool));
    this.surfaceRoots(A, 1 + Math.floor(r() * 2.5));
    for (let i = 0, n = 2 + Math.floor(r() * 3); i < n; i++) { const f = this.put(A, 0.55, { collide: false, minWd: 1 }); if (f) this.fern(this.CL, f.x, f.z, 0.8 + r() * 0.4); }
    if (r() < 0.55) { const p = this.put(A, 0.8, { mode: 'wall', collide: false }); if (p) this.leafPile(this.CL, p.x, p.z, 1.0 + r() * 0.3); }
    if (r() < 0.45) { const p = this.put(A, 0.6, { collide: false }); if (p) this.acornCache(p.x, p.z); }
    if (r() < 0.5) this.trailStones(A, (x, z, a) => this.CL.add(X.lump(), M(x, -0.035, z, 0.24 + r() * 0.05, 0.07, 0.19 + r() * 0.04, 0, a + (r() - 0.5) * 0.6, 0), null, (px, py, pz, nx, ny, nz, o) => o.copy(col('#a08870')).lerp(col('#d8c4a8'), clamp(ny * 0.9))));
    this.groundCover(A, 0.42, (x, z, lush) => this.burrowCover(x, z, lush));
  }
  // flat stones laid along the painted trails (the decor map's path channel), from each mouth in toward the room's heart
  trailStones(A, stone, step = 1.05) { // (on the two longest trails; they stop short of the room's heart, where fights happen)
    const W = this.W;
    for (const [mx, mz] of A.mouths.slice().sort((a, b) => Math.hypot(A.cx - b[0], A.cz - b[1]) - Math.hypot(A.cx - a[0], A.cz - a[1])).slice(0, 2)) {
      const L = Math.hypot(A.cx - mx, A.cz - mz); if (L < 4) continue;
      const dx = (A.cx - mx) / L, dz = (A.cz - mz) / L;
      for (let t = 1.2; t < L - 2.6; t += step) {
        let bx = 0, bz = 0, bp = 0;
        for (let o = -1.6; o <= 1.6; o += 0.2) { const x = mx + dx * t - dz * o, z = mz + dz * t + dx * o, p = W.decoAt(x, z)[1]; if (p > bp) { bp = p; bx = x; bz = z; } }
        if (bp < 0.55 || !W.walkable(bx, bz) || this.clear(bx, bz, 0, false) || this.puddle(bx, bz) || W.noClutterAt(bx, bz) || W.collision.solidAt(bx, bz, 0.2)) continue;
        stone(bx + (this.r() - 0.5) * 0.2, bz + (this.r() - 0.5) * 0.2, Math.atan2(dx, dz));
      }
    }
  }
  burrowSecondary(A, kind) {
    const r = this.r;
    if (kind === 'stump') { const p = this.put(A, 0.6); if (p) this.stump(p.x, p.z, 0.85 + r() * 0.35, r() < 0.4); }
    else if (kind === 'bush') { const p = this.put(A, 0.75, { minWd: 1 }); if (p) this.bush(p.x, p.z, 0.9 + r() * 0.3); }
    else if (kind === 'woodpile') { const p = this.put(A, 0.9, { mode: 'wall', hug: 0.6 }) || this.put(A, 0.9); if (p) this.woodpile(p.x, p.z, p.face); }
    else if (kind === 'barrow') { const p = this.put(A, 0.8); if (p) this.barrow(p.x, p.z, p.face); }
    else if (kind === 'tent') { const p = this.put(A, 1.2); if (p) this.tent(p.x, p.z, p.face); }
    else if (kind === 'shrooms') { const p = this.put(A, 0.7, { collide: false }); if (p) { const c = this.pick([['#8ad8ff', 1], ['#ff9ad0', 1], ['#e8604a', 0]]); this.W.mushrooms(c[1] ? this.GL : this.B, p.x, 0, p.z, c[0], 1.1 + r() * 0.4, c[1] ? this.HA : null); this.W.mushrooms(this.CL, p.x + 0.45, 0, p.z - 0.3, c[0], 0.6, null); } }
    else if (kind === 'boulders') { const p = this.put(A, 0.8); if (p) { this.rockLump(this.B, p.x, p.z, 0.55, 0.5, 0.5); this.rockLump(this.B, p.x + 0.5, p.z + 0.25, 0.3, 0.28, 0.3); this.fern(this.CL, p.x - 0.45, p.z + 0.35, 0.7); this.coll(p.x, p.z, 0.55); } }
    else if (kind === 'log') { const len = 1.6 + r() * 0.6, p = this.put(A, len / 2 + 0.1); if (p) this.bigLog(p.x, p.z, p.face + Math.PI / 2, len, 0.26); }
  }
  // Mid-density ground cover across the open floor of a room: off the trails and runners, off every claimed footprint,
  // mouths and keep-clear zones; item(x, z, lush, path, crack, accent) lays one little cluster (clutter batch, no shadows).
  groundCover(A, density, item) {
    const W = this.W, r = this.r;
    for (const [cx, cy] of A.cells) {
      for (let k = 0; k < 2; k++) {
        if (r() > density) continue;
        const x = (cx + 0.1 + r() * 0.8) * CELL, z = (cy + 0.1 + r() * 0.8) * CELL;
        if (!W.walkable(x, z) || this.clear(x, z, 0, false) || this.puddle(x, z) || W.noClutterAt(x, z) || W.collision.solidAt(x, z, 0.15)) continue;
        let bad = false;
        for (const ln of A.lanes) if (segDist(x, z, ln[0], ln[1], ln[2], ln[3]) < (ln[5] ? 1.15 : 0.95)) { bad = true; break; }
        if (!bad) for (const m of A.mouths) if (Math.hypot(x - m[0], z - m[1]) < 1.2) { bad = true; break; }
        if (bad) continue;
        const [lush, path, crack, acc] = W.decoAt(x, z);
        if (path > 0.45) continue;
        item(x, z, lush, path, crack, acc);
      }
    }
  }
  burrowCover(x, z, lush) {
    const r = this.r, CL = this.CL, k = r();
    const clover = (px, pz, y) => { const s = 0.1 + r() * 0.05; CL.add(X.clover(), M(px, y, pz, s, s, s, (r() - 0.5) * 0.3, r() * TAU, 0), null, grad('#4e8a3a', '#8cc060', 0.5, 0.4)); };
    if (lush > 0.3) {
      if (k < 0.45) { for (let i = 0, n = 3 + Math.floor(r() * 4); i < n; i++) { const px = x + (r() - 0.5) * 0.5, pz = z + (r() - 0.5) * 0.5; CL.add(SH.stem(), M(px, 0, pz, 0.01, 0.07, 0.01), col('#4e8a38')); clover(px, pz, 0.06); } }
      else if (k < 0.75) { const c = this.pick(['#ffb8d4', '#fff0a0', '#ffffff', '#c8b0ff', '#ff9a7a']); for (let i = 0, n = 2 + Math.floor(r() * 3); i < n; i++) this.W.ddFlower(CL, x + (r() - 0.5) * 0.5, z + (r() - 0.5) * 0.5, 0.9 + r() * 0.5, c); }
      else if (k < 0.88) { const h = 0.28 + r() * 0.1; CL.add(SH.stem(), M(x, 0, z, 0.012, h, 0.012), col('#5a9a40')); CL.add(SH.sphLo(), M(x, h, z, 0.07), null, (qx, qy, qz, nx, ny, nz, o) => o.set(ny > -0.3 ? '#fffaf4' : '#e8e0d0')); } // dandelion clock
      else this.W.ddTuft(CL, x, z, 1.0 + r() * 0.4, '#3c6a2c', '#aad076');
    } else {
      if (k < 0.3) { for (let i = 0, n = 2 + Math.floor(r() * 3); i < n; i++) this.W.ddPebble(CL, x + (r() - 0.5) * 0.5, z + (r() - 0.5) * 0.5, 0.05 + r() * 0.07, col(this.pick(['#a89888', '#b8aca0', '#948478']))); }
      else if (k < 0.55) { // twigs
        for (let i = 0, n = 1 + Math.floor(r() * 2); i < n; i++) { const a = r() * TAU, L = 0.35 + r() * 0.3; CL.add(SH.cyl6(), MD(x - Math.cos(a) * L / 2, 0.02, z - Math.sin(a) * L / 2, V(Math.cos(a), 0, Math.sin(a)), 0.018, L, 0.018), col('#7a5436')); CL.add(SH.cyl6(), MD(x + Math.cos(a) * L * 0.2, 0.02, z + Math.sin(a) * L * 0.2, V(Math.cos(a + 0.7), 0.1, Math.sin(a + 0.7)).normalize(), 0.012, 0.16, 0.012), col('#7a5436')); }
      } else if (k < 0.8) { for (let i = 0, n = 3 + Math.floor(r() * 4); i < n; i++) this.W.ddLeaf(CL, x + (r() - 0.5) * 0.7, z + (r() - 0.5) * 0.7, 0.8 + r() * 0.5, col(this.pick(['#c89a50', '#d67a48', '#9cae62', '#b8643e', '#e0b060']))); }
      else if (k < 0.92) this.W.ddMushrooms(CL, x, z, 0.6 + r() * 0.4, this.pick(['#d8563e', '#c89a64', '#e8604a']));
      else for (let i = 0, n = 2 + Math.floor(r() * 3); i < n; i++) clover(x + (r() - 0.5) * 0.4, z + (r() - 0.5) * 0.4, 0.02);
    }
  }
  tent(x, z, face) { // a little striped A-frame tent with guy ropes
    const B = this.B, c1 = this.pick(['#e8604a', '#5a8ac8', '#e8a040', '#7aa860']), ry = face + Math.PI / 2, ax = Math.cos(ry), az = -Math.sin(ry);
    B.add(X.tent(), M(x, 0, z, 1.5, 1.1, 1.4, 0, ry, 0), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => { if (Math.abs(nx * ax + nz * az) > 0.9) { o.set('#3a2a30'); return; } o.set('#fff0d8'); o.multiplyScalar(0.86 + 0.18 * clamp(ly)); });
    const al = Math.atan2(1.1, 0.7), fz0 = Math.sin(ry), fz1 = Math.cos(ry); // canvas stripes laid on both slopes
    for (const e of [-1, 1]) for (const lx of [-0.5, 0, 0.5]) B.add(SH.box(), M(x + ax * lx + fz0 * e * 0.35, 0.55, z + az * lx + fz1 * e * 0.35, 0.2, 0.02, 1.3, e * al, ry, 0), col(c1));
    for (const e of [-1, 1]) {
      const tx = x + ax * e * 0.75, tz = z + az * e * 0.75, gx = x + ax * e * 1.25, gz = z + az * e * 1.25, d = V(gx - tx, -1.1, gz - tz), L = d.length();
      B.add(SH.cyl6(), MD(tx, 1.1, tz, d.normalize(), 0.008, L, 0.008), col('#e8dcc0')); B.add(SH.cyl6(), M(gx, 0, gz, 0.025, 0.12, 0.025), col('#7a5436')); B.add(SH.cyl6(), M(tx, 0, tz, 0.03, 1.16, 0.03), col('#7a5436'));
    }
    this.coll(x + ax * 0.4, z + az * 0.4, 0.65); this.coll(x - ax * 0.4, z - az * 0.4, 0.65);
  }
  woodpile(x, z, face) { // split logs stacked 3-2-1 with an axe leaning on them
    const B = this.B, ax = Math.cos(face), az = -Math.sin(face), fx = Math.sin(face), fz = Math.cos(face), L = 0.9;
    for (const [o, y, R] of [[-0.26, 0, 0.13], [0, 0, 0.13], [0.26, 0, 0.13], [-0.13, 0.22, 0.13], [0.13, 0.22, 0.13], [0, 0.44, 0.12]]) B.add(SH.cyl(), MD(x + fx * o - ax * L / 2, y + R, z + fz * o - az * L / 2, V(ax, 0, az), R, L, R, this.r() * TAU), null, this.logPaint(ax, az));
    B.add(SH.cyl6(), MD(x + ax * 0.55 + fx * 0.3, 0, z + az * 0.55 + fz * 0.3, V(-fx * 0.25, 1, -fz * 0.25).normalize(), 0.025, 0.6, 0.025), col('#c89868'));
    B.add(SH.box(), M(x + ax * 0.55 + fx * 0.22, 0.52, z + az * 0.55 + fz * 0.22, 0.03, 0.12, 0.16, 0, face, 0), null, (px, py, pz, nx, ny, nz, o) => o.set(py > 0.6 ? '#9aa4b0' : '#e8eef4'));
    this.coll(x, z, 0.55);
  }
  bush(x, z, s = 1) { // round flowering bush, now and then with berries
    const B = this.B, r = this.r, berries = r() < 0.5, bc = this.pick(['#e8504a', '#ff8ab0', '#5a6ad8']), fl = this.pick(['#ffb8d4', '#fff0a0', '#ffffff']);
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + r(), d = i ? 0.3 * s : 0, R = (i ? 0.34 : 0.46) * s, bx = x + Math.cos(a) * d, bz = z + Math.sin(a) * d;
      B.add(SH.puff(), M(bx, R * 0.75, bz, R, R * 0.85, R, 0, r() * TAU, 0), null, grad('#3e6a2e', '#9cc46a', 0.7, 0.2));
      for (let q = 0; q < 3; q++) { const b = r() * TAU, e = 0.5 + r() * 0.5; B.add(SH.sphLo(), M(bx + Math.cos(b) * R * 0.8 * e, R * (0.75 + 0.6 * (1 - e)), bz + Math.sin(b) * R * 0.8 * e, 0.045), col(berries ? bc : fl)); }
    }
    this.coll(x, z, 0.5 * s);
  }
  barrow(x, z, face) { // wheelbarrow full of soil and carrots, handles resting on the ground
    const B = this.B, fx = Math.sin(face), fz = Math.cos(face), ax = Math.cos(face), az = -Math.sin(face);
    B.add(SH.box(), M(x, 0.3, z, 0.62, 0.3, 0.9, -0.12, face, 0), null, (px, py, pz, nx, ny, nz, o) => o.copy(col('#5a8ac8')).multiplyScalar(ny > 0.6 ? 0.5 : 0.85 + 0.15 * ny));
    B.add(SH.box(), M(x, 0.56, z, 0.54, 0.05, 0.82, -0.12, face, 0), col('#6a4a34'));
    for (let i = 0; i < 3; i++) B.add(SH.cone(), M(x + ax * (i - 1) * 0.16, 0.58, z + az * (i - 1) * 0.16, 0.05, 0.22, 0.05, 1.2, face + i, 0), col('#ff8a2a'));
    B.add(SH.cyl(), MD(x + fx * 0.56 - ax * 0.05, 0.2, z + fz * 0.56 - az * 0.05, V(ax, 0, az), 0.2, 0.1, 0.2), null, (px, py, pz, nx, ny, nz, o) => o.set(Math.abs(nx * ax + nz * az) > 0.8 ? '#c8a060' : '#3a3036'));
    for (const e of [-1, 1]) B.add(SH.cyl6(), MD(x + ax * e * 0.26 - fx * 0.3, 0.3, z + az * e * 0.26 - fz * 0.3, V(-fx, -0.45, -fz).normalize(), 0.025, 0.72, 0.025), col('#8a6440'));
    this.coll(x, z, 0.55);
  }
  // ================================================================== SHRINE (tatami halls; the moonlit sanctum reuses them)
  get SP() {
    return this.moon ? { lac: '#b8323a', blk: '#22222e', gold: '#d8d0a0', wood: '#6a4a44', woodL: '#9a7a6a', cush: ['#4a5a9a', '#6a5a9a', '#3e6a8e', '#8a8ac0'], mat: 2, fire: '#9ac4ff', flame: '#bfe0ff', paper: '#eef0ff' }
      : { lac: '#c8362c', blk: '#2a2024', gold: '#e8b848', wood: '#8a5234', woodL: '#b87a4e', cush: ['#c8505e', '#7a62b0', '#4a7ab0', '#d89a48'], mat: 0, fire: '#ffb060', flame: '#ffd890', paper: '#fff4e0' };
  }
  shrine_tea(A) { // a nodate tea ceremony: red felt mat, low round table with a tea set and dango, cushions, a parasol
    const P = this.SP, s = this.put(A, 1.9, A.big ? { mode: 'center', spread: 4.2, core: 0.7 } : { core: 0.7 }) || this.put(A, 1.9, { core: 0.7 });
    if (!s) return;
    const B = this.B, CL = this.CL, r = this.r, face = CAM + (r() - 0.5) * 0.5;
    const ang = -face; // decal local x = the table's local x axis (cos f, -sin f)
    this.decal(1, s.x, s.z, 1.4, 0.95, ang, P.mat);
    const L = (lx, lz) => this.lp({ x: s.x, z: s.z, face }, lx, lz);
    this.chabudai(s.x, s.z, 0.52);
    this.teaSet(s.x, 0.34, s.z, face);
    const cc = this.pick(P.cush);
    for (const [lx, lz, a] of [[-0.85, 0, Math.PI / 2], [0.85, 0, -Math.PI / 2], [0, 0.72, Math.PI], [0, -0.72, 0]]) { const [x, z] = L(lx, lz); this.cushion(CL, x, z, face + a + (r() - 0.5) * 0.2, cc); }
    const [px, pz] = L(-1.25, -1.0); if (this.W.walkable(px, pz)) this.wagasa(px, pz, V(s.x - px, 0, s.z - pz).normalize(), this.moon ? '#3a4a9a' : '#d8343a');
    this.coll(s.x, s.z, 0.6);
    const a2 = this.put(A, 0.5, { collide: false, near: [s.x, s.z] }); if (a2) this.W.ddAndon(a2.x, a2.z, a2.face, true);
    const ik = this.put(A, 0.5, { collide: false, near: [s.x, s.z] }); if (ik) this.ikebana(ik.x, ik.z);
    const by = this.put(A, 1.3, { mode: 'wall', hug: 0.3 }); if (by) this.byobu(by.x, by.z, by.face);
  }
  shrine_altar(A) { // a household altar against a wall: offerings, candles, a mirror, fox guardians, incense and cushions
    const P = this.SP, s = this.put(A, 1.5, { mode: 'wall', hug: 0.5, ncRad: 1.6 }) || this.put(A, 1.4);
    if (!s) return;
    const B = this.B, CL = this.CL, GL = this.GL, r = this.r, f = s.face, L = (lx, lz) => this.lp(s, lx, lz);
    const at = (lx, lz) => { const [x, z] = L(lx, lz); return [x, z]; };
    let [x, z] = at(0, 0);
    B.add(SH.box(), M(x, 0, z, 1.7, 0.62, 0.62, 0, f, 0), null, (px, py, pz, nx, ny, nz, o) => o.copy(col(P.lac)).multiplyScalar(0.8 + 0.2 * clamp(py / 0.6)));
    B.add(SH.box(), M(x, 0.62, z, 1.86, 0.07, 0.74, 0, f, 0), col(P.blk));
    [x, z] = at(0, 0.36); B.add(SH.box(), M(x, 0.18, z, 1.2, 0.46, 0.02, 0, f, 0), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => o.set(Math.abs(ly - 0.55) < 0.12 ? P.lac : '#fffaf2')); // cloth drape
    [x, z] = at(0, -0.12); B.add(SH.box(), M(x, 0.69, z, 0.42, 0.08, 0.42, 0, f, 0), col(P.woodL)); // sanbo tray
    B.add(SH.sph(), M(x, 0.84, z, 0.19, 0.1, 0.19), col('#fffaf4')); B.add(SH.sph(), M(x, 0.95, z, 0.14, 0.08, 0.14), col('#fffaf4')); B.add(SH.sphLo(), M(x, 1.05, z, 0.075), col('#ff9a2a')); B.add(SH.leaf(), M(x, 1.1, z, 0.08, 0.04, 0.08), col('#5aa040'));
    [x, z] = at(0, -0.3); B.add(SH.cyl6(), M(x, 0.69, z, 0.05, 0.28, 0.05), col(P.blk)); // mirror on its stand
    B.add(SH.disc(), MD(x, 1.1, z, V(Math.sin(f), 0, Math.cos(f)), 0.24, 0.04, 0.24), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => o.copy(col(P.gold)).lerp(col('#fffae0'), ly > 0.9 ? clamp(1 - Math.hypot(lx, lz)) : 0));
    for (const e of [-1, 1]) {
      [x, z] = at(e * 0.68, 0.05); B.add(SH.cyl(), M(x, 0.69, z, 0.045, 0.3, 0.045), col('#fff4e4')); GL.add(SH.sphLo(), M(x, 1.03, z, 0.03, 0.07, 0.03), col(P.flame)); this.HA.add(x, 1.04, z, 0.8, P.fire, 0.6, 1);
      [x, z] = at(e * 0.38, 0.1); B.add(SH.barrel(), M(x, 0.69, z, 0.07, 0.2, 0.07), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => o.set(Math.abs(ly - 0.5) < 0.12 ? '#3a5aa8' : '#fffaf4')); B.add(SH.cyl6(), M(x, 0.88, z, 0.03, 0.08, 0.03), col('#fffaf4'));
      [x, z] = at(e * 0.7, -0.25); this.vaseSprig(B, x, 0.69, z);
      [x, z] = at(e * 1.2, 0.2); this.W.foxStatue(B, x, z, f); this.coll(x, z, 0.25);
    }
    [x, z] = at(0, 0.75); B.add(SH.box(), M(x, 0, z, 0.55, 0.32, 0.36, 0, f, 0), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => { o.set(P.woodL); if (ny > 0.9 && Math.abs(Math.sin(lx * 30)) < 0.4) o.set('#3a2a24'); }); // offering box
    [x, z] = at(0, 1.3); this.incense(x, z); // incense burner
    this.light(...(() => { const [lx, lz] = at(0, 0.6); return [lx, 1.2, lz]; })(), P.fire, 4, 5, 0.6);
    for (const [ox, oz] of this.moon ? [[-0.55, 2.0], [0.55, 2.0]] : [[-0.75, 2.0], [0, 2.1], [0.75, 2.0], [-0.4, 2.8], [0.4, 2.8]]) { [x, z] = at(ox, oz); if (this.ok(x, z)) this.cushion(CL, x, z, f + Math.PI + (r() - 0.5) * 0.2, P.cush[0]); }
    [x, z] = at(0, 0); this.coll(...at(-0.45, 0), 0.45); this.coll(...at(0.45, 0), 0.45);
    this.claim(...at(0, 2.3), 1.1, false);
    const tk = this.put(A, 0.8, { near: [s.x, s.z] }); if (tk) this.taiko(tk.x, tk.z, tk.face);
  }
  shrine_garden(A) { // a raked-gravel inset garden with rocks and moss, a stone lantern, a water basin and a bonsai
    const s = this.put(A, 2.1, { collide: false, decal: true, ncRad: 2.2 }) || this.put(A, 1.6, { collide: false, decal: true, ncRad: 1.7 });
    if (!s) return;
    const B = this.B, CL = this.CL, r = this.r, hx = s.rad * 0.83, hz = s.rad * 0.55, ang = -s.face, ax = Math.cos(ang), az = Math.sin(ang), L = (lx, lz) => [s.x + ax * lx - az * lz, s.z + az * lx + ax * lz];
    const rk = [[-hx * 0.37 + (r() - 0.5) * 0.3, -0.2 + (r() - 0.5) * 0.3], [hx * 0.43 + (r() - 0.5) * 0.3, 0.25 + (r() - 0.5) * 0.3]];
    this.decal(3, s.x, s.z, hx, hz, ang, 0, [rk[0][0], rk[0][1], rk[1][0], rk[1][1]]);
    for (const [lx, lz, sc] of [[rk[0][0], rk[0][1], 0.42], [rk[1][0], rk[1][1], 0.32]]) { const [x, z] = L(lx, lz); this.rockLump(B, x, z, sc, sc * 1.1, sc * 0.85, this.moon ? '#8a8aa0' : '#9a948c'); this.rockLump(B, x + 0.3 * sc, z + 0.25 * sc, sc * 0.45, sc * 0.4, sc * 0.4, '#8a847c'); this.coll(x, z, sc + 0.05); }
    const fr = this.moon ? '#4a4050' : '#7a5236'; // wooden frame
    for (const [lx, lz, len, rot] of [[0, -hz, hx * 2 + 0.16, 0], [0, hz, hx * 2 + 0.16, 0], [-hx, 0, hz * 2, 1], [hx, 0, hz * 2, 1]]) { const [x, z] = L(lx, lz); B.add(SH.box(), M(x, 0, z, rot ? 0.1 : len, 0.08, rot ? len : 0.1, 0, s.face, 0), null, grad(fr, '#b88a5e', 0.4, 0.4)); }
    const [tx, tz] = L(hx + 0.35, -hz - 0.1); if (this.W.walkable(tx, tz)) { this.W.toro(B, this.GL, tx, tz, s.face, 0.9, this.SP.fire, this.SP.flame); this.coll(tx, tz, 0.25); }
    const [bx, bz] = L(-hx - 0.45, hz * 0.4); if (this.W.walkable(bx, bz)) this.tsukubai(bx, bz, s.face);
    const bn = this.put(A, 0.5, { near: [s.x, s.z] }); if (bn) this.bonsaiStand(bn.x, bn.z, bn.face);
  }
  shrine_koi(A) { // a koi pond with a vermilion arched bridge, iris clumps and a stone lantern
    const s = this.put(A, 2.2, { collide: false, decal: true, ncRad: 2.3 }) || this.put(A, 1.8, { collide: false, decal: true });
    if (!s) return;
    const B = this.B, CL = this.CL, r = this.r, hx = s.rad * 0.9, hz = s.rad * 0.62, ang = -s.face, ax = Math.cos(ang), az = Math.sin(ang), L = (lx, lz) => [s.x + ax * lx - az * lz, s.z + az * lx + ax * lz];
    this.decal(4, s.x, s.z, hx, hz, ang, this.moon ? 2 : 1);
    this.bridge(...L(r() * 0.4 - 0.2, 0), s.face, hz * 2 + 0.7);
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + r() * 0.3, [x, z] = L(Math.cos(a) * (hx + 0.12), Math.sin(a) * (hz + 0.12)); if (Math.abs(Math.sin(a)) > 0.8 && Math.abs(Math.cos(a) * hx) < 0.7) continue; if (this.W.walkable(x, z)) CL.add(X.lump(), M(x, 0, z, 0.2 + r() * 0.1, 0.09, 0.17, 0, r() * TAU, 0), null, grad('#8a8490', '#d4ccc8', 0.8, 0.2)); }
    for (const e of [-1, 1]) { const [x, z] = L(e * (hx + 0.1), (r() - 0.5) * hz); if (this.W.walkable(x, z)) this.iris(x, z); }
    const [tx, tz] = L(hx * 0.7, -hz - 0.45); if (this.W.walkable(tx, tz)) { this.W.toro(B, this.GL, tx, tz, s.face, 0.85, this.SP.fire, this.SP.flame); this.coll(tx, tz, 0.25); }
  }
  shrine_study(A) { // a scholar's corner: low writing desks with cushions, a tansu chest, book stacks and lamps
    const B = this.B, CL = this.CL, r = this.r;
    const d1 = this.put(A, 1.0, A.big ? { mode: 'center', spread: 2.6, core: 0.55 } : { core: 0.55 }) || this.put(A, 1.0, { core: 0.55 });
    if (!d1) return;
    this.desk(d1.x, d1.z, CAM + (r() - 0.5) * 0.3);
    const d2 = this.put(A, 1.0, { near: [d1.x, d1.z], core: 0.55 }); if (d2) this.desk(d2.x, d2.z, CAM + (r() - 0.5) * 0.3);
    const t = this.put(A, 0.9, { mode: 'wall', hug: 0.4 }); if (t) this.tansu(t.x, t.z, t.face);
    for (let i = 0; i < 2; i++) { const b = this.put(A, 0.45, { collide: false, near: [d1.x, d1.z] }); if (b) this.bookStack(b.x, b.z); }
    const an = this.put(A, 0.45, { collide: false, near: [d1.x, d1.z] }); if (an) this.W.ddAndon(an.x, an.z, an.face, true);
  }
  shrine_dojo(A) { // a training hall: straw goza mats, makiwara posts, a wooden-sword rack and a taiko drum
    const s = this.put(A, 2.0, { collide: false, decal: true, ncRad: 1.4, ...(A.big ? { mode: 'center', spread: 2.2 } : {}) }) || this.put(A, 1.6, { collide: false, decal: true, ncRad: 1.2 });
    if (!s) return;
    const r = this.r, ang = -s.face, k = s.rad / 2;
    this.decal(1, s.x, s.z, 1.7 * k, 1.1 * k, ang, 3);
    for (const e of [-1, 0, 1]) { if (!e && r() < 0.5) continue; const [x, z] = this.lp(s, e * 1.05 * k, -0.35); this.makiwara(x, z); }
    const rk = this.put(A, 0.8, { mode: 'wall', hug: 0.5 }); if (rk) this.bokkenRack(rk.x, rk.z, rk.face);
    const tk = this.put(A, 0.8); if (tk) this.taiko(tk.x, tk.z, tk.face);
    for (let i = 0; i < 3; i++) { const [x, z] = this.lp(s, (i - 1) * 0.75, 1.45); if (this.ok(x, z)) this.cushion(this.CL, x, z, s.face + Math.PI, this.SP.cush[2]); }
  }
  shrineAisle(A) { // paper lanterns on stands lining both sides of the runner, like a procession way
    const W = this.W, ln = A.lanes.find(l => l[5]); if (!ln) return;
    const L = Math.hypot(ln[2] - ln[0], ln[3] - ln[1]); if (L < 7) return;
    const dx = (ln[2] - ln[0]) / L, dz = (ln[3] - ln[1]) / L, n = Math.floor((L - 2.4) / 3.6), off = (L - n * 3.6) / 2;
    for (let i = 0; i <= n; i++) for (const e of [-1, 1]) {
      const t = off + i * 3.6, x = ln[0] + dx * t - dz * e * 1.75, z = ln[1] + dz * t + dx * e * 1.75;
      if (!W.walkable(x, z) || this.clear(x, z, 0.3, true) || W.noClutterAt(x, z) || W.collision.solidAt(x, z, 0.45) || this.roomAt(x, z) !== A.rm.id) continue;
      if (A.mouths.some(m => Math.hypot(x - m[0], z - m[1]) < 1.8) || A.spawns.some(s => Math.hypot(x - s[0], z - s[1]) < 1.2) || this.taken.some(tk => Math.hypot(x - tk[0], z - tk[1]) < tk[2] + 0.4)) continue;
      W.lanternStand(this.B, this.GL, x, z); this.coll(x, z, 0.16); this.claim(x, z, 0.35, true, 0.35, 0.16);
    }
  }
  shrine_extras(A) {
    const r = this.r, pool = ['ikebana', 'andon', 'incense', 'bonsai', 'cushions', 'byobu', 'taiko', 'candles', 'lantern'];
    if (r() < 0.7) this.shrineAisle(A);
    for (let i = 0, n = 2 + (A.cells.length > 70 ? 1 : 0); i < n; i++) {
      const k = this.pick(pool);
      if (k === 'ikebana') { const p = this.put(A, 0.45, { collide: false, minWd: 1 }); if (p) this.ikebana(p.x, p.z); }
      else if (k === 'andon') { const p = this.put(A, 0.45, { collide: false }); if (p) { this.W.ddAndon(p.x, p.z, p.face, r() < 0.4); this.coll(p.x, p.z, 0.22); } }
      else if (k === 'incense') { const p = this.put(A, 0.45); if (p) this.incense(p.x, p.z); }
      else if (k === 'bonsai') { const p = this.put(A, 0.5); if (p) this.bonsaiStand(p.x, p.z, p.face); }
      else if (k === 'cushions') { const p = this.put(A, 0.8, { collide: false }); if (p) { const c = this.pick(this.SP.cush); for (let q = 0; q < 3; q++) { const cx = p.x + Math.cos(q * 2.1 + r()) * 0.5, cz = p.z + Math.sin(q * 2.1 + r()) * 0.5; if (this.ok(cx, cz, 0.1)) this.cushion(this.CL, cx, cz, r() * TAU, c); } } }
      else if (k === 'byobu') { const p = this.put(A, 1.3, { mode: 'wall', hug: 0.3 }); if (p) this.byobu(p.x, p.z, p.face); }
      else if (k === 'taiko') { const p = this.put(A, 0.8); if (p) this.taiko(p.x, p.z, p.face); }
      else if (k === 'candles') { const p = this.put(A, 0.4, { collide: false }); if (p) this.W.ddCandles(p.x, p.z); }
      else { const p = this.put(A, 0.5); if (p) { this.W.toro(this.B, this.GL, p.x, p.z, p.face, 1.0, this.SP.fire, this.SP.flame); this.coll(p.x, p.z, 0.28); } }
    }
    this.groundCover(A, 0.1, (x, z) => this.shrineCover(x, z));
  }
  shrineCover(x, z) { // the odd thing left lying on the mats: a tea cup, a fan, a scroll, a spinning top, a paper crane
    const r = this.r, CL = this.CL, k = r(), P = this.SP;
    if (k < 0.2) { CL.add(SH.cyl6(), M(x, 0, z, 0.05, 0.07, 0.05), null, (px, py, pz, nx, ny, nz, o) => o.set(ny > 0.9 ? '#8ab860' : '#6a9a7a')); }
    else if (k < 0.4) { const a = r() * TAU; for (let i = 0; i < 7; i++) { const b = a + (i - 3) * 0.2; CL.add(SH.box(), M(x + Math.sin(b) * 0.13, 0.005 + i * 0.001, z + Math.cos(b) * 0.13, 0.055, 0.006, 0.26, 0, b, 0), null, (px, py, pz, nx, ny, nz, o) => o.set(i % 2 ? P.paper : P.lac)); } } // folding fan
    else if (k < 0.6) this.W.scrolls(CL, x, z, r() * TAU);
    else if (k < 0.8) { const a = r() * TAU; CL.add(SH.cone4(), M(x, 0.0, z, 0.08, 0.1, 0.12, 0, a, 0), col(this.pick(['#ff9ab0', '#8fd0ff', '#fff0a0']))); CL.add(SH.box(), M(x, 0.06, z, 0.22, 0.01, 0.05, 0, a, 0.3), col('#ffffff')); } // paper crane
    else { CL.add(SH.cone(), M(x, 0.0, z, 0.07, 0.1, 0.07, Math.PI, 0, 0), null, (px, py, pz, nx, ny, nz, o) => o.set(Math.sin(py * 60) > 0 ? '#e8503a' : '#f4c04a')); } // spinning top
  }
  // ---- shrine pieces
  chabudai(x, z, R) {
    const B = this.B, P = this.SP;
    B.add(SH.disc(), M(x, 0.28, z, R, 0.05, R), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => o.copy(col(P.wood)).lerp(col(P.woodL), ny > 0.5 ? 0.6 - 0.3 * Math.hypot(lx, lz) : 0));
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.6; B.add(SH.cyl6(), M(x + Math.cos(a) * R * 0.65, 0, z + Math.sin(a) * R * 0.65, 0.035, 0.29, 0.035), col('#4a2c20')); }
  }
  teaSet(x, y, z, face) { // teapot, cups on saucers and a plate of dango skewers
    const B = this.B, r = this.r, fx = Math.sin(face), fz = Math.cos(face), ax = Math.cos(face), az = -Math.sin(face), gl = this.moon ? '#6a7ab8' : '#5a8a74';
    const tx = x - ax * 0.15 - fx * 0.1, tz = z - az * 0.15 - fz * 0.1;
    B.add(SH.sph(), M(tx, y + 0.1, tz, 0.12, 0.1, 0.12), null, grad(gl, '#a8d0b8', 0.5, 0.4));
    B.add(SH.cyl6(), M(tx, y + 0.19, tz, 0.05, 0.03, 0.05), col(gl)); B.add(SH.sphLo(), M(tx, y + 0.23, tz, 0.025), col('#e8d4a0'));
    B.add(SH.cyl6(), MD(tx + ax * 0.08, y + 0.1, tz + az * 0.08, V(ax, 0.8, az).normalize(), 0.02, 0.13, 0.02), col(gl));
    B.add(X.ringLo(), MD(tx - ax * 0.12, y + 0.11, tz - az * 0.12, V(fx, 0, fz), 0.06, 0.06, 0.06), col(gl));
    for (let i = 0; i < 3; i++) { const a = face + 0.5 + i * 1.4, cx = x + Math.cos(a) * 0.3, cz = z + Math.sin(a) * 0.3; B.add(SH.cyl6(), M(cx, y, cz, 0.06, 0.012, 0.06), col('#e8e0d4')); B.add(SH.cyl6(), M(cx, y + 0.012, cz, 0.042, 0.06, 0.042), null, (px, py, pz, nx, ny, nz, o) => o.set(ny > 0.9 ? '#9ac860' : '#f4f0e8')); }
    const px = x + ax * 0.2 + fx * 0.12, pz = z + az * 0.2 + fz * 0.12;
    B.add(SH.cyl6(), M(px, y, pz, 0.14, 0.015, 0.14), col('#fffaf4'));
    for (let k = 0; k < 2; k++) { const a = face + 0.3 + k * 0.5, dx = Math.cos(a), dz = -Math.sin(a), ox = (k - 0.5) * 0.06;
      B.add(SH.cyl6(), MD(px - dx * 0.12 + fx * ox, y + 0.045, pz - dz * 0.12 + fz * ox, V(dx, 0, dz), 0.006, 0.26, 0.006), col('#d8b884'));
      ['#ffb8d0', '#fff8f0', '#9ac870'].forEach((c, i) => B.add(SH.sphLo(), M(px + dx * (i - 1) * 0.055 + fx * ox, y + 0.045, pz + dz * (i - 1) * 0.055 + fz * ox, 0.03), col(c))); }
  }
  wagasa(x, z, dir, c) { // an open paper parasol planted in the floor, leaning over the mat
    const B = this.B, H = 1.9, tilt = 0.26, d = V(dir.x * Math.sin(tilt), Math.cos(tilt), dir.z * Math.sin(tilt)).normalize();
    B.add(SH.cyl6(), MD(x, 0, z, d, 0.025, H, 0.025), col('#6a4a34'));
    const t = V(x, 0, z).addScaledVector(d, H);
    B.add(X.canopy(), MD(t.x - d.x * 0.36, t.y - d.y * 0.36, t.z - d.z * 0.36, d, 1.0, 0.42, 1.0), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => { o.set(c); o.multiplyScalar(Math.round((Math.atan2(lx, lz) + Math.PI) / (TAU / 16)) % 2 ? 0.86 : 1); if (ly < 0.1 || ly > 0.8) o.set('#fff0e0'); });
    B.add(SH.sphLo(), M(t.x + d.x * 0.08, t.y + d.y * 0.08, t.z + d.z * 0.08, 0.05), col('#e8b848'));
    this.coll(x, z, 0.12);
  }
  byobu(x, z, face) { // a four-panel folding screen painted with gold clouds, hills and a sakura bough
    const B = this.B, P = this.SP, n = 4, pw = 0.56, H = 1.35, ax = Math.cos(face), az = -Math.sin(face), fx = Math.sin(face), fz = Math.cos(face);
    const gold = this.moon ? '#c8c0e0' : '#e8c460', hill = this.moon ? '#4a5a8a' : '#6a9a5a', hill2 = this.moon ? '#6a7ab0' : '#9ac070';
    for (let i = 0; i < n; i++) {
      const o = (i - (n - 1) / 2) * pw * 0.94, zig = (i % 2 ? 0.1 : -0.1), cx = x + ax * o + fx * zig, cz = z + az * o + fz * zig, rot = face + (i % 2 ? 0.32 : -0.32);
      B.add(SH.box(), M(cx, 0.04, cz, pw, H, 0.05, 0, rot, 0), col(P.blk));
      const u0 = i / n;
      B.add(X.panel(), M(cx + Math.sin(rot) * 0.028, 0.12, cz + Math.cos(rot) * 0.028, pw * 0.88, H - 0.16, 1, 0, rot, 0), null, (px, py, pz, nx, ny, nz, oc, lx, ly, lz) => {
        const u = u0 + (lx + 0.5) / n, v = ly;
        oc.set(gold); oc.multiplyScalar(0.92 + 0.1 * Math.sin(u * 30 + v * 8));
        if (v < 0.3 + 0.14 * Math.sin(u * 7 + 1) + 0.06 * Math.sin(u * 19)) oc.set(v < 0.18 + 0.1 * Math.sin(u * 11 + 2) ? hill : hill2);
        if (Math.abs(v - 0.72 - 0.05 * Math.sin(u * 9)) < 0.05) oc.set('#fff4d0'); // a band of cloud
        if (v > 0.55 && u < 0.45 && Math.abs(v - (0.95 - u * 0.6)) < 0.03) oc.set('#5a3a2a'); // bough
        if (v > 0.55 && u < 0.5 && Math.abs(v - (0.95 - u * 0.6)) < 0.09 && Math.sin(u * 60) * Math.sin(v * 50) > 0.4) oc.set(this.moon ? '#e0e8ff' : '#ffb0cc');
      });
    }
    this.coll(x - ax * 0.55, z - az * 0.55, 0.35); this.coll(x + ax * 0.55, z + az * 0.55, 0.35);
  }
  ikebana(x, z) { // flowers arranged in a shallow bowl on a low black stand
    const B = this.B, P = this.SP, r = this.r;
    B.add(SH.box(), M(x, 0, z, 0.46, 0.14, 0.32, 0, r() * TAU, 0), col(P.blk));
    B.add(X.bowl(), M(x, 0.14, z, 0.18, 0.12, 0.18), col(this.moon ? '#8a9ac8' : '#3a6a8a'));
    const fl = this.moon ? '#dfe8ff' : this.pick(['#ffb8d0', '#fff0f4', '#ffd24a']);
    for (let i = 0; i < 3; i++) { const a = i * 2.2 + r(), h = 0.35 + i * 0.18, d = V(Math.cos(a) * 0.35, 1, Math.sin(a) * 0.35).normalize(); B.add(SH.cyl6(), MD(x, 0.2, z, d, 0.012, h, 0.012), col('#5a3a2a')); const t = V(x, 0.2, z).addScaledVector(d, h); for (let q = 0; q < 3; q++) B.add(SH.sphLo(), M(t.x + (r() - 0.5) * 0.12, t.y - q * 0.07, t.z + (r() - 0.5) * 0.12, 0.045), col(fl)); }
    B.add(X.frond(), M(x, 0.2, z, 0.2, 0.9, 0.3, 0, r() * TAU, 0), col('#4e8a38'));
  }
  vaseSprig(b, x, y, z) { b.add(SH.barrel(), M(x, y, z, 0.06, 0.16, 0.06), col('#fffaf4')); for (let i = 0; i < 3; i++) b.add(SH.leaf(), M(x + (i - 1) * 0.04, y + 0.2 + i * 0.05, z, 0.07, 0.04, 0.07, 0.8, i * 2, 0), col('#3e7a3a')); }
  incense(x, z) { // bronze burner on three feet with smouldering sticks and a curl of smoke
    const B = this.B, GL = this.GL;
    for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; B.add(SH.cyl6(), M(x + Math.cos(a) * 0.14, 0, z + Math.sin(a) * 0.14, 0.03, 0.14, 0.03), col('#6a5a3a')); }
    B.add(X.bowl(), M(x, 0.1, z, 0.24, 0.3, 0.24), null, grad('#7a6a40', '#c8a860', 0.5, 0.4));
    B.add(SH.cyl6(), M(x, 0.26, z, 0.2, 0.02, 0.2), col('#d8d0c0'));
    for (let i = 0; i < 3; i++) { const sx = x + (i - 1) * 0.05, sz = z + (i % 2) * 0.03; B.add(SH.cyl6(), M(sx, 0.27, sz, 0.008, 0.26, 0.008, (i - 1) * 0.1, 0, 0), col('#8a4a3a')); GL.add(SH.sphLo(), M(sx + (i - 1) * 0.026, 0.53, sz, 0.013), col('#ff7a3a')); }
    (this.W.wisps ||= []).push({ x, y: 0.56, z });
    this.coll(x, z, 0.26);
  }
  bonsaiStand(x, z, face) {
    const B = this.B, P = this.SP, r = this.r;
    B.add(SH.box(), M(x, 0.3, z, 0.55, 0.05, 0.4, 0, face, 0), col(P.wood));
    for (const [ex, ez] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const [lx, lz] = this.lp({ x, z, face }, ex * 0.22, ez * 0.14); B.add(SH.box(), M(lx, 0, lz, 0.05, 0.3, 0.05, 0, face, 0), col(P.blk)); }
    B.add(SH.box(), M(x, 0.35, z, 0.42, 0.1, 0.28, 0, face, 0), col(this.moon ? '#5a6a9a' : '#3a5a7a'));
    B.addGeo(tube([{ p: V(x, 0.44, z), r: 0.05 }, { p: V(x + 0.08, 0.6, z + 0.02), r: 0.04 }, { p: V(x - 0.06, 0.74, z - 0.03), r: 0.028 }, { p: V(x + 0.12, 0.8, z), r: 0.015 }], 5, false), x, z, col('#6a4a34'));
    for (const [ox, oy, oz, s] of [[-0.1, 0.76, 0, 0.17], [0.14, 0.66, 0.05, 0.14], [0.08, 0.86, -0.04, 0.13], [-0.16, 0.62, -0.06, 0.1]]) B.add(SH.puff(), M(x + ox, oy, z + oz, s * 1.2, s * 0.55, s, 0, r() * TAU, 0), null, grad(this.moon ? '#2e5058' : '#3e6a30', this.moon ? '#7aa8b2' : '#8ab85a', 0.8, 0.1));
    this.coll(x, z, 0.32);
  }
  tsukubai(x, z, face) { // stone water basin with a bamboo spout and a ladle
    const B = this.B, GL = this.GL, fx = Math.sin(face), fz = Math.cos(face);
    B.add(SH.cyl(), M(x, 0, z, 0.3, 0.32, 0.3), null, grad('#8a8490', '#c8c0bc', 0.8, 0.1));
    GL.add(SH.cyl(), M(x, 0.3, z, 0.22, 0.025, 0.22), col(this.moon ? '#3a6ab8' : '#3a8ab0'));
    B.add(SH.cyl6(), MD(x - fx * 0.55, 0, z - fz * 0.55, V(0, 1, 0), 0.04, 0.55, 0.04), col('#7a9a4a'));
    B.add(SH.cyl6(), MD(x - fx * 0.55, 0.52, z - fz * 0.55, V(fx, -0.25, fz).normalize(), 0.03, 0.4, 0.03), col('#8aaa58'));
    B.add(SH.cyl6(), MD(x + 0.05, 0.33, z, V(1, 0.1, 0.4).normalize(), 0.01, 0.35, 0.01), col('#c8a878'));
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4; this.rockLump(this.CL, x + Math.cos(a) * 0.45, z + Math.sin(a) * 0.45, 0.14, 0.09, 0.12, '#9a948c', false); }
    this.coll(x, z, 0.32);
  }
  bridge(x, z, face, S) { // vermilion arched bridge, spanning local z (length S) over the pond
    const B = this.B, P = this.SP, n = 9, H = 0.42, ax = Math.cos(face), az = -Math.sin(face), fx = Math.sin(face), fz = Math.cos(face);
    const at = t => { const lz = (t - 0.5) * S, y = H * Math.sin(Math.PI * t); return [x + fx * lz, y, z + fz * lz]; };
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, a = at(t0), b = at(t1), d = V(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const Ld = d.length(), th = Math.atan2(d.y, Math.hypot(d.x, d.z));
      B.add(SH.box(), M((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.04, (a[2] + b[2]) / 2, 0.84, 0.08, Ld * 1.04, -th, face, 0), col(i % 2 ? '#8a5a36' : '#9a6a40'));
    }
    for (const e of [-1, 1]) {
      const pts = []; for (let i = 0; i <= 8; i++) { const p = at(i / 8); pts.push({ p: V(p[0] + ax * e * 0.46, p[1] + 0.52, p[2] + az * e * 0.46), r: 0.035 }); }
      B.addGeo(tube(pts, 5, false), x, z, col(P.lac));
      for (const t of [0, 0.5, 1]) { const p = at(t); B.add(SH.cyl6(), M(p[0] + ax * e * 0.46, p[1] - (t === 0.5 ? 0 : 0.05), p[2] + az * e * 0.46, 0.05, 0.6, 0.05), col(P.lac)); B.add(SH.sphLo(), M(p[0] + ax * e * 0.46, p[1] + 0.6, p[2] + az * e * 0.46, 0.06), col(P.gold)); }
    }
  }
  iris(x, z) { const B = this.CL, r = this.r; for (let i = 0; i < 5; i++) { const a = r() * TAU, h = 0.5 + r() * 0.3; B.add(X.frond(), M(x, 0, z, 0.18, h, 0.3, 0, a, 0), col('#4e8a3a')); if (i < 3) { const px = x + Math.sin(a) * 0.15, pz = z + Math.cos(a) * 0.15; B.add(SH.cyl6(), M(px, 0, pz, 0.01, h * 0.9, 0.01), col('#5a9a40')); B.add(SH.star(), M(px, h * 0.9, pz, 0.08, 0.1, 0.08, 0.3, r() * TAU, 0), col(this.moon ? '#c8d8ff' : '#7a5ad8')); } } }
  desk(x, z, face) { // low writing desk: paper, ink stone, brush, a candle, and a cushion behind
    const B = this.B, P = this.SP, r = this.r, L = (lx, lz) => this.lp({ x, z, face }, lx, lz);
    B.add(SH.box(), M(x, 0.3, z, 1.0, 0.05, 0.5, 0, face, 0), col(P.wood));
    for (const [ex, ez] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const [lx, lz] = L(ex * 0.44, ez * 0.19); B.add(SH.box(), M(lx, 0, lz, 0.05, 0.3, 0.05, 0, face, 0), col(P.blk)); }
    let [px, pz] = L(-0.1, 0.02); B.add(SH.box(), M(px, 0.35, pz, 0.34, 0.006, 0.26, 0, face + 0.1, 0), col(P.paper));
    for (let i = 0; i < 3; i++) { const [qx, qz] = L(-0.2 + i * 0.09, 0.02); B.add(SH.box(), M(qx, 0.356, qz, 0.018, 0.004, 0.16 - i * 0.03, 0, face + 0.1, 0), col('#2a2024')); }
    [px, pz] = L(0.3, -0.05); B.add(SH.box(), M(px, 0.35, pz, 0.12, 0.03, 0.18, 0, face, 0), col('#2a2a30'));
    [px, pz] = L(0.3, 0.12); B.add(SH.cyl6(), MD(px - 0.08, 0.37, pz, V(1, 0.05, 0.3).normalize(), 0.008, 0.2, 0.008), col('#c8a878'));
    [px, pz] = L(-0.4, -0.12); B.add(SH.cyl(), M(px, 0.35, pz, 0.03, 0.12, 0.03), col('#fff4e4')); this.GL.add(SH.sphLo(), M(px, 0.5, pz, 0.02, 0.045, 0.02), col(P.flame)); this.HA.add(px, 0.5, pz, 0.6, P.fire, 0.5, 1);
    [px, pz] = L(0, 0.6); this.cushion(this.CL, px, pz, face, this.pick(P.cush));
    this.coll(x, z, 0.5);
  }
  tansu(x, z, face) { // stepped wooden chest of drawers with iron pulls, a vase on the step
    const B = this.B, P = this.SP, L = (lx, lz) => this.lp({ x, z, face }, lx, lz);
    let [px, pz] = L(0, 0); B.add(SH.box(), M(px, 0, pz, 1.1, 0.75, 0.45, 0, face, 0), col(P.woodL));
    [px, pz] = L(-0.27, 0); B.add(SH.box(), M(px, 0.75, pz, 0.56, 0.45, 0.45, 0, face, 0), col(P.woodL));
    for (const [lx, y, w] of [[0, 0.2, 1.0], [0, 0.48, 1.0], [-0.27, 0.95, 0.46]]) { [px, pz] = L(lx, 0.226); B.add(SH.box(), M(px, y, pz, w, 0.02, 0.01, 0, face, 0), col('#4a2c20')); for (const e of [-0.25, 0.25]) { [px, pz] = L(lx + e * w, 0.235); B.add(SH.box(), M(px, y + 0.06, pz, 0.08, 0.04, 0.02, 0, face, 0), col('#2a2024')); } }
    [px, pz] = L(0.3, 0); this.vaseSprig(B, px, 0.75, pz);
    this.coll(x, z, 0.55);
  }
  bookStack(x, z) { const r = this.r, a = r() * TAU; for (let i = 0; i < 3 + Math.floor(r() * 3); i++) this.CL.add(SH.box(), M(x + (r() - 0.5) * 0.04, i * 0.05, z + (r() - 0.5) * 0.04, 0.3, 0.05, 0.22, 0, a + (r() - 0.5) * 0.5, 0), null, (px, py, pz, nx, ny, nz, o) => o.set(ny > 0.5 ? '#fff4e0' : ['#8a3a4a', '#3a5a8a', '#5a7a4a', '#c89a3a'][i % 4])); }
  taiko(x, z, face) { // big barrel drum on a stand, skin painted with a tomoe, two sticks
    const B = this.B, P = this.SP, r = this.r, fx = Math.sin(face), fz = Math.cos(face), ax = Math.cos(face), az = -Math.sin(face), R = 0.42, Ld = 0.62, cy = 0.78;
    B.add(SH.barrel(), MD(x - fx * Ld / 2, cy, z - fz * Ld / 2, V(fx, 0, fz), R, Ld, R, 0), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => { o.set(this.moon ? '#4a3a5a' : '#8a3a2a'); if (Math.abs(ly - 0.12) < 0.04 || Math.abs(ly - 0.88) < 0.04) o.set(P.gold); o.multiplyScalar(0.85 + 0.2 * clamp(ny * 0.5 + 0.5)); });
    for (const e of [-1, 1]) B.add(X.skin(), MD(x + fx * e * (Ld / 2 + 0.005), cy, z + fz * e * (Ld / 2 + 0.005), V(fx * e, 0, fz * e), R * 0.98, 1, R * 0.98), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => {
      const rr = Math.hypot(lx, lz), a = Math.atan2(lz, lx); o.set('#f4e4c4');
      if (rr > 0.18 && rr < 0.66 && Math.sin(3 * a + rr * 6.5) > 0.45) o.set(this.moon ? '#34407a' : '#c8323a');
      if (rr < 0.14) o.set('#2a2024');
    });
    for (const e of [-1, 1]) { B.add(SH.box(), MD(x + ax * e * 0.46 - fx * 0.2, 0, z + az * e * 0.46 - fz * 0.2, V(fx * 0.35, 1, fz * 0.35).normalize(), 0.07, 0.95, 0.07), col(P.blk)); B.add(SH.box(), MD(x + ax * e * 0.46 + fx * 0.2, 0, z + az * e * 0.46 + fz * 0.2, V(-fx * 0.35, 1, -fz * 0.35).normalize(), 0.07, 0.95, 0.07), col(P.blk)); }
    for (const e of [-1, 1]) B.add(SH.cyl6(), MD(x + ax * e * 0.2 + fx * 0.5, 0.02, z + az * e * 0.2 + fz * 0.5, V(ax * 0.3 + fx, 0, az * 0.3 + fz).normalize(), 0.02, 0.4, 0.02), col('#c8a878'));
    this.coll(x, z, 0.55);
  }
  makiwara(x, z) { // straw-wrapped training post on a stone
    const B = this.B;
    this.rockLump(this.CL, x, z, 0.2, 0.1, 0.18, '#9a948c', false);
    B.add(SH.cyl6(), M(x, 0, z, 0.06, 1.25, 0.06), col('#8a6440'));
    B.add(SH.cyl(), M(x, 0.62, z, 0.14, 0.5, 0.14), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => { o.set('#e0c878'); if (Math.abs(ly - 0.2) < 0.06 || Math.abs(ly - 0.8) < 0.06) o.set('#8a5a3a'); o.multiplyScalar(0.9 + 0.1 * Math.sin(Math.atan2(lx, lz) * 12)); });
    this.coll(x, z, 0.2);
  }
  bokkenRack(x, z, face) { // two uprights holding three wooden swords
    const B = this.B, P = this.SP, ax = Math.cos(face), az = -Math.sin(face);
    B.add(SH.box(), M(x, 0, z, 1.0, 0.08, 0.3, 0, face, 0), col(P.blk));
    for (const e of [-1, 1]) B.add(SH.box(), M(x + ax * e * 0.42, 0, z + az * e * 0.42, 0.07, 0.9, 0.12, 0, face, 0), col(P.wood));
    for (let i = 0; i < 3; i++) B.add(SH.cyl6(), MD(x - ax * 0.55, 0.36 + i * 0.2, z - az * 0.55, V(ax, 0.04, az).normalize(), 0.022, 1.1, 0.022), null, (px, py, pz, nx, ny, nz, o) => o.set(Math.abs((px - x) * ax + (pz - z) * az) > 0.3 && (px - x) * ax + (pz - z) * az < 0 ? '#3a2a2a' : '#d8b884'));
    this.coll(x, z, 0.45);
  }
  // ================================================================== KITCHEN (the Oni's checkered-tile kitchen)
  kitchen_prep(A) { // a work island mid-recipe: chopping board, mixing bowl, rolling pin and dough; stools; a crate of veg
    const s = this.put(A, 1.4, A.big ? { mode: 'center', spread: 2.6, core: 1.15 } : { core: 1.15 }) || this.put(A, 1.4, { core: 1.15 });
    if (!s) return;
    const face = this.r() < 0.5 ? CAM - Math.PI / 4 : CAM + Math.PI / 4;
    this.island(s.x, s.z, face, 2.0);
    for (const e of [-0.55, 0.55]) { const [x, z] = this.lp({ x: s.x, z: s.z, face }, e, 0.85); if (this.ok(x, z, 0.1)) this.W.stool(this.B, x, z); }
    const v = this.put(A, 0.5, { near: [s.x, s.z] }); if (v) this.vegCrate(v.x, v.z, v.face);
    this.flourSpill(A, s);
  }
  kitchen_hearth(A) { // a brick cooking range with a fire in its belly and pots on top, flagstones, firewood and a water bucket
    const s = this.put(A, 1.3, { mode: 'wall', hug: 0.55, ncRad: 1.5 }) || this.put(A, 1.2);
    if (!s) return;
    this.stove(s.x, s.z, s.face);
    const [hx, hz] = this.lp(s, 0, 1.05); this.decal(7, hx, hz, 1.05, 0.55, -s.face, 0);
    const w = this.put(A, 0.9, { near: [s.x, s.z] }); if (w) this.woodpile(w.x, w.z, w.face);
    const b = this.put(A, 0.35, { near: [s.x, s.z] }); if (b) { this.W.ddBucket(b.x, b.z, b.face); this.coll(b.x, b.z, 0.25); }
    const cb = this.put(A, 0.55, { near: [s.x, s.z] }); if (cb) this.choppingBlock(cb.x, cb.z);
    const sp = this.put(A, 0.5, { near: [s.x, s.z] }); if (sp) this.stockpot(sp.x, sp.z);
    if (A.big) { const k = this.put(A, 1.4, { mode: 'center', spread: 2.6, core: 1.15 }); if (k) this.island(k.x, k.z, this.r() < 0.5 ? CAM - Math.PI / 4 : CAM + Math.PI / 4, 1.6, 'prep'); }
  }
  kitchen_bakery(A) { // a domed bread oven with baskets of loaves, a cake on a stand, flour sacks
    const s = this.put(A, 1.4, { mode: 'wall', hug: 0.5, ncRad: 1.5 }) || this.put(A, 1.3);
    if (!s) return;
    this.oven(s.x, s.z, s.face);
    const [hx, hz] = this.lp(s, 0, 1.15); this.decal(7, hx, hz, 0.95, 0.5, -s.face, 0);
    for (let i = 0; i < 2; i++) { const b = this.put(A, 0.45, { collide: false, near: [s.x, s.z] }); if (b) this.breadBasket(b.x, b.z); }
    const c = this.put(A, 0.6, { near: [s.x, s.z] }); if (c) this.cakeTable(c.x, c.z);
    const k = this.put(A, 1.4, A.big ? { mode: 'center', spread: 2.6, core: 1.15 } : { core: 1.15 }); if (k) this.island(k.x, k.z, this.r() < 0.5 ? CAM - Math.PI / 4 : CAM + Math.PI / 4, 2.0, 'bake');
    this.flourSpill(A, s);
  }
  kitchen_dining(A) { // a long table laid for a feast, stools round it
    const s = this.put(A, 2.0, A.big ? { mode: 'center', spread: 2.4, core: 1.4, decal: true } : { core: 1.4, decal: true }) || this.put(A, 2.0, { core: 1.4, decal: true });
    if (!s) return;
    const face = this.r() < 0.5 ? CAM - Math.PI / 4 : CAM + Math.PI / 4;
    this.decal(1, s.x, s.z, 1.95, 1.35, -face, this.r() < 0.6 ? 4 : 5);
    this.longTable(s.x, s.z, face);
    const sb = this.put(A, 0.6, { near: [s.x, s.z] }); if (sb) this.cakeTable(sb.x, sb.z);
  }
  kitchen_pantry(A) { // provisions stacked in the open: barrels, crates of veg, sacks, cheese wheels and pickling crocks
    for (let i = 0; i < 2; i++) { const s = this.put(A, 1.1); if (s) this.storage(s.x, s.z, s.face); }
    const c = this.put(A, 0.5, { collide: false }); if (c) this.crocks(c.x, c.z);
    const v = this.put(A, 0.5); if (v) this.vegCrate(v.x, v.z, v.face);
  }
  kitchen_scullery(A) { // wash tubs full of suds, dish stacks, a drying rack hung with towels, buckets
    const s = this.put(A, 0.9, A.big ? { mode: 'center', spread: 2.4 } : {}) || this.put(A, 0.8);
    if (!s) return;
    this.washTub(s.x, s.z);
    const [dx, dz] = this.lp(s, 0.85, 0.1); if (this.W.walkable(dx, dz)) this.dishes(dx, dz);
    const rk = this.put(A, 0.8, { near: [s.x, s.z] }); if (rk) this.dryRack(rk.x, rk.z, rk.face);
    const t2 = this.put(A, 0.7, { near: [s.x, s.z] }); if (t2) { this.washTub(t2.x, t2.z, 0.8); }
    const b = this.put(A, 0.35, { near: [s.x, s.z] }); if (b) { this.W.ddBucket(b.x, b.z, b.face); this.coll(b.x, b.z, 0.25); }
  }
  kitchen_extras(A) {
    const pool = ['veg', 'storage', 'crocks', 'stools', 'bucket', 'cake', 'dishes', 'sacks'];
    for (let i = 0, n = 2 + (A.cells.length > 70 ? 1 : 0); i < n; i++) {
      const k = this.pick(pool);
      if (k === 'veg') { const p = this.put(A, 0.5); if (p) this.vegCrate(p.x, p.z, p.face); }
      else if (k === 'storage') { const p = this.put(A, 1.1, { mode: 'wall', hug: 0.6 }) || this.put(A, 1.1); if (p) this.storage(p.x, p.z, p.face); }
      else if (k === 'crocks') { const p = this.put(A, 0.5, { collide: false, minWd: 1 }); if (p) this.crocks(p.x, p.z); }
      else if (k === 'stools') { const p = this.put(A, 0.6, { collide: false }); if (p) { this.W.stool(this.CL, p.x, p.z); this.W.stool(this.CL, p.x + 0.55, p.z + 0.2); } }
      else if (k === 'bucket') { const p = this.put(A, 0.35); if (p) { this.W.ddBucket(p.x, p.z, p.face); this.coll(p.x, p.z, 0.25); } }
      else if (k === 'cake') { const p = this.put(A, 0.6); if (p) this.cakeTable(p.x, p.z); }
      else if (k === 'dishes') { const p = this.put(A, 0.45, { collide: false }); if (p) this.dishes(p.x, p.z); }
      else { const p = this.put(A, 0.8, { mode: 'wall', hug: 0.5, collide: false }); if (p) { this.W.sack(this.B, p.x, p.z, p.face); this.W.sack(this.B, p.x + Math.cos(p.face) * 0.55, p.z - Math.sin(p.face) * 0.55, p.face + 0.6); } }
    }
    this.groundCover(A, 0.1, (x, z) => this.kitchenCover(x, z));
  }
  kitchenCover(x, z) { // a dropped spoon, an escaped egg, an onion, a tomato, a puff of flour, a lost dumpling
    const r = this.r, CL = this.CL, k = r(), a = r() * TAU;
    if (k < 0.2) { CL.add(SH.cyl6(), MD(x, 0.02, z, V(Math.cos(a), 0, Math.sin(a)), 0.015, 0.28, 0.015), col('#b8b0a8')); CL.add(SH.sphLo(), M(x - Math.cos(a) * 0.04, 0.025, z - Math.sin(a) * 0.04, 0.05, 0.02, 0.04, 0, -a, 0), col('#c8c0b8')); }
    else if (k < 0.35) CL.add(SH.sphLo(), M(x, 0.05, z, 0.05, 0.065, 0.05, 1.4, a, 0), col('#fff8ee'));
    else if (k < 0.5) { CL.add(SH.sphLo(), M(x, 0.07, z, 0.08, 0.075, 0.08), col(this.pick(['#e0423a', '#c8528a', '#f4e8c8']))); CL.add(SH.leaf(), M(x, 0.14, z, 0.04, 0.02, 0.04), col('#5aa040')); }
    else if (k < 0.72) CL.add(SH.sphLo(), M(x, 0, z, 0.16 + r() * 0.1, 0.04, 0.13 + r() * 0.08, 0, a, 0), col('#fbf4ea'));
    else if (k < 0.86) { for (let i = 0; i < 3; i++) this.W.ddPebble(CL, x + (r() - 0.5) * 0.4, z + (r() - 0.5) * 0.4, 0.03 + r() * 0.03, col('#c8904e')); }
    else CL.add(SH.sph(), M(x, 0.04, z, 0.08, 0.06, 0.08), null, (px, py, pz, nx, ny, nz, o) => o.set(ny > 0.6 ? '#fffaf0' : '#f0e4d0'));
  }
  // ---- kitchen pieces
  island(x, z, face, len, kind = 'prep') {
    const B = this.B, r = this.r, L = (lx, lz) => this.lp({ x, z, face }, lx, lz);
    B.add(SH.box(), M(x, 0, z, len, 0.8, 0.8, 0, face, 0), null, (px, py, pz, nx, ny, nz, o) => o.set(py < 0.09 ? '#5a3a28' : '#b07a48'));
    for (const e of [-1, 1]) for (let i = 0; i < Math.round(len / 0.5); i++) { // cupboard doors with brass knobs on both long sides
      const lx = -len / 2 + 0.25 + i * 0.5, [px, pz] = L(lx, e * 0.402), [kx, kz] = L(lx + 0.14, e * 0.415);
      B.add(SH.box(), M(px, 0.16, pz, 0.42, 0.56, 0.01, 0, face, 0), col('#c48a54')); B.add(SH.sphLo(), M(kx, 0.5, kz, 0.025), col('#e8b848'));
    }
    B.add(SH.box(), M(x, 0.8, z, len + 0.12, 0.07, 0.92, 0, face, 0), null, (px, py, pz, nx, ny, nz, o) => o.copy(col('#e8c898')).multiplyScalar(0.94 + 0.06 * Math.sin(px * 9 + pz * 7)));
    const y = 0.87;
    if (kind === 'bake') { this.bakeTop(L, y, face); for (const e of [-1, 1]) this.coll(...L(e * len / 4, 0), 0.52); return; }
    let [px, pz] = L(-0.5, 0.05); B.add(SH.box(), M(px, y, pz, 0.52, 0.035, 0.34, 0, face + 0.1, 0), col('#d8a868'));
    for (let i = 0; i < 5; i++) { const [cx, cz] = L(-0.62 + i * 0.05, 0.1); B.add(SH.cyl6(), M(cx, y + 0.035, cz, 0.035, 0.012, 0.035, 0, 0, 0.3), col('#ff8a2a')); }
    [px, pz] = L(-0.35, 0.02); B.add(SH.cone(), MD(px, y + 0.06, pz, V(Math.cos(face), 0, -Math.sin(face)), 0.04, 0.24, 0.04), col('#ff8a2a'));
    [px, pz] = L(-0.48, -0.12); B.add(SH.box(), M(px, y + 0.04, pz, 0.24, 0.012, 0.05, 0, face + 0.2, 0), col('#dfe6ee')); [px, pz] = L(-0.68, -0.14); B.add(SH.box(), M(px, y + 0.035, pz, 0.12, 0.03, 0.035, 0, face + 0.2, 0), col('#3a2a24'));
    [px, pz] = L(0.12, -0.05); B.add(X.bowl(), M(px, y, pz, 0.22, 0.24, 0.22), null, (qx, qy, qz, nx, ny, nz, o, lx, ly, lz) => o.set(ly > 0.5 && ly < 0.58 ? '#5a8ac8' : '#fff4e8')); B.add(SH.cyl(), M(px, y + 0.1, pz, 0.17, 0.02, 0.17), col('#f4d890'));
    B.add(SH.cyl6(), MD(px, y + 0.1, pz, V(0.4, 1, 0.2).normalize(), 0.012, 0.3, 0.012), col('#b8b0a8'));
    [px, pz] = L(0.6, 0.08); B.add(SH.sph(), M(px, y + 0.05, pz, 0.16, 0.06, 0.14), col('#f4e0b8')); B.add(SH.cyl6(), M(px, y, pz, 0.24, 0.004, 0.2), col('#fbf6ee'));
    [px, pz] = L(0.6, -0.22); B.add(SH.cyl(), MD(px - Math.cos(face) * 0.22, y + 0.045, pz + Math.sin(face) * 0.22, V(Math.cos(face), 0, -Math.sin(face)), 0.04, 0.44, 0.04), null, (qx, qy, qz, nx, ny, nz, o, lx, ly, lz) => o.set(ly < 0.18 || ly > 0.82 ? '#a8744a' : '#e0b888'));
    for (let i = 0; i < 3; i++) { [px, pz] = L(0.3 + i * 0.11, 0.3); B.add(SH.sphLo(), M(px, y + 0.06, pz, 0.065), col('#e0423a')); B.add(SH.star(), M(px, y + 0.12, pz, 0.04, 0.03, 0.04), col('#5aa040')); }
    for (const e of [-1, 1]) this.coll(...L(e * len / 4, 0), 0.52);
  }
  bakeTop(L, y, face) { // flour-dusted board, dough balls, a rolling pin, a tray of cookies and a loaf cooling
    const B = this.B, r = this.r;
    let [px, pz] = L(-0.35, 0); B.add(SH.cyl6(), M(px, y, pz, 0.5, 0.004, 0.36, 0, face, 0), col('#fbf6ee'));
    for (let i = 0; i < 3; i++) { [px, pz] = L(-0.55 + i * 0.2, 0.08 - (i % 2) * 0.14); B.add(SH.sph(), M(px, y + 0.05, pz, 0.1, 0.07, 0.1), null, grad('#e8d0a8', '#fff4e4', 0.6, 0.4)); }
    [px, pz] = L(-0.2, -0.22); B.add(SH.cyl(), MD(px - Math.cos(face) * 0.22, y + 0.045, pz + Math.sin(face) * 0.22, V(Math.cos(face), 0, -Math.sin(face)), 0.04, 0.44, 0.04), null, (qx, qy, qz, nx, ny, nz, o, lx, ly, lz) => o.set(ly < 0.18 || ly > 0.82 ? '#a8744a' : '#e0b888'));
    [px, pz] = L(0.35, 0.05); B.add(SH.box(), M(px, y, pz, 0.5, 0.02, 0.34, 0, face - 0.1, 0), col('#6a6a78'));
    for (let i = 0; i < 6; i++) { const [cx, cz] = L(0.2 + (i % 3) * 0.14, -0.05 + Math.floor(i / 3) * 0.16); B.add(SH.cyl6(), M(cx, y + 0.02, cz, 0.05, 0.02, 0.05), null, (qx, qy, qz, nx, ny, nz, o) => o.set(ny > 0.9 && i % 2 ? '#ff9ab8' : '#d89a58')); }
    [px, pz] = L(0.62, -0.26); B.add(SH.sph(), M(px, y + 0.06, pz, 0.2, 0.1, 0.11, 0, face, 0), null, (qx, qy, qz, nx, ny, nz, o, lx, ly, lz) => { o.copy(col('#b8702e')).lerp(col('#e8b060'), clamp(ny)); if (ny > 0.6 && Math.abs(Math.sin(lx * 9)) < 0.3) o.set('#f4d8a0'); });
    [px, pz] = L(0.05, 0.28); B.add(SH.cyl(), M(px, y, pz, 0.07, 0.14, 0.07), null, (qx, qy, qz, nx, ny, nz, o) => o.set(ny > 0.9 ? '#c8323a' : '#f4e8e0'));
  }
  choppingBlock(x, z) { // a butcher's block with a cleaver in it and a string of onions
    const B = this.B, r = this.r;
    B.add(SH.cyl(), M(x, 0, z, 0.36, 0.7, 0.36), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => { if (ny > 0.9) { o.copy(col('#e8c490')).lerp(col('#b8864e'), clamp(Math.hypot(lx, lz))); return; } o.copy(col('#8a5a36')).lerp(col('#a8744a'), 0.5 + 0.5 * Math.sin(Math.atan2(lx, lz) * 7)); });
    const a = r() * TAU; B.add(SH.box(), M(x + Math.cos(a) * 0.05, 0.7, z + Math.sin(a) * 0.05, 0.22, 0.14, 0.02, 0, -a, 0), col('#dfe6ee')); B.add(SH.cyl6(), MD(x + Math.cos(a) * 0.17, 0.8, z + Math.sin(a) * 0.17, V(Math.cos(a), 0.2, Math.sin(a)).normalize(), 0.025, 0.2, 0.025), col('#3a2a24'));
    for (let i = 0; i < 3; i++) { const b = r() * TAU; this.CL.add(SH.sphLo(), M(x + Math.cos(b) * 0.5, 0.07, z + Math.sin(b) * 0.5, 0.08, 0.075, 0.08), col(this.pick(['#e8c070', '#c8528a', '#f4e8c8']))); }
    this.coll(x, z, 0.38);
  }
  stockpot(x, z) { // a big copper stockpot on the floor with a ladle
    const B = this.B;
    B.add(SH.cyl(), M(x, 0, z, 0.34, 0.5, 0.34), null, grad('#a85a2e', '#e8905a', 0.5, 0.4));
    B.add(SH.cyl(), M(x, 0.46, z, 0.3, 0.02, 0.3), col('#d8a060'));
    B.add(X.ringLo(), M(x, 0.5, z, 0.34, 0.34, 0.34), col('#c8703a'));
    B.add(SH.cyl6(), MD(x + 0.1, 0.4, z, V(0.4, 1, 0.1).normalize(), 0.02, 0.45, 0.02), col('#b8b0a8'));
    this.coll(x, z, 0.36);
  }
  vegCrate(x, z, face) { const r = this.r; this.W.crate(this.B, x, 0, z, face, 0.55); for (let i = 0; i < 6; i++) { const a = r() * TAU, d = r() * 0.16, k = r(); if (k < 0.4) this.B.add(SH.sphLo(), M(x + Math.cos(a) * d, 0.58, z + Math.sin(a) * d, 0.09), col(this.pick(['#e0423a', '#8ac050', '#c8528a']))); else if (k < 0.7) this.B.add(SH.cone(), M(x + Math.cos(a) * d, 0.55, z + Math.sin(a) * d, 0.045, 0.26, 0.045, 1.3, a, 0), col('#ff8a2a')); else this.B.add(SH.sph(), M(x + Math.cos(a) * d, 0.6, z + Math.sin(a) * d, 0.1, 0.09, 0.1), col('#8ac860')); } this.coll(x, z, 0.4); }
  flourSpill(A, near) { // sacks, one tipped over, flour spilled and a trail of floury paw prints heading off into the room
    const p = this.put(A, 0.9, { mode: 'wall', hug: 0.6, collide: false, near: [near.x, near.z] }) || this.put(A, 0.9, { collide: false, near: [near.x, near.z] });
    if (!p) return;
    const B = this.B, r = this.r, fx = Math.sin(p.face), fz = Math.cos(p.face);
    this.W.sack(B, p.x - fz * 0.35, p.z + fx * 0.35, p.face);
    B.add(SH.sph(), M(p.x + fz * 0.25 + fx * 0.25, 0.22, p.z - fx * 0.25 + fz * 0.25, 0.28, 0.22, 0.32, 0.2, p.face + 1.1, Math.PI / 2 - 0.2), null, (px, py, pz, nx, ny, nz, o) => o.set(ny < -0.6 ? '#d8ccb0' : '#e8dcc0'));
    const sx = p.x + fx * 0.75, sz = p.z + fz * 0.75, R = 0.55, ang = Math.atan2(A.cz - sz, A.cx - sx) + (r() - 0.5) * 0.8;
    this.decal(8, sx, sz, R + 2.4, R + 0.3, ang, 0, [R, 0, 0, 0]);
    this.coll(p.x, p.z, 0.4);
  }
  stove(x, z, face) { // brick range: iron top with a rail, an arched fire door, an ash door, a flue pipe up the wall, pots on top
    const B = this.B, GL = this.GL, L = (lx, lz) => this.lp({ x, z, face }, lx, lz), fx = Math.sin(face), fz = Math.cos(face), FD = V(fx, 0, fz), ax = Math.cos(face), az = -Math.sin(face);
    B.add(SH.box(), M(x, 0, z, 1.5, 0.84, 0.9, 0, face, 0), null, (px, py, pz, nx, ny, nz, o) => { o.copy(col('#b45a3e')).multiplyScalar(0.85 + 0.15 * Math.sin(py * 28) * Math.sin((px + pz) * 12)); if (py < 0.1) o.set('#6a4a40'); });
    for (const e of [-1, 1]) { const [px, pz] = L(e * 0.72, 0.43); B.add(SH.box(), M(px, 0, pz, 0.1, 0.84, 0.08, 0, face, 0), null, (qx, qy, qz, nx, ny, nz, o) => o.set(Math.sin(qy * 26) > 0 ? '#c8704e' : '#a85038')); } // corner quoins
    B.add(SH.box(), M(x, 0.84, z, 1.56, 0.06, 0.96, 0, face, 0), col('#34303a'));
    for (const e of [-0.4, 0.38]) { const [px, pz] = L(e, 0); B.add(X.ringLo(), M(px, 0.905, pz, 0.24, 0.12, 0.24), col('#4a4450')); } // hob rings
    { const [px, pz] = L(-0.78, 0.54); B.add(SH.cyl6(), MD(px, 0.78, pz, V(ax, 0, az), 0.02, 1.56, 0.02), col('#c8c0b8')); for (const e of [-0.7, 0.7]) { const [bx, bz] = L(e, 0.5); B.add(SH.cyl6(), MD(bx, 0.78, bz, V(-fx, 0, -fz), 0.015, 0.06, 0.015), col('#8a8490')); } } // towel rail
    { const [tx, tz] = L(0.25, 0.555); B.add(SH.box(), M(tx, 0.62, tz, 0.2, 0.24, 0.015, 0, face, 0.06), null, (qx, qy, qz, nx, ny, nz, o, lx, ly) => o.set(Math.sin(ly * 30) > 0.3 ? '#e8606a' : '#fff8ee')); } // a tea towel
    let [px, pz] = L(0, 0.452); B.add(SH.box(), M(px, 0.12, pz, 0.62, 0.4, 0.02, 0, face, 0), col('#3a3438')); // iron door frame
    B.add(SH.disc(), MD(px, 0.52, pz, FD, 0.31, 0.02, 0.31), col('#3a3438'));
    [px, pz] = L(0, 0.46); B.add(SH.box(), M(px, 0.14, pz, 0.52, 0.34, 0.02, 0, face, 0), col('#1e1414')); B.add(SH.disc(), MD(px, 0.48, pz, FD, 0.26, 0.022, 0.26), col('#1e1414'));
    [px, pz] = L(0, 0.44); GL.add(SH.box(), M(px, 0.15, pz, 0.46, 0.3, 0.02, 0, face, 0), null, (qx, qy, qz, nx, ny, nz, o, lx, ly, lz) => o.copy(col('#ff5a1a')).lerp(col('#ffc050'), clamp(1 - ly * 1.4)));
    [px, pz] = L(0.44, 0.5); B.add(SH.box(), M(px + ax * 0.1, 0.12, pz + az * 0.1, 0.24, 0.52, 0.03, 0, face + 1.1, 0), null, (qx, qy, qz, nx, ny, nz, o) => o.copy(col('#4a4450')).multiplyScalar(ny > 0.5 ? 1.2 : 1)); // the fire door, swung open
    [px, pz] = L(0.56, 0.62); B.add(SH.sphLo(), M(px, 0.4, pz, 0.03), col('#e8b848'));
    for (let i = 0; i < 3; i++) { [px, pz] = L(-0.14 + i * 0.14, 0.44); B.add(SH.cyl6(), MD(px, 0.08, pz, V(ax, 0, az), 0.035, 0.12, 0.035), col('#6a4630')); } // logs in the fire
    [px, pz] = L(0, 0.7); this.HA.add(px, 0.35, pz, 1.8, '#ff8a3a', 0.8, 1.5); this.light(px, 0.7, pz, '#ff9a4a', 5, 6, 1.2);
    [px, pz] = L(0.55, -0.32); B.add(SH.cyl8(), M(px, 0.87, pz, 0.1, 1.5, 0.1), null, (qx, qy, qz, nx, ny, nz, o) => o.set(Math.abs(Math.sin(qy * 4)) < 0.1 ? '#6a6674' : '#3e3a44')); // flue pipe
    B.add(SH.cyl8(), M(px, 2.37, pz, 0.14, 0.08, 0.14), col('#2e2a34')); this.W.steam.push(V(px, 2.5, pz));
    [px, pz] = L(-0.4, 0); B.add(SH.cyl(), M(px, 0.9, pz, 0.26, 0.3, 0.26), null, grad('#a85a2e', '#e8905a', 0.5, 0.4)); B.add(SH.cyl(), M(px, 1.2, pz, 0.27, 0.03, 0.27), col('#c8703a')); B.add(SH.sphLo(), M(px, 1.25, pz, 0.04), col('#3a3036'));
    for (const e of [-1, 1]) B.add(X.ringLo(), MD(px + ax * e * 0.28, 1.1, pz + az * e * 0.28, V(fx, 0, fz), 0.06, 0.06, 0.06), col('#8a4a2a'));
    this.W.steam.push(V(px, 1.3, pz));
    [px, pz] = L(0.38, 0.05); B.add(SH.sph(), M(px, 1.02, pz, 0.16, 0.13, 0.16), null, grad('#3a3a44', '#6a6a78', 0.5, 0.4)); B.add(SH.cyl6(), MD(px + fx * 0.12, 1.0, pz + fz * 0.12, V(fx, 0.9, fz).normalize(), 0.025, 0.16, 0.025), col('#4a4a54')); B.add(X.ringLo(), MD(px, 1.14, pz, V(Math.cos(face), 0, -Math.sin(face)), 0.09, 0.09, 0.09), col('#2a2a30'));
    for (const e of [-1, 1]) this.coll(...L(e * 0.4, 0), 0.55);
  }
  oven(x, z, face) {
    const B = this.B, GL = this.GL, L = (lx, lz) => this.lp({ x, z, face }, lx, lz), fx = Math.sin(face), fz = Math.cos(face);
    B.add(SH.box(), M(x, 0, z, 1.7, 0.3, 1.6, 0, face, 0), col('#a89a90'));
    B.add(X.dome(), M(x, 0.3, z, 0.85, 1.0, 0.8, 0, face, 0), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => { o.copy(col('#e0a878')).multiplyScalar(0.86 + 0.14 * Math.sin(py * 26) * Math.sin(Math.atan2(lx, lz) * 9)); const fr = lx * fx + lz * fz; if (fr > 0.5 && ly < 0.75) o.lerp(col('#4a3432'), clamp((fr - 0.5) * 2) * clamp((0.75 - ly) * 3) * 0.7); });
    let [px, pz] = L(0, 0.72); B.add(SH.disc(), MD(px, 0.52, pz, V(fx, 0.35, fz).normalize(), 0.3, 0.05, 0.3), col('#1e1414'));
    [px, pz] = L(0, 0.68); GL.add(SH.sphLo(), M(px, 0.5, pz, 0.2, 0.13, 0.08, 0, face, 0), col('#ff8a3a'));
    [px, pz] = L(0, 1.0); this.HA.add(px, 0.55, pz, 1.7, '#ff9a4a', 0.75, 1.2); this.light(px, 0.8, pz, '#ffa050', 4.5, 6, 1);
    [px, pz] = L(0.1, -0.35); B.add(SH.cyl(), M(px, 0.9, pz, 0.13, 0.55, 0.13), col('#8a5a44')); this.W.steam.push(V(px, 1.5, pz));
    [px, pz] = L(0.95, 0.3); B.add(SH.cyl6(), MD(px, 0, pz, V(-fx * 0.2, 1, -fz * 0.2).normalize(), 0.025, 1.3, 0.025), col('#c89868')); B.add(SH.box(), M(px, 0.0, pz, 0.3, 0.02, 0.36, 1.35, face, 0), col('#d8b080'));
    this.coll(x, z, 0.92);
  }
  breadBasket(x, z) {
    const B = this.CL, r = this.r;
    B.add(SH.cyl(), M(x, 0, z, 0.3, 0.16, 0.24), null, (px, py, pz, nx, ny, nz, o) => o.copy(col('#c89858')).multiplyScalar(Math.sin(py * 80) > 0 ? 1 : 0.8));
    B.add(SH.cyl6(), M(x, 0.14, z, 0.26, 0.02, 0.2), col('#f4e8d0'));
    for (let i = 0; i < 4; i++) { const a = r() * TAU, d = r() * 0.1; B.add(SH.sph(), M(x + Math.cos(a) * d, 0.2, z + Math.sin(a) * d, 0.14, 0.08, 0.08, 0, a, 0), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => { o.copy(col('#b8702e')).lerp(col('#e8b060'), clamp(ny)); if (ny > 0.6 && Math.abs(Math.sin(lx * 9)) < 0.3) o.set('#f4d8a0'); }); }
    for (let i = 0; i < 2; i++) B.add(SH.cyl(), MD(x + (i - 0.5) * 0.12, 0.1, z - 0.1, V((i - 0.5) * 0.4, 1, 0.3).normalize(), 0.04, 0.5, 0.04), null, grad('#b8702e', '#e8b060', 0.5, 0.4));
  }
  cake(x, y, z, s = 1) { // strawberry shortcake on a glass stand
    const B = this.B;
    B.add(SH.cyl6(), M(x, y, z, 0.05 * s, 0.14 * s, 0.05 * s), col('#dfe8ee')); B.add(SH.cyl(), M(x, y + 0.14 * s, z, 0.24 * s, 0.02, 0.24 * s), col('#eef4f8'));
    const y0 = y + 0.16 * s;
    B.add(SH.cyl(), M(x, y0, z, 0.2 * s, 0.07 * s, 0.2 * s), col('#f4d8a0'));
    B.add(SH.cyl(), M(x, y0 + 0.07 * s, z, 0.205 * s, 0.025 * s, 0.205 * s), col('#fff4ec'));
    B.add(SH.cyl(), M(x, y0 + 0.095 * s, z, 0.2 * s, 0.07 * s, 0.2 * s), col('#f4d8a0'));
    B.add(SH.cyl(), M(x, y0 + 0.165 * s, z, 0.21 * s, 0.035 * s, 0.21 * s), col('#ffc8dc'));
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; B.add(SH.sphLo(), M(x + Math.cos(a) * 0.13 * s, y0 + 0.22 * s, z + Math.sin(a) * 0.13 * s, 0.04 * s, 0.05 * s, 0.04 * s), col('#e8303a')); B.add(SH.sphLo(), M(x + Math.cos(a) * 0.13 * s, y0 + 0.2 * s, z + Math.sin(a) * 0.13 * s + 0.0, 0.035 * s, 0.03 * s, 0.035 * s), col('#fffaf4')); }
    B.add(SH.sphLo(), M(x, y0 + 0.23 * s, z, 0.05 * s), col('#e8303a'));
  }
  cakeTable(x, z) { // round side table with the cake and a teapot
    const B = this.B;
    B.add(SH.cyl6(), M(x, 0, z, 0.2, 0.04, 0.2), col('#6a4a34')); B.add(SH.cyl6(), M(x, 0, z, 0.05, 0.6, 0.05), col('#6a4a34'));
    B.add(SH.cyl(), M(x, 0.6, z, 0.42, 0.05, 0.42), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => o.set(ny > 0.5 && Math.hypot(lx, lz) < 0.8 ? '#fffaf4' : '#e8dccc'));
    this.cake(x, 0.65, z, 0.9);
    this.coll(x, z, 0.42);
  }
  longTable(x, z, face) {
    const B = this.B, GL = this.GL, r = this.r, L = (lx, lz) => this.lp({ x, z, face }, lx, lz), len = 2.6, dep = 1.0, y = 0.68;
    for (const [ex, ez] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const [px, pz] = L(ex * (len / 2 - 0.12), ez * (dep / 2 - 0.1)); B.add(SH.box(), M(px, 0, pz, 0.09, y, 0.09, 0, face, 0), col('#7a5236')); }
    B.add(SH.box(), M(x, y, z, len, 0.07, dep, 0, face, 0), col('#a8703e'));
    B.add(SH.box(), M(x, y + 0.07, z, len - 0.3, 0.008, 0.36, 0, face, 0), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => o.set(Math.abs(lz) > 0.4 ? '#fff4e0' : '#c8323a'));
    const top = y + 0.078;
    for (const e of [-1, 1]) for (let i = 0; i < 3; i++) { // place settings
      const [px, pz] = L((i - 1) * 0.8, e * 0.32);
      B.add(SH.cyl6(), M(px, top, pz, 0.15, 0.015, 0.15), null, (qx, qy, qz, nx, ny, nz, o, lx, ly, lz) => o.set(Math.hypot(lx, lz) > 0.85 ? '#5a8ac8' : '#fffaf4'));
      const k = r();
      if (k < 0.4) for (let q = 0; q < 3; q++) B.add(SH.sphLo(), M(px + (q - 1) * 0.06, top + 0.04, pz, 0.045, 0.035, 0.045), col('#fffaf0')); // dumplings
      else if (k < 0.7) { B.add(SH.sph(), M(px, top + 0.04, pz, 0.1, 0.035, 0.05, 0, face + 1.5, 0), col('#f08a4a')); } // a little grilled fish
      else B.add(SH.cone4(), M(px, top + 0.01, pz, 0.07, 0.1, 0.05, 0, face, 0), null, (qx, qy, qz, nx, ny, nz, o, lx, ly, lz) => o.set(ly < 0.3 ? '#2a3a2a' : '#fffaf4')); // onigiri
      const [cx, cz] = L((i - 1) * 0.8 + 0.2, e * 0.22); B.add(SH.cyl6(), M(cx, top, cz, 0.04, 0.08, 0.04), null, (qx, qy, qz, nx, ny, nz, o) => o.set(ny > 0.9 ? '#b85a3a' : '#e8e0d4'));
      const [sx, sz] = L((i - 1) * 0.8, e * 0.95); if (this.ok(sx, sz, 0.1)) this.W.stool(this.CL, sx, sz);
    }
    this.cake(...(() => { const [px, pz] = L(-len / 2 + 0.35, 0); return [px, top, pz]; })(), 0.75);
    let [px, pz] = L(0.05, 0); B.add(SH.cyl6(), M(px, top, pz, 0.3, 0.02, 0.2), col('#e8dccc')); B.add(SH.sph(), M(px, top + 0.08, pz, 0.24, 0.08, 0.12, 0, face, 0), col('#d86a3a')); // a big roast on a platter
    for (const e of [-1, 1]) { [px, pz] = L(0.45 * e + 0.35, 0.02); B.add(SH.cyl(), M(px, top, pz, 0.035, 0.18, 0.035), col('#fff4e4')); GL.add(SH.sphLo(), M(px, top + 0.21, pz, 0.022, 0.05, 0.022), col('#ffd890')); this.HA.add(px, top + 0.22, pz, 0.7, '#ffb060', 0.55, 1); }
    for (const e of [-1, 0, 1]) this.coll(...L(e * 0.85, 0), 0.52);
  }
  storage(x, z, face) { // barrels, a crate stack with veg on top, a sack and cheese wheels
    const B = this.B, L = (lx, lz) => this.lp({ x, z, face }, lx, lz);
    let [px, pz] = L(-0.45, -0.1); this.W.barrel(B, px, 0, pz, face);
    [px, pz] = L(0.3, -0.15); this.W.crate(B, px, 0, pz, face + 0.1, 0.6); this.W.crate(B, px + 0.03, 0.6, pz, face + 0.35, 0.46);
    [px, pz] = L(0.2, 0.55); this.W.sack(B, px, pz, face);
    [px, pz] = L(-0.4, 0.55); this.W.cheese(B, px, pz);
    this.coll(...L(-0.2, 0), 0.75);
  }
  crocks(x, z) { const r = this.r; for (let i = 0; i < 3; i++) { const a = i * 2.1 + r(), px = x + Math.cos(a) * 0.22, pz = z + Math.sin(a) * 0.22, h = 0.26 + r() * 0.12; this.W.jar(this.B, px, 0, pz, h, this.pick(['#e8a838', '#8ac05a', '#d04a4a', '#f0e0c0', '#7a5ac8'])); } }
  washTub(x, z, s = 1) {
    const B = this.B, r = this.r;
    B.add(SH.barrel(), M(x, 0, z, 0.46 * s, 0.46 * s, 0.46 * s), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => { o.copy(col('#a06a40')).multiplyScalar(Math.sin(Math.atan2(lx, lz) * 9) > 0.85 ? 0.8 : 1); if (Math.abs(ly - 0.25) < 0.05 || Math.abs(ly - 0.8) < 0.05) o.set('#5a5058'); if (ny > 0.9) o.set('#8ac8e0'); });
    for (let i = 0; i < 9; i++) { const a = r() * TAU, d = r() * 0.3 * s; B.add(SH.sphLo(), M(x + Math.cos(a) * d, 0.46 * s + 0.02 + r() * 0.06, z + Math.sin(a) * d, (0.06 + r() * 0.06) * s), null, (px, py, pz, nx, ny, nz, o) => o.set(ny > 0.3 ? '#ffffff' : '#dff0fa')); }
    B.add(SH.cyl6(), MD(x + 0.2 * s, 0.4 * s, z, V(0.6, 1, 0.2).normalize(), 0.02, 0.35, 0.02), col('#c89868'));
    for (const t of [0.25, 0.8]) B.add(SH.hoop(), M(x, t * 0.46 * s, z, 0.46 * s * (1 + Math.sin(t * Math.PI) * 0.14) + 0.008, 1, 0.46 * s * (1 + Math.sin(t * Math.PI) * 0.14) + 0.008), col('#5a5058'));
    for (const e of [-1, 1]) B.add(SH.box(), M(x + e * 0.5 * s, 0.36 * s, z, 0.06, 0.1 * s, 0.14 * s), col('#8a5a36')); // lug handles
    this.coll(x, z, 0.5 * s);
  }
  dishes(x, z) { const B = this.CL, r = this.r; for (let k = 0; k < 2; k++) { const px = x + k * 0.34, pz = z + (r() - 0.5) * 0.2; for (let i = 0; i < 4 + Math.floor(r() * 4); i++) B.add(SH.cyl6(), M(px + (r() - 0.5) * 0.02, i * 0.03, pz + (r() - 0.5) * 0.02, 0.15, 0.028, 0.15), null, (qx, qy, qz, nx, ny, nz, o, lx, ly, lz) => o.set(Math.hypot(lx, lz) > 0.8 && ny > 0.5 ? '#4a7ac8' : '#f8f4ee')); } B.add(X.bowl(), M(x + 0.15, 0, z + 0.3, 0.14, 0.14, 0.14), col('#f4ece0')); }
  dryRack(x, z, face) { // an A-frame airer with tea towels drying
    const B = this.B, r = this.r, ax = Math.cos(face), az = -Math.sin(face), fx = Math.sin(face), fz = Math.cos(face);
    for (const e of [-1, 1]) for (const f of [-1, 1]) B.add(SH.cyl6(), MD(x + ax * e * 0.55 + fx * f * 0.3, 0, z + az * e * 0.55 + fz * f * 0.3, V(-fx * f * 0.3, 1, -fz * f * 0.3).normalize(), 0.025, 1.05, 0.025), col('#c89868'));
    for (const f of [-1, 0, 1]) B.add(SH.cyl6(), MD(x - ax * 0.6 + fx * f * 0.14, 1.0 - Math.abs(f) * 0.28, z - az * 0.6 + fz * f * 0.14, V(ax, 0, az), 0.02, 1.2, 0.02), col('#b88858'));
    for (let i = 0; i < 3; i++) { const o = (i - 1) * 0.36, f = i === 1 ? 0 : (i ? 1 : -1) * 0.14, y = 1.0 - Math.abs(Math.sign(f)) * 0.28; B.add(SH.box(), M(x + ax * o + fx * f, y - 0.42, z + az * o + fz * f, 0.3, 0.42, 0.015, 0, face + (r() - 0.5) * 0.2, 0), null, (px, py, pz, nx, ny, nz, oc, lx, ly, lz) => oc.set(Math.sin(ly * 18) > 0.3 ? this.pick(['#e8606a', '#5a8ac8', '#7ab860']) : '#fff8ee')); }
    this.coll(x, z, 0.5);
  }
  // ================================================================== CRYSTAL GROTTO
  crystal_geode(A) { // a split geode: a ring of frosted rock round a glowing bed of crystals
    const s = this.put(A, 1.5, A.big ? { mode: 'center', spread: 2.6 } : {}) || this.put(A, 1.3);
    if (!s) return;
    const B = this.B, GL = this.GL, r = this.r, R = 1.05, cc = this.pick(['#7af0ff', '#ff8ae0', '#c8a8ff']);
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + r() * 0.2, px = s.x + Math.cos(a) * R, pz = s.z + Math.sin(a) * R; B.add(X.lump(), M(px, 0.25, pz, 0.42, 0.55 + r() * 0.2, 0.34, (r() - 0.5) * 0.3, -a, 0.35), null, (qx, qy, qz, nx, ny, nz, o) => o.copy(col('#4a3c78')).lerp(col('#7a6ab0'), clamp(qy * 0.9)).lerp(col('#e8f0ff'), clamp(ny * 2 - 1.2))); }
    GL.add(SH.cyl(), M(s.x, 0.02, s.z, 0.95, 0.05, 0.95), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => o.copy(col(cc)).multiplyScalar(0.55 + 0.4 * (1 - Math.hypot(lx, lz))));
    for (let i = 0; i < 12; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 0.7, h = 0.35 + r() * 0.75 * (1 - d * 0.6), c2 = r() < 0.7 ? cc : this.pick(['#ffffff', '#b8f4ff', '#ffc0ee']); GL.add(SH.crys(), MD(s.x + Math.cos(a) * d, 0, s.z + Math.sin(a) * d, V(Math.cos(a) * d * 0.7, 1, Math.sin(a) * d * 0.7).normalize(), 0.1 + r() * 0.06, h, 0.1 + r() * 0.06, r() * TAU), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => o.copy(col(c2)).lerp(col('#ffffff'), clamp(ly * 0.6))); }
    this.HA.add(s.x, 0.8, s.z, 3.6, cc, 0.4);
    this.W.floorGlows.add(s.x, 0.03, s.z, 2.4, cc, 0.35, 1);
    this.light(s.x, 1.2, s.z, cc, 6, 7, 0.2);
    this.coll(s.x, s.z, 1.25);
  }
  crystal_spires(A) { // a towering crystal cluster with a skirt of smaller points and frost rocks
    const s = this.put(A, 1.3, { core: 0.7 });
    if (!s) return;
    const GL = this.GL, r = this.r, cc = this.pick(['#ff8ae0', '#c8a8ff', '#7af0ff']);
    for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + r() * 0.4, d = i ? 0.35 + r() * 0.25 : 0, h = i ? 0.9 + r() * 0.9 : 2.5, c2 = i % 3 === 2 ? '#ffffff' : cc; GL.add(SH.crys(), MD(s.x + Math.cos(a) * d, -0.1, s.z + Math.sin(a) * d, i ? V(Math.cos(a) * 0.45, 1, Math.sin(a) * 0.45).normalize() : V(0, 1, 0), i ? 0.18 : 0.34, h, i ? 0.18 : 0.34, r() * TAU), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => o.copy(col(c2)).lerp(col('#ffffff'), clamp(ly * 0.6))); }
    for (let i = 0; i < 5; i++) { const a = r() * TAU; this.W.frostRock(this.B, s.x + Math.cos(a) * 1.0, s.z + Math.sin(a) * 1.0, 0.25 + r() * 0.12); }
    for (let i = 0; i < 6; i++) { const a = r() * TAU, d = 0.9 + r() * 0.4; this.W.ddSprouts(this.GL, s.x + Math.cos(a) * d, s.z + Math.sin(a) * d, 1.2, cc); }
    this.HA.add(s.x, 1.5, s.z, 4.2, cc, 0.4); this.light(s.x, 2.2, s.z, cc, 5, 7, 0.3);
    this.coll(s.x, s.z, 0.65);
  }
  crystal_stalagmites(A) { // a stand of rime-coated stalagmites, snow collars at their feet
    for (let g = 0; g < 2; g++) {
      const s = this.put(A, 1.2); if (!s) continue;
      const r = this.r, n = 3 + Math.floor(r() * 2);
      for (let i = 0; i < n; i++) { const a = i / n * TAU + r() * 0.6, d = i ? 0.6 + r() * 0.2 : 0, h = i ? 0.9 + r() * 0.7 : 1.9 + r() * 0.5, R = i ? 0.22 + r() * 0.08 : 0.38, x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d;
        this.stalagmite(x, z, h, R); if (!i || R > 0.26) this.coll(x, z, R * 0.9); }
    }
  }
  crystal_drift(A) { // snowdrifts on a snow patch, and a little yukidaruma someone built
    const s = this.put(A, 1.9, { collide: false, decal: true, ncRad: 2.0 });
    if (!s) return;
    const B = this.B, r = this.r;
    this.decal(9, s.x, s.z, 1.9, 1.5, r() * TAU, 0);
    for (let i = 0; i < 5; i++) { const a = r() * TAU, d = 0.4 + r() * 0.9; B.add(SH.hemi(), M(s.x + Math.cos(a) * d, -0.03, s.z + Math.sin(a) * d, 0.45 + r() * 0.3, 0.2 + r() * 0.2, 0.38 + r() * 0.25, 0, r() * TAU, 0), null, grad('#c8cef0', '#fbfcff', 0.9, 0.2)); }
    const [sx, sz] = this.lp(s, 0.3, 0.6); this.snowman(sx, sz, CAM + (r() - 0.5) * 0.6);
    for (let i = 0; i < 3; i++) { const a = r() * TAU; this.W.ddSprouts(this.GL, s.x + Math.cos(a) * 1.5, s.z + Math.sin(a) * 1.5, 1.0, this.pick(['#7af0ff', '#ff8ae0'])); }
  }
  crystal_pool(A) { // a frozen pool, glowing from beneath, crystals frozen into it and frost rocks round its rim
    const s = this.put(A, 1.9, { collide: false, decal: true, ncRad: 2.0 }) || this.put(A, 1.5, { collide: false, decal: true });
    if (!s) return;
    const r = this.r, hx = s.rad * 0.9, hz = s.rad * 0.65, ang = r() * TAU, ax = Math.cos(ang), az = Math.sin(ang), L = (lx, lz) => [s.x + ax * lx - az * lz, s.z + az * lx + ax * lz];
    this.decal(5, s.x, s.z, hx, hz, ang, 0);
    for (let i = 0; i < 3; i++) { const [x, z] = L((r() - 0.5) * hx, (r() - 0.5) * hz); this.W.ddSprouts(this.GL, x, z, 1.4, this.pick(['#7af0ff', '#b8f4ff'])); }
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + r() * 0.5, [x, z] = L(Math.cos(a) * (hx + 0.25), Math.sin(a) * (hz + 0.25)); if (this.W.walkable(x, z)) this.W.frostRock(this.B, x, z, 0.2 + r() * 0.14); }
    const [px, pz] = L(hx + 0.5, 0); if (this.W.walkable(px, pz)) { this.stalagmite(px, pz, 1.1, 0.24); this.coll(px, pz, 0.22); }
    this.W.floorGlows.add(s.x, 0.03, s.z, s.rad * 1.2, '#7ae8ff', 0.3, 1);
    this.light(s.x, 1.0, s.z, '#8af0ff', 3.5, 6, 0.2);
  }
  crystal_mine(A) { // an abandoned miners' camp: a rail spur, a cart heaped with crystals, a pickaxe, a lantern and crates
    const s = this.put(A, 1.6, { core: 0.9 });
    if (!s) return;
    const B = this.B, GL = this.GL, r = this.r, face = s.face, ax = Math.cos(face), az = -Math.sin(face), fx = Math.sin(face), fz = Math.cos(face), Lr = 3.2;
    for (const e of [-1, 1]) B.add(SH.box(), MD(s.x - ax * Lr / 2 + fx * e * 0.3, 0.03, s.z - az * Lr / 2 + fz * e * 0.3, V(ax, 0, az), 0.05, Lr, 0.05), col('#6a6a78'));
    for (let i = 0; i < 7; i++) { const o = -Lr / 2 + 0.2 + i * (Lr - 0.4) / 6; B.add(SH.box(), M(s.x + ax * o, 0, s.z + az * o, 0.16, 0.04, 0.8, 0, face + Math.PI / 2, 0), col('#6a4a34')); }
    this.mineCart(s.x + ax * 0.4, s.z + az * 0.4, face);
    let px = s.x - ax * 0.55 + fx * 0.75, pz = s.z - az * 0.55 + fz * 0.75; // pickaxe leaning against a rock
    this.W.frostRock(B, px, pz, 0.28);
    B.add(SH.cyl6(), MD(px + fx * 0.25, 0, pz + fz * 0.25, V(-fx * 0.5, 1, -fz * 0.5).normalize(), 0.025, 0.85, 0.025), col('#c89868'));
    B.add(SH.cone(), MD(px + fx * 0.12 - ax * 0.2, 0.72, pz + fz * 0.12 - az * 0.2, V(ax, -0.25, az).normalize(), 0.04, 0.42, 0.04), col('#8a94a4'));
    px = s.x - ax * 1.4 - fx * 0.7; pz = s.z - az * 1.4 - fz * 0.7; // lantern on a stake
    if (this.W.walkable(px, pz)) { B.add(SH.cyl6(), M(px, 0, pz, 0.035, 1.25, 0.035), col('#6a4a34')); B.add(SH.cyl6(), MD(px, 1.2, pz, V(fx, 0, fz), 0.02, 0.3, 0.02), col('#6a4a34')); GL.add(SH.sph(), M(px + fx * 0.28, 0.98, pz + fz * 0.28, 0.1, 0.13, 0.1), null, (qx, qy, qz, nx, ny, nz, o) => o.set(Math.abs(qy - 0.98) > 0.1 ? '#4a4050' : '#ffe0a0')); this.HA.add(px + fx * 0.28, 0.98, pz + fz * 0.28, 1.4, '#ffd08a', 0.6, 1); this.light(px + fx * 0.3, 1.1, pz + fz * 0.3, '#ffd08a', 3.5, 5, 0.5); this.coll(px, pz, 0.12); }
    const c = this.put(A, 0.5, { near: [s.x, s.z] }); if (c) { this.W.crate(B, c.x, 0, c.z, c.face, 0.5); for (let i = 0; i < 4; i++) GL.add(SH.crys(), MD(c.x + (r() - 0.5) * 0.25, 0.45, c.z + (r() - 0.5) * 0.25, V((r() - 0.5) * 0.5, 1, (r() - 0.5) * 0.5).normalize(), 0.05, 0.2, 0.05, r()), col(this.pick(['#7af0ff', '#ff8ae0', '#c8a8ff']))); this.coll(c.x, c.z, 0.38); }
    this.coll(s.x + ax * 0.4, s.z + az * 0.4, 0.6);
  }
  crystal_extras(A) {
    const r = this.r, pool = ['cluster', 'frost', 'mounds', 'geodeS', 'stalag', 'cluster', 'column', 'column'];
    for (let i = 0, n = 3 + (A.cells.length > 70 ? 1 : 0); i < n; i++) {
      const k = this.pick(pool);
      if (k === 'cluster') { const p = this.put(A, 0.8, { minWd: 1 }); if (p) { this.W.crystalCluster(this.GL, p.x, p.z, this.pick(['#ff8ae0', '#7af0ff', '#c8a8ff']), 1.5 + r() * 0.7); this.coll(p.x, p.z, 0.45); } }
      else if (k === 'column') { const p = this.put(A, 0.7); if (p) this.crystalColumn(p.x, p.z); }
      else if (k === 'frost') { const p = this.put(A, 0.6); if (p) { this.W.frostRock(this.B, p.x, p.z, 0.4 + r() * 0.15); this.W.frostRock(this.B, p.x + 0.45, p.z + 0.2, 0.25); this.coll(p.x, p.z, 0.42); } }
      else if (k === 'mounds') { const p = this.put(A, 0.7, { collide: false }); if (p) this.W.snowMound(this.CL, p.x, p.z); }
      else if (k === 'geodeS') { const p = this.put(A, 0.5, { collide: false, minWd: 1 }); if (p) this.W.geode(this.B, this.GL, p.x, p.z, p.face); }
      else { const p = this.put(A, 0.5); if (p) { this.stalagmite(p.x, p.z, 1.2 + r() * 0.6, 0.28); this.coll(p.x, p.z, 0.25); } }
    }
    this.groundCover(A, 0.22, (x, z, lush, path, crack, acc) => this.crystalCover(x, z, acc));
  }
  crystalCover(x, z, acc) {
    const r = this.r, k = r();
    if (k < 0.35) { for (let i = 0, n = 2 + Math.floor(r() * 3); i < n; i++) this.W.ddPebble(this.CL, x + (r() - 0.5) * 0.5, z + (r() - 0.5) * 0.5, 0.05 + r() * 0.08, col('#6a5c9c'), '#e4ecff'); }
    else if (k < 0.6) this.W.ddSprouts(this.GL, x, z, 0.7 + r() * 0.5, this.pick(['#7af0ff', '#ff8ae0', '#c8a8ff', '#b8f4ff']));
    else if (k < 0.8) { for (let i = 0; i < 3; i++) this.CL.add(SH.crys(), MD(x + (r() - 0.5) * 0.4, 0, z + (r() - 0.5) * 0.4, V((r() - 0.5) * 2, 0.4, (r() - 0.5) * 2).normalize(), 0.03, 0.12, 0.03, r()), col('#dfe8ff')); } // fallen shards
    else this.CL.add(SH.hemiLo(), M(x, -0.02, z, 0.25 + r() * 0.2, 0.08 + r() * 0.05, 0.22 + r() * 0.15, 0, r() * TAU, 0), null, grad('#c8cef0', '#fbfcff', 0.9, 0.2));
  }
  // ---- crystal pieces
  crystalColumn(x, z) { // one tall faceted crystal pillar with a couple of leaning shards and a frost collar
    const GL = this.GL, r = this.r, cc = this.pick(['#7af0ff', '#ff8ae0', '#c8a8ff', '#b8f4ff']), h = 2.3 + r() * 1.1;
    GL.add(SH.crys(), MD(x, -0.15, z, V((r() - 0.5) * 0.12, 1, (r() - 0.5) * 0.12).normalize(), 0.3, h, 0.3, r() * TAU), null, (px, py, pz, nx, ny, nz, o, lx, ly) => o.copy(col(cc)).lerp(col('#ffffff'), clamp(ly * 0.55 + ny * 0.1)));
    for (let i = 0; i < 3; i++) { const a = r() * TAU; GL.add(SH.crys(), MD(x + Math.cos(a) * 0.3, -0.05, z + Math.sin(a) * 0.3, V(Math.cos(a) * 0.6, 1, Math.sin(a) * 0.6).normalize(), 0.13, 0.6 + r() * 0.6, 0.13, r() * TAU), col(i ? cc : '#ffffff')); }
    this.CL.add(SH.hemiLo(), M(x, -0.02, z, 0.62, 0.14, 0.55, 0, r() * TAU, 0), null, grad('#c8cef0', '#fbfcff', 0.9, 0.2));
    this.HA.add(x, h * 0.55, z, 2.6, cc, 0.35);
    this.coll(x, z, 0.38);
  }
  stalagmite(x, z, h, R) {
    const r = this.r, ph = r() * 9;
    this.B.add(X.spike(), M(x, -0.05, z, R, h, R * (0.85 + r() * 0.3), (r() - 0.5) * 0.1, r() * TAU, (r() - 0.5) * 0.1), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => { o.copy(col('#4e4284')).lerp(col('#8a7cc4'), clamp(ly * 1.2)); const fr = clamp((ly - 0.35) * 2.2) * (0.6 + 0.4 * Math.sin(Math.atan2(lx, lz) * 3 + ph)); o.lerp(col('#eef4ff'), clamp(fr + clamp(ny * 1.5 - 0.3) * 0.6)); });
    this.CL.add(SH.hemiLo(), M(x, -0.02, z, R * 1.7, 0.12, R * 1.6, 0, r() * TAU, 0), null, grad('#c8cef0', '#fbfcff', 0.9, 0.2));
  }
  snowman(x, z, face) { // yukidaruma: two snowballs, coal eyes, a carrot nose, a red bucket hat and twig arms
    const B = this.B, fx = Math.sin(face), fz = Math.cos(face), ax = Math.cos(face), az = -Math.sin(face);
    B.add(SH.sph(), M(x, 0.3, z, 0.34, 0.32, 0.34), null, grad('#d8def8', '#ffffff', 0.6, 0.4));
    B.add(SH.sph(), M(x, 0.78, z, 0.24, 0.23, 0.24), null, grad('#d8def8', '#ffffff', 0.6, 0.4));
    for (const e of [-1, 1]) B.add(SH.sphLo(), M(x + ax * e * 0.08 + fx * 0.21, 0.83, z + az * e * 0.08 + fz * 0.21, 0.03), col('#2a2430'));
    B.add(SH.cone(), MD(x + fx * 0.22, 0.77, z + fz * 0.22, V(fx, 0, fz), 0.035, 0.16, 0.035), col('#ff8a2a'));
    for (const e of [-1, 1]) B.add(SH.sphLo(), M(x + ax * e * 0.1 + fx * 0.2, 0.7, z + az * e * 0.1 + fz * 0.2, 0.035, 0.025, 0.025), col('#ffb0c8')); // rosy cheeks
    B.add(SH.taper(), M(x, 0.95, z, 0.16, 0.2, 0.16, -0.15, face, 0), col('#d8343a'));
    B.add(SH.torus(), M(x, 0.58, z, 0.22, 0.35, 0.22), col('#5a8ac8'));
    for (const e of [-1, 1]) B.add(SH.cyl6(), MD(x + ax * e * 0.28, 0.45, z + az * e * 0.28, V(ax * e, 0.7, az * e).normalize(), 0.015, 0.36, 0.015), col('#6a4a34'));
    this.coll(x, z, 0.36);
  }
  mineCart(x, z, face) {
    const B = this.B, GL = this.GL, r = this.r, ax = Math.cos(face), az = -Math.sin(face), fx = Math.sin(face), fz = Math.cos(face);
    B.add(SH.box(), M(x, 0.18, z, 0.95, 0.5, 0.66, 0, face, 0), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => { o.set('#8a6440'); if (Math.abs(ly - 0.2) < 0.06 || Math.abs(ly - 0.85) < 0.06) o.set('#4a4450'); if (ny > 0.9) o.set('#3a2a24'); });
    for (const e of [-1, 1]) for (const f of [-1, 1]) B.add(SH.cyl(), MD(x + ax * e * 0.3 + fx * f * 0.3, 0.16, z + az * e * 0.3 + fz * f * 0.3, V(fx * f, 0, fz * f), 0.14, 0.06, 0.14), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => o.set(Math.hypot(lx, lz) < 0.4 ? '#8a8a98' : '#3a3440'));
    for (let i = 0; i < 9; i++) { const lx = (r() - 0.5) * 0.7, lz = (r() - 0.5) * 0.45, c2 = this.pick(['#7af0ff', '#ff8ae0', '#c8a8ff', '#b8f4ff']); GL.add(SH.crys(), MD(x + ax * lx + fx * lz, 0.6, z + az * lx + fz * lz, V((r() - 0.5) * 0.8, 1, (r() - 0.5) * 0.8).normalize(), 0.07 + r() * 0.04, 0.25 + r() * 0.3, 0.07, r()), null, (px, py, pz, nx, ny, nz, o, lx2, ly) => o.copy(col(c2)).lerp(col('#ffffff'), clamp(ly * 0.6))); }
    this.HA.add(x, 0.9, z, 1.8, '#c8a8ff', 0.4);
  }
  // ---- burrow pieces
  logPaint(dx, dz) {
    return (px, py, pz, nx, ny, nz, o, lx, ly, lz) => {
      if (Math.abs(nx * dx + nz * dz) > 0.85) { o.copy(col('#e4bc88')).lerp(col('#b88a5a'), clamp(Math.hypot(lx, lz))); return; } // cut end
      o.copy(col('#6a4630')).lerp(col('#8e6444'), 0.5 + 0.5 * Math.sin(Math.atan2(lx, lz) * 7 + ly * 5));
      if (ny > 0.5) o.lerp(col(ny > 0.85 ? '#98bc68' : '#6e9a4a'), clamp((ny - 0.5) * 3.2));
    };
  }
  bigLog(x, z, ang, len, R) {
    const B = this.B, r = this.r, dx = Math.cos(ang), dz = Math.sin(ang), x0 = x - dx * len / 2, z0 = z - dz * len / 2;
    B.add(SH.cyl(), MD(x0, R * 0.9, z0, V(dx, 0, dz), R, len, R, r() * TAU), null, this.logPaint(dx, dz));
    B.add(SH.disc(), MD(x0 - dx * 0.01, R * 0.9, z0 - dz * 0.01, V(-dx, 0, -dz), R * 0.66, 0.03, R * 0.66), col('#2e2020')); // hollow end
    B.add(SH.rings(), MD(x0 + dx * (len + 0.004), R * 0.9, z0 + dz * (len + 0.004), V(dx, 0, dz), R * 0.97, 1, R * 0.97), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => { const rr = Math.hypot(lx, lz); o.copy(col(rr > 0.9 ? '#6a4630' : Math.round(rr * 4) % 2 ? '#c89868' : '#e8c490')); }); // growth rings on the sawn end
    for (let i = 0; i < 3; i++) { const t = 0.25 + i * 0.25 + (r() - 0.5) * 0.1, px = x0 + dx * len * t, pz = z0 + dz * len * t, side = i % 2 ? 1 : -1; // shelf fungus
      B.add(SH.hemi(), M(px - dz * side * R * 0.95, R * (0.7 + r() * 0.4), pz + dx * side * R * 0.95, 0.2, 0.07, 0.15, 0, Math.atan2(-dz * side, dx * side), 0), null, (qx, qy, qz, nx, ny, nz, o) => o.copy(col(i === 1 ? '#e89a5a' : '#f4d8a8')).multiplyScalar(ny > 0.2 ? 1 : 0.75)); }
    this.W.mushrooms(B, x + dx * len * 0.2, R * 1.75, z + dz * len * 0.2, '#e8604a', 0.55, null);
    const bt = 0.62, bx = x0 + dx * len * bt, bz = z0 + dz * len * bt; // broken branch stub
    B.add(SH.taper(), MD(bx, R * 1.5, bz, V(-dz * 0.4, 1, dx * 0.4).normalize(), 0.09, 0.55, 0.09), null, barkP());
    for (let i = 0; i < 6; i++) { const t = (i + 0.5) / 6, px = x0 + dx * len * t, pz = z0 + dz * len * t; this.CL.add(SH.sphLo(), M(px - dz * R * 0.5, R * 0.55 - 0.08 * (i % 2), pz + dx * R * 0.5, 0.12, 0.26, 0.05, 0, ang, 0), col('#6e9a4a')); } // moss drapes
    for (let d = R * 0.6; d < len; d += 0.85) this.coll(x0 + dx * d, z0 + dz * d, R + 0.05);
  }
  stump(x, z, s = 1, axe = false) {
    const B = this.B, r = this.r, bp = barkP();
    B.add(SH.taper(), M(x, 0, z, 0.42 * s, 0.5 * s, 0.42 * s, 0, r() * TAU, 0), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => { if (ny > 0.9) { o.copy(col('#e8c490')).lerp(col('#b8864e'), clamp(Math.hypot(lx, lz))); return; } bp(px, py, pz, nx, ny, nz, o); if (ny > 0.3) o.lerp(col('#7c9a5a'), 0.4); });
    B.add(SH.rings(), M(x, 0.503 * s, z, 0.29 * s, 1, 0.29 * s), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => { const rr = Math.hypot(lx, lz); o.copy(col(Math.round(rr * 4) % 2 ? '#c89868' : '#ecc894')); if (rr < 0.12) o.set('#a87444'); });
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + r() * 0.5; B.add(SH.cone(), MD(x + Math.cos(a) * 0.32 * s, 0.05, z + Math.sin(a) * 0.32 * s, V(Math.cos(a), -0.35, Math.sin(a)).normalize(), 0.12 * s, 0.34 * s, 0.1 * s), null, bp); }
    if (axe) {
      const a = r() * TAU, hx = x + Math.cos(a) * 0.08, hz = z + Math.sin(a) * 0.08, d = V(Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5).normalize();
      B.add(SH.cyl6(), MD(hx, 0.45 * s, hz, d, 0.025, 0.55, 0.025), col('#c89868'));
      B.add(SH.box(), M(x - Math.cos(a) * 0.02, 0.5 * s, z - Math.sin(a) * 0.02, 0.16, 0.12, 0.03, 0, -a, 0), null, (px, py, pz, nx, ny, nz, o) => o.set(py > 0.5 * s + 0.08 ? '#9aa4b0' : '#e8eef4'));
    } else this.W.mushrooms(B, x + 0.34 * s, 0, z + 0.2 * s, '#e8604a', 0.5, null);
    this.coll(x, z, 0.44 * s);
  }
  bigShroom(x, z, h, cap, glow) {
    const B = this.B, GL = this.GL, r = this.r, R = h * 0.42;
    B.add(SH.taper(), M(x, 0, z, h * 0.09, h, h * 0.09, (r() - 0.5) * 0.12, 0, (r() - 0.5) * 0.12), null, grad('#f0e0c8', '#fff8ec', 0.3, 0.6));
    (glow ? GL : B).add(SH.hemi(), M(x, h * 0.93, z, R, R * 0.68, R, (r() - 0.5) * 0.2, r() * TAU, (r() - 0.5) * 0.2), null, (qx, qy, qz, nx, ny, nz, o, lx, ly, lz) => { o.copy(col(cap)).multiplyScalar(0.8 + 0.25 * ny); if (ny > 0.35 && Math.sin(lx * 8.5) * Math.sin(lz * 8.5) > 0.55) o.set('#ffffff'); });
    B.add(SH.disc(), M(x, h * 0.9, z, R * 0.94, 0.03, R * 0.94), col('#f4dcc8'));
    if (glow) this.HA.add(x, h * 1.05, z, R * 3.2, cap, 0.35);
  }
  crop(b, x, z, kind) {
    const r = this.r;
    if (kind === 'carrot') { b.add(SH.cone(), M(x, -0.02, z, 0.05, 0.09, 0.05), col('#ff8a2a')); for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + r(); b.add(X.frond(), M(x, 0.05, z, 0.14, 0.2, 0.2, 0, a, 0), col(i % 2 ? '#5aa040' : '#7cc050')); } }
    else if (kind === 'turnip') { b.add(SH.sphLo(), M(x, 0.03, z, 0.09, 0.08, 0.09), null, (px, py, pz, nx, ny, nz, o) => o.copy(col('#f4ecf4')).lerp(col('#c8508a'), clamp(ny * 1.4 - 0.2))); for (let i = 0; i < 3; i++) b.add(SH.leaf(), M(x, 0.1, z, 0.16, 0.08, 0.16, 0.8, i / 3 * TAU + r(), 0), col('#6ab04c')); }
    else { for (let i = 0; i < 3; i++) b.add(SH.hemiLo(), M(x + (r() - 0.5) * 0.04, 0, z + (r() - 0.5) * 0.04, 0.17 - i * 0.04, 0.16 + i * 0.03, 0.17 - i * 0.04, (r() - 0.5) * 0.4, r() * TAU, 0), null, grad(i ? '#8ac860' : '#5a9a44', i ? '#c8f098' : '#8ac860', 0.6, 0.3)); }
  }
  scarecrow(x, z, face) {
    const B = this.B, r = this.r, tx = Math.cos(face), tz = -Math.sin(face);
    B.add(SH.cyl6(), M(x, 0, z, 0.045, 1.45, 0.045), col('#8a6440'));
    B.add(SH.cyl6(), MD(x - tx * 0.55, 1.05, z - tz * 0.55, V(tx, 0.06, tz).normalize(), 0.035, 1.1, 0.035), col('#8a6440'));
    B.add(SH.cone(), M(x, 0.62, z, 0.3, 0.55, 0.22, 0, face, 0), null, (px, py, pz, nx, ny, nz, o) => o.copy(col('#6a7ac8')).multiplyScalar(0.85 + 0.2 * ny)); // patched coat
    B.add(SH.sph(), M(x, 1.42, z, 0.2, 0.2, 0.19), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => { o.set('#e8d4a8'); const f = lx * Math.sin(face) + lz * Math.cos(face); if (f > 0.55 && Math.abs(ly - 0.15) < 0.12 && Math.abs(lx * Math.cos(face) - lz * Math.sin(face)) > 0.18) o.set('#3a2a2a'); });
    B.add(SH.disc(), M(x, 1.55, z, 0.34, 0.03, 0.34, 0.12, 0, 0.1), col('#e8c870'));
    B.add(SH.taper(), M(x, 1.56, z, 0.17, 0.2, 0.17), col('#d8b060'));
    B.add(SH.cyl6(), M(x, 1.58, z, 0.18, 0.04, 0.18), col('#c8504a'));
    for (const e of [-1, 1]) for (let i = 0; i < 3; i++) B.add(SH.cone(), MD(x + tx * e * 0.58, 1.05, z + tz * e * 0.58, V(tx * e * 0.5 + (r() - 0.5) * 0.4, -1, tz * e * 0.5).normalize(), 0.025, 0.2, 0.025), col('#e8c870')); // straw hands
    this.coll(x, z, 0.2);
  }
  wateringCan(x, z, a) {
    const B = this.CL;
    B.add(SH.cyl(), M(x, 0, z, 0.13, 0.22, 0.13), null, grad('#5a9ab8', '#8ac8e0', 0.5, 0.3));
    B.add(SH.cyl6(), MD(x + Math.cos(a) * 0.1, 0.08, z + Math.sin(a) * 0.1, V(Math.cos(a), 0.9, Math.sin(a)).normalize(), 0.025, 0.28, 0.025), col('#5a9ab8'));
    B.add(X.ringLo(), MD(x - Math.cos(a) * 0.03, 0.26, z - Math.sin(a) * 0.03, V(-Math.sin(a), 0, Math.cos(a)), 0.1, 0.1, 0.1), col('#4a88a8'));
  }
  basket(x, z, fill) {
    const B = this.CL, r = this.r;
    B.add(SH.cyl(), M(x, 0, z, 0.24, 0.2, 0.24), null, (px, py, pz, nx, ny, nz, o) => o.copy(col('#c89858')).multiplyScalar(Math.sin(py * 70) > 0 ? 1 : 0.8));
    B.add(X.ringLo(), MD(x, 0.2, z, V(1, 0, 0), 0.22, 0.22, 0.22), col('#a87a44'));
    for (let i = 0; i < 6; i++) { const a = r() * TAU, d = r() * 0.12; if (fill === 'carrot') B.add(SH.cone(), M(x + Math.cos(a) * d, 0.16, z + Math.sin(a) * d, 0.045, 0.24, 0.045, 1.2 * Math.cos(a), 0, 1.2 * Math.sin(a)), col('#ff8a2a')); else B.add(SH.sphLo(), M(x + Math.cos(a) * d, 0.21, z + Math.sin(a) * d, 0.07), col(this.pick(['#e0423a', '#8ac050', '#ffd24a']))); }
  }
  frog(x, z, a) {
    const B = this.CL;
    B.add(SH.disc(), M(x, 0.01, z, 0.22, 0.012, 0.22), col('#5eac4c'));
    B.add(SH.sphLo(), M(x, 0.08, z, 0.11, 0.08, 0.12, 0, a, 0), null, grad('#4a9a3a', '#8ad060', 0.7, 0.3));
    for (const e of [-1, 1]) { const ex = x + Math.cos(a) * e * 0.05 + Math.sin(a) * 0.07, ez = z - Math.sin(a) * e * 0.05 + Math.cos(a) * 0.07; B.add(SH.sphLo(), M(ex, 0.15, ez, 0.035), col('#fffaf0')); B.add(SH.sphLo(), M(ex + Math.sin(a) * 0.02, 0.16, ez + Math.cos(a) * 0.02, 0.018), col('#1a1a1a')); }
  }
  reeds(x, z) {
    const B = this.CL, r = this.r;
    for (let i = 0; i < 6; i++) {
      const px = x + (r() - 0.5) * 0.4, pz = z + (r() - 0.5) * 0.4, h = 0.6 + r() * 0.5, lx = (r() - 0.5) * 0.25, lz = (r() - 0.5) * 0.25;
      B.add(SH.cyl6(), M(px, 0, pz, 0.014, h, 0.014, lx, 0, lz), col('#5a8a3a'));
      if (i % 2 === 0) B.add(SH.cyl6(), M(px + lz * h * 0.9, h * 0.72, pz - lx * h * 0.9, 0.035, 0.18, 0.035, lx, 0, lz), col('#7a4a2a'));
      else B.add(X.frond(), M(px, 0, pz, 0.25, h * 0.8, 0.35, 0, r() * TAU, 0), col('#6a9a40'));
    }
  }
  acornCache(x, z) { // a heaped basket of acorns, a few rolled out, a big leaf
    const B = this.CL, r = this.r;
    B.add(SH.leaf(), M(x + 0.25, 0.005, z + 0.1, 0.4, 0.04, 0.4, 0, r() * TAU, 0), col('#b8804a'));
    B.add(SH.cyl(), M(x, 0, z, 0.26, 0.2, 0.26), null, (px, py, pz, nx, ny, nz, o) => o.copy(col('#c89858')).multiplyScalar(Math.sin(py * 70) > 0 ? 1 : 0.8));
    B.add(X.ringLo(), M(x, 0.2, z, 0.25, 0.25, 0.25), col('#a87a44'));
    const acorn = (ax, y, az, tl) => { const ry = r() * 3; B.add(SH.sphLo(), M(ax, y, az, 0.06, 0.075, 0.06, tl, ry, 0), col(this.pick(['#b07038', '#c08040', '#a06030']))); B.add(SH.hemiLo(), M(ax, y + 0.035, az, 0.066, 0.045, 0.066, tl, ry, 0), col('#6a4a2a')); };
    for (let i = 0; i < 12; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 0.17; acorn(x + Math.cos(a) * d, 0.2 + (0.17 - d) * 0.5, z + Math.sin(a) * d, (r() - 0.5) * 1.2); }
    for (let i = 0; i < 4; i++) { const a = r() * TAU, d = 0.35 + r() * 0.3; acorn(x + Math.cos(a) * d, 0.05, z + Math.sin(a) * d, 1.4); }
  }
  signpost(A, nx, nz) { // beside the nearest trail: a post with two arrow boards pointing along it
    const s = this.put(A, 0.45, { collide: false, nearLane: 1.3, near: [nx, nz], tries: 30 });
    if (!s) return;
    const B = this.B, r = this.r, { x, z } = s;
    B.add(SH.cyl6(), M(x, 0, z, 0.05, 1.3, 0.05, (r() - 0.5) * 0.06, 0, (r() - 0.5) * 0.06), null, grad('#6a4a34', '#9a7050', 0.2, 0.5));
    for (let i = 0; i < 2; i++) {
      const a = CAM + Math.PI / 2 + (i ? Math.PI * 0.9 : 0) + (r() - 0.5) * 0.5, y = 1.05 - i * 0.26;
      B.add(SH.box(), M(x + Math.sin(a) * 0.22, y, z + Math.cos(a) * 0.22, 0.08, 0.17, 0.46, (r() - 0.5) * 0.12, a, 0), null, (px, py, pz, nx, ny, nz, o, lx, ly, lz) => { o.set(i ? '#e8d4a8' : '#f4e0b0'); if (Math.abs(ly - 0.5) < 0.12 && Math.abs(lz) < 0.3 && Math.abs(nx * Math.cos(a) - nz * Math.sin(a)) > 0.8) o.set('#8a5a3a'); });
      B.add(SH.cone4(), M(x + Math.sin(a) * 0.47, y + 0.085, z + Math.cos(a) * 0.47, 0.13, 0.14, 0.04, Math.PI / 2, a, Math.PI / 4), col(i ? '#e8d4a8' : '#f4e0b0'));
    }
    B.add(SH.cone(), M(x, 1.3, z, 0.1, 0.1, 0.1), col('#6a4a34'));
    this.coll(x, z, 0.14);
  }
  surfaceRoots(A, n) { // roots crawling out of the wall foot, far across the floor, humping over the soil
    const W = this.W, r = this.r, id = A.rm.id, cand = [];
    for (const { S } of W.wallSamples) for (let i = 0; i < S.length; i += 3) { const s = S[i]; if (this.roomAt(s.x - s.nx * 0.8, s.z - s.nz * 0.8) === id) cand.push(s); }
    for (let k = 0; k < n && cand.length; k++) {
      const s = cand[Math.floor(r() * cand.length)], len = 2.6 + r() * 3.2;
      let dx = -s.nx, dz = -s.nz, x = s.x + s.nx * 0.15, z = s.z + s.nz * 0.15;
      const pts = [{ p: V(s.x + s.nx * 0.3, 0.42, s.z + s.nz * 0.3), r: 0.2 }];
      const R0 = 0.15 + r() * 0.05, steps = Math.ceil(len / 0.45); let ok = true;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps, turn = (r() - 0.5) * 0.7; const c = Math.cos(turn), sn = Math.sin(turn); [dx, dz] = [dx * c - dz * sn, dx * sn + dz * c];
        x += dx * 0.45; z += dz * 0.45;
        if (!W.walkable(x, z) || this.clear(x, z, 0, false) || this.puddle(x, z) || W.noClutterAt(x, z) || W.collision.solidAt(x, z, 0.05)) { ok = i > 3; break; }
        const hump = Math.max(0, Math.sin(t * Math.PI * (1.5 + r())) ) * 0.08;
        pts.push({ p: V(x, R0 * (1 - t * 0.7) * 0.4 + hump - 0.02, z), r: R0 * (1 - t * 0.75) });
      }
      if (!ok || pts.length < 4) continue;
      pts[pts.length - 1].p.y = -0.03;
      this.B.addGeo(tube(pts, 6, true), s.x, s.z, null, (px, py, pz, nx, ny, nz, o) => o.copy(col('#6a4630')).lerp(col('#a07a58'), clamp(ny * 0.5 + 0.35)).lerp(col('#7c9a5a'), clamp(ny * 2.2 - 1.7) * 0.7));
      if (pts.length > 6 && r() < 0.7) { // one side root
        const j = 2 + Math.floor(r() * (pts.length - 4)), p0 = pts[j].p, side = r() < 0.5 ? 1 : -1, bx = p0.x + dz * side * 0.9 + dx * 0.4, bz = p0.z - dx * side * 0.9 + dz * 0.4;
        if (W.walkable(bx, bz)) this.B.addGeo(tube([{ p: p0.clone(), r: pts[j].r * 0.7 }, { p: V((p0.x + bx) / 2, 0.06, (p0.z + bz) / 2), r: pts[j].r * 0.45 }, { p: V(bx, -0.03, bz), r: 0.02 }], 5, true), p0.x, p0.z, null, (px, py, pz, nx, ny, nz, o) => o.copy(col('#6a4630')).lerp(col('#a07a58'), clamp(ny * 0.5 + 0.35)));
      }
    }
  }
}
