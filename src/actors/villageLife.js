// Village life coordinator shared by every Villager (lazily created as G.villageLife by the first villager update).
//  - Activity SLOTS derived from the real village (G.sim.list): bench seats, fountain rim, shop counters, browse spots,
//    veggie patches, flower beds, statues, notice board, wells, lanterns, hot spring, home yards, fishing banks.
//    A slot is claimed by one villager at a time; slots are rebuilt on 'village:changed' (claims carry over by id,
//    vanished slots are flagged dead so their user wraps up).
//  - NAV: a tile-grid A* (paths/plaza cheap, grass dearer, buildings/trees/water blocked) + string-pulling, so
//    villagers stroll along the paths and around buildings instead of sliding along walls. Throttled per frame.
//  - PROPS: tiny shared-geometry broom / watering can / fishing rod that villagers hold in rig.parts.handR.
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { BUILDINGS } from '../world/buildings/index.js';
import { T, WORLD } from '../world/terrain.js';
import { paint, merge, xf } from '../gfx/geom.js';
import { rand, TAU } from '../core/util.js';

const NOCOL = new Set(['flowerBed', 'bridge', 'fence', 'park']); // walk-through (see VillageSim.spawnModel)
const BLOCK = 255;
const SEAT_TOP = 0.445; // bench seat height above its base
const RIM_TOP = 0.37;   // fountain rim

// ------------------------------------------------------------------ navigation grid
class NavGrid {
  constructor(life) {
    this.life = life;
    const N = WORLD * WORLD;
    this.cost = new Uint8Array(N);       // 0 = unknown, BLOCK = solid, else cost*10
    this.g = new Float32Array(N); this.from = new Int32Array(N); this.seen = new Uint32Array(N); this.shut = new Uint32Array(N);
    this.gen = 1;
    this.heap = new Int32Array(N); this.hf = new Float32Array(N); this.hn = 0;
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
    }
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
  blocked(x, z) { if (x < 0 || z < 0 || x >= WORLD || z >= WORLD) return true; return this.cost[z * WORLD + x] === BLOCK; }
  costAt(x, z) { return this.cost[Math.floor(z) * WORLD + Math.floor(x)]; }
  _push(n, f) {
    let i = this.hn++; const H = this.heap, F = this.hf;
    while (i > 0) { const p = (i - 1) >> 1; if (F[p] <= f) break; H[i] = H[p]; F[i] = F[p]; i = p; }
    H[i] = n; F[i] = f;
  }
  _pop() {
    const H = this.heap, F = this.hf, top = H[0], n = --this.hn;
    if (n > 0) {
      const last = H[n], lf = F[n]; let i = 0;
      for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && F[c + 1] < F[c]) c++; if (F[c] >= lf) break; H[i] = H[c]; F[i] = F[c]; i = c; }
      H[i] = last; F[i] = lf;
    }
    return top;
  }
  // A* from (sx,sz) to (tx,tz) in world units. Returns a flat [x0,z0,x1,z1,...] waypoint list (ends at the exact
  // target) or null. Start / goal tiles may be solid (standing beside a building, a bench seat).
  find(sx, sz, tx, tz, maxNodes = 5000) {
    if (this.dirty) this.rebuild();
    const W = WORLD, cost = this.cost;
    const s = (Math.floor(sz) * W + Math.floor(sx)) | 0, goal = (Math.floor(tz) * W + Math.floor(tx)) | 0;
    if (s < 0 || goal < 0 || s >= W * W || goal >= W * W) return null;
    if (s === goal) return [tx, tz];
    const gen = ++this.gen; if (gen > 4e9) { this.seen.fill(0); this.shut.fill(0); this.gen = 1; }
    const G = this.g, from = this.from, seen = this.seen, shut = this.shut;
    const gx = goal % W, gz = (goal / W) | 0;
    const h = n => { const dx = Math.abs((n % W) - gx), dz = Math.abs(((n / W) | 0) - gz); return (dx + dz + (1.4142 - 2) * Math.min(dx, dz)) * 10; };
    this.hn = 0; G[s] = 0; seen[s] = gen; from[s] = -1; this._push(s, h(s));
    let found = false, count = 0;
    while (this.hn) {
      const n = this._pop();
      if (shut[n] === gen) continue; shut[n] = gen;
      if (n === goal) { found = true; break; }
      if (++count > maxNodes) break;
      const x = n % W, z = (n / W) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= W || nz >= W) continue;
        const m = nz * W + nx;
        let c = cost[m];
        if (c === BLOCK) { if (m !== goal) continue; c = 10; }
        if (dx && dz && (cost[z * W + nx] === BLOCK || cost[nz * W + x] === BLOCK)) continue; // no corner cutting
        const ng = G[n] + c * (dx && dz ? 1.4142 : 1);
        if (seen[m] === gen && ng >= G[m]) continue;
        seen[m] = gen; G[m] = ng; from[m] = n; this._push(m, ng + h(m));
      }
    }
    if (!found) return null;
    const tiles = [];
    for (let n = goal; n !== -1; n = from[n]) tiles.push(n);
    tiles.reverse();
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
      const bench = (bx, bz, brot, y0, key) => { // a bench (local position + rotation inside this building)
        const bc = Math.cos(brot), bs = Math.sin(brot), pair = [];
        for (const sx of [-0.29, 0.29]) {
          const seat = L(bx + sx * bc + -0.05 * bs, bz - sx * bs + -0.05 * bc), app = L(bx + sx * bc + 0.62 * bs, bz - sx * bs + 0.62 * bc);
          if (!free(app.x, app.z, 0.26)) continue;
          const sl = { id: `${b.id}:seat:${key}:${sx}`, kind: 'bench', x: seat.x, z: seat.z, ax: app.x, az: app.z, face: th + brot, seatY: p.y + y0 + SEAT_TOP, rec, pair: null };
          pair.push(sl); out.push(sl);
        }
        if (pair.length === 2) { pair[0].pair = pair[1]; pair[1].pair = pair[0]; }
      };
      const [w, d] = this.sim.dims(type, b.rot, b.level), hw = (b.rot % 2 ? d : w) / 2, hd = (b.rot % 2 ? w : d) / 2; // local half extents
      switch (type) {
        case 'bench': bench(0, 0, 0, 0, 'b'); break;
        case 'park': bench(0.55, -0.85, 0, 0.05, 'p1'); bench(-1.0, 0.55, Math.PI / 2, 0.05, 'p2'); stand(0.55, 0.1, th + Math.PI, 'admire'); break;
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
      sl.by = v;
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
    const W = this.world, ter = W.terrain, P = W.landmarks?.plaza || { x: 56, z: 60 };
    const cands = [];
    for (let z = Math.floor(P.z - 30); z < P.z + 30; z++) for (let x = Math.floor(P.x - 30); x < P.x + 30; x++) {
      const cx = x + 0.5, cz = z + 0.5;
      if (!W.walkable(cx, cz) || W.collision.solidAt(cx, cz, 0.35) || W.deckAt(cx, cz)) continue;
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * TAU, dx = Math.sin(a), dz = Math.cos(a);
        if (ter.heightAt(cx + dx * 1.2, cz + dz * 1.2) > -0.05 || ter.heightAt(cx + dx * 2.2, cz + dz * 2.2) > -0.05) continue;
        // walk to the bank edge
        let ex = cx, ez = cz;
        for (let i = 0; i < 8 && W.walkable(ex + dx * 0.15, ez + dz * 0.15) && !W.collision.solidAt(ex + dx * 0.15, ez + dz * 0.15, 0.3); i++) { ex += dx * 0.15; ez += dz * 0.15; }
        ex -= dx * 0.2; ez -= dz * 0.2;
        cands.push({ x: ex, z: ez, face: a, d: Math.hypot(cx - P.x, cz - P.z) + Math.random() * 4 });
        break;
      }
    }
    cands.sort((a, b) => a.d - b.d);
    const out = [];
    for (const c of cands) {
      if (out.length >= 5) break;
      if (out.some(o => Math.hypot(o.x - c.x, o.z - c.z) < 5)) continue;
      out.push({ id: `fish:${out.length}`, kind: 'fish', x: c.x, z: c.z, face: c.face, bobX: c.x + Math.sin(c.face) * 1.7, bobZ: c.z + Math.cos(c.face) * 1.7 });
    }
    return (this.fishSpots = out);
  }
  // best free slot of a kind for villager v (distance-weighted random; owners of a home prefer their own yard)
  claim(v, kind, near, maxD = 22, teleport = false) {
    const list = this.byKind.get(kind); if (!list) return null;
    let best = null, bs = -1;
    for (const sl of list) {
      if (sl.by || sl.dead) continue;
      const d = Math.hypot(sl.x - near.x, sl.z - near.z); if (d > maxD) continue;
      let sc = Math.random() / (1 + d / 7);
      if (sl.home && v.home && Math.hypot(sl.home.x - v.home.x, sl.home.z - v.home.z) < 0.5) sc *= 6;
      else if (sl.home && v.home) sc *= 0.3; // somebody else's yard
      if (sl.kind === 'bench' && sl.pair?.by) sc *= teleport ? 1.5 : 2.5; // sit next to someone: a chance to chat
      if (sc > bs) { bs = sc; best = sl; }
    }
    if (best) best.by = v;
    return best;
  }
  release(sl, v) { if (sl && sl.by === v) sl.by = null; }
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
    for (const sl of this.byKind.get(kind) || []) { if (sl.by || sl.dead) continue; const d = Math.hypot(sl.x - near.x, sl.z - near.z); if (d < bd) { bd = d; best = sl; } }
    if (!best) return null;
    best.by = v;
    if (instant) v.beginAct(best, true); else v.go(best.ax ?? best.x, best.az ?? best.z, { kind: 'slot', slot: best, speed: 1 });
    return best;
  }
  dispose() { Events.off?.('village:changed', this.onChanged); }
}
