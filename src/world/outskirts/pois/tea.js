// The Bamboo Tea Garden (ROADMAP HP-1; the concept: tools/blender/work/codex/hollow-pois/concepts/poi-02-tea.png): an
// open timber tea pavilion under a green curved-tile gable roof (rope-lashed log posts and beams, crossed log ends,
// rolled bamboo blinds, a low back rail), its plank floor with a round tea table, a celadon teapot and cups, four sage
// cushions and two cream paper lanterns; a squat mossy stone lantern; a round stone basin with a bamboo spout; a
// bamboo deer scarer fed by the basin's overflow that slowly fills, tips, pours and swings back with a clack; a raked
// gravel bed with three mossy stones; stepping stones from the trail; a low timber-and-rope fence; bamboo clumps,
// ferns, flowering shrubs. Interaction: "Sit for tea" (a cushion; the day's first sit is a cup of green tea, a Zen
// buff; after that a rest).
import * as THREE from 'three';
import { G, V, PI, col } from '../../buildings/kit.js';
import { chochin, bamboo, toro, blossomGeo, nz, faceColors } from '../../buildings/props.js';
import { tube, puff } from '../../../gfx/geom.js';
import { clamp, TAU, smoothstep } from '../../../core/util.js';
import { site, bare, lineDist, boulder, groundStone, stepStone, pebbles, post, rope, flowers, fern, tuft, shrub, mossyStone, fanGeo, blob, pivotKit, WOOD, WOOD_HI, WOOD_D, ROPE, tris } from './_west.js';

const ROOF = '#67875b', ROOF_HI = '#86a874', ROOF_D = '#4c6a45', TIMBER = '#bd853f', TIMBER_D = '#8a5a30', STRAW = '#d9bf83';
const BAMBOO = '#8fb04f', BAMBOO_D = '#5f8a35', STONE_B = ['#8d8890', '#cfc9cc'];
const PAV = { x: 0.8, z: -2.0, w: 3.2, d: 3.0 }; // the pavilion: centre (local), floor width (x) and depth (z); its front faces south (+z)
const BASIN = { x: 4.0, z: -0.75 }, U = [0.75, 0.66]; // the basin, and the way its overflow runs to the deer scarer
const LINES = [
  'Warm tea, soft cushions and the bamboo whispering. I could stay here all afternoon.',
  'Tea tastes better in a garden. Everyone knows that. Well, I know that.',
  'Listen... clack! The bamboo keeps time for us.',
];

export function build(ctx) {
  const S = site(ctx, 0.1), { H } = S;
  const P = PAV, hw = P.w / 2, hd = P.d / 2;
  const gy = Math.max(H(P.x - hw, P.z - hd), H(P.x + hw, P.z - hd), H(P.x - hw, P.z + hd), H(P.x + hw, P.z + hd));
  const FT = gy + 0.36; // the floor's top (local)
  const ux = U[0] / Math.hypot(...U), uz = U[1] / Math.hypot(...U);
  const scarer = { x: BASIN.x + ux * 1.16, z: BASIN.z + uz * 1.16, y: H(BASIN.x + ux * 1.16, BASIN.z + uz * 1.16) + 0.25, yaw: Math.atan2(-ux, -uz) };
  const stones = [[0.78, -0.12, 0.34], [0.2, 0.72, 0.33], [-0.72, 1.22, 0.31], [-1.72, 1.45, 0.33], [-2.72, 1.55, 0.3]];
  const GRAVEL = { x: -1.15, z: 3.75, rx: 1.95, rz: 1.5 };

  // the lawn is worn bare under the pavilion, the stepping stones, the gravel bed and round the basin
  bare(S, (x, z) => (Math.abs(x - P.x) < hw + 0.5 && Math.abs(z - P.z) < hd + 0.55)
    || lineDist(x, z, stones.map(s => [s[0], s[1]]).concat([[-3.7, 1.6]])) < 0.5
    || ((x - GRAVEL.x) / (GRAVEL.rx + 0.35)) ** 2 + ((z - GRAVEL.z) / (GRAVEL.rz + 0.35)) ** 2 < 1
    || Math.hypot(x - BASIN.x - ux * 0.6, z - BASIN.z - uz * 0.6) < 1.3);

  const inst = S.kit(202, B => {
    B.push([P.x, 0, P.z]); pavilion(B, S, FT); B.pop();
    // ---- the stepping stones from the trail to the step, the gravel bed, its stones
    stones.forEach(([x, z, r]) => stepStone(B, S, x, z, r));
    gravel(B, S, GRAVEL);
    // ---- the basin, its spout, the overflow channel and the deer scarer's frame and striker stone
    basin(B, S, BASIN.x, BASIN.z, ux, uz);
    scarerFrame(B, S, scarer, ux, uz);
    // ---- the squat stone lantern
    B.at([3.75, H(3.75, -3.75) - 0.04, -3.75], -0.6, () => { const ly = toro(B, { s: 1.15 }); B.light([0, ly + 0.05, 0], { color: '#ffc070', intensity: 1.8, radius: 4.5, flicker: 0.5 }); });
    // ---- mossy rocks round the edges and by the water
    for (const [x, z, r] of [[3.1, 0.55, 0.42], [5.6, -1.6, 0.5], [3.2, -2.2, 0.36], [5.9, 1.45, 0.42], [3.9, -4.95, 0.45], [-2.4, -4.2, 0.5], [-0.5, 0.05, 0.3], [-2.75, 2.35, 0.38], [2.4, 3.4, 0.55], [1.2, 5.3, 0.45], [-2.9, -1.0, 0.36], [-2.25, 5.7, 0.4]]) groundStone(B, S, x, z, r, { sink: 0.28, moss: 0.4 });
    // ---- the low timber-and-rope fence along the trail side (the way in left open), round the gravel's south
    fence(B, S, [[-3.35, -5.4], [-3.42, -3.6], [-3.5, -1.8], [-3.55, 0.25]]);
    fence(B, S, [[-3.5, 2.75], [-3.3, 4.55], [-2.45, 5.95], [-0.95, 6.45], [0.55, 6.3]]);
    // ---- bamboo clumps framing the back, flowering shrubs, ferns, flowers
    for (const [x, z, n, h] of [[-0.6, -6.4, 4, 4.2], [2.3, -6.5, 3, 3.8], [5.6, -4.9, 4, 4.4], [6.7, -1.6, 3, 3.6]]) B.at([x, H(x, z) - 0.05, z], 0, () => bamboo(B, { n, h, spread: 0.55 }));
    shrub(B, S, -2.4, -2.6, { r: 0.5, flowers: ['#ffb2cc', '#ff8fb4', '#ffffff'], nf: 18, fs: 0.085 });
    shrub(B, S, 4.6, 3.3, { r: 0.45, flowers: ['#ff8fb4', '#ffc4d8'], nf: 16, fs: 0.08 });
    shrub(B, S, 3.0, 4.3, { r: 0.62, flowers: ['#ffb2cc', '#ff8fb4', '#ffc4d8', '#ffffff'], nf: 26, fs: 0.09 });
    shrub(B, S, 5.3, 2.6, { r: 0.45, color: '#5aa548' });
    shrub(B, S, -1.6, -5.4, { r: 0.45, color: '#4f9a3c' });
    shrub(B, S, 5.0, -3.0, { r: 0.4, flowers: ['#ffffff'], nf: 10 });
    for (const [x, z] of [[-1.85, 2.45], [-2.6, -3.3], [2.6, 0.4], [5.0, -2.6], [3.3, -5.6], [-0.2, 5.9], [1.7, 4.6], [-3.0, 3.6], [6.0, 0.4], [4.4, 1.6], [3.5, 0.0], [2.9, -1.7], [5.1, -1.0], [6.2, 1.9], [2.0, 3.0], [0.7, 5.6], [-2.6, 6.2], [-3.0, -4.6], [-1.6, -3.8], [4.2, -4.4], [-0.1, 1.6], [1.8, 1.9]]) fern(B, S, x, z, { s: 0.75 + S.rnd() * 0.3 });
    for (const [x, z, n] of [[-1.3, 2.25, 5], [-2.9, 1.2, 4], [2.2, 1.1, 5], [3.8, 0.9, 4], [4.6, -2.0, 5], [-2.0, -1.4, 4], [0.6, 5.0, 5], [-1.8, 5.6, 4], [2.6, -4.6, 4], [-0.1, 2.3, 3]]) flowers(B, S, x, z, { n, r: 0.4, colors: ['#ffb2cc', '#ff8fb4', '#ffffff', '#fff3f8'] });
    for (const [x, z] of [[-3.0, -2.3], [0.1, -4.2], [4.1, 2.4], [-3.1, 5.0], [6.1, -3.2]]) tuft(B, S, x, z, { h: 0.45 });
    pebbles(B, S, BASIN.x + ux * 0.72, BASIN.z + uz * 0.72, 14, 0.4, { size: 0.06 });
    pebbles(B, S, BASIN.x, BASIN.z, 10, 0.9, { size: 0.07 });
    pebbles(B, S, -1.2, 1.3, 7, 1.4);
    B.height = 3.4;
  });

  // ---- the deer scarer: a bamboo tube on its axle that fills, tips, pours and swings back to clack on its stone
  const tubeK = pivotKit(S, 203, B => scarerTube(B), { x: scarer.x, y: scarer.y, z: scarer.z, yaw: scarer.yaw });
  const pourK = pivotKit(S, 204, B => { // the pour, from the tipped mouth down to the pebbles
    const pts = [0, 1, 2, 3, 4].map(k => { const t = k / 4; return { p: V(0, 0.01 - t * 0.05 - t * t * 0.04, 0.5 + t * 0.07), r: 0.028 - t * 0.008 }; });
    B.add(tube(pts, 6, false), '#bfeaf2', 'jet');
  }, { x: scarer.x, y: scarer.y, z: scarer.z, yaw: scarer.yaw });
  pourK.group.rotation.x = 0.36; pourK.group.visible = false;
  const REST = -0.28, TIP = 0.36, PERIOD = 7.2;
  const clackAt = S.W(scarer.x + ux * 0.37, scarer.y - 0.1, scarer.z + uz * 0.37);
  let lastPhase = 0;

  // ---- walkable floor, colliders
  const fw = S.W(P.x, FT, P.z);
  ctx.deck({ x0: fw.x - hw, z0: fw.z - hd, x1: fw.x + hw, z1: fw.z + hd, h: () => fw.y });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) S.collide(P.x + sx * (hw - 0.15), P.z + sz * (hd - 0.15), 0.16);
  S.collide(P.x, P.z - 0.05, 0.5); // (the tea table)
  for (let k = 0; k <= 5; k++) S.collide(P.x - hw + 0.2 + k * (P.w - 0.4) / 5, P.z - hd + 0.12, 0.17); // (the back rail)
  for (let k = 1; k <= 4; k++) S.collide(P.x + hw - 0.12, P.z - hd + 0.2 + k * (P.d - 0.4) / 5, 0.17); // (the east rail)
  S.collide(BASIN.x, BASIN.z, 0.48);
  S.collide(scarer.x, scarer.z, 0.32); S.collide(BASIN.x - 0.55, BASIN.z - 0.45, 0.12);
  S.collide(3.75, -3.75, 0.38);
  for (const [x, z, r] of [[5.6, -1.6, 0.5], [5.9, 1.45, 0.42], [3.9, -4.95, 0.45], [-2.4, -4.2, 0.5], [2.4, 3.4, 0.55], [1.2, 5.3, 0.45], [-2.25, 5.7, 0.4], [-2.75, 2.35, 0.38]]) S.collide(x, z, r * 0.8);
  for (const [x, z] of [[-1.0, 3.5], [-1.85, 3.95]]) S.collide(x, z, 0.45);

  // ---- sit for tea: the back cushion, facing out over the garden
  const seat = S.W(P.x, FT, P.z - 0.85);
  S.interact({
    x: P.x, z: P.z + hd + 0.45, r: 1.5, label: 'Sit for tea',
    onInteract() {
      ctx.sit({
        x: seat.x, z: seat.z, y: seat.y - 0.1, face: 0, dur: 6,
        onDone: rested => {
          if (!rested) return;
          if (ctx.daily('tea')) { ctx.treat('greenTea'); ctx.say(LINES[(ctx.G.state?.day || 1) % LINES.length]); } else ctx.rest();
        },
      });
    },
  });

  return {
    tris: tris(inst.group) + tris(tubeK.group) + tris(pourK.group),
    update(dt, t, night, dist) {
      // the deer scarer's cycle: fill (sinking as it gets heavy), tip, pour, swing back, clack, a little bounce
      const u = t % PERIOD; let a;
      if (u < 5.2) a = REST + 0.07 * (u / 5.2) ** 2;
      else if (u < 5.75) a = REST + 0.07 + (TIP - REST - 0.07) * smoothstep(5.2, 5.75, u) ** 1.6;
      else if (u < 6.2) a = TIP + Math.sin((u - 5.75) * 14) * 0.02;
      else if (u < 6.52) a = TIP + (REST - 0.04 - TIP) * ((u - 6.2) / 0.32) ** 2;
      else a = REST - 0.04 * Math.max(0, Math.cos((u - 6.52) * 9)) * Math.exp(-(u - 6.52) * 5) - 0.0;
      a = Math.max(a, REST - 0.04);
      tubeK.group.rotation.x = Math.max(REST, Math.min(TIP, a));
      pourK.group.visible = u > 5.65 && u < 6.3;
      if (lastPhase < 6.5 && u >= 6.5 && dist < 24) ctx.sfx('build_place', clackAt);
      lastPhase = u;
    },
  };
}

// ------------------------------------------------------------------ the pavilion (its frame: centre at the floor's
// middle, ground level at y = 0 of the kit, the floor's top at FT; +z the front)
function pavilion(B, S, FT) {
  const P = PAV, hw = P.w / 2, hd = P.d / 2, H = (x, z) => S.H(P.x + x, P.z + z);
  const wood = (c, k = 0.12) => (p, n, o) => o.set(c).multiplyScalar(1 - k + k * clamp(n.y * 0.5 + 0.7) + 0.05 * nz(p.x * 7 + p.z * 3, p.y * 9));
  // the floor: planks across, a skirt beam round it, stubby legs on stone pads, a stone step at the front
  const NPL = 12;
  for (let i = 0; i < NPL; i++) {
    const z = -hd + (i + 0.5) * P.d / NPL, g = G.box(P.w, 0.07, P.d / NPL - 0.018, 0.012);
    g.translate(0, FT - 0.035, z); B.add(g, (p, n, o) => o.set(i % 3 === 1 ? '#bf8a52' : i % 3 ? '#c99558' : '#b7814a').multiplyScalar(n.y > 0.5 ? 1 : 0.78));
  }
  for (const [w, d, x, z] of [[P.w + 0.1, 0.12, 0, hd], [P.w + 0.1, 0.12, 0, -hd], [0.12, P.d, hw, 0], [0.12, P.d, -hw, 0]]) { const g = G.box(w, 0.2, d, 0.03); g.translate(x, FT - 0.17, z); B.add(g, TIMBER_D); }
  for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) {
    const x = sx * (hw - 0.1), z = sz * (hd - 0.08), g0 = H(x, z);
    const l = G.cyl(0.08, 0.09, FT - 0.25 - g0 + 0.1, 8); l.translate(x, (FT - 0.25 + g0 - 0.1) / 2, z); B.add(l, TIMBER_D);
    const pad = puff(V(x, g0 + 0.02, z), 0.16, { detail: 1, noise: 0.1, squash: 0.45, seed: 7 + sx * 3 + sz }); B.add(mossyStone(pad, { amt: 0, seed: 3 }), null);
  }
  { const g = G.box(1.3, 0.17, 0.5, 0.06); g.translate(0, FT - 0.2, hd + 0.3); B.add(g, (p, n, o) => o.set('#b9b2b6').multiplyScalar(n.y > 0.5 ? 1.04 : 0.82)); }
  // corner posts (chunky round logs) lashed with rope top and bottom
  const PH = 2.15, px = hw - 0.15, pz = hd - 0.15;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * px, z = sz * pz, p = G.cyl(0.11, 0.125, PH + 0.1, 10); p.translate(x, FT + PH / 2 - 0.05, z); B.add(p, wood(TIMBER));
    for (const y of [FT + 0.12, FT + PH - 0.22]) for (let k = 0; k < 2; k++) { const r = G.torus(0.13, 0.026, 4, 8); r.rotateX(PI / 2); r.translate(x, y + k * 0.055, z); B.add(r, ROPE); }
  }
  // the beams: logs along the front and back (their ends run out past the posts), logs along the sides beneath them
  const BY = FT + PH;
  for (const sz of [-1, 1]) {
    const L = P.w + 0.75, g = G.cyl(0.105, 0.105, L, 10); g.rotateZ(PI / 2); g.translate(0, BY, sz * pz); B.add(g, wood(TIMBER, 0.2));
    for (const sx of [-1, 1]) {
      const e = G.sph(0.105, 10, 6); e.scale(0.4, 1, 1); e.translate(sx * L / 2, BY, sz * pz); B.add(e, '#d7a465');
      for (let k = 0; k < 2; k++) { const r = G.torus(0.118, 0.026, 4, 8); r.rotateY(PI / 2); r.translate(sx * (px + 0.2 + k * 0.055), BY, sz * pz); B.add(r, ROPE); }
    }
  }
  for (const sx of [-1, 1]) { const g = G.cyl(0.09, 0.09, P.d - 0.1, 10); g.rotateX(PI / 2); g.translate(sx * px, BY - 0.16, 0); B.add(g, wood(TIMBER_D, 0.2)); }
  // the roof: a gable over the beams, ridge along x; curved half-round tiles down each slope (a dark board under them),
  // a fat rounded ridge, crossed log ends at the gables
  const YR = BY + 0.95, YE = BY + 0.18, ZL = hd + 0.5, XL = hw + 0.42, NT = 12;
  const yAt = u => YE + (YR - YE) * Math.pow(1 - u, 1.45) + 0.06 * u * u * u; // (u: 0 at the ridge, 1 at the eave; a little upturn)
  for (const sz of [-1, 1]) {
    // the board: a curved slab, top and underside
    const pos = [], N = 8;
    for (let i = 0; i < N; i++) {
      const u0 = i / N, u1 = (i + 1) / N, z0 = sz * u0 * ZL, z1 = sz * u1 * ZL, a = yAt(u0) - 0.04, b = yAt(u1) - 0.04;
      const q = [[-XL, a, z0], [XL, a, z0], [XL, b, z1], [-XL, b, z1]];
      const up = sz > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
      for (const k of up) pos.push(...q[k]);
      for (const k of up.slice().reverse()) pos.push(q[k][0], q[k][1] - 0.07, q[k][2]);
    }
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.computeVertexNormals();
    B.add(bg, (p, n, o) => o.set(n.y > 0 ? ROOF_D : '#9a6a3c'));
    for (let k = 0; k < NT; k++) {
      const x = -XL + 0.17 + k * (2 * XL - 0.34) / (NT - 1), c = k % 2 ? ROOF : '#6f9062';
      const pts = []; for (let i = 0; i <= 7; i++) { const u = 0.04 + i / 7 * 0.96; pts.push({ p: V(x, yAt(u) + 0.03, sz * u * ZL), r: 0.165 }); }
      B.add(tube(pts, 8, false), (p, n, o) => o.set(c).lerp(col(ROOF_HI), clamp(n.y) * 0.35).multiplyScalar(0.92 + 0.08 * clamp(n.x * sz + 0.5)));
      const end = G.cyl(0.165, 0.165, 0.05, 8); end.rotateX(PI / 2); end.rotateX(-sz * 0.25); end.translate(x, yAt(1) + 0.03, sz * (ZL + 0.01)); B.add(end, (p, n, o) => o.set('#5a7a50').multiplyScalar(n.y < -0.2 ? 0.55 : 0.85));
    }
  }
  { const g = G.cyl(0.19, 0.19, 2 * XL + 0.1, 12); g.rotateZ(PI / 2); g.translate(0, YR + 0.1, 0); B.add(g, (p, n, o) => o.set('#5f8253').lerp(col(ROOF_HI), clamp(n.y) * 0.4)); }
  for (const sx of [-1, 1]) {
    const cap = G.sph(0.2, 10, 6); cap.scale(0.35, 1, 1); cap.translate(sx * (XL + 0.05), YR + 0.1, 0); B.add(cap, '#86a874');
    // crossed log ends over the gable, rope at the crossing
    for (const s2 of [-1, 1]) {
      const a = V(sx * (XL - 0.1), YR - 0.3, s2 * 0.42), b = V(sx * (XL - 0.1), YR + 0.55, -s2 * 0.2);
      B.add(tube([{ p: a, r: 0.075 }, { p: b, r: 0.07 }], 8, true), wood(TIMBER, 0.2));
    }
    for (let k = 0; k < 2; k++) { const r = G.torus(0.1, 0.026, 4, 10); r.rotateZ(PI / 2); r.translate(sx * (XL - 0.1), YR + 0.21 + k * 0.05, 0.02); B.add(r, ROPE); }
    // the gable's slatted board under the roof (set back from the eaves)
    const tri = [];
    for (let i = 0; i < 7; i++) {
      const z0 = -ZL * 0.82 + i * (ZL * 1.64) / 7, z1 = z0 + ZL * 1.64 / 7 - 0.02, zm = (z0 + z1) / 2, top = yAt(Math.abs(zm) / ZL) - 0.08;
      const g = G.box(0.04, top - BY + 0.05, z1 - z0, 0); g.translate(sx * (hw - 0.05), (top + BY - 0.05) / 2, zm); tri.push(g);
    }
    for (const g of tri) B.add(g, '#d8b07a');
  }
  // rolled bamboo blinds under the back beam and the east side, one let half down at the back
  { const g = G.cyl(0.075, 0.075, P.w - 0.3, 10); g.rotateZ(PI / 2); g.translate(0, BY - 0.2, -pz - 0.02); B.add(g, (p, n, o) => o.set(STRAW).multiplyScalar(0.85 + 0.15 * clamp(n.y + 0.5))); }
  { const g = G.box(P.w - 0.5, 0.75, 0.025, 0); g.translate(0, BY - 0.62, -pz + 0.03);
    B.add(faceColors(g, (p, n, o, c) => o.set(STRAW).multiplyScalar(Math.floor((c.y - BY) * 30) % 2 ? 0.92 : 1.02))); }
  { const g = G.cyl(0.07, 0.07, P.d - 0.3, 10); g.rotateX(PI / 2); g.translate(px + 0.02, BY - 0.36, 0); B.add(g, (p, n, o) => o.set(STRAW).multiplyScalar(0.85 + 0.15 * clamp(n.y + 0.5))); }
  for (const s of [-1, 1]) { const t = G.cyl(0.008, 0.008, 0.25, 3); t.translate(s * 0.9, BY - 0.12, -pz - 0.02); B.add(t, ROPE); }
  // the low rail along the back and the east side: a top rail, round posts, balusters
  const rail = (a, b, n) => {
    B.add(tube([{ p: V(a[0], FT + 0.42, a[1]), r: 0.04 }, { p: V(b[0], FT + 0.42, b[1]), r: 0.04 }], 6, false), wood(TIMBER, 0.15));
    for (let k = 1; k < n; k++) { const t = k / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, g = G.box(0.035, 0.4, 0.035, 0); g.translate(x, FT + 0.2, z); B.add(g, '#c4874a'); }
  };
  rail([-px, -pz], [px, -pz], 14); rail([px, -pz], [px, pz - 0.2], 10);
  // the tea table, the pot and cups, four cushions, a vase and a jar in the corner
  const TZ = -0.05;
  { const top = G.cyl(0.46, 0.47, 0.07, 18); top.translate(0, FT + 0.3, TZ); B.add(top, (p, n, o) => o.set('#a86a38').lerp(col('#c88a50'), clamp(n.y) * 0.4));
    const rim = G.torus(0.46, 0.025, 4, 22); rim.rotateX(PI / 2); rim.translate(0, FT + 0.3, TZ); B.add(rim, '#94592e');
    for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + PI / 4, l = G.cyl(0.05, 0.06, 0.28, 6); l.translate(Math.cos(a) * 0.3, FT + 0.13, TZ + Math.sin(a) * 0.3); B.add(l, '#8a5430'); }
    const potC = '#9ec3a3', pot = G.lathe([[0.001, 0], [0.08, 0.005], [0.11, 0.05], [0.105, 0.11], [0.07, 0.15], [0.05, 0.155], [0.001, 0.16]], 12);
    pot.translate(0.05, FT + 0.335, TZ - 0.05); B.add(pot, (p, n, o) => o.set(potC).lerp(col('#e4f2e4'), clamp(n.y) * 0.35));
    const knob = G.sph(0.025, 6, 4); knob.translate(0.05, FT + 0.505, TZ - 0.05); B.add(knob, '#7da483');
    B.add(tube([{ p: V(0.15, FT + 0.41, TZ - 0.05), r: 0.022 }, { p: V(0.21, FT + 0.45, TZ - 0.05), r: 0.016 }, { p: V(0.24, FT + 0.5, TZ - 0.05), r: 0.012 }], 6, false), potC);
    const hd2 = G.torus(0.06, 0.013, 4, 10, PI * 1.2); hd2.rotateZ(PI / 2 + 0.6); hd2.translate(-0.07, FT + 0.43, TZ - 0.05); B.add(hd2, '#6f9476');
    for (const [x, z] of [[-0.2, 0.12], [0.16, 0.17]]) { const c = G.lathe([[0.001, 0], [0.035, 0.002], [0.045, 0.03], [0.048, 0.06], [0.04, 0.062], [0.001, 0.05]], 10); c.translate(x, FT + 0.335, TZ + z); B.add(c, (p, n, o) => o.set(p.y > FT + 0.385 ? '#7fa86a' : '#f0e6d0')); }
  }
  for (const [x, z] of [[0, TZ - 0.85], [0, TZ + 0.78], [-0.82, TZ], [0.82, TZ]]) {
    const c = puff(V(x, FT + 0.05, z), 0.27, { detail: 1, noise: 0.03, squash: 0.28, seed: 11 });
    B.add(c, (p, n, o) => o.set('#7fa86a').lerp(col('#a7c88c'), clamp(n.y) * 0.4).multiplyScalar(0.92 + 0.08 * clamp(n.y)));
    const f = blossomGeo(0.1, 5, 0.5); f.translate(x, FT + 0.125, z); B.add(f, '#f4ecd6');
    const e = G.ico(0.025, 0); e.scale(1, 0.4, 1); e.translate(x, FT + 0.13, z); B.add(e, '#e8b84a');
  }
  { const v = G.lathe([[0.001, 0], [0.07, 0.01], [0.09, 0.08], [0.05, 0.18], [0.04, 0.24], [0.055, 0.26], [0.001, 0.25]], 10); v.translate(px - 0.25, FT, -pz + 0.25); B.add(v, '#c89a6a');
    for (let k = 0; k < 4; k++) { const a = k * 1.6, s = G.cyl(0.006, 0.006, 0.25, 3); s.rotateZ(0.2 * Math.cos(a)); s.rotateX(0.2 * Math.sin(a)); s.translate(px - 0.25 + Math.cos(a) * 0.03, FT + 0.37, -pz + 0.25 + Math.sin(a) * 0.03); B.add(s, '#4a8a3a');
      const f = blossomGeo(0.05, 5, 0.5); f.translate(px - 0.25 + Math.cos(a) * 0.07, FT + 0.5, -pz + 0.25 + Math.sin(a) * 0.07); B.add(f, k % 2 ? '#ff9ec0' : '#ffc4d8'); }
    const jar = G.lathe([[0.001, 0], [0.08, 0.01], [0.1, 0.1], [0.07, 0.17], [0.05, 0.19], [0.06, 0.21], [0.001, 0.21]], 10); jar.translate(-px + 0.3, FT, -pz + 0.28); B.add(jar, '#b86f4a'); }
  // two cream paper lanterns hung from the front beam, and the pavilion's one light
  for (const sx of [-1, 1]) B.at([sx * (px - 0.25), BY - 0.1, pz + 0.1], 0, () => chochin(B, { r: 0.15, h: 0.28, color: '#fff1d6', band: false, cord: 0.32 }));
  B.light([0, BY - 0.5, 0.4], { color: '#ffc880', intensity: 1.6, radius: 5.5, flicker: 0.4 });
}

// ------------------------------------------------------------------ the raked gravel bed: a pale oval with concentric
// rake lines, kerbed with rounded stones, three mossy stones and a fern in it
function gravel(B, S, Gv) {
  const ol = blob(1, 44, 0.06, 77).map(([x, z]) => [x * Gv.rx, z * Gv.rz]);
  let top = -1e9; for (const [x, z] of ol) for (const k of [0, 0.5, 1]) top = Math.max(top, S.H(Gv.x + x * k, Gv.z + z * k));
  const RINGS = 18, g = fanGeo(ol, Gv.x, top + 0.05, Gv.z, RINGS), uv = g.attributes.uv;
  const light = col('#f1e5c8'), groove = col('#d3c4a2');
  B.add(g, (p, n, o, i) => { const t = uv.getX(i), k = Math.round(t * RINGS); o.copy(k % 2 ? groove : light).multiplyScalar(0.97 + 0.05 * nz(p.x * 5, p.z * 5)); });
  // the kerb: rounded stones round the rim (the bed's edge tucks under them)
  for (let i = 0; i < ol.length; i += 4) {
    const [x, z] = ol[i], r = 0.14 + S.rnd() * 0.06;
    groundStone(B, S, Gv.x + x * 1.03, Gv.z + z * 1.03, r, { sq: 0.45, sink: 0.1, moss: 0, stretch: 1.35, yaw: Math.atan2(z, x) + PI / 2, detail: 1 });
  }
  // the bed's lip: a low rounded rim of packed grit
  { const pts = ol.concat([ol[0]]).map(([x, z]) => ({ p: V(Gv.x + x, top + 0.03, Gv.z + z), r: 0.065 }));
    const g = tube(pts, 5, false); g.scale(1, 1, 1); B.add(g, (p, n, o) => o.set('#cbbd9c').multiplyScalar(0.9 + 0.1 * clamp(n.y))); }
  const y = top + 0.03;
  for (const [x, z, r, m] of [[-1.0, 3.5, 0.62, 0.7], [-1.85, 3.95, 0.42, 0.6], [-0.4, 4.25, 0.3, 0.5]]) boulder(B, S, x, y + r * 0.2, z, r, { sq: 0.8, moss: m * 0.75, stretch: 1.2 });
  fern(B, S, -1.35, 3.1, { s: 0.7, y }); fern(B, S, -2.2, 4.25, { s: 0.55, y });
}

// ------------------------------------------------------------------ the stone basin (tsukubai): a round mossy stone
// bowl brimming with water, a bamboo spout on its post, the overflow channel toward the deer scarer
function basin(B, S, x, z, ux, uz) {
  const gy = S.H(x, z) - 0.04, R = 0.42, h = 0.55;
  const bowl = G.lathe([[0.001, 0], [R * 0.9, 0], [R, 0.1], [R * 1.02, h * 0.7], [R * 0.96, h], [R * 0.86, h + 0.02], [R * 0.74, h - 0.02], [R * 0.7, h - 0.12], [0.001, h - 0.16]], 18);
  bowl.translate(x, gy, z);
  B.add(mossyStone(bowl, { amt: 0.4, sc: 3, seed: 21, lift: 0.015, stone: STONE_B }), null);
  const wat = G.disc(R * 0.74, 16); wat.rotateX(-PI / 2); wat.translate(x, gy + h - 0.04, z); B.add(wat, '#5fc0c4', 'water');
  // the spout: a bamboo post behind, a pipe out over the bowl, a thin stream into it
  const px = x - 0.55, pz = z - 0.45, pg = S.H(px, pz);
  bambooPole(B, V(px, pg - 0.05, pz), V(px, pg + 0.98, pz), 0.05);
  const a = V(px, pg + 0.86, pz), b = V(x - 0.08, pg + 0.8, z - 0.05);
  bambooPole(B, a, b, 0.035, false);
  B.add(tube([{ p: b.clone().add(V(0.03, -0.02, 0.02)), r: 0.018 }, { p: b.clone().add(V(0.06, -0.15, 0.04)), r: 0.016 }, { p: V(x - 0.01, gy + h - 0.03, z + 0.0), r: 0.014 }], 5, false), '#cdeff5', 'jet');
  // the overflow: a split bamboo channel from the rim toward the scarer's mouth
  const c0 = V(x + ux * (R * 0.8), gy + h + 0.06, z + uz * (R * 0.8)), c1 = V(x + ux * 0.7, gy + h + 0.03, z + uz * 0.7);
  bambooPole(B, c0, c1, 0.032, false);
  B.add(tube([{ p: c1.clone(), r: 0.014 }, { p: c1.clone().add(V(ux * 0.03, -0.05, uz * 0.03)), r: 0.012 }, { p: c1.clone().add(V(ux * 0.04, -0.1, uz * 0.04)), r: 0.01 }], 5, false), '#cdeff5', 'jet');
  // a ladle resting across the rim
  B.add(tube([{ p: V(x - R * 0.8, gy + h + 0.04, z + 0.12), r: 0.012 }, { p: V(x + R * 0.5, gy + h + 0.06, z + 0.2), r: 0.012 }], 4, false), BAMBOO_D);
  const cup = G.cyl(0.05, 0.045, 0.07, 8); cup.translate(x + R * 0.55, gy + h + 0.06, z + 0.2); B.add(cup, BAMBOO);
}
// a green bamboo pole from a to b with node rings
function bambooPole(B, a, b, r, nodes = true) {
  B.add(tube([{ p: a, r }, { p: b, r: r * 0.95 }], 8, false), (p, n, o) => o.set(BAMBOO).lerp(col('#c5dc84'), clamp(n.y * 0.4 + 0.2)));
  const L = a.distanceTo(b), d = b.clone().sub(a).normalize(), q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d);
  for (let s = nodes ? 0.3 : L * 0.5; s < L - 0.05; s += 0.32) { const g = G.cyl(r * 1.12, r * 1.12, 0.025, 8); g.applyQuaternion(q); g.translate(...a.clone().addScaledVector(d, s).toArray()); B.add(g, BAMBOO_D); }
  const cap = G.cyl(r * 0.96, r * 0.96, 0.01, 8); cap.applyQuaternion(q); cap.translate(...b.toArray()); B.add(cap, '#e8e0b0');
}
// the deer scarer's static parts: two forked bamboo supports, the axle stubs, the rounded striker stone under the tail
function scarerFrame(B, S, sc, ux, uz) {
  const sx = -uz, sz = ux, gy = S.H(sc.x, sc.z);
  for (const s of [-1, 1]) {
    const x = sc.x + sx * s * 0.125, z = sc.z + sz * s * 0.125;
    bambooPole(B, V(x, gy - 0.05, z), V(x, sc.y + 0.07, z), 0.03);
    const cap = G.sph(0.034, 6, 4); cap.translate(x, sc.y + 0.08, z); B.add(cap, BAMBOO_D);
  }
  const ax = G.cyl(0.014, 0.014, 0.3, 6); ax.rotateZ(PI / 2); ax.rotateY(Math.atan2(-sz, sx) - 0); ax.translate(sc.x, sc.y, sc.z); B.add(ax, '#6a4a30');
  const tx = sc.x + ux * 0.37, tz = sc.z + uz * 0.37;
  boulder(B, S, tx, S.H(tx, tz) - 0.06, tz, 0.17, { sq: 0.7, moss: 0.3, stretch: 1.1 });
}
// the moving tube (its frame: the axle at the origin, the mouth along +z): a hollow bamboo with an angled open mouth,
// a closed tail, node rings
function scarerTube(B) {
  const r = 0.078;
  const g = G.cyl(r, r, 0.9, 10, true); g.rotateX(PI / 2); g.translate(0, 0, 0.06);
  B.add(g, (p, n, o) => o.set(BAMBOO).lerp(col('#c5dc84'), clamp(n.y * 0.5 + 0.2)).lerp(col('#a8c460'), clamp(p.z * 0.6)));
  const tail = G.disc(r, 10); tail.rotateY(PI); tail.translate(0, 0, -0.39); B.add(tail, '#e3d9a6');
  const hole = G.disc(r * 0.82, 10); hole.translate(0, 0, 0.47); B.add(hole, '#2f3a22');
  const lip = G.torus(r * 0.9, 0.012, 4, 12); lip.translate(0, 0, 0.5); B.add(lip, '#e3d9a6');
  for (const z of [-0.22, 0.1, 0.36]) { const n = G.cyl(r * 1.1, r * 1.1, 0.022, 10); n.rotateX(PI / 2); n.translate(0, 0, z); B.add(n, BAMBOO_D); }
  const hub = G.cyl(0.03, 0.03, 0.19, 8); hub.rotateZ(PI / 2); B.add(hub, '#6a4a30');
}

// a low timber-and-rope fence: round posts, a timber rail at the top and one low, lashed at the posts
function fence(B, S, pts) {
  const tops = pts.map(([x, z]) => post(B, S, x, z, 0.72, { r: 0.075 }));
  for (let i = 0; i < pts.length - 1; i++) {
    const a = tops[i].clone().add(V(0, 0.1, 0)), b = tops[i + 1].clone().add(V(0, 0.1, 0));
    rope(B, a, b, { sag: 0.015, r: 0.04, color: WOOD });
    rope(B, a.clone().add(V(0, -0.36, 0)), b.clone().add(V(0, -0.36, 0)), { sag: 0.01, r: 0.032, color: WOOD_D });
  }
  for (const [x, z] of pts) S.collide(x, z, 0.15);
}
