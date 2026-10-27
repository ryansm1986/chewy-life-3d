// Firefly Moon Pond (ROADMAP HP-1; the concept: tools/blender/work/codex/hollow-pois/concepts/poi-06-moonpond.png): a
// small still round pond on the dry shelf (its own water: a deep-blue to turquoise disc ringed with mossy boulders,
// soft ripple rings, the lanterns' warm reflections at night), lily pads with pink lotus, cattails, two happy stone
// frogs by a short rope-posted dock, three wooden lantern posts with round paper lanterns (two of them light the bank at
// night), ferns and flowers, petals floating on the water, and fireflies drifting over the pond and the grass at dusk
// and night (a shader-animated point cloud). "Make a wish" at the end of the dock once it's dusk (by day: "Come back at
// night"): once a day, sparkles rise from the water, Shadow says something, and a small gift (25 coins, a jar of honey
// or a peach). Built by world/outskirts/index.js with ctx (the toolkit documented there).
import * as THREE from 'three';
import { G, V, PI } from '../../buildings/kit.js';
import { bush, mossStone } from '../../buildings/props.js';
import { puff } from '../../../gfx/geom.js';
import { U } from '../../../gfx/materials.js';
import { TAU, clamp, smoothstep, mulberry32 } from '../../../core/util.js';
import { POI } from '../../outskirtsPlan.js';
import { frame, boulder, fern, flowers, cattails, lilyPad, lanternPost, roundPost, ropeWrap, PLANKS, WOOD_D, trailClear } from './_north.js';

// the layout in screen metres from the shot's focus (1.5 m south-east of the centre; sr right, su up the screen)
const S2 = Math.SQRT1_2, at = (sr, su, poi = POI.moonpond) => [poi.x + 1.5 + (sr - su) * S2, poi.z + 1.5 + (-sr - su) * S2];
const POND = (() => { const [x, z] = at(0.3, 3.8); return { x, z, R: 2.75 }; })();
const DOCK = { x: POND.x - 0.35, w: 1.5, len: 2.7 }; // (from the south bank out over the water, toward −z)
const FIREFLIES = 44;

export function build(ctx) {
  const F = frame(ctx), rnd = ctx.rand, H = ctx.H;
  // the water sits just above the highest ground under it (the boulders hide its rim)
  let wy = -9; for (let a = 0; a < 16; a++) for (const k of [0, 0.5, 1]) wy = Math.max(wy, H(POND.x + Math.cos(a / 16 * TAU) * POND.R * k, POND.z + Math.sin(a / 16 * TAU) * POND.R * k));
  wy += 0.03;
  const zRoot = POND.z + POND.R + 0.45, zEnd = zRoot - DOCK.len, deckY = wy + 0.22;
  const L = (x, z) => [x - F.X, z - F.Z], ly = y => y - F.Y;
  const lamps = [];
  const inst = ctx.kit(6606, B => {
    // ---- the rim: mossy boulders all round, big at the back, low on the camera's side, a gap for the dock
    const N = 22;
    for (let i = 0; i < N; i++) {
      const a = i / N * TAU + rnd() * 0.12, cx = Math.cos(a), cz = Math.sin(a), back = clamp(-(cx + cz) * S2 * 0.5 + 0.5); // (1 at the back, 0 toward the camera)
      const x = POND.x + cx * (POND.R + 0.18), z = POND.z + cz * (POND.R + 0.18);
      if (Math.abs(x - DOCK.x) < DOCK.w / 2 + 0.35 && z > POND.z) continue; // (the dock's landing)
      if ([-2.3, -0.5].some(b => Math.abs(((a - b + PI) % TAU + TAU) % TAU - PI) < 0.16)) continue; // (the lantern posts)
      const r = 0.36 + back * 0.42 + rnd() * 0.14, [lx, lz] = L(x, z);
      boulder(B, lx, F.gy(lx, lz), lz, r, { seed: 70 + i, yaw: a + PI / 2, moss: 0.45 + back * 0.2, stretch: 1.3, sq: 0.62 + back * 0.12, sink: 0.36 });
      if (trailClear(x, z, r, 'moonpond rim')) ctx.collide(x, z, r * 0.8);
      if (back > 0.55 && i % 2) flowers(B, lx - cx * r * 0.6, F.gy(lx, lz) + r * 0.7, lz - cz * r * 0.6, rnd, { n: 2, r: 0.2 });
    }
    // a few bigger boulders on the bank behind, and small flat stones stepping to the dock
    for (const [sr, su, r] of [[-2.6, 5.2, 0.9], [4.2, 3.6, 0.85], [4.4, 4.3, 0.6], [-3.4, 2.6, 0.55], [5.0, 1.2, 0.5]]) {
      const [x, z] = at(sr, su), [lx, lz] = L(x, z); boulder(B, lx, F.gy(lx, lz), lz, r, { seed: 90 + Math.round(r * 10), yaw: sr, moss: 0.6 });
      if (trailClear(x, z, r, 'moonpond boulder')) ctx.collide(x, z, r * 0.85);
    }
    for (const [dx, dz, r] of [[-0.25, 0.55, 0.36], [0.3, 1.05, 0.3]]) {
      const [lx, lz] = L(DOCK.x + dx, zRoot + dz), g = puff(V(0, 0, 0), r, { detail: 2, noise: 0.1, squash: 0.32, seed: 7 + r * 10 });
      g.scale(1.25, 1, 1); g.translate(lx, F.gy(lx, lz) + 0.01, lz); B.add(g, mossStone('#b8b0b8', 0.25, 4));
    }
    // ---- the dock: broad planks across two rounded beams on round posts, rope wraps, tall posts at its end
    const [dx, dz0] = L(DOCK.x, zRoot), dz1 = dz0 - DOCK.len, dy = ly(deckY), hw = DOCK.w / 2;
    const n = Math.round(DOCK.len / 0.27);
    for (let i = 0; i < n; i++) {
      const z = dz0 - (i + 0.5) * DOCK.len / n, p = G.box(DOCK.w, 0.08, DOCK.len / n - 0.025, 0.025); p.translate(dx, dy - 0.04, z);
      const c = PLANKS[(i * 7 + 3) % 3]; B.add(p, (pp, nn, o) => o.set(c).multiplyScalar(nn.y > 0.5 ? 1 : 0.8));
      for (const s of [-1, 1]) { const peg = G.cyl(0.018, 0.018, 0.01, 6); peg.translate(dx + s * (hw - 0.12), dy + 0.003, z); B.add(peg, '#5a4038'); }
    }
    for (const s of [-1, 1]) { const b = G.box(0.12, 0.13, DOCK.len, 0.04); b.translate(dx + s * (hw - 0.14), dy - 0.15, (dz0 + dz1) / 2); B.add(b, WOOD_D); }
    for (const [s, z, tall] of [[-1, dz1 + 0.08, true], [1, dz1 + 0.08, true], [-1, (dz0 + dz1) / 2, false], [1, (dz0 + dz1) / 2, false], [-1, dz0 - 0.12, true], [1, dz0 - 0.12, true]]) {
      const x = dx + s * (hw + 0.02), top = dy + (tall ? 0.42 : 0.05);
      roundPost(B, x, z, ly(wy) - 0.3, top, { r: 0.1, rope: tall ? 3 : 0 });
      if (!tall) ropeWrap(B, x, dy - 0.2, z, 0.1, 2);
    }
    // ---- two happy stone frogs either side of the dock's landing, on mossy stones
    for (const s of [-1, 1]) {
      const x = DOCK.x + s * (hw + 1.0), z = zRoot + 0.55 - (s > 0 ? 0.25 : 0), [lx, lz] = L(x, z);
      const yb = boulder(B, lx, F.gy(lx, lz), lz, 0.34, { sq: 0.5, moss: 0.5, seed: 120 + s, sink: 0.3 }).top;
      B.at([lx, yb - 0.04, lz], PI / 4 + s * 0.35, () => frog(B), 1.3);
      ctx.collide(x, z, 0.42);
    }
    // ---- lantern posts: one by the dock, one on the west bank, one on the north-east bank (the first two light up)
    const rimAt = (a, k) => [POND.x + Math.cos(a) * (POND.R + k), POND.z + Math.sin(a) * (POND.R + k)];
    const posts = [[DOCK.x + hw + 0.55, zRoot + 0.95, PI * 0.75, true], [...rimAt(-2.3, 1.2), PI * 0.25, true], [...rimAt(-0.5, 1.15), -PI * 0.15, false]];
    for (const [x, z, face, lit] of posts) {
      const [lx, lz] = L(x, z), p = lanternPost(B, lx, F.gy(lx, lz), lz, { h: 1.5, face });
      if (lit) B.light(p, { color: '#ffc070', intensity: 2.0, radius: 5.2, flicker: 0.4 });
      lamps.push([F.X + p[0], F.Z + p[2], p[1] - ly(wy)]);
      trailClear(x, z, 0.2, 'moonpond lantern'); ctx.collide(x, z, 0.16);
    }
    // ---- in the water: lily pads (two with a pink lotus), petals; cattails round the back
    const ply = ly(wy) + 0.006;
    for (const [ox, oz, r, lot] of [[1.0, -0.55, 0.42, true], [1.55, 0.45, 0.32, false], [0.2, -1.25, 0.36, false], [-0.6, 0.4, 0.3, true], [1.1, 1.35, 0.26, false]]) {
      const [lx, lz] = L(POND.x + ox, POND.z + oz); lilyPad(B, lx, ply, lz, r, rnd() * TAU, lot);
    }
    for (let i = 0; i < 12; i++) {
      const a = rnd() * TAU, d = POND.R * (0.25 + rnd() * 0.65), [lx, lz] = L(POND.x + Math.cos(a) * d, POND.z + Math.sin(a) * d);
      if (Math.abs(lx + F.X - DOCK.x) < hw + 0.1 && lz + F.Z > zEnd) continue;
      const g = G.disc(0.045, 6); g.rotateX(-PI / 2); g.scale(1, 1, 0.65); g.rotateY(rnd() * PI); g.translate(lx, ply + 0.002, lz); B.add(g, rnd() < 0.7 ? '#ffb4d0' : '#fff0f6');
    }
    for (const a of [-2.2, -1.55, -0.6, 2.45, 0.3]) {
      const x = POND.x + Math.cos(a) * (POND.R - 0.1), z = POND.z + Math.sin(a) * (POND.R - 0.1), [lx, lz] = L(x, z);
      cattails(B, lx, ply - 0.02, lz, rnd, { n: 7, h: 0.8 });
    }
    // ---- flat stepping stones round the east bank, from the trail's side to the dock
    for (let k = 0; k < 7; k++) {
      const a = -0.75 + k * 0.33, x = POND.x + Math.cos(a) * (POND.R + 1.35), z = POND.z + Math.sin(a) * (POND.R + 1.35), [lx, lz] = L(x, z), r = 0.3 + (k % 2) * 0.05;
      const g = puff(V(0, 0, 0), r, { detail: 1, noise: 0.12, squash: 0.28, seed: 40 + k }); g.scale(1.3, 1, 1); g.rotateY(a + 0.4 * k); g.translate(lx, F.gy(lx, lz) + 0.0, lz); B.add(g, mossStone('#c0b8c0', 0.2, 4));
    }
    // ---- the bank: ferns, flowers, a couple of bushes
    for (const [sr, su] of [[-3.0, 4.2], [-1.8, 5.8], [2.2, 6.0], [4.8, 2.6], [-3.6, -0.4], [2.6, -0.8], [-1.2, -0.9], [-3.4, -2.6], [4.2, -3.4]]) { const [x, z] = at(sr, su), [lx, lz] = L(x, z); fern(B, lx, F.gy(lx, lz), lz, rnd, 0.95); }
    for (const [sr, su] of [[-2.4, 0.6], [3.4, 0.0], [0.4, -1.4], [-4.4, 2.4], [5.2, 3.6], [1.2, 6.2], [-0.8, 6.4], [4.0, -1.6], [-2.8, -1.6], [-1.6, -3.0], [2.2, -2.8], [-4.6, -0.8], [5.4, -2.2], [0.6, -4.2]]) { const [x, z] = at(sr, su), [lx, lz] = L(x, z); flowers(B, lx, F.gy(lx, lz), lz, rnd, { n: 4, r: 0.45 }); }
    for (const [sr, su, r] of [[-4.6, 4.0, 0.5], [5.6, -0.2, 0.45]]) {
      const [x, z] = at(sr, su), [lx, lz] = L(x, z);
      if (trailClear(x, z, r, 'moonpond bush')) { B.at([lx, F.gy(lx, lz), lz], 0, () => bush(B, { r, n: 3, color: '#4c9446', flowers: ['#ff9dc1', '#ffffff'] })); ctx.collide(x, z, r * 0.8); }
    }
  }, { x: F.X, z: F.Z, y: F.Y, yaw: 0 });

  // ---- the water: its own disc (a little over the rim, fading out under the boulders)
  const water = new THREE.Mesh(new THREE.CircleGeometry(POND.R + 0.35, 48).rotateX(-PI / 2), pondMat(POND, lamps));
  water.position.set(POND.x, wy, POND.z); water.renderOrder = 1; water.receiveShadow = false; water.name = 'moonpond:water';
  ctx.add(water);
  // the grass doesn't grow through it: the tiles under the pond are worn bare (Terrain.wear; the water hides the earth)
  const T = ctx.world.terrain;
  if (T?.wear && T.syncTiles) {
    const W = Math.round(Math.sqrt(T.wear.length));
    for (let z = Math.floor(POND.z - POND.R); z <= Math.ceil(POND.z + POND.R); z++) for (let x = Math.floor(POND.x - POND.R); x <= Math.ceil(POND.x + POND.R); x++)
      if (Math.hypot(x + 0.5 - POND.x, z + 0.5 - POND.z) < POND.R - 0.45) T.wear[z * W + x] = 255;
    T.syncTiles();
  }
  // ---- the fireflies
  const flies = fireflies(POND, wy, ctx.rand);
  ctx.add(flies.points);
  // ---- walking: the dock is a deck; the water is solid (a field of colliders, clear of the dock)
  ctx.deck({ x0: DOCK.x - DOCK.w / 2 - 0.08, z0: zEnd - 0.02, x1: DOCK.x + DOCK.w / 2 + 0.08, z1: zRoot + 0.15, h: (x, z) => Math.max(deckY, H(x, z)) });
  const cr = 0.48;
  for (let row = -6; row <= 6; row++) for (let col = -6; col <= 6; col++) {
    const x = POND.x + (col + (row % 2) * 0.5) * 0.78, z = POND.z + row * 0.68;
    if (Math.hypot(x - POND.x, z - POND.z) > POND.R - 0.12) continue;
    const ex = Math.max(DOCK.x - DOCK.w / 2 - 0.08 - x, 0, x - DOCK.x - DOCK.w / 2 - 0.08), ez = Math.max(zEnd - 0.02 - z, 0, z - zRoot);
    if (Math.hypot(ex, ez) < cr + 0.02) continue;
    ctx.collide(x, z, cr);
  }
  // …and a fence of small circles hugging the dock's sides and end, so nothing slips off it into the water
  const x0 = DOCK.x - DOCK.w / 2 - 0.08, x1 = DOCK.x + DOCK.w / 2 + 0.08, z0 = zEnd - 0.02;
  for (let z = z0; z < POND.z + POND.R - 0.1; z += 0.32) for (const x of [x0 - 0.27, x1 + 0.27]) if (Math.hypot(x - POND.x, z - POND.z) < POND.R) ctx.collide(x, z, 0.26);
  for (let x = x0 - 0.27; x <= x1 + 0.28; x += 0.32) ctx.collide(x, z0 - 0.27, 0.26);
  // ---- the wish, at the end of the dock
  const wishAt = new THREE.Vector3(DOCK.x, deckY, zEnd + 0.45);
  const dusk = () => ctx.night() > 0.5;
  const it = ctx.interact({ x: wishAt.x, z: wishAt.z, y: deckY, r: 1.0, label: 'Make a wish', onInteract: () => wish() });
  Object.defineProperty(it, 'label', { get: () => (!dusk() ? 'Come back at night' : ctx.doneToday('wish') ? 'Wished tonight' : 'Make a wish') });
  const GIFTS = [{ coins: 25 }, { pantry: { honey: 1 } }, { pantry: { peach: 1 } }];
  const wish = () => {
    if (!dusk()) return;
    if (ctx.doneToday('wish')) { ctx.say('One wish a night. Let\'s see if it comes true!'); return; }
    ctx.pose('bow', { dur: 1.3, at: 0.55, face: { x: POND.x, z: POND.z }, onAct: () => {
      if (!ctx.daily('wish')) return;
      sparkleRise(ctx, POND, wy);
      ctx.sfx('constellation_twinkle', new THREE.Vector3(POND.x, wy, POND.z));
      const g = GIFTS[Math.floor(Math.random() * GIFTS.length)];
      setTimeout(() => ctx.give({ ...g, at: ctx.G.player?.pos?.clone().add(new THREE.Vector3(0, 1.2, 0)) }), 900);
      ctx.say(['The fireflies heard you. I wished for more walks with you.', 'Did you see that? The pond sparkled back. I think that means yes.', 'I wished too. It\'s a secret... but it has treats in it.'][Math.floor(Math.random() * 3)]);
    } });
  };
  return {
    update(dt, t, night, dist) {
      flies.set(night, ctx.G.engine);
      water.material.uniforms.uNightK.value = night;
      void dt; void t; void dist;
    },
    group: inst.group, water, flies: flies.points, wishAt,
  };
}

// a happy stone frog sitting up (local: its seat at 0, facing +z): a plump body, a broad head with two closed smiling
// eyes on bumps and a carved grin, little hands in front, the haunches either side; moss on its head and back
function frog(B) {
  const st = mossStone('#aaa4aa', 0.35, 5), dark = '#5e5860';
  const body = G.sph(0.24, 12, 9); body.scale(1.12, 0.86, 1.0); body.translate(0, 0.2, 0); B.add(body, st);
  const head = G.sph(0.21, 12, 9); head.scale(1.28, 0.78, 1.0); head.translate(0, 0.46, 0.05); B.add(head, st);
  for (const s of [-1, 1]) {
    const eye = G.sph(0.08, 9, 6); eye.translate(s * 0.13, 0.6, 0.06); B.add(eye, st);
    const lid = G.torus(0.042, 0.011, 4, 8, PI); lid.rotateX(-0.25); lid.translate(s * 0.13, 0.6, 0.135); B.add(lid, dark); // (a happy closed eye: an arch)
    const haunch = G.sph(0.14, 9, 6); haunch.scale(0.75, 0.6, 1.25); haunch.translate(s * 0.22, 0.09, -0.02); B.add(haunch, st);
    const hand = G.sph(0.07, 8, 5); hand.scale(1.1, 0.55, 1.3); hand.translate(s * 0.1, 0.04, 0.21); B.add(hand, st);
    const foot = G.sph(0.07, 8, 5); foot.scale(1.3, 0.45, 1.4); foot.translate(s * 0.27, 0.03, 0.16); B.add(foot, st);
    const blush = G.sph(0.035, 6, 4); blush.scale(1.3, 0.6, 0.5); blush.translate(s * 0.16, 0.45, 0.24); B.add(blush, '#c9a8ae');
  }
  const grin = G.torus(0.1, 0.012, 4, 12, PI); grin.rotateZ(PI); grin.rotateX(0.35); grin.translate(0, 0.475, 0.245); B.add(grin, dark);
}

// ---- the pond water: deep blue in the middle, turquoise at the margins, slow brushed shimmer, soft ripple rings
// round the dock posts and the lilies, the lanterns' warm reflections at night, a faded rim under the boulders
const LIT = /* glsl */`
uniform vec3 uSkyHor;
vec3 lit(vec3 c) {
  float L = dot(uSkyHor, vec3(0.3, 0.59, 0.11));
  vec3 t = mix(vec3(1.0), uSkyHor / max(L, 0.15), 0.35);
  return c * t * mix(1.0, 0.6, clamp((0.85 - L) * 1.8, 0.0, 1.0)) * mix(1.0, 0.5, uNight);
}`;
function pondMat(P, lamps) {
  const lampU = [0, 1, 2].map(i => new THREE.Vector4(...(lamps[i] ? [lamps[i][0], lamps[i][1], lamps[i][2], 1] : [0, 0, 0, 0])));
  const rip = [[DOCK.x - DOCK.w / 2, P.z + P.R + 0.45 - DOCK.len + 0.08, 0.16, 0], [DOCK.x + DOCK.w / 2, P.z + P.R + 0.45 - DOCK.len + 0.08, 0.14, 0.5], [P.x + 1.0, P.z - 0.55, 0.11, 0.25], [P.x - 0.6, P.z + 0.4, 0.13, 0.7]]
    .map(v => new THREE.Vector4(...v));
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: true,
    uniforms: { uTime: U.uTime, uBrush: U.uBrush, uNight: U.uNight, uSkyHor: U.uSkyHor, uNightK: { value: 0 }, uC: { value: new THREE.Vector2(P.x, P.z) }, uR: { value: P.R }, uLamp: { value: lampU }, uRip: { value: rip } },
    vertexShader: /* glsl */`varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform sampler2D uBrush; uniform float uNight; uniform float uNightK; uniform vec2 uC; uniform float uR; uniform vec4 uLamp[3]; uniform vec4 uRip[4];
      varying vec3 vW;
      ${LIT}
      void main() {
        vec2 q = vW.xz - uC; float d = length(q) / uR;
        vec3 deep = vec3(0.05, 0.2, 0.36), mid = vec3(0.1, 0.38, 0.56), shal = vec3(0.17, 0.56, 0.62);
        vec3 c = mix(deep, mid, smoothstep(0.1, 0.8, d));
        c = mix(c, shal, smoothstep(0.78, 1.02, d));
        float n = texture2D(uBrush, vW.xz * 0.21 + vec2(uTime * 0.008, uTime * 0.011)).r;
        float n2 = texture2D(uBrush, vW.xz * 0.43 - vec2(uTime * 0.017, uTime * 0.004)).g;
        c *= 0.93 + 0.14 * n;
        // a soft sky sheen across the far side, ripple rings, a little day sparkle
        c = mix(c, vec3(0.55, 0.78, 0.9), smoothstep(0.2, -0.9, (q.x + q.y) / uR) * 0.18);
        float ring = 0.0;
        for (int i = 0; i < 4; i++) {
          vec4 R = uRip[i]; float ph = fract(uTime * R.z + R.w), rr = length(vW.xz - R.xy);
          ring += smoothstep(0.045, 0.0, abs(rr - 0.12 - ph * 1.1)) * (1.0 - ph) * 0.5;
        }
        float sp = smoothstep(0.7, 0.84, n * 0.55 + n2 * 0.45) * (1.0 - uNight) * 0.4;
        c = mix(c, vec3(0.92, 0.98, 1.0), clamp(ring * 0.55 + sp, 0.0, 0.8));
        c = lit(c);
        // the lanterns' reflections: warm smears toward the camera (+x +z), only after dusk
        vec2 cam = normalize(vec2(1.0, 1.0)), side = vec2(cam.y, -cam.x);
        for (int i = 0; i < 3; i++) {
          vec4 L = uLamp[i]; if (L.w < 0.5) continue;
          vec2 dd = vW.xz - (L.xy + cam * L.z * 1.15);
          float a = dot(dd, cam), b = dot(dd, side);
          float wob = 0.75 + 0.25 * sin(uTime * 2.3 + a * 9.0 + n * 4.0);
          c += vec3(1.0, 0.6, 0.26) * exp(-(b * b / 0.014 + a * a / 0.5)) * smoothstep(0.3, 0.7, uNightK) * 0.5 * wob;
        }
        float alpha = smoothstep(1.13, 1.02, d);
        gl_FragColor = vec4(c, alpha);
      }`,
  });
}

// ---- fireflies: soft yellow-green points wandering slow loops over the pond and the bank, each blinking on its own;
// faded in only at dusk and night (and never bright enough to bloom the screen)
function fireflies(P, wy, rnd) {
  const n = FIREFLIES, pos = new Float32Array(n * 3), seed = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU, d = (i < n * 0.55 ? P.R * 0.9 : P.R + 2.6) * Math.sqrt(rnd()), x = P.x + Math.cos(a) * d, z = P.z + Math.sin(a) * d, y = wy + 0.35 + rnd() * 1.3;
    pos.set([x, y, z], i * 3); seed.set([x, y, z, rnd() * 100], i * 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aF', new THREE.BufferAttribute(seed, 4));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: U.uTime, uFire: { value: 0 }, uScale: { value: 800 } },
    vertexShader: /* glsl */`
      attribute vec4 aF; uniform float uTime; uniform float uFire; uniform float uScale; varying float vA;
      void main() {
        float t = uTime, ph = aF.w;
        vec3 p = aF.xyz + vec3(sin(t * 0.29 + ph) * 0.8 + sin(t * 0.13 + ph * 3.0) * 0.45, sin(t * 0.43 + ph * 2.1) * 0.25, cos(t * 0.25 + ph * 1.3) * 0.8 + cos(t * 0.11 + ph) * 0.45);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vA = smoothstep(-0.3, 0.8, sin(t * 1.1 + ph * 7.0) * 0.6 + sin(t * 2.7 + ph * 3.0) * 0.4) * uFire;
        gl_PointSize = uScale * 0.3 / max(-mv.z, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying float vA;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float core = smoothstep(0.2, 0.04, r), halo = pow(smoothstep(1.0, 0.0, r), 2.2);
        vec3 c = vec3(0.95, 1.0, 0.55) * core * 0.95 + vec3(0.55, 0.85, 0.22) * halo * 0.42;
        if (max(c.r, c.g) * vA < 0.004) discard;
        gl_FragColor = vec4(c * vA, 1.0);
      }`,
  });
  const points = new THREE.Points(g, mat); points.frustumCulled = false; points.renderOrder = 6; points.name = 'moonpond:fireflies'; points.visible = false;
  const tan = new THREE.Vector2();
  return {
    points,
    set(night, engine) {
      const k = smoothstep(0.32, 0.62, night); mat.uniforms.uFire.value = k; points.visible = k > 0.01;
      const R = engine?.renderer, cam = engine?.camera;
      if (R && cam) { R.getDrawingBufferSize(tan); mat.uniforms.uScale.value = tan.y / (2 * Math.tan(cam.fov * PI / 360)); }
    },
  };
}
// the wish: sparkles rising from the pond in a few soft waves
function sparkleRise(ctx, P, wy) {
  const V3 = THREE.Vector3, vfx = ctx.G.vfx, rr = mulberry32((Date.now() & 0xffff) + 1);
  if (!vfx?.sparkle) return;
  const cols = ['#fff2a0', '#ffd0e6', '#c8ecff', '#f0ffb0'];
  for (let k = 0; k < 4; k++) setTimeout(() => {
    for (let j = 0; j < 3; j++) { const a = rr() * TAU, d = rr() * P.R * 0.7; vfx.sparkle(new V3(P.x + Math.cos(a) * d, wy + 0.1, P.z + Math.sin(a) * d), { n: 7, color: cols[(k + j) % 4], r: 0.45, rise: 1.6, size: 0.24, life: 1.4 }); }
  }, k * 260);
}
