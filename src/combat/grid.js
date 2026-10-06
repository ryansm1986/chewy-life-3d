// A uniform xz grid for crowd queries (docs/ZONES.md §7, ROADMAP Z-B3): Combat's enemy queries (inRadius, nearest,
// pickAtScreen, projectile hits) and the monsters' own separation / surround / alert sweeps (dungeon/crowd.js).
//
// Buckets are plain arrays in a Map keyed by cell (only the buckets in use are walked when it is cleared); an entity
// remembers its cell under this grid's own property, so one entity can sit in two grids. Rebuilt once a frame by the
// owner and kept fresh in between by move() (Monster.sync calls it), so a query only pads for movement that happened
// outside an entity's own update. Queries return candidates; callers still run their exact tests.
let GRID_ID = 0;
const OFF = 32768, SPAN = 65536;

export class Grid {
  constructor(cell = 4, { radius = 'radius' } = {}) {
    this.cell = cell; this.inv = 1 / cell;
    this.map = new Map(); this.used = [];
    this.prop = '_gk' + (++GRID_ID); // the entity's bucket key in this grid
    this.rKey = radius;              // which entity radius the grid tracks the max of (radius / bodyR)
    this.n = 0; this.maxR = 0;
    this.minY = Infinity; this.maxY = -Infinity; // mid-height bounds (pickAtScreen's ray slab)
    this.frame = -1;
    this.bufs = []; this.depth = 0;  // query result buffers, one per nesting level (callbacks may query again)
  }
  key(x, z) { return (Math.floor(x * this.inv) + OFF) * SPAN + (Math.floor(z * this.inv) + OFF); }
  bucket(k) {
    let a = this.map.get(k);
    if (!a) { a = []; a.used = false; this.map.set(k, a); }
    if (!a.used) { a.used = true; this.used.push(a); }
    return a;
  }
  track(e) {
    const r = e[this.rKey] || 0; if (r > this.maxR) this.maxR = r;
    const y = (e.pos.y || 0) + (e.height || 0.6) * 0.5;
    if (y < this.minY) this.minY = y; if (y > this.maxY) this.maxY = y;
  }
  insert(e) {
    if (e[this.prop] !== undefined) { this.move(e); return; }
    const k = this.key(e.pos.x, e.pos.z);
    this.bucket(k).push(e); e[this.prop] = k; this.n++;
    this.track(e);
  }
  remove(e) {
    const k = e[this.prop]; if (k === undefined) return;
    const a = this.map.get(k);
    if (a) { const i = a.indexOf(e); if (i >= 0) { a[i] = a[a.length - 1]; a.pop(); this.n--; } }
    e[this.prop] = undefined;
  }
  /** re-bucket after a move (cheap when the cell didn't change); inserts an entity the grid doesn't hold yet */
  move(e) {
    const k0 = e[this.prop];
    if (k0 === undefined) { this.insert(e); return; }
    const k = this.key(e.pos.x, e.pos.z);
    if (k !== k0) {
      const a = this.map.get(k0);
      if (a) { const i = a.indexOf(e); if (i >= 0) { a[i] = a[a.length - 1]; a.pop(); } }
      this.bucket(k).push(e); e[this.prop] = k;
    }
    this.track(e);
  }
  /** rebuild from a list (forgets everyone first: entities that left the list leave the grid) */
  rebuild(list, filter = null) {
    const U = this.used;
    for (let i = 0; i < U.length; i++) { const a = U[i]; for (let j = 0; j < a.length; j++) a[j][this.prop] = undefined; a.length = 0; a.used = false; }
    U.length = 0;
    this.n = 0; this.maxR = 0; this.minY = Infinity; this.maxY = -Infinity;
    for (const e of list) if (e.pos && (!filter || filter(e))) this.insert(e);
  }
  /** candidates in every cell overlapping the box [x0, x1] × [z0, z1] → a reused array (valid until release()) */
  box(x0, z0, x1, z1) {
    const out = this.bufs[this.depth] ||= [];
    this.depth++;
    out.length = 0;
    const i0 = Math.floor(x0 * this.inv), i1 = Math.floor(x1 * this.inv), j0 = Math.floor(z0 * this.inv), j1 = Math.floor(z1 * this.inv);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > this.used.length) { // a box bigger than the occupied cells: walk those instead
      const c = this.cell, U = this.used;
      for (let u = 0; u < U.length; u++) { const a = U[u]; for (let k = 0; k < a.length; k++) { const e = a[k], p = e.pos; if (p.x >= x0 - c && p.x <= x1 + c && p.z >= z0 - c && p.z <= z1 + c) out.push(e); } }
      return out;
    }
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const a = this.map.get((i + OFF) * SPAN + (j + OFF));
      if (a) for (let k = 0; k < a.length; k++) out.push(a[k]);
    }
    return out;
  }
  /** candidates within r (+ the cells' slack) of (x, z) */
  near(x, z, r) { return this.box(x - r, z - r, x + r, z + r); }
  /** hand the last query's buffer back (queries nest: always release in reverse order) */
  release() { if (this.depth > 0) this.depth--; }
}
