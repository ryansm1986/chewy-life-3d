// The Bee Meadow (ROADMAP HP-1; the concept: tools/blender/work/codex/hollow-pois/concepts/poi-09-bees.png): bands of
// bright flowers (lavender rows, a sunflower patch, coral poppies) behind low rope fences, four chunky pastel bee
// boxes on little stands, round friendly bees flying lazy loops (one instanced mesh, the flight and the wings all in
// its vertex shader), a honey stand under a striped awning with jars of honey, a pail and dippers, and a wooden
// bear-face sign (no words).
//   Collect honey: at the stand or a hive, once a day: two jars of honey, and the bees come buzzing round you.
import * as THREE from 'three';
import { G, V, PI } from '../../buildings/kit.js';
import { leafGeo, blossomGeo, nz, crate, barrel, bush } from '../../buildings/props.js';
import { tube } from '../../../gfx/geom.js';
import { makeToon } from '../../../gfx/materials.js';
import { clamp, TAU, damp } from '../../../core/util.js';
import { frame, boulder, post, grassTuft, TIMBER, TIMBER_D, TIMBER_HI, ROPE } from './_east.js';

// the layout in the place's camera frame (local x = screen right, local z = toward the camera; the trail runs across
// the front, ~6.5 m in front of the centre)
const HIVES = [{ x: -2.45, z: -0.95, c: '#b5dcd0', a: 0.08 }, { x: -0.8, z: -1.1, c: '#c9b4da', a: -0.05 }, { x: 0.85, z: -1.05, c: '#ead99a', a: 0.06 }, { x: 2.5, z: -0.9, c: '#f3c4b2', a: -0.1 }];
const STAND = { x: 2.75, z: 2.5, a: -0.22 };
const SIGN = { x: 4.85, z: 2.75, a: -0.4 };
const HONEY = '#e8a42a', AMBER = '#d98a1c';

export function build(ctx) {
  const F = frame(ctx), rnd = ctx.rand, gy = (x, z) => F.h(x, z);
  ctx.kit(909, B => {
    // ---- the bee boxes
    for (const h of HIVES) { B.at([h.x, gy(h.x, h.z), h.z], h.a, () => hive(B, h.c)); F.solid(h.x, h.z, 0.42, 'a hive'); }
    // ---- the honey stand and the bear sign
    B.at([STAND.x, gy(STAND.x, STAND.z), STAND.z], STAND.a, () => stand(B, rnd));
    for (const dx of [-0.6, 0, 0.6]) F.solid(STAND.x + Math.cos(STAND.a) * dx, STAND.z - Math.sin(STAND.a) * dx, 0.36, 'the stand');
    B.at([SIGN.x, gy(SIGN.x, SIGN.z), SIGN.z], SIGN.a, () => bearSign(B));
    F.solid(SIGN.x, SIGN.z, 0.14, 'the sign');
    B.at([1.3, gy(1.3, 3.25), 3.25], 0.4, () => { barrel(B, { r: 0.19, h: 0.32, wood: '#c88a52', lid: false }); B.at([0, 0.26, 0], 0, () => bush(B, { r: 0.24, color: '#5f9e48', flowers: ['#ff8fb0', '#ffffff', '#ffd24a'], n: 2 })); });
    F.solid(1.3, 3.25, 0.22, 'the planter');
    // ---- the flower bands: lavender rows on the left, a sunflower patch behind the hives, coral poppies on the right
    // (lavender: five mounded rows of spikes; sunflowers: three rows of big heads; poppies: a dense leafy bed)
    for (let r = 0; r < 5; r++) { const z = -0.55 + r * 0.7, x0 = -6.45 + (r % 2) * 0.15, x1 = -3.3 - (r === 0 ? 0.2 : 0); lavenderRow(B, x0, x1, z, gy, rnd); }
    for (let r = 0; r < 3; r++) for (let i = 0; i < 10; i++) {
      const x = -3.05 + i * 0.7 + (r % 2) * 0.35 + (rnd() - 0.5) * 0.14, z = -2.3 - r * 0.6 + (rnd() - 0.5) * 0.12;
      if (r === 2 && (i === 0 || i === 9)) continue;
      sunflower(B, x, gy(x, z), z, rnd, 0.95 + r * 0.22 + rnd() * 0.28);
    }
    poppyBed(B, 4.95, -0.45, 1.55, 1.3, gy, rnd);
    // daisies and little flowers sprinkled in the grass, grass tufts round the beds
    for (let i = 0; i < 16; i++) {
      const x = -6.8 + rnd() * 13.4, z = -3.8 + rnd() * 7.4;
      if (Math.abs(x - STAND.x) < 1.2 && Math.abs(z - STAND.z) < 0.8) continue;
      if (z > -1.8 && z < -0.3 && x > -3.1 && x < 3.1) continue; // (the hives)
      if (F.trail(x, z) < 1.4) continue;
      daisy(B, x, gy(x, z), z, rnd, rnd() < 0.7 ? '#ffffff' : rnd() < 0.5 ? '#ffd24a' : '#ff9dc1');
    }
    for (const [x, z] of [[-3.1, 2.9], [0.2, 2.1], [-1.6, 0.6], [3.9, 1.6], [6.2, 1.5], [-6.6, -1.7], [0.9, 0.5], [-0.6, 3.4], [2.3, -3.9], [-4.4, -2.0]]) grassTuft(B, x, gy(x, z), z, rnd, { n: 7, h: 0.32 });
    // leafy shrubs between the beds (the concept's lush green)
    for (const [x, z, r] of [[3.75, -1.95, 0.36], [6.15, -2.65, 0.4], [-2.7, 2.45, 0.3]]) { B.at([x, gy(x, z), z], rnd() * TAU, () => bush(B, { r, color: '#4f9a42', n: 2, flowers: rnd() < 0.4 ? ['#ffffff', '#fff0a0'] : null })); F.solid(x, z, r * 0.8, 'a shrub'); }
    // ---- low fences of round posts and sagging rope: round the lavender, behind the sunflowers, beside the poppies
    ropeFence(B, [[-7.0, -1.3], [-7.0, 2.4], [-3.15, 2.95]], gy, F);
    ropeFence(B, [[-3.7, -3.95], [-0.6, -4.15], [2.4, -4.1], [4.1, -3.7]], gy, F);
    ropeFence(B, [[6.75, -2.1], [6.85, 0.4], [6.4, 1.7]], gy, F);
    // ---- mossy stones round the edges and a cherry in the back corner
    for (const [x, z, r] of [[-7.05, -2.7, 0.75], [5.7, -3.3, 0.8], [-4.05, -3.35, 0.55], [-2.55, 3.5, 0.45], [7.0, 2.6, 0.55], [4.6, -4.25, 0.5], [-7.2, 3.1, 0.5]]) {
      boulder(B, x, gy(x, z) - r * 0.3, z, r, { sq: 0.92, moss: 0.42, seed: Math.round(x * 13 + z * 7), yaw: rnd() * TAU, detail: r > 0.7 ? 3 : 2 });
      F.solid(x, z, r * 0.85, 'a stone');
    }
  }, { yaw: F.yaw });

  // ---- the bees: lazy loops over the beds, round the hive mouths and the stand; the hive bees come buzzing round you
  const loops = [];
  const loop = (x, z, h, rx, rz, swarm = 0) => { const [wx, wz] = F.W(x, z); loops.push({ x: wx, y: ctx.H(wx, wz) + h, z: wz, rx, rz, sp: (0.55 + rnd() * 0.45) * (rnd() < 0.5 ? -1 : 1), ph: rnd() * TAU, s: 1.25 + rnd() * 0.3, swarm }); };
  for (const h of HIVES) { loop(h.x, h.z + 0.45, 0.55, 0.45, 0.3, 1); loop(h.x, h.z + 0.2, 1.05, 0.7, 0.45, 1); }
  loop(-4.6, 0.9, 0.85, 1.1, 0.8); loop(-5.4, 0.1, 0.75, 0.7, 0.6); loop(-3.9, 1.8, 0.7, 0.6, 0.5, 1);
  loop(-1.2, -2.9, 1.45, 1.2, 0.5); loop(1.6, -2.8, 1.35, 1.0, 0.45, 1); loop(0.2, -2.6, 1.6, 0.8, 0.4);
  loop(4.8, -0.5, 0.8, 1.0, 0.8); loop(5.3, 0.2, 0.7, 0.6, 0.5, 1); loop(STAND.x - 0.5, STAND.z - 0.1, 1.15, 0.5, 0.35);
  const bees = makeBees(loops); ctx.add(bees.mesh);

  // ---- collecting honey
  let swarmT = 0, swarmK = 0;
  const swarmAt = new THREE.Vector3();
  const collect = (fx, fz) => {
    const fresh = !ctx.doneToday('honey');
    const ok = ctx.pose('pickup', {
      dur: 1.3, at: 0.55, face: { x: fx, z: fz },
      onAct: () => {
        if (fresh && ctx.daily('honey')) {
          ctx.give({ pantry: { honey: 2 } });
          swarmT = 3.6;
          ctx.say('Bzzz! They\'re saying thank you. I think. Don\'t make any sudden moves!', { once: 'collect' });
        } else ctx.toast('The bees are busy making more. Fresh honey tomorrow!');
      },
    });
    return ok;
  };
  const standFront = F.W(STAND.x + Math.sin(STAND.a) * 0.95, STAND.z + Math.cos(STAND.a) * 0.95), standW = F.W(STAND.x, STAND.z);
  ctx.interact({ x: standFront[0], z: standFront[1], r: 1.2, label: 'Collect honey', onInteract: () => collect(standW[0], standW[1]) });
  for (const h of HIVES) {
    const p = F.W(h.x + Math.sin(h.a) * 0.75, h.z + Math.cos(h.a) * 0.75), hw = F.W(h.x, h.z);
    ctx.interact({ x: p[0], z: p[1], r: 0.9, label: 'Collect honey', onInteract: () => collect(hw[0], hw[1]) });
  }
  return {
    update(dt) {
      swarmT = Math.max(0, swarmT - dt);
      swarmK = damp(swarmK, swarmT > 0 ? 1 : 0, swarmT > 0 ? 2.2 : 1.1, dt);
      const P = ctx.G.player;
      if (P && swarmK > 0.001) swarmAt.lerp(V(P.pos.x, P.pos.y + 0.95, P.pos.z), swarmT > 0 ? 1 : clamp(dt * 2)); // (they drift home when it ends)
      bees.u.uSwarm.value.set(swarmAt.x, swarmAt.y, swarmAt.z, swarmK);
    },
  };
}

// ---- a bee box on a little stand: legs, a base board with a landing board, two stacked pastel boxes with handhold
// recesses and a dark entrance slot, a rounded pitched roof of honey planks with a ridge beam
function hive(B, color) {
  const c = new THREE.Color(color), dark = c.clone().multiplyScalar(0.74), hi = c.clone().lerp(new THREE.Color('#ffffff'), 0.25);
  const paintBox = (p, n, o) => o.copy(c).multiplyScalar(0.92 + 0.08 * clamp(n.y + 0.4) + 0.03 * nz(p.x * 9, p.y * 9)).lerp(hi, clamp(n.y) * 0.3);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = G.beam(0.07, 0.24, 0.07, 0.015); l.translate(sx * 0.24, 0.12, sz * 0.19); B.add(l, TIMBER_D); }
  const base = G.box(0.64, 0.06, 0.56, 0.02); base.translate(0, 0.26, 0); B.add(base, TIMBER);
  const land = G.box(0.42, 0.035, 0.18, 0.012); land.rotateX(0.18); land.translate(0, 0.255, 0.34); B.add(land, TIMBER_HI);
  for (let i = 0; i < 2; i++) {
    const y = 0.29 + i * 0.26, bx = G.box(0.58, 0.245, 0.5, 0.035); bx.translate(0, y + 0.122, 0); B.add(bx, paintBox);
    const lip = G.box(0.6, 0.025, 0.52, 0); lip.translate(0, y + 0.247, 0); B.add(lip, dark);
    for (const sx of [-1, 1]) { const hh = G.box(0.02, 0.045, 0.16, 0); hh.translate(sx * 0.29, y + 0.16, 0); B.add(hh, dark.clone().multiplyScalar(0.8)); }
    const hf = G.box(0.16, 0.045, 0.02, 0); hf.translate(0, y + 0.17, 0.25); B.add(hf, dark.clone().multiplyScalar(0.85));
  }
  const slot = G.box(0.22, 0.04, 0.02, 0); slot.translate(0, 0.315, 0.251); B.add(slot, '#3a2a22');
  // the roof: two planked slopes meeting at a rounded ridge, overhanging all round
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const pl = G.beam(0.4, 0.045, 0.235, 0.015); pl.translate(0, 0, (k - 1) * 0.235);
      pl.rotateZ(-s * 0.5); pl.translate(s * 0.17, 0.93, 0);
      B.add(pl, (p, n, o) => o.set(k === 1 ? '#b57a44' : '#a46a38').multiplyScalar(n.y > 0.3 ? 1.02 : 0.78));
    }
  }
  const ridge = G.cyl(0.04, 0.04, 0.74, 8); ridge.rotateX(PI / 2); ridge.translate(0, 1.0, 0); B.add(ridge, '#86532c');
  const tri = new THREE.Shape([new THREE.Vector2(-0.29, 0), new THREE.Vector2(0.29, 0), new THREE.Vector2(0, 0.155)]);
  const gable = new THREE.ExtrudeGeometry(tri, { depth: 0.48, bevelEnabled: false }); gable.translate(0, 0.8, -0.24); B.add(gable, dark);
}

// ---- the honey stand (facing +z): a planked counter on stout posts, a little two-step shelf of jars, jars, a lidded
// pail and dippers on the counter, crates underneath, a cream cloth with a coral stripe hung over the front, and a
// coral-and-cream striped awning with a scalloped hem
function stand(B, rnd) {
  const W = 1.8, D = 0.74, top = 0.8;
  for (const sx of [-1, 1]) for (const [sz, h] of [[D / 2 - 0.06, 1.95], [-D / 2 + 0.06, 2.1]]) post(B, sx * (W / 2 - 0.06), 0, sz, h, { r: 0.065, wraps: [top - 0.06, h - 0.2], cap: false });
  for (let i = 0; i < 4; i++) { const p = G.box(W - 0.02, 0.06, D / 4 - 0.012, 0.018); p.translate(0, top, -D / 2 + D / 8 + i * D / 4); B.add(p, (pp, n, o) => o.set(i % 2 ? TIMBER : TIMBER_HI).multiplyScalar(n.y > 0.5 ? 1 : 0.8)); }
  const apron = G.box(W - 0.1, 0.12, 0.04, 0.015); apron.translate(0, top - 0.09, D / 2 - 0.05); B.add(apron, TIMBER_D);
  const low = G.box(W - 0.14, 0.04, D - 0.12, 0.012); low.translate(0, 0.2, 0); B.add(low, TIMBER_D);
  B.at([-0.45, 0.22, -0.05], 0.15, () => crate(B, { s: 0.42, stencil: false }));
  B.at([0.42, 0.22, 0.0], -0.1, () => crate(B, { s: 0.38, stencil: false }));
  // the front cloth: cream with a coral band, swaying a little
  const cl = G.plane(0.62, 0.42, 4, 3); cl.translate(0, -0.21, 0);
  B.at([-0.3, top - 0.02, D / 2 + 0.01], 0, () => B.cloth(cl, (p, n, o) => o.set(p.y < -0.3 && p.y > -0.36 ? '#ec8a78' : '#fbf1de'), { x0: -0.31, x1: 0.31, yTop: 0, yBot: -0.42 }));
  // the shelf of jars, jars on the counter, the pail and two dippers
  for (const sx of [-1, 1]) { const u = G.box(0.05, 0.28, 0.2, 0.012); u.translate(sx * 0.55, top + 0.17, -0.2); B.add(u, TIMBER_D); }
  const sh = G.box(1.2, 0.045, 0.24, 0.012); sh.translate(0, top + 0.32, -0.2); B.add(sh, TIMBER);
  for (const x of [-0.4, 0, 0.4]) jar(B, x, top + 0.345, -0.2, 1.35);
  for (const [x, z, s] of [[-0.68, 0.2, 1.45], [-0.34, 0.24, 1.3], [0.0, 0.18, 1.4], [-0.5, -0.02, 1.2]]) jar(B, x, top + 0.03, z, s);
  B.at([0.5, top + 0.03, 0.08], 0.3, () => {
    const pail = G.lathe([[0.001, 0], [0.15, 0], [0.16, 0.06], [0.155, 0.2], [0.14, 0.22], [0.001, 0.22]], 14); B.add(pail, (p, n, o) => o.set('#c8894e').multiplyScalar(0.88 + 0.12 * clamp(n.y + 0.3) + (Math.abs(p.y - 0.06) < 0.015 || Math.abs(p.y - 0.17) < 0.015 ? -0.25 : 0)));
    const lid = G.cyl(0.15, 0.155, 0.035, 14); lid.translate(0, 0.235, 0); B.add(lid, '#a86e3c');
    const kn = G.sph(0.035, 8, 5); kn.translate(0, 0.27, 0); B.add(kn, '#8a5a30');
  });
  for (const [x, z, a] of [[-0.12, 0.3, 0.5], [0.3, 0.3, -0.4]]) B.at([x, top + 0.04, z], a, () => {
    const st = G.cyl(0.011, 0.011, 0.22, 5); st.rotateZ(PI / 2 - 0.08); B.add(st, TIMBER_HI);
    const hd = G.lathe([[0.001, -0.05], [0.028, -0.04], [0.035, -0.02], [0.03, 0], [0.035, 0.02], [0.028, 0.04], [0.001, 0.05]], 8); hd.rotateZ(PI / 2); hd.translate(-0.13, 0.01, 0); B.add(hd, (p, n, o) => o.set(HONEY).multiplyScalar(0.85 + 0.25 * clamp(n.y)));
  });
  // the awning: a sloped striped canopy over the posts, its front hem scalloped
  const n = 6, sw = (W + 0.16) / n, yB = 1.98, yF = 1.8, zB = -D / 2 - 0.08, zF = D / 2 + 0.2, L = Math.hypot(zF - zB, yB - yF), ang = Math.atan2(yB - yF, zF - zB);
  for (let i = 0; i < n; i++) {
    const col = i % 2 ? '#fbf0de' : '#ec7f6c', x = -W / 2 - 0.08 + sw * (i + 0.5);
    const pn = G.box(sw + 0.004, 0.035, L, 0.012); pn.rotateX(ang); pn.translate(x, (yB + yF) / 2 + 0.02, (zB + zF) / 2);
    B.add(pn, (p, nn, o) => o.set(col).multiplyScalar(nn.y > 0.3 ? 1.02 : 0.84));
    const sc = new THREE.CylinderGeometry(sw / 2, sw / 2, 0.03, 10, 1, false, -PI / 2, PI); sc.rotateX(PI / 2); sc.scale(1, 0.62, 1); sc.translate(x, yF + 0.005, zF - 0.01); // (a scallop hanging from the hem)
    B.add(sc, (p, nn, o) => o.set(col).multiplyScalar(nn.z > 0.5 ? 1 : 0.86));
  }
}
// a honey jar: amber glass with a light catch, a cream lid with a paper top and a twine tie
function jar(B, x, y, z, s) {
  const body = G.lathe([[0.001, 0], [0.058, 0], [0.066, 0.02], [0.068, 0.09], [0.06, 0.12], [0.045, 0.13], [0.001, 0.13]].map(([r, h]) => [r * s, h * s]), 8);
  body.translate(x, y, z);
  B.add(body, (p, n, o) => { o.set('#f0a224').lerp(new THREE.Color('#ffd66a'), clamp(n.y * 0.4 + 0.45 + (n.x + n.z) * 0.3)); if (n.z > 0.35 && n.x < 0.1 && p.y - y > 0.05 * s && p.y - y < 0.11 * s) o.lerp(new THREE.Color('#fff8e0'), 0.7); });
  const lid = G.cyl(0.05 * s, 0.052 * s, 0.03 * s, 10); lid.translate(x, y + 0.145 * s, z); B.add(lid, '#f6ead0');
  const cap = G.cyl(0.062 * s, 0.07 * s, 0.018 * s, 10); cap.translate(x, y + 0.165 * s, z); B.add(cap, '#fbf4e4');
  const tie = G.torus(0.051 * s, 0.006, 3, 6); tie.rotateX(PI / 2); tie.translate(x, y + 0.14 * s, z); B.add(tie, '#c89a5a');
}
// the bear sign: a round wooden face (ears, a pale muzzle, dark eyes and nose, a little smile) on a post with a
// rope-lashed cross-arm; no words
function bearSign(B) {
  post(B, 0, 0, 0, 1.25, { r: 0.06, wraps: [0.75], cap: false });
  const arm = G.box(0.62, 0.07, 0.07, 0.02); arm.translate(0.0, 0.78, 0.02); B.add(arm, TIMBER);
  B.at([0, 1.32, 0.05], 0, () => {
    const wood = (p, n, o) => o.set('#c58d52').multiplyScalar(0.9 + 0.12 * clamp(n.z) + 0.05 * nz(p.x * 12, p.y * 12));
    const head = G.cyl(0.28, 0.28, 0.07, 18); head.rotateX(PI / 2); B.add(head, wood);
    for (const sx of [-1, 1]) {
      const ear = G.cyl(0.1, 0.1, 0.06, 12); ear.rotateX(PI / 2); ear.translate(sx * 0.21, 0.21, -0.005); B.add(ear, wood);
      const inner = G.cyl(0.055, 0.055, 0.02, 10); inner.rotateX(PI / 2); inner.translate(sx * 0.21, 0.21, 0.03); B.add(inner, '#e2b987');
      const eye = G.sph(0.028, 8, 5); eye.scale(1, 1.15, 0.5); eye.translate(sx * 0.1, 0.05, 0.04); B.add(eye, '#2e2018');
    }
    const muz = G.sph(0.11, 12, 6); muz.scale(1.15, 0.85, 0.35); muz.translate(0, -0.07, 0.04); B.add(muz, '#e8c290');
    const nose = G.sph(0.035, 8, 5); nose.scale(1.3, 0.9, 0.7); nose.translate(0, -0.03, 0.075); B.add(nose, '#3a261c');
    const smile = G.torus(0.04, 0.008, 3, 10, PI); smile.rotateZ(PI); smile.translate(0, -0.085, 0.072); B.add(smile, '#3a261c');
    for (const sx of [-1, 1]) { const ch = G.disc(0.03, 8); ch.translate(sx * 0.16, -0.04, 0.037); B.add(ch, '#f0a090'); }
  });
}

// ---- flowers
// lavender: a mounded row: a bank of grey-green leaves along it, packed with knobbly purple spikes (each a slim
// four-sided spire, a bulge or two, deep violet at the foot paling to lilac at the tip) standing out of the mound
function lavenderRow(B, x0, x1, z, gy, rnd) {
  const L = x1 - x0, dk = new THREE.Color('#8458c8'), mid = new THREE.Color('#a77ad9'), lt = new THREE.Color('#dcc6ff');
  mound(B, (x0 + x1) / 2, z, L / 2 + 0.15, 0.36, 0.36, gy, '#5c8a48', '#8fb070');
  for (let k = 0; k < Math.round(L * 26); k++) {
    const x = x0 + rnd() * L, dz = (rnd() - 0.5) * 0.5, y = gy(x, z + dz), a = rnd() * TAU, lf = leafGeo(0.22 + rnd() * 0.1, 0.035, 0.3);
    lf.rotateZ(0.5 + rnd() * 0.5); lf.rotateY(a); lf.translate(x, y + 0.02 + (0.25 - Math.abs(dz)) * 0.25, z + dz);
    B.add(lf, rnd() < 0.65 ? '#7f9e6a' : '#98b080', 'leaf');
  }
  for (let k = 0; k < Math.round(L * 32); k++) {
    const x = x0 + rnd() * L, dz = (rnd() - 0.5) * 0.6, mound = Math.max(0, 1 - (dz / 0.36) ** 2) * 0.36;
    const hs = 0.3 + rnd() * 0.16, base = mound * 0.8 + rnd() * 0.14, y = gy(x, z + dz);
    const sp = new THREE.ConeGeometry(0.052, hs, 4, 2, true), p = sp.attributes.position;
    for (let i = 0; i < p.count; i++) { const t = p.getY(i) / hs + 0.5, w = t < 0.02 ? 0.5 : 1 + 0.22 * Math.sin(t * 8); p.setX(i, p.getX(i) * w); p.setZ(i, p.getZ(i) * w); }
    sp.translate(0, base + hs / 2, 0); sp.rotateX(dz * 1.1); sp.rotateZ((rnd() - 0.5) * 0.25); sp.rotateY(rnd() * TAU); sp.translate(x, y, z + dz);
    const y0 = y + base;
    B.add(sp, (pp, n, o) => { const t = clamp((pp.y - y0) / hs); o.copy(dk).lerp(mid, clamp(t * 1.5)).lerp(lt, clamp(t * 2 - 1)).multiplyScalar(0.9 + 0.12 * clamp(n.y + 0.3)); }, 'leaf');
  }
}
// a sunflower: a tall stem with two broad leaves, a ring of golden petals (two layers) round a big brown seed face,
// turned toward the camera and the sun
function sunflower(B, x, y, z, rnd, h) {
  const lean = (rnd() - 0.5) * 0.12, tilt = 0.55 + rnd() * 0.25, yaw = (rnd() - 0.5) * 0.6;
  const st = G.cyl(0.022, 0.03, h, 5, true); st.translate(0, h / 2, 0); st.rotateZ(lean); st.translate(x, y, z); B.add(st, '#5f9a3a', 'leaf');
  for (let k = 0; k < 3; k++) { const lf = leafGeo(0.3 + rnd() * 0.1, 0.13, 0.3); lf.rotateZ(0.25 + rnd() * 0.3); lf.rotateY(k * 2.1 + yaw); lf.translate(x, y + 0.04, z); B.add(lf, k % 2 ? '#4f9638' : '#62a845', 'leaf'); }
  for (const s of [-1, 1]) { const lf = leafGeo(0.26, 0.11, 0.25); lf.rotateZ(0.35); lf.rotateY(s > 0 ? yaw : yaw + PI); lf.translate(x, y + h * (s > 0 ? 0.45 : 0.62), z); B.add(lf, '#5aa040', 'leaf'); }
  B.push([x - Math.sin(lean) * h, y + h, z], yaw, 1, -tilt);
  const back = blossomGeo(0.26, 14, 0.55, true, 2); back.rotateX(PI / 2); B.add(back, '#e8a21c', 'leaf'); // (rotateX(PI/2): face +z)
  const front = blossomGeo(0.22, 14, 0.5, true, 2); front.rotateY(PI / 14); front.rotateX(PI / 2); front.translate(0, 0, 0.012); B.add(front, (p, n, o) => o.set('#ffc93a').lerp(new THREE.Color('#ffe27a'), clamp(Math.hypot(p.x, p.y) * 4 - 0.3)), 'leaf');
  const face = G.cyl(0.11, 0.115, 0.05, 10); face.rotateX(PI / 2); face.translate(0, 0, 0.02); B.add(face, (p, n, o) => o.set('#6a3e1e').lerp(new THREE.Color('#9a6030'), clamp(n.z * 0.5) * (0.6 + 0.4 * nz(p.x * 40, p.y * 40))), 'leaf');
  const bk = G.cyl(0.09, 0.06, 0.05, 6); bk.rotateX(PI / 2); bk.translate(0, 0, -0.035); B.add(bk, '#4f8a34', 'leaf');
  B.pop();
}
// a soft leafy mound (a flattened, lumpy dome sat on the ground under a bed), dark at its foot, sunny on top
function mound(B, cx, cz, rx, rz, h, gy, c0, c1) {
  const g = new THREE.SphereGeometry(1, 18, 6, 0, TAU, 0, PI / 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), zz = p.getZ(i), k = 1 + 0.12 * nz(x * 3 + cx, zz * 3 + cz) * y;
    const wx = cx + x * rx, wz = cz + zz * rz; p.setXYZ(i, wx, gy(wx, wz) - 0.03 + y * h * k, wz);
  }
  g.computeVertexNormals();
  const a = new THREE.Color(c0), b = new THREE.Color(c1), y0 = gy(cx, cz);
  B.add(g, (pp, n, o) => o.copy(a).lerp(b, clamp((pp.y - y0) / h)).multiplyScalar(0.92 + 0.12 * nz(pp.x * 6, pp.z * 6)), 'leaf');
}
// the poppy bed: a low bank of leaves, then coral and orange poppies (slim stems, big open four-petal cups round a
// dark eye) packed over it, the tallest in the middle
function poppyBed(B, cx, cz, rx, rz, gy, rnd) {
  mound(B, cx, cz, rx + 0.1, rz + 0.1, 0.2, gy, '#4a8e3c', '#78b454');
  for (let k = 0; k < 90; k++) {
    const a = rnd() * TAU, d = Math.sqrt(rnd()), x = cx + Math.cos(a) * d * rx, z = cz + Math.sin(a) * d * rz, lf = leafGeo(0.22 + rnd() * 0.1, 0.07, 0.3);
    lf.rotateZ(0.3 + rnd() * 0.4); lf.rotateY(rnd() * TAU); lf.translate(x, gy(x, z) + 0.03 + (1 - d) * 0.12, z);
    B.add(lf, rnd() < 0.6 ? '#4f9640' : '#64a84a', 'leaf');
  }
  for (let i = 0; i < 64; i++) { const a = rnd() * TAU, d = Math.sqrt(rnd()), x = cx + Math.cos(a) * d * rx, z = cz + Math.sin(a) * d * rz; poppy(B, x, gy(x, z), z, rnd, 1.15 - d * 0.45); }
}
function poppy(B, x, y, z, rnd, k = 1) {
  const h = (0.38 + rnd() * 0.36) * k, a = rnd() * TAU, lx = Math.cos(a) * 0.05, lz = Math.sin(a) * 0.05;
  const st = G.cyl(0.008, 0.011, h, 3, true); st.translate(0, h / 2, 0); st.rotateX(lz); st.rotateZ(-lx); st.translate(x, y, z); B.add(st, '#5f9a44', 'leaf');
  const R = 0.12 + rnd() * 0.06, cup = blossomGeo(R, 4, 0.72, false, 4);
  const p = cup.attributes.position; for (let i = 0; i < p.count; i++) { const r = Math.hypot(p.getX(i), p.getZ(i)) / R; p.setY(i, r * r * R * 0.55); } cup.computeVertexNormals();
  cup.rotateX(0.35 + rnd() * 0.3); cup.rotateY(rnd() * TAU); cup.translate(x + lx * h, y + h, z + lz * h);
  const cx = x + lx * h, cy = y + h, cz = z + lz * h, c0 = new THREE.Color(rnd() < 0.25 ? '#ff9a5a' : '#ee6a4e'), c1 = c0.clone().lerp(new THREE.Color('#ffd0a8'), 0.35);
  B.add(cup, (pp, n, o) => o.copy(c0).lerp(c1, clamp(Math.hypot(pp.x - cx, pp.z - cz) / R - 0.5)).multiplyScalar(0.85 + 0.2 * clamp(pp.y - cy + 0.5)), 'leaf');
  const eye = G.ico(0.028, 0); eye.scale(1, 0.6, 1); eye.translate(cx, cy + 0.02, cz); B.add(eye, '#2e2a26', 'leaf');
}
function daisy(B, x, y, z, rnd, color) {
  const h = 0.1 + rnd() * 0.12, st = G.cyl(0.006, 0.008, h, 3, true); st.translate(x, y + h / 2, z); B.add(st, '#5f9a44', 'leaf');
  const f = blossomGeo(0.05 + rnd() * 0.025, 8, 0.45, false, 2); f.rotateX(0.4); f.rotateY(rnd() * TAU); f.translate(x, y + h, z); B.add(f, color, 'leaf');
  const e = G.sph(0.018, 5, 3); e.scale(1, 0.6, 1); e.translate(x, y + h + 0.01, z); B.add(e, color === '#ffd24a' ? '#ff9a3a' : '#ffd24a', 'leaf');
}
// a low fence of round posts and sagging rope along local points; a collider row along it
function ropeFence(B, pts, gy, F) {
  const P = [];
  for (let i = 0; i < pts.length; i++) {
    P.push(pts[i]);
    if (i < pts.length - 1) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 1.65); for (let k = 1; k < n; k++) P.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]); }
  }
  const tops = P.map(([x, z]) => { const y = gy(x, z); post(B, x, y, z, 0.68, { r: 0.07, wraps: [0.52], wood: TIMBER, turns: 1, seg: 6 }); return V(x, y + 0.52, z); });
  for (let i = 0; i < tops.length - 1; i++) {
    const a = tops[i], b = tops[i + 1], pp = [];
    for (let k = 0; k <= 7; k++) { const t = k / 7; pp.push({ p: a.clone().lerp(b, t).add(V(0, -Math.sin(t * PI) * 0.1, 0)), r: 0.025 }); }
    B.add(tube(pp, 4, false), ROPE);
    const L = a.distanceTo(b), n = Math.ceil(L / 0.5); for (let k = 0; k <= n; k++) F.solid(a.x + (b.x - a.x) * k / n, a.z + (b.z - a.z) * k / n, 0.16, 'a fence');
  }
}

// ---- the bees: a round yellow-and-brown ball with a pale face, dark eyes, a little stinger and two wing cards; one
// instanced mesh, each bee flying its own lazy loop (bobbing, its heading along the loop, its wings a blur of flaps)
// in the vertex shader. uSwarm (x, y, z, k): the hive bees' loops pulled round that point by k. At night the meadow
// bees are gone (home to bed) and the hive bees keep tight loops by their doors.
function makeBees(loops) {
  const body = new THREE.SphereGeometry(0.075, 9, 6); body.scale(0.95, 0.9, 1.15);
  const eyes = [-1, 1].map(s => { const e = new THREE.SphereGeometry(0.016, 5, 3); e.translate(s * 0.033, 0.018, 0.078); return e; });
  const sting = new THREE.ConeGeometry(0.014, 0.035, 5); sting.rotateX(-PI / 2); sting.translate(0, 0, -0.095);
  const wings = [-1, 1].map(s => { const w = new THREE.CircleGeometry(0.05, 8); w.scale(0.75, 1.15, 1); w.rotateX(-PI / 2 + 0.25); w.rotateZ(s * 0.35); w.translate(s * 0.045, 0.07, -0.012); return w; });
  const parts = [[body, 0], [eyes[0], 0], [eyes[1], 0], [sting, 0], [wings[0], -1], [wings[1], 1]];
  const pos = [], nor = [], col = [], wing = [];
  const Y = new THREE.Color('#ffcf35'), BR = new THREE.Color('#4a3020'), FACE = new THREE.Color('#ffe27a'), DK = new THREE.Color('#231812'), WG = new THREE.Color('#eef8ff');
  for (const [g0, w] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0, p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      pos.push(x, y, z); nor.push(n.getX(i), n.getY(i), n.getZ(i)); wing.push(w);
      let c;
      if (w) c = WG; else if (g0 === sting || eyes.includes(g0)) c = DK;
      else c = z > 0.058 ? FACE : (z > 0.0 && z < 0.028) || (z > -0.058 && z < -0.03) ? BR : Y;
      col.push(c.r, c.g, c.b);
    }
  }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
  const N = loops.length, a = new Float32Array(N * 4), b = new Float32Array(N * 4);
  loops.forEach((l, i) => { a.set([l.x, l.y, l.z, l.rx], i * 4); b.set([l.rz, l.sp, l.ph, l.s * (l.swarm ? -1 : 1)], i * 4); });
  geo.setAttribute('aLoop', new THREE.InstancedBufferAttribute(a, 4)); geo.setAttribute('aFly', new THREE.InstancedBufferAttribute(b, 4));
  geo.instanceCount = N;
  const u = { uSwarm: { value: new THREE.Vector4(0, -99, 0, 0) } };
  const mat = makeToon({
    vertexColors: true, brush: 0.04, rim: 0.45, term: [-0.25, 0.4], emissive: '#ffd060', emissiveIntensity: 0.08, side: THREE.DoubleSide,
    uniforms: u,
    vertexPars: 'attribute vec4 aLoop; attribute vec4 aFly; attribute float aWing; uniform vec4 uSwarm; uniform float uNight;',
    vertexWorld: /* glsl */`{
      float sw = aFly.w < 0.0 ? uSwarm.w : 0.0, sc = abs(aFly.w);
      float t = uTime * aFly.y + aFly.z;
      vec3 c = mix(aLoop.xyz, uSwarm.xyz, sw);
      // after dark the meadow bees go home to bed and the hive bees keep close to their doors
      float nk = smoothstep(0.45, 0.9, uNight);
      vec2 R = mix(vec2(aLoop.w, aFly.x) * (aFly.w < 0.0 ? 1.0 - 0.65 * nk : 1.0), vec2(0.55 + 0.15 * sin(aFly.z * 3.0), 0.5), sw);
      float wob = sin(uTime * 0.43 + aFly.z * 2.7) * 0.35;
      vec3 p = c + vec3(cos(t + wob) * R.x, 0.1 * sin(t * 2.3 + aFly.z) + 0.05 * sin(uTime * 5.3 + aFly.z) + sw * 0.15 * sin(t * 3.1), sin(t + wob) * R.y);
      vec2 d = normalize(vec2(-sin(t + wob) * R.x, cos(t + wob) * R.y) * sign(aFly.y) + 1e-5);
      vec3 l = transformed;
      // the wings flap about their root on the bee's back
      if (aWing != 0.0) {
        float f = (0.55 + 0.55 * sin(uTime * 46.0 + aFly.z * 7.0)) * aWing;
        vec2 r = l.xy - vec2(aWing * 0.012, 0.068);
        float cs = cos(f), sn = sin(f);
        l.xy = vec2(aWing * 0.012, 0.068) + vec2(r.x * cs - r.y * sn, r.x * sn + r.y * cs);
      }
      l *= sc * (aFly.w < 0.0 ? 1.0 : 1.0 - nk);
      vec3 fwd = vec3(d.x, 0.0, d.y), side = vec3(d.y, 0.0, -d.x);
      cWorld.xyz = p + side * l.x + vec3(0.0, l.y, 0.0) + fwd * l.z;
    }`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false; mesh.name = 'bees';
  return { mesh, u };
}
