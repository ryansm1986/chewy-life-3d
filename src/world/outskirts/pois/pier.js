// Lagoon Pier (ROADMAP HP-1; the concept: tools/blender/work/codex/hollow-pois/concepts/poi-07-pier.png): a broad
// plank pier on rope-wrapped round posts running out over the north-east lagoon (a walkable deck reaching water over a
// metre deep: the game's rod fishes off its end and sides, life/fishing.js), a cream-and-teal rowboat tied to it that
// bobs and rolls gently, a little timber shed with a red tiled roof and a round blue window, a rack of fishing rods, a
// bait bucket, crates, lantern light at night, cattails and lily pads in the shallows, mossy boulders on the shore, and
// a sleepy orange tabby curled on a crate (she breathes; now and then her tail flicks). "Pet the cat" once a day: a
// purr, hearts, a Shadow line, a few coins. Built by world/outskirts/index.js with ctx (the toolkit documented there).
import * as THREE from 'three';
import { G, V, PI } from '../../buildings/kit.js';
import { crate, barrel, bush, bamboo, chochin, nz } from '../../buildings/props.js';
import { tube } from '../../../gfx/geom.js';
import { TAU, clamp } from '../../../core/util.js';
import { frame, boulder, fern, flowers, cattails, lilyPad, roundPost, ropeWrap, lanternPost, fence, PLANKS, WOOD, WOOD_D, WOOD_DD, ROPE, trailClear } from './_north.js';

// the pier: its landing on the shore, its heading out over the lagoon (east-north-east), its length and width
const PIER = { x: 168.55, z: 54.35, yaw: 1.9, len: 7.0, w: 2.0, top: 0.46 };
const SHED = { x: 165.95, z: 53.2, yaw: 1.2 };
const HD = [Math.sin(PIER.yaw), Math.cos(PIER.yaw)], SD = [Math.cos(PIER.yaw), -Math.sin(PIER.yaw)]; // (out along the pier; its left side, north)
const onPier = (s, t) => [PIER.x + HD[0] * s + SD[0] * t, PIER.z + HD[1] * s + SD[1] * t]; // (s along, t across)
const BOAT = { s: 4.7, t: -2.3 };

export function build(ctx) {
  const F = frame(ctx), rnd = ctx.rand, H = ctx.H;
  // ---- the pier (its own kit at the sea's level, turned along its heading: local z out, local x its left side)
  const pier = ctx.kit(7707, B => pierModel(B, ctx), { x: PIER.x, z: PIER.z, y: 0, yaw: PIER.yaw });
  const boat = pier.parts[0]?.node;
  // its deck: along its own axis (a turned box), the top level, the bank where the bank is higher
  const hw = PIER.w / 2 + 0.04, ends = [onPier(-0.75, -hw), onPier(-0.75, hw), onPier(PIER.len, -hw), onPier(PIER.len, hw)];
  ctx.deck({
    x0: Math.min(...ends.map(e => e[0])), z0: Math.min(...ends.map(e => e[1])), x1: Math.max(...ends.map(e => e[0])), z1: Math.max(...ends.map(e => e[1])), pier: true,
    inside(x, z) { const px = x - PIER.x, pz = z - PIER.z, s = px * HD[0] + pz * HD[1], t = px * SD[0] + pz * SD[1]; return s >= -0.75 && s <= PIER.len && Math.abs(t) <= hw; },
    h: (x, z) => Math.max(PIER.top, H(x, z)),
  });
  // ---- the shore: the shed, the cat on her crate, the rods, the bait bucket, lantern light, plants and boulders
  const L = (x, z) => [x - F.X, z - F.Z];
  let cat = null;
  const shore = ctx.kit(7708, B => {
    const [sx, sz] = L(SHED.x, SHED.z);
    B.at([sx, F.gy(sx, sz) - 0.04, sz], SHED.yaw, () => shed(B));
    // the cat's crate at the shed's front corner, the cat curled on top (her body and tail are their own still parts)
    const cl = shedPt(-0.95, 1.65), [cx, cz] = L(...cl), cy = F.gy(cx, cz);
    B.at([cx, cy, cz], SHED.yaw + 0.2, () => crate(B, { s: 0.62, wood: '#c99458', stencil: false }));
    cat = { x: cl[0], z: cl[1], y: F.Y + cy + 0.53, yaw: -0.55 };
    B.at([cx, cy + 0.53, cz], cat.yaw, () => catModel(B));
    ctx.collide(cl[0], cl[1], 0.45);
    // a second crate and a tub by the shed's other corner, the rod rack beside the door, the bait bucket on the landing
    const c2 = onPier(-0.45, 1.6), [c2x, c2z] = L(...c2);
    B.at([c2x, F.gy(c2x, c2z), c2z], SHED.yaw - 0.15, () => crate(B, { s: 0.5, wood: '#d4a066', stencil: false }));
    ctx.collide(...c2, 0.36);
    const rk = shedPt(1.35, 1.5), [rx, rz] = L(...rk);
    B.at([rx, F.gy(rx, rz), rz], SHED.yaw - 0.35, () => rodRack(B));
    ctx.collide(...rk, 0.42);
    const bk = onPier(-0.55, -1.55), [bx, bz] = L(...bk);
    B.at([bx, F.gy(bx, bz), bz], 0, () => baitBucket(B));
    ctx.collide(...bk, 0.2);
    // the lantern post at the landing (lit at night)
    const lp = onPier(-0.35, -1.42), [lpx, lpz] = L(...lp);
    const lamp = lanternPost(B, lpx, F.gy(lpx, lpz), lpz, { h: 1.55, face: PIER.yaw - PI / 2 });
    B.light(lamp, { color: '#ffc070', intensity: 2.0, radius: 5.5, flicker: 0.4 });
    ctx.collide(...lp, 0.16);
    // a rope-and-post fence by the trail, west of the shed
    const fpts = [[163.3, 53.5], [164.2, 54.15], [165.2, 54.75]].map(([x, z]) => L(x, z));
    for (const [x, z] of fence(B, fpts, F.gy)) { trailClear(F.X + x, F.Z + z, 0.1, 'pier fence'); ctx.collide(F.X + x, F.Z + z, 0.14); }
    // mossy boulders along the shore, cattails and lily pads in the shallows south of the pier
    for (const [x, z, r, i] of [[169.7, 56.5, 0.7, 0], [170.5, 57.6, 0.5, 1], [167.0, 51.8, 0.85, 2], [168.7, 51.3, 0.6, 3], [164.1, 51.0, 0.9, 4], [169.6, 49.6, 0.75, 5], [162.6, 52.4, 0.6, 6]]) {
      const [lx, lz] = L(x, z); boulder(B, lx, F.gy(lx, lz), lz, r, { seed: 30 + i, yaw: i * 1.7, moss: 0.55 });
      if (H(x, z) > 0.1 && trailClear(x, z, r, 'pier boulder')) ctx.collide(x, z, r * 0.85);
      if (i % 2 === 0) flowers(B, lx - r * 0.8, F.gy(lx - r * 0.8, lz + r * 0.6), lz + r * 0.6, rnd, { n: 3, r: 0.25 });
    }
    for (const [x, z] of [[170.1, 55.8], [171.0, 56.9], [169.5, 51.6], [170.0, 50.4]]) { const [lx, lz] = L(x, z); cattails(B, lx, Math.max(-F.Y + 0.0, F.gy(lx, lz)) - 0.02, lz, rnd, { n: 7, h: 0.85 }); }
    for (const [x, z, r, lot] of [[171.9, 56.4, 0.4, true], [173.0, 57.3, 0.34, false], [174.4, 56.8, 0.45, false], [176.2, 55.9, 0.36, true], [174.6, 50.6, 0.42, false], [176.0, 51.4, 0.32, true], [172.6, 51.2, 0.3, false]]) {
      const [lx, lz] = L(x, z); lilyPad(B, lx, -F.Y + 0.005, lz, r, rnd() * TAU, lot);
    }
    // the bank: ferns and flowers, bamboo and bushes behind the shed
    for (const [x, z] of [[164.2, 53.0], [167.2, 55.6], [166.0, 51.2], [168.1, 52.6], [167.8, 50.6]]) { const [lx, lz] = L(x, z); fern(B, lx, F.gy(lx, lz), lz, rnd, 0.95); }
    for (const [x, z] of [[166.6, 55.2], [165.0, 55.6], [168.3, 56.1], [163.6, 52.1], [167.6, 52.9], [169.2, 52.6], [166.3, 50.3]]) { const [lx, lz] = L(x, z); flowers(B, lx, F.gy(lx, lz), lz, rnd, { n: 4, r: 0.4 }); }
    for (const [x, z] of [[164.8, 51.4], [166.4, 49.9]]) { const [lx, lz] = L(x, z); if (trailClear(x, z, 0.5, 'pier bamboo')) { B.at([lx, F.gy(lx, lz), lz], 0, () => bamboo(B, { n: 4, h: 2.8, spread: 0.4 })); ctx.collide(x, z, 0.42); } }
    for (const [x, z, r] of [[163.0, 51.2, 0.5], [167.9, 49.8, 0.45]]) { const [lx, lz] = L(x, z); B.at([lx, F.gy(lx, lz), lz], 0, () => bush(B, { r, n: 3, color: '#4f9a44', flowers: ['#ff9dc1', '#ffffff'] })); ctx.collide(x, z, r * 0.8); }
  }, { x: F.X, z: F.Z, y: F.Y, yaw: 0 });
  const catBody = shore.parts[0]?.node, catTail = shore.parts[1]?.node;
  ctx.collide(SHED.x, SHED.z, 1.25); ctx.collide(...shedPt(0, -0.6), 1.15);
  // the boat is solid where it floats (it's beside the pier, in the water: only for the waders)
  // ---- "Pet the cat"
  const catPos = new THREE.Vector3(cat.x, cat.y, cat.z);
  const it = ctx.interact({ x: cat.x, z: cat.z, r: 1.25, label: 'Pet the cat', onInteract: () => pet() });
  Object.defineProperty(it, 'label', { get: () => (ctx.doneToday('cat') ? 'Let her nap' : 'Pet the cat') });
  let purr = 0, flick = 0, flickT = 3;
  const pet = () => {
    const first = !ctx.doneToday('cat');
    ctx.pose('tend', { dur: 1.7, at: 0.55, face: { x: cat.x, z: cat.z }, onAct: () => {
      purr = 2.6; flick = 1;
      ctx.sfx('cat_meow', catPos);
      ctx.G.vfx?.emote?.({ pos: catPos, rig: { height: 0.05 } }, 'heart', 2.0);
      ctx.G.vfx?.sparkle?.(catPos.clone().add(new THREE.Vector3(0, 0.25, 0)), { n: 8, color: '#ffc8e0', r: 0.3, rise: 0.7, size: 0.2 });
      if (first && ctx.daily('cat')) {
        ctx.give({ coins: 8, at: catPos.clone().add(new THREE.Vector3(0, 0.5, 0)) });
        ctx.say(['Listen! She purrs like a little boat motor.', 'She likes you. Her tail does a happy flick when you scratch her ears.', 'Shh... she is dreaming about fish. Big ones.'][Math.floor(Math.random() * 3)]);
      } else ctx.say('She\'s napping again. We can visit her tomorrow.', { once: 'nap' });
    } });
  };
  return {
    update(dt, t) {
      // the boat bobs (its kit part) and rolls a little; the cat breathes, purrs faster when petted, flicks her tail
      if (boat) { boat.rotation.z = Math.sin(t * 1.1) * 0.035; boat.rotation.x = Math.sin(t * 0.7 + 1) * 0.015; }
      purr = Math.max(0, purr - dt);
      if (catBody) catBody.scale.set(1, 1 + Math.sin(t * (purr > 0 ? 7 : 1.7)) * (purr > 0 ? 0.025 : 0.035), 1 + Math.sin(t * 1.7) * 0.012);
      flickT -= dt; if (flickT <= 0) { flick = 1; flickT = 3 + Math.random() * 5; }
      flick = Math.max(0, flick - dt * 1.4);
      if (catTail) catTail.rotation.y = Math.sin((1 - flick) * PI * 3) * flick * 0.55 + Math.sin(t * 0.6) * 0.05;
    },
    group: shore.group, pierGroup: pier.group, boat, cat: catPos, end: onPier(PIER.len - 0.45, 0),
  };
}
const shedPt = (lx, lz) => [SHED.x + Math.cos(SHED.yaw) * lx + Math.sin(SHED.yaw) * lz, SHED.z - Math.sin(SHED.yaw) * lx + Math.cos(SHED.yaw) * lz];

// ------------------------------------------------------------------ the pier (local: the landing at 0, out along +z;
// y is the sea's level)
function pierModel(B, ctx) {
  const { len, w, top } = PIER, hw = w / 2, H = ctx.H;
  const bed = (s, t) => Math.min(H(...onPier(s, t)), 0.3) - 0.25; // (where a post goes into the bed)
  // planks across, each its own tone with dark pegs at the ends
  const n = Math.round((len + 0.75) / 0.34);
  for (let i = 0; i < n; i++) {
    const z = -0.75 + (i + 0.5) * (len + 0.75) / n, p = G.box(w, 0.09, (len + 0.75) / n - 0.035, 0.03); p.translate(B.dwob(0.025), top - 0.045, z);
    const c = PLANKS[(i * 5 + 1) % 3]; B.add(p, (pp, nn, o) => o.set(c).multiplyScalar((nn.y > 0.5 ? 1 : 0.78) * (0.95 + 0.07 * nz(pp.x * 3 + i, pp.z * 7))));
    for (const s of [-1, 1]) for (const k of [0.35, 0.65]) { const peg = G.cyl(0.022, 0.022, 0.012, 6); peg.translate(s * (hw - 0.14), top + 0.002, z + (k - 0.5) * 0.2); B.add(peg, '#4a3632'); }
  }
  // three stringers under the planks
  for (const x of [-hw + 0.16, 0, hw - 0.16]) { const b = G.box(0.14, 0.16, len + 0.6, 0.04); b.translate(x, top - 0.17, (len - 0.6) / 2); B.add(b, WOOD_D); }
  // the posts in pairs, stout and round, rope-wrapped; the outer pairs tall with a rope rail along the north side
  const rail = [];
  const stations = [-0.45, len * 0.33, len * 0.66, len - 0.15];
  stations.forEach((s, i) => {
    for (const sd of [-1, 1]) {
      const t = sd * (hw + 0.06), tall = i === 0 || i === stations.length - 1 || sd > 0, y1 = top + (tall ? 0.5 : 0.12);
      roundPost(B, t, s, bed(s, t), y1, { r: 0.15, color: '#9a6a46', rope: tall ? 3 : 0 });
      if (!tall) ropeWrap(B, t, top - 0.32, s, 0.15, 2);
      if (s > 0.5 && i < stations.length) { const ring = G.torus(0.22, 0.03, 4, 14); ring.rotateX(PI / 2); ring.scale(1, 1, 1); ring.translate(t, 0.015, s); B.add(ring, '#dff4f2'); } // (a little foam collar at the water)
      if (sd > 0) rail.push(V(t, top + 0.4, s));
    }
  });
  for (let i = 0; i < rail.length - 1; i++) {
    const a = rail[i], b = rail[i + 1];
    B.add(tube([0, 1, 2, 3, 4, 5, 6].map(k => ({ p: a.clone().lerp(b, k / 6).add(V(0, -Math.sin(k / 6 * PI) * 0.14, 0)), r: 0.032 })), 5, false), ROPE);
  }
  // the rowboat, tied to the third post on the south side (bobbing: a kit part; it rolls in the update)
  B.anim({ p: [BOAT.t, -0.02, BOAT.s], kind: 'bob', amp: 0.03, speed: 1.3 }, () => rowboat(B));
  const tie = V(-hw - 0.06, top + 0.2, stations[2]), bow = V(BOAT.t + 0.25, 0.48, BOAT.s - 1.3);
  B.add(tube([0, 1, 2, 3, 4, 5, 6].map(k => ({ p: tie.clone().lerp(bow, k / 6).add(V(0, -Math.sin(k / 6 * PI) * 0.2, 0)), r: 0.025 })), 5, false), ROPE);
}
// a cream-and-teal rowboat (local: along z, its keel at 0): a lathe-like hull of rounded strakes, a pale gunwale, two
// thwart seats, a floor of boards and two oars resting inside
function rowboat(B) {
  const L = 3.0, Wd = 1.2, Hh = 0.5, NZ = 12, NA = 9, pos = [], idx = [];
  const half = (z) => { const u = z / (L / 2); return Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), 2.4)), 0.5); };
  for (let i = 0; i <= NZ; i++) {
    const z = -L / 2 + i / NZ * L, k = half(z), rise = Math.pow(Math.abs(z) / (L / 2), 3) * 0.12;
    for (let j = 0; j <= NA; j++) { const a = j / NA * PI; pos.push(-Math.cos(a) * Wd / 2 * Math.max(0.04, k), Hh + rise - Math.sin(a) * (Hh - 0.04) * Math.max(0.2, k), z); }
  }
  for (let i = 0; i < NZ; i++) for (let j = 0; j < NA; j++) { const a = i * (NA + 1) + j, b = a + NA + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const out = g.clone(); out.index.array.reverse(); out.computeVertexNormals(); // (the inside: the same hull, faced in)
  const cream = new THREE.Color('#f3e6c6'), teal = new THREE.Color('#3fa8a8'), tealD = new THREE.Color('#2f8a8c'), wood = new THREE.Color('#c58a52');
  // (g faces out: cream with a broad teal band, a cream stripe and a teal bottom; the copy faced in is bare wood)
  B.add(g, (p, n, o) => { const h = p.y - Math.pow(Math.abs(p.z) / (L / 2), 3) * 0.12; o.copy(h > Hh * 0.86 ? cream : h > Hh * 0.62 ? teal : h > Hh * 0.5 ? cream : tealD).multiplyScalar(0.92 + 0.1 * clamp(n.y + 0.5)); });
  B.add(out, (p, n, o) => o.copy(wood).multiplyScalar(p.y < 0.2 ? 0.82 : 0.95));
  // gunwale: a pale rounded rail round the top edge
  const rim = []; for (let i = 0; i <= NZ * 2; i++) rim.push(-L / 2 + 0.06 + i / (NZ * 2) * (L - 0.12));
  for (const sd of [-1, 1]) B.add(tube(rim.map(z => ({ p: V(sd * Wd / 2 * Math.max(0.05, half(z)) * 0.98, Hh + Math.pow(Math.abs(z) / (L / 2), 3) * 0.12 + 0.02, z), r: 0.04 })), 6, false), '#e8dcc0');
  for (const z of [-L / 2 + 0.04, L / 2 - 0.04]) { const c = G.sph(0.06, 8, 5); c.translate(0, Hh + 0.13, z); B.add(c, '#e8dcc0'); }
  // the floor boards and two thwarts
  const fl = G.box(Wd * 0.42, 0.04, L * 0.42, 0.015); fl.translate(0, 0.19, 0); B.add(fl, '#b98250');
  for (const z of [-0.55, 0.5]) { const s = G.box(Wd * 0.92 * half(z), 0.06, 0.24, 0.02); s.translate(0, Hh * 0.72, z); B.add(s, '#d39a5c'); }
  // two oars across the seats
  for (const sd of [-1, 1]) {
    const a = V(sd * 0.22, Hh * 0.8, -0.95), b = V(sd * 0.12, Hh * 0.85, 0.75);
    B.add(tube([{ p: a, r: 0.028 }, { p: b, r: 0.028 }], 5, false), '#c89060');
    const bl = G.box(0.15, 0.03, 0.42, 0.012); bl.translate(sd * 0.1, Hh * 0.86, 0.95); B.add(bl, '#d8a46a');
  }
}

// ------------------------------------------------------------------ the shed (local: ground 0, its door toward +z)
const SW = 2.3, SDp = 2.1, WALL_H = 1.75, ROOF = '#c4523f';
function shed(B) {
  const hw = SW / 2, hd = SDp / 2;
  // a low stone footing and a plank floor
  const ft = G.box(SW + 0.16, 0.18, SDp + 0.16, 0.05); ft.translate(0, 0.07, 0); B.add(ft, '#b8b0ae');
  // walls of vertical planks (each its own tone) between square corner posts; the front with a door opening
  const plank = (x, z, ry, h, w = 0.25) => { const p = G.box(w - 0.02, h, 0.07, 0.02); p.translate(0, h / 2 + 0.16, 0); B.at([x, 0, z], ry, () => B.add(p, B.dpick(['#d1985a', '#c48a4c', '#dba468']))); };
  for (let x = -hw + 0.125; x < hw; x += 0.25) plank(x, -hd + 0.035, 0, WALL_H);            // back
  for (let z = -hd + 0.125; z < hd; z += 0.25) { plank(-hw + 0.035, z, PI / 2, WALL_H); plank(hw - 0.035, z, PI / 2, WALL_H); } // sides
  for (let x = -hw + 0.125; x < hw; x += 0.25) { if (Math.abs(x) < 0.45) continue; plank(x, hd - 0.035, 0, WALL_H); } // front (the doorway)
  const lin = G.box(1.0, 0.2, 0.1, 0.03); lin.translate(0, 1.45, hd - 0.03); B.add(lin, WOOD_D);
  for (let x = -0.375; x <= 0.38; x += 0.25) { const p = G.box(0.23, 0.32, 0.07, 0.02); p.translate(x, 1.72, hd - 0.035); B.add(p, '#c48a4c'); }
  const inside = G.box(SW - 0.2, WALL_H - 0.05, SDp - 1.0, 0.02); inside.translate(0, WALL_H / 2 + 0.16, -hd + 0.1 + (SDp - 1.0) / 2); B.add(inside, '#4a3226');
  const floor = G.box(SW - 0.2, 0.04, SDp - 0.2, 0.01); floor.translate(0, 0.17, 0); B.add(floor, '#8a6040');
  for (const sx of [-1, 1]) { const sw = G.box(0.04, WALL_H - 0.05, SDp - 0.2, 0.01); sw.translate(sx * (hw - 0.1), WALL_H / 2 + 0.16, 0); B.add(sw, '#5a3c2c'); }
  const ceil = G.box(SW - 0.2, 0.04, SDp - 0.2, 0.01); ceil.translate(0, WALL_H + 0.12, 0); B.add(ceil, '#3e2a20');
  for (const [x, z] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]]) { const p = G.beam(0.16, WALL_H + 0.2, 0.16); p.translate(x, (WALL_H + 0.2) / 2 + 0.1, z); B.add(p, WOOD_D); }
  for (const sx of [-1, 1]) { const j = G.beam(0.1, 1.35, 0.12); j.translate(sx * 0.5, 0.16 + 0.67, hd); B.add(j, WOOD_D); }
  // a plank step at the door, two little tubs just inside it
  const st = G.box(1.1, 0.1, 0.4, 0.03); st.translate(0, 0.08, hd + 0.25); B.add(st, '#c48a4c');
  B.at([-0.25, 0.16, hd - 0.4], 0, () => barrel(B, { r: 0.15, h: 0.24, wood: '#c08850', lid: false }));
  B.at([0.22, 0.16, hd - 0.55], 0, () => barrel(B, { r: 0.13, h: 0.3, wood: '#b07a48' }));
  // the round blue window on the camera's side wall, in a chunky frame with a cross-bar
  B.at([-hw - 0.01, 1.05, 0.15], -PI / 2, () => {
    const fr = G.torus(0.3, 0.07, 6, 18); B.add(fr, WOOD_D);
    const gl = G.disc(0.3, 16); gl.translate(0, 0, 0.01); B.glow(gl, '#86c8ee', { flicker: 0.2, tint: 0.35 });
    for (const r of [0, PI / 2]) { const b = G.box(0.6, 0.06, 0.05, 0); b.rotateZ(r); b.translate(0, 0, 0.03); B.add(b, WOOD_D); }
  });
  // gables of planks, the red roof: chunky rounded tile courses on two pitches, a round ridge, barge boards
  const rise = 0.95, ov = 0.28, slope = Math.atan2(rise, hw + ov);
  for (const z of [-hd + 0.03, hd - 0.03]) for (let x = -hw + 0.125; x < hw; x += 0.25) {
    const h = Math.max(0.06, rise * (1 - Math.abs(x) / (hw + 0.02)) - 0.04);
    const p = G.box(0.23, h, 0.07, 0.02); p.translate(x, WALL_H + 0.16 + h / 2, z); B.add(p, '#c48a4c');
  }
  const slopeLen = Math.hypot(hw + ov, rise), rows = 4;
  for (const sx of [-1, 1]) for (let r = 0; r < rows; r++) {
    const u = (r + 0.5) / rows, along = slopeLen * (1 - u), x = sx * Math.cos(slope) * along, y = WALL_H + 0.18 + Math.sin(slope) * (slopeLen - along);
    // a course of chunky tiles, staggered row to row
    const nT = 6, tw = (SDp + 0.5) / nT;
    for (let k = 0; k < nT + (r % 2); k++) {
      const half = r % 2 && (k === 0 || k === nT), w2 = half ? tw / 2 : tw;
      const zz = r % 2 ? (k === 0 ? -(SDp + 0.5) / 2 + tw / 4 : k === nT ? (SDp + 0.5) / 2 - tw / 4 : -(SDp + 0.5) / 2 + k * tw) : -(SDp + 0.5) / 2 + (k + 0.5) * tw;
      const t = G.beam(slopeLen / rows + 0.12, 0.12, w2 - 0.035, 0.04); t.rotateZ(sx * -slope); t.translate(x, y + 0.05, zz);
      const c = B.dpick([ROOF, '#b84a38', '#cc5a44']);
      B.add(t, (p, n, o) => o.set(c).multiplyScalar(n.y < -0.3 ? 0.55 : 0.88 + 0.14 * clamp(n.y)));
    }
    if (r === 0) { const under = G.box(slopeLen + 0.05, 0.05, SDp + 0.48, 0.02); under.rotateZ(sx * -slope); under.translate(sx * Math.cos(slope) * slopeLen / 2, WALL_H + 0.16 + Math.sin(slope) * slopeLen / 2, 0); B.add(under, '#8a3a2a'); }
  }
  const ridge = G.cyl(0.11, 0.11, SDp + 0.6, 10); ridge.rotateX(PI / 2); ridge.translate(0, WALL_H + 0.18 + rise + 0.06, 0); B.add(ridge, '#b9503a');
  for (const z of [-(SDp + 0.6) / 2, (SDp + 0.6) / 2]) { const c = G.sph(0.13, 8, 6); c.translate(0, WALL_H + 0.24 + rise, z); B.add(c, '#b9503a'); }
  for (const z of [-hd - 0.22, hd + 0.22]) for (const sx of [-1, 1]) {
    const a = V(0, WALL_H + 0.2 + rise, z), b = V(sx * (hw + ov), WALL_H + 0.18, z);
    const bb = G.beam(0.08, 0.14, a.distanceTo(b)); bb.rotateY(PI / 2); bb.rotateZ(-sx * slope); bb.translate((a.x + b.x) / 2, (a.y + b.y) / 2 - 0.04, z); B.add(bb, WOOD_D);
  }
  // a paper lantern hung by the door on a bracket (lit at night)
  const arm = G.beam(0.5, 0.07, 0.07); arm.translate(hw + 0.17, 1.66, hd + 0.04); B.add(arm, WOOD_D);
  let cy = 0; B.at([hw + 0.34, 1.62, hd + 0.04], 0, () => { cy = chochin(B, { r: 0.14, h: 0.25, color: '#fff1d2', band: false, cord: 0.05 }); });
  B.light([hw + 0.34, 1.62 + cy, hd + 0.04], { color: '#ffc070', intensity: 1.6, radius: 4.5, flicker: 0.4 });
}
// a rack of three fishing rods (local: along x), leaning back on a rail, with reels and a coil of line
function rodRack(B) {
  for (const sx of [-1, 1]) { const p = G.beam(0.09, 1.25, 0.09); p.translate(sx * 0.45, 0.62, 0); B.add(p, WOOD_D); const f = G.box(0.22, 0.06, 0.32, 0.02); f.translate(sx * 0.45, 0.03, 0); B.add(f, WOOD_DD); }
  for (const y of [0.25, 1.05]) { const r = G.beam(1.05, 0.08, 0.08); r.translate(0, y, -0.02); B.add(r, WOOD); }
  [-0.26, 0.02, 0.3].forEach((x, i) => {
    const a = V(x, 0.12, 0.12), b = V(x + 0.05, 1.95 + i * 0.12, -0.12);
    B.add(tube([{ p: a, r: 0.025 }, { p: a.clone().lerp(b, 0.35), r: 0.018 }, { p: b, r: 0.009 }], 5, true), ['#c8a46a', '#8a5a3a', '#d8b878'][i]);
    const grip = G.cyl(0.035, 0.035, 0.3, 6); grip.translate(x, 0.32, 0.1); B.add(grip, '#5a3a2a');
    const reel = G.cyl(0.06, 0.06, 0.06, 10); reel.rotateZ(PI / 2); reel.translate(x + 0.06, 0.5, 0.11); B.add(reel, i === 1 ? '#3fa8a8' : '#b8b8c8');
  });
}
// a bait bucket: wooden staves, a rope handle, a few bait balls on top
function baitBucket(B) {
  barrel(B, { r: 0.17, h: 0.3, wood: '#b9824e', lid: false });
  const w = G.cyl(0.15, 0.15, 0.03, 10); w.translate(0, 0.26, 0); B.add(w, '#3a5a6a');
  for (let i = 0; i < 4; i++) { const b = G.sph(0.03, 5, 4); b.translate(Math.cos(i * 1.7) * 0.07, 0.29, Math.sin(i * 1.7) * 0.07); B.add(b, '#a86a4a'); }
  const h = G.torus(0.16, 0.015, 4, 12, PI); h.translate(0, 0.3, 0); B.add(h, ROPE);
}
// a sleepy orange tabby curled on her crate (local: the crate's top at 0, her nose toward +x): a plump curled body
// (its own still part, so it can breathe), the head tucked on her paws with closed eyes, ears, white muzzle and paws,
// tabby stripes, and the tail curled round the front (its own part, so it can flick)
function catModel(B) {
  const OR = new THREE.Color('#eaa05a'), ST = new THREE.Color('#b8602a'), WH = new THREE.Color('#fbf0e0');
  const tabby = (p, n, o) => { o.copy(OR).lerp(new THREE.Color('#f6c48a'), clamp(-n.y * 0.8)); if (Math.sin(p.x * 30 + Math.sin(p.z * 9) * 1.2) > 0.3 && n.y > -0.2) o.lerp(ST, 0.8); };
  B.anim({ p: [0, 0, 0], kind: 'bob', amp: 0, speed: 0 }, () => {
    const body = G.sph(0.2, 14, 10); body.scale(1.2, 0.6, 0.95); body.translate(-0.02, 0.12, 0); B.add(body, tabby);
    const haunch = G.sph(0.13, 10, 7); haunch.scale(1, 0.75, 1); haunch.translate(-0.13, 0.13, -0.06); B.add(haunch, tabby);
    const head = G.sph(0.115, 12, 9); head.scale(1.05, 0.9, 1.0); head.translate(0.2, 0.16, 0.06); B.add(head, tabby);
    const muz = G.sph(0.055, 9, 6); muz.scale(1.1, 0.75, 1); muz.translate(0.29, 0.13, 0.08); B.add(muz, WH);
    const nose = G.sph(0.018, 6, 4); nose.translate(0.335, 0.15, 0.085); B.add(nose, '#e88a8a');
    for (const s of [-1, 1]) {
      const ear = G.cone(0.05, 0.09, 6); ear.rotateZ(-0.35); ear.rotateX(s * 0.35); ear.translate(0.19, 0.27, 0.06 + s * 0.065); B.add(ear, (p, n, o) => o.copy(OR).lerp(new THREE.Color('#f0a0a0'), n.x > 0.3 ? 0.6 : 0));
      const eye = G.torus(0.024, 0.007, 3, 8, PI); eye.rotateZ(PI); eye.rotateY(PI / 2 - s * 0.25); eye.translate(0.296, 0.19, 0.06 + s * 0.045); B.add(eye, '#4a3028'); // (closed, content)
      const paw = G.sph(0.045, 8, 5); paw.scale(1.4, 0.6, 1); paw.translate(0.27, 0.035, 0.08 + s * 0.06); B.add(paw, WH);
    }
  });
  // the tail: from her rump round her front (pivot at its root)
  B.anim({ p: [-0.24, 0.06, 0.02], kind: 'bob', amp: 0, speed: 0 }, () => {
    const pts = []; for (let i = 0; i <= 8; i++) { const a = i / 8 * PI * 0.95; pts.push({ p: V(0.24 - Math.cos(a) * 0.24, 0.0 + Math.sin(i / 8 * PI) * 0.02, Math.sin(a) * 0.2), r: 0.042 - i * 0.002 }); }
    B.add(tube(pts, 7, true), (p, n, o) => { const k = Math.floor((Math.atan2(p.z, p.x - 0.24) + PI) * 2.2) % 2; o.copy(k ? OR : ST); if (p.x > 0.4 && p.z > 0.1) o.copy(ST); });
  });
}
