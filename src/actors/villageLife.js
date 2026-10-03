// Village life coordinator shared by every Villager (lazily created as G.villageLife by the first villager update).
//  - Activity SLOTS derived from the real village (G.sim.list): bench seats, fountain rim, shop counters, browse spots,
//    veggie patches, flower beds, statues, notice board, wells, lanterns, hot spring, home yards, fishing banks.
//    A slot is claimed by one villager at a time; slots are rebuilt on 'village:changed' (claims carry over by id,
//    vanished slots are flagged dead so their user wraps up).
//  - NAV: a tile-grid A* (paths/plaza cheap, grass dearer, buildings/trees/water blocked; the search itself is the
//    shared GridAStar in core/nav.js) + string-pulling, so villagers stroll along the paths and around buildings
//    instead of sliding along walls. Throttled per frame.
//  - PROPS: tiny shared-geometry broom / watering can / fishing rod that villagers hold in rig.parts.handR.
//  - HOMES: homeFor(v) (townsfolk: the sim's house; named cast: HOME_PREF near their anchor), doorInfo(rec) (doorstep
//    outside the collider, doorway point, door-facing yaw) and the night "Knock on X's door" prompts (tuckIn/wakeUp).
//  - BENCH SEATS: seatSpot() places each sitter by body width (wide bodies scoot in or take the whole bench).
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { BUILDINGS } from '../world/buildings/index.js';
import { T, WORLD } from '../world/terrain.js';
import { paint, merge, xf, tube } from '../gfx/geom.js';
import { rand, TAU } from '../core/util.js';
import { GridAStar } from '../core/nav.js';
import { POND, riverX, LANDMARKS } from '../world/layout.js';

const NOCOL = new Set(['flowerBed', 'bridge', 'fence', 'park']); // walk-through (see VillageSim.spawnModel)
const BLOCK = 255;
const SEAT_TOP = 0.445; // bench seat height above its base
const SEAT_OFF = 0.29;  // default seat offset from the bench centre
const RIM_TOP = 0.37;   // fountain rim
// Named villagers' homes: building types to look for near their anchor, in order (their shop, a landmark, else the
// nearest cosy home). Townsfolk get their home from the sim (game.js).
const HOME_PREF = { rosie: ['rosieShop'], kuma: ['shop', 'home'], kitsune: ['shrine', 'home'], kero: ['fishingHut', 'home'] };
const _rc = new THREE.Raycaster(), _ro = new THREE.Vector3(), _rd = new THREE.Vector3();

// ------------------------------------------------------------------ navigation grid
class NavGrid {
  constructor(life) {
    this.life = life;
    const N = WORLD * WORLD;
    this.cost = new Uint8Array(N);       // 0 = unknown, BLOCK = solid, else cost*10
    this.astar = new GridAStar(WORLD, WORLD);
    this.dirty = true;
  }
  // raw cost of one tile (before the wall-clearance pass)
  tileBase(i, typeOf) {
    const L = this.life, world = L.world, x = i % WORLD, z = (i / WORLD) | 0, cx = x + 0.5, cz = z + 0.5;
    if (!world.walkable(cx, cz)) return BLOCK;
    const o = L.sim.occ[i], bt = o >= 0 ? typeOf.get(o) : null;
    if (bt && !NOCOL.has(bt)) return BLOCK;
    if (world.deckAt(cx, cz)) return 10;
    if (world.collision.solidAt(cx, cz, 0.12)) return BLOCK; // tree trunks, rocks, lamp posts
    const t = world.terrain.tiles[i];
    return t === T.PATH || t === T.PLAZA ? 10 : t === T.SAND ? 20 : 26;
  }
  // tiles next to solid ones cost a bit more, so routes keep a little clearance from walls
  finish(i) {
    const b = this.base, x = i % WORLD;
    if (b[i] === BLOCK) { this.cost[i] = BLOCK; return; }
    const near = (x > 0 && b[i - 1] === BLOCK) || (x < WORLD - 1 && b[i + 1] === BLOCK) || (i >= WORLD && b[i - WORLD] === BLOCK) || (i < WORLD * (WORLD - 1) && b[i + WORLD] === BLOCK);
    this.cost[i] = near ? Math.min(254, b[i] + 6) : b[i];
  }
  // full build the first time; afterwards only re-cost the neighbourhood of tiles whose building / ground changed
  rebuild() {
    const L = this.life, occ = L.sim.occ, tiles = L.world.terrain.tiles, N = WORLD * WORLD;
    const typeOf = new Map(); for (const b of L.sim.S.buildings) typeOf.set(b.idx, b.type);
    if (!this.base) this.base = new Uint8Array(N);
    let changed = null;
    if (this.occ0) {
      changed = [];
      for (let i = 0; i < N; i++) if (occ[i] !== this.occ0[i] || tiles[i] !== this.tiles0[i]) { changed.push(i); if (changed.length > 1500) { changed = null; break; } }
      if (changed && this.touched) for (const i of this.touched) changed.push(i);
    }
    this.touched = null;
    if (!changed) {
      for (let i = 0; i < N; i++) this.base[i] = this.tileBase(i, typeOf);
      for (let i = 0; i < N; i++) this.finish(i);
      this.occ0 = occ.slice(); this.tiles0 = tiles.slice();
    } else if (changed.length) {
      const touched = new Set();
      for (const i of changed) {
        const x = i % WORLD, z = (i / WORLD) | 0;
        for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
          const xx = x + dx, zz = z + dz; if (xx < 0 || zz < 0 || xx >= WORLD || zz >= WORLD) continue;
          const j = zz * WORLD + xx; if (touched.has(j)) continue; touched.add(j); this.base[j] = this.tileBase(j, typeOf);
        }
      }
      for (const j of touched) { this.finish(j); if (j % WORLD > 0) this.finish(j - 1); if (j % WORLD < WORLD - 1) this.finish(j + 1); if (j >= WORLD) this.finish(j - WORLD); if (j < N - WORLD) this.finish(j + WORLD); }
      this.occ0.set(occ); this.tiles0.set(tiles);
    }
    this.dirty = false;
  }
  // colliders changed without the tiles changing (a plot's yard fences): re-cost these tiles on the next rebuild
  touchRect(x0, z0, x1, z1) {
    const t = this.touched ||= [];
    for (let z = Math.max(0, Math.floor(z0)); z <= Math.min(WORLD - 1, Math.floor(z1)); z++) for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(WORLD - 1, Math.floor(x1)); x++) t.push(z * WORLD + x);
    this.dirty = true;
  }
  blocked(x, z) { if (x < 0 || z < 0 || x >= WORLD || z >= WORLD) return true; return this.cost[z * WORLD + x] === BLOCK; }
  costAt(x, z) { return this.cost[Math.floor(z) * WORLD + Math.floor(x)]; }
  // A* from (sx,sz) to (tx,tz) in world units. Returns a flat [x0,z0,x1,z1,...] waypoint list (ends at the exact
  // target) or null. Start / goal tiles may be solid (standing beside a building, a bench seat).
  find(sx, sz, tx, tz, maxNodes = 24000) {
    if (this.dirty) this.rebuild();
    const W = WORLD, cost = this.cost;
    const s = (Math.floor(sz) * W + Math.floor(sx)) | 0, goal = (Math.floor(tz) * W + Math.floor(tx)) | 0;
    if (s < 0 || goal < 0 || s >= W * W || goal >= W * W) return null;
    if (s === goal) return [tx, tz];
    const tiles = this.astar.search(cost, s, goal, maxNodes, 10, false, 1.15);
    if (!tiles) return null;
    // string-pull: keep a waypoint only where a straight shot would leave cheap tiles or hit something solid
    const pts = [sx, sz]; let a = 0;
    const cx = n => (n % W) + 0.5, cz = n => ((n / W) | 0) + 0.5;
    while (a < tiles.length - 1) {
      let b = tiles.length - 1;
      for (; b > a + 1; b--) {
        let maxC = 0; for (let k = a; k <= b; k++) { const c = cost[tiles[k]]; if (c !== BLOCK && c > maxC) maxC = c; }
        if (this.clear(a === 0 ? sx : cx(tiles[a]), a === 0 ? sz : cz(tiles[a]), cx(tiles[b]), cz(tiles[b]), maxC, goal)) break;
      }
      if (b < tiles.length - 1) pts.push(cx(tiles[b]), cz(tiles[b]));
      a = b;
    }
    pts.push(tx, tz);
    pts.splice(0, 2); // drop the start point
    return pts;
  }
  clear(ax, az, bx, bz, maxC, goal) {
    if (this.dirty) this.rebuild();
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.3);
    for (let i = 1; i < n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, idx = Math.floor(z) * WORLD + Math.floor(x);
      const c = this.cost[idx];
      if (idx === goal) continue;
      if (c === BLOCK || c > maxC) return false;
    }
    return true;
  }
  // a random cheap (path/plaza) tile within r of (x, z), or null
  randomPathNear(x, z, r, tries = 14) {
    for (let i = 0; i < tries; i++) {
      const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * r;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      const tx = Math.floor(px), tz = Math.floor(pz);
      if (tx < 1 || tz < 1 || tx >= WORLD - 1 || tz >= WORLD - 1) continue;
      if (this.cost[tz * WORLD + tx] <= 10 && this.cost[tz * WORLD + tx] > 0) return { x: tx + 0.5 + rand(-0.3, 0.3), z: tz + 0.5 + rand(-0.3, 0.3) };
    }
    return null;
  }
}

// ------------------------------------------------------------------ props (shared geometry, drawn with the owner's rig material)
let PROP_GEO = null;
const col = hex => new THREE.Color(hex);
function solidC(g, hex) { const c = col(hex); return paint(g, (p, n, o) => o.copy(c)); }
function buildProps() {
  // broom: handle along -y from the grip, straw head at the bottom (grip at the origin)
  const handle = solidC(xf(new THREE.CylinderGeometry(0.02, 0.022, 0.62, 7), { p: [0, -0.27, 0] }), '#c98f5e');
  const knob = solidC(xf(new THREE.SphereGeometry(0.028, 8, 6), { p: [0, 0.04, 0] }), '#c98f5e');
  const straw = paint(xf(new THREE.CylinderGeometry(0.03, 0.12, 0.24, 10, 1), { p: [0, -0.64, 0], s: [1, 1, 0.55] }), (p, n, o) => o.set('#f6d470').lerp(col('#d8a040'), Math.max(0, Math.min(1, (-p.y - 0.6) * 4))));
  const band = solidC(xf(new THREE.TorusGeometry(0.045, 0.014, 5, 12), { p: [0, -0.55, 0], r: [Math.PI / 2, 0, 0], s: [1, 0.55, 1] }), '#e8503a');
  const broom = merge([handle, knob, straw, band]);
  // watering can: body + spout (+z) + handle; grip at the origin (top handle)
  const body = paint(xf(new THREE.CylinderGeometry(0.1, 0.11, 0.17, 14), { p: [0, -0.12, 0] }), (p, n, o) => o.set('#8fd0ff').lerp(col('#5aa0e8'), Math.max(0, -n.y * 0.5 + 0.2)));
  const lid = solidC(xf(new THREE.CylinderGeometry(0.07, 0.1, 0.035, 14), { p: [0, -0.02, 0] }), '#bfe6ff');
  const spout = solidC(xf(new THREE.CylinderGeometry(0.016, 0.026, 0.24, 7), { p: [0, -0.08, 0.17], r: [1.0, 0, 0] }), '#5aa0e8');
  const rose = solidC(xf(new THREE.CylinderGeometry(0.042, 0.022, 0.045, 10), { p: [0, -0.01, 0.265], r: [1.0, 0, 0] }), '#ffcf4a');
  const grip = solidC(xf(new THREE.TorusGeometry(0.065, 0.015, 5, 12, Math.PI), { p: [0, -0.03, -0.02], r: [0, Math.PI / 2, 0] }), '#5aa0e8');
  const dot = solidC(xf(new THREE.SphereGeometry(0.03, 8, 6), { p: [0, -0.12, 0.1], s: [1, 1, 0.4] }), '#ffffff');
  const can = merge([body, lid, spout, rose, grip, dot]);
  // fishing rod: grip at the origin, rod along +z (tip at z = 1.05), cork handle + reel
  const rod = solidC(xf(new THREE.CylinderGeometry(0.01, 0.02, 1.1, 6), { p: [0, 0, 0.47], r: [Math.PI / 2, 0, 0] }), '#c8a868');
  const cork = solidC(xf(new THREE.CylinderGeometry(0.026, 0.026, 0.18, 8), { p: [0, 0, -0.02], r: [Math.PI / 2, 0, 0] }), '#b86a4a');
  const reel = solidC(xf(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10), { p: [0, -0.04, 0.07], r: [0, 0, Math.PI / 2] }), '#e8503a');
  const rodG = merge([rod, cork, reel]);
  const bob = paint(new THREE.SphereGeometry(0.05, 10, 8), (p, n, o) => o.set(p.y > 0 ? '#ff5a5a' : '#ffffff'));
  PROP_GEO = { broom, can, rod: rodG, bobber: bob };
}
export function propGeo(kind) { if (!PROP_GEO) buildProps(); return PROP_GEO[kind]; }
// Nightcap for a villager woken by a knock: a striped cone that flops over to one side, a fluffy brim and a pom-pom.
// Origin = the head's hat anchor (top of the head); one cached geometry per colour.
const CAPS = new Map();
export function nightcapGeo(color = '#8fb8ff') {
  let g = CAPS.get(color); if (g) return g;
  const main = col(color), cream = col('#fff6e8');
  const curve = new THREE.CatmullRomCurve3([[0, -0.03, 0], [0.01, 0.12, -0.01], [0.05, 0.25, -0.03], [0.15, 0.31, -0.05], [0.25, 0.25, -0.06], [0.29, 0.13, -0.06]].map(a => new THREE.Vector3(...a)));
  const N = 20, RAD = 14, pts = [];
  for (let i = 0; i <= N; i++) { const u = i / N; pts.push({ p: curve.getPoint(u), r: 0.235 * Math.pow(1 - u, 1.25) + 0.022 }); }
  const cone = paint(tube(pts, RAD, true), (p, n, o, i) => o.copy(Math.floor(i / (RAD + 1)) % 5 >= 3 ? cream : main));
  const brim = paint(xf(new THREE.TorusGeometry(0.235, 0.05, 8, 22), { p: [0, -0.03, 0], r: [Math.PI / 2, 0, 0], s: [1, 1, 0.8] }), (p, n, o) => o.copy(cream).multiplyScalar(0.94 + 0.06 * n.y));
  const pom = paint(xf(new THREE.IcosahedronGeometry(0.06, 1), { p: [0.3, 0.1, -0.06] }), (p, n, o) => o.copy(cream));
  g = merge([cone, brim, pom]);
  CAPS.set(color, g);
  return g;
}
export const ROD_TIP = new THREE.Vector3(0, 0, 1.02);
export const CAN_SPOUT = new THREE.Vector3(0, -0.01, 0.285);
export const BROOM_HEAD = new THREE.Vector3(0, -0.74, 0);

// ------------------------------------------------------------------ coordinator
export class VillageLife {
  static get(G) {
    if (G.villageLife) return G.villageLife;
    if (!G.sim || !G.sim.world?.collision || !G.npcs) return null;
    G.villageLife = new VillageLife(G);
    return G.villageLife;
  }
  constructor(G) {
    this.G = G; this.sim = G.sim; this.world = G.sim.world;
    this.nav = new NavGrid(this);
    this.slots = []; this.byKind = new Map();
    this.dirty = true;
    this.frameT = -1; this.budget = 0;
    this.born = performance.now();
    this.fishSpots = null;
    this.ver = 0;               // bumped by every slot rebuild (villagers re-resolve their homes)
    this.doorCache = new Map(); // building record -> doorstep info
    this.knocks = new Map();    // building record -> { inter, who: Set<Villager> } for residents tucked in at night
    this.stats = { paths: 0, pathMs: 0, rebuilds: 0, navMs: 0 };
    this.onChanged = () => { this.dirty = true; this.nav.dirty = true; };
    Events.on('village:changed', this.onChanged);
  }
  // once per frame (the first villager to update calls it): refresh budgets, rebuild slots after village edits
  frame() {
    const t = this.G.engine?.time ?? performance.now() / 1000;
    if (t === this.frameT) return;
    this.frameT = t; this.budget = 2;
    if (this.sim.list.length !== this.lastLen) this.dirty = this.nav.dirty = true;
    if (this.dirty) this.rebuild();
  }
  warmup() { return performance.now() - this.born < 6000; }
  // ---- pathfinding (budgeted: a villager that gets null + busy=true simply retries next frame)
  path(sx, sz, tx, tz) {
    if (this.budget <= 0) return { busy: true };
    this.budget--;
    const t0 = performance.now();
    if (this.nav.dirty) { this.nav.rebuild(); this.stats.navMs = performance.now() - t0; this.stats.rebuilds++; }
    const p = this.nav.find(sx, sz, tx, tz);
    this.stats.paths++; this.stats.pathMs += performance.now() - t0;
    return { pts: p };
  }
  // ---- slots
  rebuild() {
    this.dirty = false; this.lastLen = this.sim.list.length;
    this.ver++; this.doorCache.clear();
    for (const [rec, k] of this.knocks) if (!this.sim.list.includes(rec)) { this.dropKnock(k); this.knocks.delete(rec); }
    const old = new Map(this.slots.map(s => [s.id, s]));
    const out = [];
    const W = this.world, col = W.collision;
    const free = (x, z, r = 0.3) => W.walkable(x, z) && !col.solidAt(x, z, r);
    for (const rec of this.sim.list) {
      const b = rec.data, type = b.type, def = BUILDINGS[type]; if (!def) continue;
      const p = this.sim.worldPos(b), th = -b.rot * Math.PI / 2, c = Math.cos(th), s = Math.sin(th);
      const L = (lx, lz) => ({ x: p.x + lx * c + lz * s, z: p.z - lx * s + lz * c });
      const fx = s, fz = c; // building front (+z local) in world
      let n = 0; // per-building slot counter (stable ids across rebuilds)
      // stand spot: start at local (lx,lz) and walk outward (along the front, or away from the centre) until free
      const stand = (lx, lz, face, kind, extra = {}) => {
        let q = L(lx, lz); let dx = q.x - p.x, dz = q.z - p.z; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
        for (let i = 0; i < 10 && !free(q.x, q.z); i++) { q.x += dx * 0.12; q.z += dz * 0.12; }
        if (!free(q.x, q.z)) return;
        out.push({ id: `${b.id}:${kind}:${n++}`, kind, x: q.x, z: q.z, face, rec, ...extra });
      };
      // a bench (local position + rotation inside this building; w = seat length). Two seat slots at ±SEAT_OFF; the
      // exact spot along the seat is worked out per villager at claim time (seatSpot: wide bodies scoot inward, very
      // wide ones take the middle of the whole bench), so nobody hangs off the end or sits in a neighbour's lap.
      const bench = (bx, bz, brot, y0, key, w = 0.95) => {
        const bc = Math.cos(brot), bs = Math.sin(brot), pair = [];
        const mid = L(bx + -0.05 * bs, bz + -0.05 * bc);
        for (const sx of [-SEAT_OFF, SEAT_OFF]) {
          const seat = L(bx + sx * bc + -0.05 * bs, bz - sx * bs + -0.05 * bc), app = L(bx + sx * bc + 0.62 * bs, bz - sx * bs + 0.62 * bc);
          if (!free(app.x, app.z, 0.26)) continue;
          const sl = {
            id: `${b.id}:seat:${key}:${sx}`, kind: 'bench', x: seat.x, z: seat.z, ax: app.x, az: app.z, face: th + brot, seatY: p.y + y0 + SEAT_TOP, rec, pair: null,
            bx: mid.x, bz: mid.z, ux: (seat.x - mid.x) / SEAT_OFF, uz: (seat.z - mid.z) / SEAT_OFF, aox: app.x - seat.x, aoz: app.z - seat.z, half: w / 2,
          };
          pair.push(sl); out.push(sl);
        }
        if (pair.length === 2) { pair[0].pair = pair[1]; pair[1].pair = pair[0]; }
      };
      const [w, d] = this.sim.dims(type, b.rot, b.level), hw = (b.rot % 2 ? d : w) / 2, hd = (b.rot % 2 ? w : d) / 2; // local half extents
      switch (type) {
        case 'bench': bench(0, 0, 0, 0, 'b', 0.95); break;
        case 'park': bench(0.55, -0.85, 0, 0.05, 'p1', 1.0); bench(-1.0, 0.55, Math.PI / 2, 0.05, 'p2', 0.9); stand(0.55, 0.1, th + Math.PI, 'admire'); break;
        case 'fountain': {
          // rim seats on the camera side (faces read from the default +x+z view), admirers on the far side
          const cam = Math.PI / 4;
          for (const [i, a] of [[0, cam - 0.95], [1, cam + 0.95], [2, cam]]) {
            const dx = Math.sin(a), dz = Math.cos(a);
            const ax = p.x + dx * 1.55, az = p.z + dz * 1.55;
            if (free(ax, az, 0.26)) out.push({ id: `${b.id}:rim:${i}`, kind: 'rim', x: p.x + dx * 0.94, z: p.z + dz * 0.94, ax, az, face: a, seatY: p.y + RIM_TOP, rec, pair: null });
          }
          for (const [i, a] of [[0, cam + Math.PI - 0.55], [1, cam + Math.PI + 0.55]]) {
            const x = p.x + Math.sin(a) * 1.5, z = p.z + Math.cos(a) * 1.5;
            if (free(x, z)) out.push({ id: `${b.id}:admire:${i}`, kind: 'admire', x, z, face: a + Math.PI, rec, look: 0.5 });
          }
          break;
        }
        case 'koiStatue': case 'chewyStatue': case 'miniTorii': case 'sakuraPlanter':
          stand(0, hd + 0.55, th + Math.PI, 'admire', { look: type === 'sakuraPlanter' ? 0.8 : 0.4 }); break;
        case 'flowerBed': stand(0, hd + 0.35, th + Math.PI, 'garden'); break;
        case 'farm':
          for (const lx of [-0.7, 0.7]) stand(lx, hd + 0.2, th + Math.PI, 'farm');
          for (const sx of [-1, 1]) stand(sx * (hw + 0.2), 0.2, th - sx * Math.PI / 2, 'farm');
          break;
        case 'shop': {
          const dp = rec.door;
          const lx = (dp.x - p.x) * c - (dp.z - p.z) * s, lz = (dp.x - p.x) * s + (dp.z - p.z) * c;
          // shopkeeper at the front corner, turned a little toward the customers
          stand(lx - 0.75, lz + 0.3, th + 0.35, 'counter');
          for (const sx of [-0.2, 0.75]) stand(lx + sx, lz + 1.4, th + Math.PI, 'browse');
          stand(lx + 1.1, lz + 0.8, th + Math.PI / 2, 'sweep');
          break;
        }
        case 'rosieShop': {
          const dp = rec.door;
          const lx = (dp.x - p.x) * c - (dp.z - p.z) * s, lz = (dp.x - p.x) * s + (dp.z - p.z) * c;
          stand(lx - 0.6, lz + 1.5, th + Math.PI, 'browse');
          break;
        }
        case 'home': {
          const dp = rec.door;
          const lx = (dp.x - p.x) * c - (dp.z - p.z) * s, lz = (dp.x - p.x) * s + (dp.z - p.z) * c;
          stand(lx + 0.7, lz + 0.7, th + Math.PI / 2, 'sweep', { home: dp });
          break;
        }
        case 'lumber': case 'kiln': case 'townHall': case 'dungeonGate': case 'shrine': case 'clinic': case 'school': {
          const dp = rec.door;
          const lx = (dp.x - p.x) * c - (dp.z - p.z) * s, lz = (dp.x - p.x) * s + (dp.z - p.z) * c;
          stand(lx + (type === 'townHall' ? 1.8 : 0.9), lz + 0.9, th + Math.PI / 2, 'sweep');
          if (type === 'shrine') stand(lx, lz + 0.6, th + Math.PI, 'admire', { look: -0.1 });
          break;
        }
        case 'well': stand(0, hd + 0.3, th + Math.PI, 'well'); break;
        case 'bulletinBoard': for (const sx of [-0.3, 0.3]) stand(sx, hd + 0.45, th + Math.PI, 'board'); break;
        case 'stoneLantern': case 'streetLamp': stand(0.2, hd + 0.45, th + Math.PI, 'lantern'); break;
        case 'onsen': for (let i = 0; i < 3; i++) out.push({ id: `${b.id}:onsen:${i}`, kind: 'onsen', x: rec.door.x + fx * 0.5, z: rec.door.z + fz * 0.5, face: th + Math.PI, rec }); break;
        default: break;
      }
    }
    for (const f of this.fishing()) out.push(f);
    // carry claims over; flag vanished slots
    for (const sl of out) {
      const o = old.get(sl.id), v = o?.by; if (!v) continue;
      sl.by = v; sl.spot = o.spot || null;
      if (v.act?.slot === o) v.act.slot = sl;
      if (v.goal?.slot === o) v.goal.slot = sl;
    }
    const keep = new Set(out.map(s => s.id));
    for (const o of this.slots) if (!keep.has(o.id)) o.dead = true;
    this.slots = out;
    this.byKind.clear();
    for (const sl of out) { let a = this.byKind.get(sl.kind); if (!a) this.byKind.set(sl.kind, a = []); a.push(sl); }
  }
  // water's-edge spots near the village (pond, river, shore), computed once
  fishing() {
    if (this.fishSpots) return this.fishSpots;
    const W = this.world, ter = W.terrain, B = LANDMARKS.bridgeW;
    const cands = [];
    // search boxes by landmark: the koi pond (three spots) and the river banks up- and downstream of the bridge (two)
    const boxes = [{ x0: POND.x - POND.r - 5, x1: POND.x + POND.r + 5, z0: POND.z - POND.r - 5, z1: POND.z + POND.r + 5, n: 3, cx: POND.x, cz: POND.z }];
    for (const dz of [-14, 12]) { const z = B.z + dz, x = riverX(z); boxes.push({ x0: x - 9, x1: x + 9, z0: z - 6, z1: z + 6, n: 1, cx: x, cz: z }); }
    for (const bx of boxes) for (let z = Math.floor(bx.z0); z < bx.z1; z++) for (let x = Math.floor(bx.x0); x < bx.x1; x++) {
      const cx = x + 0.5, cz = z + 0.5;
      if (!W.walkable(cx, cz) || W.collision.solidAt(cx, cz, 0.35) || W.deckAt(cx, cz)) continue;
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * TAU, dx = Math.sin(a), dz = Math.cos(a);
        if (ter.heightAt(cx + dx * 1.2, cz + dz * 1.2) > -0.05 || ter.heightAt(cx + dx * 2.2, cz + dz * 2.2) > -0.05) continue;
        // walk to the bank edge
        let ex = cx, ez = cz;
        for (let i = 0; i < 8 && W.walkable(ex + dx * 0.15, ez + dz * 0.15) && !W.collision.solidAt(ex + dx * 0.15, ez + dz * 0.15, 0.3); i++) { ex += dx * 0.15; ez += dz * 0.15; }
        ex -= dx * 0.2; ez -= dz * 0.2;
        cands.push({ x: ex, z: ez, face: a, d: Math.random(), box: bx });
        break;
      }
    }
    cands.sort((a, b) => a.d - b.d);
    const out = [], per = new Map();
    for (const c of cands) {
      if ((per.get(c.box) || 0) >= c.box.n) continue;
      if (out.some(o => Math.hypot(o.x - c.x, o.z - c.z) < 5)) continue;
      per.set(c.box, (per.get(c.box) || 0) + 1);
      out.push({ id: `fish:${out.length}`, kind: 'fish', x: c.x, z: c.z, face: c.face, bobX: c.x + Math.sin(c.face) * 1.7, bobZ: c.z + Math.cos(c.face) * 1.7 });
    }
    return (this.fishSpots = out);
  }
  // best free slot of a kind for villager v (distance-weighted random; owners of a home prefer their own yard)
  claim(v, kind, near, maxD = 34, teleport = false) {
    const list = this.byKind.get(kind); if (!list) return null;
    let best = null, bs = -1, bspot = null;
    for (const sl of list) {
      if (sl.by || sl.dead) continue;
      const d = Math.hypot(sl.x - near.x, sl.z - near.z); if (d > maxD) continue;
      const spot = sl.half ? this.seatSpot(v, sl) : null;
      if (sl.half && !spot) continue; // no room for this body on that bench
      let sc = Math.random() / (1 + d / 7);
      if (sl.home && v.home && Math.hypot(sl.home.x - v.home.x, sl.home.z - v.home.z) < 0.5) sc *= 6;
      else if (sl.home && v.home) sc *= 0.3; // somebody else's yard
      if (sl.kind === 'bench' && sl.pair?.by) sc *= teleport ? 1.5 : 2.5; // sit next to someone: a chance to chat
      if (sc > bs) { bs = sc; best = sl; bspot = spot; }
    }
    if (best) this.take(best, v, bspot);
    return best;
  }
  take(sl, v, spot) {
    sl.by = v; sl.spot = spot || null;
    if (spot?.whole && sl.pair) { sl.pair.by = v; sl.pair.spot = null; } // centred: the whole bench is ours
  }
  release(sl, v) {
    if (!sl) return;
    if (sl.by === v) { sl.by = null; sl.spot = null; }
    if (sl.pair?.by === v) { sl.pair.by = null; sl.pair.spot = null; }
  }
  // ---- bench seating that respects body width (SPECIES body/head size varies a lot: a frog's head is ~1.4x a cat's)
  // Returns { x, z, ax, az, off, whole } for villager v on bench slot sl, or null when it doesn't fit next to the
  // current neighbour. off = distance from the bench centre toward this slot's end.
  seatSpot(v, sl) {
    if (!sl.half) return null;
    const hw = v.halfWidth?.() ?? 0.24, reach = sl.half + 0.02; // heads may just reach the bench end, not past it
    const nb = sl.pair?.by && sl.pair.by !== v ? sl.pair.by : null;
    const at = (off, whole = false) => {
      const x = sl.bx + sl.ux * off, z = sl.bz + sl.uz * off;
      return { x, z, ax: x + sl.aox, az: z + sl.aoz, off, whole };
    };
    if (!nb) {
      if (hw >= 0.28) return sl.pair && sl.pair.by ? null : at(0, !!sl.pair); // very wide: one per bench, centred
      return at(Math.min(SEAT_OFF, reach - hw));
    }
    const ns = sl.pair.spot, noff = ns ? ns.off : SEAT_OFF;
    if (ns?.whole || hw >= 0.28) return null;
    const off = Math.min(SEAT_OFF, reach - hw), nhw = nb.halfWidth?.() ?? 0.24;
    if (off + noff < hw + nhw - 0.1) return null; // shoulders would overlap
    return at(off);
  }
  // ---- homes & doors
  // building record a villager lives in: townsfolk by their door point (the sim gives it), named villagers by HOME_PREF
  homeFor(v) {
    const list = this.sim.list;
    if (v.homeRec && list.includes(v.homeRec)) return v.homeRec;
    if (v.folk || (v.home && v.homeFixed)) {
      if (!v.home) return null;
      let best = null, bd = 2.5;
      for (const r of list) { const d = Math.hypot(r.door.x - v.home.x, r.door.z - v.home.z); if (d < bd && (r.data.type === 'home' || d < 0.3)) { bd = d; best = r; } }
      return best;
    }
    const prefs = HOME_PREF[v.id] || ['home'];
    const a = v.anchor;
    for (const t of prefs) {
      let best = null, bs = Infinity;
      for (const r of list) {
        if (r.data.type !== t || !this.doorInfo(r)) continue;
        let s = Math.hypot(r.door.x - a.x, r.door.z - a.z);
        for (const n of this.G.npcs) if (n !== v && !n.folk && n.homeRec === r) s += 7; // spread the cast over the houses
        if (s < bs) { bs = s; best = r; }
      }
      if (best && (t === 'home' || bs < 26)) return best;
    }
    return null;
  }
  // doorstep (outside the building's collider, where villagers walk to), the doorway point they step into, and the
  // yaw that faces the door. Cached per building until the next slot rebuild.
  doorInfo(rec) {
    let D = this.doorCache.get(rec);
    if (D !== undefined) return D;
    const W = this.world, col = W.collision, th = -rec.data.rot * Math.PI / 2, fx = Math.sin(th), fz = Math.cos(th);
    const dp = rec.door;
    // nearest free spot in front of the door (straight out first; a little to the side if a fence / neighbour is in the way)
    let sx = 0, sz = 0, best = Infinity;
    for (const lat of [0, 0.3, -0.3, 0.6, -0.6]) {
      for (let k = 0; k < 2.2; k += 0.08) {
        const x = dp.x + fx * k - fz * lat, z = dp.z + fz * k + fx * lat;
        if (col.solidAt(x, z, 0.3)) continue;
        const x2 = x + fx * 0.06, z2 = z + fz * 0.06, cost = k + Math.abs(lat) * 1.5;
        if (cost < best && W.walkable(x2, z2) && !col.solidAt(x2, z2, 0.28)) { best = cost; sx = x2; sz = z2; }
        break;
      }
      if (best < 0.9) break;
    }
    if (best === Infinity) { this.doorCache.set(rec, null); return null; }
    // how far behind the door point the actual door / wall is: a couple of short rays at hip and chest height
    // (probed once per building record: the model never changes, only what stands around it)
    let wall = rec._doorWall ?? -1;
    const g = rec.group;
    if (wall < 0 && g && Math.abs(g.scale.y - 1) < 1e-3) {
      g.updateMatrixWorld(true);
      const y0 = W.heightAt(dp.x, dp.z);
      for (const h of [0.55, 0.95]) {
        _ro.set(dp.x + fx * 0.25, y0 + h, dp.z + fz * 0.25); _rd.set(-fx, 0, -fz);
        _rc.set(_ro, _rd); _rc.far = 2.6;
        const hit = _rc.intersectObject(g, true).find(i => i.object.isMesh && !i.object.material?.transparent);
        if (hit) wall = Math.max(wall, hit.distance - 0.25);
      }
      rec._doorWall = wall = wall < 0 ? 0.5 : wall;
    }
    if (wall < 0) wall = 0.5; // (still rising after placement: keep a sane default, re-probed next rebuild)
    wall = Math.min(1.6, Math.max(0.1, wall));
    D = {
      rec, fx, fz, face: Math.atan2(-fx, -fz),
      step: { x: sx, z: sz },
      // the doorway: just past the door plane, so the far half of the body is already behind the wall
      inner: { x: dp.x - fx * (wall + 0.12), z: dp.z - fz * (wall + 0.12) },
      door: { x: dp.x - fx * wall, z: dp.z - fz * wall },
    };
    this.doorCache.set(rec, D);
    return D;
  }
  // residents tucked in for the night: Chewy can knock on their door (one prompt per door, named villagers answer first)
  tuckIn(v, rec) {
    if (!rec || rec.inter || rec.data.type === 'rosieShop') return; // shops / services keep their own door prompt
    const D = this.doorInfo(rec); if (!D) return;
    let k = this.knocks.get(rec);
    if (!k) {
      const pos = new THREE.Vector3(D.step.x, this.world.heightAt(D.step.x, D.step.z), D.step.z);
      k = { who: new Set(), inter: { pos, radius: 1.05, label: 'Knock', onInteract: () => this.knock(rec) } };
      this.knocks.set(rec, k); this.world.interactables.push(k.inter);
    }
    k.who.add(v); this.knockLabel(k);
  }
  wakeUp(v, rec) {
    const k = rec && this.knocks.get(rec); if (!k) return;
    k.who.delete(v);
    if (!k.who.size) { this.dropKnock(k); this.knocks.delete(rec); } else this.knockLabel(k);
  }
  knockFirst(k) { let f = null; for (const v of k.who) if (!f || (f.folk && !v.folk)) f = v; return f; }
  knockLabel(k) { const f = this.knockFirst(k); k.inter.label = f ? `Knock on ${f.name}'s door` : 'Knock'; }
  dropKnock(k) { const a = this.world.interactables, i = a.indexOf(k.inter); if (i >= 0) a.splice(i, 1); }
  knock(rec) {
    const k = this.knocks.get(rec); const v = k && this.knockFirst(k);
    if (!v || v.knocked) return; // already on their way to the door
    Events.emit('sfx', 'door_knock', { pos: k.inter.pos, vol: 0.9 });
    v.answerDoor?.();
  }
  // conversation partner for v: a nearby villager who is free to stop and talk
  partner(v, maxD = 9) {
    let best = null, bd = maxD;
    for (const n of this.G.npcs) {
      if (n === v || !n.visible || n.talking || n.chat || n.life !== this || !n.chatReady?.()) continue;
      const d = Math.hypot(n.pos.x - v.pos.x, n.pos.z - v.pos.z);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
  // debug / screenshot helper: put villager v into the nearest free slot of a kind (instantly, or walking there)
  force(v, kind, near = v.pos, instant = true) {
    v.clearTask(); v.warm = true;
    let best = null, bd = 1e9;
    let spot = null;
    for (const sl of this.byKind.get(kind) || []) {
      if (sl.by || sl.dead) continue;
      const sp = sl.half ? this.seatSpot(v, sl) : null; if (sl.half && !sp) continue;
      const d = Math.hypot(sl.x - near.x, sl.z - near.z); if (d < bd) { bd = d; best = sl; spot = sp; }
    }
    if (!best) return null;
    this.take(best, v, spot);
    if (instant) v.beginAct(best, true); else v.go(spot?.ax ?? best.ax ?? best.x, spot?.az ?? best.az ?? best.z, { kind: 'slot', slot: best, speed: 1 });
    return best;
  }
  dispose() { Events.off?.('village:changed', this.onChanged); }
}
