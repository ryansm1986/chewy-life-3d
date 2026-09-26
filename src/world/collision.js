// 2D (xz) collision: circles + axis-aligned rects in a spatial hash, plus a terrain block function.
export class Collision {
  constructor(cell = 4) { this.cell = cell; this.map = new Map(); this.blockFn = null; this._stamp = 0; }
  _key(i, j) { return i * 73856093 ^ j * 19349663; }
  _cells(x0, z0, x1, z1, fn) {
    const c = this.cell;
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++) fn(this._key(i, j));
  }
  _insert(o, x0, z0, x1, z1) {
    o._cells = [];
    this._cells(x0, z0, x1, z1, k => { let a = this.map.get(k); if (!a) this.map.set(k, a = []); a.push(o); o._cells.push(k); });
  }
  addCircle(x, z, r, tag = null) { const o = { t: 'c', x, z, r, tag }; this._insert(o, x - r, z - r, x + r, z + r); return o; }
  addRect(x0, z0, x1, z1, tag = null) { const o = { t: 'r', x0, z0, x1, z1, tag }; this._insert(o, x0, z0, x1, z1); return o; }
  remove(o) { if (!o?._cells) return; for (const k of o._cells) { const a = this.map.get(k); if (a) { const i = a.indexOf(o); if (i >= 0) a.splice(i, 1); } } o._cells = null; }
  query(x, z, rad, fn) {
    const s = ++this._stamp;
    this._cells(x - rad, z - rad, x + rad, z + rad, k => { const a = this.map.get(k); if (a) for (const o of a) { if (o._s === s) continue; o._s = s; fn(o); } });
  }
  // push point (p.x, p.z) with radius r out of all colliders; prev = last valid position for terrain blocking
  resolve(p, r, prev) {
    for (let it = 0; it < 2; it++) {
      this.query(p.x, p.z, r + 1, o => {
        if (o.t === 'c') {
          const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), m = r + o.r;
          if (d < m && d > 1e-5) { p.x = o.x + dx / d * m; p.z = o.z + dz / d * m; }
        } else {
          const cx = Math.max(o.x0, Math.min(p.x, o.x1)), cz = Math.max(o.z0, Math.min(p.z, o.z1));
          const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
          if (d < r) {
            if (d > 1e-5) { p.x = cx + dx / d * r; p.z = cz + dz / d * r; }
            else { // inside: push out along the smallest axis
              const l = p.x - o.x0, rr = o.x1 - p.x, t = p.z - o.z0, b = o.z1 - p.z, mn = Math.min(l, rr, t, b);
              if (mn === l) p.x = o.x0 - r; else if (mn === rr) p.x = o.x1 + r; else if (mn === t) p.z = o.z0 - r; else p.z = o.z1 + r;
            }
          }
        }
      });
    }
    if (this.blockFn && prev && this.blockFn(p.x, p.z)) {
      // slide along axes
      if (!this.blockFn(p.x, prev.z)) p.z = prev.z;
      else if (!this.blockFn(prev.x, p.z)) p.x = prev.x;
      else { p.x = prev.x; p.z = prev.z; }
    }
    return p;
  }
  // true if a point is inside any collider or blocked terrain (for projectiles / placement)
  solidAt(x, z, pad = 0) {
    let hit = false;
    if (this.blockFn && this.blockFn(x, z)) return true;
    this.query(x, z, pad + 0.5, o => {
      if (hit) return;
      if (o.t === 'c') { if (Math.hypot(x - o.x, z - o.z) < o.r + pad) hit = true; }
      else if (x > o.x0 - pad && x < o.x1 + pad && z > o.z0 - pad && z < o.z1 + pad) hit = true;
    });
    return hit;
  }
}
