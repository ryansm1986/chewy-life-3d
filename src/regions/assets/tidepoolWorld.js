// Shiokaze Tidepools: the fixed landmark sites, populate (vegetation / rocks / props, batched), the effects (waves,
// spray, glints, pool bubbles, grotto plankton + mist, critters) and the biome POIs (treasure tide pool, lookout,
// hidden grotto cache). See biomes/tidepool.js for the terrain and docs/REGIONS.md §3.3 / §3.6 for the contracts.
import * as THREE from 'three';
import { makeMats, disposeMats, Placer, hostOf, Occ, V, mulberry32, TAU, fbm, blobDisc } from './tidepoolKit.js';
import * as A from './tidepoolAssets.js';
import { TidepoolFx } from './tidepoolFx.js';

import { TP_SITES, coastDist, LV, poolsFor } from './tidepoolTerrain.js';
export { TP_SITES };
const S = TP_SITES;

// ------------------------------------------------------------------ populate
export function tidepoolPopulate(ctx) {
  const H = hostOf(ctx), T = H.terrain, P = H.plan;
  const M = makeMats({ night: 0 }), PL = new Placer(M), occ = new Occ(), r = mulberry32(4242);
  const h = (x, z) => H.heightAt(x, z);
  const inMap = (x, z, m = 1) => x > m && z > m && x < 112 - m && z < 112 - m;
  const arenaD = (x, z) => Math.hypot(x - S.arena[0], z - S.arena[1]);
  const campD = (x, z) => Math.min(99, ...(P?.camps || []).map(c => Math.hypot(x - c.x, z - c.z) - c.r));
  const startD = (x, z) => Math.hypot(x - S.start[0], z - S.start[1]);
  // big things stay out of the play skeleton; low dressing may sit in the lanes but never on the trail or a fight floor
  const wild = (x, z, pad = 1) => H.openDist(x, z) > pad && arenaD(x, z) > 15;
  const lowOk = (x, z) => H.trailDist(x, z) > 2.3 && campD(x, z) > 0.5 && arenaD(x, z) > 12 && startD(x, z) > 5;
  const cache = new Map(), V3 = (k, f) => { let g = cache.get(k); if (!g) { g = f(); cache.set(k, g); } return g; };
  const putAll = (out, x, y, z, rot = 0, s = 1) => { for (const [k, g] of Object.entries(out)) if (g?.isBufferGeometry) PL.put(k, g, x, y, z, { rot, s }); };
  const piece = (pc, x, z, rot, s = 1, y) => { PL.piece(pc, x, y ?? h(x, z), z, rot, s); };
  const dist = coastDist;

  // ---- landmarks
  { // the sea grotto in the north-west headland, its glowing pool and crystals
    const [gx, gz] = S.grottoMouth, gp = S.grottoPool;
    const g = A.grottoMouth(9);
    PL.put('rock', g.rock, gx, h(gx, gz) - 0.35, gz, { rot: Math.PI / 4 }); PL.put('hot', g.hot, gx, h(gx, gz) - 0.35, gz, { rot: Math.PI / 4 }); PL.put('body', g.body, gx, h(gx, gz) - 0.35, gz, { rot: Math.PI / 4 });
    const m = new THREE.Matrix4().compose(V(gx, h(gx, gz) - 0.35, gz), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI / 4), V(1, 1, 1));
    for (const l of g.lights) PL.lights.push({ ...l, pos: l.pos.clone().applyMatrix4(m) });
    const disc = blobDisc(gp[2], { seed: 3, segs: 30 });
    PL.put('glowWater', disc, gp[0], LV + 0.03, gp[1]);
    for (const [dx, dz] of [[-6, 2], [2, -6], [-3.5, -3.5]]) PL.collider(gx + dx, gz + dz, 2.2);
    occ.mark(gx, gz, 6);
    const rim = A.poolRim(21, gp[2] * 1.02, { gap: Math.PI / 4 }); PL.put('rock', rim.rock, gp[0], LV + 0.05, gp[1]);
  }
  { // the torii standing in the cove and the wedded rocks roped together beyond it
    const [tx, tz] = S.torii; piece(A.seaTorii(2), tx, tz, Math.PI / 4 - 0.25, 1, LV - 0.05); occ.mark(tx, tz, 3);
    const [wx, wz] = S.wedded, w = A.weddedRocks(4), wy = h(wx, wz) - 0.2;
    for (const k of ['rock', 'reed', 'body', 'cloth']) if (w[k]) PL.put(k, w[k], wx, wy, wz, { rot: 0.35 });
    occ.mark(wx, wz, 5);
  }
  { // sea stacks offshore (a tuft of dune grass and a little pine on the bigger crowns)
    S.stacks.forEach(([x, z, Hh, R], i) => {
      const st = V3('stack' + i, () => A.seaStack(10 + i, Hh, R)), y = Math.min(h(x, z), -1.2);
      PL.put('rock', st.rock, x, y, z, { rot: i * 1.7 }); PL.put('reed', st.reed, x, y, z, { rot: i * 1.7 });
      if (Hh > 5) { const pn = V3('pineS' + (i % 2), () => A.coastPine(20 + (i % 2))); putAll(pn, x + 0.2, y + st.top - 0.1, z, i, 0.42); }
      occ.mark(x, z, R + 1);
    });
  }
  { // the wreck on its sandy bay, nets and gear by the start cove and the wreck
    const [x, z] = S.wreck; piece(A.wreck(3), x, z, 0.9); PL.collider(x, z, 1.4); PL.collider(x + 1.2, z - 0.9, 1.0); H.block(x, z, 2); occ.mark(x, z, 3.5);
    for (const [nx, nz2, rot] of S.nets) { piece(A.netRack(5), nx, nz2, rot); PL.collider(nx, nz2, 1.2); occ.mark(nx, nz2, 2.8); }
  }
  { // the lookout on its headland bluff
    const [bx, bz] = S.bluffs[0]; piece(A.lookout(6), bx, bz - 1, Math.PI + 0.2); PL.collider(bx, bz - 1, 0.9); occ.mark(bx, bz - 1, 2.5);
  }
  // ---- tide pools: barnacled rims, and each pool planted with kelp, coral, anemones, urchins, starfish and shells
  poolsFor(P?.camps).forEach(([px, pz, R, sx], i) => {
    const rim = V3('rim' + i, () => A.poolRim(30 + i, R * 1.04, { sx, sz: 1, gap: i === 0 ? Math.PI * 0.25 : -1 }));
    PL.put('rock', rim.rock, px, LV + 0.02, pz);
    const rr = mulberry32(100 + i), fl = LV - 0.34;
    const inside = (k) => { const a = rr() * TAU, d = Math.sqrt(rr()) * R * k; return [px + Math.cos(a) * d * sx, pz + Math.sin(a) * d]; };
    for (let k = 0; k < Math.round(R * 3); k++) { const [x, z] = inside(0.75); PL.put('reed', V3('kelp' + (k % 3), () => A.kelp(k % 3, 0.55)).reed, x, fl, z, { rot: rr() * TAU, s: 0.8 + rr() * 0.5 }); }
    for (let k = 0; k < Math.round(R * 2); k++) { const [x, z] = inside(0.7); PL.put('body', V3('coral' + (k % 4), () => A.coral(k % 4 + 1).body), x, fl, z, { rot: rr() * TAU, s: 1 + rr() * 0.6 }); }
    for (let k = 0; k < Math.round(R * 2.5); k++) { const [x, z] = inside(0.9); PL.put('reed', V3('anem' + (k % 4), () => A.anemone(k % 4 + 1).reed), x, fl, z, { rot: rr() * TAU, s: 1.1 + rr() * 0.5 }); }
    for (let k = 0; k < Math.round(R * 1.5); k++) { const [x, z] = inside(0.85); PL.put('body', V3('urch' + (k % 2), () => A.urchin(k % 2 + 1).body), x, fl, z, { rot: rr() * TAU, s: 1.2 }); }
    for (let k = 0; k < 3; k++) { const a = rr() * TAU, d = R * (1.0 + rr() * 0.12); PL.put('body', V3('star' + (k % 3), () => A.starfish(k + 1).body), px + Math.cos(a) * d * sx, LV + 0.22, pz + Math.sin(a) * d, { rot: rr() * TAU, s: 1.3, tilt: [0.3, 0.2] }); }
    if (i === 0) { const c = A.giantClam(1); piece(c, px, pz, 0.6, 1.25, fl + 0.02); }
    H.block(px, pz, R * 0.8);
    occ.mark(px, pz, R + 0.8);
  });

  // ---- vegetation: wind-bent black pines on the dunes and headlands, thickening into woods toward the back edges
  const pines = [0, 1, 2].map(v => A.coastPine(v + 1));
  for (let i = 0; i < 2400 && i >= 0; i++) {
    const x = 3 + r() * 106, z = 3 + r() * 106, d = dist(x, z);
    if (d < 9 || !wild(x, z, 1.5) || !occ.free(x, z, 2.4)) continue;
    const dens = fbm(x * 0.045 + 3, z * 0.045, 3) + (d > 26 ? 0.25 : 0) + (x + z > 150 ? 0.4 : 0);
    if (dens < 0.08 || r() > 0.55) continue;
    const y = h(x, z); if (y < 0.1) continue;
    putAll(pines[Math.floor(r() * 3)], x, y - 0.05, z, r() * 0.5 - 0.25, 0.85 + r() * 0.45);
    PL.collider(x, z, 0.45); occ.mark(x, z, 2.2);
  }
  // headland pines leaning off the grotto cliffs
  for (let k = 0; k < 7; k++) { const a = r() * TAU, d = 4 + r() * 7, x = S.grotto[0] + Math.cos(a) * d, z = S.grotto[1] + Math.sin(a) * d; if (!inMap(x, z, 0) || !occ.free(x, z, 1.8)) continue; putAll(pines[k % 3], x, h(x, z) - 0.05, z, r(), 0.8 + r() * 0.3); occ.mark(x, z, 1.8); }

  // ---- rock shelves and boulders along the shore, a few loose rocks out in the shallows
  for (let i = 0; i < 1600; i++) {
    const x = r() * 112, z = r() * 112, d = dist(x, z);
    if (d < -3 || d > 4.5 || !wild(x, z, 0.5) || !occ.free(x, z, 2.6)) continue;
    if (fbm(x * 0.06 + 20, z * 0.06, 2) < 0.02) continue;
    const L = 2.6 + r() * 2.6, v = Math.floor(r() * 4);
    const g = V3('shelf' + v, () => A.rockShelf(40 + v, 3.2 + v * 0.5, 2 + (v % 2) * 0.6, 0.7 + (v % 3) * 0.12));
    PL.put('rock', g.rock, x, Math.max(h(x, z), LV - 0.5) - 0.1, z, { rot: r() * TAU, s: L / 4 });
    PL.collider(x, z, L * 0.36); H.block(x, z, L * 0.4); occ.mark(x, z, L * 0.55);
  }
  for (let i = 0; i < 900; i++) {
    const x = r() * 112, z = r() * 112, d = dist(x, z);
    if (d < -5 || d > 7 || !occ.free(x, z, 0.9)) continue;
    const big = wild(x, z, 0.3), s = big ? 0.5 + r() * 0.9 : 0.25 + r() * 0.25;
    if (!big && !lowOk(x, z)) continue;
    const v = Math.floor(r() * 4), g = V3('boulder' + v, () => A.boulder(50 + v, 0.7, 0.55 + v * 0.08));
    PL.put('rock', g.rock, x, h(x, z) - 0.12 * s, z, { rot: r() * TAU, s });
    if (big && s > 0.8) PL.collider(x, z, 0.55 * s);
    occ.mark(x, z, 0.8 * s + 0.3);
  }
  // ---- dune grass fountains and beach morning glory mats; driftwood and shells on the sand
  const grassV = [1, 2, 3].map(v => A.duneGrass(v).reed), gloryV = [1, 2, 3].map(v => A.morningGlory(v).grass);
  for (let i = 0; i < 5200; i++) {
    const x = r() * 112, z = r() * 112, d = dist(x, z);
    if (d < 2.5 || !inMap(x, z) || !lowOk(x, z) || !occ.free(x, z, 0.45)) continue;
    const n = fbm(x * 0.09 + 7, z * 0.09, 2);
    if (d < 16 && n > -0.05 && r() < 0.55) { PL.put('reed', grassV[i % 3], x, h(x, z) - 0.03, z, { rot: r() * TAU, s: 0.85 + r() * 0.6 }); occ.mark(x, z, 0.4); }
    else if (d < 11 && n < -0.15 && r() < 0.3) { PL.put('grass', gloryV[i % 3], x, h(x, z) - 0.005, z, { rot: r() * TAU, s: 1 + r() * 0.5 }); occ.mark(x, z, 0.8); }
  }
  const drift = [1, 2, 3].map(v => A.driftwood(v, 1.6 + v * 0.5).body);
  for (let i = 0, n = 0; i < 400 && n < 18; i++) {
    const x = r() * 112, z = r() * 112, d = dist(x, z);
    if (d < 0.8 || d > 7 || !lowOk(x, z) || !occ.free(x, z, 1.4)) continue;
    PL.put('body', drift[n % 3], x, h(x, z) - 0.04, z, { rot: r() * TAU, s: 0.8 + r() * 0.5 }); occ.mark(x, z, 1.3); n++;
  }
  const shellV = [['scallop', 1], ['spiral', 2], ['cowrie', 3], ['scallop', 4]].map(([k, s]) => A.shell(s, k).body), starV = [5, 6, 7].map(s => A.starfish(s).body), pebV = [1, 2].map(s => A.pebbles(s).stone);
  for (let i = 0; i < 1400; i++) {
    const x = r() * 112, z = r() * 112, d = dist(x, z);
    if (d < -0.6 || d > 6 || !inMap(x, z) || H.trailDist(x, z) < 1.2 || arenaD(x, z) < 10) continue;
    const y = h(x, z) + 0.005, k = r();
    if (k < 0.55) PL.put('body', shellV[i % 4], x, y, z, { rot: r() * TAU, s: 1.2 + r() * 0.8 });
    else if (k < 0.7) PL.put('body', starV[i % 3], x, y, z, { rot: r() * TAU, s: 1.1 + r() * 0.5 });
    else if (k < 0.9) PL.put('stone', pebV[i % 2], x, y - 0.02, z, { rot: r() * TAU, s: 0.8 + r() * 0.6 });
  }
  // ---- kelp beds and coral in the shallows beyond the waterline
  for (let i = 0; i < 700; i++) {
    const x = r() * 112, z = r() * 112, d = dist(x, z);
    if (d > -0.8 || d < -6 || !inMap(x, z, 0) || !occ.free(x, z, 0.5) || arenaD(x, z) < 15) continue;
    const y = h(x, z);
    if (r() < 0.6) PL.put('reed', V3('kelp' + (i % 3), () => A.kelp(i % 3, 0.55)).reed, x, y, z, { rot: r() * TAU, s: Math.min(1.8, (LV - y) * 1.6 + 0.6) });
    else PL.put('body', V3('coral' + (i % 4), () => A.coral(i % 4 + 1).body), x, y, z, { rot: r() * TAU, s: 1.2 + r() * 0.6 });
    occ.mark(x, z, 0.5);
  }
  // ---- the shore arena: packed wet sand, a ring of little marker stones, two roped posts at the entrance, rocks
  //      framing the sea-side ends. The floor itself stays clear.
  {
    const [ax, az] = S.arena, [sx, sz] = S.arenaSea, R = 11.6;
    const stoneG = V3('ringStone', () => A.boulder(77, 0.3, 0.7).rock);
    for (let k = 0; k < 44; k++) {
      const a = k / 44 * TAU, x = ax + Math.cos(a) * R, z = az + Math.sin(a) * R;
      if (Math.cos(a) * sx + Math.sin(a) * sz > 0.35) continue; // leave the sea side open
      PL.put('rock', stoneG, x, h(x, z) - 0.04, z, { rot: a * 3, s: 0.8 + (k % 3) * 0.12 });
    }
    const ends = [1, -1].map(s => { const a = Math.atan2(sz, sx) + s * 1.35; return [ax + Math.cos(a) * 13.5, az + Math.sin(a) * 13.5]; });
    ends.forEach(([x, z], i) => { const g = V3('shelf' + (i + 1), () => A.rockShelf(41 + i, 3.7, 2.6, 0.95)); PL.put('rock', g.rock, x, h(x, z) - 0.15, z, { rot: i * 2 + 0.4, s: 1.1 }); PL.collider(x, z, 1.4); });
    // the entrance: two weathered posts with a shimenawa, facing the trail's arrival
    const tr = P?.trail, e = tr ? tr[tr.length - 1] : [ax - 10, az], ea = Math.atan2(e[1] - az, e[0] - ax), ex = ax + Math.cos(ea) * (R + 1.2), ez = az + Math.sin(ea) * (R + 1.2);
    piece(A.arenaGate(8), ex, ez, Math.atan2(Math.cos(ea), Math.sin(ea)));
    occ.mark(ax, az, 13);
  }
  // ---- the start cove: a lamp by the Wayfarer's Stone and a bench of driftwood
  { const [x, z] = S.start; piece(A.shoreLamp(1), x + 3.2, z - 2.4, -0.7); PL.collider(x + 3.2, z - 2.4, 0.3); }

  const group = PL.build(); H.add(group);
  for (const l of PL.lights) H.light(l);
  for (const c of PL.colliders) H.collider(c.x, c.z, c.r);
  H.onDispose(() => { PL.dispose(); disposeMats(M); });
  if (globalThis.__tpDebug) globalThis.__tpDebug.placer = { count: PL.count, tris: Math.round(PL.tris), batches: PL.batches.size };
  return { placer: PL, mats: M, host: H };
}

// ------------------------------------------------------------------ effects
export function tidepoolEffects(ctx) {
  const fx = new TidepoolFx(hostOf(ctx), TP_SITES, coastDist);
  return { update: (dt, t, focus) => fx.update(dt, t, focus), dispose: () => fx.dispose() };
}

// ------------------------------------------------------------------ POIs
export function tidepoolInteractables(ctx) {
  const G = ctx.G, mode = ctx.mode, W = ctx.world, add = ctx.add;
  const hAt = (x, z) => W.heightAt(x, z);
  const [px, pz] = TP_SITES.pools[0];
  // the treasure tide pool: the giant clam opens for a pearl-bright hoard (once per visit)
  { const p = V(px + 0.6, hAt(px + 0.6, pz), pz);
    const it = { pos: p, radius: 2.2, label: 'Reach into the giant clam', onInteract: () => {
      if (it.done) return; it.done = true;
      const chest = mode.makeChest?.(p.clone().add(V(1.6, 0, 1.2)).setY(hAt(p.x + 1.6, p.z + 1.2)), 'gold');
      chest?.open?.(); G.vfx?.sparkle?.(p.clone().setY(p.y + 0.6), { n: 30, color: '#c8f4ff', r: 0.9 });
      G.ui?.toast?.('The clam yawns open — treasure from the deep!', { icon: 'star', color: '#6ff0ff' });
      W.interactables.splice(W.interactables.indexOf(it), 1);
    } };
    add(it); }
  // the lookout: a telescope sweep over the sea (camera pulls out for a vista) and a little luck
  { const [bx, bz] = TP_SITES.bluffs[0], p = V(bx + 0.3, hAt(bx, bz - 1), bz - 1.3);
    const it = { pos: p, radius: 1.8, label: 'Look through the telescope', onInteract: () => {
      const rig = G.engine?.rig; if (rig) { const d0 = rig.distTarget; rig.distTarget = Math.min(rig.maxDist || 60, d0 * 1.9); setTimeout(() => { rig.distTarget = d0; }, 3200); }
      G.ui?.banner?.('Shiokaze Lookout', 'Whitecaps to the horizon… and something huge sleeping off the north shore.', { style: 'area' });
      if (!it.used) { it.used = true; mode.combat?.buffs && (mode.combat.buffs.shrineLuck = { t: 60 }); G.ui?.toast?.('Sea breeze luck: +60% magic find for 60s', { icon: 'star', color: '#ffd84a' }); }
    } };
    add(it); }
  // hidden cache deep in the sea grotto, behind the glowing pool
  { const [gx, gz] = TP_SITES.grottoMouth, p = V(gx + 0.8, 0, gz - 1.2); p.y = hAt(p.x, p.z);
    const chest = mode.makeChest?.(p, 'gold');
    if (chest) { W.collision?.addCircle?.(p.x, p.z, 0.5); const it = { pos: p, radius: 1.3, label: 'Open the grotto cache', onInteract: () => { if (chest.opened) return; chest.open(); W.interactables.splice(W.interactables.indexOf(it), 1); } }; add(it); } }
}
