// Yukimi Onsen (雪見温泉) — the biome recipe (docs/REGIONS.md §2 / §3.3).
// The map: a snowy blue dusk. The trail runs west → east across the screen: from the arrival glade (south-west) under a
// row of snowy torii, past a ruined ryokan whose steaming hot springs glow in front of it (snow monkeys soaking in
// one), across a frozen pond, under a cliff with a frozen waterfall, to the Frost Princess's frozen lake (east), ringed
// with snow-viewing lanterns. Snow firs and birches all round; camellias bloom red on the snow.
// Assets: src/regions/assets/onsenFlora.js / onsenProps.js (drawn through the bambooKit Placer).
import * as THREE from 'three';
import * as F from '../assets/onsenFlora.js';
import * as Pr from '../assets/onsenProps.js';
import { jizo } from '../assets/mapleProps.js';
import { Placer } from '../assets/bambooKit.js';
import { paint, merge, xf } from '../../gfx/geom.js';
import { viewGuard, handOver, sstep, alongTrail, arenaGate } from '../biomeKit.js';

const LEVEL = -0.3;                                              // the region's water level (the frozen pond and lake)
const POND = { x: 76, z: 50, r: 5.2 };                           // the frozen pond the trail crosses
const INN = { x: 49, z: 57, yaw: Math.PI / 4 };                  // the ruined ryokan, facing the camera
const SPRINGS = [{ x: 55.5, z: 64.5, r: 2.5, monkeys: true }, { x: 59.5, z: 60.2, r: 1.5 }, { x: 52.2, z: 67.6, r: 1.3 }];
const SPRING_LVL = 0.22;                                         // hot-spring water surface (the pools are carved to ~-0.1)
const FALL = { x: 72, z: 36, yaw: Math.PI / 4, H: 3.4, W: 3.2 }; // the frozen waterfall on a cliff north of the trail
const FF = [Math.sin(FALL.yaw), Math.cos(FALL.yaw)];
const ARENA = [92, 26, 11];
const cliffAt = (x, z) => {
  const dx = x - FALL.x, dz = z - FALL.z, back = -(dx * FF[0] + dz * FF[1]), lat = Math.abs(dx * FF[1] - dz * FF[0]);
  return sstep(-0.9, 0.3, back + lat * 0.14) * (1 - sstep(7, 14, lat)) * (1 - sstep(12, 20, back));
};
const frozenAt = (x, z) => Math.max(1 - sstep(POND.r - 1.2, POND.r + 0.6, Math.hypot(x - POND.x, z - POND.z)), 1 - sstep(ARENA[2] - 1.5, ARENA[2] + 0.2, Math.hypot(x - ARENA[0], z - ARENA[1])));
const springAt = (x, z) => { let k = 0; for (const s of SPRINGS) k = Math.max(k, 1 - sstep(s.r * 0.55, s.r + 0.25, Math.hypot(x - s.x, z - s.z))); return k; };

// ------------------------------------------------------------------ terrain
function height(x, z, c) {
  const p = c.play(x, z), n = c.fbm(x * 0.045, z * 0.045, 4), e = c.edge(x, z);
  // snowy hills rising to ridges at the map edges, softly rounded (snow smooths everything)
  const wild = 1.6 + n * 1.8 + c.ridge(x * 0.026 + 7, z * 0.026 - 3, 3) * 1.5 + sstep(18, -6, e) * 5;
  let h = c.lerp(wild, 0.34 + c.fbm(x * 0.05 + 4, z * 0.05, 3) * 0.16, p);
  // the cliff with the frozen fall (a crescent, highest behind the fall)
  const ck = cliffAt(x, z);
  if (ck > 0) h = Math.max(h, c.lerp(h, FALL.H + n * 0.4, ck));
  return h;
}
// last word (after the trail carve): the frozen pond / lake beds, the hot-spring basins, the plunge pool under the fall
function after(x, z, h, c) {
  const fk = frozenAt(x, z);
  if (fk > 0) h = c.lerp(h, LEVEL - 0.14, fk);
  const sk = springAt(x, z);
  if (sk > 0) h = c.lerp(h, -0.12, sk);
  const pd = Math.hypot(x - (FALL.x + FF[0] * 1.6), z - (FALL.z + FF[1] * 1.6));
  if (pd < 3.2) h = Math.min(h, c.lerp(h, LEVEL - 0.1, 1 - sstep(1.4, 3.2, pd)));
  return h;
}
function surface(x, z, h, slope, c, o) {
  const p = c.play(x, z), n = c.n2(x * 0.12, z * 0.12);
  // snow over everything; the trail is trodden (stone showing through), the springs' surrounds are warm, wet and bare
  const warm = Math.max(...SPRINGS.map(s => 1 - sstep(s.r + 0.3, s.r + 2.6, Math.hypot(x - s.x, z - s.z))));
  o.snow = Math.max(0, 0.96 - warm * 0.85 - sstep(0.24, 0.42, slope) * 0.92);
  o.moss = warm * 0.55;
  o.accent = warm * 0.4 + sstep(0.35, 0.6, slope) * 0.3;
  o.litter = sstep(0.4, 0.9, (1 - p) * 0.6 + n * 0.4) * 0.25 * (1 - warm);  // fir needles under the trees
  o.grass = (0.35 + (1 - p) * 0.3) * (1 - o.snow * 0.55);
  return o;
}

// ------------------------------------------------------------------ critter models (+z forward, feet at y = 0)
const sph = (r, c, p = [0, 0, 0], s = [1, 1, 1]) => { const g = new THREE.SphereGeometry(r, 9, 7); xf(g, { p, s }); return paint(g, (q, nn, o) => o.set(c)); };
const cyl = (r0, r1, h, c, p, rot = [0, 0, 0]) => { const g = new THREE.CylinderGeometry(r0, r1, h, 6); xf(g, { p, r: rot }); return paint(g, (q, nn, o) => o.set(c)); };
function monkeyGeo() { // a snow monkey soaking to the shoulders: fluffy grey-brown head, pink face, a little snow on top
  const fur = '#a89888', face = '#f09a8a';
  return merge([sph(0.2, fur, [0, 0.18, 0], [1.1, 0.9, 1]), sph(0.14, fur, [0, 0.38, 0.03]), sph(0.08, face, [0, 0.37, 0.12], [1.1, 1, 0.6]),
    sph(0.014, '#2a1a18', [0.03, 0.39, 0.165]), sph(0.014, '#2a1a18', [-0.03, 0.39, 0.165]), sph(0.02, '#e0786a', [0, 0.35, 0.17]),
    sph(0.035, face, [0.12, 0.38, 0.02]), sph(0.035, face, [-0.12, 0.38, 0.02]), sph(0.07, '#f6f9ff', [0, 0.5, 0], [1.2, 0.45, 1.1])]);
}
function craneGeo() { // tanchō: white body, black neck and wingtips, a red crown, long legs
  const P = [sph(0.2, '#fbfbff', [0, 0.72, 0], [0.8, 0.75, 1.35]), sph(0.1, '#2a2a30', [0, 0.72, -0.26], [0.9, 0.7, 1])];
  const neck = new THREE.CylinderGeometry(0.035, 0.05, 0.42, 6); xf(neck, { p: [0, 0.98, 0.2], r: [0.5, 0, 0] }); P.push(paint(neck, (q, nn, o) => o.set(q.y > 1.05 ? '#fbfbff' : '#2a2a30')));
  P.push(sph(0.06, '#fbfbff', [0, 1.18, 0.3]), sph(0.03, '#e02a2a', [0, 1.23, 0.3]));
  const bk = new THREE.ConeGeometry(0.018, 0.14, 5); xf(bk, { p: [0, 1.17, 0.4], r: [Math.PI / 2, 0, 0] }); P.push(paint(bk, (q, nn, o) => o.set('#8a8a6a')));
  for (const sx of [1, -1]) { P.push(cyl(0.012, 0.012, 0.6, '#3a3a40', [sx * 0.06, 0.3, 0])); P.push(sph(0.12, '#fbfbff', [sx * 0.2, 0.76, -0.02], [1.4, 0.25, 1.2])); }
  return merge(P);
}
function hareGeo() { // a round white snow hare with long black-tipped ears
  return merge([sph(0.12, '#f6f8ff', [0, 0.11, 0], [0.9, 0.85, 1.2]), sph(0.08, '#f6f8ff', [0, 0.2, 0.1]), sph(0.012, '#2a1a1a', [0.04, 0.22, 0.16]), sph(0.012, '#2a1a1a', [-0.04, 0.22, 0.16]),
    sph(0.03, '#f6f8ff', [0.035, 0.34, 0.06], [0.6, 1.9, 0.6]), sph(0.03, '#f6f8ff', [-0.035, 0.34, 0.06], [0.6, 1.9, 0.6]), sph(0.02, '#2a2a30', [0.035, 0.43, 0.06]), sph(0.02, '#2a2a30', [-0.035, 0.43, 0.06]), sph(0.04, '#ffffff', [0, 0.12, -0.14])]);
}

// ------------------------------------------------------------------ populate
function populate(ctx) {
  const { rng, plan } = ctx, PL = new Placer({ heightAt: (x, z) => ctx.heightAt(x, z), name: 'onsen' });
  const H = (x, z) => ctx.heightAt(x, z), Gd = viewGuard(ctx);
  const nearSpring = (x, z, pad = 1.5) => SPRINGS.some(s => Math.hypot(x - s.x, z - s.z) < s.r + pad);
  const blocked = (x, z) => ctx.waterAt(x, z) > 0.02 || frozenAt(x, z) > 0.05 || nearSpring(x, z) || Math.hypot(x - INN.x, z - INN.z) < 5 || Math.hypot(x - FALL.x, z - FALL.z) < 4.5;
  const tree = (parts, x, z, r, s = 1) => { PL.multi(parts, x, H(x, z) - 0.06, z, { rot: rng.range(0, 6.283), s }); ctx.addCollider(x, z, 0.4 * (Array.isArray(s) ? s[0] : s)); ctx.blockCells(x, z, 0.5); ctx.paintFx('canopy', x, z, r * 1.6, 1); ctx.paintFx('shade', x, z, r * 1.4, 0.6); };
  // things the camera must see: the inn and its springs, the pond, the fall, the POIs, the arena gate
  const gate = arenaGate(plan, 1.3);
  const focal = [{ x: INN.x, z: INN.z, r: 4.5 }, ...SPRINGS.map(s => ({ x: s.x, z: s.z, r: s.r + 0.8 })), { x: FALL.x, z: FALL.z, r: 4 }, { x: gate.x, z: gate.z, r: 3 }, ...plan.pois.map(p => ({ x: p.x, z: p.z, r: 3.4 }))];
  // --- camps (first, before the trees take the edges): a snowed-in woodcutter's rest on each camp's far edge (away from the camera), facing in
  // (the far edge if it's free, else the left / right edge, else the camera side: it's low)
  for (const [k, c] of plan.camps.entries()) {
    for (const [dx, dz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const x = c.x + dx * 0.707 * (c.r + 0.4), z = c.z + dz * 0.707 * (c.r + 0.4), rot = Math.atan2(c.x - x, c.z - z);
      if (blocked(x, z) || !ctx.isFree(x, z, 1.2, { path: 1, clearings: true })) continue;
      const ux = Math.cos(rot), uz = -Math.sin(rot);
      PL.piece(Pr.campRest(k), x, z, rot); ctx.addCollider(x, z, 0.75); ctx.addCollider(x + ux * 1.05, z + uz * 1.05, 0.3); ctx.addCollider(x - ux * 1.1, z - uz * 1.1, 0.5); ctx.reserve(x, z, 1.8);
      break;
    }
  }
  // --- trees: snow firs in stands, airy birches near the trail, niwaki pines by the inn
  let n = 0;
  for (let i = 0; i < 22000 && n < 380; i++) {
    const near = i < 12000;
    const x = rng.range(-16, 128), z = rng.range(-16, 128), d = ctx.pathDist(x, z) - plan.trailW - 2.4;
    if (near ? (d < 0 || d > 12) : d < 12) continue;
    if (blocked(x, z) || ctx.inArena(x, z, 1.5)) continue;
    if (Gd.camSide(x, z) || Gd.lens(x, z)) { // a lone birch now and then (bare, see-through), the rest low things
      if (d > 1 && rng.chance(0.06) && ctx.canPlace(x, z, 0.5, { space: 1.2, path: 1.2 }) && !Gd.hides(x, z, 3, focal)) { tree(F.birch(rng.int(0, 3), { H: 3.4 }), x, z, 0.8); n++; }
      continue;
    }
    const close = d < 5, birchy = close ? 0.45 : 0.15, s = close ? rng.range(0.72, 0.9) : rng.range(0.9, 1.25);
    const isBirch = rng.chance(birchy), tall = (isBirch ? 4.2 : 5.2) * s;
    if (Gd.hides(x, z, isBirch ? tall * 0.5 : tall, focal)) continue;
    const r = isBirch ? 1.1 : close ? 1.5 : 1.9;
    if (!ctx.canPlace(x, z, r * 0.55, { space: r * 0.85, path: 1.2 })) continue;
    if (isBirch) tree(F.birch(rng.int(0, 3)), x, z, 1, s);
    else tree(F.snowFir(rng.int(0, 4), { H: rng.chance(0.3) ? 6.2 : 5.2 }), x, z, 1.8, s);
    n++;
  }
  // --- ground cover: camellia bushes, snow drifts, snowy rocks, frosted grass tufts
  for (let i = 0; i < 2600; i++) {
    const x = rng.range(0, 112), z = rng.range(0, 112), d = ctx.openDist(x, z);
    if (blocked(x, z) || !ctx.isFree(x, z, 0.4, { path: 1.1 })) continue;
    const y = H(x, z), rot = rng.range(0, 6.283), r = rng.next();
    if (d > 0.5 && d < 7 && r < 0.2) { PL.multi(F.snowBush(rng.int(0, 3), rng.chance(0.6) ? 'camellia' : 'none'), x, y - 0.05, z, { rot, s: rng.range(0.85, 1.25) }); ctx.addCollider(x, z, 0.5); }
    else if (d > 1 && r < 0.36) PL.multi(F.drift(rng.int(0, 3), { R: rng.range(0.8, 1.6), h: rng.range(0.25, 0.45) }), x, y - 0.08, z, { rot });
    else if (d > 2 && r < 0.46) { PL.multi(F.snowRock(rng.int(0, 3), { R: rng.range(0.5, 0.9) }), x, y - 0.1, z, { rot, s: rng.range(0.8, 1.4) }); ctx.addCollider(x, z, 0.5); }
    else if (d > -0.5 && r < 0.75) PL.multi(F.frostGrass(rng.int(0, 3)), x, y, z, { rot, s: rng.range(0.8, 1.3) });
    else continue;
    ctx.reserve(x, z, 0.5);
  }
  // --- the torii path: snowy torii straddling the first stretch of the trail
  { const tr = plan.trail; let acc = 0, k = 0;
    for (let i = 4; i < tr.length && k < 4; i++) {
      acc += Math.hypot(tr[i][0] - tr[i - 1][0], tr[i][1] - tr[i - 1][1]); if (acc < 7) continue; acc = 0;
      const [x, z] = tr[i], [px, pz] = tr[i - 2], [nx, nz] = tr[Math.min(tr.length - 1, i + 2)], yaw = Math.atan2(nx - px, nz - pz), w = plan.trailW * 2 + 1.2;
      if (ctx.inVillage?.(x, z, 2)) continue; // (not inside Yukimi Spa Village: the trail runs through its square)
      PL.piece(Pr.snowTorii(k, { w, h: 3.0 }), x, z, yaw);
      for (const s of [-1, 1]) ctx.addCollider(x + Math.cos(yaw) * w / 2 * s, z - Math.sin(yaw) * w / 2 * s, 0.25);
      ctx.reserve(x, z, 1); k++;
    }
  }
  // --- snow-viewing lanterns along the trail
  for (const [k, p] of alongTrail(plan, 13, 1.4).entries()) {
    if (blocked(p.x, p.z) || !ctx.isFree(p.x, p.z, 0.45, { path: 0.3, clearings: true })) continue;
    PL.piece(k % 4 === 3 ? jizo(k) : Pr.yukimiLantern(k, { s: 0.9 }), p.x, p.z, p.face); ctx.addCollider(p.x, p.z, 0.4); ctx.reserve(p.x, p.z, 0.9);
  }
  // --- the ruined ryokan, its hot springs (warm teal water, bamboo spouts, rock rims), buckets, a bench, niwaki pines
  PL.piece(Pr.inn(0), INN.x, INN.z, INN.yaw);
  for (const t of [-2, 0, 2]) { const x = INN.x + Math.cos(INN.yaw) * t, z = INN.z - Math.sin(INN.yaw) * t; ctx.addCollider(x, z, 1.75); ctx.blockCells(x, z, 1.9); }
  for (const [k, s] of SPRINGS.entries()) {
    ctx.addPool({ x: s.x, z: s.z, r: s.r + 0.2, level: SPRING_LVL, deep: '#0e8a9e', shallow: '#3ee0d4', foam: '#f4fffc' });
    PL.piece(Pr.springRim(k, s.r, { spout: k !== 2 }), s.x, s.z, k * 1.3 + 0.4, { y: SPRING_LVL - 0.08 });
    ctx.addLight({ pos: [s.x, SPRING_LVL + 0.4, s.z], color: '#8ae8e0', intensity: 1.4, radius: s.r + 2.5, flicker: 0.15 });
  }
  PL.piece(Pr.oke(0), SPRINGS[0].x + 3.2, SPRINGS[0].z - 0.8, 0.4); PL.piece(Pr.bench(0), SPRINGS[1].x + 2.2, SPRINGS[1].z + 1.6, -0.8); ctx.addCollider(SPRINGS[1].x + 2.2, SPRINGS[1].z + 1.6, 0.5);
  for (const [dx, dz, s] of [[-5.2, 2.6, 1], [3.6, -4.6, 0.9], [-6, -3, 1.1]]) { const x = INN.x + dx, z = INN.z + dz; tree(F.snowPine(1 + (s * 10 | 0) % 3), x, z, 1.8, s); }
  PL.piece(Pr.fenceRun(0, { L: 4 }), INN.x + 4.4, INN.z - 2.8, INN.yaw + Math.PI / 2); PL.piece(Pr.fenceRun(1, { L: 3 }), INN.x - 2.2, INN.z + 4.8, INN.yaw);
  // --- the frozen pond: stepping stones along its rim, a crane or two (critters), a signpost
  for (let k = 0; k < 9; k++) { const a = k / 9 * 6.283 + 0.3, x = POND.x + Math.cos(a) * (POND.r + 0.5), z = POND.z + Math.sin(a) * (POND.r + 0.5); if (ctx.pathDist(x, z) < plan.trailW + 0.8) continue; PL.multi(F.snowRock(k + 4, { R: 0.45, sq: 0.5 }), x, H(x, z) - 0.12, z, { rot: a }); }
  // --- the frozen waterfall on its cliff, icicles along the lip, a frozen plunge pool
  { const fx = FF[0], fz = FF[1];
    PL.piece(Pr.frozenFall(0, { W: FALL.W, H: FALL.H + 0.3 }), FALL.x - fx * 0.2, FALL.z - fz * 0.2, FALL.yaw, { y: LEVEL });
    for (const [u, v, s] of [[-2.4, 0.3, 1.2], [2.5, 0.4, 1], [-3.3, 2.2, 0.8], [3.2, 2.6, 0.9]]) { const x = FALL.x + fz * u + fx * v, z = FALL.z - fx * u + fz * v; PL.multi(F.snowRock(9 + (u * 3 | 0) & 3, { R: 0.7 }), x, H(x, z) - 0.2, z, { rot: u, s }); ctx.addCollider(x, z, 0.6 * s); }
  }
  // --- POIs: the old bathhouse (feature), a snowy roadside shrine (shrine), a signpost and lantern at the cache
  for (const p of plan.pois) {
    if (p.kind === 'feature') { PL.piece(Pr.bathhouse(2), p.x, p.z - 0.6, Math.PI / 4); ctx.addCollider(p.x + 0.9, p.z - 1.4, 1.3); }
    else if (p.kind === 'shrine') { PL.piece(jizo(3), p.x - 1.4, p.z - 2.2, Math.PI / 4); PL.piece(Pr.yukimiLantern(40), p.x + 1.4, p.z - 2.4, Math.PI / 4); ctx.addCollider(p.x - 1.4, p.z - 2.2, 0.35); ctx.addCollider(p.x + 1.4, p.z - 2.4, 0.4); }
    else { PL.piece(Pr.signpost(1), p.x + 2, p.z - 1.6, 0.6); ctx.addCollider(p.x + 2, p.z - 1.6, 0.2); }
  }
  // --- the Frost Princess's frozen lake: a ring of snow-viewing lanterns (their light matters in the whiteout), a torii
  //     at the entrance, firs close round the far shore
  { const A = plan.arena, g = gate, far = g.a + Math.PI, at = (a, r) => [A.x + Math.cos(a) * r, A.z + Math.sin(a) * r];
    PL.piece(Pr.snowTorii(9, { w: 3.2, h: 3.4 }), g.x, g.z, g.yaw);
    for (const s of [-1, 1]) ctx.addCollider(g.x + Math.sin(g.a) * 1.6 * s, g.z - Math.cos(g.a) * 1.6 * s, 0.25);
    for (let k = 0; k < 8; k++) {
      const a = g.a + 0.5 + k / 7 * (Math.PI * 2 - 1.0), [x, z] = at(a, A.r + 0.6);
      PL.piece(Pr.yukimiLantern(20 + k, { s: 1.05 }), x, z, Math.atan2(A.x - x, A.z - z)); ctx.addCollider(x, z, 0.45);
      ctx.arenaLanterns.push(new THREE.Vector3(x, H(x, z) + 1.0, z));
    }
    for (let k = 0; k < 9; k++) { const a = far + (k - 4) * 0.32, [x, z] = at(a, A.r + 4 + (k % 2) * 1.6); if (!Gd.lens(x, z) && !Gd.camSide(x, z)) tree(F.snowFir(k % 5, { H: 6.2 }), x, z, 1.8, rng.range(1, 1.2)); }
    for (let k = 0; k < 10; k++) { const a = rng.range(0, 6.283), [x, z] = at(a, A.r + rng.range(1.6, 3)); PL.multi(F.drift(k, { R: rng.range(0.8, 1.4) }), x, H(x, z) - 0.08, z, { rot: a }); }
    // wind-blown snow lying on the ice in soft flat patches (walkable), thicker toward the shore
    for (let k = 0; k < 16; k++) { const a = rng.range(0, 6.283), rr = k < 10 ? A.r - rng.range(0.5, 2.5) : rng.range(2, A.r - 3), [x, z] = at(a, rr); PL.multi(F.drift(k + 20, { R: rng.range(0.9, 2.2), h: 0.06 }), x, LEVEL + 0.0, z, { rot: a }); }
  }
  // --- the arrival glade: a lantern, a bench under snow
  { const S = plan.start; PL.piece(Pr.yukimiLantern(33), S.x - 2.6, S.z - 2.8, 0.8); ctx.addCollider(S.x - 2.6, S.z - 2.8, 0.4); PL.piece(Pr.bench(1), S.x + 3.2, S.z - 1.8, -0.4); ctx.addCollider(S.x + 3.2, S.z - 1.8, 0.5); }
  handOver(ctx, PL, { lightMul: 0.85 });
}

// ------------------------------------------------------------------ effects + critters
function effects(ctx) {
  const W = ctx.fx, CR = ctx.critters;
  W.snow({ count: 2600, colors: ['#ffffff', '#eef4ff'] });
  W.steam(SPRINGS.map(s => ({ x: s.x, z: s.z, y: SPRING_LVL, r: s.r * 0.75 })), { puffs: 16, size: 1.6, alpha: 0.42 });
  W.steam([{ x: INN.x + 1.6, z: INN.z - 1.2, y: 3.2, r: 0.3 }], { puffs: 5, size: 0.8, alpha: 0.18, rise: 2 }); // chimney
  W.glints({ on: 'land', count: 360, box: [34, 1, 30], colors: ['#ffffff', '#dff0ff'], size: [0.06, 0.12] });
  W.mist({ auto: 8 }, { alpha: 0.14, color: '#dde6ff' });
  W.motes({ count: 140, colors: ['#ffd8a0', '#fff0d0'], y: [0.4, 2.5], alpha: 0.5 });
  if (CR) {
    const big = SPRINGS[0];
    CR.add({ name: 'snowMonkey', geo: monkeyGeo(), count: 4, habitat: 'bath', homes: [{ x: big.x, z: big.z, r: big.r - 0.6 }], speed: 0.25, flee: 0, sink: 0.22, idle: [3, 8] });
    CR.add({ name: 'crane', geo: craneGeo(), count: 3, habitat: 'ground', homes: [{ x: POND.x, z: POND.z, r: POND.r + 3 }], speed: 0.6, flee: 5, hop: 0, idle: [2, 6] });
    CR.add({ name: 'hare', geo: hareGeo(), count: 6, habitat: 'ground', homes: ctx.plan.camps.map(c => ({ x: c.x, z: c.z, r: 9 })), speed: 2.2, flee: 5, hop: 0.22 });
  }
  return null;
}

// ------------------------------------------------------------------ POIs
function interactables(ctx) {
  const { G, world: W, add } = ctx, plan = ctx.layout.plan;
  const V = (x, z) => new THREE.Vector3(x, W.heightAt(x, z), z);
  // the big spring: a soak heals fully and warms you (frost resistance for a while), once per visit
  const s = SPRINGS[0];
  const it = { pos: V(s.x + s.r + 0.6, s.z + 0.6), radius: 1.8, label: 'Soak in the hot spring', onInteract: () => {
    if (it.done) return; it.done = true;
    G.actions?.restoreAll?.(); G.vfx?.heal?.(G.player.pos.clone());
    if (G.combat?.buffs) G.combat.buffs.shrineZoom = { t: 60 };
    G.ui?.toast?.('Ahh… toasty. Fully healed, and zippy for 60s', { icon: 'heart', color: '#8fe0d8' });
    G.audio?.play?.('ui_quest');
    W.interactables.splice(W.interactables.indexOf(it), 1);
  } };
  add(it);
  // the old bathhouse (feature POI): its bell rings for luck
  for (const p of plan.pois.filter(q => q.kind === 'feature')) {
    const b = { pos: V(p.x, p.z + 0.8), radius: 1.8, label: 'Ring the bathhouse bell', onInteract: () => {
      if (b.done) return; b.done = true;
      G.audio?.play?.('env_temple_bell', { pos: V(p.x, p.z) });
      G.vfx?.sparkle?.(V(p.x, p.z).setY(W.heightAt(p.x, p.z) + 1.6), { n: 24, color: '#dff0ff', r: 1 });
      if (G.combat?.buffs) G.combat.buffs.shrineLuck = { t: 90 };
      G.ui?.toast?.('A clear chime rolls over the snow… Lucky: +60% magic find for 90s', { icon: 'clover', color: '#bfe0ff' });
      W.interactables.splice(W.interactables.indexOf(b), 1);
    } };
    add(b);
  }
}

export default {
  id: 'onsen', name: 'Yukimi Onsen', jp: '雪見温泉', sub: 'Snowfall, lanterns and steaming springs', color: '#9ac8ff',
  levels: [26, 35], unlock: { level: 26, after: 'tidepool' },
  monsters: ['yukiwarashi', 'yukidaruma', 'tsurara'], boss: 'yukiOnna',
  // Burrow stand-ins until the region's own monsters / boss are registered (src/regions/monsters, src/regions/bosses)
  fallback: { monsters: ['mochi', 'kasa', 'wisp'], boss: 'nineTails' },
  music: 'region_onsen', bossMusic: 'boss_onsen', ambience: 'region_onsen',
  // snowy blue dusk: a cool sky light from the camera's side, a peach glow on the horizon, warm lantern pools
  mood: {
    sky: { top: '#4e5e9e', horizon: '#f2c6c8', glow: 1.1 }, fog: { color: '#aab6dc', near: 28, far: 100 },
    sun: { color: '#c4d0ff', intensity: 1.55, dir: [0.45, 0.62, 0.42] }, hemi: { sky: '#9aa8dc', ground: '#eef2fc', intensity: 1.3 },
    rim: '#dfe8ff', night: 0.42, clouds: 0.35, shadowTint: '#5a68a8',
    grade: { lift: [0.012, 0.016, 0.04], gain: [0.97, 0.99, 1.05], sat: 0.96, vignette: 1.08, vigColor: [0.12, 0.14, 0.3] },
    bloom: { intensity: 1.15, threshold: 0.7 }, wind: { dir: [0.9, 0.3], strength: 1.0 },
  },
  terrain: {
    height, after, surface, band: [0, 0.8], shoulder: 3,
    palette: {
      grass: ['#a8b8a0', '#8ca090', '#c4ccb8', '#98ac9c'], dirt: ['#9a8e88', '#aca098'], pebble: '#8a8a94',
      trail: { stone: ['#b8bccc', '#cfd2de'], joint: '#eef2fa', dirt: '#c8ccd8', border: '#e4e8f2', stones: 0.85 },
      sand: ['#dcdce4', '#cfd0da'], wetSand: '#8a8e9e',
      rock: ['#8e94a8', '#7a8098', '#a4aabc'], rockMoss: '#7a9078', cliffTop: '#e8eefa',
      moss: ['#5e7a5a', '#7a946a'], litter: ['#7a6a5a', '#8a7a64'], snow: ['#fbfdff', '#dfe6f6'], accent: ['#6a7086', '#7c8298'], under: '#4a6a9a',
    },
    shader: { rockSlope: 0.36, strata: 2.2 },
    grass: { colors: ['#a8b89c', '#90a490', '#d8e0e4', '#b4c4b0'], density: 7, height: [0.18, 0.16], width: [0.08, 0.06], frost: 0.6 },
    water: { level: LEVEL, wade: 0.35, deep: '#2a5a8a', shallow: '#7ab0d0', foam: '#ffffff', frozen: [{ x: POND.x, z: POND.z, r: POND.r + 0.8 }, { x: ARENA[0], z: ARENA[1], r: ARENA[2] + 0.4 }, { x: FALL.x + FF[0] * 1.6, z: FALL.z + FF[1] * 1.6, r: 2.8 }] },
    horizon: { layers: [{ r: 240, h: [28, 60], kind: 'mountains', color: '#8a96c4' }, { r: 180, h: [12, 26], kind: 'forest', color: '#5a6a8a' }] },
  },
  layout: {
    start: [36, 100], startR: 7, arena: ARENA,
    via: [[44, 92], [48, 84], [54, 80], [61, 75], [66, 66], [72, 55], [77, 48], [80, 41]],
    // Yukimi Spa Village (雪見の湯, src/regions/village): the spa village below the hot springs, the trail through its square
    village: { at: [60, 76], r: 12 },
    camps: 7, campR: 6, campGap: 11, pois: 3, poiKinds: ['cache', 'shrine', 'feature'], poiAt: [[45, 67, 'feature'], [74, 28, 'shrine'], [82, 60, 'cache']], lanes: 5, trailW: 1.5,
    open: [[54, 64, 5.5]],
    avoid: [[INN.x, INN.z, 4], ...SPRINGS.map(s => [s.x, s.z, s.r]), [FALL.x, FALL.z, 4]], // (camps may sit out on the frozen pond)
  },
  populate, effects, interactables,
  footstep(pos, world) {
    const x = pos.x, z = pos.z;
    if ((world?.waterAt?.(x, z) ?? 0) > 0.04) return 'footstep_water';
    if (world?.deckAt?.(x, z)) return 'footstep_wood';
    if (world?.terrain?.iceAt?.(x, z)) return 'footstep_stone';
    const s = world?.surfaceAt?.(x, z);
    if (s && s.snow > 0.45) return 'footstep_snow';
    if (s && s.trail > 0.45) return 'footstep_stone';
    return 'footstep_grass';
  },
};
