// Boss: Master Tengu (Whispering Bamboo Grove) — docs/REGIONS.md §2 / §3.4. Owned by the Bosses A agent.
// A karasu-tengu: crow face with a hooked beak and bushy white brows, a black tokin cap, yamabushi robes with a pompom
// sash, single-tooth geta, big dark wings with a blue sheen and a giant feather fan (hauchiwa). He floats and hops.
// Fight (scripted in def.ai / def.update, state in m.tg):
//   Fan GUST        cone telegraph, a wind wall that shoves you back and hurts — step out of the cone or roll through it.
//   TORNADOES       2 (phase 2: 3) leaf-blade whirlwinds wander the arena for a few seconds; contact hurts.
//   DIVE            he rockets out of frame, a shadow circle tracks you, locks, and he slams down into it.
//   Crow disciples  at 70% and 30% (plus the grove's kamaitachi / kodama once they exist).
//   IN HIS HOLLOW   (the Bamboo Depths' round arena, r ≥ 15 m: docs/ZONES.md §8.2) the fight is retuned for the bigger
//                   ring and a hero fresh from two dense floors: three waves of disciples (70 / 42 / 18%, the later ones
//                   mixing in the grove's yokai), one more tornado, the dive's shadow a touch wider.
//   PHASE 2 (< 50%) a bamboo-leaf wind storm: the arena swirls and slowly drifts you; gusts and dives come faster.
// After every big move he takes a breather (fanning himself, sweat drop): that's the moment to hit him.
// Exports MONSTERS / BUILD. Sounds in ./tengu.sfx.js (pure data); effects in ./fx_tengu.js.
import * as THREE from 'three';
import { ell, cone, shell, LUM_CAP, INK } from '../../dungeon/monsters.js';
import { paint, merge, tube, xf, RoundedBox } from '../../gfx/geom.js';
import { makeToon, makeOutline, U as SHARED_U } from '../../gfx/materials.js';
import { Events } from '../../core/events.js';
import { dampAngle, angleDiff } from '../../core/util.js';
import { tenguFx, TENGU_COL } from './fx_tengu.js';
import { roll, hitWhere, pushPlayer, summonAdds, pickId, sfx, arenaOf, clamp, rand, TAU, ease, F } from './kitA.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const PAL = {
  feather: '#2a2a46', featherHi: '#4c5494', beak: '#ffb43a', beakDark: '#e8892a', robe: '#f7efde', robeShade: '#e6d9be',
  trim: '#e0583a', hakama: '#4a42a0', hakamaDark: '#2f2a72', obi: '#f2c23a', pom: ['#f0405a', '#ffd24a', '#58c07a'],
  geta: '#c89060', getaDark: '#8a5a38', strap: '#e0304a', tabi: '#fcf7ee', kyahan: '#3c3854', brow: '#fffaf0',
  fan: '#fbf5e8', fanBar: '#b07a4a', fanTip: '#7a4a2e', handle: '#d8303a', gold: '#ffcf3a', cap: '#1d1b28', ruff: '#fffaf3',
};
// fresnel edge: a warm whisper on the pale robes, a strong blue-violet crow sheen on the dark feathers
const TENGU_OUT = /* glsl */`{
  float frT = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.4);
  float dkT = 1.0 - clamp(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)) * 2.4, 0.0, 1.0);
  outgoingLight += mix(vec3(1.0, 0.94, 0.86) * 0.26, vec3(0.46, 0.54, 1.0) * 0.85, dkT) * frT * (0.3 + 0.7 * dkT); }`;

// ------------------------------------------------------------------ model
function tint(g, hex) { return paint(g, (p, n, o) => o.set(hex)); }
function wing(s) { // one wing, built pointing out along s·x from its shoulder pivot
  const P = [];
  const col = (hi) => (p, n, o) => { const d = Math.hypot(p.x, p.y + 0.05); o.set(PAL.feather).lerp(new THREE.Color(PAL.featherHi), clamp((d - 0.22) / 0.3) * hi); if (n.z < -0.3) o.multiplyScalar(0.8); };
  P.push(paint(ell(0.11, 0.1, 0.055, PAL.feather, [s * 0.05, 0.0, 0], [0, 0, 0], 14), col(0.3)));
  P.push(paint(ell(0.2, 0.085, 0.05, PAL.feather, [s * 0.17, 0.035, -0.01], [0, -s * 0.15, s * 0.22], 16), col(0.6)));
  for (let i = 0; i < 6; i++) { // primaries fanning from the wrist
    const a = -0.05 - i * 0.24, len = 0.27 - i * 0.014, wx = 0.31, wy = 0.07;
    const cx = wx + Math.cos(a) * len * 0.5, cy = wy + Math.sin(a) * len * 0.5;
    P.push(paint(ell(len * 0.55, 0.046, 0.014, PAL.feather, [s * cx, cy, -0.012 - i * 0.004], [0, 0, s * a], 12), col(1)));
  }
  for (let i = 0; i < 5; i++) { // secondaries hanging from the arm
    const x = 0.08 + i * 0.05, a = -1.5 + i * 0.07, len = 0.19 - i * 0.008;
    P.push(paint(ell(len * 0.5, 0.042, 0.013, PAL.feather, [s * (x + Math.cos(a) * len * 0.45), Math.sin(a) * len * 0.45 + 0.01, 0.005 + i * 0.002], [0, 0, s * a], 10), col(0.8)));
  }
  return merge(P);
}
function fanGeo() { // the hauchiwa: hawk feathers fanned round a gold boss, on a red lacquer handle with a tassel
  const P = [], base = V(0.08, 0.1, 0.16);
  P.push(tint(xf(new THREE.CylinderGeometry(0.018, 0.021, 0.25, 8), { p: [0.08, -0.025, 0.16] }), PAL.handle));
  P.push(tint(xf(new THREE.TorusGeometry(0.022, 0.009, 6, 12), { p: [0.08, 0.095, 0.16], r: [Math.PI / 2, 0, 0] }), PAL.gold));
  P.push(ell(0.028, 0.028, 0.028, PAL.gold, [0.08, -0.155, 0.16], [0, 0, 0], 8));
  P.push(cone(0.03, 0.1, PAL.handle, [0.08, -0.22, 0.16], [Math.PI, 0, 0], 8));
  const N = 13;
  for (let i = 0; i < N; i++) {
    const a = (i / (N - 1) - 0.5) * 2.75, dx = Math.sin(a), dy = Math.cos(a), L = 0.34 - Math.abs(i / (N - 1) - 0.5) * 0.12;
    const g = ell(0.05, L * 0.5, 0.012, PAL.fan, [base.x + dx * L * 0.5, base.y + dy * L * 0.5, base.z + (i % 2) * 0.004], [0, 0, -a], 12);
    paint(g, (p, n, o) => { const d = Math.hypot(p.x - base.x, p.y - base.y) / L; o.set(PAL.fan); if (d > 0.84) o.set(PAL.fanTip); else if (Math.abs(d - 0.52) < 0.05 || Math.abs(d - 0.7) < 0.035) o.set(PAL.fanBar); if (n.z < -0.5) o.multiplyScalar(0.9); });
    P.push(g);
  }
  P.push(ell(0.055, 0.055, 0.022, PAL.gold, [base.x, base.y, base.z + 0.012], [0, 0, 0], 14), ell(0.03, 0.03, 0.02, PAL.handle, [base.x, base.y, base.z + 0.026], [0, 0, 0], 10));
  return merge(P);
}
function buildTengu(v) {
  const mat = makeToon({ vertexColors: true, objectBrush: true, brush: 0.1, rim: 0.7, term: [-0.02, 0.3], fragOut: TENGU_OUT + LUM_CAP });
  const ol = makeOutline('#2a1622', 0.014);
  const root = new THREE.Group(), pivot = new THREE.Group(), hover = new THREE.Group();
  root.add(pivot); pivot.add(hover);
  const add = (parent, geo, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; const o = new THREE.Mesh(geo, ol); parent.add(m, o); return m; };
  // --- body: geta, legs, hakama, robe, obi, pompom sash, neck ruff, the left arm in a mudra, tail feathers
  const B = [];
  for (const s of [-1, 1]) {
    const x = s * 0.088;
    B.push(tint(xf(new RoundedBox(0.12, 0.028, 0.2, 1, 0.01), { p: [x, 0.078, 0.02] }), PAL.geta));
    B.push(tint(xf(new THREE.BoxGeometry(0.1, 0.066, 0.034), { p: [x, 0.034, 0.02] }), PAL.getaDark));
    B.push(tint(tube([{ p: V(x - 0.045, 0.094, -0.035), r: 0.011 }, { p: V(x, 0.14, 0.075), r: 0.012 }, { p: V(x + 0.045, 0.094, -0.035), r: 0.011 }], 5, false), PAL.strap));
    B.push(ell(0.05, 0.036, 0.08, PAL.tabi, [x, 0.118, 0.03], [0, 0, 0], 12));
    B.push(paint(xf(new THREE.CylinderGeometry(0.042, 0.05, 0.15, 12), { p: [x, 0.195, 0] }), (p, n, o) => o.set(Math.abs(Math.sin(p.y * 80)) > 0.93 ? '#fff4e0' : PAL.kyahan)));
  }
  const hk = []; for (const [r, y] of [[0.285, 0.23], [0.278, 0.27], [0.255, 0.34], [0.232, 0.41], [0.212, 0.47]]) hk.push(new THREE.Vector2(r, y));
  const hak = new THREE.LatheGeometry(hk, 32);
  paint(hak, (p, n, o) => { const a = Math.atan2(p.x, p.z); o.set(PAL.hakama); if (Math.cos(a * 16) > 0.35) o.set(PAL.hakamaDark); if (p.y < 0.25) o.set(PAL.hakamaDark).multiplyScalar(0.85); });
  B.push(...shell(hak, 0.96, '#221e50'));
  const robe = new THREE.SphereGeometry(1, 26, 20); robe.scale(0.222, 0.205, 0.19); robe.translate(0, 0.565, 0);
  paint(robe, (p, n, o) => {
    o.set(PAL.robe); if (p.y < 0.49) o.set(PAL.robeShade);
    const cl = Math.abs(Math.abs(p.x) - (0.72 - p.y) * 0.62);
    if (p.z > 0.06 && p.y > 0.48 && cl < 0.02) o.set(PAL.trim);
  });
  B.push(robe);
  B.push(tint(xf(new THREE.CylinderGeometry(0.213, 0.22, 0.055, 26), { p: [0, 0.472, 0] }), PAL.obi));
  B.push(ell(0.06, 0.05, 0.04, PAL.obi, [0, 0.47, -0.2], [0, 0, 0], 10), ell(0.04, 0.07, 0.02, PAL.obi, [0.05, 0.43, -0.2], [0, 0, 0.5], 8), ell(0.04, 0.07, 0.02, PAL.obi, [-0.05, 0.43, -0.2], [0, 0, -0.5], 8));
  for (const s of [-1, 1]) { // yuigesa: a thin indigo sash over each shoulder with three fluffy pompoms
    B.push(tint(tube([{ p: V(s * 0.11, 0.74, -0.03), r: 0.012 }, { p: V(s * 0.1, 0.66, 0.15), r: 0.012 }, { p: V(s * 0.095, 0.5, 0.18), r: 0.012 }], 5, false), PAL.hakamaDark));
    for (let j = 0; j < 3; j++) {
      const y = 0.645 - j * 0.066, x = s * 0.098, zs = 0.19 * Math.sqrt(Math.max(0, 1 - (x / 0.222) ** 2 - ((y - 0.565) / 0.205) ** 2)) + 0.026, c = PAL.pom[j];
      B.push(ell(0.036, 0.036, 0.03, c, [x, y, zs], [0, 0, 0], 10));
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + j; B.push(ell(0.021, 0.021, 0.02, c, [x + Math.cos(a) * 0.028, y + Math.sin(a) * 0.028, zs - 0.004], [0, 0, 0], 7)); }
    }
  }
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; B.push(ell(0.05, 0.042, 0.05, PAL.ruff, [Math.sin(a) * 0.125, 0.712 + (i % 2) * 0.012, Math.cos(a) * 0.12], [0, 0, 0], 10)); }
  // left arm: wide sleeve bent in front of the chest, a yellow claw hand in a mudra
  B.push(paint(tube([{ p: V(-0.19, 0.645, 0), r: 0.06 }, { p: V(-0.275, 0.54, 0.05), r: 0.072 }, { p: V(-0.2, 0.505, 0.16), r: 0.085 }, { p: V(-0.16, 0.51, 0.19), r: 0.086 }], 10, false), (p, n, o) => o.set(p.z > 0.14 ? PAL.trim : PAL.robe)));
  B.push(ell(0.043, 0.05, 0.04, PAL.beak, [-0.135, 0.53, 0.215], [0, 0, 0.3], 10), cone(0.014, 0.05, PAL.beak, [-0.12, 0.575, 0.22], [0, 0, -0.2], 6));
  for (let i = 0; i < 3; i++) B.push(paint(ell(0.035, 0.1, 0.012, PAL.feather, [(i - 1) * 0.045, 0.37, -0.2 - Math.abs(i - 1) * 0.01], [-0.9, 0, (i - 1) * 0.3], 10), (p, n, o) => o.set(PAL.feather).lerp(new THREE.Color(PAL.featherHi), clamp((0.36 - p.y) * 6))));
  const body = add(hover, merge(B));
  // --- head (pivot at the neck): skull, big eyes with gold irises, bushy white brows, hooked beak, tokin, crest
  const head = new THREE.Group(); head.position.set(0, 0.72, 0.02); hover.add(head);
  const H = [];
  const skull = new THREE.SphereGeometry(1, 26, 20); skull.scale(0.235, 0.215, 0.22); skull.translate(0, 0.16, 0);
  paint(skull, (p, n, o) => { o.set(PAL.feather); if (n.y > 0.4) o.lerp(new THREE.Color(PAL.featherHi), (n.y - 0.4) * 0.5); });
  H.push(skull);
  for (const s of [-1, 1]) {
    H.push(ell(0.078, 0.09, 0.034, '#fffaf0', [s * 0.088, 0.175, 0.188], [0, s * 0.35, 0], 16));
    H.push(ell(0.05, 0.058, 0.02, '#ffc23a', [s * 0.086, 0.17, 0.212], [0, s * 0.35, 0], 14));
    H.push(ell(0.034, 0.042, 0.018, '#1a1020', [s * 0.085, 0.168, 0.222], [0, s * 0.35, 0], 12));
    H.push(ell(0.015, 0.015, 0.01, '#ffffff', [s * 0.085 - 0.014, 0.19, 0.234], [0, 0, 0], 8));
    H.push(tint(tube([{ p: V(s * 0.025, 0.252, 0.205), r: 0.02 }, { p: V(s * 0.085, 0.262, 0.2), r: 0.03 }, { p: V(s * 0.15, 0.285, 0.165), r: 0.026 }, { p: V(s * 0.2, 0.33, 0.1), r: 0.012 }], 7, true), PAL.brow));
    H.push(ell(0.04, 0.022, 0.012, '#ff8aa8', [s * 0.145, 0.1, 0.168], [0, s * 0.55, 0], 10));
    H.push(cone(0.042, 0.17, PAL.feather, [s * 0.07, 0.29, -0.14], [-1.05, 0, s * 0.35], 8));
  }
  H.push(cone(0.048, 0.2, PAL.feather, [0, 0.31, -0.13], [-0.95, 0, 0], 8));
  H.push(paint(tube([{ p: V(0, 0.125, 0.165), r: 0.072 }, { p: V(0, 0.105, 0.255), r: 0.052 }, { p: V(0, 0.078, 0.318), r: 0.03 }, { p: V(0, 0.046, 0.356), r: 0.012 }], 12, true), (p, n, o) => { o.set(PAL.beak); if (n.y > 0.75) o.lerp(new THREE.Color('#ffe08a'), 0.5); if (p.z < 0.2) o.set(PAL.beakDark); }));
  for (const s of [-1, 1]) H.push(ell(0.01, 0.007, 0.006, '#5a3010', [s * 0.024, 0.14, 0.24], [0, 0, 0], 6));
  const cap = new THREE.CylinderGeometry(0.058, 0.08, 0.075, 12, 1); // tokin: a small pleated black cap on the brow
  paint(cap, (p, n, o) => { o.set(PAL.cap); if (Math.cos(Math.atan2(p.x, p.z) * 12) > 0.4) o.set('#34313f'); });
  H.push(xf(cap, { p: [0, 0.365, 0.07], r: [0.38, 0, 0] }));
  H.push(ell(0.022, 0.022, 0.022, '#fffaf0', [-0.035, 0.37, 0.14], [0, 0, 0], 8), ell(0.022, 0.022, 0.022, '#fffaf0', [0.035, 0.37, 0.14], [0, 0, 0], 8));
  const headMesh = add(head, merge(H));
  // lower beak (opens for caws and laughs)
  const jaw = new THREE.Group(); jaw.position.set(0, 0.085, 0.172); head.add(jaw);
  add(jaw, tint(tube([{ p: V(0, 0, 0), r: 0.05 }, { p: V(0, -0.012, 0.08), r: 0.034 }, { p: V(0, -0.018, 0.14), r: 0.011 }], 10, true), PAL.beakDark), false);
  // closed eyes (meditation): dark lids with a serene white arc
  const lids = new THREE.Group(); head.add(lids);
  const L = [];
  for (const s of [-1, 1]) {
    L.push(ell(0.083, 0.094, 0.037, PAL.feather, [s * 0.088, 0.175, 0.19], [0, s * 0.35, 0], 14));
    L.push(tint(tube([{ p: V(s * 0.045, 0.186, 0.226), r: 0.009 }, { p: V(s * 0.088, 0.162, 0.234), r: 0.01 }, { p: V(s * 0.13, 0.186, 0.216), r: 0.009 }], 5, true), '#fffaf0'));
  }
  add(lids, merge(L), false);
  // --- fan arm (pivot at the right shoulder)
  const fanArm = new THREE.Group(); fanArm.position.set(0.19, 0.645, 0); hover.add(fanArm);
  const FA = [paint(tube([{ p: V(0, 0, 0), r: 0.06 }, { p: V(0.07, -0.08, 0.04), r: 0.072 }, { p: V(0.082, -0.125, 0.12), r: 0.084 }, { p: V(0.082, -0.135, 0.15), r: 0.085 }], 10, false), (p, n, o) => o.set(p.z > 0.11 ? PAL.trim : PAL.robe)),
    ell(0.046, 0.046, 0.046, PAL.beak, [0.08, -0.14, 0.165], [0, 0, 0], 10), fanGeo()];
  add(fanArm, merge(FA));
  const fanTip = new THREE.Object3D(); fanTip.position.set(0.08, 0.3, 0.16); fanArm.add(fanTip);
  // --- wings (pivots on the back)
  const wings = [];
  for (const s of [-1, 1]) { const w = new THREE.Group(); w.position.set(s * 0.1, 0.63, -0.14); hover.add(w); add(w, wing(s)); wings.push(w); }
  lids.visible = false;
  const pose = { hover: 0.3, bob: 0.05, flap: 1.1, flapAmp: 0.1, wingY: 1.2, wingZ: 0.0, fanX: 0, fanZ: 0, fanY: 0, head: 0, tilt: 0, jaw: 0, lean: 0, crouch: 0, spin: 0, laugh: 0, fanSelf: 0, lids: 0, rate: 7, hoverRate: 5, direct: -1 };
  const cur = { hover: 0.3, wingY: 1.2, wingZ: 0, fanX: 0, fanZ: 0, fanY: 0, head: 0, tilt: 0, jaw: 0, lean: 0, crouch: 0, flapA: 0.1, flapF: 1.1, ph: 0, spinA: 0 };
  const scale = 2.3;
  const animate = (dt, t) => {
    const k = 1 - Math.exp(-pose.rate * dt), kh = 1 - Math.exp(-pose.hoverRate * dt);
    if (pose.direct >= 0) cur.hover = pose.direct; else cur.hover += (pose.hover - cur.hover) * kh;
    for (const n of ['wingY', 'wingZ', 'fanX', 'fanZ', 'fanY', 'head', 'tilt', 'jaw', 'lean', 'crouch']) cur[n] += (pose[n] - cur[n]) * k;
    cur.flapA += (pose.flapAmp - cur.flapA) * k; cur.flapF += (pose.flap - cur.flapF) * k;
    cur.ph += dt * cur.flapF * TAU;
    const bob = Math.sin(t * 2.2) * pose.bob;
    hover.position.y = (cur.hover + bob) / scale;
    const sq = cur.crouch;
    hover.scale.set(1 + sq * 0.12, 1 - sq * 0.2, 1 + sq * 0.12);
    hover.rotation.x = cur.lean;
    if (pose.spin) { cur.spinA += pose.spin * dt; hover.rotation.y = cur.spinA; }
    else { cur.spinA = ((cur.spinA % TAU) + TAU) % TAU; if (cur.spinA > Math.PI) cur.spinA -= TAU; cur.spinA *= Math.exp(-10 * dt); hover.rotation.y = cur.spinA; }
    const fl = Math.sin(cur.ph) * cur.flapA;
    wings[1].rotation.set(0, cur.wingY, cur.wingZ + fl); wings[0].rotation.set(0, -cur.wingY, -(cur.wingZ + fl));
    const fs = pose.fanSelf ? Math.sin(t * 9) * 0.35 * pose.fanSelf : 0;
    fanArm.rotation.set(cur.fanX + fs * 0.4, cur.fanY, cur.fanZ + fs);
    const lg = pose.laugh ? Math.abs(Math.sin(t * 16)) * pose.laugh : 0;
    head.rotation.set(cur.head - lg * 0.18, 0, cur.tilt + Math.sin(t * 1.3) * 0.03);
    jaw.rotation.x = cur.jaw + lg * 0.55;
    lids.visible = pose.lids > 0.5;
  };
  animate(0, 0);
  return { root, pivot, body, mat, outline: null, animate, pose, cur, parts: { hover, head, jaw, lids, fanArm, fanTip, wings, headMesh } };
}

function buildKozo(v) { // a crow-tengu disciple: small, round, fierce, with flapping wings and a mini tokin
  const mat = makeToon({ vertexColors: true, objectBrush: true, brush: 0.1, rim: 0.7, term: [-0.02, 0.3], fragOut: TENGU_OUT });
  const ol = makeOutline(INK, 0.021);
  const root = new THREE.Group(), pivot = new THREE.Group(); root.add(pivot);
  const P = [];
  const bodyG = new THREE.SphereGeometry(1, 20, 16); bodyG.scale(0.24, 0.22, 0.22); bodyG.translate(0, 0.3, 0);
  paint(bodyG, (p, n, o) => { o.set(v.robe || '#e8ddc4'); if (p.y < 0.2) o.set(PAL.hakama); if (Math.abs(p.y - 0.24) < 0.018) o.set(PAL.obi); });
  P.push(bodyG);
  const hd = new THREE.SphereGeometry(1, 20, 16); hd.scale(0.2, 0.19, 0.19); hd.translate(0, 0.6, 0.02); tint(hd, PAL.feather); P.push(hd);
  for (const s of [-1, 1]) {
    P.push(ell(0.06, 0.068, 0.028, '#fffaf0', [s * 0.075, 0.62, 0.17], [0, s * 0.35, 0], 12), ell(0.038, 0.045, 0.018, '#1a1020', [s * 0.074, 0.615, 0.192], [0, s * 0.35, 0], 10), ell(0.012, 0.012, 0.008, '#ffffff', [s * 0.074 - 0.012, 0.632, 0.204], [0, 0, 0], 6));
    P.push(tint(tube([{ p: V(s * 0.03, 0.682, 0.18), r: 0.014 }, { p: V(s * 0.12, 0.7, 0.14), r: 0.012 }], 5, true), PAL.brow));
    P.push(ell(0.045, 0.032, 0.06, PAL.beak, [s * 0.08, 0.08, 0.04], [0, 0, 0], 8));
    P.push(ell(0.032, 0.018, 0.01, '#ff8aa8', [s * 0.12, 0.55, 0.15], [0, s * 0.55, 0], 8));
  }
  P.push(paint(tube([{ p: V(0, 0.58, 0.16), r: 0.05 }, { p: V(0, 0.555, 0.25), r: 0.028 }, { p: V(0, 0.525, 0.29), r: 0.01 }], 10, true), (p, n, o) => o.set(PAL.beak)));
  P.push(tint(xf(new THREE.CylinderGeometry(0.04, 0.055, 0.05, 10), { p: [0, 0.78, 0.05], r: [0.35, 0, 0] }), PAL.cap));
  for (let j = 0; j < 2; j++) for (const s of [-1, 1]) P.push(ell(0.028, 0.028, 0.022, PAL.pom[j], [s * 0.085, 0.36 - j * 0.07, 0.2], [0, 0, 0], 8));
  P.push(cone(0.04, 0.14, PAL.feather, [0, 0.72, -0.12], [-1.0, 0, 0], 8));
  const body = new THREE.Mesh(merge(P), mat); body.castShadow = true; const bodyOl = new THREE.Mesh(body.geometry, ol);
  pivot.add(body, bodyOl);
  const wings = [];
  for (const s of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(s * 0.16, 0.36, -0.08);
    const wg = merge([ell(0.14, 0.05, 0.03, PAL.feather, [s * 0.1, 0, 0], [0, 0, s * 0.3], 12), ell(0.1, 0.035, 0.012, PAL.featherHi, [s * 0.2, -0.02, -0.01], [0, 0, -s * 0.2], 10)]);
    const wm = new THREE.Mesh(wg, mat); wm.castShadow = true; g.add(wm, new THREE.Mesh(wg, ol)); pivot.add(g); wings.push(g);
  }
  const animate = (dt, t, moving, anim) => {
    const f = moving ? 14 : 6, a = Math.sin(t * f) * (moving ? 0.6 : 0.25) + (anim.wind > 0 ? 0.6 : 0);
    wings[1].rotation.set(0, 0.35, 0.2 + a); wings[0].rotation.set(0, -0.35, -(0.2 + a));
  };
  return { root, pivot, body, mat, outline: bodyOl, animate };
}

export const BUILD = { tenguMaster: buildTengu, karasuKozo: buildKozo };

// ------------------------------------------------------------------ tuning (index 0 = phase 1, 1 = phase 2)
const TUNE = {
  gust: { cd: [4.8, 3.1], wind: [1.0, 0.8], R: 8.6, half: 0.52, dmg: 0.95, push: 9, pushT: 0.5, speed: 17 },
  torn: { cd: [12, 9], n: [2, 3], life: [6.5, 7.5], speed: [2.1, 2.5], r: 0.95, dmg: 0.42, tick: 0.8, cast: 0.95 },
  dive: { cd: [11, 7], track: [1.55, 1.2], lock: [0.62, 0.52], r: [2.7, 3.0], dmg: 1.45, rec: [1.6, 1.2], dbl: [0, 0.55], up: 0.55, fall: 0.24 },
  rest: [1.45, 1.1],
  keep: [5.0, 5.5],
  drift: 0.95,
  summonAt: [0.7, 0.3],
};
// the arena retune (an authored round hollow of r ≥ 15 m instead of the 11 m outdoor clearing)
const ARENA_TUNE = { summonAt: [0.7, 0.42, 0.18], waves: [['karasuKozo', 'karasuKozo', 'karasuKozo', 'karasuKozo'], ['karasuKozo', 'karasuKozo', 'karasuKozo', 'kamaitachi', 'kamaitachi'], ['karasuKozo', 'karasuKozo', 'kodama', 'kodama', 'takenoko', 'takenoko']], tornExtra: 1, diveR: 0.3 };
const inHollow = S => (S.arena?.r || 0) >= 15;
const TELE = TENGU_COL.tele;
const _dir = new THREE.Vector3(), _v = new THREE.Vector3();
const P2 = S => (S.p2 ? 1 : 0);
const set = (S, st) => { S.st = st; S.t = 0; S.flag = 0; };
// timelines that keep running while he is stunned (the default AI skips def.ai during stuns)
const TIMED = new Set(['intro', 'gustWind', 'gustRel', 'tornCast', 'diveCrouch', 'diveUp', 'diveTrack', 'diveLock', 'diveLand', 'summon', 'storm', 'rest']);

function poseIdle(p) { Object.assign(p, { hover: 0.35, bob: 0.06, flap: 1.6, flapAmp: 0.14, wingY: 0.9, wingZ: 0.1, fanX: 0, fanZ: 0, fanY: 0, head: 0, tilt: 0, jaw: 0, lean: 0.05, crouch: 0, spin: 0, laugh: 0, fanSelf: 0, lids: 0, rate: 7, hoverRate: 5, direct: -1 }); }
function fanWorld(m, v) { m.model.parts.fanTip.getWorldPosition(v); return v; }

// ------------------------------------------------------------------ the fight
function tick(m, dt, tgt, d, slowMul) {
  const S = m.tg; S.t += dt;
  switch (S.st) {
    case 'meditate': startIntro(m); return false;
    case 'intro': return introTick(m, dt);
    case 'idle': return idleTick(m, dt, tgt, d, slowMul);
    case 'gustWind': return gustWindTick(m, dt, tgt);
    case 'gustRel': return gustRelTick(m, dt);
    case 'tornCast': return tornCastTick(m, dt, tgt);
    case 'diveCrouch': case 'diveUp': case 'diveTrack': case 'diveLock': case 'diveLand': return diveTick(m, dt, tgt);
    case 'summon': return summonTick(m, dt);
    case 'storm': return stormTick(m, dt);
    case 'rest': m.faceTo(tgt.pos.x, tgt.pos.z, dt * 0.35); if (S.t >= S.restDur) { set(S, 'idle'); poseIdle(m.model.pose); } return false;
  }
  return false;
}

function startIntro(m) {
  const S = m.tg, p = m.model.pose; set(S, 'intro');
  Object.assign(p, { lids: 0, hover: 1.1, hoverRate: 3, wingY: 0.15, wingZ: 0.5, flap: 3.2, flapAmp: 0.45, fanZ: -0.5, fanX: -0.4, head: -0.15, lean: -0.1 });
  const x = m.pos.x, z = m.pos.z, y = m.pos.y;
  S.fx.leafBurst(x, y + 1.4, z, { n: 28, frame: F.BAMBOO, colors: TENGU_COL.leaf, speed: 6, up: 4, life: 1.8 });
  S.fx.feathers(x, y + 1.8, z, { n: 14, speed: 4, up: 3 });
  S.fx.shockRing(x, z, 0.4, 6, { life: 0.7, color: '#eaffdc' });
  sfx('tengu_wings', m.pos);
}
function introTick(m, dt) {
  const S = m.tg, p = m.model.pose;
  if (S.t > 0.35 && !(S.flag & 1)) { S.flag |= 1; p.laugh = 1; sfx('tengu_laugh', m.pos); }
  if (S.t > 0.9 && !(S.flag & 2)) { S.flag |= 2; p.laugh = 0; p.fanZ = 0.3; p.fanX = 0.6; }
  if (S.t > 1.5) { set(S, 'idle'); poseIdle(p); S.gcd = 0.3; m._prof = null; } // framing re-measures him in his fighting pose
  return false;
}

function idleTick(m, dt, tgt, d, slowMul) {
  const S = m.tg, frac = m.life / m.lifeMax, C = S.cds;
  if (!S.p2 && frac < 0.5) { startStorm(m); return false; }
  const sAt = inHollow(S) ? ARENA_TUNE.summonAt : TUNE.summonAt;
  if (S.summoned < sAt.length && frac < sAt[S.summoned]) { startSummon(m); return false; }
  S.gcd -= dt;
  if (S.gcd <= 0) {
    const los = m.mode.los(m.pos, tgt.pos);
    if (C.dive <= 0 && (d > 6.5 || Math.random() < 0.45)) { startDive(m, tgt); return false; }
    if (C.torn <= 0 && !S.torn.some(o => !o.done)) { startTornado(m, tgt); return false; }
    if (C.gust <= 0 && d < TUNE.gust.R + 0.4 && los) { startGust(m, tgt); return false; }
    if (C.dive <= 0) { startDive(m, tgt); return false; }
  }
  return reposition(m, dt, tgt, d, slowMul);
}
function reposition(m, dt, tgt, d, slowMul) {
  const S = m.tg, want = TUNE.keep[P2(S)], p = m.model.pose;
  S.strafeT -= dt; if (S.strafeT <= 0) { S.strafe = -S.strafe; S.strafeT = rand(1.6, 3.2); }
  if (d > 3 && !m.mode.los(m.pos, tgt.pos)) { m.chase(tgt, dt, slowMul); p.hover = 0.55; p.flap = 3; p.flapAmp = 0.3; return true; }
  let dx = tgt.pos.x - m.pos.x, dz = tgt.pos.z - m.pos.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
  const radial = clamp((d - want) / 2, -1, 1);
  let mx = dx * radial - dz * S.strafe * 0.75, mz = dz * radial + dx * S.strafe * 0.75;
  const A = S.arena, ox = m.pos.x - A.x, oz = m.pos.z - A.z, od = Math.hypot(ox, oz) || 1;
  if (od > A.r - 2) { const k = clamp((od - (A.r - 2)) / 2) * 1.6; mx -= ox / od * k; mz -= oz / od * k; if (Math.random() < dt) S.strafe = -S.strafe; }
  const ml = Math.hypot(mx, mz), face = m.facing;
  if (ml < 0.12) { m.faceTo(tgt.pos.x, tgt.pos.z, dt); p.hover = 0.35; p.flap = 1.6; p.flapAmp = 0.14; return false; }
  _dir.set(mx / ml, 0, mz / ml);
  m.move(_dir, dt, slowMul * (d > want + 3 ? 1.25 : 0.8));
  m.facing = dampAngle(face, Math.atan2(dx, dz), 8, dt); // strafes while watching you
  p.hover = 0.6; p.flap = 3.4; p.flapAmp = 0.34; p.wingY = 0.55; p.wingZ = 0.25; p.lean = 0.12;
  return true;
}
function startRest(m, dur) {
  const S = m.tg, p = m.model.pose; set(S, 'rest'); S.restDur = dur;
  poseIdle(p); Object.assign(p, { hover: 0.25, fanSelf: 1, fanZ: 0.55, fanX: -0.2, wingY: 1.1, flap: 1.0, flapAmp: 0.08, head: 0.12, tilt: 0.12 });
  m.emote('sweat', dur);
  m.G.vfx.decal(m.pos, { r: m.bodyR * 1.3, color: '#d8ffc8', additive: true, opacity: 0.32, life: dur, spin: -0.8 });
}

// --- the fan gust
function startGust(m, tgt) {
  const S = m.tg, T = TUNE.gust, ph = P2(S), p = m.model.pose; set(S, 'gustWind');
  S.cds.gust = T.cd[ph] * rand(0.9, 1.15); S.gcd = rand(0.4, 0.8);
  S.aim = Math.atan2(tgt.pos.x - m.pos.x, tgt.pos.z - m.pos.z); S.wind = T.wind[ph];
  S.tele = S.fx.tele({ shape: 'cone', x: m.pos.x, z: m.pos.z, yaw: S.aim, r: T.R, half: T.half, time: S.wind, color: TELE, hold: 0.4 });
  m.mode.bossTelegraph?.(S.wind + 0.3); m.mode.bossEngaged?.(m);
  S.fx.gather(v => fanWorld(m, v), S.wind * 0.9);
  Object.assign(p, { fanX: -1.5, fanZ: -0.35, fanY: 0.3, wingY: 0.2, wingZ: 0.55, flap: 2.2, flapAmp: 0.2, lean: -0.2, hover: 0.5, head: -0.1, rate: 8 });
  sfx('tengu_fan_wind', m.pos);
}
function gustWindTick(m, dt, tgt) {
  const S = m.tg, T = TUNE.gust;
  if (S.t < S.wind * 0.6) { const want = Math.atan2(tgt.pos.x - m.pos.x, tgt.pos.z - m.pos.z); S.aim += clamp(angleDiff(S.aim, want), -2.2 * dt, 2.2 * dt); S.tele.place(m.pos.x, m.pos.z, S.aim); }
  m.facing = dampAngle(m.facing, S.aim, 14, dt);
  if (S.t >= S.wind) {
    set(S, 'gustRel'); S.tele.fire(); S.gHit = new Set(); S.gx = m.pos.x; S.gz = m.pos.z;
    S.fx.gust(m.pos.x, m.pos.z, S.aim, T.R, T.half, T.speed);
    Object.assign(m.model.pose, { fanX: 1.25, fanZ: 0.15, fanY: -0.2, lean: 0.25, wingZ: 0.2, rate: 22 });
    m.G.engine.rig.shake(0.22); sfx('tengu_gust', m.pos);
  }
  return false;
}
function gustRelTick(m, dt) {
  const S = m.tg, T = TUNE.gust, G = m.G, front = 0.6 + T.speed * S.t, ca = Math.sin(S.aim), cc = Math.cos(S.aim);
  const inCone = (x, z, r) => { const dx = x - S.gx, dz = z - S.gz, dd = Math.hypot(dx, dz); if (dd > front + r || dd > T.R + r || dd < 0.1) return false; return Math.abs(angleDiff(S.aim, Math.atan2(dx, dz))) <= T.half + Math.atan2(r, dd); };
  const P = G.player;
  if (P && !S.gHit.has(P) && !G.playerDead && inCone(P.pos.x, P.pos.z, P.radius || 0.3)) {
    S.gHit.add(P);
    if (!P.invuln) {
      m.mode.combat.hitPlayer(roll(m, T.dmg), { element: 'phys', level: m.level, from: m.pos, knock: 0, src: m });
      const dx = P.pos.x - S.gx, dz = P.pos.z - S.gz, L = Math.hypot(dx, dz) || 1;
      S.push = { x: dx / L * 0.6 + ca * 0.4, z: dz / L * 0.6 + cc * 0.4, v: T.push, t: T.pushT, T: T.pushT };
      S.fx.leafBurst(P.pos.x, P.pos.y + 0.8, P.pos.z, { n: 10, frame: F.BAMBOO, colors: TENGU_COL.leaf, speed: 3, up: 2 });
    }
  }
  for (const e of m.mode.combat.entities) if (e.team === 'ally' && e.alive && e !== P && !e.untargetable && e.pos && !S.gHit.has(e) && inCone(e.pos.x, e.pos.z, e.radius || 0.3)) { S.gHit.add(e); m.mode.combat.hitAlly(e, roll(m, T.dmg * 0.8), { from: m.pos }); }
  if (S.t > 0.62) startRest(m, TUNE.rest[P2(S)]);
  return false;
}

// --- leaf-blade tornadoes
function startTornado(m, tgt) {
  const S = m.tg, T = TUNE.torn, ph = P2(S), p = m.model.pose; set(S, 'tornCast');
  S.cds.torn = T.cd[ph] * rand(0.9, 1.1); S.gcd = rand(0.5, 0.9);
  const n = T.n[ph] + (inHollow(S) ? ARENA_TUNE.tornExtra : 0), base = Math.atan2(tgt.pos.x - m.pos.x, tgt.pos.z - m.pos.z), A = S.arena, W = m.world;
  S.spots = [];
  for (let i = 0; i < n; i++) {
    const off = n === 2 ? (i ? 1 : -1) * 1.0 : (i - (n - 1) / 2) * 1.15;
    let x = m.pos.x, z = m.pos.z;
    for (let k = 0; k < 6; k++) {
      const a = base + off + (k ? rand(-0.5, 0.5) : 0), r = 2.8 + k * 0.3;
      x = m.pos.x + Math.sin(a) * r; z = m.pos.z + Math.cos(a) * r;
      if (W.walkable(x, z) && Math.hypot(x - A.x, z - A.z) < A.r - 0.5) break;
    }
    S.spots.push({ x, z, tele: S.fx.tele({ shape: 'disc', x, z, r: 1.15, time: T.cast, color: TELE, hold: 0.3 }) });
  }
  Object.assign(p, { spin: 15, fanZ: -1.35, fanX: 0.1, fanY: 0, wingY: 0.3, wingZ: 0.7, flap: 4, flapAmp: 0.25, hover: 0.9, lean: 0 });
  m.mode.bossTelegraph?.(T.cast); m.mode.bossEngaged?.(m);
  sfx('tengu_tornado', m.pos);
}
function tornCastTick(m, dt, tgt) {
  const S = m.tg, T = TUNE.torn, ph = P2(S);
  if (Math.random() < dt * 30) S.fx.p('a', F.STREAK, m.pos.x + rand(-1.5, 1.5), m.pos.y + rand(0.3, 2.4), m.pos.z + rand(-1.5, 1.5), { vx: rand(-6, 6), vz: rand(-6, 6), life: 0.25, size: 1.1, size1: 0.3, color: TENGU_COL.wind, alpha: 0.7, alpha1: 0, fn: null });
  if (S.t >= T.cast) {
    for (const sp of S.spots) {
      sp.tele.fire();
      const o = { id: ++S.torId, x: sp.x, z: sp.z, vx: 0, vz: 0, t: 0, life: T.life[ph] * rand(0.92, 1.08), speed: T.speed[ph] * rand(0.9, 1.1), seed: rand(0, 10), hitCd: 0.3, done: false };
      S.torn.push(o); S.fx.tornado(o);
      S.fx.leafBurst(sp.x, m.pos.y + 0.3, sp.z, { n: 12, frame: F.BAMBOO, colors: TENGU_COL.leaf, speed: 4, up: 4 });
    }
    m.model.pose.spin = 0;
    startRest(m, TUNE.rest[ph] * 0.75);
  }
  return false;
}
function updateTornadoes(m, dt) {
  const S = m.tg, T = TUNE.torn, G = m.G, P = G.player, A = S.arena, W = m.world;
  for (let i = S.torn.length - 1; i >= 0; i--) {
    const o = S.torn[i];
    if (o.done) { if ((o.gone = (o.gone || 0) + dt) > 1) S.torn.splice(i, 1); continue; }
    o.t += dt; if (o.t > o.life) { o.done = true; continue; }
    const tx = P ? P.pos.x : A.x, tz = P ? P.pos.z : A.z;
    const ang = Math.atan2(tx - o.x, tz - o.z) + Math.sin(o.t * 0.9 + o.seed) * 1.0 + Math.sin(o.t * 2.3 + o.seed * 2) * 0.35;
    let dvx = Math.sin(ang) * o.speed, dvz = Math.cos(ang) * o.speed;
    const ox = o.x - A.x, oz = o.z - A.z, od = Math.hypot(ox, oz) || 1;
    if (od > A.r - 1) { dvx -= ox / od * o.speed * 1.2; dvz -= oz / od * o.speed * 1.2; }
    const kk = Math.min(1, dt * 1.6); o.vx += (dvx - o.vx) * kk; o.vz += (dvz - o.vz) * kk;
    const nx = o.x + o.vx * dt, nz = o.z + o.vz * dt;
    if (W.walkable(nx, o.z)) o.x = nx; else o.vx = -o.vx * 0.5;
    if (W.walkable(o.x, nz)) o.z = nz; else o.vz = -o.vz * 0.5;
    o.hitCd -= dt;
    if (o.hitCd <= 0 && P && !G.playerDead && Math.hypot(P.pos.x - o.x, P.pos.z - o.z) < T.r + (P.radius || 0.3)) {
      o.hitCd = T.tick;
      if (!P.invuln) {
        m.mode.combat.hitPlayer(roll(m, T.dmg), { element: 'phys', level: m.level, from: V(o.x, 0, o.z), knock: 0, src: m });
        const dx = P.pos.x - o.x, dz = P.pos.z - o.z, L = Math.hypot(dx, dz) || 1; // flung out sideways, spun round
        S.push = { x: dx / L - dz / L * 0.8, z: dz / L + dx / L * 0.8, v: 6, t: 0.3, T: 0.3 };
        S.fx.leafBurst(P.pos.x, P.pos.y + 0.6, P.pos.z, { n: 8, frame: F.BAMBOO, colors: TENGU_COL.leaf, speed: 3, up: 3 });
      }
    }
    for (const e of m.mode.combat.entities) if (e.team === 'ally' && e.alive && e !== P && !e.untargetable && e.pos && (o['h' + (e.id ?? 0)] || 0) < o.t && Math.hypot(e.pos.x - o.x, e.pos.z - o.z) < T.r + 0.3) { o['h' + (e.id ?? 0)] = o.t + T.tick; m.mode.combat.hitAlly(e, roll(m, T.dmg * 0.8), { from: m.pos }); }
  }
}

// --- the dive
function startDive(m, tgt) {
  const S = m.tg, T = TUNE.dive, ph = P2(S), p = m.model.pose; set(S, 'diveCrouch');
  S.cds.dive = T.cd[ph] * rand(0.9, 1.1); S.gcd = rand(0.5, 0.9);
  S.dives = ph && Math.random() < T.dbl[ph] ? 2 : 1; S.diveTgt = tgt;
  Object.assign(p, { crouch: 1, hover: 0.1, wingY: 0.05, wingZ: 0.9, flap: 0.5, flapAmp: 0.05, fanX: -0.6, fanZ: -0.2, lean: 0.25, head: -0.2, rate: 9 });
  m.mode.bossEngaged?.(m);
  sfx('tengu_caw', m.pos);
}
function diveTick(m, dt, tgtIn) {
  const S = m.tg, T = TUNE.dive, ph = P2(S), p = m.model.pose, G = m.G, M = m.mode;
  const tgt = S.diveTgt?.alive !== false && S.diveTgt?.pos ? S.diveTgt : G.player;
  switch (S.st) {
    case 'diveCrouch':
      m.faceTo(tgt.pos.x, tgt.pos.z, dt);
      if (S.t >= 0.42) {
        set(S, 'diveUp'); S.air = true; M.combat.remove(m); m.untargetable = true;
        S.fx.takeoff(m.pos.x, m.pos.z); sfx('tengu_dive_up', m.pos);
        Object.assign(p, { crouch: 0, wingY: 0.6, wingZ: -0.3, flap: 7, flapAmp: 0.5, fanX: 0.2, fanZ: -0.1, lean: -0.1, direct: 0.3 });
        G.engine.rig.shake(0.2);
      }
      return false;
    case 'diveUp': {
      const k = Math.min(1, S.t / T.up); p.direct = 0.3 + 17 * k * k;
      S.fx.climbTrail(m.pos.x, m.pos.y + p.direct, m.pos.z);
      m.shadow.scale.setScalar(Math.max(0.05, 1 - k));
      if (S.t >= T.up) {
        set(S, 'diveTrack'); m.model.root.visible = false; m.shadow.visible = false;
        S.shx = tgt.pos.x; S.shz = tgt.pos.z; S.trackDur = S.dives > 1 || S.second ? 1.0 : T.track[ph];
        S.tele = S.fx.tele({ shape: 'disc', x: S.shx, z: S.shz, r: T.r[ph] + (inHollow(S) ? ARENA_TUNE.diveR : 0), time: S.trackDur + T.lock[ph], color: TELE, blob: 0.15, hold: 0.3 });
        M.bossTelegraph?.(S.trackDur + T.lock[ph]);
        sfx('tengu_caw', tgt.pos, { vol: 0.6 });
      }
      return false;
    }
    case 'diveTrack': {
      const f = 1 - Math.exp(-4.2 * dt);
      S.shx += (tgt.pos.x - S.shx) * f; S.shz += (tgt.pos.z - S.shz) * f;
      S.tele.place(S.shx, S.shz); S.tele.m.material.uniforms.uBlob.value = 0.15 + 0.4 * (S.t / S.trackDur);
      m.pos.set(S.shx, m.world.heightAt(S.shx, S.shz), S.shz);
      if (S.t >= S.trackDur) { set(S, 'diveLock'); sfx('tengu_dive_whistle', m.pos); }
      return false;
    }
    case 'diveLock': {
      const L = T.lock[ph], fall = T.fall;
      S.tele.m.material.uniforms.uBlob.value = 0.55 + 0.4 * (S.t / L);
      if (S.t >= L - fall) {
        if (!m.model.root.visible) { m.model.root.visible = true; m.shadow.visible = true; Object.assign(p, { wingY: 1.3, wingZ: -0.2, flap: 0, flapAmp: 0, fanX: -0.3, lean: 0.3, head: 0.1 }); }
        const k = clamp((S.t - (L - fall)) / fall); p.direct = 13 * (1 - k * k);
        m.shadow.scale.setScalar(0.2 + 0.8 * k);
        S.fx.climbTrail(m.pos.x, m.pos.y + p.direct + 1, m.pos.z);
      }
      if (S.t >= L) diveImpact(m, T.r[ph] + (inHollow(S) ? ARENA_TUNE.diveR : 0));
      return false;
    }
    case 'diveLand':
      if (S.t >= S.landDur) { set(S, 'idle'); poseIdle(p); S.gcd = 0.35; }
      return false;
  }
  return false;
}
function diveImpact(m, r) {
  const S = m.tg, G = m.G, M = m.mode, p = m.model.pose, T = TUNE.dive, ph = P2(S);
  S.air = false; m.untargetable = false; M.combat.add(m); m.shadow.scale.setScalar(1);
  p.direct = -1; m.model.cur.hover = 0; p.hover = 0.05;
  S.tele.fire();
  const x = m.pos.x, z = m.pos.z, P = G.player;
  const hit = hitWhere(m, (px, pz, pr) => Math.hypot(px - x, pz - z) < r + pr, roll(m, T.dmg), { knock: 0, from: m.pos });
  if (hit && P) { const dx = P.pos.x - x, dz = P.pos.z - z, L = Math.hypot(dx, dz); S.push = { x: L > 0.05 ? dx / L : Math.sin(m.facing), z: L > 0.05 ? dz / L : Math.cos(m.facing), v: 10, t: 0.32, T: 0.32 }; }
  S.fx.slam(x, z, r);
  G.engine.rig.shake(0.85); G.engine.hitStop = Math.max(G.engine.hitStop || 0, 0.06);
  sfx('tengu_slam', m.pos);
  if (--S.dives > 0) { S.second = true; set(S, 'diveCrouch'); Object.assign(p, { crouch: 1, wingY: 0.05, wingZ: 0.9, flap: 0.5, flapAmp: 0.05, lean: 0.25 }); S.t = 0.12; return; }
  S.second = false;
  set(S, 'diveLand'); S.landDur = T.rec[ph];
  Object.assign(p, { crouch: 0.7, wingY: 0.1, wingZ: -0.45, flap: 0, flapAmp: 0, fanX: 0.9, fanZ: 0.5, lean: 0.35, head: 0.3, tilt: 0.25, rate: 10 });
  setTimeout(() => { if (m.alive && S.st === 'diveLand') Object.assign(p, { crouch: 0.3, wingZ: 0, lean: 0.1, head: 0.1 }); }, 450);
  S.fx.dizzy(m.pos, m.pos.y + 2.5, S.landDur * 0.9, { r: 0.55, n: 5 });
  m.emote('sweat', S.landDur);
}

// --- crow disciples
function startSummon(m) {
  const S = m.tg, p = m.model.pose; set(S, 'summon');
  S.summoned++; m.summoned = S.summoned;
  Object.assign(p, { hover: 1.3, hoverRate: 4, wingY: 0.1, wingZ: 0.6, flap: 3.5, flapAmp: 0.4, fanX: -1.0, fanZ: -0.8, head: -0.3, jaw: 0.5 });
  sfx('tengu_caw', m.pos);
  m.G.ui?.toast?.(S.summoned === 1 ? `${m.name} calls his crow disciples!` : S.summoned === 2 && inHollow(S) ? `${m.name} whistles up the hollow's yokai!` : `${m.name} summons the whole grove!`, { color: '#b8a8ff', icon: 'oni' });
  m.G.engine.rig.shake(0.35);
}
function summonTick(m, dt) {
  const S = m.tg;
  if (S.t > 0.3 && !(S.flag & 1)) { S.flag |= 1; m.model.pose.jaw = 0; }
  if (S.t > 0.6 && !(S.flag & 2)) {
    S.flag |= 2;
    const ids = inHollow(S) ? (ARENA_TUNE.waves[S.summoned - 1] || ARENA_TUNE.waves[0]).map(id => pickId([id], 'karasuKozo')).filter(Boolean)
      : S.summoned === 1 ? ['karasuKozo', 'karasuKozo', 'karasuKozo'] : ['karasuKozo', 'karasuKozo', pickId(['kamaitachi', 'kodama'], 'karasuKozo'), pickId(['kodama', 'kamaitachi'], 'karasuKozo')];
    summonAdds(m, ids, m.pos.x, m.pos.z, { r0: 2.8, r1: 4.6, onEach: (a, x, z) => { const y = m.world.heightAt(x, z); S.fx.feathers(x, y + 0.7, z, { n: 12, speed: 3, up: 2.5 }); S.fx.puffs(x, y + 0.2, z, { n: 7, size: 0.5 }); } });
    sfx('tengu_caw', m.pos, { pitch: 1.3 });
  }
  if (S.t > 1.35) { set(S, 'idle'); poseIdle(m.model.pose); S.gcd = 0.6; }
  return false;
}

// --- phase 2: the bamboo-leaf storm
function startStorm(m) {
  const S = m.tg, p = m.model.pose, G = m.G, A = S.arena; set(S, 'storm');
  S.p2 = true; m.enraged = true;
  Object.assign(p, { hover: 1.6, hoverRate: 3, wingY: 0.0, wingZ: 0.75, flap: 5, flapAmp: 0.5, fanX: -1.2, fanZ: -0.9, head: -0.3, laugh: 1, lean: -0.15, spin: 0 });
  sfx('tengu_laugh', m.pos); setTimeout(() => sfx('tengu_storm', m.pos), 350);
  S.fx.word('KA-KA-KA!', m.lift(3.4), { a: '#f4ffe8', b: '#8fcf5a', size: 2 });
  G.ui?.toast?.('A bamboo-leaf storm whips up! The wind pushes you around.', { color: '#9fe08a', icon: 'oni' });
  S.storm.on = true; S.storm.k = 0; S.stormT = 0;
  S.fx.storm(S.storm, A.x, A.z, A.r);
  S.windSave ??= SHARED_U.uWindStr.value;
  S.offMode ||= Events.on('mode:changed', () => restoreWind(m));
  m.emote('anger', 1.6);
}
function stormTick(m, dt) {
  const S = m.tg, A = S.arena;
  if (S.t > 0.45 && !(S.flag & 1)) {
    S.flag |= 1; S.fx.shockRing(m.pos.x, m.pos.z, 0.5, A.r, { life: 0.8, color: '#eaffdc', width: 0.1 });
    S.fx.leafBurst(m.pos.x, m.pos.y + 2, m.pos.z, { n: 36, frame: F.BAMBOO, colors: TENGU_COL.leaf, speed: 8, up: 4, life: 2 });
    m.G.engine.rig.shake(0.5);
  }
  if (S.t > 1.2 && !(S.flag & 2)) { S.flag |= 2; m.model.pose.laugh = 0; }
  if (S.t > 2.0) { set(S, 'idle'); poseIdle(m.model.pose); S.gcd = 0.2; S.cds.gust = Math.min(S.cds.gust, 0.4); }
  return false;
}
function restoreWind(m) {
  const S = m.tg; if (!S) return;
  if (S.windSave != null) { SHARED_U.uWindStr.value = S.windSave; S.windSave = null; }
  S.offMode?.(); S.offMode = null;
}

// ------------------------------------------------------------------ per-frame upkeep (runs every frame while alive)
function update(m, dt) {
  const S = m.tg; if (!S) return;
  const G = m.G, p = m.model.pose;
  if (!m.aggro) { // meditating above his mossy spot; the default idle wander is undone
    m.pos.x = S.home.x; m.pos.z = S.home.z; m.facing = S.homeFace;
    if (Math.random() < dt * 3) S.fx.p('n', F.BAMBOO, m.pos.x + rand(-1.4, 1.4), m.pos.y + rand(1.5, 2.8), m.pos.z + rand(-1.4, 1.4), { vx: rand(-0.3, 0.3), vy: -0.35, vz: rand(-0.3, 0.3), life: 3, size: 0.3, color: TENGU_COL.leaf[0], alpha: 1, alpha1: 0, spin: 1.5 });
    return;
  }
  if (!S.ranAI && TIMED.has(S.st)) tick(m, dt, S.lastTgt?.alive !== false && S.lastTgt?.pos ? S.lastTgt : G.player, 5, 1);
  S.ranAI = false;
  for (const k in S.cds) S.cds[k] -= dt;
  updateTornadoes(m, dt);
  if (S.push) { const q = S.push; q.t -= dt; if (q.t <= 0) S.push = null; else pushPlayer(G, q.x, q.z, q.v * (0.35 + 0.65 * q.t / q.T)); }
  if (S.storm.on) {
    S.storm.k = Math.min(1, S.storm.k + dt * 0.6);
    const P = G.player, A = S.arena;
    if (P && !G.playerDead) {
      const dx = P.pos.x - A.x, dz = P.pos.z - A.z, L = Math.hypot(dx, dz);
      if (L > 0.5 && L < A.r + 4) pushPlayer(G, -dz / L * S.storm.dir, dx / L * S.storm.dir, TUNE.drift * S.storm.k);
    }
    if (S.windSave != null) SHARED_U.uWindStr.value += (S.windSave * 2.6 - SHARED_U.uWindStr.value) * Math.min(1, dt * 1.5);
    if (Math.random() < dt * 8) { // leaves riding round him
      const a = rand(0, TAU), q = S.fx.p('n', F.BAMBOO, m.pos.x, m.pos.y + rand(0.4, 2.6), m.pos.z, { life: 1.1, size: 0.3, size1: 0.2, color: TENGU_COL.leaf[(a * 3 | 0) % 4], alpha: 1, alpha1: 0, spin: 8, fn: F.orbit });
      q.fn = orbitLeaf; q.cen = m.pos; q.ang = a; q.rad = 1.3; q.w = 4 * S.storm.dir; q.rin = 0.3; q.climb = 0.4;
    }
  }
  // floating: soft flaps and a wisp of wind under the geta while hovering high
  if (S.st === 'idle' && p.hover > 0.5 && Math.random() < dt * 6) S.fx.p('a', F.STREAK, m.pos.x + rand(-0.5, 0.5), m.pos.y + 0.2, m.pos.z + rand(-0.5, 0.5), { vx: rand(-2, 2), vy: -1, vz: rand(-2, 2), life: 0.3, size: 0.6, size1: 0.2, color: TENGU_COL.wind, alpha: 0.5, alpha1: 0 });
}
import { orbitFn as orbitLeaf } from './kitA.js';

function onSpawn(m) {
  const home = { x: m.pos.x, z: m.pos.z };
  const fx = tenguFx(m.G.vfx); fx.heightAt = (x, z) => m.world.heightAt(x, z);
  const A = arenaOf(m, home);
  m.tg = { st: 'meditate', t: 0, flag: 0, p2: false, home, homeFace: Math.atan2(A.x - home.x + 0.01, A.z - home.z + 6), arena: A, fx,
    cds: { gust: 1.2, torn: 5.5, dive: 8.5 }, gcd: 0.5, strafe: 1, strafeT: 2, torn: [], torId: 0, summoned: 0, storm: { on: false, k: 0, dir: 1 }, ranAI: false, air: false, push: null };
  m.facing = m.tg.homeFace;
  // meditating: cross-legged float, eyes closed, wings folded, the fan held upright before him
  Object.assign(m.model.pose, { hover: 0.4, bob: 0.07, flap: 0.8, flapAmp: 0.05, wingY: 1.3, wingZ: -0.05, fanX: 0.25, fanZ: 0.35, lids: 1, head: 0.12 });
  fx.warm();
  sfx('tengu_caw', m.pos, { vol: 0.001 }); // (nothing audible: primes nothing, keeps the id in the sfx table's use list)
}
function onDeath(m) {
  const S = m.tg; if (!S) return;
  for (const o of S.torn) o.done = true;
  S.storm.on = false; restoreWind(m);
  if (S.air) { S.air = false; m.untargetable = false; }
  m.model.root.visible = true; m.shadow.visible = true;
  S.tele?.kill?.(); for (const sp of S.spots || []) sp.tele?.kill?.();
  const x = m.pos.x, y = m.pos.y, z = m.pos.z;
  S.fx.feathers(x, y + 1.4, z, { n: 26, speed: 5, up: 4, life: 2 });
  S.fx.leafBurst(x, y + 1, z, { n: 24, frame: F.BAMBOO, colors: TENGU_COL.leaf, speed: 5, up: 4, life: 2 });
  sfx('tengu_defeat', m.pos);
}

export const MONSTERS = {
  tenguMaster: {
    adds: ['karasuKozo', 'kamaitachi', 'kodama', 'takenoko'], // (his waves: dungeon/zoneRun.js warms them with the floor)
    name: 'Master Tengu', build: 'tenguMaster', boss: true, subtitle: 'The mountain wind answers to him!',
    scale: 2.3, radius: 1.0, vr: 1.15, speed: 2.5, life: 1, dmg: 1, move: 'none', attack: { type: 'melee', range: 1.5, cd: 3, windup: 0.6 },
    variants: [{}], material: 'silk',
    stats: { name: 'Master Tengu', life: 1.0, dmg: 1.0, def: 1.0, speed: 1.1, xp: 1.35, element: 'phys', res: { zap: 20, frost: -10 } },
    ai(m, dt, target, d, slowMul) { const S = m.tg; if (!S) return false; S.ranAI = true; S.lastTgt = target; return tick(m, dt, target, d, slowMul); },
    update, onSpawn, onDeath,
    damageTaken: (m, dmg) => (m.tg?.air ? 0 : dmg),
    // test hooks (src/tests/regionBosses.js): force a move right now
    debug: {
      gust: m => { const P = m.G.player; set(m.tg, 'idle'); startGust(m, P); },
      tornado: m => { set(m.tg, 'idle'); startTornado(m, m.G.player); },
      dive: m => { set(m.tg, 'idle'); startDive(m, m.G.player); },
      summon: m => { set(m.tg, 'idle'); startSummon(m); },
      phase2: m => { m.life = Math.min(m.life, m.lifeMax * 0.49); m.tg.summoned = Math.max(m.tg.summoned, 1); set(m.tg, 'idle'); startStorm(m); },
      rest: m => startRest(m, 3),
      state: m => ({ st: m.tg.st, p2: m.tg.p2, cds: { ...m.tg.cds }, torn: m.tg.torn.length, air: m.tg.air, life: Math.round(m.life), lifeMax: m.lifeMax, lvl: m.level }),
    },
  },
  karasuKozo: {
    name: 'Crow Tengu', build: 'karasuKozo', radius: 0.34, vr: 0.44, speed: 3.1, life: 1, dmg: 1, move: 'hop', pack: 1,
    attack: { type: 'charge', range: 5.5, cd: 2.6, windup: 0.6, dash: 10 }, variants: [{ robe: '#ece2ca' }, { robe: '#dfe8f4' }], material: 'silk',
    stats: { name: 'Crow Tengu', life: 0.55, dmg: 0.75, def: 0.7, speed: 1.15, xp: 0.6, element: 'phys', res: { zap: 10 } },
    onSpawn(m) { if (m.bossAdd !== false) sfx('tengu_caw', m.pos, { pitch: 1.5, vol: 0.5 }); },
  },
};
