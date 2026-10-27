// The Tide Pools (ROADMAP HP-1; the concept: tools/blender/work/codex/hollow-pois/concepts/poi-03-tidepools.png): a
// chain of four shallow clear pools stepping down the sandy shore, each held in a wall of rounded mossy rocks dotted
// with barnacles and little shells: see-through pale turquoise water with soft drifting ripple lines over its own sandy
// bottom, coral starfish, pink / lilac / coral anemones, seaweed, cream spiral and scallop shells, smooth pebbles;
// three little red crabs that scuttle sideways now and then; a golden bucket and a round net on a broad dry rock;
// stepping stones; a rope fence along the trail; beach grass, succulents, pink and white flowers; rocks in the sea
// with foam collars. Interactions: "Poke the pool" (one per pool, once a day each: a pickup pose, a small find, a
// sparkle, and the crabs scurry).
import * as THREE from 'three';
import { G, V, PI, col } from '../../buildings/kit.js';
import { leafGeo, blossomGeo, nz } from '../../buildings/props.js';
import { tube, puff } from '../../../gfx/geom.js';
import { clamp, TAU } from '../../../core/util.js';
import { site, bare, lineDist, boulder, groundStone, stepStone, pebbles, ropeFence, flowers, tuft, shrub, foam, blob, fanGeo, poolWaterMat, pivotKit, BRASS, tris } from './_west.js';

const SAND = '#ecd09a', CORAL = '#f07a45', ANEM = ['#ff6fa8', '#b866e0', '#ff7a55', '#e88ae8'];
// the pools: local centre, radius, what poking one finds
const POOLS = [
  { x: -0.55, z: -0.35, r: 1.3, gift: { pantry: { seaweed: 1 } }, find: 'A ribbon of nori seaweed, fresh from the pool.' },
  { x: -2.75, z: 1.55, r: 1.4, gift: { coins: 6 }, find: 'Something glints under a shell: a few lost coins!' },
  { x: -4.75, z: -1.25, r: 1.15, gift: { mats: { stone: 1 } }, find: 'A perfectly smooth stone, polished by the tide.' },
  { x: -1.25, z: 3.55, r: 0.95, gift: { pantry: { seaweed: 1 }, coins: 3 }, find: 'Seaweed, and a coin tucked under it!' },
];
const CRABS = [
  { x: -2.3, z: 3.35, run: [1.1, -0.35] }, { x: -5.8, z: 0.55, run: [0.5, 0.9] }, { x: 0.55, z: 1.35, run: [-0.7, 0.55] },
];

export function build(ctx) {
  const S = site(ctx, -0.8), { H } = S;
  // each pool's water sits a touch above the highest ground under it; its rim of rocks holds it on the low side
  for (const p of POOLS) {
    p.ol = blob(p.r, 30, 0.17, Math.round(p.x * 97 + p.z * 31) + 400);
    let top = -1e9; for (const [x, z] of p.ol) for (const k of [0, 0.4, 0.75, 1.05]) top = Math.max(top, H(p.x + x * k, p.z + z * k));
    p.y = top + 0.05;
  }
  const inPool = (x, z, pad = 0) => POOLS.find(p => Math.hypot(x - p.x, z - p.z) < p.r + pad);
  const stones = [[2.45, -2.0, 0.32], [1.75, -0.95, 0.34], [1.35, 0.2, 0.31], [0.6, 1.45, 0.33], [-0.55, 1.95, 0.3]];
  bare(S, (x, z) => !!inPool(x, z, 0.9) || lineDist(x, z, stones.map(s => [s[0], s[1]])) < 0.5);

  const rims = [];
  const inst = S.kit(303, B => {
    POOLS.forEach((p, i) => rims.push(...pool(B, S, p, i)));
    // the broad dry rock with the bucket and the net
    const br = { x: 0.95, z: -2.35 };
    const top = boulder(B, S, br.x, H(br.x, br.z) + 0.02, br.z, 0.9, { sq: 0.42, moss: 0.25, stretch: 1.3, yaw: 0.5 }).top;
    bucket(B, br.x + 0.15, top - 0.05, br.z - 0.1);
    net(B, br.x - 0.35, top - 0.02, br.z + 0.25);
    shell(B, br.x + 0.55, top - 0.06, br.z + 0.15, 0, 1.2);
    // stepping stones in from the trail
    stones.forEach(([x, z, r]) => stepStone(B, S, x, z, r));
    // the shore's own rocks, and rocks out in the sea with foam
    for (const [x, z, r] of [[1.1, 3.0, 0.55], [-6.2, -3.6, 0.7], [-3.4, -3.4, 0.55], [0.5, -4.6, 0.45], [2.6, 3.9, 0.5], [-4.2, 3.7, 0.5]]) groundStone(B, S, x, z, r, { moss: 0.4, sink: 0.3 });
    for (const [x, z, r] of [[-8.6, 0.8, 0.85], [-7.2, 4.6, 0.75], [-3.9, 6.6, 0.8], [-9.3, -3.5, 0.65], [0.4, 7.0, 0.6]]) { const y = Math.max(H(x, z), -0.6); boulder(B, S, x, 0.8 - r * 0.25, z, r, { moss: 0.45, sq: 1.0, stretch: 1, wet: 0.84 }); foam(B, S, x, z, r * 0.97, 0.8); void y; }
    // the rope fence along the trail (a gap where the stepping stones come in)
    ropeFence(B, S, [[1.6, -6.7], [1.72, -4.9], [1.95, -3.25]]);
    ropeFence(B, S, [[2.75, -0.55], [3.3, 1.2], [3.25, 2.9]]);
    // beach grass, succulents, flowers, shrubs on the bank
    for (const [x, z] of [[0.9, -5.6], [-1.0, -5.0], [2.3, -4.1], [-2.6, -3.0], [2.4, 1.9], [-3.4, 3.4], [0.5, 4.6], [-6.4, -2.4], [-5.2, 2.6], [1.9, 3.3], [-1.9, -2.4]]) tuft(B, S, x, z, { h: 0.6, colors: ['#8fbf5a', '#a9cf6a', '#6fa24a'] });
    for (const [x, z, s] of [[0.2, -3.4, 1], [2.25, -2.95, 0.8], [-2.4, -2.1, 0.9], [2.1, 0.45, 0.85], [1.2, 2.25, 1], [-3.7, 2.9, 0.8], [-0.4, 2.95, 0.75], [2.3, -1.25, 0.9], [1.0, -0.9, 0.8], [2.6, 1.0, 0.75], [-1.3, -2.1, 0.85], [0.3, 2.6, 0.8]]) succulent(B, S, x, z, s);
    for (const [x, z] of [[2.2, -0.6], [2.75, 0.35], [0.6, -3.1], [-0.6, -2.4], [1.6, 1.7]]) tuft(B, S, x, z, { h: 0.55, colors: ['#8fbf5a', '#a9cf6a', '#6fa24a'] });
    flowers(B, S, 2.4, 0.9, { n: 5, r: 0.4, colors: ['#ff8fb4', '#ffffff', '#ffb2cc'] });
    flowers(B, S, 0.9, -3.4, { n: 4, r: 0.4, colors: ['#ffffff', '#ff8fb4'] });
    flowers(B, S, 1.5, -1.9, { n: 6, r: 0.45, colors: ['#ff8fb4', '#ffb2cc', '#ffffff'] });
    flowers(B, S, 2.3, 2.6, { n: 6, r: 0.5, colors: ['#ff8fb4', '#ffffff'] });
    flowers(B, S, 0.0, -5.2, { n: 5, r: 0.5, colors: ['#ff8fb4', '#ffb2cc', '#ffffff'] });
    flowers(B, S, -1.6, -3.4, { n: 4, r: 0.4, colors: ['#ffffff', '#ffb2cc'] });
    shrub(B, S, 0.9, -6.4, { r: 0.5, flowers: ['#ff8fb4', '#ffffff'], nf: 10 });
    shrub(B, S, -2.3, -4.8, { r: 0.45, color: '#62ad45' });
    shrub(B, S, 2.45, 3.4, { r: 0.42, flowers: ['#ffb2cc'], nf: 8 });
    pebbles(B, S, -2.0, 3.0, 12, 2.0);
    pebbles(B, S, -5.6, 0.8, 9, 1.5);
    B.height = 1.2;
  });

  // ---- colliders: the broad rock and the rim rocks (the pools themselves can be waded round, not into)
  S.collide(0.95, -2.35, 0.95);
  for (const p of POOLS) S.collide(p.x, p.z, p.r * 0.85);
  for (const [x, z, r] of [[1.1, 3.0, 0.55], [-6.2, -3.6, 0.7], [-3.4, -3.4, 0.55], [0.5, -4.6, 0.45], [2.6, 3.9, 0.5], [-4.2, 3.7, 0.5]]) S.collide(x, z, r * 0.8);

  // ---- the pools' water (see-through, over their sandy bowls)
  const mat = poolWaterMat(), water = [];
  for (const p of POOLS) {
    const g = fanGeo(p.ol.map(([x, z]) => [x * 0.98, z * 0.98]), 0, 0, 0, 3);
    const c = new Float32Array(g.attributes.position.count * 3), a = col('#1fbdbd'), b = col('#6fdcd2');
    for (let i = 0; i < g.attributes.position.count; i++) { const t = g.attributes.uv.getX(i), k = a.clone().lerp(b, t * 0.6); c.set([k.r, k.g, k.b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    const m = new THREE.Mesh(g, mat); m.renderOrder = 1; m.receiveShadow = true; S.add(m, p.x, p.y, p.z); water.push(m);
  }

  // ---- the crabs: scuttle sideways along a little run, pause, scuttle back (faster for a while after a poke)
  const crabs = CRABS.map((c, i) => {
    const k = pivotKit(S, 310 + i, B => crab(B), { x: c.x, y: H(c.x, c.z), z: c.z, yaw: Math.atan2(-c.run[1], c.run[0]), lift: 1 });
    return { ...c, k, ph: i * 2.1, base: k.group.position.clone(), dir: V(c.run[0], 0, c.run[1]) };
  });
  let scurry = 0;

  // ---- poke the pools
  POOLS.forEach((p, i) => {
    const a = Math.atan2(-0.5 - p.z, 2 - p.x), ix = p.x + Math.cos(a) * (p.r + 0.45), iz = p.z + Math.sin(a) * (p.r + 0.45); // (the rim nearest the trail)
    S.interact({
      x: ix, z: iz, y: Math.max(H(ix, iz), p.y - 0.05), r: 1.25, label: 'Poke the pool',
      onInteract() {
        const pc = S.W(p.x, p.y, p.z);
        ctx.pose('pickup', {
          dur: 1.1, at: 0.45, face: { x: pc.x, z: pc.z },
          onAct() {
            scurry = 4;
            ctx.G.vfx?.sparkle?.(pc.clone().add(V(0, 0.15, 0)), { n: 10, color: '#cff8ff', r: p.r * 0.5, rise: 0.5, size: 0.18 });
            ctx.sfx('splash', pc);
            if (ctx.daily(`pool${i}`)) { ctx.give({ ...p.gift, at: pc.clone().add(V(0, 0.6, 0)) }); ctx.toast(p.find); ctx.say('Look, a crab! He waved at us. I think.', { once: 'crab' }); }
            else ctx.toast('The pool settles. The little crabs peek back out.');
          },
        });
      },
    });
  });

  return {
    tris: tris(inst.group) + water.reduce((a, m) => a + tris(m), 0) + crabs.reduce((a, c) => a + tris(c.k.group), 0),
    update(dt, t) {
      scurry = Math.max(0, scurry - dt);
      const fast = scurry > 0 ? 2.6 : 1;
      for (const c of crabs) {
        c.ph += dt * fast;
        const u = c.ph % 6.0; // walk out (1.2 s), wait, walk back, wait
        const s = u < 1.2 ? u / 1.2 : u < 3 ? 1 : u < 4.2 ? 1 - (u - 3) / 1.2 : 0;
        const e = s * s * (3 - 2 * s), walking = (u < 1.2 || (u > 3 && u < 4.2));
        c.k.group.position.set(c.base.x + c.dir.x * e, c.base.y + (walking ? Math.abs(Math.sin(c.ph * 22)) * 0.012 : 0), c.base.z + c.dir.z * e);
        c.k.group.rotation.z = walking ? Math.sin(c.ph * 22) * 0.06 : 0;
      }
    },
  };
}

// ------------------------------------------------------------------ a pool: its sandy bowl (with a stone skirt under
// the rim), the wall of rocks round it, starfish, anemones, seaweed, shells and pebbles on its floor → rim rocks
function pool(B, S, p, i) {
  const R = p.r, Y = p.y, D = 0.24, rnd = S.rnd;
  // the bowl: a dish from the floor up to just over the water at the rim, sand going teal toward the middle
  const prof = []; for (let k = 6; k >= 0; k--) { const t = k / 6; prof.push([0.001 + (R + 0.12) * t, Y - D + D * Math.pow(t, 2.2) + 0.03 * t]); } // (rim to middle: the dish faces up)
  const bowl = G.lathe(prof, 26); { const pp = bowl.attributes.position; for (let k = 0; k < pp.count; k++) { const a = Math.atan2(pp.getZ(k), pp.getX(k)), f = 1 + 0.1 * (Math.sin(a * 2) * 0.5 + Math.sin(a * 3 + 1) * 0.5); pp.setX(k, pp.getX(k) * f); pp.setZ(k, pp.getZ(k) * f); } }
  bowl.translate(p.x, 0, p.z);
  const sd = col(SAND), deep = col('#3fb3a8');
  B.add(bowl, (pp, n, o) => { const t = clamp(Math.hypot(pp.x - p.x, pp.z - p.z) / R); o.copy(deep).lerp(sd, clamp(t * t * 1.3)).multiplyScalar(0.94 + 0.08 * nz(pp.x * 6, pp.z * 6)); });
  const skirt = G.cyl(R + 0.1, R + 0.05, 0.9, 20, true); skirt.translate(p.x, Y - 0.45, p.z); B.add(skirt, '#8d8697'); // (behind the rocks: never a gap to the sky)
  // the rim: rounded rocks of every size round the outline (more moss on the big ones, some bare), sitting just proud
  // of the water uphill and standing taller where the ground falls away; a stone or two poking up in the pool
  const rims = [], N = p.ol.length;
  let u = rnd() * N;
  while (u < N * 2 && rims.length < 34) {
    const k0 = Math.floor(u) % N, k1 = (k0 + 1) % N, f = u - Math.floor(u);
    const ox = p.ol[k0][0] + (p.ol[k1][0] - p.ol[k0][0]) * f, oz = p.ol[k0][1] + (p.ol[k1][1] - p.ol[k0][1]) * f, a = Math.atan2(oz, ox);
    const r = 0.26 + rnd() * rnd() * 0.55 + (rnd() < 0.2 ? 0.2 : 0), d = Math.hypot(ox, oz) + r * 0.45;
    const x0 = p.x + Math.cos(a) * d, z0 = p.z + Math.sin(a) * d, g = S.H(x0, z0), need = Math.max(0.1 + rnd() * 0.12, Y + 0.12 + rnd() * 0.1 - g);
    const sq = clamp(need * 0.95 / r, 0.42, 1.15), m = rnd() < 0.4 ? 0 : 0.1 + r * 0.35;
    const st = boulder(B, S, x0, g + need * 0.28, z0, r, { sq, moss: m, stretch: 1.1 + rnd() * 0.35, yaw: -a + PI / 2 + (rnd() - 0.5), wet: Y + 0.03, detail: r > 0.58 ? 2 : 1, stone: ['#8e8b90', '#cbc7ca'] });
    rims.push(st);
    if (rnd() < 0.65) barnacles(B, x0, st.top, z0, r, a, rnd);
    u += (r * 1.05) / ((TAU * (p.r + 0.2)) / N);
    if (u - (rims.u0 ??= u - (r * 1.05) / ((TAU * (p.r + 0.2)) / N)) > N) break;
  }
  for (let k = 0; k < (R > 1.2 ? 2 : 1); k++) {
    const aa = rnd() * TAU, dd = R * (0.35 + rnd() * 0.35), x = p.x + Math.cos(aa) * dd, z = p.z + Math.sin(aa) * dd, r = 0.16 + rnd() * 0.14;
    boulder(B, S, x, Y - 0.02, z, r, { sq: 0.7, moss: rnd() < 0.5 ? 0.5 : 0, stretch: 1.2, wet: Y + 0.02, detail: 1 });
  }
  // the floor's life: starfish, anemones, seaweed, shells, pebbles (sat on the bowl's floor)
  const floorY = (x, z) => { const t = clamp(Math.hypot(x - p.x, z - p.z) / (R + 0.12)); return Y - D + D * Math.pow(t, 2.2) + 0.03 * t; };
  const spot = (k) => { const aa = rnd() * TAU, d = R * (0.15 + rnd() * k); const x = p.x + Math.cos(aa) * d, z = p.z + Math.sin(aa) * d; return [x, Math.min(Y - 0.06, Math.max(floorY(x, z), S.H(x, z) + 0.005)), z]; };
  for (let k = 0; k < (R > 1.2 ? 2 : 1); k++) starfish(B, ...spot(0.55), rnd() * TAU, 0.2 + rnd() * 0.06);
  for (let k = 0; k < (R > 1.2 ? 4 : 3); k++) anemone(B, ...spot(0.62), ANEM[(i + k) % 4], 0.2 + rnd() * 0.08, rnd);
  for (let k = 0; k < 2; k++) seaweed(B, ...spot(0.7), rnd);
  for (let k = 0; k < 3; k++) shell(B, ...spot(0.65), rnd() * TAU, 0.8 + rnd() * 0.5, k % 2);
  for (let k = 0; k < 7; k++) { const [x, y, z] = spot(0.75), s = 0.04 + rnd() * 0.05, g = G.ico(s, 0); g.scale(1.3, 0.5, 1); g.translate(x, y + s * 0.15, z); B.add(g, ['#a8a0b8', '#c9c2d0', '#8f9aa8', '#d8cfc0'][k % 4]); }
  return rims;
}
// a coral starfish lying on the floor: five plump arms, a raised middle, pale dots
function starfish(B, x, y, z, rot, R) {
  const g = blossomGeo(R, 5, 0.32, true, 2); g.rotateY(rot);
  const p = g.attributes.position; for (let k = 0; k < p.count; k++) { const d = Math.hypot(p.getX(k), p.getZ(k)); p.setY(k, 0.03 * (1 - d / R)); }
  g.computeVertexNormals(); g.translate(x, y + 0.012, z);
  B.add(g, (pp, n, o) => o.set(CORAL).lerp(col('#ffc090'), clamp(1 - Math.hypot(pp.x - x, pp.z - z) / R) * 0.4));
  for (let k = 0; k < 5; k++) { const a = rot + k / 5 * TAU, d = G.ico(0.014, 0); d.translate(x + Math.cos(a) * R * 0.45, y + 0.035, z - Math.sin(a) * R * 0.45); B.add(d, '#ffe0c0'); }
}
// a sea anemone: a squat stalk and a ring of soft tentacles round a darker mouth (sways like a plant)
function anemone(B, x, y, z, c, R, rnd) {
  const st = G.cyl(R * 0.45, R * 0.55, 0.06, 8); st.translate(x, y + 0.03, z); B.add(st, col(c).multiplyScalar(0.75), 'leaf');
  const N = 14;
  for (let k = 0; k < N; k++) {
    const a = k / N * TAU + rnd() * 0.2, t = leafGeo(R * (0.9 + rnd() * 0.3), R * 0.22, 0.2); t.rotateZ(0.7 + rnd() * 0.3); t.rotateY(-a); t.translate(x + Math.cos(a) * R * 0.3, y + 0.06, z + Math.sin(a) * R * 0.3);
    B.add(t, (pp, n, o) => o.set(c).lerp(col('#ffffff'), clamp(Math.hypot(pp.x - x, pp.z - z) / R - 0.5) * 0.4), 'leaf');
  }
  const m = G.ico(R * 0.25, 0); m.scale(1, 0.4, 1); m.translate(x, y + 0.07, z); B.add(m, col(c).multiplyScalar(0.55), 'leaf');
}
function seaweed(B, x, y, z, rnd) {
  for (let k = 0; k < 5; k++) { const a = rnd() * TAU, L = 0.18 + rnd() * 0.14, b = leafGeo(L, 0.035, 0.3); b.rotateZ(PI / 2 - 0.4 - rnd() * 0.4); b.rotateY(a); b.translate(x, y, z); B.add(b, k % 2 ? '#5d9a4a' : '#7a9a3e', 'leaf'); }
}
// a cream shell: a spiral cone (kind 0) or a ridged scallop (kind 1)
function shell(B, x, y, z, rot, s = 1, kind = 0) {
  if (kind) {
    const g = blossomGeo(0.07 * s, 9, 0.82); const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const d = Math.hypot(p.getX(k), p.getZ(k)); p.setY(k, 0.025 * s * (1 - d / (0.07 * s))); }
    g.computeVertexNormals(); g.rotateY(rot); g.translate(x, y + 0.01, z);
    B.add(g, (pp, n, o) => o.set('#fff0d8').multiplyScalar(0.88 + 0.12 * Math.abs(Math.cos(Math.atan2(pp.z - z, pp.x - x) * 9))));
    return;
  }
  const pts = []; for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push([0.001 + 0.05 * s * Math.sin(t * PI * 0.92) * (1 - t * 0.55), t * 0.12 * s]); }
  const g = G.lathe(pts, 9); g.rotateZ(PI / 2 - 0.3); g.rotateY(rot); g.translate(x, y + 0.035 * s, z);
  B.add(g, (pp, n, o) => o.set('#fbecd2').lerp(col('#d9a878'), Math.max(0, Math.sin((pp.x * Math.cos(rot) + pp.z * Math.sin(rot)) * 160)) * 0.35));
}
// little white barnacles and shells clustered on a rim rock's pool side, just above the water
function barnacles(B, x, top, z, r, a, rnd) {
  for (let k = 0; k < 5; k++) {
    const aa = a + (rnd() - 0.5) * 2.4, d = r * (0.62 + rnd() * 0.2), y = top - r * (0.2 + rnd() * 0.25);
    const g = G.cyl(0.02, 0.05, 0.045, 5, true); g.translate(x + Math.cos(aa) * d, y, z + Math.sin(aa) * d); B.add(g, '#efe6d8');
  }
}
// a fat succulent rosette, blue-green with pink tips
function succulent(B, S, x, z, s) {
  const y = S.H(x, z) - 0.01;
  for (let ring = 0; ring < 3; ring++) for (let k = 0; k < 7 - ring * 2; k++) {
    const a = k / (7 - ring * 2) * TAU + ring * 0.5, L = (0.2 - ring * 0.05) * s, g = G.sph(0.05 * s, 5, 3); g.scale(L / (0.05 * s), 0.45, 0.8);
    g.translate(L * 0.55, 0, 0); g.rotateZ(0.35 + ring * 0.35); g.rotateY(-a); g.translate(x, y + 0.03 + ring * 0.03 * s, z);
    B.add(g, (pp, n, o) => o.set('#8fbf8a').lerp(col('#ff9ab8'), clamp(Math.hypot(pp.x - x, pp.z - z) / L - 0.75) * 1.6));
  }
}
// the golden collecting bucket: coopered staves, two hoops, a curved handle
function bucket(B, x, y, z) {
  const g = G.lathe([[0.001, 0], [0.15, 0], [0.165, 0.02], [0.19, 0.36], [0.2, 0.38], [0.18, 0.38], [0.165, 0.06], [0.001, 0.06]], 14);
  g.translate(x, y, z); B.add(g, (p, n, o) => o.set('#e4a84a').multiplyScalar(0.86 + 0.14 * Math.abs(Math.cos(Math.atan2(p.z - z, p.x - x) * 7))));
  for (const h of [0.08, 0.3]) { const r = G.torus(0.17 + h * 0.07, 0.014, 4, 18); r.rotateX(PI / 2); r.translate(x, y + h, z); B.add(r, '#8a5a2e'); }
  const hd = G.torus(0.19, 0.013, 4, 14, PI); hd.rotateY(0.4); hd.translate(x, y + 0.38, z); B.add(hd, '#c9b48a');
}
// the round net: a short wooden handle, a cream hoop and a mesh bag lying on the rock
function net(B, x, y, z) {
  const a = -0.6, ux = Math.cos(a), uz = Math.sin(a);
  B.add(tube([{ p: V(x - ux * 0.45, y + 0.03, z - uz * 0.45), r: 0.02 }, { p: V(x - ux * 0.12, y + 0.04, z - uz * 0.12), r: 0.022 }], 6, false), '#c98a45');
  const hoop = G.torus(0.15, 0.014, 4, 18); hoop.rotateX(PI / 2); hoop.translate(x + ux * 0.05, y + 0.045, z + uz * 0.05); B.add(hoop, '#f2e6c8');
  const bag = G.sph(0.14, 10, 5); bag.scale(1, 0.25, 1); bag.translate(x + ux * 0.05, y + 0.04, z + uz * 0.05);
  B.add(bag, (p, n, o) => o.set('#e8dcc0').multiplyScalar((Math.floor((p.x + p.z) * 60) + Math.floor((p.x - p.z) * 60)) % 2 ? 0.75 : 1));
}
// a little red crab (its frame: walking along x, facing +z): a round shell, eyes on stalks, two claws, six legs
function crab(B) {
  const red = '#e0533c', dark = '#b83a2c';
  const body = G.sph(0.1, 12, 7); body.scale(1.3, 0.55, 1); body.translate(0, 0.07, 0); B.add(body, (p, n, o) => o.set(red).lerp(col('#ff8a6a'), clamp(n.y) * 0.35));
  for (const s of [-1, 1]) {
    const st = G.cyl(0.008, 0.01, 0.06, 4); st.translate(s * 0.04, 0.13, 0.05); B.add(st, dark);
    const e = G.sph(0.022, 8, 5); e.translate(s * 0.04, 0.165, 0.05); B.add(e, '#ffffff');
    const pu = G.sph(0.012, 6, 4); pu.translate(s * 0.042, 0.168, 0.068); B.add(pu, '#1a1a22');
    B.add(tube([{ p: V(s * 0.09, 0.06, 0.05), r: 0.016 }, { p: V(s * 0.13, 0.07, 0.11), r: 0.014 }], 5, false), red);
    const cl = G.sph(0.04, 8, 5); cl.scale(1, 0.7, 1.2); cl.translate(s * 0.14, 0.075, 0.15); B.add(cl, (p, n, o) => o.set(red).lerp(col('#ff9a7a'), clamp(n.y) * 0.4));
    const pin = G.cone(0.014, 0.05, 5); pin.rotateX(PI / 2); pin.translate(s * 0.125, 0.075, 0.2); B.add(pin, dark);
    for (let k = 0; k < 3; k++) { const z = -0.04 + k * 0.04; B.add(tube([{ p: V(s * 0.1, 0.05, z), r: 0.009 }, { p: V(s * 0.17, 0.055, z - 0.01), r: 0.008 }, { p: V(s * 0.2, 0.0, z - 0.02), r: 0.007 }], 4, false), dark); }
  }
}
