// Lighthouse Point (ROADMAP HP-1; the concept: tools/blender/work/codex/hollow-pois/concepts/poi-01-lighthouse.png): a
// short chubby striped lighthouse (cream with two coral-red bands, a red dome cap, a glowing golden lamp room behind
// brass mullions, a chunky honey-wood balcony rail, a round-topped red door in a stone arch, a wall lantern), on a knoll
// of rounded mossy rocks at the clearing's sea side; stepping stones up from the trail's spur; the keeper's bench; a
// brass telescope on a tripod looking out to sea; a rope fence along the shore, a crate, barrel planters and flowers.
// At night the lamp glows and a soft beam turns slowly (two faint additive cones: never washes the screen out).
// Interactions: "Look through the telescope" (daily: an admire pose, Shadow says what he sees, a few coins) and
// "Sit on the bench" (a rest).
import * as THREE from 'three';
import { G, V, PI, col } from '../../buildings/kit.js';
import { faceColors, bench, barrel, crate, nz, leafGeo } from '../../buildings/props.js';
import { tube } from '../../../gfx/geom.js';
import { clamp, TAU } from '../../../core/util.js';
import { makeToon } from '../../../gfx/materials.js';
import { site, bare, lineDist, boulder, groundStone, stepStone, pebbles, ropeFence, flowers, fern, tuft, shrub, foam, WOOD, WOOD_HI, WOOD_D, BRASS, BLOOMS, tris } from './_west.js';

const CREAM = '#f6e5bb', RED = '#cf5741', RED_D = '#a94335', STONE_W = '#d6cdc4';
// the tower, in its own frame (y up from the door's threshold, +z toward the door)
const TOWER = { x: -3.0, z: 0.2, door: 1.02 }; // local centre, the door's yaw (it faces the trail's spur)
const R0 = 1.42, R1 = 1.16, TOP = 3.85; // the tower's radius at the threshold and under the gallery, the gallery height
const RAD = h => R0 + (R1 - R0) * clamp(h / TOP, -0.4, 1);
const SIGHTS = [
  "I can see a little sailboat way out there. It's waving its flag at us!",
  'A whale just puffed a spout out past the rocks. Hello, whale!',
  "There's a seal napping on a far rock. That's my kind of afternoon.",
  'I can see the far islands! One looks just like a sleeping cat.',
  'Seagulls are riding the wind out there. They make it look so easy.',
];

export function build(ctx) {
  const S = site(ctx, -1.0), { H } = S;
  const T = TOWER, dx = Math.sin(T.door), dz = Math.cos(T.door);
  const yb = H(T.x + dx * R0, T.z + dz * R0) + 0.04; // the threshold: the ground at the door
  const bench0 = { x: 0.55, z: -3.35, yaw: -0.62 }, scope = { x: -0.95, z: -4.55, aim: Math.atan2(0.38, -0.92) };

  const inst = S.kit(101, B => {
    B.push([T.x, yb, T.z], T.door);
    tower(B);
    B.pop();
    // ---- the knoll: big rounded boulders hugging the tower's sea side, the shore, rocks out in the sea
    const tw = (a, d) => [T.x + Math.cos(a) * d, T.z + Math.sin(a) * d];
    for (const [a, d, r] of [[2.2, 1.75, 1.05], [2.75, 1.85, 1.25], [3.35, 1.8, 1.2], [3.95, 1.7, 1.1], [4.55, 1.75, 0.95], [1.65, 1.8, 0.8], [5.1, 1.65, 0.7]]) {
      const [x, z] = tw(a, d); groundStone(B, S, x, z, r, { sink: 0.35, moss: 0.45, sq: 0.8 });
    }
    for (const [x, z, r] of [[-5.6, -2.6, 1.3], [-5.3, 3.2, 1.2], [-4.4, 5.4, 1.0], [-3.9, -4.6, 1.05], [-3.1, -6.9, 0.9], [-2.2, 7.0, 0.85], [-6.2, 0.6, 1.0], [-4.6, -1.0, 0.75]]) groundStone(B, S, x, z, r, { sink: 0.3, moss: 0.4 });
    for (const [x, z, r] of [[-8.3, -3.8, 1.15], [-9.4, 1.8, 1.25], [-7.6, 5.6, 0.95], [-10.6, -1.4, 0.8], [-6.1, -7.6, 0.9], [-8.9, 7.8, 0.75]]) { boulder(B, S, x, 1.0 - r * 0.3, z, r, { moss: 0.45, sq: 1.05, wet: 1.06, stretch: 1, detail: 2 }); foam(B, S, x, z, r * 0.97, 1.0); }
    for (const [x, z, r] of [[-7.7, -3.0, 0.45], [-9.9, 3.0, 0.5], [-6.9, 6.6, 0.4], [-5.2, -8.4, 0.45]]) { boulder(B, S, x, 0.95 - r * 0.2, z, r, { moss: 0.3, sq: 0.8, wet: 1.04, stretch: 1 }); foam(B, S, x, z, r * 0.95, 1.0, { n: 3 }); }
    // ---- the way in: two rounded stone steps at the door, stepping stones down to the spur
    B.push([T.x, yb, T.z], T.door);
    for (const [r, y, z] of [[0.86, -0.02, R0 + 0.12], [0.6, 0.1, R0 + 0.02]]) {
      const g = G.cyl(r, r + 0.04, 0.16, 18); g.scale(1, 1, 0.62); g.translate(0, y, z);
      B.add(g, (p, n, o) => o.set(STONE_W).multiplyScalar(n.y > 0.5 ? 1.02 : 0.84));
    }
    B.pop();
    [[-0.95, 1.38, 0.36], [0.05, 1.62, 0.32], [1.1, 1.75, 0.34], [2.15, 1.82, 0.3], [3.15, 1.95, 0.33]].forEach(([x, z, r]) => stepStone(B, S, x, z, r));
    // ---- the keeper's bench, the telescope
    B.at([bench0.x, H(bench0.x, bench0.z), bench0.z], bench0.yaw, () => bench(B, { w: 1.7, wood: WOOD, legs: WOOD_D }));
    telescope(B, S, scope.x, scope.z, scope.aim);
    // ---- the rope fence along the shore (north and south of the knoll)
    ropeFence(B, S, [[-1.95, -2.75], [-1.95, -4.35], [-1.45, -5.95], [-0.2, -7.15], [1.3, -7.75]]);
    ropeFence(B, S, [[-3.45, 2.75], [-3.0, 4.35], [-2.0, 5.75], [-0.6, 6.75]]);
    // the trail side: two runs with the way in left open where the spur arrives
    ropeFence(B, S, [[2.9, -6.6], [3.2, -4.6], [3.35, -2.6], [3.45, -0.7]]);
    ropeFence(B, S, [[3.6, 3.7], [3.2, 5.4], [2.2, 6.8]]);
    flowers(B, S, 2.6, -3.3, { n: 5, r: 0.45, spikes: 1 });
    flowers(B, S, 2.85, -0.9, { n: 5, r: 0.4 });
    flowers(B, S, 2.75, 4.6, { n: 6, r: 0.5, spikes: 1 });
    shrub(B, S, 2.5, -5.6, { r: 0.42, flowers: ['#ffffff', '#ffb2cc'] });
    shrub(B, S, 2.3, 6.0, { r: 0.45, flowers: ['#ff8fb4'] });
    shrub(B, S, 3.0, -1.7, { r: 0.36, color: '#62ad45' });
    shrub(B, S, 3.1, 4.5, { r: 0.38, flowers: ['#ffffff'] });
    shrub(B, S, -3.1, 3.6, { r: 0.36, color: '#4f9a3c' });
    flowers(B, S, 0.2, 3.2, { n: 4, r: 0.35, colors: ['#ffffff', '#ffd76a'] });
    // ---- the door's crate, barrel planters, the wall flowers
    const out = (k, s) => [T.x + dx * (R0 + 0.35) + dz * s * k, T.z + dz * (R0 + 0.35) - dx * s * k];
    { const [x, z] = out(1, 0.95); B.at([x, H(x, z) - 0.02, z], T.door + 0.3, () => crate(B, { s: 0.58, wood: '#c98f55' })); }
    for (const [x, z, r] of [[...out(-1, 1.0), 0.24], [-0.15, 2.55, 0.2]]) B.at([x, H(x, z) - 0.02, z], S.rnd() * TAU, () => { barrel(B, { r, h: r * 1.5, wood: '#b9773c', lid: false }); shrubTop(B, r); });
    flowers(B, S, -1.55, 2.35, { n: 9, r: 0.55, spikes: 2 });
    flowers(B, S, -2.6, 2.4, { n: 6, r: 0.45, spikes: 1 });
    flowers(B, S, -0.6, -0.55, { n: 7, r: 0.5, spikes: 2 });
    flowers(B, S, -1.6, -1.6, { n: 5, r: 0.4 });
    flowers(B, S, 0.4, 0.35, { n: 5, r: 0.45, colors: ['#ffffff', '#ffd76a', '#ffb2cc'] });
    flowers(B, S, 1.5, -2.3, { n: 4, r: 0.4 });
    flowers(B, S, 1.0, 3.6, { n: 6, r: 0.5 });
    flowers(B, S, -0.4, 5.3, { n: 6, r: 0.55 });
    flowers(B, S, 0.9, -6.6, { n: 6, r: 0.5 });
    flowers(B, S, 2.4, -4.7, { n: 4, r: 0.4, colors: ['#ffffff', '#fff3f8'] });
    flowers(B, S, -0.9, -6.1, { n: 5, r: 0.45, spikes: 1 });
    flowers(B, S, 1.7, -6.3, { n: 5, r: 0.45 });
    flowers(B, S, -2.3, 4.85, { n: 5, r: 0.4, spikes: 1 });
    shrub(B, S, -2.2, -1.85, { r: 0.5, flowers: ['#ffffff', '#ffb2cc'] });
    shrub(B, S, -0.25, -2.2, { r: 0.42, color: '#62ad45' });
    shrub(B, S, -2.35, 3.55, { r: 0.55, flowers: ['#ff8fb4', '#ffffff'] });
    shrub(B, S, -1.2, 4.6, { r: 0.45 });
    shrub(B, S, -1.7, -7.5, { r: 0.5, flowers: ['#ffffff'] });
    for (const [x, z] of [[-1.25, -3.1], [-2.6, -5.6], [-2.85, 1.95], [-1.9, 6.2], [0.3, -7.3], [-3.6, 4.6]]) fern(B, S, x, z, { s: 0.9 });
    for (const [x, z] of [[-3.3, -3.6], [-3.0, -5.1], [-3.9, 3.3], [-3.2, 6.3], [-2.9, -7.4], [0.9, -1.4], [-0.3, 1.0], [2.2, 0.6]]) tuft(B, S, x, z, { h: 0.5 });
    pebbles(B, S, 1.2, 1.2, 8, 2.0);
    pebbles(B, S, -0.5, -4.4, 5, 1.4);
    B.height = 6.5;
  });

  // ---- the way in is trodden earth under the stepping stones (no lawn through them)
  const path = [[-1.4, 1.2], [-0.95, 1.38], [0.05, 1.62], [1.1, 1.75], [2.15, 1.82], [3.15, 1.95], [4.6, 1.95]];
  bare(S, (x, z) => lineDist(x, z, path) < 0.55, 200);

  // ---- colliders: the tower, the knoll, the bench, the telescope, the crate and barrels
  S.collide(T.x, T.z, R0 + 0.1);
  for (const [x, z, r] of [[-5.6, -2.6, 1.0], [-5.3, 3.2, 0.95], [-4.4, 5.4, 0.8], [-3.9, -4.6, 0.85], [-3.1, -6.9, 0.7], [-2.2, 7.0, 0.65], [-6.2, 0.6, 0.8], [-4.6, -1.0, 0.6]]) S.collide(x, z, r);
  const fx = Math.sin(bench0.yaw), fz = Math.cos(bench0.yaw);
  S.collide(bench0.x - fx * 0.05 + fz * 0.45, bench0.z - fz * 0.05 - fx * 0.45, 0.32); S.collide(bench0.x - fx * 0.05 - fz * 0.45, bench0.z - fz * 0.05 + fx * 0.45, 0.32);
  S.collide(scope.x, scope.z, 0.3);
  S.collide(T.x + dx * (R0 + 0.35) + dz * 0.95, T.z + dz * (R0 + 0.35) - dx * 0.95, 0.35);
  S.collide(T.x + dx * (R0 + 0.35) - dz * 1.0, T.z + dz * (R0 + 0.35) + dx * 1.0, 0.28);
  S.collide(-0.15, 2.55, 0.24);

  // ---- the beam: two soft cones from the lamp, turning slowly after dark
  const lamp = S.W(T.x, yb + 4.85, T.z);
  const glassM = glassMesh(); glassM.position.copy(S.W(T.x, yb + TOP + 1.03, T.z)); ctx.add(glassM);
  const beam = makeBeam(); beam.position.copy(lamp); ctx.add(beam);
  const beamMat = beam.children[0].material;

  // ---- interactions
  S.interact({
    x: scope.x + Math.cos(scope.aim) * -0.75, z: scope.z + Math.sin(scope.aim) * -0.75, r: 1.2, label: 'Look through the telescope',
    onInteract() {
      const P = ctx.G.player; if (!P) return;
      const sea = S.W(scope.x + Math.cos(scope.aim) * 6, 0, scope.z + Math.sin(scope.aim) * 6);
      const first = !ctx.doneToday('telescope');
      ctx.pose('admire', {
        dur: 2.6, at: 0.55, face: { x: sea.x, z: sea.z },
        onAct() {
          if (first && ctx.daily('telescope')) {
            const day = ctx.G.state?.day || 1;
            ctx.say(SIGHTS[day % SIGHTS.length]);
            ctx.give({ coins: 12, at: S.W(scope.x, H(scope.x, scope.z) + 1.3, scope.z) });
          } else ctx.toast('The sea sparkles all the way out to the sky.');
        },
      });
    },
  });
  S.interact({
    x: bench0.x + fx * 0.6, z: bench0.z + fz * 0.6, r: 1.2, label: 'Sit on the bench',
    onInteract() {
      const p = S.W(bench0.x + fx * 0.06, 0, bench0.z + fz * 0.06);
      ctx.sit({ x: p.x, z: p.z, face: bench0.yaw, dur: 6, onDone: rested => { if (rested) ctx.rest(); } });
    },
  });

  return {
    tris: tris(inst.group) + tris(beam) + tris(glassM),
    update(dt, t, night) {
      beam.rotation.y = t * 0.32;
      const k = clamp((night - 0.25) / 0.6);
      beamMat.uniforms.uK.value = k * 0.11;
      beam.visible = k > 0.01;
      glassM.material.emissiveIntensity = 0.08 + 0.5 * night;
    },
  };
}

// the tower: rounded stone courses (cream, two coral bands), a stone foot, the door, a window, the wall lantern, the
// corbelled red gallery and its honey-wood rail, the lamp room and the dome
function tower(B) {
  const courses = [[-1.25, 0.3, 'foot'], [0.3, 0.86, CREAM], [0.86, 1.52, CREAM], [1.52, 2.1, RED], [2.1, 2.7, CREAM], [2.7, 3.28, RED], [3.28, 3.72, CREAM]];
  courses.forEach(([y0, y1, c], ci) => {
    const m = (y0 + y1) / 2, e = 0.035;
    const pts = [[RAD(y0) - e, y0], [RAD(y0) - 0.006, y0 + e], [RAD(m) + 0.012, m], [RAD(y1) - 0.006, y1 - e], [RAD(y1) - e, y1]];
    const g = G.lathe(pts, 30), foot = c === 'foot', base = col(foot ? '#b9afb6' : c);
    const tones = Array.from({ length: 11 }, (_, k) => base.clone().multiplyScalar(0.95 + 0.07 * Math.sin(k * 2.7 + ci * 1.9)));
    B.add(faceColors(g, (p, n, o, cc) => {
      const a = (Math.atan2(cc.z, cc.x) / TAU + 1 + ci * 0.045) % 1, blk = Math.floor(a * 11) % 11;
      o.copy(tones[blk]).multiplyScalar(0.9 + 0.12 * clamp(n.y * 2 + 0.5));
      if (foot) o.lerp(col('#7da848'), clamp((0.05 - p.y) * 0.8) * clamp(nz(p.x * 3, p.z * 3) + 0.4) * 0.6); // (moss creeping up the foot)
    }), null);
  });
  // the door: four red planks under a round top, a brass porthole and knob, in an arch of rounded stones, on the steps
  const zr = RAD(0.6) + 0.02;
  B.push([0, 0.17, zr]);
  for (let i = 0; i < 4; i++) {
    const x = -0.3 + i * 0.2, top = 1.0 + Math.sqrt(Math.max(0, 0.16 - x * x)) * 0.75;
    const pl = G.box(0.19, top, 0.1, 0.02); pl.translate(x, top / 2, 0); B.add(pl, (p, n, o) => o.set(i % 2 ? RED : '#c34e3c').multiplyScalar(n.z > 0.5 ? 1 : 0.78));
  }
  const hole = G.torus(0.105, 0.03, 6, 14); hole.translate(0, 0.98, 0.065); B.add(hole, BRASS);
  const gl = G.disc(0.09, 12); gl.translate(0, 0.98, 0.06); B.glow(gl, '#8fc6d8', { tint: 0.4 });
  const knob = G.sph(0.04, 8, 5); knob.translate(0.24, 0.62, 0.07); B.add(knob, BRASS);
  for (let k = 0; k <= 8; k++) { // the arch's voussoirs
    const a = PI * k / 8, cx = Math.cos(a) * 0.53, cy = 1.0 + Math.sin(a) * 0.5;
    const s = G.beam(0.2, 0.17, 0.14, 0.035); s.rotateZ(a - PI / 2); s.translate(cx, cy, 0.03); B.add(s, k % 2 ? STONE_W : '#cbc1b8');
  }
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) { const s = G.beam(0.17, 0.3, 0.14, 0.035); s.translate(sx * 0.53, 0.16 + k * 0.32, 0.03); B.add(s, (k + (sx > 0)) % 2 ? STONE_W : '#cbc1b8'); }
  B.pop();
  // a small arched window round the side, and one high on the far side
  for (const [a, y] of [[-0.95, 2.18], [2.4, 0.95]]) {
    const r = RAD(y) + 0.01;
    B.at([Math.sin(a) * r, y, Math.cos(a) * r], a, () => {
      const g = G.box(0.3, 0.32, 0.08, 0.03); g.translate(0, 0, 0); B.glow(g, '#6f96b8', { tint: 0.5 });
      const tp = G.cyl(0.15, 0.15, 0.08, 10); tp.rotateX(PI / 2); tp.translate(0, 0.16, 0); B.glow(tp, '#6f96b8', { tint: 0.5 });
      const fr = G.torus(0.19, 0.045, 5, 12, PI); fr.translate(0, 0.16, 0.03); B.add(fr, STONE_W);
      for (const sx of [-1, 1]) { const j = G.box(0.08, 0.36, 0.09, 0.025); j.translate(sx * 0.19, -0.02, 0.03); B.add(j, STONE_W); }
      const sill = G.box(0.48, 0.07, 0.16, 0.03); sill.translate(0, -0.2, 0.05); B.add(sill, '#cbc1b8');
    });
  }
  // the wall lantern beside the door: a bracket and a brass box lantern with warm glass
  { const a = 0.52, y = 1.32, r = RAD(y);
    B.at([Math.sin(a) * r, y, Math.cos(a) * r], a, () => {
      const br = G.box(0.05, 0.05, 0.22, 0.012); br.translate(0, 0.2, 0.1); B.add(br, '#4a3a34');
      const cap = G.cyl(0.03, 0.12, 0.08, 4); cap.rotateY(PI / 4); cap.translate(0, 0.17, 0.2); B.add(cap, BRASS);
      const glass = G.box(0.15, 0.2, 0.15, 0.02); glass.translate(0, 0.03, 0.2); B.glow(glass, '#ffd890', { flicker: 0.6 });
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const p = G.box(0.025, 0.22, 0.025, 0); p.translate(sx * 0.075, 0.03, 0.2 + sz * 0.075); B.add(p, BRASS); }
      const bot = G.cyl(0.09, 0.05, 0.05, 4); bot.rotateY(PI / 4); bot.translate(0, -0.09, 0.2); B.add(bot, BRASS);
      B.light([0, 0.05, 0.35], { color: '#ffc070', intensity: 1.5, radius: 4, flicker: 0.5 });
    }); }
  // the gallery: a corbelled red flare, a plank deck rim, chunky honey posts and two rails
  const gy = TOP;
  const corb = G.lathe([[RAD(gy - 0.2) - 0.02, gy - 0.2], [RAD(gy - 0.1) + 0.06, gy - 0.12], [1.5, gy + 0.02], [1.78, gy + 0.1], [1.8, gy + 0.2], [1.72, gy + 0.24]], 30);
  B.add(corb, (p, n, o) => o.set(RED).multiplyScalar(n.y < -0.3 ? 0.72 : 0.92 + 0.1 * clamp(n.y)));
  const deck = G.cyl(1.72, 1.72, 0.04, 30); deck.translate(0, gy + 0.24, 0); B.add(deck, (p, n, o) => o.set(RED_D).multiplyScalar(0.95 + 0.05 * nz(p.x * 6, p.z * 6)));
  const NP = 16, rr = 1.64;
  for (let k = 0; k < NP; k++) {
    const a = k / NP * TAU, px = Math.cos(a) * rr, pz = Math.sin(a) * rr;
    const p = G.cyl(0.055, 0.06, 0.62, 7); p.translate(px, gy + 0.55, pz); B.add(p, (pp, n, o) => o.set(WOOD).multiplyScalar(0.85 + 0.15 * clamp(n.x * 0.5 + 0.5)));
    const c = G.sph(0.075, 6, 4); c.scale(1, 0.7, 1); c.translate(px, gy + 0.9, pz); B.add(c, WOOD_HI);
  }
  for (const [y, t] of [[gy + 0.82, 0.058], [gy + 0.48, 0.04]]) { const ring = G.torus(rr, t, 6, 40); ring.rotateX(PI / 2); ring.translate(0, y, 0); B.add(ring, (p, n, o) => o.set(WOOD_HI).multiplyScalar(0.85 + 0.2 * clamp(n.y * 0.5 + 0.5))); }
  // the lamp room: a cream drum, golden glass between brass mullions, brass rings, the red dome and its finial
  const drum = G.lathe([[1.02, gy + 0.24], [1.05, gy + 0.3], [1.04, gy + 0.52], [0.98, gy + 0.56]], 24); B.add(drum, CREAM);
  const g0 = gy + 0.56, g1 = gy + 1.5;
  // (the glass itself is its own see-through mesh, glassMesh(): inside it the lamp, a ridged golden lens on a pedestal)
  const ped = G.cyl(0.2, 0.28, 0.22, 10); ped.translate(0, g0 + 0.11, 0); B.add(ped, '#7a5a34');
  const lp = [], LH = 0.62; for (let k = 0; k <= 12; k++) { const t = k / 12; lp.push([0.001 + (0.36 + 0.06 * Math.sin(t * PI)) * (k % 2 ? 0.94 : 1) * (k === 0 || k === 12 ? 0.6 : 1), g0 + 0.22 + t * LH]); }
  const lens = G.lathe(lp, 14); B.glow(lens, (p, n, o) => o.set('#ffc256').lerp(col('#fff3c8'), clamp(1 - Math.abs(p.y - (g0 + 0.22 + LH / 2)) * 3.2) * 0.7), { hot: true, tint: 0.85, flicker: 0.12 });
  const lcap = G.cyl(0.12, 0.24, 0.1, 10); lcap.translate(0, g0 + 0.22 + LH + 0.05, 0); B.add(lcap, BRASS);
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, m = G.box(0.07, g1 - g0, 0.07, 0.02); m.rotateY(-a); m.translate(Math.cos(a) * 0.95, (g0 + g1) / 2, Math.sin(a) * 0.95); B.add(m, '#9a7032'); }
  for (const y of [g0, g1]) { const ring = G.torus(0.96, 0.045, 5, 24); ring.rotateX(PI / 2); ring.translate(0, y, 0); B.add(ring, BRASS); }
  const band = G.lathe([[1.08, g1 + 0.0], [1.12, g1 + 0.05], [1.12, g1 + 0.13], [1.08, g1 + 0.17]], 28); B.add(band, CREAM);
  const dome = G.lathe([[1.1, g1 + 0.16], [1.15, g1 + 0.22], [1.08, g1 + 0.3], [0.98, g1 + 0.48], [0.8, g1 + 0.7], [0.55, g1 + 0.86], [0.28, g1 + 0.95], [0.001, g1 + 0.98]], 28);
  B.add(dome, (p, n, o) => o.set(RED).multiplyScalar(0.86 + 0.18 * clamp(n.y)).lerp(col('#f07a62'), clamp(n.y - 0.6) * 0.3));
  const under = G.cyl(1.1, 1.1, 0.04, 28); under.translate(0, g1 + 0.01, 0); B.add(under, RED_D);
  const stem = G.cyl(0.07, 0.11, 0.2, 10); stem.translate(0, g1 + 1.06, 0); B.add(stem, RED_D);
  const ball = G.sph(0.15, 12, 8); ball.translate(0, g1 + 1.24, 0); B.add(ball, (p, n, o) => o.set(RED).lerp(col('#ff9a84'), clamp(n.y) * 0.3));
  B.light([0, g0 + 0.45, 0], { color: '#ffd080', intensity: 1.7, radius: 8, flicker: 0.2 });
}

// a brass telescope on a honey-wood tripod: three splayed legs to the grass, a brass yoke, a dark tube with brass bands
function telescope(B, S, x, z, aim) {
  const gy = S.H(x, z), top = V(x, gy + 1.0, z);
  for (let k = 0; k < 3; k++) {
    const a = aim + PI + (k - 1) * 2.1, fx = x + Math.cos(a) * 0.42, fz = z + Math.sin(a) * 0.42, foot = V(fx, S.H(fx, fz) - 0.02, fz);
    B.add(tube([{ p: top.clone().add(V(0, -0.05, 0)), r: 0.035 }, { p: foot.clone().lerp(top, 0.5), r: 0.032 }, { p: foot, r: 0.028 }], 6, false), WOOD);
    const cap = G.cyl(0.035, 0.04, 0.05, 6); cap.translate(fx, foot.y + 0.02, fz); B.add(cap, BRASS);
  }
  const hub = G.cyl(0.07, 0.09, 0.1, 10); hub.translate(x, top.y, z); B.add(hub, BRASS);
  const el = 0.13, ux = Math.cos(aim) * Math.cos(el), uy = Math.sin(el), uz = Math.sin(aim) * Math.cos(el);
  const c = V(x, top.y + 0.13, z), u = V(ux, uy, uz), L = 0.95;
  const at = s => c.clone().addScaledVector(u, s);
  B.add(tube([{ p: at(-L * 0.42), r: 0.045 }, { p: at(-L * 0.1), r: 0.06 }, { p: at(L * 0.35), r: 0.072 }, { p: at(L * 0.58), r: 0.085 }], 12, false), (p, n, o) => o.set('#4a3630').multiplyScalar(0.85 + 0.3 * clamp(n.y)));
  for (const [s, r] of [[-L * 0.4, 0.055], [-L * 0.08, 0.07], [L * 0.3, 0.082], [L * 0.56, 0.1]]) { const b = tube([{ p: at(s - 0.035), r }, { p: at(s + 0.035), r }], 12, false); B.add(b, BRASS); }
  const eye = tube([{ p: at(-L * 0.42 - 0.1), r: 0.03 }, { p: at(-L * 0.42 + 0.01), r: 0.034 }], 8, false); B.add(eye, BRASS);
  const lens = G.disc(0.085, 12); lens.lookAt(u); lens.translate(...at(L * 0.6).toArray()); B.glow(lens, '#bfe6f0', { tint: 0.3 });
  for (const sx of [-1, 1]) { const y = G.box(0.025, 0.16, 0.05, 0.01); y.rotateY(-aim); y.translate(x - Math.sin(aim) * sx * 0.085, top.y + 0.07, z + Math.cos(aim) * sx * 0.085); B.add(y, BRASS); }
}

// a barrel planter's leafy fill and a few blooms
function shrubTop(B, r) {
  for (let i = 0; i < 34; i++) {
    const a = i * 2.4, d = Math.sqrt((i % 9) / 9) * r * 0.85, g = leafGeo(0.16, 0.065, 0.4); g.rotateZ(0.35 + (1 - d / r) * 0.4); g.rotateY(-a);
    g.translate(Math.cos(a) * d * 0.6, r * 1.5 + 0.03 + (1 - d / r) * 0.1, Math.sin(a) * d * 0.6); B.add(g, ['#4f9a3c', '#62ad45', '#76bd4e'][i % 3], 'leaf');
  }
  for (let i = 0; i < 5; i++) { const a = i * 1.3, f = G.sph(0.045, 6, 4); f.scale(1, 0.6, 1); f.translate(Math.cos(a) * r * 0.5, r * 1.5 + 0.2, Math.sin(a) * r * 0.5); B.add(f, BLOOMS[i % 4], 'leaf'); }
}

// the lamp room's glass: a faintly amber see-through drum (the lens glows through it), warmer at night
function glassMesh() {
  const g = new THREE.CylinderGeometry(0.93, 0.93, 0.94, 24, 1, true);
  const m = makeToon({ color: '#ffe9b0', transparent: true, opacity: 0.32, emissive: '#ffc870', emissiveIntensity: 0.1, rim: 0.8, brush: 0.02 });
  m.depthWrite = false;
  const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 2; mesh.name = 'west:lighthouse:glass';
  return mesh;
}

// the beam: two long soft cones of warm light from the lamp, brightest at the lamp, fading out along their length and
// at their silhouettes (additive, no depth write; uK from the night, kept low)
function makeBeam() {
  const L = 10, g = new THREE.ConeGeometry(2.1, L, 20, 6, true);
  g.translate(0, -L / 2, 0); g.rotateZ(PI / 2); g.rotateY(0); // (apex at the origin, opening along +x)
  g.rotateZ(-0.07); // (a touch downward, over the sea)
  const both = [g, g.clone().rotateY(PI)];
  const pos = [], t = [];
  for (const q of both) { const p = q.attributes.position; for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); } }
  const idx = []; let off = 0;
  for (const q of both) { for (let i = 0; i < q.index.count; i++) idx.push(q.index.getX(i) + off); off += q.attributes.position.count; }
  for (let i = 0; i < pos.length; i += 3) t.push(Math.hypot(pos[i], pos[i + 1], pos[i + 2]) / L);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('aT', new THREE.Float32BufferAttribute(t, 1)); geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = new THREE.ShaderMaterial({
    uniforms: { uK: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */`attribute float aT; varying float vT; varying vec3 vN; varying vec3 vV;
      void main() { vT = aT; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`uniform float uK; varying float vT; varying vec3 vN; varying vec3 vV;
      void main() {
        float f = abs(dot(normalize(vN), normalize(vV)));
        float a = uK * pow(1.0 - clamp(vT, 0.0, 1.0), 1.6) * smoothstep(0.02, 0.12, vT) * smoothstep(0.05, 0.6, f);
        gl_FragColor = vec4(vec3(1.0, 0.88, 0.6) * a, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 3;
  const grp = new THREE.Group(); grp.name = 'west:lighthouse:beam'; grp.add(mesh); grp.visible = false;
  return grp;
}
