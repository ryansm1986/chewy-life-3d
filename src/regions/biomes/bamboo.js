// Whispering Bamboo Grove (竹林) — the biome recipe (docs/REGIONS.md §2 / §3.3).
// The map: a misty morning in rolling bamboo hills. The trail climbs from the arrival glade (south-west) past lantern-lit
// bends, crosses the stream on a little footbridge, winds through groves where arching culms lean over the path and
// ends in the Tengu's clearing (north-east): a flat mossy ring under a torii, wind chimes and a sacred rock.
// Assets: src/regions/assets/bambooFlora.js / bambooProps.js (drawn through the bambooKit Placer).
import * as THREE from 'three';
import * as F from '../assets/bambooFlora.js';
import * as Pr from '../assets/bambooProps.js';
import { Placer, M } from '../assets/bambooKit.js';
import { Events } from '../../core/events.js';
import { farAt, spots, tallOk, gladeGround } from '../../cozy/wildKit.js';

// the stream (world metres, north → south-east); it crosses the trail once, under the footbridge
const STREAM = [[34, -8], [37, 10], [33, 26], [39, 42], [38, 56], [41, 70], [50, 86], [58, 104], [62, 122]];
const STREAM_W = 1.35;
const POND = { x: 72, z: 74, r: 4.6 };
const sstep = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
function polyDist(pts, x, z) {
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], vx = bx - ax, vz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1)));
    const dx = x - ax - vx * t, dz = z - az - vz * t; const d = dx * dx + dz * dz; if (d < best) best = d;
  }
  return Math.sqrt(best);
}
const streamDist = (x, z) => polyDist(STREAM, x, z) + Math.sin(x * 0.7 + z * 0.4) * 0.18;
// where the trail crosses the stream (cached per plan): the footbridge goes here
const _cross = new WeakMap();
function crossing(plan) {
  if (_cross.has(plan)) return _cross.get(plan);
  let best = null;
  const tr = plan.trail;
  for (let i = 0; i < tr.length - 1; i++) {
    const [x, z] = tr[i], d = polyDist(STREAM, x, z);
    if (!best || d < best.d) { const [nx, nz] = tr[Math.min(tr.length - 1, i + 2)], [px, pz] = tr[Math.max(0, i - 2)]; best = { x, z, d, i, yaw: Math.atan2(nx - px, nz - pz) }; }
  }
  _cross.set(plan, best);
  return best;
}

// ------------------------------------------------------------------ terrain
function height(x, z, c) {
  const p = c.play(x, z), n = c.fbm(x * 0.045, z * 0.045, 4);
  // the wild: rolling bamboo hills, crested ridges, rising toward the map edges
  const e = c.edge(x, z);
  const wild = 1.5 + n * 1.7 + c.ridge(x * 0.028 + 4, z * 0.028 - 2, 3) * 1.8 + sstep(18, -6, e) * 4.8;
  const ground = 0.32 + c.fbm(x * 0.06 + 9, z * 0.06, 3) * 0.22;
  let h = c.lerp(wild, ground, p);
  // the stream valley: soft banks down to a pebbly bed
  const sd = streamDist(x, z);
  if (sd < STREAM_W + 5) { const bed = -0.78 + Math.min(0.1, sd * 0.05); h = c.lerp(h, Math.min(h, bed), 1 - sstep(STREAM_W * 0.55, STREAM_W + 4.2, sd)); }
  // the lily pond
  const pd = Math.hypot(x - POND.x, z - POND.z);
  if (pd < POND.r + 4) h = c.lerp(h, Math.min(h, -0.72), 1 - sstep(POND.r * 0.6, POND.r + 3, pd));
  return h;
}
// after the trail carve: cut the stream back through it (the footbridge deck carries the trail across)
function after(x, z, h, c) {
  const sd = streamDist(x, z);
  if (sd > STREAM_W + 2.2) return h;
  const k = 1 - sstep(STREAM_W * 0.5, STREAM_W + 2.2, sd);
  return Math.min(h, c.lerp(h, -0.74, k));
}
function surface(x, z, h, slope, c, o) {
  const n = c.n2(x * 0.11, z * 0.11), p = c.play(x, z), sd = streamDist(x, z);
  o.litter = sstep(0.1, 0.7, (1 - p) * 0.8 + n * 0.35) * 0.85;          // bamboo-leaf litter carpets the groves
  o.moss = sstep(0.2, 0.75, c.fbm(x * 0.07 + 3, z * 0.07, 3) + 0.3) * (0.4 + 0.6 * (1 - p));
  if (sd < STREAM_W + 3) o.moss = Math.max(o.moss, 1 - sstep(STREAM_W + 0.5, STREAM_W + 3, sd)); // mossy banks
  o.grass = 1 - o.litter * 0.8;
  o.accent = sstep(STREAM_W + 1.2, STREAM_W, sd) * 0.8;                 // pebbles in the bed
  return o;
}

// ------------------------------------------------------------------ populate
function populate(ctx) {
  const { rng, plan } = ctx, PL = new Placer({ heightAt: (x, z) => ctx.heightAt(x, z), name: 'bamboo' });
  const H = (x, z) => ctx.heightAt(x, z);
  const open = (x, z) => ctx.openDist(x, z);
  // --- the bamboo: walls at the edges, groves in the wild, clumps and young stands framing the lanes, arches over the trail
  const standAt = (kind, x, z, r) => {
    const v = rng.int(0, 1), rot = rng.range(0, 6.283);
    PL.multi(F.stand(kind, v), x, H(x, z) - 0.05, z, { rot, s: rng.range(0.9, 1.12) });
    ctx.addCollider(x, z, r * 0.55); ctx.blockCells(x, z, r * 0.6);
    ctx.paint('litter', x, z, r * 1.6, 0.9); ctx.paint('moss', x, z, r * 0.9, 0.5);
    ctx.paintFx('canopy', x, z, r * 2.2, 1); ctx.paintFx('shade', x, z, r * 2.8, 0.85);
  };
  // two passes: first the stands that frame the lanes (what the camera actually sees), then the wild behind them
  let stands = 0;
  for (let i = 0; i < 20000 && stands < 640; i++) {
    const near = i < 11000 && stands < 420;
    // distance from the trail / spurs (not the play lanes: the grove closes in round the path, clearings stay open)
    const x = rng.range(-16, 128), z = rng.range(-16, 128), d = ctx.pathDist(x, z) - plan.trailW - 2.0;
    if (near ? (d < 0 || d > 11) : d < 11) continue;
    if (ctx.waterAt(x, z) > 0.02 || streamDist(x, z) < STREAM_W + 1.2 || Math.hypot(x - POND.x, z - POND.z) < POND.r + 1.5) continue;
    // the camera looks from +x / +z (yaw 45°): a tall stand within ~9 m on that side of a lane would hide the hero,
    // so the camera side only gets short young culms (the far side and the wild get the tall walls)
    // (only the trail's own view matters: a stand between the trail and a camp further off is fine)
    const pd = (u, v) => ctx.pathDist(u, v) < plan.trailW + 2.2, clr = (u, v) => ctx.inStart(u, v, 1) || ctx.inCamp(u, v) || ctx.inArena(u, v) || ctx.inPoi(u, v);
    const camSide = pd(x - 2.6, z - 2.6) || pd(x - 4.6, z - 4.6) || pd(x - 6.6, z - 6.6) || pd(x - 8.6, z - 8.6) || clr(x - 2.4, z - 2.4) || clr(x - 4, z - 4) || ctx.inStart(x - 7, z - 7, 2);
    // …and nothing tall sits where the camera itself is (up to ~17 m out on that side of the trail and the arrival glade)
    const lens = pd(x - 11, z - 11) || pd(x - 14, z - 14) || pd(x - 17, z - 17) || ctx.inStart(x - 11, z - 11, 3) || ctx.inArena(x - 12, z - 12, 2);
    if (camSide || lens) { if (d > 1.2 && rng.chance(0.6) && ctx.canPlace(x, z, 0.5, { space: 0.75, path: 1.2 })) { standAt('young', x, z, 1.0); stands++; } continue; }
    const kind = d < 1.6 ? (rng.chance(0.3) ? 'arch' : rng.chance(0.55) ? 'clump' : 'young') : d < 7 ? (rng.chance(0.65) ? 'grove' : 'clump') : d < 14 ? 'grove' : 'wall';
    const r = { wall: 2.6, grove: 2.0, arch: 1.7, clump: 1.4, young: 1.0 }[kind];
    // (spacing: the reserved radius around a stand is checked by its neighbours too, so ~0.6 of its size keeps groves dense)
    if (!ctx.canPlace(x, z, r * 0.5, { space: r * 0.62, path: 1.2 })) continue;
    if (kind === 'arch') { // lean out over the trail
      const v = rng.int(0, 1), gx = open(x + 0.5, z) - open(x - 0.5, z), gz = open(x, z + 0.5) - open(x, z - 0.5);
      PL.multi(F.stand('arch', v), x, H(x, z) - 0.05, z, { rot: Math.atan2(-gx, -gz) + rng.range(-0.3, 0.3) }); // (bows toward the lane)
      ctx.addCollider(x, z, 0.8); ctx.paint('litter', x, z, 2.6, 0.8); ctx.paintFx('canopy', x, z, 3.6, 1); ctx.paintFx('shade', x, z, 4.2, 0.8);
    } else standAt(kind, x, z, r);
    stands++;
  }
  // --- understorey: ferns, hostas, moss cushions, mossy boulders, shoots and litter along the lane edges
  for (let i = 0; i < 3600; i++) {
    const x = rng.range(0, 112), z = rng.range(0, 112), d = open(x, z);
    if (d < 0.4 || d > 7 || ctx.waterAt(x, z) > 0.02 || !ctx.isFree(x, z, 0.35, { path: 1.2 })) continue;
    const r = rng.next(), y = H(x, z), rot = rng.range(0, 6.283);
    if (r < 0.32) PL.multi(F.fern(rng.int(0, 3), { big: rng.range(0.9, 1.4) }), x, y, z, { rot });
    else if (r < 0.46) PL.multi(F.hosta(rng.int(0, 2), rng.pick(['blue', 'variegated', 'gold'])), x, y, z, { rot, s: rng.range(0.85, 1.2) });
    else if (r < 0.62) PL.multi(F.mossMound(rng.int(0, 3)), x, y - 0.02, z, { rot, s: rng.range(0.8, 1.4) });
    else if (r < 0.7) { PL.multi(F.mossBoulder(rng.int(0, 3)), x, y - 0.08, z, { rot, s: rng.range(0.7, 1.5) }); ctx.addCollider(x, z, 0.45); }
    else if (r < 0.8) { for (let k = 0; k < 3; k++) PL.multi(F.shoot(rng.int(0, 5)), x + rng.range(-0.5, 0.5), y, z + rng.range(-0.5, 0.5), { rot: rng.range(0, 6.283), s: rng.range(0.7, 1.2) }); }
    else PL.multi(F.litter(rng.int(0, 3), 'bamboo'), x, y + 0.01, z, { rot, s: rng.range(0.9, 1.6) });
    ctx.reserve(x, z, 0.45);
  }
  // --- stone lanterns every ~14 m along the trail, alternating sides; a mossy stone step where it climbs
  const tr = plan.trail;
  let acc = 0, side = 1;
  for (let i = 1; i < tr.length; i++) {
    const [x0, z0] = tr[i - 1], [x1, z1] = tr[i]; acc += Math.hypot(x1 - x0, z1 - z0);
    if (acc < 14) continue; acc = 0; side = -side;
    const tx = x1 - x0, tz = z1 - z0, l = Math.hypot(tx, tz) || 1, nx = -tz / l * side, nz = tx / l * side;
    const x = x1 + nx * (plan.trailW + 1.3), z = z1 + nz * (plan.trailW + 1.3);
    if (ctx.waterAt(x, z) > 0.02 || !ctx.isFree(x, z, 0.4, { path: 0.3, clearings: true })) continue;
    PL.piece(Pr.lantern(rng.int(0, 3)), x, z, Math.atan2(-nx, -nz)); ctx.addCollider(x, z, 0.3); ctx.reserve(x, z, 0.8);
  }
  // --- the footbridge over the stream
  const cr = crossing(plan);
  if (cr) {
    PL.piece(Pr.footbridge(1, { L: 5.2, w: 1.5 }), cr.x, cr.z, cr.yaw, { y: 0 });
    const dx = Math.sin(cr.yaw), dz = Math.cos(cr.yaw);
    ctx.addDeck({ pts: [[cr.x - dx * 2.9, cr.z - dz * 2.9], [cr.x, cr.z], [cr.x + dx * 2.9, cr.z + dz * 2.9]], y: [0.3, 0.52, 0.3], w: 1.5 });
    // monsters path over it too: open the grid cells under the deck (the layout grid was cut from the terrain alone)
    const L = ctx.layout; for (let t = -3.2; t <= 3.2; t += 0.5) { const cx = Math.floor((cr.x + dx * t) / 2), cy = Math.floor((cr.z + dz * t) / 2); if (cx >= 0 && cy >= 0 && cx < L.W && cy < L.H) L.grid[cy * L.W + cx] = 1; }
    ctx.reserve(cr.x, cr.z, 3.2);
  }
  // --- the shishi-odoshi by the pond (it clacks: an animated rocker), a bench and stepping stones
  { const x = POND.x - POND.r - 1.2, z = POND.z + 0.6, s = Pr.shishiOdoshi(0);
    PL.piece(s.pc, x, z, Math.PI * 0.5);
    const m = PL.mesh(new THREE.Mesh(s.rocker.geo, M('d:body'))); m.castShadow = true; m.receiveShadow = true;
    const q = new THREE.Vector3(s.rocker.pivot.x, s.rocker.pivot.y, s.rocker.pivot.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI * 0.5);
    m.position.set(x + q.x, H(x, z) + q.y, z + q.z); m.rotation.y = Math.PI * 0.5;
    ctx.shishi = m; ctx.addCollider(x, z, 0.6);
    PL.piece(Pr.bambooBench(0), POND.x + 1.5, POND.z + POND.r + 1.8, Math.PI); ctx.addCollider(POND.x + 1.5, POND.z + POND.r + 1.8, 0.5);
    for (let k = 0; k < 5; k++) { const a = -0.9 + k * 0.45, xx = POND.x + Math.cos(a) * (POND.r - 0.4), zz = POND.z + Math.sin(a) * (POND.r - 0.4); PL.put('d:stone', Pr.slab(k + 3, { R: 0.3, moss: 0.4 }), xx, -0.28, zz, { rot: k }); }
  }
  // --- POIs: the ruined shrine at the 'feature', a lantern at each cache
  for (const p of plan.pois) {
    if (p.kind === 'feature') { PL.piece(Pr.ruinedShrine(0), p.x, p.z - 1.8, 0); ctx.addCollider(p.x, p.z - 2.2, 1.3); ctx.paint('moss', p.x, p.z, 4, 0.8); }
    else PL.piece(Pr.lantern(7), p.x + 2.2, p.z + 0.4, -1.2);
  }
  // --- the Tengu's clearing: a ring of lanterns, a torii facing the trail's arrival, wind chimes and the sacred rock
  { const A = plan.arena, e = tr[tr.length - 1], ea = Math.atan2(e[1] - A.z, e[0] - A.x);
    const gx = A.x + Math.cos(ea) * (A.r + 1.4), gz = A.z + Math.sin(ea) * (A.r + 1.4);
    PL.piece(Pr.torii(2, { w: 3.2, h: 3.4 }), gx, gz, Math.atan2(Math.cos(ea), Math.sin(ea))); // (the passage faces the trail) ctx.addCollider(gx + Math.sin(ea) * 1.7, gz - Math.cos(ea) * 1.7, 0.3); ctx.addCollider(gx - Math.sin(ea) * 1.7, gz + Math.cos(ea) * 1.7, 0.3);
    for (let k = 0; k < 7; k++) {
      const a = ea + Math.PI * 0.32 + k / 7 * Math.PI * 1.4, x = A.x + Math.cos(a) * (A.r + 0.8), z = A.z + Math.sin(a) * (A.r + 0.8);
      PL.piece(Pr.lantern(k + 11), x, z, Math.atan2(A.x - x, A.z - z)); ctx.addCollider(x, z, 0.3);
      ctx.arenaLanterns.push(new THREE.Vector3(x, H(x, z) + 1.0, z));
    }
    const ra = ea + Math.PI, rx = A.x + Math.cos(ra) * (A.r + 2.4), rz = A.z + Math.sin(ra) * (A.r + 2.4);
    PL.piece(Pr.iwakura(1, { R: 1.3 }), rx, rz, ra); ctx.addCollider(rx, rz, 1.3);
    PL.piece(Pr.chimes(0, { L: 4.2 }), A.x + Math.cos(ra + 0.9) * (A.r + 1.8), A.z + Math.sin(ra + 0.9) * (A.r + 1.8), ra + 0.9 + Math.PI / 2);
    // soft moss floor with a ring of fallen leaves
    ctx.paint('moss', A.x, A.z, A.r - 1, 0.55); ctx.paint('litter', A.x, A.z, A.r + 3, 0.5);
  }
  // --- the arrival glade: a bench and a lantern by the Wayfarer's Stone
  { const S = plan.start; PL.piece(Pr.bambooBench(1), S.x + 3.4, S.z + 1.6, -0.6); ctx.addCollider(S.x + 3.4, S.z + 1.6, 0.5); PL.piece(Pr.lantern(21), S.x - 2.8, S.z + 2.6, 0.8); ctx.addCollider(S.x - 2.8, S.z + 2.6, 0.3); }
  wildDressing(ctx, PL);
  // hand everything over to the world
  ctx.add(PL.build());
  for (const c of PL.colliders) ctx.addCollider(c.x, c.z, c.r);
  for (const b of PL.blockers) ctx.blockCells(b.x, b.z, b.r);
  for (const l of PL.lights) ctx.addLight({ ...l, nightOnly: false, intensity: (l.intensity ?? 3) * 0.7 });
  ctx.onDispose(() => PL.dispose());
}

// ------------------------------------------------------------------ the wild areas and the glades (docs/COZY.md §6)
// The Fallen Shrine: an old shrine's cracked platform and hokora on the far rim, its stone lanterns knocked over, loose
// steps in the leaf litter. The Kamaitachi Thicket: culm clumps closing in round the far rim, scratched mossy boulders,
// deep litter. Tall things only on the far half (the camera looks from +x / +z). In a saved zone, the emptied camp
// sites grow back as glades: hostas in flower, ferns, moss (one shared batch each: no new draw calls).
function wildDressing(ctx, PL) {
  const H = (x, z) => ctx.heightAt(x, z);
  for (const [w, a] of (ctx.plan.wild || []).entries()) {
    ctx.paint('litter', a.x, a.z, a.r + 1.5, 0.8); ctx.paint('moss', a.x, a.z, a.r * 0.75, 0.3);
    const boulder = (s, sc) => { PL.multi(F.mossBoulder(s.rnd() * 4 | 0), s.x, H(s.x, s.z) - 0.1, s.z, { rot: s.rot, s: sc }); ctx.addCollider(s.x, s.z, 0.45 * sc); };
    if (a.id === 'fallenShrine') {
      const [x, z] = farAt(a, 0.6), rot = Math.PI / 4;
      PL.piece(Pr.ruinedShrine(3), x, z, rot); ctx.addCollider(x - 0.28, z - 0.28, 1.4); ctx.blockCells(x - 0.3, z - 0.3, 1.5); ctx.reserve(x, z, 3.2);
      // its lanterns, knocked over in the leaves; one still standing by the steps
      { const [lx, lz] = farAt(a, 0.36, 0.55); PL.piece(Pr.lantern(51), lx, lz, rot); ctx.addCollider(lx, lz, 0.3); ctx.reserve(lx, lz, 0.8); }
      for (const s of spots(ctx, a, 3, { k0: 0.3, k1: 0.85, r: 0.5, path: 1.4, seed: 31 + w })) { PL.piece(Pr.lantern(60 + (s.rnd() * 9 | 0)), s.x, s.z, s.rot, { y: H(s.x, s.z) + 0.22, tiltX: 1.45 }); ctx.addCollider(s.x, s.z, 0.35); }
      for (const s of spots(ctx, a, 9, { k0: 0.1, k1: 0.95, r: 0.35, path: 0.6, seed: 41 + w })) PL.put('d:stone', Pr.slab(s.rnd() * 9 | 0, { R: 0.3 + s.rnd() * 0.12, moss: 0.55 }), s.x, H(s.x, s.z) + 0.01, s.z, { rot: s.rot });
      for (const s of spots(ctx, a, 4, { k0: 0.75, k1: 1.0, r: 0.6, seed: 47 + w })) boulder(s, 0.8 + s.rnd() * 0.6);
    } else {
      // the thicket: clumps close in round the far rim, short young culms on the camera side
      for (const s of spots(ctx, a, 16, { k0: 0.74, k1: 1.06, r: 0.85, space: 1.35, path: 1.6, seed: 53 + w })) {
        const tall = tallOk(a, s.x, s.z, 2);
        PL.multi(F.stand(tall ? (s.rnd() < 0.5 ? 'clump' : 'arch') : 'young', s.rnd() * 2 | 0), s.x, H(s.x, s.z) - 0.05, s.z, { rot: s.rot });
        ctx.addCollider(s.x, s.z, tall ? 0.7 : 0.45); ctx.blockCells(s.x, s.z, tall ? 0.8 : 0.5); ctx.paintFx('canopy', s.x, s.z, 3, 1); ctx.paintFx('shade', s.x, s.z, 3.6, 0.85);
      }
      for (const s of spots(ctx, a, 6, { k0: 0.35, k1: 0.95, r: 0.6, path: 1.2, seed: 61 + w })) boulder(s, 0.7 + s.rnd() * 0.7);
      for (const s of spots(ctx, a, 7, { k0: 0.3, k1: 0.72, r: 0.7, space: 2.6, path: 1.6, seed: 63 + w })) { PL.multi(F.stand('young', s.rnd() * 2 | 0), s.x, H(s.x, s.z) - 0.05, s.z, { rot: s.rot }); ctx.addCollider(s.x, s.z, 0.45); ctx.blockCells(s.x, s.z, 0.5); }
      for (const s of spots(ctx, a, 10, { k0: 0.1, k1: 0.95, r: 0.4, path: 0.5, seed: 67 + w })) PL.multi(F.litter(s.rnd() * 4 | 0, 'bamboo'), s.x, H(s.x, s.z) + 0.01, s.z, { rot: s.rot, s: 1.2 + s.rnd() * 0.6 });
    }
    for (const s of spots(ctx, a, 7, { k0: 0.82, k1: 1.0, r: 0.4, path: 1.2, seed: 71 + w })) PL.multi(F.fern(s.rnd() * 4 | 0, { big: 1.1 + s.rnd() * 0.3 }), s.x, H(s.x, s.z), s.z, { rot: s.rot });
  }
  if (!ctx.peaceful) return;
  for (const [i, g] of ctx.glades.entries()) {
    gladeGround(ctx, g);
    for (const s of spots(ctx, g, 9, { k0: 0.12, k1: 0.8, r: 0.4, path: 1.2, seed: 101 + i })) {
      const q = s.rnd(), y = H(s.x, s.z);
      if (q < 0.5) PL.multi(F.hosta(s.rnd() * 3 | 0, s.rnd() < 0.5 ? 'variegated' : 'gold'), s.x, y, s.z, { rot: s.rot, s: 1 + s.rnd() * 0.3 });
      else if (q < 0.8) PL.multi(F.fern(s.rnd() * 4 | 0, { big: 1 + s.rnd() * 0.3 }), s.x, y, s.z, { rot: s.rot });
      else PL.multi(F.mossMound(s.rnd() * 4 | 0), s.x, y - 0.02, s.z, { rot: s.rot, s: 0.9 + s.rnd() * 0.5 });
    }
  }
}

// ------------------------------------------------------------------ effects + critters
function effects(ctx) {
  const W = ctx.fx, CR = ctx.critters, CM = ctx.CRITTER_MODELS;
  W.shafts({ auto: 20 }, { color: '#fff2c0', alpha: 0.17 });
  W.mist({ auto: 12 }, { alpha: 0.2, color: '#eef6e8' });
  W.mist(STREAM.slice(2, 7).map(([x, z]) => ({ x, z, r: 4, y: -0.1 })), { alpha: 0.16, color: '#eaf6ee' }); // mist on the stream
  W.bambooLeaves({ mask: 'canopy', count: 190 });
  W.motes({ count: 320, colors: ['#fff6d0', '#f4ffe0'] });
  W.fireflies({ mask: 'shade', count: 70 });
  W.glints({ on: 'water', count: 160, box: [30, 1, 26] });
  if (CR && CM) {
    const lane = ctx.plan.camps.map(c => ({ x: c.x, z: c.z, r: 9 }));
    CR.add({ name: 'sparrow', geo: CM.bird({ body: '#a07850', belly: '#f0e2c8', head: '#6a4a30', beak: '#3a2a20' }), count: ctx.peaceful ? 18 : 12, habitat: 'ground', homes: [...lane, { x: ctx.plan.start.x, z: ctx.plan.start.z, r: 8 }], speed: 1.4, flee: 4, hop: 0.14, flap: { from: 0.05, speed: 18, amp: 0.8 } });
    CR.add({ name: 'frog', geo: CM.frog({ body: '#6aba4a', belly: '#e8f0b0' }), count: 8, habitat: 'ground', homes: [...STREAM.slice(3, 7).map(([x, z]) => ({ x: x + 2.4, z, r: 2.5 })), { x: POND.x, z: POND.z, r: POND.r + 2 }], speed: 1.1, flee: 2.5, hop: 0.25 });
    CR.add({ name: 'butterfly', geo: CM.butterfly({ wing: '#ffe07a' }), count: ctx.peaceful ? 16 : 10, habitat: 'air', homes: lane, alt: [0.8, 1.8], speed: 1.2, flee: 0, flap: { from: 0.01, speed: 14, amp: 1.1 } });
  }
  const shishi = ctx.shishi; let clacked = false;
  return { update: (dt, t) => {
    if (!shishi) return;
    const c = Pr.shishiCycle(t); shishi.rotation.z = c.a;
    // the clack: once per cycle as the rocker strikes the stone (positional, heard near the pond)
    if (c.clackWindow && !clacked) { clacked = true; Events.emit('sfx', 'env_shishi_odoshi', { pos: shishi.position }); } else if (!c.clackWindow) clacked = false;
  } };
}

// ------------------------------------------------------------------ POIs
function interactables(ctx) {
  const { G, world: W, add } = ctx, plan = ctx.layout.plan;
  const V = (x, z) => new THREE.Vector3(x, W.heightAt(x, z), z);
  // the ruined shrine: a clap and a bow bring the grove's blessing (luck) once per visit
  for (const p of plan.pois.filter(q => q.kind === 'feature')) {
    const it = { pos: V(p.x, p.z - 0.4), radius: 1.8, label: 'Clap at the ruined shrine', onInteract: () => {
      if (it.done) return; it.done = true;
      G.vfx?.sparkle?.(V(p.x, p.z - 1.6).setY(W.heightAt(p.x, p.z) + 1.2), { n: 26, color: '#d8ffb0', r: 1 });
      if (G.combat?.buffs) G.combat.buffs.shrineLuck = { t: 90 };
      G.ui?.toast?.('The old shrine hums… Lucky: +60% magic find for 90s', { icon: 'clover', color: '#b8f08a' });
      G.audio?.play?.('ui_quest');
      W.interactables.splice(W.interactables.indexOf(it), 1);
    } };
    add(it);
  }
  // the bench by the pond: a rest to the shishi-odoshi's clack heals fully (once per visit)
  const it = { pos: V(POND.x + 1.5, POND.z + POND.r + 1.8), radius: 1.6, label: 'Rest by the water clapper', onInteract: () => {
    if (it.done) return; it.done = true;
    G.actions?.restoreAll?.(); G.vfx?.heal?.(G.player.pos.clone());
    G.ui?.toast?.('Clack… clack… You feel completely refreshed.', { icon: 'heart', color: '#8fe0c0' });
    W.interactables.splice(W.interactables.indexOf(it), 1);
  } };
  add(it);
}

export default {
  id: 'bamboo', name: 'Whispering Bamboo Grove', jp: '竹林', sub: 'Misty paths through singing bamboo', color: '#6fbf73',
  levels: [4, 12], unlock: { level: 4, after: null },
  monsters: ['takenoko', 'kodama', 'kamaitachi'], boss: 'tenguMaster',
  // Burrow stand-ins until the region's own monsters / boss are registered (src/regions/monsters, src/regions/bosses)
  fallback: { monsters: ['kinoko', 'dustbunny', 'tanuki'], boss: 'kasaLord' },
  music: 'region_bamboo', bossMusic: 'boss_bamboo', ambience: 'region_bamboo',
  // a misty green-gold morning: low warm sun slanting through the culms, cool jade shade, soft white fog in the hollows
  mood: {
    sky: { top: '#a8dcc4', horizon: '#eef6dc', glow: 1.2 }, fog: { color: '#dcead0', near: 24, far: 92 },
    sun: { color: '#fff0c8', intensity: 2.4, dir: [0.55, 0.62, 0.45] }, hemi: { sky: '#cce4c8', ground: '#5e7042', intensity: 1.12 },
    rim: '#f0ffd8', night: 0, clouds: 0.3, shadowTint: '#4a7a5a',
    grade: { lift: [0.015, 0.02, 0.015], gain: [1.0, 1.01, 0.95], sat: 0.98, vignette: 1.08, vigColor: [0.14, 0.22, 0.14] },
    bloom: { intensity: 0.85, threshold: 0.8 }, wind: { dir: [0.8, 0.6], strength: 0.75 },
  },
  terrain: {
    height, after, surface, band: [0, 0.8], shoulder: 3,
    palette: {
      grass: ['#a8dc84', '#80c07a', '#cce696', '#8ccc98'], dirt: ['#bca88a', '#cdb898'], pebble: '#a09888',
      trail: { stone: ['#dcd6c8', '#ece6d8'], joint: '#a8bc88', dirt: '#cfc0a2', border: '#d8cbb0', stones: 1 },
      sand: ['#e8dcc0', '#dccfb0'], wetSand: '#b8a88c',
      rock: ['#c8c4b8', '#b4b8b0', '#d8d2c4'], rockMoss: '#8ab872', cliffTop: '#a8cc84',
      moss: ['#7cb45a', '#9ccc6a'], litter: ['#e4d08a', '#d8b870', '#c8c878'], snow: ['#fbfdff', '#e4ecfa'], accent: ['#a8a090', '#bcb4a4'], under: '#58a890',
    },
    shader: { rockSlope: 0.34, strata: 2.4 },
    grass: { colors: ['#9cd878', '#6cb866', '#c4e490', '#7cc488'], density: 24, height: [0.24, 0.22], width: [0.1, 0.08] },
    water: { level: -0.3, wade: 0.35, deep: '#2e7a6e', shallow: '#6ac8a8', foam: '#f4fff8' },
    horizon: { layers: [{ r: 240, h: [26, 58], kind: 'mountains', color: '#8ab4a0' }, { r: 180, h: [12, 26], kind: 'forest', color: '#6a9a70' }] },
  },
  layout: {
    start: [16, 96], startR: 7, arena: [92, 20, 11],
    // (the trail crosses the stream, then runs straight through Takemori Village — left to right across the screen, just
    // below its square — before turning north for the Tengu's clearing)
    via: [[24, 84], [26, 71], [33, 63], [43, 67], [49.5, 64.5], [56.5, 59.5], [63.5, 52.5], [68, 44], [72, 35], [81, 28]],
    // Takemori Village (竹守村, src/regions/village): the clearing mid-trail, between the footbridge and the Tengu's clearing
    village: { at: [55, 58], r: 14 },
    camps: 7, campR: 6.5, campGap: 12, pois: 3, poiKinds: ['cache', 'shrine', 'feature'], lanes: 4.5, trailW: 1.45, // (narrow lanes: the grove closes in)
    poiAt: [[22, 49, 'feature'], [81, 49, 'shrine']], // (fixed: the village takes the middle of the trail, where random sites used to land)
    avoid: [[POND.x, POND.z, POND.r + 6], ...STREAM.slice(1, 8).map(([x, z]) => [x, z, 5])],
    // the wild areas (docs/COZY.md §6.2): they keep their yokai once Takemori is saved; off the trail, on side paths
    wild: [
      { id: 'thicket', name: 'the Kamaitachi Thicket', jp: '鎌鼬の藪', at: [94, 70], r: 12, packs: 3 },
      { id: 'fallenShrine', name: 'the Fallen Shrine', jp: '崩れ社', at: [16, 24], r: 12, packs: 2 },
    ],
  },
  populate, effects, interactables,
  footstep(pos, world) {
    const x = pos.x, z = pos.z;
    if ((world?.waterAt?.(x, z) ?? 0) > 0.04) return 'footstep_water';
    if (world?.deckAt?.(x, z)) return 'footstep_wood';
    const s = world?.surfaceAt?.(x, z);
    if (s && s.trail > 0.45) return 'footstep_stone';
    if (s && s.litter > 0.5) return 'footstep_leaves';
    return 'footstep_grass';
  },
};
