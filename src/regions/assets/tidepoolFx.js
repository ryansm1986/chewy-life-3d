// Shiokaze Tidepools — ambient effects + critters (docs/REGIONS.md §2): sun glints on the sea, bubbles and plankton in
// the pools and the grotto, salt haze drifting off the stacks, spray bursting where the waves meet the rocks, crabs
// scuttling on the beaches, gulls wheeling overhead and little fish darting in the tide pools.
// Everything goes through the engine's weather kit (ctx.fx) and critter framework (ctx.critters): both are updated and
// freed by RegionWorld, so update() / dispose() here only handle what this module owns itself (nothing, today).
import { TAU } from './tidepoolKit.js';

export class TidepoolFx {
  constructor(H, S, coastDist) {
    const ctx = H.ctx || {}, W = ctx.fx || ctx.weather, CR = ctx.critters, CM = ctx.CRITTER_MODELS;
    this.W = W;
    if (!W) return;
    const sea = H.world?.waterLevel ?? 0;
    // the sea sparkles in the high sun; pools fizz; the grotto's water glows with plankton
    W.glints({ on: 'water', count: 560, box: [42, 1, 38], size: [0.1, 0.22] });
    W.bubbles({ count: 170, box: [30, 1, 28] });
    W.plankton({ count: 150, box: [28, 1, 28], colors: ['#8affe8', '#6ad8ff', '#b8fff4'] });
    // cool mist pooling in the grotto, and a thin salt haze around the sea stacks
    const [gx, gz] = S.grotto, [mx, mz] = S.grottoMouth;
    W.mist([{ x: gx, z: gz, r: 7 }, { x: mx - 2, z: mz - 2, r: 4 }], { alpha: 0.2, color: '#e0f4ff' });
    W.mist(S.stacks.map(([x, z, r]) => ({ x, z, r: r * 1.4, y: sea + 0.4 })), { alpha: 0.1, color: '#f0fbff', scale: 1.5 });
    // spray: every sea stack and bluff gets a few burst points on its seaward faces
    const spray = [];
    for (const [x, z, r] of S.stacks) for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU + x * 0.37, dx = Math.cos(a), dz = Math.sin(a);
      spray.push({ x: x + dx * r * 0.92, z: z + dz * r * 0.92, y: sea, dir: { x: dx, z: dz } });
    }
    for (const [x, z, r] of S.bluffs) for (let k = 0; k < 4; k++) {
      const a = Math.PI + (k - 1.5) * 0.5, dx = Math.cos(a), dz = Math.sin(a) * 0.4 - 0.9;
      spray.push({ x: x + dx * r, z: z + dz * r * 0.8, y: sea, dir: { x: dx * 0.3, z: -0.8 } });
    }
    W.spray(spray, { every: [2.2, 5.5], size: 1.15, range: 34 });
    // drips from the grotto ceiling
    W.drips([[gx - 1, gz + 1], [gx + 2, gz - 1.5], [mx - 1.5, mz - 1], [gx + 0.5, gz + 2.5]].map(([x, z]) => ({ x, z, y: sea + 3.2 })), { every: [1.2, 3.2] });
    if (!CR || !CM) return;
    // crabs on the sand near the waterline (they walk sideways and bolt when you come close)
    const beaches = [S.wreckBeach, S.cove, S.start, ...S.via.slice(0, 3)].map(([x, z]) => ({ x, z, r: 7 }));
    // (a saved zone's wildlife glades, the emptied camp sites, get crabs of their own: docs/COZY.md §6.1)
    if (ctx.peaceful) beaches.push(...(ctx.glades || []).map(g => ({ x: g.x, z: g.z, r: g.r + 1.5 })));
    CR.add({ name: 'crab', geo: CM.crab({ body: '#e8583a' }), count: ctx.peaceful ? 17 : 12, habitat: 'ground', homes: beaches, speed: 1.5, flee: 3, side: true, hop: 0.02, size: [0.8, 1.2], idle: [1, 3.5] });
    CR.add({ name: 'crabBlue', geo: CM.crab({ body: '#4a8ad8' }), count: 5, habitat: 'ground', homes: beaches.slice(0, 3), speed: 1.4, flee: 3, side: true, hop: 0.02, size: [0.7, 0.95] });
    // gulls wheeling over the coast (they don't flee: they're up high)
    CR.add({ name: 'gull', geo: CM.bird({ body: '#f2f4f6', belly: '#ffffff', head: '#fafafa', beak: '#f0b040', s: 1.35 }), count: 7, habitat: 'air',
      homes: [{ x: 40, z: 20, r: 34 }, { x: 18, z: 60, r: 26 }, { x: 80, z: 12, r: 20 }], alt: [6, 10], speed: 3.4, flee: 0, flap: { from: 0.05, speed: 9, amp: 0.75 } });
    // little fish darting in the tide pools
    CR.add({ name: 'poolFish', geo: CM.fish({ body: '#ff9a4a', fin: '#ffe0b0' }), count: 12, habitat: 'water',
      homes: S.pools.map(([x, z, r]) => ({ x, z, r: r * 0.8 })), speed: 0.9, flee: 2.5, depth: [0.06, 0.16], size: [0.7, 1.1], shadow: false });
  }
  update() {}
  dispose() {}
}
