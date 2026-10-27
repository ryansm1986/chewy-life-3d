// Windmill Orchard (ROADMAP HP-1; the concept: tools/blender/work/codex/hollow-pois/concepts/poi-05-windmill.png): a
// chunky cream stone windmill with a red shingled cap and four red lattice sails turning slowly (a kit spin), an arched
// door on two steps with barrel planters, peach and persimmon trees in rows (round crowns of big leaves hung with fruit),
// a ladder or two, baskets and tubs of fruit, a wooden fruit stall with open crates, a rounded fence and mossy boulders.
// "Pick peaches" / "Pick persimmons" on each tree, once a day: a pickup pose, two fruit into the pantry, and that tree's
// fruit thins out until tomorrow. Built by world/outskirts/index.js with ctx (the toolkit documented there).
import * as THREE from 'three';
import { G, V, PI } from '../../buildings/kit.js';
import { leafGeo, barrel, bush, crate, bamboo, nz } from '../../buildings/props.js';
import { branch, tube } from '../../../gfx/geom.js';
import { TAU, clamp } from '../../../core/util.js';
import { POI } from '../../outskirtsPlan.js';
import { frame, boulder, fern, flowers, fence, basket, WOOD, WOOD_D, WOOD_DD, trailClear } from './_north.js';

// the layout in screen metres from the game camera's view of the place (sr: right, su: up the screen, from the
// shot's focus 1.5 m south-east of the centre), as the concept frames it: the windmill on the left, the peach trees in
// the middle, the persimmons in a column on the right, the stall at the front right; the Ramble passes top right
const S2 = Math.SQRT1_2, K = 0.86, at = (sr, su, poi = POI.windmill) => [poi.x + 1.5 + (sr - su) * S2 * K, poi.z + 1.5 + (-sr - su) * S2 * K];
const MILL = { p: at(-4.9, 2.4), yaw: 1.2 };
const TREES = [
  { kind: 'peach', p: at(-0.6, 4.5) }, { kind: 'peach', p: at(-1.3, 0.9) },
  { kind: 'persimmon', p: at(3.6, 5.6) }, { kind: 'persimmon', p: at(3.0, 2.3) }, { kind: 'persimmon', p: at(2.4, -1.0) },
].map(t => ({ kind: t.kind, x: t.p[0], z: t.p[1] }));
const STALL = { p: at(4.1, -3.7), yaw: PI / 4 };
const FRUIT = {
  peach: { base: '#f7ab94', blush: '#ec6f74', hi: '#ffe0c4', r: 0.115, n: 13, label: 'Pick peaches', item: 'peach' },
  persimmon: { base: '#f59a2a', blush: '#e2701c', hi: '#ffc864', r: 0.11, n: 13, label: 'Pick persimmons', item: 'persimmon' },
};
const LEAVES = ['#7cb03a', '#6ea534', '#3f7a2a', '#b4da60'], SUN = new THREE.Vector3(0.45, 0, 0.6).normalize();
const CAM = V(1, 0, 1).normalize(), UP = V(0, 1, 0), _q = new THREE.Quaternion(); // (the game camera looks from +x / +z)

export function build(ctx) {
  const F = frame(ctx), rnd = ctx.rand, L = (x, z) => [x - F.X, z - F.Z];
  const trees = [];
  const inst = ctx.kit(5505, B => {
    // ---- the windmill
    const [mx, mz] = L(...MILL.p);
    B.at([mx, F.gy(mx, mz) - 0.05, mz], MILL.yaw, () => windmill(B));
    // barrel planters either side of the door, the boulders and ferns round the tower's back
    for (const s of [-1, 1]) {
      const ox = Math.cos(MILL.yaw) * s * 1.05 + Math.sin(MILL.yaw) * 1.75, oz = -Math.sin(MILL.yaw) * s * 1.05 + Math.cos(MILL.yaw) * 1.75;
      const x = mx + ox, z = mz + oz;
      B.at([x, F.gy(x, z), z], 0, () => {
        barrel(B, { r: 0.21, h: 0.42, wood: '#b9824e', lid: false });
        const soil = G.cyl(0.19, 0.19, 0.03, 10); soil.translate(0, 0.39, 0); B.add(soil, '#7a5038');
        fern(B, 0, 0.36, 0, rnd, 0.42);
        flowers(B, 0, 0.4, 0, rnd, { n: 4, r: 0.13, colors: s > 0 ? ['#ffffff', '#ffd24a', '#ffffff'] : ['#ff9dc1', '#ffffff', '#ff9dc1'] });
      });
      ctx.collide(F.X + x, F.Z + z, 0.28);
    }
    // ---- the fruit trees
    TREES.forEach((t, i) => {
      const [x, z] = L(t.x, t.z), y = F.gy(x, z);
      const tr = { ...t, i, key: `tree${i}`, lx: x, lz: z };
      B.at([x, y, z], 0, () => fruitTree(B, t.kind, rnd, tr));
      trees.push(tr);
    });
    // ladders leaning on the first peach tree and the last persimmon (their feet out on the camera side)
    ladder(B, F, L(TREES[0].x, TREES[0].z), 0.9, 1.4);
    ladder(B, F, L(TREES[4].x, TREES[4].z), -0.2, 1.25);
    // baskets of fruit and timber tubs under the trees
    const drop = (wx, wz, kind, tub = false) => {
      const [x, z] = L(...at(wx, wz)), y = F.gy(x, z), f = FRUIT[kind];
      if (tub) tubOf(B, x, y, z, 0.27, f);
      else basket(B, x, y, z, 0.24, { h: 0.22, n: 5, fill: (B2, px, py, pz, k) => fruitBall(B2, px, py, pz, f.r * 0.85, f, k) });
      ctx.collide(F.X + x, F.Z + z, 0.28);
    };
    drop(0.9, 3.1, 'peach'); drop(-0.5, 0.1, 'peach', true); drop(4.2, 1.1, 'persimmon', true); drop(0.8, -1.7, 'persimmon');
    // ---- the fruit stall: a sturdy table with two open crates (peaches, persimmons) and an empty hand basket
    const [sx, sz] = L(...STALL.p);
    B.at([sx, F.gy(sx, sz), sz], STALL.yaw, () => stall(B));
    for (const d of [-0.65, 0, 0.65]) ctx.collide(STALL.p[0] + Math.cos(STALL.yaw) * d, STALL.p[1] - Math.sin(STALL.yaw) * d, 0.42);
    // ---- a rounded fence behind the stall and one by the windmill, mossy boulders, ferns, flowers
    const fenceA = [[1.3, -2.3], [3.1, -2.1], [5.0, -1.9]].map(([a, b]) => L(...at(a, b)));
    const fenceB = [[-6.9, -0.4], [-5.4, -1.6], [-3.7, -2.4]].map(([a, b]) => L(...at(a, b)));
    for (const pts of [fenceA, fenceB]) for (const [x, z] of fence(B, pts, F.gy)) ctx.collide(F.X + x, F.Z + z, 0.14);
    const rocks = [[-7.2, 3.2, 0.95], [-6.8, 0.6, 0.6], [6.0, 3.2, 0.8], [6.4, 1.4, 0.5], [-2.6, -3.1, 0.55], [6.3, -1.0, 0.6], [-3.0, 5.6, 0.6]];
    rocks.forEach(([a, b, r], i) => {
      const [wx, wz] = at(a, b), [x, z] = L(wx, wz); boulder(B, x, F.gy(x, z), z, r, { seed: 50 + i, yaw: i * 1.3, moss: 0.55 });
      if (trailClear(wx, wz, r, 'windmill boulder')) ctx.collide(wx, wz, r * 0.85);
      flowers(B, x + r * 0.9, F.gy(x + r * 0.9, z + r * 0.4), z + r * 0.4, rnd, { n: 2, r: 0.25 });
    });
    for (const [a, b] of [[-6.2, 4.4], [-7.4, -1.4], [5.2, 4.6], [6.8, 0.2], [-3.2, -2.6], [1.0, 6.0]]) { const [x, z] = L(...at(a, b)); fern(B, x, F.gy(x, z), z, rnd, 0.9); }
    for (const [a, b] of [[-2.8, 2.6], [0.9, 1.6], [1.2, 4.8], [-3.6, -0.6], [4.6, -0.4], [-1.2, -2.2], [5.2, 2.6], [-0.4, 5.8], [2.4, -3.2]]) { const [x, z] = L(...at(a, b)); flowers(B, x, F.gy(x, z), z, rnd, { n: 3, r: 0.4, colors: ['#ffffff', '#ffffff', '#ff9dc1', '#ffd24a'] }); }
    for (const [a, b, r] of [[-7.0, -2.2, 0.45], [1.8, 6.6, 0.4]]) { const [x, z] = L(...at(a, b)); B.at([x, F.gy(x, z), z], 0, () => bush(B, { r, n: 3, color: '#4f9a44', flowers: ['#ff9dc1', '#ffffff'] })); }
    // the edge of the clearing: a blossom tree behind the windmill, bamboo at the corners
    for (const [a, b] of [[-8.6, 0.8]]) { const [wx, wz] = at(a, b), [x, z] = L(wx, wz); if (trailClear(wx, wz, 0.6, 'windmill bamboo')) { B.at([x, F.gy(x, z), z], 0, () => bamboo(B, { n: 4, h: 2.6, spread: 0.4 })); ctx.collide(wx, wz, 0.45); } }
  }, { x: F.X, z: F.Z, y: F.Y, yaw: 0 });
  // the pickable half of each tree's fruit is its own (still) part: it hides once that tree is picked today
  trees.forEach((t, i) => { t.part = inst.parts[i + 1]?.node; });
  ctx.collide(...MILL.p, 1.55);
  for (const t of trees) {
    ctx.collide(t.x, t.z, 0.34);
    const f = FRUIT[t.kind];
    const it = ctx.interact({ x: t.x + 0.55, z: t.z + 0.55, r: 1.55, label: f.label, onInteract: () => pick(t) });
    Object.defineProperty(it, 'label', { get: () => (ctx.doneToday(t.key) ? 'Picked today' : f.label) });
    t.it = it;
  }
  const pick = (t) => {
    const f = FRUIT[t.kind];
    if (ctx.doneToday(t.key)) { ctx.say(t.kind === 'peach' ? 'We picked this one today. It needs a night to make more.' : 'All picked for today. The rest need a little more sun.'); return; }
    ctx.pose('pickup', { dur: 0.62, at: 0.26, face: { x: t.x, z: t.z }, onAct: () => {
      if (!ctx.daily(t.key)) return;
      if (t.part) t.part.visible = false;
      ctx.give({ pantry: { [f.item]: 2 }, at: new THREE.Vector3(t.x + 0.3, ctx.H(t.x, t.z) + 1.5, t.z + 0.3) });
      ctx.say(t.kind === 'peach' ? 'Peaches! Soft as a cushion. Rosie will want a whole basket.' : 'Persimmons! Let them go soft and they taste like honey.', { once: t.kind });
    } });
  };
  let chk = 0;
  return {
    update(dt) {
      chk -= dt; if (chk > 0) return; chk = 1;
      for (const t of trees) if (t.part) t.part.visible = !ctx.doneToday(t.key);
    },
    trees, group: inst.group,
  };
}

// ------------------------------------------------------------------ the windmill (local: ground 0, door toward +z)
const CREAM = '#f4e5be', CREAM_D = '#e2cfa2', STONE_P = '#d9d1c6', RED = '#cf5a43', RED_D = '#a9432f';
const WALL = [[1.38, 0.18], [1.35, 1.0], [1.28, 2.1], [1.18, 3.2], [1.12, 3.86]];
const wallR = y => { for (let i = 1; i < WALL.length; i++) if (y <= WALL[i][1]) { const [r0, y0] = WALL[i - 1], [r1, y1] = WALL[i]; return r0 + (r1 - r0) * (y - y0) / (y1 - y0); } return WALL[WALL.length - 1][0]; };
const HUB = { y: 4.2, z: 1.62 }, SAIL_R = 2.6;
function windmill(B) {
  // the plinth and the tower: smooth cream stone, warmer up top, cooler at the foot
  const pl = G.cyl(1.52, 1.6, 0.3, 28); pl.translate(0, 0.1, 0); B.add(pl, (p, n, o) => o.set(STONE_P).multiplyScalar(0.88 + 0.1 * clamp(n.y + 0.4) + 0.05 * nz(p.x * 3, p.z * 3)));
  const wall = G.lathe(WALL, 26);
  B.add(wall, (p, n, o) => o.set(CREAM).lerp(new THREE.Color('#fff4d8'), clamp(p.y / 4) * 0.4).multiplyScalar(0.93 + 0.07 * nz(p.x * 1.7 + p.y, p.z * 1.7)));
  // a scatter of raised dressed stones on the wall, curving with it (clear of the door and the windows)
  const keep = [[0, 0.9, 0.75], [-0.95, 2.35, 0.45], [1.05, 2.75, 0.45]];
  let placed = 0;
  for (let k = 0; k < 60 && placed < 13; k++) {
    const a = B.drand(-PI, PI), y = B.drand(0.45, 3.6);
    if (keep.some(([ka, ky, kr]) => Math.abs(((a - ka + PI) % TAU + TAU) % TAU - PI) < kr + 0.25 && Math.abs(y - ky) < 0.9)) continue;
    if (Math.abs(a) < 0.62 && y < 1.9) continue;
    const w = B.drand(0.32, 0.5), h = B.drand(0.18, 0.26), r = wallR(y);
    B.at([Math.sin(a) * (r - 0.015), y, Math.cos(a) * (r - 0.015)], a, () => {
      const s = G.beam(w, h, 0.09, 0.03); B.add(s, B.dpick([CREAM_D, '#e8d7ae', '#d8c6a0']));
    });
    placed++;
  }
  // the arched door on its stone surround, two steps up to it
  const zd = wallR(0.4) + 0.02, dh = 0.88, dw = 0.8, y0 = 0.34;
  const panel = G.box(dw, dh, 0.08, 0.02); panel.translate(0, y0 + dh / 2, zd); B.add(panel, '#b47436');
  const arch = G.cyl(dw / 2, dw / 2, 0.08, 16); arch.rotateX(PI / 2); arch.translate(0, y0 + dh, zd); B.add(arch, '#b47436');
  for (const x of [-0.2, 0.2]) { const g = G.box(0.025, dh + 0.3, 0.02, 0); g.translate(x, y0 + (dh + 0.3) / 2, zd + 0.045); B.add(g, '#80501f'); }
  for (const y of [y0 + 0.25, y0 + 0.85]) { const s = G.box(0.62, 0.05, 0.02, 0); s.translate(0, y, zd + 0.05); B.add(s, '#5a4a48'); }
  const knob = G.sph(0.045, 8, 5); knob.translate(0.27, y0 + 0.55, zd + 0.07); B.add(knob, '#f4c04a');
  for (const sx of [-1, 1]) { const j = G.box(0.22, dh, 0.26, 0.05); j.translate(sx * (dw / 2 + 0.1), y0 + dh / 2, zd - 0.06); B.add(j, (p, n, o) => o.set(STONE_P).multiplyScalar(0.92 + 0.08 * clamp(n.y + 0.5))); }
  const ring = G.torus(dw / 2 + 0.1, 0.12, 8, 16, PI); ring.scale(1, 1, 1.05); ring.translate(0, y0 + dh, zd - 0.04);
  B.add(ring, (p, n, o) => o.set(STONE_P).multiplyScalar(0.9 + 0.12 * (Math.floor((Math.atan2(p.y - y0 - dh, p.x) / PI) * 5) % 2)));
  const st1 = G.box(1.35, 0.16, 0.5, 0.06); st1.translate(0, 0.08, zd + 0.42); B.add(st1, (p, n, o) => o.set('#cdc4c4').multiplyScalar(n.y > 0.5 ? 1.04 : 0.86));
  const st2 = G.box(1.1, 0.14, 0.32, 0.05); st2.translate(0, 0.22, zd + 0.12); B.add(st2, (p, n, o) => o.set('#d8d0cc').multiplyScalar(n.y > 0.5 ? 1.04 : 0.86));
  // two little arched windows in deep stone frames (dark by day, lamplit at night)
  for (const [a, y] of [[-0.95, 2.35], [1.05, 2.75]]) {
    const r = wallR(y);
    B.at([Math.sin(a) * r, y, Math.cos(a) * r], a, () => {
      const fr = G.box(0.42, 0.52, 0.16, 0.05); fr.translate(0, 0, -0.03); B.add(fr, STONE_P);
      const fa = G.cyl(0.21, 0.21, 0.16, 12); fa.rotateX(PI / 2); fa.translate(0, 0.26, -0.03); B.add(fa, STONE_P);
      const gl = G.box(0.26, 0.36, 0.02, 0); gl.translate(0, 0, 0.055); B.glow(gl, '#3e3a4a', { flicker: 0.3 });
      const ga = G.cyl(0.13, 0.13, 0.02, 10); ga.rotateX(PI / 2); ga.translate(0, 0.18, 0.055); B.glow(ga, '#3e3a4a', { flicker: 0.3 });
      const sill = G.box(0.5, 0.07, 0.14, 0.02); sill.translate(0, -0.28, 0.06); B.add(sill, '#cfc6bc');
    });
  }
  // the red cap: a plump dome of shingle rows over a lip, a wooden knob on top
  const prof = [[0.9, 3.7], [1.34, 3.7], [1.4, 3.8]];
  const ROWS = 5, H = 1.42, R = 1.38;
  for (let i = 0; i <= 20; i++) {
    const t = i / 20, row = t * ROWS, f = row - Math.floor(row);
    const r = R * Math.pow(Math.cos(t * PI / 2), 0.75) * (1 + 0.045 * (1 - f) * (1 - t)), y = 3.82 + H * Math.sin(t * PI / 2);
    prof.push([Math.max(0.001, r), y]);
  }
  const cap = G.lathe(prof, 24);
  B.add(cap, (p, n, o) => {
    const t = clamp((p.y - 3.82) / H), row = Math.floor(Math.asin(clamp(t)) / (PI / 2) * ROWS + 1e-3);
    o.set(row % 2 ? RED : '#d8684e').multiplyScalar(n.y < -0.2 ? 0.62 : 0.9 + 0.12 * clamp(n.y));
  });
  const fin = G.sph(0.12, 10, 6); fin.scale(1, 0.85, 1); fin.translate(0, 3.82 + H + 0.06, 0); B.add(fin, WOOD_D);
  // the axle out of the cap, and the four sails on it, turning slowly (a kit spin round the axle)
  const ax = G.cyl(0.1, 0.12, 0.7, 10); ax.rotateX(PI / 2); ax.translate(0, HUB.y, HUB.z - 0.3); B.add(ax, WOOD_DD);
  B.anim({ p: [0, HUB.y, HUB.z], kind: 'spin', axis: [0, 0, 1], speed: 0.32 }, () => sails(B));
}
// four red lattice sails on wooden stocks (local to the hub: the rotor in the xy plane, its face +z)
function sails(B) {
  const hub = G.cyl(0.25, 0.27, 0.22, 14); hub.rotateX(PI / 2); B.add(hub, WOOD);
  const boss = G.sph(0.17, 10, 6); boss.scale(1, 1, 0.7); boss.translate(0, 0, 0.12); B.add(boss, WOOD_D);
  for (let k = 0; k < 4; k++) {
    const a = k * PI / 2 + 0.35;
    B.at([0, 0, 0.06], 0, () => {
      B.push([0, 0, 0], 0, 1, 0, a); // (turn the arm about the axle: local +x runs out along the stock)
      const stock = G.box(SAIL_R + 0.1, 0.13, 0.11, 0.035); stock.translate((SAIL_R + 0.1) / 2, 0, 0); B.add(stock, '#9a6a44');
      // the lattice: on the stock's trailing side, from 0.55 m out to the tip
      const x0 = 0.55, x1 = SAIL_R, w = 0.78, c = (p, n, o) => o.set(RED).multiplyScalar(0.86 + 0.16 * clamp(n.z + 0.3));
      for (const yy of [0.1, w * 0.55, w]) { const b = G.box(x1 - x0, 0.075, 0.07, 0.02); b.translate((x0 + x1) / 2, yy, 0.05); B.add(b, yy === 0.1 ? RED_D : c); }
      for (let i = 0; i <= 6; i++) { const x = x0 + (x1 - x0) * i / 6, b = G.box(0.075, w, 0.065, 0.02); b.translate(x, w / 2 + 0.02, 0.07); B.add(b, c); }
      B.pop();
    });
  }
}

// ------------------------------------------------------------------ a fruit tree (local: its foot at 0)
function fruitTree(B, kind, rnd, rec) {
  const f = FRUIT[kind], bA = new THREE.Color('#6a4632'), bB = new THREE.Color('#9a7058');
  const bark = (p, n, o) => o.copy(bA).lerp(bB, clamp(0.45 + 0.3 * n.y + 0.25 * Math.sin(Math.atan2(n.z, n.x) * 3 + p.y * 2.5) + nz(p.y * 6, p.x * 6) * 0.2));
  const top = V((rnd() - 0.5) * 0.12, 1.0, (rnd() - 0.5) * 0.12);
  B.add(branch(V(0, -0.08, 0), top, 0.2, 0.13, V((rnd() - 0.5) * 0.1, 0, (rnd() - 0.5) * 0.1), 4, 8), bark);
  for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + rnd() * 0.8; B.add(branch(V(0, 0.28, 0), V(Math.cos(a) * 0.38, -0.04, Math.sin(a) * 0.38), 0.1, 0.04, V(0, 0.06, 0), 2, 5), bark); }
  // the crown: a big top puff and four round side puffs, made only of chunky leaves (an outer shell and a darker heart)
  const puffs = [{ c: V(0, 2.05, 0), r: 0.6 }];
  for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.4 + rnd() * 0.5; puffs.push({ c: V(Math.cos(a) * 0.52, 1.62 + rnd() * 0.12, Math.sin(a) * 0.52), r: 0.5 + rnd() * 0.06 }); }
  for (const q of puffs.slice(1)) B.add(branch(top, q.c.clone().lerp(top, 0.35), 0.08, 0.04, V(0, 0.1, 0), 3, 5), bark);
  const cols = LEAVES.map(c => new THREE.Color(c)), CC = V(0, 1.75, 0);
  for (const q of puffs) {
    const nOut = Math.round(q.r * 160), nIn = Math.round(nOut * 0.4);
    for (let k = 0; k < nOut + nIn; k++) {
      const inner = k >= nOut, u = (inner ? -0.5 : -0.35) + rnd() * (inner ? 1.4 : 1.32), th = rnd() * TAU, sr = Math.sqrt(Math.max(0, 1 - u * u));
      const d = V(sr * Math.cos(th), u, sr * Math.sin(th)), rad = inner ? 0.6 + rnd() * 0.2 : 0.92 + rnd() * 0.14;
      const p = q.c.clone().add(d.multiplyScalar(q.r * rad));
      const Ls = (inner ? 0.3 : 0.23) * (0.85 + rnd() * 0.3), lf = leafGeo(Ls, Ls * 0.42, 0.3);
      // (each leaf lies on the crown like a scale, its face out and a little up, so the crown reads round)
      lf.translate(-Ls * 0.4, 0, 0); lf.rotateY(rnd() * TAU); lf.applyQuaternion(_q.setFromUnitVectors(UP, d.normalize().lerp(UP, inner ? 0.2 : 0.35).normalize())); lf.translate(p.x, p.y, p.z);
      // form shading painted in (the toon ramp flattens it): a sunny crown, mid sides, a shaded underside
      const g = p.clone().sub(CC).normalize(), t = clamp(0.5 + g.y * 0.55 + g.dot(SUN) * 0.18 + (rnd() - 0.5) * 0.14);
      let c = cols[2].clone().lerp(cols[0], clamp(t * 1.8)).lerp(cols[3], clamp(t * 2.2 - 1.3));
      if (inner) c = c.lerp(cols[2], 0.6).multiplyScalar(0.72);
      B.add(lf, (pp, nn, o) => o.copy(c).multiplyScalar(0.9 + 0.16 * clamp(nn.y)), 'leaf');
    }
  }
  // the fruit: round balls nestled in the shell, mostly on the camera's side; the second half is the pickable part
  const spots = [];
  for (let k = 0; spots.length < f.n && k < 200; k++) {
    const q = puffs[k % puffs.length], u = -0.35 + rnd() * 1.0, th = rnd() * TAU, sr = Math.sqrt(1 - u * u);
    const d = V(sr * Math.cos(th), u, sr * Math.sin(th));
    if (d.dot(CAM) < -0.25 && rnd() < 0.8) continue;
    const p = q.c.clone().addScaledVector(d, q.r * 0.96);
    if (puffs.some(o => o !== q && o.c.distanceTo(p) < o.r * 0.85) || spots.some(s => s.distanceTo(p) < 0.28)) continue;
    spots.push(p);
  }
  const half = Math.ceil(spots.length / 2);
  spots.slice(0, half).forEach((p, k) => fruitBall(B, p.x, p.y, p.z, f.r, f, k));
  B.anim({ p: [0, 0, 0], kind: 'bob', amp: 0, speed: 0 }, () => spots.slice(half).forEach((p, k) => fruitBall(B, p.x, p.y, p.z, f.r, f, k + 7)));
  rec.spots = spots.length;
}
/** one fruit: a peach (a soft cleft, a rosy blush, a leaf) or a persimmon (a little flattened, a green calyx) */
function fruitBall(B, x, y, z, r, f, k) {
  const g = G.sph(r, 7, 5), peach = f.item === 'peach';
  if (!peach) g.scale(1, 0.86, 1);
  const base = new THREE.Color(f.base), blush = new THREE.Color(f.blush), hi = new THREE.Color(f.hi);
  const bd = V(Math.sin(k * 2.4), -0.3, Math.cos(k * 2.4)).normalize();
  g.translate(x, y, z);
  B.add(g, (p, n, o) => { o.copy(base).lerp(blush, clamp(n.dot(bd) * 0.9) * (peach ? 0.75 : 0.35)).lerp(hi, clamp(n.y * 1.4 - 0.6) * 0.55); if (peach && Math.abs(n.x * Math.cos(k) - n.z * Math.sin(k)) < 0.06 && n.y > -0.2) o.multiplyScalar(0.86); });
  if (peach) {
    const lf = leafGeo(0.13, 0.05, 0.3); lf.rotateZ(0.5); lf.rotateY(k * 1.9); lf.translate(x, y + r * 0.88, z); B.add(lf, '#5aa03c');
  } else {
    for (let j = 0; j < 4; j++) { const s = leafGeo(0.065, 0.032, 0.2); s.rotateZ(0.25); s.rotateY(j * PI / 2 + k); s.translate(x, y + r * 0.82, z); B.add(s, '#5c7a2c'); }
    const st = G.cyl(0.01, 0.014, 0.05, 4); st.translate(x, y + r * 0.9, z); B.add(st, '#6a4a2a');
  }
}
// a timber tub (staves, two hoops) heaped with fruit
function tubOf(B, x, y, z, r, f) {
  B.at([x, y, z], 0, () => barrel(B, { r, h: 0.3, wood: '#c08850', lid: false }));
  const fill = G.cyl(r * 0.9, r * 0.9, 0.03, 12); fill.translate(x, y + 0.26, z); B.add(fill, '#8a6040');
  for (let i = 0; i < 6; i++) { const a = i / 5 * TAU, d = i === 5 ? 0 : r * 0.52; fruitBall(B, x + Math.cos(a) * d, y + 0.33 + (i === 5 ? 0.07 : 0), z + Math.sin(a) * d, f.r * 0.9, f, i); }
}
// a picking ladder leaning on the tree at (tree x, z), its foot out toward `yaw`, `h` tall
function ladder(B, F, [tx, tz], yaw, h) {
  const dx = Math.sin(yaw), dz = Math.cos(yaw), foot = V(tx + dx * 0.72, 0, tz + dz * 0.72), topP = V(tx + dx * 0.24, 0, tz + dz * 0.24);
  foot.y = F.gy(foot.x, foot.z) - 0.02; topP.y = F.gy(tx, tz) + h;
  const side = V(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(0.2);
  for (const s of [-1, 1]) {
    const a = foot.clone().addScaledVector(side, s), b = topP.clone().addScaledVector(side, s * 0.9);
    B.add(tube([{ p: a, r: 0.035 }, { p: b, r: 0.032 }], 6, false), WOOD);
  }
  for (let i = 1; i <= 4; i++) {
    const t = i / 4.6, c = foot.clone().lerp(topP, t), w = 0.2 * (1 - t * 0.1);
    B.add(tube([{ p: c.clone().addScaledVector(side, -w / 0.2), r: 0.024 }, { p: c.clone().addScaledVector(side, w / 0.2), r: 0.024 }], 5, false), '#b07a48');
  }
}
// the fruit stall: a planked table on chunky legs with a low shelf, two open crates of fruit and an empty hand basket
function stall(B) {
  const W = 2.0, D = 0.72, Ht = 0.74;
  for (let i = 0; i < 4; i++) { const p = G.box(W, 0.07, D / 4 - 0.015, 0.025); p.translate(0, Ht - 0.035, -D / 2 + D / 8 + i * D / 4); B.add(p, (pp, n, o) => o.set(['#d39858', '#c48a4c', '#dba468', '#c99050'][i]).multiplyScalar(n.y > 0.5 ? 1.03 : 0.82)); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = G.box(0.13, Ht - 0.06, 0.13, 0.035); l.translate(sx * (W / 2 - 0.12), (Ht - 0.06) / 2, sz * (D / 2 - 0.1)); B.add(l, WOOD_D); }
  for (const sz of [-1, 1]) { const a = G.box(W - 0.2, 0.08, 0.06, 0.02); a.translate(0, Ht - 0.13, sz * (D / 2 - 0.06)); B.add(a, WOOD_D); }
  const sh = G.box(W - 0.3, 0.05, D - 0.24, 0.02); sh.translate(0, 0.2, 0); B.add(sh, '#b98250');
  // two open crates of fruit on top and the basket
  for (const [x, kind] of [[-0.48, 'peach'], [0.3, 'persimmon']]) {
    B.at([x, Ht, 0.02], 0.05 * x, () => crate(B, { s: 0.62, lid: false, stencil: false, wood: '#d9a466' }));
    const f = FRUIT[kind];
    for (let i = 0; i < 9; i++) { if (i === 0 || i === 8) continue; const u = (i % 3) - 1, v = Math.floor(i / 3) - 1; fruitBall(B, x + u * 0.165 + (v % 2) * 0.02, Ht + 0.5 + (i === 4 ? 0.05 : 0), 0.02 + v * 0.165, f.r * 0.92, f, i); }
  }
  basket(B, 0.82, Ht, 0.05, 0.17, { h: 0.18, handle: true, color: '#d8aa66' });
  // under the shelf: a spare crate of persimmons
  B.at([0.45, 0.225, 0], 0, () => crate(B, { s: 0.42, lid: false, stencil: false, wood: '#c99458' }));
}
