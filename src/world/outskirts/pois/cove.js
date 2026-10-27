// Driftwood Cove (ROADMAP HP-1; the concept: tools/blender/work/codex/hollow-pois/concepts/poi-10-cove.png): a sandy
// cove on the south shore (the trail runs into packed sand) where a little hut is roofed with an upturned old boat
// (cream and teal plank bands, a raised keel, rounded gunwales) over a planked hut with an arched teal door and a
// round window, a lantern swinging by it and shell wind chimes; a bonfire ring of round stones with crossed logs and
// flickering flames (a warm LightPool light at night, a soft glow, a curl of smoke), two driftwood log seats, a
// hammock strung between two coastal pines that sways, a driftwood fence, firewood, a bucket, mossy shore rocks.
//   Rest by the fire: sit on a log (life and zoom back to full; at night Shadow says something cozy, once).
//   Lie in the hammock: it sways with you.
import * as THREE from 'three';
import { G, V, PI } from '../../buildings/kit.js';
import { blossomGeo, nz, woodStack, bush } from '../../buildings/props.js';
import { tube } from '../../../gfx/geom.js';
import { glowTexture } from '../../../gfx/textures.js';
import { clamp, TAU, damp } from '../../../core/util.js';
import { frame, boulder, waterline, cloudPine, sandPatch, foamRings, seaPink, grassTuft, ropeWrap, TIMBER, TIMBER_D, ROPE } from './_east.js';

// the layout in the place's camera frame (local x = screen right, local z = toward the camera); the sea is on the
// left, the trail runs down the right
const HUT = { x: 0.2, z: -0.6, a: 0.06 };
const FIRE = { x: 0.75, z: 2.55 };
const LOGS = [{ x: -0.95, z: 3.55 }, { x: 2.5, z: 3.6 }];
const PINES = [{ x: 2.05, z: -3.2, dir: 2.6 }, { x: 3.45, z: -0.6, dir: -0.4 }];
const DRIFT = '#b8a07e', DRIFT_D = '#8c7658', DRIFT_HI = '#dccaa6';
const CREAM = '#ece2c6', TEAL = '#6fa6a2', TEAL_D = '#4f8783';

export function build(ctx) {
  const F = frame(ctx), rnd = ctx.rand, gy = (x, z) => F.h(x, z);
  // ---- the sand: the beach widened up to and across the trail (it runs into packed sand here)
  sandPatch(ctx, F, (x, z) => {
    const dx = (x - 1.9) / 5.7, dz = (z + 0.1) / 6.6, a = Math.atan2(dz, dx);
    const q = Math.hypot(dx, dz) * (1 + 0.07 * Math.sin(a * 3 + 1) + 0.05 * Math.sin(a * 7 + 2));
    return clamp((1 - q) / 0.16);
  }, { x0: -4.2, x1: 8.2, z0: -7.2, z1: 7.0 });

  const pines = [];
  const kit = ctx.kit(1010, B => {
    // ---- the boat hut
    B.at([HUT.x, 0, HUT.z], HUT.a, () => hut(B, F, rnd));
    // ---- the bonfire, the log seats, the firewood, the bucket
    B.at([FIRE.x, gy(FIRE.x, FIRE.z), FIRE.z], 0, () => bonfire(B, rnd));
    for (const L of LOGS) {
      const a = Math.atan2(L.x - FIRE.x, L.z - FIRE.z); // (its length along the ring's tangent)
      B.at([L.x, gy(L.x, L.z) - 0.05, L.z], a, () => driftLog(B, rnd, { L: 1.7, r: 0.21 }));
    }
    B.at([1.75, gy(1.75, 0.75), 0.75], 0.1, () => woodStack(B, { w: 0.75, h: 0.5, d: 0.42 }));
    B.at([-1.05, gy(-1.05, 0.7), 0.7], 0, () => bucket(B));
    // ---- the coastal pines and the hammock between them
    for (const p of PINES) B.at([p.x, gy(p.x, p.z) - 0.06, p.z], 0, () => pines.push({ ...p, y: gy(p.x, p.z) - 0.06, ...cloudPine(B, rnd, { s: 3.1, pad: 1.75, padFrom: 0.64, lean: 0.1, dir: p.dir, pads: 4 }) }));
    // ---- a driftwood fence along the trail's edge below the fire
    driftFence(B, [[2.85, 4.7], [2.98, 5.55], [2.82, 6.4]], gy, F, rnd);
    // ---- mossy rocks along the shore, their feet in the surf, and a few under the water
    const foam = [];
    const rocks = [[-2.7, -1.6, 0.95], [-3.4, 1.0, 1.1], [-2.6, 3.9, 0.85], [-3.9, -3.3, 0.8], [-1.9, -4.4, 0.6], [-3.1, 5.6, 0.75], [-4.5, 2.6, 0.6, 1], [-4.2, -0.6, 0.55, 1], [-2.0, 6.6, 0.5, 1]];
    for (const [x, z, r, under] of rocks) {
      const bed = gy(x, z) + F.y0, y = under ? bed + r * 0.1 : Math.max(bed + r * 0.3, -r * 0.45);
      const b = boulder(B, x, y - F.y0, z, r, { sq: under ? 0.5 : 0.88, moss: under ? 0.2 : 0.55, seed: Math.round(x * 17 + z * 5), yaw: rnd() * TAU, stretch: 1.15, detail: r > 0.8 ? 3 : 2, noise: 0.12 });
      if (!under) { b.y = y; const wr = waterline(b); if (wr > 0.05) { const [wx, wz] = F.W(x, z); foam.push({ x: wx, z: wz, r: wr, w: 0.4 + r * 0.15, sx: 1.15, sz: 1 / Math.sqrt(1.15), yaw: F.yaw + b.yaw, ph: rnd() * TAU }); } if (bed > 0.1) F.solid(x, z, r * 0.85, 'a shore rock'); }
    }
    foamRings(ctx, foam);
    // ---- dune grass, sea pinks and little flowers round the edges of the sand, pebbles on it
    for (const [x, z] of [[-1.7, -3.0], [1.9, -3.4], [-0.9, -3.6], [2.9, 0.6], [3.0, -2.4], [-1.6, 0.6], [2.95, 3.0], [-0.6, 4.6], [1.9, 5.6], [3.6, -0.3], [3.1, 2.4], [-2.0, 2.8]]) grassTuft(B, x, gy(x, z), z, rnd, { n: 8, h: 0.42, color: '#88b04e' });
    for (const [x, z] of [[-1.5, -2.6], [2.5, -3.0], [3.2, 0.1], [1.3, -3.3], [-0.2, 4.2], [2.6, 5.0], [3.2, 3.7]]) seaPink(B, x, gy(x, z), z, rnd, { n: 4, color: rnd() < 0.4 ? '#ffffff' : '#eca5b9' });
    for (const [x, z, r] of [[-1.9, -3.7, 0.34], [2.8, -3.3, 0.3]]) { B.at([x, gy(x, z), z], rnd() * TAU, () => bush(B, { r, color: '#5a9a44', flowers: ['#eca5b9', '#ffffff'], n: 2 })); F.solid(x, z, r * 0.8, 'a shrub'); }
    for (let i = 0; i < 26; i++) {
      const x = -1.6 + rnd() * 5.0, z = -2.8 + rnd() * 9.0;
      if (Math.hypot(x - FIRE.x, z - FIRE.z) < 1.0 || (Math.abs(x - HUT.x) < 1.9 && Math.abs(z - HUT.z) < 1.4)) continue;
      const pb = G.ico(0.035 + rnd() * 0.04, 0); pb.scale(1.3, 0.55, 1); pb.translate(x, gy(x, z) + 0.01, z); B.add(pb, rnd() < 0.5 ? '#a8a0a8' : '#c8bcb0');
    }
  }, { yaw: F.yaw });

  // the hut, the fire, the logs, the pines: colliders
  for (const dx of [-1.0, 0, 1.0]) F.solid(HUT.x + dx, HUT.z, 1.05, 'the hut');
  F.solid(FIRE.x, FIRE.z, 0.72, 'the fire ring');
  for (const L of LOGS) { const a = Math.atan2(L.x - FIRE.x, L.z - FIRE.z); for (const t of [-0.55, 0, 0.55]) F.solid(L.x + Math.cos(a) * t, L.z - Math.sin(a) * t, 0.24, 'a log'); }
  for (const p of PINES) F.solid(p.x, p.z, 0.36, 'a pine');
  F.solid(1.75, 0.75, 0.4, 'the firewood'); F.solid(-1.05, 0.7, 0.2, 'the bucket');

  // ---- the hammock: cloth slung from rope to rope between the two pines; a slow sway (more with someone in it)
  const [A, Bp] = pines.map(p => { const t = 1.18 / (1.25 * 3.1), q = p.trunkAt(t); return V(p.x + q.x, p.y + q.y, p.z + q.z); });
  const ax = Bp.clone().sub(A).normalize();
  const mid = A.clone().add(Bp).multiplyScalar(0.5);
  const hk = ctx.kit(1011, B => {
    B.anim({ p: [mid.x, mid.y, mid.z], kind: 'swing', axis: [ax.x, 0, ax.z], speed: 0.9, amp: 0.035 }, () => hammock(B, A.clone().sub(mid), Bp.clone().sub(mid)));
    for (const P of [A, Bp]) ropeWrap(B, P.x, P.y, P.z, 3.1 * (0.11 - 0.3 * 0.065) + 0.01, 2);
  }, { yaw: F.yaw });
  const ham = hk.parts[0];
  const hamLow = mid.y - 0.62; // (its belly, local y)

  // ---- the fire's glow (a soft halo that warms up at night) and its curl of smoke
  const fireW = F.W(FIRE.x, FIRE.z), fireY = ctx.H(...fireW);
  let halo = null;
  if (typeof document !== 'undefined') {
    halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffa860', transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    halo.scale.set(2.4, 2.4, 1); halo.position.set(fireW[0], fireY + 0.55, fireW[1]); halo.renderOrder = 5; ctx.add(halo);
  }

  // ---- resting by the fire, lying in the hammock
  const seat = (L) => {
    const a = Math.atan2(L.x - FIRE.x, L.z - FIRE.z), back = 0.04;
    const toFire = Math.atan2(FIRE.x - L.x, FIRE.z - L.z);
    const lx = L.x - Math.sin(toFire) * back, lz = L.z - Math.cos(toFire) * back;
    return { w: F.W(lx, lz), y: ctx.H(...F.W(lx, lz)) - 0.04, face: F.face(toFire), a };
  };
  for (const L of LOGS) {
    const s = seat(L), front = F.W(L.x + (FIRE.x - L.x) * 0.38, L.z + (FIRE.z - L.z) * 0.38);
    ctx.interact({
      x: front[0], z: front[1], r: 1.15, label: 'Rest by the fire',
      onInteract: () => {
        const ok = ctx.sit({ x: s.w[0], z: s.w[1], y: s.y, face: s.face, dur: 9, onDone: rested => { if (rested) ctx.rest(); } });
        if (ok && ctx.night() > 0.5) { ctx.say('The fire\'s all crackly and warm. This is the best spot on the whole island.', { once: 'nightfire' }); }
      },
    });
  }
  const perp = V(-ax.z, 0, ax.x).multiplyScalar(ax.x >= 0 ? 1 : -1); // (across the cloth, toward the camera and the fire)
  const hamFace = Math.atan2(perp.x, perp.z);
  const hw = F.W(mid.x, mid.z), hamW = V(hw[0], 0, hw[1]);
  const hamY = F.y0 + hamLow - 0.38;
  const hamFront = F.W(mid.x + perp.x * 0.75, mid.z + perp.z * 0.75);
  let inHam = null;
  ctx.interact({
    x: hamFront[0], z: hamFront[1], r: 1.2, label: 'Lie in the hammock',
    onInteract: () => {
      const s = ctx.sit({ x: hamW.x, z: hamW.z, y: hamY, face: F.face(hamFace), dur: 12, onDone: rested => { inHam = null; if (rested) ctx.rest(); } });
      if (s) { inHam = s; ctx.say('Swing, swing... I could nap here all day.', { once: 'hammock' }); }
    },
  });

  // ---- per frame: the sway (bigger with you in it, and you sway with it), the halo, the smoke
  let smokeT = 0;
  const side = new THREE.Vector3(-ax.z, 0, ax.x).applyAxisAngle(V(0, 1, 0), F.yaw);
  return {
    update(dt, t, night) {
      const a = ham.a, want = inHam ? 0.13 : 0.035;
      a.amp = damp(a.amp, want, 1.5, dt);
      if (inHam) {
        const P = ctx.G.player, k = Math.sin(t * a.speed + a.phase) * a.amp, drop = mid.y - hamLow;
        if (P) { P.pos.x = hamW.x + side.x * k * drop; P.pos.z = hamW.z + side.z * k * drop; P.pos.y = hamY + (1 - Math.cos(k)) * drop; }
      }
      if (halo) { halo.material.opacity = 0.06 + 0.24 * night + Math.sin(t * 9.1) * 0.015 + Math.sin(t * 23.0) * 0.01; const s = 2.2 + Math.sin(t * 5.3) * 0.08; halo.scale.set(s, s, 1); }
      smokeT -= dt;
      const vfx = ctx.G.vfx;
      if (smokeT <= 0 && vfx?.smoke) {
        smokeT = 0.55 + Math.random() * 0.35;
        vfx.smoke.spawn({ x: fireW[0] + (Math.random() - 0.5) * 0.2, y: fireY + 0.75, z: fireW[1] + (Math.random() - 0.5) * 0.2, vx: 0.06 + Math.random() * 0.08, vy: 0.45 + Math.random() * 0.2, vz: -0.04, life: 2.6, size: 0.22, size1: 0.75, color: '#ddd4cc', alpha: 0.2, alpha1: 0, drag: 0.4, spin: (Math.random() - 0.5) });
      }
    },
  };
}

// ---- the boat hut, facing +z: a plank floor on stilts (the beach falls away to the sea on the left), planked walls
// with stout corner posts lashed with rope, an arched teal door with a round window, a threshold and a plank mat, a
// lantern on a bracket (it swings), and the upturned boat for a roof, shell chimes hanging from its gunwale
function hut(B, F, rnd) {
  const LW = 2.6, D = 2.1, WH = 1.62;
  // the frame's ground under the hut, in the hut's own frame (HUT is at y 0 here: heights are absolute to the place)
  const toPlace = (x, z) => { const c = Math.cos(HUT.a), s = Math.sin(HUT.a); return [HUT.x + x * c + z * s, HUT.z - x * s + z * c]; };
  const g = (x, z) => F.h(...toPlace(x, z));
  const fl = Math.max(g(0, D / 2 + 0.3), g(0, 0)) + 0.12; // (the floor: just above the sand at the door)
  // floor deck and stilts
  for (let i = 0; i < 7; i++) { const p = G.box(LW + 0.3, 0.08, (D + 0.3) / 7 - 0.02, 0.02); p.translate(0, fl, -(D + 0.3) / 2 + (i + 0.5) * (D + 0.3) / 7); B.add(p, (pp, n, o) => o.set(i % 2 ? DRIFT : '#c4ab86').multiplyScalar(n.y > 0.5 ? 1 : 0.75)); }
  for (const x of [-LW / 2, 0, LW / 2]) for (const z of [-D / 2, D / 2]) {
    const y0 = g(x, z) - 0.15, h = fl - y0;
    if (h > 0.05) { const st = G.cyl(0.08, 0.09, h, 8); st.translate(x, y0 + h / 2, z); B.add(st, TIMBER_D); }
  }
  // walls: vertical planks, the corner posts, a beam under the eaves
  const plank = (w, h, tone) => (p, n, o) => o.set(tone).multiplyScalar((n.z > 0.5 || n.x > 0.5 || n.x < -0.5 || n.z < -0.5 ? 1 : 0.8) * (0.94 + 0.08 * nz(p.x * 3, p.y * 7)));
  const tones = ['#a37a4c', '#8e6a42', '#b08656', '#977148'];
  for (const [side, len, ry] of [[D / 2, LW, 0], [D / 2, LW, PI], [LW / 2, D, PI / 2], [LW / 2, D, -PI / 2]]) B.at([0, 0, 0], ry, () => {
    const n = Math.round(len / 0.21);
    for (let i = 0; i < n; i++) { const w = len / n, p = G.box(w - 0.015, WH, 0.07, 0.02); p.translate(-len / 2 + (i + 0.5) * w, fl + WH / 2, side - 0.035); B.add(p, plank(w, WH, tones[(i * 3 + Math.round(side * 7)) % 4])); }
  });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * LW / 2, z = sz * D / 2, y0 = Math.min(fl, g(x, z)) - 0.1, h = fl + WH + 0.05 - y0;
    const p = G.cyl(0.11, 0.12, h, 9); p.translate(x, y0 + h / 2, z); B.add(p, (pp, n, o) => o.set(TIMBER_D).multiplyScalar(0.9 + 0.1 * nz(pp.y * 5, x)));
    ropeWrap(B, x, fl + 0.35, z, 0.115, 3); ropeWrap(B, x, fl + WH - 0.25, z, 0.115, 2);
  }
  const eave = G.box(LW + 0.1, 0.12, 0.12, 0.03); eave.translate(0, fl + WH - 0.02, D / 2 + 0.02); B.add(eave, TIMBER_D);
  // the door: an arched teal panel of planks in a chunky frame, a round window glowing at night, a ring handle
  const DW = 0.8, DH = 1.34, zf = D / 2 + 0.01;
  const arch = new THREE.Shape(); arch.moveTo(-DW / 2, 0); arch.lineTo(DW / 2, 0); arch.lineTo(DW / 2, DH - DW / 2); arch.absarc(0, DH - DW / 2, DW / 2, 0, PI, false); arch.lineTo(-DW / 2, 0);
  const door = new THREE.ExtrudeGeometry(arch, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1, curveSegments: 10 });
  door.translate(0, fl + 0.04, zf);
  B.add(door, (p, n, o) => { const band = Math.abs(((p.x + 0.6) / 0.205) % 1 - 0.5) > 0.44; o.set(TEAL).multiplyScalar((n.z > 0.5 ? 1 : 0.8) * (band ? 0.78 : 1) * (0.95 + 0.06 * nz(p.x * 6, p.y * 6))); });
  const fr = new THREE.Shape(); fr.moveTo(-DW / 2 - 0.1, 0); fr.lineTo(DW / 2 + 0.1, 0); fr.lineTo(DW / 2 + 0.1, DH - DW / 2); fr.absarc(0, DH - DW / 2, DW / 2 + 0.1, 0, PI, false); fr.lineTo(-DW / 2 - 0.1, 0);
  const hole = new THREE.Path(); hole.moveTo(-DW / 2, 0); hole.lineTo(-DW / 2, DH - DW / 2); hole.absarc(0, DH - DW / 2, DW / 2, PI, 0, true); hole.lineTo(DW / 2, 0); hole.lineTo(-DW / 2, 0); fr.holes.push(hole);
  const frame2 = new THREE.ExtrudeGeometry(fr, { depth: 0.09, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1, curveSegments: 10 });
  frame2.translate(0, fl + 0.02, zf - 0.02); B.add(frame2, (p, n, o) => o.set('#8a6440').multiplyScalar(n.z > 0.5 ? 1.05 : 0.8));
  const wy = fl + 0.04 + DH - 0.42, ring = G.torus(0.17, 0.045, 6, 16); ring.translate(0, wy, zf + 0.1); B.add(ring, '#b8873c');
  const glass = G.disc(0.16, 16); glass.translate(0, wy, zf + 0.082); B.glow(glass, '#ffd898', { flicker: 0.4 });
  for (const r of [0, PI / 2]) { const bar = G.box(0.31, 0.022, 0.02, 0); bar.rotateZ(r); bar.translate(0, wy, zf + 0.095); B.add(bar, '#8a6440'); }
  const knob = G.sph(0.04, 8, 5); knob.translate(DW / 2 - 0.13, fl + 0.72, zf + 0.1); B.add(knob, '#d8a24a');
  const thr = G.box(DW + 0.3, 0.07, 0.24, 0.02); thr.translate(0, fl + 0.02, zf + 0.12); B.add(thr, TIMBER);
  // a plank mat and a step down to the sand
  for (let i = 0; i < 3; i++) { const z = D / 2 + 0.4 + i * 0.21, p = G.box(1.05, 0.06, 0.2, 0.02); p.rotateY((rnd() - 0.5) * 0.08); p.translate((rnd() - 0.5) * 0.06, g(0, z) + 0.025, z); B.add(p, i % 2 ? '#c4ab86' : DRIFT); }
  const mat = G.box(0.62, 0.02, 0.36, 0.01); mat.translate(0, fl + 0.065, zf + 0.12); B.add(mat, (p, n, o) => o.set('#c8a872').multiplyScalar(0.9 + 0.12 * (Math.sin(p.x * 60) > 0 ? 1 : 0)));
  // the lantern on its bracket, left of the door (it swings)
  const lx = -DW / 2 - 0.42, ly = fl + 1.42;
  const br = G.box(0.05, 0.05, 0.36, 0.01); br.translate(lx, ly + 0.08, zf + 0.18); B.add(br, TIMBER_D);
  const brace = G.box(0.035, 0.3, 0.035, 0); brace.rotateX(0.7); brace.translate(lx, ly - 0.05, zf + 0.09); B.add(brace, TIMBER_D);
  B.anim({ p: [lx, ly + 0.06, zf + 0.33], kind: 'swing', axis: [1, 0, 0], speed: 1.7, amp: 0.07 }, () => {
    const cord = G.cyl(0.008, 0.008, 0.08, 4); cord.translate(0, -0.04, 0); B.add(cord, '#3a3030');
    const top = G.cyl(0.045, 0.1, 0.06, 4); top.rotateY(PI / 4); top.translate(0, -0.11, 0); B.add(top, '#3e3a38');
    const ringT = G.torus(0.025, 0.007, 3, 8); ringT.translate(0, -0.075, 0); B.add(ringT, '#3e3a38');
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const p = G.box(0.018, 0.2, 0.018, 0); p.translate(sx * 0.065, -0.24, sz * 0.065); B.add(p, '#3e3a38'); }
    const pane = G.box(0.12, 0.17, 0.12, 0.01); pane.translate(0, -0.24, 0); B.glow(pane, '#ffd890', { flicker: 0.6 });
    const bot = G.box(0.16, 0.03, 0.16, 0.01); bot.translate(0, -0.35, 0); B.add(bot, '#3e3a38');
  });
  B.light([lx, ly - 0.2, zf + 0.33], { color: '#ffc27a', intensity: 1.4, radius: 3.6, flicker: 0.5 });
  // the roof: the upturned boat
  B.at([0, fl + WH - 0.02, 0], 0, () => boatHull(B, { L: 3.5, W: 2.7, H: 0.82 }));
  // shell wind chimes hanging from the gunwale right of the door
  const cx = DW / 2 + 0.5, cz = 2.7 / 2 * Math.pow(1 - (cx / 1.75) ** 2, 0.38) - 0.04;
  B.anim({ p: [cx, fl + WH - 0.05, cz], kind: 'swing', axis: [1, 0, 0.3], speed: 1.25, amp: 0.12 }, () => chimes(B, rnd));
}

// the upturned boat: the hull (length along x, the keel on top) of cream and teal plank bands with dark seams, a
// darker inside under the eaves, a raised keel running out past the stems, rounded gunwales. Its gunwale sits at y 0.
function boatHull(B, { L = 3.5, W = 2.7, H = 0.95 } = {}) {
  const n = 26, m = 18;
  const wAt = s => W / 2 * Math.pow(Math.max(0, 1 - s * s), 0.38), hAt = s => H * (0.82 + 0.18 * Math.sqrt(Math.max(0, 1 - s * s))), sheer = s => 0.16 * s * s;
  const P = (s, f, k = 1) => V(s * L / 2 * (k < 1 ? 0.985 : 1), sheer(s) + hAt(s) * Math.sin(f) * k, wAt(s) * Math.cos(f) * k);
  const grid = (k, flip, paintFn) => {
    const pos = [], idx = [];
    for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) { const p = P(-1 + 2 * i / n, j / m * PI, k); pos.push(p.x, p.y, p.z); }
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { const a = i * (m + 1) + j, b = a + m + 1; if (flip) idx.push(a, a + 1, b, b, a + 1, b + 1); else idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    // (make the outside face out: compare with the direction from the hull's centre line)
    const nn = g.attributes.normal; let dot = 0; for (let i = 0; i < nn.count; i++) { dot += nn.getY(i) * pos[i * 3 + 1] + nn.getZ(i) * pos[i * 3 + 2]; }
    if ((dot > 0) === flip) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
    B.add(g, paintFn);
  };
  const cr = new THREE.Color(CREAM), te = new THREE.Color(TEAL), seam = new THREE.Color('#5a4a3c');
  grid(1, false, (p, nn, o) => {
    const f = Math.atan2(p.y - sheer(2 * p.x / L), p.z / Math.max(0.05, wAt(2 * p.x / L))) / PI; // 0..1 from the front gunwale over the keel
    const bands = f * 9, b = Math.floor(bands), fr = bands - b;
    o.copy(b === 0 || b === 8 || b === 4 ? te : b === 2 || b === 6 ? te.clone().lerp(cr, 0.15) : cr);
    if (fr < 0.08 || fr > 0.92) o.lerp(seam, 0.55);
    o.multiplyScalar(0.92 + 0.08 * clamp(nn.y) + 0.05 * nz(p.x * 4, f * 20));
  });
  grid(0.95, true, (p, nn, o) => o.set('#6e5440').multiplyScalar(0.8 + 0.15 * nz(p.x * 5, p.y * 5)));
  // the gunwales (a rounded rim each side) and the keel, running out past the stems and curving down
  for (const f of [0, PI]) { const pts = []; for (let i = 0; i <= 20; i++) { const s = -1 + 2 * i / 20; pts.push({ p: P(s, f).add(V(0, 0.0, f ? -0.015 : 0.015)), r: 0.06 }); } B.add(tube(pts, 7, false), '#8a6440'); }
  const keel = []; for (let i = 0; i <= 22; i++) { const s = -1.06 + 2.12 * i / 22, e = Math.min(1, Math.abs(s)); keel.push({ p: V(s * L / 2, sheer(e) + hAt(Math.min(0.999, e)) + 0.06 - Math.max(0, Math.abs(s) - 0.96) * 2.2, 0), r: 0.075 }); }
  B.add(tube(keel, 7, true), (p, nn, o) => o.set('#7a5638').multiplyScalar(0.9 + 0.15 * clamp(nn.y)));
  // the stems (bow and stern posts)
  for (const sx of [-1, 1]) { const st = tube([0, 1, 2, 3, 4].map(k => ({ p: V(sx * (L / 2 + 0.02), 0.95 * k / 4 * (0.82 + 0.18 * 0) + sheer(1) - 0.04, 0), r: 0.06 })), 6, true); B.add(st, '#7a5638'); }
}
// shell chimes: a little driftwood hanger, five cords, cream shells (scallops and a spiral) down each
function chimes(B, rnd) {
  const hg = G.cyl(0.02, 0.02, 0.42, 6); hg.rotateZ(PI / 2); hg.translate(0, -0.12, 0); B.add(hg, DRIFT);
  const top = G.cyl(0.006, 0.006, 0.12, 3); top.translate(0, -0.06, 0); B.add(top, '#5a4a3c');
  for (let k = 0; k < 5; k++) {
    const x = -0.17 + k * 0.085, L = 0.32 + rnd() * 0.28;
    const c = G.cyl(0.004, 0.004, L, 3); c.translate(x, -0.12 - L / 2, 0); B.add(c, '#e8dcc0');
    for (let j = 0; j < 2 + (k % 2); j++) {
      const y = -0.12 - L * (0.35 + j * 0.3), sh = j === 1 && k === 2 ? G.cone(0.035, 0.09, 7) : blossomGeo(0.045, 7, 0.75, false, 2);
      if (sh.type === 'ConeGeometry') sh.rotateZ(PI); else { sh.rotateX(PI / 2); }
      sh.rotateY(rnd() * TAU); sh.translate(x, y, 0);
      B.add(sh, (p, n, o) => o.set('#f4ead6').lerp(new THREE.Color('#e8b8a8'), clamp(0.3 + 0.3 * Math.sin(p.x * 140 + p.y * 90))));
    }
  }
}
// the bonfire: a ring of round stones, an ember bed, crossed logs and three tongues of flame (each sways on its own)
// round a bright core; the warm light at night
function bonfire(B, rnd) {
  for (let k = 0; k < 10; k++) {
    const a = k / 10 * TAU + rnd() * 0.2, r = 0.2 + rnd() * 0.07;
    boulder(B, Math.cos(a) * 0.72, r * 0.25, Math.sin(a) * 0.72, r, { sq: 0.78, moss: k % 3 === 0 ? 0.35 : 0, seed: 200 + k, yaw: a, detail: 1, noise: 0.15, stretch: 1.2 });
  }
  const bed = G.cyl(0.58, 0.62, 0.06, 14); bed.translate(0, 0.02, 0); B.add(bed, (p, n, o) => o.set('#3e2e28').lerp(new THREE.Color('#6a4a38'), clamp(nz(p.x * 9, p.z * 9) + 0.2)));
  for (let k = 0; k < 7; k++) { const e = G.ico(0.04 + rnd() * 0.03, 0); e.translate((rnd() - 0.5) * 0.6, 0.06, (rnd() - 0.5) * 0.6); B.glow(e, '#ff7a2a', { flicker: 1, tint: 1, hot: true }); }
  for (let k = 0; k < 4; k++) {
    const a = k / 4 * TAU + 0.4, lg = G.cyl(0.065, 0.075, 0.8, 7); lg.rotateZ(0.95); lg.rotateY(-a); lg.translate(Math.cos(a) * 0.17, 0.24, Math.sin(a) * 0.17);
    B.add(lg, (p, n, o) => o.set('#7a5034').lerp(new THREE.Color('#2a1c16'), clamp(0.6 - p.y * 2.5)));
  }
  // a tongue of flame: a wavy teardrop card, crossed with itself three ways and two-faced
  const flame = (h, r) => {
    const sh = new THREE.Shape(), N = 9; sh.moveTo(0, 0);
    for (let i = 1; i <= N; i++) { const t = i / N, w = r * Math.sin(Math.min(1, t * 1.6) * PI * 0.5) * (1 - t) ** 0.8 * 1.5; sh.lineTo(w + Math.sin(t * 9) * r * 0.12, t * h * (1 - 0.06 * Math.sin(t * 7))); }
    sh.lineTo(Math.sin(2.3) * r * 0.1, h);
    for (let i = N; i >= 1; i--) { const t = i / N, w = r * Math.sin(Math.min(1, t * 1.6) * PI * 0.5) * (1 - t) ** 0.8 * 1.5; sh.lineTo(-w + Math.sin(t * 8 + 1) * r * 0.12, t * h * (1 - 0.05 * Math.cos(t * 6))); }
    const base = new THREE.ShapeGeometry(sh, 1), parts = [];
    for (let k = 0; k < 3; k++) for (const f of [0, PI]) { const c = base.clone(); c.rotateY(k * PI / 3 + f); parts.push(c.index ? c.toNonIndexed() : c); }
    const g = new THREE.BufferGeometry(), arr = []; for (const c of parts) arr.push(...c.attributes.position.array);
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); g.computeVertexNormals();
    return g;
  };
  const tongues = [[0, 0, 0.78, 0.2, 3.1], [0.12, 0.06, 0.52, 0.14, 4.3], [-0.11, -0.07, 0.56, 0.14, 3.7], [0.02, -0.12, 0.44, 0.12, 5.1]];
  tongues.forEach(([x, z, h, r, sp], i) => {
    B.anim({ p: [x, 0.08, z], kind: 'swing', axis: [i === 1 ? 1 : 0, 0, i === 1 ? 0 : 1], speed: sp, amp: 0.1 }, () => {
      B.glow(flame(h, r), (p, n, o) => o.set('#ff6a20').lerp(new THREE.Color('#ffd25a'), clamp(p.y / h * 1.3)), { flicker: 1, tint: 1, hot: true });
    });
  });
  B.anim({ p: [0, 0.08, 0], kind: 'bob', speed: 6.3, amp: 0.025 }, () => { const core = flame(0.46, 0.11); B.glow(core, '#fff0b0', { flicker: 1, tint: 1, hot: true }); });
  B.light([0, 0.75, 0], { color: '#ffa04a', intensity: 2.6, radius: 6.5, flicker: 0.8 });
}
// a driftwood log seat along x: a pale silvery trunk, knobbly, a little bent, grooved along its length, ringed ends
// and a stub of a branch
function driftLog(B, rnd, { L = 1.7, r = 0.21 } = {}) {
  const pts = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10, x = -L / 2 + t * L; pts.push({ p: V(x, r + Math.sin(t * PI) * 0.04, Math.sin(t * 2.3 + 1) * 0.04), r: r * (0.92 + 0.12 * Math.sin(t * 9 + 1.3) * Math.sin(t * 4)) * (t < 0.05 || t > 0.95 ? 0.97 : 1) }); }
  const g = tube(pts, 10, false);
  B.add(g, (p, n, o) => { const ang = Math.atan2(n.z, n.y); o.set(DRIFT).lerp(new THREE.Color(DRIFT_D), clamp(0.5 + 0.5 * Math.sin(ang * 7 + p.x * 3))).lerp(new THREE.Color(DRIFT_HI), clamp(n.y) * 0.35); });
  for (const sx of [-1, 1]) {
    const q = pts[sx < 0 ? 0 : 10], cap = G.cyl(q.r, q.r, 0.02, 12); cap.rotateZ(PI / 2); cap.translate(q.p.x + sx * 0.005, q.p.y, q.p.z);
    B.add(cap, (p, n, o) => { const d = Math.hypot(p.y - q.p.y, p.z - q.p.z) / q.r; o.set(DRIFT_HI).lerp(new THREE.Color('#a88e6c'), Math.abs(Math.sin(d * 9)) * 0.45 + (d > 0.85 ? 0.4 : 0)); });
  }
  const stub = tube([{ p: V(0.35, r * 1.7, 0.05), r: 0.06 }, { p: V(0.45, r * 2.05, 0.14), r: 0.045 }, { p: V(0.5, r * 2.2, 0.22), r: 0.03 }], 6, true);
  B.add(stub, DRIFT);
}
// a small wooden bucket with iron hoops and a rope handle
function bucket(B) {
  const g = G.lathe([[0.001, 0], [0.13, 0], [0.135, 0.02], [0.155, 0.27], [0.15, 0.28], [0.13, 0.27], [0.12, 0.04], [0.001, 0.04]], 12);
  B.add(g, (p, n, o) => o.set('#b07c4a').multiplyScalar(0.85 + 0.12 * clamp(n.y + 0.3) + (Math.abs(Math.sin(Math.atan2(p.z, p.x) * 6)) < 0.12 ? -0.25 : 0)));
  for (const y of [0.06, 0.22]) { const h = G.torus(0.14 + y * 0.07, 0.01, 3, 14); h.rotateX(PI / 2); h.translate(0, y, 0); B.add(h, '#4a4650'); }
  const hd = G.torus(0.15, 0.012, 3, 12, PI); hd.rotateY(0.3); hd.translate(0, 0.28, 0); B.add(hd, ROPE);
}
// the hammock between local points a and b (relative to the swing pivot): ropes to the gathered ends, the cream cloth
// slung low between them, its edges curling up
function hammock(B, a, b) {
  const ax = b.clone().sub(a).normalize(), side = V(-ax.z, 0, ax.x).normalize();
  const ea = a.clone().addScaledVector(ax, 0.45).add(V(0, -0.12, 0)), eb = b.clone().addScaledVector(ax, -0.45).add(V(0, -0.12, 0));
  for (const [p, q] of [[a, ea], [b, eb]]) for (const s of [-1, 0, 1]) B.add(tube([{ p: p.clone(), r: 0.018 }, { p: q.clone().addScaledVector(side, s * 0.06), r: 0.018 }], 4, false), ROPE);
  const N = 16, M = 7, pos = [], uv = [], idx = [], sag = 0.5;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= M; j++) {
    const u = i / N, v = j / M - 0.5, s = Math.sin(u * PI), w = 0.95 * (0.22 + 0.78 * Math.pow(s, 0.7));
    const p = ea.clone().lerp(eb, u).addScaledVector(side, v * w).add(V(0, -sag * Math.pow(s, 0.9) + (v * 2) ** 2 * 0.16 * s, 0));
    pos.push(p.x, p.y, p.z); uv.push(u, 1);
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) { const q = i * (M + 1) + j, r = q + M + 1; idx.push(q, r, q + 1, r, r + 1, q + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  B.add(g, (p, n, o) => o.set('#f2ead6').multiplyScalar(0.88 + 0.12 * Math.abs(n.y)), 'cloth');
  for (const e of [ea, eb]) { const bar = G.cyl(0.025, 0.025, 1.0, 6); bar.rotateZ(PI / 2); bar.rotateY(-Math.atan2(side.z, side.x)); bar.translate(e.x, e.y, e.z); B.add(bar, DRIFT); }
}
// a driftwood fence: crooked pale posts of different heights, two rails of bent driftwood lashed on with rope
function driftFence(B, pts, gy, F, rnd) {
  const P = [];
  for (let i = 0; i < pts.length; i++) {
    P.push(pts[i]);
    if (i < pts.length - 1) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 1.1); for (let k = 1; k < n; k++) P.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]); }
  }
  const tops = P.map(([x, z], i) => {
    const y = gy(x, z), h = 0.72 + rnd() * 0.22, lean = (rnd() - 0.5) * 0.12;
    const p = tube([0, 1, 2, 3].map(k => ({ p: V(x + Math.sin(k + i) * 0.02 + lean * k / 3 * h, y - 0.12 + (h + 0.12) * k / 3, z), r: 0.07 - k * 0.008 })), 7, true);
    B.add(p, (pp, n, o) => o.set(DRIFT).lerp(new THREE.Color(DRIFT_D), clamp(0.5 + 0.5 * Math.sin(Math.atan2(n.z, n.x) * 5 + pp.y * 4))));
    ropeWrap(B, x + lean * 0.5 * h, y + 0.55, z, 0.065, 2);
    return V(x, y, z);
  });
  for (let i = 0; i < tops.length - 1; i++) {
    const a = tops[i], b = tops[i + 1];
    for (const [ry, w] of [[0.56, 0.05], [0.3, 0.045]]) B.add(tube([0, 1, 2, 3, 4].map(k => ({ p: a.clone().lerp(b, k / 4).add(V(0, ry + Math.sin(k / 4 * PI) * 0.035 + (rnd() - 0.5) * 0.02, 0)), r: w * (0.85 + 0.25 * Math.sin(k * 1.7)) })), 6, false), DRIFT_HI);
    const L = a.distanceTo(b), n = Math.ceil(L / 0.5); for (let k = 0; k <= n; k++) F.solid(a.x + (b.x - a.x) * k / n, a.z + (b.z - a.z) * k / n, 0.15, 'the fence');
  }
}
