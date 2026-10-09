// Placement helpers for the wild areas' dressing and the wildlife glades (docs/COZY.md §6.1–§6.2), used by the biome
// recipes' populate (src/regions/biomes/*.js, assets/tidepoolWorld.js). Plain maths over the populate ctx: no
// three.js, so a recipe's own kit pieces stay in the recipe.
//   farAt(c, k, da)        a point k × r from a disc's centre toward screen-up (the camera looks from +x / +z: tall
//                          things stand there, never on the camera side), turned by da radians
//   tallOk(c, x, z)        is (x, z) on a disc's far half (the side away from the camera)?
//   spots(ctx, c, n, o)    up to n free spots in a disc's ring [k0, k1] × r (reserved as they're taken), seeded
//   gladeGround(ctx, g)    an emptied camp site's trampled dirt grows back (a peaceful visit)
import { mulberry32 } from '../core/util.js';

export const FAR = Math.atan2(-1, -1);
export function farAt(c, k = 0.75, da = 0) { const a = FAR + da; return [c.x + Math.cos(a) * c.r * k, c.z + Math.sin(a) * c.r * k]; }
export const tallOk = (c, x, z, m = 0) => (x - c.x) + (z - c.z) < -m * Math.SQRT2;
/** up to n free spots in a disc's ring → [{ x, z, rot, k }] (o: k0, k1 radius fractions; r: the spot's own radius;
 *  path: clearance from the trail and spurs; far: only the far half; seed) */
export function spots(ctx, c, n, { k0 = 0.2, k1 = 0.95, r = 0.5, space = r + 0.4, path = 1.1, far = false, seed = 1, tries = 24 } = {}) {
  const rnd = mulberry32(seed), out = [];
  for (let i = 0; i < n * tries && out.length < n; i++) {
    const a = rnd() * Math.PI * 2, k = k0 + Math.sqrt(rnd()) * (k1 - k0), x = c.x + Math.cos(a) * c.r * k, z = c.z + Math.sin(a) * c.r * k;
    if (far && !tallOk(c, x, z, 1)) continue;
    if (ctx.waterAt?.(x, z) > 0.02 || !ctx.walkable?.(x, z)) continue;
    if (!ctx.isFree(x, z, r, { clearings: true, path, space })) continue;
    ctx.reserve(x, z, space);
    out.push({ x, z, rot: rnd() * Math.PI * 2, k, rnd });
  }
  return out;
}
/** an emptied camp site grows back: the trampled dirt fades into the biome's own ground cover */
export function gladeGround(ctx, g, cover = 'grass', v = 0.9) {
  ctx.paint('dirt', g.x, g.z, g.r + 1.4, 0, 0.6);
  ctx.paint(cover, g.x, g.z, g.r + 1.0, v, 0.6);
}
