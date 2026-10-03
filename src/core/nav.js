// Grid navigation shared by Chewy, Shadow and the villagers.
//  - GridAStar: octile A* over a Uint8Array cost grid (BLOCK = solid, no diagonal step past a solid neighbour) with a
//    binary heap and generation-stamped scratch arrays (nothing is cleared between searches). villageLife's tile
//    NavGrid runs its searches through it too.
//  - WorldNav (navFor(world)): a 0.5 m clearance grid for one world (the village or a Burrow floor), rasterised from
//    world.walkable + the collision hash with every collider padded by the agent radius. Cells hugging a wall cost a
//    little more so routes keep some clearance; 4-connected region labels let an unreachable click snap to the nearest
//    reachable spot instead of flooding the map. Collider edits (buildings, broken pots, cleared trees) are noticed by
//    a cheap signature check when a path is requested and re-rasterised locally.
//  - PathFollow: one agent's route: a straight shot when the line is clear, a throttled A* when it isn't, string-pulled
//    waypoints skipped as soon as the next one is in sight (smooth corners, no zig-zag), and a stuck watchdog.
export const BLOCK = 255;

// ------------------------------------------------------------------ A*
export class GridAStar {
  constructor(W, H) {
    const N = W * H;
    this.W = W; this.H = H;
    this.g = new Float32Array(N); this.from = new Int32Array(N); this.seen = new Uint32Array(N); this.shut = new Uint32Array(N);
    this.gen = 1;
    this.heap = new Int32Array(N); this.hf = new Float32Array(N);
    this.expanded = 0;
  }
  // A* from node s to node goal (node = z * W + x) over cost (0 < c < BLOCK passable, c = step cost, 10 = cheapest).
  // The goal may be solid (entered at goalCost). Returns the node list s..goal, or null when the goal wasn't reached
  // within maxNodes expansions; with partial = true it returns the route to the explored node nearest the goal instead.
  // hw > 1 weights the heuristic (fewer expansions, routes a touch less than optimal: string-pulling hides it);
  // maxG caps the route cost (no absurd detours: with partial the walk ends at the closest spot within the cap).
  // The binary heap is inlined on locals (lazy deletion: a node may sit in it more than once; it grows if needed).
  search(cost, s, goal, maxNodes = 5000, goalCost = 10, partial = false, hw = 1, maxG = Infinity) {
    const W = this.W, H = this.H;
    if (++this.gen > 4e9) { this.seen.fill(0); this.shut.fill(0); this.gen = 1; }
    const gn = this.gen, G = this.g, from = this.from, seen = this.seen, shut = this.shut;
    const gx = goal % W, gz = (goal / W) | 0, hk = 10 * hw, DG = 1.4142 - 2;
    let HP = this.heap, HF = this.hf, hn = 0;
    let found = false, count = 0, best = s, bh = Infinity;
    G[s] = 0; seen[s] = gn; from[s] = -1;
    { const dx = Math.abs((s % W) - gx), dz = Math.abs(((s / W) | 0) - gz); HP[0] = s; HF[0] = (dx + dz + DG * Math.min(dx, dz)) * hk; hn = 1; }
    while (hn) {
      // pop
      const n = HP[0], last = --hn;
      if (last > 0) {
        const ln = HP[last], lf = HF[last]; let i = 0;
        for (;;) { let c = 2 * i + 1; if (c >= last) break; if (c + 1 < last && HF[c + 1] < HF[c]) c++; if (HF[c] >= lf) break; HP[i] = HP[c]; HF[i] = HF[c]; i = c; }
        HP[i] = ln; HF[i] = lf;
      }
      if (shut[n] === gn) continue; shut[n] = gn;
      if (n === goal) { found = true; break; }
      if (++count > maxNodes) break;
      const x = n % W, z = (n / W) | 0;
      if (partial) { const dx = Math.abs(x - gx), dz = Math.abs(z - gz), hn2 = dx + dz + DG * Math.min(dx, dz); if (hn2 < bh) { bh = hn2; best = n; } }
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
        const m = nz * W + nx;
        let c = cost[m];
        if (c === BLOCK) { if (m !== goal) continue; c = goalCost; }
        if (dx && dz && (cost[z * W + nx] === BLOCK || cost[nz * W + x] === BLOCK)) continue; // no corner cutting
        const ng = G[n] + c * (dx && dz ? 1.4142 : 1);
        if (ng > maxG || (seen[m] === gn && ng >= G[m])) continue;
        seen[m] = gn; G[m] = ng; from[m] = n;
        // push
        const ax = Math.abs(nx - gx), az = Math.abs(nz - gz), f = ng + (ax + az + DG * Math.min(ax, az)) * hk;
        if (hn >= HP.length) { const a = new Int32Array(HP.length * 2), b = new Float32Array(a.length); a.set(HP); b.set(HF); this.heap = HP = a; this.hf = HF = b; }
        let i = hn++;
        while (i > 0) { const p = (i - 1) >> 1; if (HF[p] <= f) break; HP[i] = HP[p]; HF[i] = HF[p]; i = p; }
        HP[i] = m; HF[i] = f;
      }
    }
    this.expanded = count;
    let end = goal;
    if (!found) { if (!partial || best === s) return null; end = best; }
    const tiles = [];
    for (let n = end; n !== -1; n = from[n]) tiles.push(n);
    return tiles.reverse();
  }
}

// ------------------------------------------------------------------ world clearance grid
const RES = 0.5;              // metres per nav cell
const PAD = 0.35;             // collider padding: Chewy's radius (0.3) + a hair
const OPEN = 10, NEAR2 = 13, NEAR1 = 18; // step costs: open floor, two cells from a wall, touching a wall
let NID = 0;
const navs = new WeakMap();

// the nav grid of a world (built on first use, cached per world object); null for worlds without walkable/collision
export function navFor(world) {
  if (!world?.collision || !world.walkable) return null;
  let n = navs.get(world);
  if (n === undefined) {
    let w = 0, h = 0;
    if (world.L?.W && world.cellToWorld) { const c = world.cellToWorld(1, 0).x - world.cellToWorld(0, 0).x; w = world.L.W * c; h = world.L.H * c; }
    else if (world.terrain?.N) w = h = world.terrain.N;
    n = w > 0 ? new WorldNav(world, w, h) : null;
    navs.set(world, n);
  }
  return n;
}

export class WorldNav {
  constructor(world, w, h) {
    this.world = world; this.col = world.collision;
    this.GW = Math.ceil(w / RES); this.GH = Math.ceil(h / RES);
    const N = this.GW * this.GH;
    this.walk = new Uint8Array(N); this.solid = new Uint8Array(N); this.cost = new Uint8Array(N);
    this.region = new Int32Array(N); this.queue = new Int32Array(N);
    this.astar = new GridAStar(this.GW, this.GH);
    // terrain worlds (the village) block Chewy on his centre point only, and the too-steep test leaves hairline ridges
    // thinner than a cell on hillsides: cells on a slope or beside unwalkable ground are sampled on a quarter-cell
    // lattice (all 9 points walkable), so routes never cross a ridge or hug a shoreline the physics won't follow
    this.terrain = world.terrain || null;
    this.lat = this.terrain ? new Int8Array((2 * this.GW + 1) * (2 * this.GH + 1)) : null;
    this.riskSlope = 0.2; // centre slope above which a cell gets the lattice test (walkable limit is 0.5)
    this.built = false; this.regionsDirty = true; this.hw = 1.3;
    this.sigN = -1; this.sigS = 0; this.decks = -1; this.known = null;
    this.stats = { builds: 0, buildMs: 0, syncs: 0, local: 0, paths: 0, direct: 0, searches: 0, pathMs: 0, maxMs: 0, expanded: 0 };
  }
  // ---- rasterisation
  walkAt(x, z) { return this.world.walkable(x, z); }
  build() {
    const t0 = performance.now(), GW = this.GW, GH = this.GH;
    for (let j = 0, k = 0; j < GH; j++) for (let i = 0; i < GW; i++, k++) this.walk[k] = this.walkAt((i + 0.5) * RES, (j + 0.5) * RES) ? 1 : 0;
    if (this.lat) { this.lat.fill(-1); this.refineCells(0, 0, GW - 1, GH - 1); }
    this.solid.fill(0);
    this.known = this.colliders();
    for (const o of this.known) this.stamp(o, 0, 0, GW - 1, GH - 1);
    this.recost(0, 0, GW - 1, GH - 1);
    this.sign(); this.decks = this.world.decks?.length ?? 0;
    this.built = true; this.regionsDirty = true;
    this.stats.builds++; this.stats.buildMs = +(performance.now() - t0).toFixed(2);
  }
  latOk(a, b) { const L = this.lat, k = b * (2 * this.GW + 1) + a; if (L[k] < 0) L[k] = this.walkAt(a * RES / 2, b * RES / 2) ? 1 : 0; return L[k] === 1; }
  // risky cells (on a slope, or beside unwalkable ground) stay walkable only if their whole 3x3 quarter-cell lattice
  // is (walk: 1 = open, 0 = centre unwalkable, 2 = refined out)
  refineCells(i0, j0, i1, j1) {
    const GW = this.GW, GH = this.GH, walk = this.walk, T = this.terrain, out = [];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * GW + i; if (walk[k] !== 1) continue;
      let risky = this.riskSlope < 0;
      for (let dj = -1; dj <= 1 && !risky; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= GW || jj >= GH || walk[jj * GW + ii] === 0) { risky = true; break; } }
      if (!risky) risky = T.slopeAt((i + 0.5) * RES, (j + 0.5) * RES) > this.riskSlope;
      if (!risky) continue;
      let ok = true;
      for (let b = 2 * j; b <= 2 * j + 2 && ok; b++) for (let a = 2 * i; a <= 2 * i + 2; a++) if (!this.latOk(a, b)) { ok = false; break; }
      if (!ok) out.push(k);
    }
    for (const k of out) walk[k] = 2;
  }
  colliders() { const set = new Set(); for (const a of this.col.map.values()) for (const o of a) set.add(o); return set; }
  // cheap signature of the collision hash (entry count + sum of lazily assigned object ids); true when it changed
  sign() {
    let n = 0, s = 0;
    for (const a of this.col.map.values()) { n += a.length; for (const o of a) s = (s + (o._nid || (o._nid = ++NID))) | 0; }
    const changed = n !== this.sigN || s !== this.sigS;
    this.sigN = n; this.sigS = s;
    return changed;
  }
  // world-space box of a collider grown by the padding
  box(o) { return o.t === 'c' ? [o.x - o.r - PAD, o.z - o.r - PAD, o.x + o.r + PAD, o.z + o.r + PAD] : [o.x0 - PAD, o.z0 - PAD, o.x1 + PAD, o.z1 + PAD]; }
  // mark cells (clipped to [i0..i1] x [j0..j1]) whose centre is within PAD of a collider
  stamp(o, i0, j0, i1, j1) {
    const [x0, z0, x1, z1] = this.box(o), GW = this.GW, solid = this.solid;
    const a0 = Math.max(i0, Math.floor(x0 / RES)), a1 = Math.min(i1, Math.floor(x1 / RES));
    const b0 = Math.max(j0, Math.floor(z0 / RES)), b1 = Math.min(j1, Math.floor(z1 / RES));
    const circ = o.t === 'c', R = circ ? o.r + PAD : PAD;
    for (let j = b0; j <= b1; j++) {
      const z = (j + 0.5) * RES;
      for (let i = a0; i <= a1; i++) {
        const x = (i + 0.5) * RES;
        let dx, dz;
        if (circ) { dx = x - o.x; dz = z - o.z; } else { dx = x - Math.max(o.x0, Math.min(x, o.x1)); dz = z - Math.max(o.z0, Math.min(z, o.z1)); }
        if (dx * dx + dz * dz < R * R) solid[j * GW + i] = 1;
      }
    }
  }
  // step costs from walk/solid: BLOCK, or cheaper the further (Chebyshev, up to 2 cells) from the nearest blocked cell
  recost(i0, j0, i1, j1) {
    const GW = this.GW, GH = this.GH, walk = this.walk, solid = this.solid, cost = this.cost;
    i0 = Math.max(0, i0); j0 = Math.max(0, j0); i1 = Math.min(GW - 1, i1); j1 = Math.min(GH - 1, j1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * GW + i;
      if (walk[k] !== 1 || solid[k]) { cost[k] = BLOCK; continue; }
      let d = 3;
      for (let dj = -2; dj <= 2 && d > 1; dj++) {
        const jj = j + dj, aj = dj < 0 ? -dj : dj;
        for (let di = -2; di <= 2; di++) {
          const ai = di < 0 ? -di : di, r = ai > aj ? ai : aj;
          if (!r || r >= d) continue;
          const ii = i + di;
          if (ii < 0 || jj < 0 || ii >= GW || jj >= GH) { d = r; continue; }
          const m = jj * GW + ii;
          if (walk[m] !== 1 || solid[m]) d = r;
        }
      }
      cost[k] = d === 1 ? NEAR1 : d === 2 ? NEAR2 : OPEN;
    }
  }
  // re-rasterise a cell rectangle from scratch (terrain + every collider touching it)
  refresh(i0, j0, i1, j1) {
    const GW = this.GW, GH = this.GH;
    i0 = Math.max(0, i0); j0 = Math.max(0, j0); i1 = Math.min(GW - 1, i1); j1 = Math.min(GH - 1, j1);
    if (i1 < i0 || j1 < j0) return;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * GW + i; this.walk[k] = this.walkAt((i + 0.5) * RES, (j + 0.5) * RES) ? 1 : 0; this.solid[k] = 0; }
    if (this.lat) this.refineCells(i0, j0, i1, j1);
    const x0 = i0 * RES, x1 = (i1 + 1) * RES, z0 = j0 * RES, z1 = (j1 + 1) * RES;
    this.col.query((x0 + x1) / 2, (z0 + z1) / 2, Math.max(x1 - x0, z1 - z0) / 2 + PAD + 0.5, o => this.stamp(o, i0, j0, i1, j1));
    this.recost(i0 - 2, j0 - 2, i1 + 2, j1 + 2);
    this.regionsDirty = true;
  }
  // the agent is wedged here although the grid says it's open (a slope, a gap too tight for the physics): block the
  // cells just ahead toward (tx, tz) so the next route detours
  learn(x, z, tx, tz) {
    const d = Math.hypot(tx - x, tz - z); if (d < 1e-3) return;
    const k0 = this.cell(x, z);
    for (const f of [0.3, 0.55]) {
      const k = this.cell(x + (tx - x) / d * f, z + (tz - z) / d * f);
      if (k < 0 || k === k0) continue;
      this.solid[k] = 1;
      const i = k % this.GW, j = (k / this.GW) | 0; this.recost(i - 2, j - 2, i + 2, j + 2);
    }
    this.regionsDirty = true; this.stats.learned = (this.stats.learned || 0) + 1;
  }
  refreshAround(x, z, r) { this.refresh(Math.floor((x - r) / RES), Math.floor((z - r) / RES), Math.floor((x + r) / RES), Math.floor((z + r) / RES)); }
  // pick up collider edits since the last look (called per path request, not per frame)
  sync() {
    if (!this.built) { this.build(); return; }
    this.stats.syncs++;
    if ((this.world.decks?.length ?? 0) !== this.decks) { this.build(); return; } // a bridge changes where the ground is
    if (!this.sign()) return;
    const cur = this.colliders(), known = this.known, changed = [];
    for (const o of cur) if (!known.has(o)) changed.push(o);
    for (const o of known) if (!cur.has(o)) changed.push(o);
    this.known = cur;
    if (changed.length > 250) { this.build(); return; }
    for (const o of changed) { const [x0, z0, x1, z1] = this.box(o); this.refresh(Math.floor(x0 / RES), Math.floor(z0 / RES), Math.floor(x1 / RES), Math.floor(z1 / RES)); }
    this.stats.local += changed.length;
  }
  // 4-connected regions over passable cells (diagonal steps need both orthogonal cells, so this matches A* reachability)
  labels() {
    const GW = this.GW, N = this.GW * this.GH, cost = this.cost, region = this.region, q = this.queue;
    region.fill(0);
    let id = 0;
    for (let k = 0; k < N; k++) {
      if (region[k] || cost[k] === BLOCK) continue;
      id++; let h = 0, t = 0; q[t++] = k; region[k] = id;
      while (h < t) {
        const n = q[h++], i = n % GW;
        if (i > 0 && !region[n - 1] && cost[n - 1] !== BLOCK) { region[n - 1] = id; q[t++] = n - 1; }
        if (i < GW - 1 && !region[n + 1] && cost[n + 1] !== BLOCK) { region[n + 1] = id; q[t++] = n + 1; }
        if (n >= GW && !region[n - GW] && cost[n - GW] !== BLOCK) { region[n - GW] = id; q[t++] = n - GW; }
        if (n < N - GW && !region[n + GW] && cost[n + GW] !== BLOCK) { region[n + GW] = id; q[t++] = n + GW; }
      }
    }
    this.regionsDirty = false;
  }
  // ---- queries
  cell(x, z) { const i = Math.floor(x / RES), j = Math.floor(z / RES); return i < 0 || j < 0 || i >= this.GW || j >= this.GH ? -1 : j * this.GW + i; }
  cx(k) { return (k % this.GW + 0.5) * RES; }
  cz(k) { return (((k / this.GW) | 0) + 0.5) * RES; }
  costAt(x, z) { if (!this.built) this.build(); const k = this.cell(x, z); return k < 0 ? BLOCK : this.cost[k]; }
  freeAt(x, z) { return this.costAt(x, z) !== BLOCK; }
  // does the segment a→b cross only cells costing ≤ maxC? (the start cell is exempt: an agent may be hugging a wall;
  // an exact corner crossing must have both side cells open)
  los(ax, az, bx, bz, maxC = 254) {
    if (!this.built) this.build();
    const GW = this.GW, GH = this.GH, cost = this.cost;
    let i = Math.floor(ax / RES), j = Math.floor(az / RES);
    const dx = bx - ax, dz = bz - az, si = dx > 0 ? 1 : -1, sj = dz > 0 ? 1 : -1;
    const adx = Math.abs(dx), adz = Math.abs(dz);
    const tdx = adx > 1e-9 ? RES / adx : Infinity, tdz = adz > 1e-9 ? RES / adz : Infinity;
    let tmx = adx > 1e-9 ? (si > 0 ? (i + 1) * RES - ax : ax - i * RES) / adx : Infinity;
    let tmz = adz > 1e-9 ? (sj > 0 ? (j + 1) * RES - az : az - j * RES) / adz : Infinity;
    const bad = (i, j) => i < 0 || j < 0 || i >= GW || j >= GH || cost[j * GW + i] > maxC;
    for (let guard = 0; guard < 4096; guard++) {
      if ((tmx < tmz ? tmx : tmz) > 1) return true;
      if (Math.abs(tmx - tmz) < 1e-9) {
        if (bad(i + si, j) || bad(i, j + sj)) return false;
        i += si; j += sj; tmx += tdx; tmz += tdz;
      } else if (tmx < tmz) { i += si; tmx += tdx; } else { j += sj; tmz += tdz; }
      if (bad(i, j)) return false;
    }
    return false;
  }
  // nearest passable cell to (x, z) within R cells (optionally only in region reg), or -1
  nearestOpen(x, z, R, reg = 0) {
    const GW = this.GW, GH = this.GH, cost = this.cost, region = this.region;
    const ci = Math.floor(x / RES), cj = Math.floor(z / RES);
    let best = -1, bd = Infinity;
    for (let r = 0; r <= R; r++) {
      if ((r - 1) * RES > bd) break; // every cell on this ring is at least (r - 1) cells away
      for (let dj = -r; dj <= r; dj++) {
        const edge = dj === -r || dj === r;
        for (let di = -r; di <= r; di += edge ? 1 : 2 * r || 1) {
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= GW || j >= GH) continue;
          const k = j * GW + i;
          if (cost[k] === BLOCK || (reg && region[k] !== reg)) continue;
          const d = Math.hypot((i + 0.5) * RES - x, (j + 0.5) * RES - z);
          if (d < bd) { bd = d; best = k; }
        }
      }
    }
    return best;
  }
  // where to go when the target itself is solid or cut off: the first reachable cell walking back from the target
  // toward the agent (a click on a wall means "go to that wall", not round to its far side), unless a reachable cell
  // right around the target is clearly closer
  snapGoal(tx, tz, sx, sz, reg) {
    const cost = this.cost, region = this.region;
    let a = -1, da = Infinity;
    const L = Math.hypot(sx - tx, sz - tz), n = Math.min(160, Math.ceil(L / (RES * 0.5)));
    for (let q = 1; q <= n; q++) {
      const f = q / n, k = this.cell(tx + (sx - tx) * f, tz + (sz - tz) * f);
      if (k >= 0 && cost[k] !== BLOCK && region[k] === reg) { a = k; da = Math.hypot(this.cx(k) - tx, this.cz(k) - tz); break; }
    }
    const b = this.nearestOpen(tx, tz, 24, reg), db = b >= 0 ? Math.hypot(this.cx(b) - tx, this.cz(b) - tz) : Infinity;
    return a >= 0 && da <= db + 1.5 ? a : b;
  }
  // route from (sx,sz) toward (tx,tz): { pts:[x0,z0,x1,z1,...] (waypoints, start excluded), x, z (where it ends),
  // exact (ends at the target, not at the nearest reachable spot) } or null when the agent is walled in
  findPath(sx, sz, tx, tz, maxNodes = 60000) { // (the 224 m village: 448 x 448 cells)
    const t0 = performance.now(), st = this.stats;
    this.sync();
    if (this.regionsDirty) this.labels();
    const cost = this.cost;
    let s = this.cell(sx, sz);
    if (s < 0 || cost[s] === BLOCK) s = this.nearestOpen(sx, sz, 4);
    if (s < 0) return null;
    const reg = this.region[s];
    let g = this.cell(tx, tz), exact = g >= 0 && cost[g] !== BLOCK && this.region[g] === reg, gx = tx, gz = tz;
    if (!exact) { g = this.snapGoal(tx, tz, sx, sz, reg); if (g < 0) return null; gx = this.cx(g); gz = this.cz(g); }
    let pts;
    if (this.los(sx, sz, gx, gz)) { pts = [gx, gz]; st.direct++; }
    else {
      // a click a few metres away never sends Chewy on a trek round half the map: routes may cost ~4x the straight line
      const maxG = (Math.hypot(gx - sx, gz - sz) / RES * 4 + 60) * OPEN;
      const tiles = this.astar.search(cost, s, g, maxNodes, OPEN, true, this.hw, maxG);
      st.searches++; st.expanded = this.astar.expanded;
      if (!tiles) return null;
      const end = tiles[tiles.length - 1];
      if (end !== g) { exact = false; gx = this.cx(end); gz = this.cz(end); }
      pts = this.pull(tiles, sx, sz, gx, gz);
    }
    const ms = performance.now() - t0;
    st.paths++; st.pathMs += ms; if (ms > st.maxMs) st.maxMs = ms;
    return { pts, x: gx, z: gz, exact };
  }
  // string-pull a tile route: keep a turn point only where a straight shot would hit something solid or cut through
  // cells dearer than the route itself used (so pulled lines keep the clearance the search chose)
  pull(tiles, sx, sz, gx, gz) {
    const n = tiles.length, cost = this.cost;
    if (n < 2) return [gx, gz];
    const K = [0];
    for (let q = 1; q < n - 1; q++) if (tiles[q] - tiles[q - 1] !== tiles[q + 1] - tiles[q]) K.push(q);
    K.push(n - 1);
    const px = q => q === n - 1 ? gx : this.cx(tiles[q]), pz = q => q === n - 1 ? gz : this.cz(tiles[q]);
    const cm = new Uint8Array(n);
    const out = [];
    let a = 0, ax = sx, az = sz;
    while (a < K.length - 1) {
      let m = OPEN; for (let q = K[a]; q < n; q++) { const c = cost[tiles[q]]; if (c !== BLOCK && c > m) m = c; cm[q] = m; }
      let b = K.length - 1;
      for (; b > a + 1; b--) if (this.los(ax, az, px(K[b]), pz(K[b]), cm[K[b]])) break;
      ax = px(K[b]); az = pz(K[b]); out.push(ax, az); a = b;
    }
    return out;
  }
}

// ------------------------------------------------------------------ per-agent route following
export class PathFollow {
  // replan: min seconds between searches while the target keeps moving; far: target drift (m) that asks for a new route
  constructor({ replan = 0.12, far = 0.6 } = {}) {
    this.replan = replan; this.far = far;
    this.pts = null; this.i = 0; this.exact = false; this.last = false; this.dirty = false; this.failed = false;
    this.rx = 0; this.rz = 0; this.x = 0; this.z = 0;
    this.clock = 0; this.planT = -1e9; this.checkT = 0; this.cool = 0;
    this.wT = 0; this.wX = 0; this.wZ = 0; this.wExp = 0; this.stuck = 0;
  }
  clear() { this.pts = null; this.dirty = false; this.failed = false; this.stuck = 0; this.wT = 0; this.wExp = 0; }
  set(pts, tx, tz, exact) { this.pts = pts; this.i = 0; this.exact = exact; this.rx = tx; this.rz = tz; this.dirty = false; }
  // the point to steer at this frame ({x, z} = this) on the way from (px,pz) to (tx,tz); null = no route at all.
  // this.last: steering at the route's final point; this.exact: that point is the target, not the nearest reachable spot
  steer(nav, px, pz, tx, tz, dt) {
    this.clock += dt;
    let pts = this.pts;
    if (!pts || this.dirty || Math.hypot(tx - this.rx, tz - this.rz) > this.far) {
      if (nav.freeAt(tx, tz) && nav.los(px, pz, tx, tz)) this.set([tx, tz], tx, tz, true); // straight shot: no search
      else if (this.clock - this.planT >= (pts || this.failed ? this.replan + this.cool : 0)) {
        this.planT = this.clock;
        const t0 = performance.now(), r = nav.findPath(px, pz, tx, tz);
        this.cool = Math.min(0.4, (performance.now() - t0) * 0.05); // a pricey search (long village trek) waits longer for the next
        this.failed = !r;
        if (!r) { this.pts = null; return null; }
        this.set(r.pts, tx, tz, r.exact);
      } else if (!pts) return null; // a failed search is retried after the throttle
      // else: keep the old route until the throttle allows another search
      pts = this.pts;
    } else if (this.exact) {
      // the target drifts a little (held mouse, a walking monster): drag the route's end along while it stays open
      const e = pts.length - 2;
      if (pts[e] !== tx || pts[e + 1] !== tz) { if (nav.freeAt(tx, tz)) { pts[e] = tx; pts[e + 1] = tz; } else this.dirty = true; }
    }
    // pass reached waypoints and skip ahead the moment the next one is in sight (keeping the clearance we have)
    const n = pts.length >> 1;
    while (this.i < n - 1) {
      const k = this.i * 2;
      if (Math.hypot(pts[k] - px, pts[k + 1] - pz) < 0.35) { this.i++; continue; }
      const c = nav.costAt(px, pz);
      if (nav.los(px, pz, pts[k + 2], pts[k + 3], c === BLOCK ? NEAR1 : Math.max(NEAR2, c))) { this.i++; continue; }
      break;
    }
    // knocked off the route (roll, knockback): if the waypoint went out of sight, plan again
    if ((this.checkT -= dt) <= 0) { this.checkT = 0.3; if (!nav.los(px, pz, pts[this.i * 2], pts[this.i * 2 + 1])) { this.dirty = true; this.planT = -1e9; } }
    this.last = this.i >= n - 1;
    this.x = pts[this.i * 2]; this.z = pts[this.i * 2 + 1];
    return this;
  }
  // stuck watchdog: feed the distance the agent tried to cover this frame (after it moved). When it isn't getting
  // anywhere: re-rasterise the neighbourhood (stale colliders), mark the spot ahead as blocked and re-plan;
  // true = give up (wedged for ~1.6 s)
  watch(nav, px, pz, want, dt) {
    if (!this.wT) { this.wX = px; this.wZ = pz; }
    this.wT += dt; this.wExp += want;
    if (this.wT < 0.4) return false;
    const got = Math.hypot(px - this.wX, pz - this.wZ), exp = this.wExp;
    this.wT = 0; this.wExp = 0;
    if (exp < 0.25 || got > exp * 0.3) { this.stuck = 0; return false; }
    this.stuck++;
    if (this.stuck === 1) nav.refreshAround(px, pz, 2); // stale colliders?
    if (this.pts) nav.learn(px, pz, this.x, this.z);    // …or a spot the physics won't pass: route round it
    this.dirty = true; this.planT = -1e9;
    return this.stuck >= 4;
  }
}
