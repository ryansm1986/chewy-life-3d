// The Sea Arch Lookout (ROADMAP HP-1; the concept: tools/blender/work/codex/hollow-pois/concepts/poi-08-seaarch.png):
// a natural rock arch standing in the sea off the east coast (one continuous chunky rock, span along the screen's
// horizontal so you see the sea through its big round hole; a moss cap, a little pine, shrubs and sea pinks on top),
// white foam breathing round its feet
// and the rocks in the shallows; on the bank a grassy lookout behind a round-railed timber fence, a chunky bench
// facing the arch, a bronze coin telescope on a stone foot, a squat stone lantern, sea-pink tufts.
//   Sit and watch the sea: the bench (life and zoom back to full).  Look through the telescope: once a day a whale
//   or a boat, and a few coins rattle out of its tray.
import * as THREE from 'three';
import { G, PI } from '../../buildings/kit.js';
import { bush, nz, mossyStone } from '../../buildings/props.js';
import { clamp, TAU } from '../../../core/util.js';
import { frame, cloudPine, boulder, waterline, dropOnto, fence, squatLantern, seaPink, grassTuft, foamRings, STONE, MOSS, MOSS_HI, TIMBER, TIMBER_D } from './_east.js';

const BRONZE = '#b48c44', BRONZE_D = '#7e5e2c', BRONZE_HI = '#e2bd6a';
// the layout, in the place's camera frame (local x = screen right, local z = toward the camera; metres from its centre)
const ARCH = { x: 4.5, z: 1.1, turn: 0, a: 2.5 }; // the arch's centre out in the sea (its span along the screen's x, the hole facing the camera); a: its legs' half spread
const BENCH = { x: -3.1, z: -1.85, a: 1.0 };        // a: the way it faces (local yaw)
const SCOPE = { x: -0.4, z: -3.0 };
const LANTERN = { x: -5.0, z: -0.9 };
const FENCE = [[-5.6, 0.9], [-3.3, -0.5], [-1.0, -1.9], [0.6, -3.2]];

export function build(ctx) {
  const F = frame(ctx), rnd = ctx.rand;
  const archW = F.W(ARCH.x, ARCH.z), archYaw = F.yaw + ARCH.turn;
  const A = frame(ctx, { x: archW[0], z: archW[1], yaw: archYaw });
  const foam = [];
  const ring = (fr, b, w = 0.55) => { const r = waterline(b); if (r <= 0.05) return; const [x, z] = fr.W(b.x, b.z); foam.push({ x, z, r: r * 1.02, w, sx: b.stretch, sz: 1 / Math.sqrt(b.stretch), yaw: fr.yaw + b.yaw, ph: rnd() * TAU }); };

  // ---- the arch: one continuous rock (a chunky lumpy sweep up one leg, over the span and down the other, its moss
  // cap along the top) over a hole ~2.8 m wide and ~2.3 m high facing the camera; a few round stones buttress its feet
  ctx.kit(808, B => {
    const rocks = [];
    const arch = archGeo({ a: ARCH.a, h0: 1.0, b: 2.25, seed: 3 });
    const ag = B.add(mossyStone(arch, { amt: 0.5, sc: 0.32, seed: 5, lift: 0.09, stone: STONE, moss: MOSS, hi: MOSS_HI }), null);
    for (const s of [-1, 1]) {
      const r0 = legR(0); // (its waterline: an oval collar of foam)
      const [x, z] = A.W(s * ARCH.a, 0); foam.push({ x, z, r: r0 * 0.98, w: 0.8, sx: 1, sz: 1.3, yaw: A.yaw, ph: rnd() * TAU });
      const bed = A.h(s * ARCH.a, 0) + A.y0;
      for (const [dx, dz, r] of [[1.05, -0.55, 0.75], [0.35, 1.25, 0.62]]) {
        const b = boulder(B, s * (ARCH.a + dx), Math.max(bed + r * 0.3, -0.45), dz * s, r, { sq: 0.85, moss: 0.45, seed: 30 + rocks.length, yaw: rnd() * TAU, stretch: 1.15, detail: 2, noise: 0.12 });
        rocks.push(b); ring(A, b, 0.4);
      }
    }
    rocks.push({ geo: ag });
    // rounded stones half-sunk into its faces, so it reads as rock (none in the hole: |x| < 1.4 below 2.3 m stays clear)
    for (const [x, y, z, r] of [[-3.45, 0.2, 0.3, 0.75], [3.45, 0.25, -0.2, 0.75], [-3.3, 1.25, -0.5, 0.68], [3.3, 1.2, 0.45, 0.7],
      [0.2, 3.3, -1.25, 0.6], [-1.6, 3.0, -1.1, 0.5], [-0.6, 3.97, 0.3, 0.48], [1.45, 3.75, -0.35, 0.45]])
      rocks.push(boulder(B, x, y, z, r, { sq: 0.85, moss: 0.55, seed: 90 + Math.round(x * 7 + y * 3), yaw: rnd() * TAU, stretch: 1.1, detail: 2, noise: 0.1 }));
    const geos = rocks.map(b => b.geo), on = (x, z, sink = 0.05) => { const y = dropOnto(geos, x, z); return y == null ? null : y - sink; };
    // the little pine on the far shoulder, shrubs and sea pinks in the moss
    const py = on(1.75, -0.15, 0.12); if (py != null) B.at([1.75, py, -0.15], 0, () => cloudPine(B, rnd, { s: 0.95, lean: 0.3, dir: -2.4 }));
    for (const [x, z, r] of [[-0.6, 0.35, 0.32], [-1.7, -0.3, 0.28], [0.7, -0.45, 0.26]]) { const y = on(x, z, 0.08); if (y != null) B.at([x, y, z], rnd() * TAU, () => bush(B, { r, color: '#5f9a3e', flowers: rnd() < 0.5 ? ['#eba6ba', '#ffffff'] : null, n: 2 })); }
    for (const [x, z] of [[0.35, 0.6], [-1.15, 0.65], [1.2, 0.5], [-2.25, 0.3], [2.3, 0.4], [-0.1, -0.55], [1.5, 0.75]]) { const y = on(x, z); if (y != null) seaPink(B, x, y, z, rnd, { n: 4 + Math.floor(rnd() * 3) }); }
    for (const [x, z] of [[-0.9, -0.1], [0.6, 0.15], [-2.0, 0.2]]) { const y = on(x, z); if (y != null) grassTuft(B, x, y, z, rnd, { n: 5, h: 0.26 }); }
  }, { x: archW[0], z: archW[1], y: 0, yaw: archYaw });

  // ---- the lookout on the bank: the fence along the edge, the bench, the telescope, the lantern, boulders and tufts
  const gy = (x, z) => F.h(x, z);
  const benchW = F.W(BENCH.x, BENCH.z), scopeW = F.W(SCOPE.x, SCOPE.z);
  const archC = F.W(ARCH.x, ARCH.z);
  const scopeA = F.look(SCOPE.x, SCOPE.z, ARCH.x, ARCH.z);
  ctx.kit(809, B => {
    const tops = fence(B, FENCE, gy, { h: 0.8, rails: [0.68, 0.38], every: 1.5 });
    // its colliders: a close row of circles (posts and rails)
    for (let i = 0; i < tops.length - 1; i++) { const a = tops[i], b = tops[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(L / 0.5); for (let k = 0; k <= n; k++) F.solid(a.x + (b.x - a.x) * k / n, a.z + (b.z - a.z) * k / n, 0.18, 'the fence'); }
    B.at([BENCH.x, gy(BENCH.x, BENCH.z), BENCH.z], BENCH.a, () => bench(B));
    B.at([SCOPE.x, gy(SCOPE.x, SCOPE.z), SCOPE.z], scopeA, () => telescope(B));
    squatLantern(B, LANTERN.x, gy(LANTERN.x, LANTERN.z) - 0.02, LANTERN.z, 1.05);
    B.light([LANTERN.x, gy(LANTERN.x, LANTERN.z) + 0.6, LANTERN.z], { color: '#ffc27a', intensity: 1.8, radius: 4.5, flicker: 0.45 });
    // the bank: big mossy boulders seaward of the fence (their feet in the water), smaller ones between
    const bank = [[-4.9, 2.1, 1.15], [-4.0, 2.6, 0.6], [-5.9, 2.8, 0.5], [-1.7, 0.6, 1.25], [-0.6, 0.35, 0.7], [-2.8, 1.15, 0.5], [1.0, -2.0, 1.0], [1.8, -3.6, 0.85],
      [-3.3, 1.95, 0.72], [0.25, -0.9, 0.7], [-6.4, 3.25, 0.55], [-0.2, 1.25, 0.5]];
    const bankRocks = bank.map(([x, z, r], i) => {
      const y = gy(x, z) - r * 0.32, b = boulder(B, x, y, z, r, { sq: 0.85, moss: 0.55, seed: 40 + i, yaw: rnd() * TAU, noise: 0.12, detail: r > 0.9 ? 3 : 2 });
      if (gy(x, z) + F.y0 > 0.15) F.solid(x, z, r * 0.85, 'a bank boulder');
      b.y += F.y0; ring(F, b, 0.45); b.y -= F.y0; // (its foam in world y)
      return b;
    });
    const geos = bankRocks.map(b => b.geo);
    for (const b of bankRocks) for (let k = 0; k < 2; k++) { const a = rnd() * TAU, d = b.r * (0.1 + rnd() * 0.3), x = b.x + Math.cos(a) * d, z = b.z + Math.sin(a) * d, y = dropOnto(geos, x, z); if (y != null && rnd() < 0.8) seaPink(B, x, y - 0.04, z, rnd, { n: 3 + Math.floor(rnd() * 3) }); }
    // rocks standing in the shallows and a few under the water
    const shallows = [[-1.3, 2.9, 0.75, 0], [0.5, 3.2, 0.6, 0], [1.6, 4.9, 0.65, 1]];
    shallows.forEach(([x, z, r, under], i) => {
      const bed = gy(x, z) + F.y0, y = under ? bed + r * 0.1 : bed + r * 0.3;
      const b = boulder(B, x, y - F.y0, z, r, { sq: under ? 0.5 : 0.95, moss: under ? 0.2 : 0.5, seed: 70 + i, yaw: rnd() * TAU, stretch: 1.2, detail: 2 });
      if (!under) { b.y = y; ring(F, b, 0.4); }
    });
    // sea pinks and grass along the fence's foot and round the bench and the lantern
    for (const [x, z] of [[-4.4, 0.3], [-2.0, -0.9], [-0.2, -2.3], [-5.3, 0.1], [-3.6, -1.1], [-1.6, -2.6], [-5.6, -0.6], [-4.0, -1.9], [0.3, -3.9], [-2.6, -2.8]]) seaPink(B, x, gy(x, z), z, rnd, { n: 3 + Math.floor(rnd() * 4), color: rnd() < 0.25 ? '#ffffff' : '#eba6ba' });
    for (const [x, z] of [[-4.0, -0.4], [-2.7, -0.4], [-1.1, -1.3], [-5.9, -0.2], [-3.3, -2.7], [0.1, -2.7], [-4.6, -1.4]]) grassTuft(B, x, gy(x, z), z, rnd, { n: 6, h: 0.3 });
    B.at([1.4, gy(1.4, -4.4) - 0.05, -4.4], 0, () => cloudPine(B, rnd, { s: 1.35, lean: 0.4, dir: -0.6 })); F.solid(1.4, -4.4, 0.2, 'the pine');
    for (const [x, z, r] of [[-6.3, 1.3, 0.34]]) { B.at([x, gy(x, z), z], rnd() * TAU, () => bush(B, { r, color: '#5a9a42', flowers: ['#eba6ba', '#ffffff'], n: 3 })); F.solid(x, z, r * 0.8, 'a shrub'); }
  }, { yaw: F.yaw });
  F.solid(BENCH.x + Math.cos(BENCH.a) * 0.45, BENCH.z - Math.sin(BENCH.a) * 0.45, 0.42, 'the bench');
  F.solid(BENCH.x - Math.cos(BENCH.a) * 0.45, BENCH.z + Math.sin(BENCH.a) * 0.45, 0.42, 'the bench');
  F.solid(SCOPE.x, SCOPE.z, 0.32, 'the telescope');
  F.solid(LANTERN.x, LANTERN.z, 0.36, 'the lantern');
  for (const s of [-1, 1]) A.solid(s * ARCH.a, 0, 1.25, 'an arch leg');
  foamRings(ctx, foam);

  // ---- sitting on the bench, looking through the telescope
  const benchFace = F.face(F.look(BENCH.x, BENCH.z, ARCH.x, ARCH.z)), seatY = ctx.H(...benchW) + 0.05;
  const sitPt = F.W(BENCH.x + Math.sin(BENCH.a) * 0.06, BENCH.z + Math.cos(BENCH.a) * 0.06);
  const frontPt = F.W(BENCH.x + Math.sin(BENCH.a) * 0.75, BENCH.z + Math.cos(BENCH.a) * 0.75);
  ctx.interact({
    x: frontPt[0], z: frontPt[1], r: 1.2, label: 'Sit and watch the sea',
    onInteract: () => {
      const s = ctx.sit({ x: sitPt[0], z: sitPt[1], y: seatY, face: benchFace, dur: 9, onDone: rested => { if (rested) ctx.rest(); } });
      if (s) ctx.say('Shhh... hear that? The sea is singing to the arch.', { once: 'sit' });
    },
  });
  const eye = F.W(SCOPE.x - Math.sin(scopeA) * 0.7, SCOPE.z - Math.cos(scopeA) * 0.7);
  const LINES = [
    'A whale! Way out past the arch. Did you see it blow?',
    'A little red boat is bobbing home. I bet they caught lots of fish.',
    'Whale tail! It waved at us. I\'m sure it waved at us.',
    'There\'s a sailboat out there, tiny as a leaf. Where do you think it\'s going?',
  ];
  ctx.interact({
    x: eye[0], z: eye[1], r: 1.1, label: 'Look through the telescope',
    onInteract: () => {
      const fresh = !ctx.doneToday('scope'), P = ctx.G.player;
      if (P && !ctx.G.life?.tools?.busy && !P.controlLocked) P.setPos(eye[0], eye[1]); // (step up to the eyepiece)
      ctx.pose('admire', {
        dur: 2.6, at: 1.3, face: { x: archC[0], z: archC[1] },
        onAct: () => {
          if (fresh && ctx.daily('scope')) {
            ctx.say(LINES[Math.floor(rnd() * LINES.length)]);
            ctx.give({ coins: 12 });
            ctx.toast('A few coins rattled out of the telescope\'s tray');
          } else ctx.say('Just gulls round the arch now. The whales are napping.');
        },
      });
    },
  });
  return null;
}

// a chunky honey-timber bench facing +z: three thick seat planks, two back planks on raked posts, stout legs, rounded
// armrests, dark pegs
function bench(B) {
  const tone = k => (p, n, o) => o.set(TIMBER).multiplyScalar((0.94 + k) * (n.y > 0.5 ? 1.06 : 0.86) + 0.04 * nz(p.x * 4, p.z * 9));
  for (let i = 0; i < 3; i++) { const s = G.box(1.7, 0.075, 0.17, 0.03); s.translate(0, 0.45, -0.19 + i * 0.19); B.add(s, tone([0, 0.06, -0.03][i])); }
  for (const sx of [-1, 1]) {
    for (const z of [-0.2, 0.2]) { const l = G.box(0.12, 0.42, 0.12, 0.03); l.translate(sx * 0.7, 0.21, z); B.add(l, TIMBER_D); }
    const rail = G.box(0.1, 0.09, 0.56, 0.025); rail.translate(sx * 0.7, 0.36, 0); B.add(rail, TIMBER_D);
    const bp = G.box(0.1, 0.62, 0.09, 0.025); bp.rotateX(-0.14); bp.translate(sx * 0.7, 0.72, -0.31); B.add(bp, TIMBER_D);
    const arm = G.box(0.11, 0.065, 0.5, 0.03); arm.translate(sx * 0.79, 0.66, -0.02); B.add(arm, tone(0.04));
    const ap = G.box(0.08, 0.2, 0.08, 0.02); ap.translate(sx * 0.79, 0.55, 0.17); B.add(ap, TIMBER_D);
    for (const z of [-0.19, 0, 0.19]) { const pg = G.disc(0.018, 6); pg.rotateX(-PI / 2); pg.translate(sx * 0.7, 0.489, z); B.add(pg, '#5a3a22'); }
  }
  for (let i = 0; i < 2; i++) { const b = G.box(1.74, 0.14, 0.06, 0.028); b.rotateX(-0.14); b.translate(0, 0.66 + i * 0.21, -0.335 - i * 0.03); B.add(b, tone(i ? 0.05 : -0.02)); }
}

// the coin telescope, looking along +z: a round mossy stone foot, a bronze pedestal with collars, the coin box with its
// slot and tray, a yoke, the fat tube tipped up a touch with a glassy lens and an eyepiece
function telescope(B) {
  const st = (p, n, o) => { o.set(STONE[1]).multiplyScalar(0.86 + 0.14 * clamp(n.y) + 0.05 * nz(p.x * 8, p.z * 8)); if (n.y > 0.7 && nz(p.x * 6 + 3, p.z * 6) > 0.1) o.lerp(new THREE.Color('#9cc048'), 0.6); };
  const br = (p, n, o) => o.set(BRONZE).multiplyScalar(0.82 + 0.22 * clamp(n.y + 0.3)).lerp(new THREE.Color(BRONZE_HI), clamp(n.y - 0.6) * 0.5);
  const foot = G.cyl(0.24, 0.29, 0.14, 12); foot.translate(0, 0.06, 0); B.add(foot, st);
  const foot2 = G.cyl(0.16, 0.2, 0.08, 10); foot2.translate(0, 0.17, 0); B.add(foot2, st);
  const ped = G.cyl(0.055, 0.075, 0.6, 9); ped.translate(0, 0.5, 0); B.add(ped, br);
  for (const y of [0.24, 0.58]) { const c = G.cyl(0.085, 0.085, 0.04, 10); c.translate(0, y, 0); B.add(c, BRONZE_D); }
  const box = G.box(0.19, 0.22, 0.16, 0.04); box.translate(0, 0.78, -0.02); B.add(box, br);
  const slot = G.box(0.07, 0.012, 0.02, 0); slot.translate(0, 0.85, -0.105); B.add(slot, '#3a2a1a');
  const tray = G.box(0.1, 0.03, 0.05, 0.01); tray.translate(0, 0.71, -0.115); B.add(tray, BRONZE_D);
  const plate = G.disc(0.035, 10); plate.rotateY(PI); plate.translate(0, 0.79, -0.101); B.add(plate, BRONZE_HI);
  for (const sx of [-1, 1]) { const y = G.box(0.03, 0.14, 0.06, 0.01); y.translate(sx * 0.1, 0.94, 0); B.add(y, BRONZE_D); }
  B.at([0, 0.98, 0], 0, () => {
    B.push([0, 0, 0], 0, 1, -0.14);
    const tb = G.cyl(0.07, 0.082, 0.52, 12); tb.rotateX(PI / 2); B.add(tb, br);
    const obj = G.cyl(0.1, 0.095, 0.13, 12); obj.rotateX(PI / 2); obj.translate(0, 0, 0.3); B.add(obj, br);
    const lip = G.torus(0.093, 0.016, 5, 14); lip.translate(0, 0, 0.365); B.add(lip, BRONZE_HI);
    const lens = G.disc(0.085, 14); lens.translate(0, 0, 0.362); B.add(lens, (p, n, o) => o.set('#7fc6dc').lerp(new THREE.Color('#e8fbff'), clamp((p.y + 0.02) * 12)));
    for (const z of [-0.12, 0.12]) { const b = G.torus(0.081, 0.012, 4, 12); b.translate(0, 0, z); B.add(b, BRONZE_D); }
    const ep = G.cyl(0.04, 0.05, 0.14, 10); ep.rotateX(PI / 2); ep.translate(0, 0, -0.32); B.add(ep, BRONZE_D);
    const cup = G.cyl(0.05, 0.045, 0.04, 10); cup.rotateX(PI / 2); cup.translate(0, 0, -0.4); B.add(cup, '#3e3028');
    const ax = G.cyl(0.025, 0.025, 0.24, 8); ax.rotateZ(PI / 2); B.add(ax, BRONZE_D);
    B.pop();
  });
}

// the arch's rock: a sweep along its centre line (up the left leg, a half oval over the span, down the right leg, the
// feet well under the sea bed) of an oval cross-section, deep front to back, the legs flaring at the waterline, the
// span a little slimmer at its crown; slow lumps in the radius (periodic round each ring, so it welds smooth)
const legR = y => 1.08 + 0.32 * clamp((0.9 - y) / 1.8);
function archGeo({ a = 2.5, h0 = 1.0, b = 2.0, foot = -2.0, seed = 0 } = {}) {
  const path = [];
  const NL = 9, NS = 30, M = 26;
  for (let i = 0; i < NL; i++) path.push([-a, foot + (h0 - foot) * i / NL, 'L']);
  for (let i = 0; i <= NS; i++) { const f = PI - PI * i / NS; path.push([a * Math.cos(f), h0 + b * Math.sin(f), 'S', f]); }
  for (let i = 1; i <= NL; i++) path.push([a, h0 + (foot - h0) * i / NL, 'L']);
  const pos = [], idx = [], n = path.length;
  for (let i = 0; i < n; i++) {
    const [x, y, kind, f] = path[i], [x0, y0] = path[Math.max(0, i - 1)], [x1, y1] = path[Math.min(n - 1, i + 1)];
    let tx = x1 - x0, ty = y1 - y0; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    let nx = ty, ny = -tx; if (nx * x + ny * (y - h0) < 0) { nx = -nx; ny = -ny; } // (the outward side, away from the hole)
    const rn = kind === 'L' ? legR(y) : 0.92 + 0.16 * (1 - Math.sin(f)), rz = rn * 1.32;
    for (let j = 0; j <= M; j++) {
      const t = j / M * TAU, c = Math.cos(t), sn = Math.sin(t);
      const k = 1 + 0.12 * nz(i * 0.22 + c * 0.7 + seed, sn * 0.7 - seed) + 0.07 * nz(i * 0.6 + c * 1.6, sn * 1.6 + 7) + 0.03 * nz(i * 1.4 + c * 3, sn * 3 - 2);
      const up = Math.max(0, c * ny), top = kind === 'S' ? 1 - 0.12 * up * up : 1; // (a broad rounded top along the span)
      pos.push(x + nx * c * rn * k, y + ny * c * rn * k * top, sn * rz * k);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < M; j++) { const p = i * (M + 1) + j, q = p + M + 1; idx.push(p, q, p + 1, q, q + 1, p + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.computeVertexNormals();
  // (face out: the normals should point away from the centre line)
  const nn = g.attributes.normal; let d = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j <= M; j++) { const v = i * (M + 1) + j, [x, y] = path[i]; d += nn.getX(v) * (pos[v * 3] - x) + nn.getY(v) * (pos[v * 3 + 1] - y) + nn.getZ(v) * pos[v * 3 + 2]; }
  if (d < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.setIndex(idx); }
  return g.toNonIndexed();
}
