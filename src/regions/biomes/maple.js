// Momiji Hollow (紅葉谷) — the biome recipe (docs/REGIONS.md §2 / §3.3).
// The map: golden hour in an autumn valley. The trail starts among harvested rice terraces in the south-east (drying
// racks, straw huts, a scarecrow), climbs past a persimmon orchard, crosses the river on the red arched taikobashi,
// winds up through crimson / orange / gold maples and golden ginkgo past a jizo shrine and a lookout hill, and ends in
// Danzaburō's harvest clearing in the north-west (straw bales, sake barrels, festival lanterns, tanuki statues).
// The river falls from a waterfall at the north-east edge. Assets: src/regions/assets/mapleFlora.js / mapleProps.js.
import * as THREE from 'three';
import * as F from '../assets/mapleFlora.js';
import * as Pr from '../assets/mapleProps.js';
import * as BF from '../assets/bambooFlora.js';
import { Placer, M } from '../assets/bambooKit.js';
import { viewGuard, handOver, polyDist, sstep, trailCrossing, bridgeDeck, alongTrail, arenaGate } from '../biomeKit.js';
import { paint, merge, xf } from '../../gfx/geom.js';

// the river springs from a waterfall on a mossy cliff (north of the crossing, facing south so the camera sees it),
// runs under the taikobashi and wanders off south-west
const FALL = { x: 65.5, z: 45.5, yaw: Math.PI / 4, H: 3.4, W: 3.0 };   // (faces the camera: +x / +z)
const POOL = { x: 67.7, z: 47.7, r: 3.1 };
const RIVER = [[67.4, 48.4], [66.9, 53], [66.8, 57], [63, 61], [57, 66], [50, 71], [42, 78], [30, 88], [16, 98], [2, 110], [-10, 121]];
const RIVER_W = 2.0;
const FIELDS = [[90, 72, 8], [72, 99, 7], [106, 92, 6]]; // harvested rice terraces [x, z, r]
const ORCHARD = { x: 64, z: 80, r: 7 };
// (nothing north of the fall: the river starts at the plunge pool)
const riverDist = (x, z) => polyDist(RIVER, x, z) + Math.sin(x * 0.5 + z * 0.3) * 0.25 + Math.max(0, -((x - POOL.x) * FF[0] + (z - POOL.z) * FF[1])) * 2.5;
const fieldAt = (x, z) => { let k = 0; for (const [fx, fz, r] of FIELDS) k = Math.max(k, 1 - sstep(r - 1.5, r + 1.5, Math.hypot(x - fx, z - fz))); return k; };
// the cliff behind the fall: 0..1 (1 = the plateau top), a crescent wrapped round the pool's north side
const FF = [Math.sin(FALL.yaw), Math.cos(FALL.yaw)];
const cliffAt = (x, z) => {
  const dx = x - FALL.x, dz = z - FALL.z, back = -(dx * FF[0] + dz * FF[1]), lat = Math.abs(dx * FF[1] - dz * FF[0]);
  return sstep(-0.9, 0.3, back + lat * 0.16) * (1 - sstep(6, 13, lat)) * (1 - sstep(10, 18, back));
};

// ------------------------------------------------------------------ terrain
function height(x, z, c) {
  const p = c.play(x, z), n = c.fbm(x * 0.04, z * 0.04, 4), e = c.edge(x, z);
  const wild = 1.4 + n * 1.9 + c.ridge(x * 0.03 - 3, z * 0.03 + 5, 3) * 1.4 + sstep(16, -6, e) * 4.2;
  let h = c.lerp(wild, 0.3 + c.fbm(x * 0.06 + 2, z * 0.06, 3) * 0.2, p);
  // rice terraces: stepped, flat paddies
  const fk = fieldAt(x, z);
  if (fk > 0) h = c.lerp(h, 0.2 + c.terrace(0.3 + (x - 80) * 0.012 + (z - 80) * 0.008, 0.18, 0.2), fk);
  // the plunge pool, and the rocky crescent of cliff behind the fall (over the pool's back edge)
  const pd = Math.hypot(x - POOL.x, z - POOL.z);
  if (pd < POOL.r + 3) h = c.lerp(h, Math.min(h, -0.95), 1 - sstep(POOL.r * 0.6, POOL.r + 2.5, pd));
  const ck = cliffAt(x, z);
  if (ck > 0) h = Math.max(h, c.lerp(h, FALL.H + n * 0.5, ck));
  // the river valley
  const rd = riverDist(x, z);
  if (rd < RIVER_W + 5.5) h = c.lerp(h, Math.min(h, -0.85), 1 - sstep(RIVER_W * 0.55, RIVER_W + 4.5, rd));
  return h;
}
// after the trail carve: cut the river back through it (the taikobashi carries the trail across)
function after(x, z, h, c) {
  const rd = riverDist(x, z);
  if (rd > RIVER_W + 2.4) return h;
  return Math.min(h, c.lerp(h, -0.82, 1 - sstep(RIVER_W * 0.5, RIVER_W + 2.4, rd)));
}
function surface(x, z, h, slope, c, o) {
  const p = c.play(x, z), n = c.n2(x * 0.1, z * 0.1), rd = riverDist(x, z), fk = fieldAt(x, z);
  o.litter = sstep(0.05, 0.6, (1 - p) * 0.75 + n * 0.3 + 0.1) * 0.95 * (1 - fk);   // a carpet of fallen maple leaves
  o.dirt = fk * 0.85;                                                              // the harvested paddies
  o.moss = Math.max(sstep(RIVER_W + 3, RIVER_W + 0.6, rd) * 0.7, cliffAt(x, z) * 0.6);
  o.accent = sstep(RIVER_W + 1.2, RIVER_W, rd) * 0.7;
  // Danzaburō's clearing: trampled harvest ground, straw-strewn, a leafy rim
  const ad = Math.hypot(x - c.arena.x, z - c.arena.z) - c.arena.r;
  const ak = sstep(0, -3, ad), core = sstep(-3, -7, ad + n * 2.2);
  const row = Math.sin((x * Math.sin(0.3) + z * Math.cos(0.3)) * Math.PI / 0.95) > 0.1 ? 1 : 0; // furrows
  o.dirt = Math.max(o.dirt, core * (0.3 + row * 0.35)); o.litter *= 1 - core * 0.5;
  o.grass = (1 - o.litter * 0.75) * (1 - fk * 0.7) * (1 - ak * 0.45) * (1 - core * 0.4);
  return o;
}

// ------------------------------------------------------------------ populate
const DYE_MIX = ['crimson', 'scarlet', 'scarlet', 'orange', 'orange', 'gold', 'turning'];
function populate(ctx) {
  const { rng, plan } = ctx, PL = new Placer({ heightAt: (x, z) => ctx.heightAt(x, z), name: 'maple' });
  const H = (x, z) => ctx.heightAt(x, z), G = viewGuard(ctx);
  const canopy = (x, z, r) => { ctx.paint('litter', x, z, r * 1.5, 0.95); ctx.paintFx('canopy', x, z, r * 1.8, 1); ctx.paintFx('shade', x, z, r * 1.6, 0.6); };
  const tree = (parts, x, z, r, s = 1) => { PL.multi(parts, x, H(x, z) - 0.05, z, { rot: rng.range(0, 6.283), s }); ctx.addCollider(x, z, 0.42 * s); ctx.blockCells(x, z, 0.5 * s); canopy(x, z, r * s); };
  // things the camera must always see: the waterfall, the bridge, the POIs, the arena's entrance
  const cr = trailCrossing(plan, RIVER, 'river'), gate = arenaGate(plan, 1.2);
  const focal = [{ x: FALL.x, z: FALL.z + 1, r: 4.2 }, { x: POOL.x, z: POOL.z, r: POOL.r + 0.5 }, { x: gate.x, z: gate.z, r: 3 }, ...plan.pois.map(p => ({ x: p.x, z: p.z, r: 3.4 }))];
  if (cr) focal.push({ x: cr.x, z: cr.z, r: 4.2 });
  // --- trees: maples of every dye (round domes in the wild, weeping ones by the water, airy tiers along the trail),
  //     ginkgo, persimmons in the orchard, chestnuts. Nothing tall on the camera's side of the trail (or in the lens),
  //     smaller trees right beside it, and nothing hiding the landmarks.
  let n = 0;
  for (let i = 0; i < 22000 && n < 400; i++) {
    const near = i < 12000;
    const x = rng.range(-16, 128), z = rng.range(-16, 128), d = ctx.pathDist(x, z) - plan.trailW - 2.4;
    if (near ? (d < 0 || d > 12) : d < 12) continue;
    const rd = riverDist(x, z);
    if (ctx.waterAt(x, z) > 0.02 || rd < RIVER_W + 1.2 || fieldAt(x, z) > 0.2 || Math.hypot(x - FALL.x, z - FALL.z) < 4.5 || Math.hypot(x - POOL.x, z - POOL.z) < POOL.r + 1) continue;
    if (G.camSide(x, z) || G.lens(x, z)) { // a sapling now and then; the ground cover pass fills the rest
      if (d > 1 && rng.chance(0.08) && ctx.canPlace(x, z, 0.6, { space: 1.4, path: 1.2 }) && !G.hides(x, z, 2.6, focal)) { tree(F.maple('tier', rng.int(1, 3), rng.pick(DYE_MIX)), x, z, 1.2, rng.range(0.45, 0.55)); n++; }
      continue;
    }
    const orch = Math.hypot(x - ORCHARD.x, z - ORCHARD.z) < ORCHARD.r;
    const close = d < 5, s = close ? rng.range(0.7, 0.88) : rng.range(0.88, 1.2), tall = (orch ? 4.2 : 5.6) * s;
    if (G.hides(x, z, tall, focal)) continue;
    const r = orch ? 1.9 : close ? 1.5 : 2.1;
    if (!ctx.canPlace(x, z, r * 0.55, { space: r * 0.9, path: 1.2 })) continue;
    if (orch) tree(F.persimmon(rng.int(0, 2)), x, z, 2, s * 0.9);
    else if (rd < RIVER_W + 4.5) tree(F.maple('weep', rng.int(1, 3), rng.pick(DYE_MIX)), x, z, 1.8, s * 0.9);
    else if (rng.chance(0.12)) tree(F.ginkgo(rng.int(1, 3)), x, z, 1.8, s);
    else if (!close && rng.chance(0.08)) { tree(F.chestnut(rng.int(0, 1)), x, z, 2.2, s); PL.multi(F.burrs(rng.int(0, 2)), x + 1.2, H(x + 1.2, z + 0.8), z + 0.8); }
    else tree(F.maple(close ? 'tier' : rng.chance(0.75) ? 'dome' : 'tier', rng.int(1, 3), rng.pick(DYE_MIX)), x, z, 2.4, s);
    n++;
  }
  // --- ground cover: susuki by the fields and the lane edges, spider lilies on the banks, mushrooms under the trees,
  //     leaf piles, a few mossy boulders
  for (let i = 0; i < 3200; i++) {
    const x = rng.range(0, 112), z = rng.range(0, 112), d = ctx.openDist(x, z), rd = riverDist(x, z);
    if (ctx.waterAt(x, z) > 0.02 || !ctx.isFree(x, z, 0.35, { path: 1.1 }) || Math.hypot(x - POOL.x, z - POOL.z) < POOL.r + 2.5 || cliffAt(x, z) > 0.05 && cliffAt(x, z) < 0.95) continue;
    const y = H(x, z), rot = rng.range(0, 6.283), r = rng.next();
    if (rd < RIVER_W + 3.5 && r < 0.55) PL.multi(F.higanbana(rng.int(0, 2)), x, y, z, { rot });
    else if (fieldAt(x, z) > 0.1 || (d > -1 && d < 4 && r < 0.35)) PL.multi(F.susuki(rng.int(0, 2)), x, y, z, { rot, s: rng.range(0.8, 1.2) });
    else if (d > 2 && r < 0.5) PL.multi(F.mushrooms(rng.int(0, 3), rng.pick(['shiitake', 'amanita', 'shimeji'])), x, y, z, { rot });
    else if (d > 1 && r < 0.62) PL.multi(F.leafPile(rng.int(0, 3), { R: rng.range(0.6, 1.0), h: rng.range(0.3, 0.5), dye: 'mixed' }), x, y, z, { rot });
    else if (d > 3 && r < 0.7) { PL.multi(BF.mossBoulder(rng.int(0, 3), { moss: 0.35 }), x, y - 0.08, z, { rot, s: rng.range(0.7, 1.4) }); ctx.addCollider(x, z, 0.45); }
    else continue;
    ctx.reserve(x, z, 0.5);
  }
  // --- the rice terraces: stubble rows, drying racks (hasa) hung with rice, straw huts, sheaves, a scarecrow
  for (const [fx, fz, fr] of FIELDS) {
    for (let k = 0; k < 7; k++) { const dz = (k - 3) * 1.05; PL.multi(Pr.stubble(k, { L: fr * 1.3 }), fx, H(fx, fz + dz), fz + dz, { rot: 0.1 }); }
    const hx = fx + fr * 0.2, hz = fz - fr * 0.45; PL.piece(Pr.hasa(rng.int(0, 3), { L: 3.4 }), hx, hz, 0.1); ctx.addCollider(hx, hz, 1.2);
    for (let k = 0; k < 3; k++) { const a = rng.range(0, 6.283), rr = rng.range(1, fr - 1.5), x = fx + Math.cos(a) * rr, z = fz + Math.sin(a) * rr; PL.piece(Pr.warabocchi(k, { s: rng.range(0.85, 1.1) }), x, z, rng.range(0, 6.283)); ctx.addCollider(x, z, 0.5); }
    for (let k = 0; k < 4; k++) { const x = fx + rng.range(-fr, fr) * 0.6, z = fz + rng.range(-fr, fr) * 0.6; PL.piece(Pr.sheaf(k), x, z, rng.range(0, 6.283)); }
  }
  { const [fx, fz] = FIELDS[0]; PL.piece(Pr.kakashi(0), fx - 2.4, fz + 1.6, -0.6); ctx.addCollider(fx - 2.4, fz + 1.6, 0.3); }
  // --- stone lanterns / jizo along the trail
  for (const [k, p] of alongTrail(plan, 16).entries()) {
    if (ctx.waterAt(p.x, p.z) > 0.02 || !ctx.isFree(p.x, p.z, 0.4, { path: 0.3, clearings: true })) continue;
    PL.piece(k % 3 === 1 ? Pr.jizo(k) : Pr.lanternLine(k, { L: 1.2, h: 1.9 }), p.x, p.z, p.face); ctx.addCollider(p.x, p.z, 0.35); ctx.reserve(p.x, p.z, 0.9);
  }
  // --- the red taikobashi over the river (an arched deck)
  if (cr) { const tb = Pr.taikobashi(0, { L: 7.6, w: 1.8, rise: 0.85 }); PL.piece(tb, cr.x, cr.z, cr.yaw, { y: 0 }); bridgeDeck(ctx, cr, { half: 3.8, w: 1.7, y: s => tb.deckAt(s) }); }
  // --- the waterfall: a falling sheet, foam at its foot, a glassy pool
  { const fx = Math.sin(FALL.yaw), fz = Math.cos(FALL.yaw);
    const m = PL.mesh(new THREE.Mesh(Pr.waterfallGeo({ W: FALL.W, H: FALL.H + 0.4, lip: 1.0 }), M('fall'))); m.position.set(FALL.x - fx * 0.3, -0.32, FALL.z - fz * 0.3); m.rotation.y = FALL.yaw; m.renderOrder = 2;
    PL.multi(Pr.foam(0, { W: FALL.W }), FALL.x + fx * 0.9, -0.3, FALL.z + fz * 0.9, { rot: FALL.yaw });
    // mossy boulders flanking the lip and the pool
    for (const [u, v, s] of [[-2.2, 0.2, 1.3], [2.3, 0.4, 1.1], [-3.1, 2.4, 0.9], [3.0, 2.8, 1.0], [1.2, 5.2, 0.7]]) {
      const x = FALL.x + fz * u + fx * v, z = FALL.z - fx * u + fz * v;
      PL.multi(BF.mossBoulder(Math.abs(u * 3 | 0) % 4, { moss: 0.5 }), x, H(x, z) - 0.25, z, { rot: u * 2, s }); ctx.addCollider(x, z, 0.5 * s);
    }
    ctx.paint('moss', POOL.x, POOL.z, POOL.r + 3, 0.6); }
  // --- POIs: the lookout on the feature hill, a jizo trio at the shrine, a bench at a cache
  for (const p of plan.pois) {
    if (p.kind === 'feature') { // the lookout: a raised deck you climb onto from the back (-z), railed on the other three sides
      const th = 0.4, ux = Math.cos(th), uz = -Math.sin(th), fx = Math.sin(th), fz = Math.cos(th), y = H(p.x, p.z) + 0.45;
      PL.piece(Pr.lookout(0), p.x, p.z, th, { y: y - 0.45 });
      ctx.addDeck({ pts: [[p.x - ux * 1.5, p.z - uz * 1.5], [p.x + ux * 1.5, p.z + uz * 1.5]], y: [y, y], w: 2.1 });
      for (let k = -3; k <= 3; k++) ctx.addCollider(p.x + ux * k * 0.5 + fx * 1.05, p.z + uz * k * 0.5 + fz * 1.05, 0.2); // front rail
      for (const sd of [-1, 1]) for (const t of [-0.6, 0, 0.6]) ctx.addCollider(p.x + ux * sd * 1.55 + fx * t, p.z + uz * sd * 1.55 + fz * t, 0.2);
      PL.piece(Pr.bench(1), p.x - fx * 2.4 + ux * 2.2, p.z - fz * 2.4 + uz * 2.2, th + Math.PI); ctx.addCollider(p.x - fx * 2.4 + ux * 2.2, p.z - fz * 2.4 + uz * 2.2, 0.5);
    }
    else if (p.kind === 'shrine') { PL.piece(Pr.jizoTrio(), p.x - 1.2, p.z - 2.4, 0); ctx.addCollider(p.x - 1.2, p.z - 2.4, 1); }
    else { PL.piece(Pr.bench(2), p.x + 2.2, p.z + 0.6, -1.2); ctx.addCollider(p.x + 2.2, p.z + 0.6, 0.5); }
  }
  // --- Danzaburō's harvest clearing: straw bales, sheaves and straw huts round the rim, a pyramid of sake barrels
  //     under festival lanterns on the far side (up-screen), rice racks, persimmon trees behind, tanuki statues at the
  //     entrance (the near side stays low: the camera looks in from there)
  { const A = plan.arena, g = gate, far = g.a + Math.PI;
    const at = (a, r) => [A.x + Math.cos(a) * r, A.z + Math.sin(a) * r];
    for (let k = 0; k < 15; k++) {
      const a = g.a + 0.62 + k / 14 * (Math.PI * 2 - 1.24), fk = Math.cos(a - far), [x, z] = at(a, A.r - 0.4 - Math.max(0, fk) * 1.4 + (k % 2) * 0.9);
      if (k % 5 === 2) { PL.piece(Pr.warabocchi(k, { s: 0.9 }), x, z, a); ctx.addCollider(x, z, 0.6); }
      else if (k % 5 === 4) { PL.piece(Pr.sheaf(k), x, z, a); ctx.addCollider(x, z, 0.3); }
      else { PL.piece(Pr.bale(k), x, z, a + Math.PI / 2 + rng.range(-0.3, 0.3)); ctx.addCollider(x, z, 0.6); if (k % 3 === 0) PL.piece(Pr.bale(k + 20), x + rng.range(-0.1, 0.1), z, a + Math.PI / 2, { y: H(x, z) + 1.0 }); }
    }
    { const [x, z] = at(far, A.r + 1.3), H0 = H(x, z), tx = -Math.sin(far), tz = Math.cos(far); // tangent along the rim
      for (const [u, y] of [[-0.62, 0], [0, 0], [0.62, 0], [-0.31, 0.53], [0.31, 0.53], [0, 1.06]]) PL.piece(Pr.komodaru(Math.round(u * 10 + y * 7)), x + tx * u, z + tz * u, far + Math.PI, { y: H0 + y });
      ctx.addCollider(x, z, 1.1);
      const [lx, lz] = at(far - 0.3, A.r + 2.6); PL.piece(Pr.lanternLine(5, { L: 5.2, h: 2.6 }), lx, lz, Math.atan2(tz, -tx) + Math.PI);
      for (const t of [0.25, 0.5, 0.75]) ctx.arenaLanterns.push(new THREE.Vector3(lx - tx * 5.2 * t, H(lx, lz) + 2.1, lz - tz * 5.2 * t)); }
    for (const sd of [-1, 1]) { const a = far + sd * 0.95, [x, z] = at(a, A.r + 2.2); PL.piece(Pr.hasa(sd > 0 ? 1 : 2, { L: 3.4 }), x, z, a + Math.PI / 2); ctx.addCollider(x, z, 1.4);
      const [lx, lz] = at(a + sd * 0.55, A.r + 1.6); PL.piece(Pr.lanternLine(6 + sd, { L: 3.6, h: 2.4 }), lx, lz, a + Math.PI / 2 + sd * 0.4);
      ctx.arenaLanterns.push(new THREE.Vector3(lx, H(lx, lz) + 2, lz)); }
    for (const s of [-1, 1]) { const x = g.x + Math.sin(g.a) * 1.9 * s, z = g.z - Math.cos(g.a) * 1.9 * s; PL.piece(Pr.tanuki(s > 0 ? 1 : 2, { s: 1.2 }), x, z, g.yaw + Math.PI); ctx.addCollider(x, z, 0.5); }
    for (let k = 0; k < 7; k++) { const a = far + (k - 3) * 0.42, [x, z] = at(a, A.r + 6 + (k % 2) * 1.5); if (!G.lens(x, z) && !G.camSide(x, z)) tree(F.persimmon(k % 3), x, z, 2, 1.05); }
    // a few sheaves and a straw hut standing in the far half of the field
    for (const [da, rr, kind] of [[-0.5, 0.55, 's'], [0.35, 0.62, 'w'], [0.9, 0.5, 's'], [-1.1, 0.66, 's']]) {
      const [x, z] = at(far + da, A.r * rr);
      if (kind === 'w') { PL.piece(Pr.warabocchi(31, { s: 0.85 }), x, z, far); ctx.addCollider(x, z, 0.55); } else { PL.piece(Pr.sheaf(40 + rr * 10 | 0), x, z, da * 3); ctx.addCollider(x, z, 0.3); }
    }
    // the harvested floor: rows of rice stubble across the clearing (flat: nothing to trip over)
    for (let k = -4; k <= 4; k++) { const L = Math.round(Math.sqrt(Math.max(0, (A.r - 2) ** 2 - (k * 1.9) ** 2)) * 4) / 2, x = A.x + Math.sin(0.3) * k * 1.9, z = A.z + Math.cos(0.3) * k * 1.9; if (L > 2) PL.multi(Pr.stubble(k + 9, { L }), x, H(x, z), z, { rot: 0.3 }); }
    ctx.paint('litter', A.x, A.z, A.r + 4, 0.55);
  }
  // --- the arrival: a bench and a lantern
  { const S = plan.start; PL.piece(Pr.bench(0), S.x - 3.2, S.z - 1.4, 0.8); ctx.addCollider(S.x - 3.2, S.z - 1.4, 0.5); PL.piece(Pr.jizo(9), S.x + 2.6, S.z - 2.8, -0.5); ctx.addCollider(S.x + 2.6, S.z - 2.8, 0.3); }
  handOver(ctx, PL);
}

// ------------------------------------------------------------------ critter models (+z forward, feet at y = 0)
const sph = (r, c, p = [0, 0, 0], sc = [1, 1, 1]) => { const g = new THREE.SphereGeometry(r, 9, 7); xf(g, { p, s: sc }); return paint(g, (q, nn, o) => o.set(c)); };
const leg = (r, h, c, p) => { const g = new THREE.CylinderGeometry(r, r * 0.8, h, 6); xf(g, { p }); return paint(g, (q, nn, o) => o.set(c)); };
function squirrelGeo() { // a red squirrel with a big curled tail and tufted ears
  const fur = '#c8642a', cream = '#f4e2c4';
  return merge([sph(0.075, fur, [0, 0.09, 0], [0.9, 1, 1.25]), sph(0.05, cream, [0, 0.08, 0.04], [0.8, 0.9, 0.9]), sph(0.055, fur, [0, 0.17, 0.08]),
    sph(0.012, '#1a1010', [0.025, 0.185, 0.125]), sph(0.012, '#1a1010', [-0.025, 0.185, 0.125]), sph(0.018, fur, [0.03, 0.235, 0.07], [0.6, 1.5, 0.6]), sph(0.018, fur, [-0.03, 0.235, 0.07], [0.6, 1.5, 0.6]),
    sph(0.07, fur, [0, 0.16, -0.12], [0.8, 1.5, 0.8]), sph(0.06, '#d8763a', [0, 0.28, -0.1], [0.8, 1, 0.9])]);
}
function deerGeo() { // a sika deer: spotted chestnut coat, white rump, slender legs
  const coat = '#a8683e', spot = '#f4e8d0';
  const P = [sph(0.26, coat, [0, 0.72, 0], [0.75, 0.75, 1.45]), sph(0.13, coat, [0, 1.02, 0.34], [0.8, 1.3, 0.8]), sph(0.1, coat, [0, 1.2, 0.44], [0.85, 0.85, 1.1]),
    sph(0.045, '#3a2a22', [0, 1.17, 0.56]), sph(0.02, '#1a1010', [0.05, 1.23, 0.5]), sph(0.02, '#1a1010', [-0.05, 1.23, 0.5]),
    sph(0.05, coat, [0.08, 1.31, 0.4], [0.6, 1.4, 0.4]), sph(0.05, coat, [-0.08, 1.31, 0.4], [0.6, 1.4, 0.4]), sph(0.09, spot, [0, 0.78, -0.33], [1, 1, 0.6])];
  for (let k = 0; k < 8; k++) P.push(sph(0.028, spot, [(k % 2 ? 1 : -1) * 0.17, 0.8 + (k % 3) * 0.05, -0.2 + k * 0.06], [1, 0.6, 1]));
  for (const [x, z] of [[0.1, 0.24], [-0.1, 0.24], [0.1, -0.24], [-0.1, -0.24]]) P.push(leg(0.028, 0.6, '#8a5432', [x, 0.3, z]));
  return merge(P);
}

// ------------------------------------------------------------------ effects + critters
function effects(ctx) {
  const W = ctx.fx, CR = ctx.critters, CM = ctx.CRITTER_MODELS;
  W.leaves({ kind: 'mixed', mask: 'canopy', count: 360, gust: 1.5, swirl: 1.4, colors: ['#e2482e', '#f47034', '#ffb84e', '#c42e2a'] });
  W.leaves({ kind: 'ginkgo', mask: 'canopy', count: 90, colors: ['#ffd84a', '#f4c030'] });
  W.shafts({ auto: 12 }, { color: '#ffd08a', alpha: 0.14 });
  W.motes({ count: 300, colors: ['#ffe0a0', '#fff0c8'], y: [0.4, 4] });
  W.mist(RIVER.slice(2, 7).map(([x, z]) => ({ x, z, r: 4.5, y: -0.2 })), { alpha: 0.13, color: '#fff0dc' });
  { const fx = Math.sin(FALL.yaw), fz = Math.cos(FALL.yaw);
    W.spray([0, 1, 2].map(k => ({ x: FALL.x + fx * 1.1 + fz * (k - 1) * 1.0, z: FALL.z + fz * 1.1 - fx * (k - 1) * 1.0, y: -0.3, dir: { x: fx, z: fz } })), { every: [0.5, 1.3], size: 1.2, range: 36 });
    W.mist([{ x: POOL.x, z: POOL.z, r: 3.2, y: -0.4 }], { alpha: 0.2, color: '#ffffff', scale: 0.7 }); }
  W.glints({ on: 'water', count: 160, box: [30, 1, 26], colors: ['#fff6d8', '#ffe0a8'] });
  if (CR && CM) {
    const lanes = ctx.plan.camps.map(c => ({ x: c.x, z: c.z, r: 10 }));
    CR.add({ name: 'akatombo', geo: CM.butterfly({ body: '#b82a1a', wing: '#ffb8a0' }), count: 14, habitat: 'air', homes: [...lanes, ...FIELDS.map(([x, z, r]) => ({ x, z, r }))], alt: [0.9, 2.2], speed: 2.2, flee: 0, flap: { from: 0.01, speed: 26, amp: 0.7 } });
    CR.add({ name: 'crow', geo: CM.bird({ body: '#2a2a34', belly: '#3a3a46', head: '#22222a', beak: '#3a3432', s: 1.3 }), count: 6, habitat: 'ground', homes: FIELDS.map(([x, z, r]) => ({ x, z, r })), speed: 1.3, flee: 5, hop: 0.12, flap: { from: 0.05, speed: 14, amp: 0.8 } });
    CR.add({ name: 'squirrel', geo: squirrelGeo(), count: 8, habitat: 'ground', homes: [...lanes, { x: ORCHARD.x, z: ORCHARD.z, r: ORCHARD.r }], speed: 2.4, flee: 4, hop: 0.16, idle: [1, 3] });
    CR.add({ name: 'deer', geo: deerGeo(), count: 3, habitat: 'ground', homes: RIVER.slice(4, 8).map(([x, z]) => ({ x, z, r: 7 })), speed: 1.1, flee: 7, hop: 0, idle: [3, 7] });
    CR.add({ name: 'koi', geo: CM.fish({ body: '#ff7a3a', fin: '#fff0e0', s: 1.3 }), count: 8, habitat: 'water', homes: RIVER.slice(3, 7).map(([x, z]) => ({ x, z, r: 3 })), speed: 0.7, flee: 2, depth: [0.2, 0.35], shadow: false });
  }
  return null;
}

// ------------------------------------------------------------------ POIs
function interactables(ctx) {
  const { G, mode, world: W, add } = ctx, plan = ctx.layout.plan;
  const V = (x, z) => new THREE.Vector3(x, W.heightAt(x, z), z);
  // big leaf piles near the camps: kick one and it bursts into a flurry (and sometimes a treat)
  const rng = mode.rng;
  for (const c of plan.camps.slice(0, 5)) {
    const a = rng.range(0, 6.283), p = V(c.x + Math.cos(a) * (c.r + 1.8), c.z + Math.sin(a) * (c.r + 1.8));
    if (!W.walkable(p.x, p.z)) continue;
    const pile = F.leafPile(7 + (c.x | 0) % 3, { R: 1.1, h: 0.62, dye: 'mixed' });
    const meshes = Object.entries(pile).map(([k, g]) => { const m = new THREE.Mesh(g, M(k)); m.position.copy(p); m.castShadow = true; W.scene.add(m); return m; });
    const it = { pos: p, radius: 1.5, label: 'Jump in the leaf pile', onInteract: () => {
      if (it.done) return; it.done = true;
      for (const m of meshes) m.parent?.remove(m);
      G.vfx?.petals?.(p.clone().setY(p.y + 0.4), 50); G.vfx?.poof?.(p.clone().setY(p.y + 0.3), { color: '#f4a050', n: 10, size: 0.8 });
      G.audio?.play?.('footstep_leaves', { vol: 1.2 }); G.player?.anim?.play?.('happy');
      if (rng.chance(0.55)) mode.loot?.drop(p.clone().setY(p.y + 0.3), [{ type: 'coins', n: rng.int(1, 4) * (mode.layout.mlvl || 12) }, ...(rng.chance(0.4) ? [{ type: 'potion', key: rng.chance(0.6) ? 'heart' : 'zoom' }] : [])]);
      W.interactables.splice(W.interactables.indexOf(it), 1);
    } };
    add(it);
  }
  // the lookout: a sweeping view of the valley and a little luck
  for (const p of plan.pois.filter(q => q.kind === 'feature')) {
    const it = { pos: V(p.x, p.z), radius: 1.8, label: 'Take in the view', onInteract: () => {
      const rig = G.engine?.rig; if (rig) { rig.distBiasTarget = 16; setTimeout(() => { if (G.dungeon === mode) rig.distBiasTarget = 0; }, 3600); }
      G.ui?.banner?.('Momiji Lookout', 'Red and gold as far as the eye can see… and a big round silhouette by the harvest fields.', { style: 'area' });
      if (!it.used) { it.used = true; if (G.combat?.buffs) G.combat.buffs.shrineXp = { t: 90 }; G.ui?.toast?.('Autumn wind: +50% experience for 90s', { icon: 'sparkle', color: '#ffc080' }); }
    } };
    add(it);
  }
}

export default {
  id: 'maple', name: 'Momiji Hollow', jp: '紅葉谷', sub: 'Golden light and a thousand falling leaves', color: '#e8743a',
  levels: [11, 19], unlock: { level: 11, after: 'bamboo' },
  monsters: ['kuri', 'kakashi', 'momijiWisp'], boss: 'danzaburo',
  // Burrow stand-ins until the region's own monsters / boss are registered (src/regions/monsters, src/regions/bosses)
  fallback: { monsters: ['kasa', 'tanuki', 'kinoko'], boss: 'oniChef' },
  music: 'region_maple', bossMusic: 'boss_maple', ambience: 'region_maple',
  // golden hour: a low warm sun from the west, long shadows, amber haze, red and gold everywhere
  mood: {
    sky: { top: '#9cc8e8', horizon: '#ffe6c0', glow: 1.4 }, fog: { color: '#f6dcb8', near: 34, far: 120 },
    sun: { color: '#ffe2b6', intensity: 2.9, dir: [0.8, 0.52, -0.08] }, hemi: { sky: '#ffeccc', ground: '#a07a58', intensity: 1.2 },
    rim: '#ffe0b0', night: 0, clouds: 0.24, shadowTint: '#6a5a8a',
    grade: { lift: [0.018, 0.012, 0.008], gain: [1.02, 1.0, 0.97], sat: 0.98, vignette: 1.0, vigColor: [0.26, 0.13, 0.08] },
    bloom: { intensity: 0.9, threshold: 0.78 }, wind: { dir: [0.6, -0.8], strength: 0.95 },
  },
  terrain: {
    height, after, surface, band: [0, 0.8], shoulder: 3,
    palette: {
      grass: ['#b4c07a', '#96ac66', '#cccb8c', '#a4b874'], dirt: ['#b89a74', '#c8ae88'], pebble: '#a08a70',
      trail: { stone: ['#e2d6c0', '#f0e6d0'], joint: '#c8b48a', dirt: '#d8c098', border: '#e0cca8', stones: 0.9 },
      sand: ['#ecd8b0', '#e0cca0'], wetSand: '#b8a07e',
      rock: ['#a89888', '#948478', '#b8a898'], rockMoss: '#8a9a58', cliffTop: '#a8b068',
      moss: ['#8a9a4a', '#a8b060'], litter: ['#e8703a', '#f0a040', '#c84a30'], snow: ['#fbfdff', '#e4ecfa'], accent: ['#a89888', '#bcaa98'], under: '#5a9ab0',
    },
    shader: { rockSlope: 0.34, strata: 2.6 },
    grass: { colors: ['#b0c274', '#8eaa60', '#cccc88', '#a0b86e'], density: 18, height: [0.26, 0.26], width: [0.1, 0.08], tipMul: [1.15, 1.08, 0.82], tipAdd: [0.1, 0.06, 0.0] },
    water: { level: -0.3, wade: 0.35, deep: '#3a6a8a', shallow: '#7ab8b0', foam: '#fff8ec' },
    horizon: { layers: [{ r: 240, h: [24, 52], kind: 'mountains', color: '#c88a70' }, { r: 180, h: [12, 26], kind: 'forest', color: '#b8603a' }] },
  },
  layout: {
    start: [96, 100], startR: 7, arena: [22, 22, 11],
    via: [[88, 88], [79, 79], [70, 66], [62, 56], [52, 49], [42, 43], [33, 35]],
    // Akane Hamlet (茜の里, src/regions/village): the harvest hamlet mid-trail, between the orchard and the rice terraces
    village: { at: [78, 79], r: 12.5, clear: 4 }, // (clear: the hamlet keeps its land free of the wild's trees for 4 m round)
    camps: 7, campR: 6.5, campGap: 12, pois: 3, poiKinds: ['cache', 'shrine', 'feature'], poiAt: [[58, 42, 'feature'], [52, 62, 'cache'], [98, 84, 'shrine']], lanes: 4.5, trailW: 1.45,
    avoid: [...FIELDS.map(([x, z, r]) => [x, z, r - 1]), [ORCHARD.x, ORCHARD.z, 1], [FALL.x, FALL.z, 5], ...RIVER.slice(0, 9).map(([x, z]) => [x, z, 3.4])], // (+ the site's own radius)
  },
  populate, effects, interactables,
  footstep(pos, world) {
    const x = pos.x, z = pos.z;
    if ((world?.waterAt?.(x, z) ?? 0) > 0.04) return 'footstep_water';
    if (world?.deckAt?.(x, z)) return 'footstep_wood';
    const s = world?.surfaceAt?.(x, z);
    if (s && s.trail > 0.45) return 'footstep_stone';
    if (s && s.litter > 0.45) return 'footstep_leaves';
    return 'footstep_grass';
  },
};
