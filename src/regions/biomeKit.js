// Shared pieces for biome recipes (docs/REGIONS.md §3.6): view guards for tall scenery, the Placer hand-over, and
// small geometry / placement helpers every biome uses.
//
// The game camera looks from +x / +z (yaw 45°, ~22 m out, ~45° down). Anything tall standing within ~9 m on that side of
// the trail or a clearing hides the hero, and anything tall ~11-17 m out on that side sits in front of the lens itself.
// viewGuard(ctx) → { camSide(x, z), lens(x, z) }: short things only where either is true.

/** tall-scenery guards for a recipe's populate(ctx) */
export function viewGuard(ctx, { trail = 2.2, reach = 8.6, clearing = 4 } = {}) {
  const P = ctx.plan, tw = P.trailW + trail;
  const pd = (u, v) => ctx.pathDist(u, v) < tw;
  const clr = (u, v) => ctx.inStart(u, v, 1) || ctx.inCamp(u, v) || ctx.inArena(u, v) || ctx.inPoi(u, v);
  return {
    camSide: (x, z) => { for (let k = 2.6; k <= reach; k += 2) if (pd(x - k, z - k)) return true; return clr(x - clearing * 0.6, z - clearing * 0.6) || clr(x - clearing, z - clearing) || ctx.inStart(x - 7, z - 7, 2); },
    lens: (x, z) => pd(x - 11, z - 11) || pd(x - 14, z - 14) || pd(x - 17, z - 17) || ctx.inStart(x - 11, z - 11, 3) || ctx.inArena(x - 12, z - 12, 2),
    /** would something `h` m tall at (x, z) hide one of `spots` [{ x, z, r }] (a waterfall, a bridge, a shrine) from the camera? */
    hides: (x, z, h, spots) => { for (const s of spots) for (let k = -1; k <= h * 0.8; k += 1) if (Math.hypot(x - k - s.x, z - k - s.z) < s.r) return true; return false; },
  };
}

/** give a bambooKit Placer's batches, colliders, nav blockers and lights to the world (and free it with the region) */
export function handOver(ctx, PL, { lightMul = 0.7, nightOnly = false } = {}) {
  ctx.add(PL.build());
  for (const c of PL.colliders) ctx.addCollider(c.x, c.z, c.r);
  for (const b of PL.blockers) ctx.blockCells(b.x, b.z, b.r);
  for (const l of PL.lights) ctx.addLight({ ...l, nightOnly, intensity: (l.intensity ?? 3) * lightMul });
  ctx.onDispose(() => PL.dispose());
}

/** distance from (x, z) to a polyline [[x, z]...] */
export function polyDist(pts, x, z) {
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], vx = bx - ax, vz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1)));
    const dx = x - ax - vx * t, dz = z - az - vz * t, d = dx * dx + dz * dz; if (d < best) best = d;
  }
  return Math.sqrt(best);
}
export const sstep = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/** where the trail crosses a water polyline (cached per plan): { x, z, yaw } for a bridge, or null */
const _cross = new WeakMap();
export function trailCrossing(plan, water, key = 'w') {
  let m = _cross.get(plan); if (!m) _cross.set(plan, m = {});
  if (key in m) return m[key];
  let best = null; const tr = plan.trail;
  for (let i = 0; i < tr.length; i++) {
    const [x, z] = tr[i], d = polyDist(water, x, z);
    if (!best || d < best.d) { const [nx, nz] = tr[Math.min(tr.length - 1, i + 2)], [px, pz] = tr[Math.max(0, i - 2)]; best = { x, z, d, i, yaw: Math.atan2(nx - px, nz - pz) }; }
  }
  return (m[key] = best && best.d < 3 ? best : null);
}
/** a walkable bridge deck along the trail at a crossing (and open the monsters' grid cells under it);
 *  y: [start, middle, end] or yAt(s) for s in [-half, half] (an arched deck, sampled every ~0.5 m) */
export function bridgeDeck(ctx, cr, { half = 2.9, w = 1.5, y = [0.3, 0.52, 0.3] } = {}) {
  const dx = Math.sin(cr.yaw), dz = Math.cos(cr.yaw);
  if (typeof y === 'function') {
    const n = Math.max(2, Math.round(half * 4)), pts = [], ys = [];
    for (let i = 0; i <= n; i++) { const s = -half + i / n * half * 2; pts.push([cr.x + dx * s, cr.z + dz * s]); ys.push(y(s)); }
    ctx.addDeck({ pts, y: ys, w });
  } else ctx.addDeck({ pts: [[cr.x - dx * half, cr.z - dz * half], [cr.x, cr.z], [cr.x + dx * half, cr.z + dz * half]], y, w });
  const L = ctx.layout;
  for (let t = -half - 0.3; t <= half + 0.3; t += 0.5) { const cx = Math.floor((cr.x + dx * t) / 2), cy = Math.floor((cr.z + dz * t) / 2); if (cx >= 0 && cy >= 0 && cx < L.W && cy < L.H) L.grid[cy * L.W + cx] = 1; }
  ctx.reserve(cr.x, cr.z, half + 0.4);
}
/** lantern-ish points every `every` metres along the trail, alternating sides → [{ x, z, face }] */
export function alongTrail(plan, every = 14, off = 1.3) {
  const tr = plan.trail, out = []; let acc = 0, side = 1;
  for (let i = 1; i < tr.length; i++) {
    const [x0, z0] = tr[i - 1], [x1, z1] = tr[i]; acc += Math.hypot(x1 - x0, z1 - z0);
    if (acc < every) continue; acc = 0; side = -side;
    const tx = x1 - x0, tz = z1 - z0, l = Math.hypot(tx, tz) || 1, nx = -tz / l * side, nz = tx / l * side;
    out.push({ x: x1 + nx * (plan.trailW + off), z: z1 + nz * (plan.trailW + off), face: Math.atan2(-nx, -nz) });
  }
  return out;
}
/** the arena's entrance (where the trail arrives) → { x, z, a (angle from the centre), yaw (facing out along the trail) } */
export function arenaGate(plan, pad = 1.4) {
  const A = plan.arena, e = plan.trail[plan.trail.length - 1], a = Math.atan2(e[1] - A.z, e[0] - A.x);
  return { x: A.x + Math.cos(a) * (A.r + pad), z: A.z + Math.sin(a) * (A.r + pad), a, yaw: Math.atan2(Math.cos(a), Math.sin(a)) };
}
