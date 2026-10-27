// Kite Hill and the Wishing Tree (ROADMAP HP-1; the concept: tools/blender/work/codex/hollow-pois/concepts/
// poi-04-wishtree.png): one huge old camphor (a thick twisting trunk on flaring roots, big limbs, a broad rounded crown
// of chunky leaf clusters: leaves only, the masses cast the shadow), a rope swing on its low branch, a two-post rack of
// wooden wish plaques with red cords (paw and leaf marks) and more plaques hanging from the low limbs, two diamond kites
// (one caught in the crown, one flying on its string from a spool), a red-check picnic blanket with a basket and two
// cups, a low timber-and-rope fence along the trail, mossy stones, bamboo, flowering shrubs. Interactions: "Ride the
// swing" (it rocks while you sit) and "Hang a wish" (once a day: a new plaque on the rack, Shadow's wish, a few coins).
import * as THREE from 'three';
import { G, V, PI, col, MATS } from '../../buildings/kit.js';
import { leafGeo, blossomGeo, bamboo, chochin, nz } from '../../buildings/props.js';
import { tube, branch, puff, mergeGeometries } from '../../../gfx/geom.js';
import { clamp, TAU, mulberry32 } from '../../../core/util.js';
import { SHADOW_ONLY_LAYER } from '../../vegetation.js';
import { site, bare, groundStone, post, rope, flowers, fern, tuft, shrub, pivotKit, WOOD, WOOD_HI, WOOD_D, ROPE, tris } from './_west.js';

const BARK = '#7f5c42', BARK_D = '#5a3c2a', BARK_HI = '#a07a52', LEAVES = ['#7cb03a', '#68a034', '#8fc046', '#5a8f30'];
const PLAQUE = '#e3bd7f', CORD = '#c8432f';
const TR = { x: -1.8, z: -1.8 }; // the trunk (local)
const RACK = { x: 1.55, z: -0.4, yaw: PI / 4, w: 2.2 }; // the wish rack: centre, facing (+z toward the camera side), width
const SWING = { x: -1.65, z: 1.95, y: 2.95, yaw: PI / 2 }; // the swing's pivot on the low branch (it faces east)
const WISHES = [
  'I wished for a picnic every day. And a slightly bigger blanket.',
  'I wished that everyone in Blossom Hollow sleeps cosy tonight.',
  "My wish is a secret. ...It's about treats. Don't tell.",
  'I wished we keep going on adventures together. Always.',
  'I wished the kites never get stuck again. Sorry, little kite.',
];
const SLOTS = 6; // new plaques hang on the rack's low rail

export function build(ctx) {
  const S = site(ctx, 0.3), { H } = S;
  const st = ctx.G.state?.outskirts || {};
  const gT = H(TR.x, TR.z);
  bare(S, (x, z) => Math.hypot(x - TR.x, z - TR.z) < 1.9 || (Math.abs(x + 4.35) < 1.5 && Math.abs(z - 3.6) < 1.2), 180);

  // the crown's clusters: a ring, an inner ring, a top; the camera side carried a little higher so the swing shows
  const crown = [];
  { const r = mulberry32(4040);
    for (let k = 0; k < 9; k++) { const a = k / 9 * TAU + r() * 0.3, d = 3.4 + r() * 0.6, cx = TR.x + Math.cos(a) * d, cz = TR.z + Math.sin(a) * d, front = Math.max(0, (Math.cos(a) + Math.sin(a)) / Math.SQRT2); crown.push({ x: cx, y: gT + 4.5 + r() * 0.9 + front * 0.6, z: cz, R: 1.25 + r() * 0.55 }); }
    for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + 0.6 + r() * 0.3, d = 1.6 + r() * 0.4; crown.push({ x: TR.x + Math.cos(a) * d, y: gT + 6.0 + r() * 0.8, z: TR.z + Math.sin(a) * d, R: 1.35 + r() * 0.4 }); }
    crown.push({ x: TR.x + 0.2, y: gT + 7.2, z: TR.z - 0.1, R: 1.55 });
  }
  const swingY = gT + SWING.y, L = swingY - 0.47 - H(SWING.x, SWING.z);

  const inst = S.kit(404, B => {
    tree(B, S, gT, crown);
    rack(B, S);
    picnic(B, S, -4.35, 3.6, -0.35);
    spool(B, S, 3.35, 1.55);
    // the kites' strings: the flier's from the spool up to its bridle, the caught one's dangling from the crown
    const k2 = V(3.7, gT + 8.4, -2.4), k1 = V(TR.x - 2.0, gT + 7.6, TR.z + 1.9);
    { const a = V(3.35, H(3.35, 1.55) + 0.2, 1.55), pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12, p = a.clone().lerp(k2, t); p.y -= Math.sin(t * PI) * 0.6; pts.push({ p, r: 0.008 }); } B.add(tube(pts, 3, false), '#f4ead6'); }
    { const pts = []; for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push({ p: V(k1.x + 0.4 * t, k1.y - 0.5 - t * 1.4, k1.z + 0.6 * t + Math.sin(t * 6) * 0.1), r: 0.008 }); } B.add(tube(pts, 3, false), '#f4ead6'); }
    B.anim({ p: k2.toArray(), kind: 'swing', axis: [0, 0, 1], speed: 0.9, amp: 0.09 }, () => kite(B, ['#77aedd', '#ffd45a', '#77aedd', '#ffd45a'], '#77aedd'));
    B.anim({ p: k1.toArray(), kind: 'swing', axis: [1, 0, 0.3], speed: 0.7, amp: 0.05 }, () => { B.push([0, 0, 0], 0.4, 1, 0, 0.5); kite(B, ['#ec7d78', '#fff1dc', '#ffd45a', '#ec7d78'], '#ec7d78'); B.pop(); });
    // the low timber-and-rope fence along the trail (a gap where the grass spur comes in), stones, plants
    fence(B, S, [[-0.3, 7.55], [0.55, 6.5], [1.3, 5.6]]);
    fence(B, S, [[2.95, 3.5], [4.1, 2.05], [5.3, 0.6], [6.3, -0.75]]);
    for (const [x, z, r] of [[-6.9, -0.4, 1.15], [-6.1, -4.6, 1.0], [-3.6, -6.7, 0.85], [2.3, -5.9, 0.8], [-7.0, 3.6, 0.7], [-0.9, 7.4, 0.45], [5.7, 1.6, 0.42], [3.6, -3.6, 0.5], [-5.2, -6.3, 0.55]]) groundStone(B, S, x, z, r, { moss: 0.55, sink: 0.25 });
    for (const [x, z, n, h] of [[5.6, -4.2, 4, 4.0], [6.6, -2.2, 3, 3.6]]) B.at([x, H(x, z) - 0.05, z], 0, () => bamboo(B, { n, h, spread: 0.5 }));
    shrub(B, S, -6.3, 5.6, { r: 0.65, flowers: ['#f1afc8', '#ff8fb4', '#ffc4d8', '#ffffff'], nf: 28, fs: 0.09 });
    shrub(B, S, -5.6, 1.4, { r: 0.5, color: '#5aa548' });
    shrub(B, S, 0.4, 0.9, { r: 0.5, color: '#62ad45' });
    shrub(B, S, 3.0, -2.6, { r: 0.45, flowers: ['#ffffff', '#c8d8ff'], nf: 10 });
    shrub(B, S, -2.3, 6.4, { r: 0.45, flowers: ['#ffb2cc'], nf: 12 });
    for (const [x, z] of [[-0.9, -0.1], [-3.2, -0.3], [0.2, -3.3], [-3.0, -3.6], [2.8, 0.2], [-5.6, 3.2], [4.6, -1.0]]) fern(B, S, x, z, { s: 0.8 });
    for (const [x, z, c] of [[-1.4, 6.6, 0], [0.6, 4.4, 1], [2.6, 2.3, 0], [4.6, 0.5, 1], [-3.2, 5.3, 0], [-5.9, 4.6, 1], [1.9, -2.1, 0], [-4.4, -1.6, 1], [4.2, -2.4, 0], [-0.4, 2.6, 1], [1.2, 3.4, 0], [2.0, 1.2, 1], [-0.8, 4.6, 0], [3.4, 0.4, 0], [-2.6, 2.9, 1], [0.9, -1.4, 1]]) flowers(B, S, x, z, { n: 5, r: 0.45, colors: c ? ['#ffffff', '#c8d8ff', '#ffb2cc'] : ['#ffb2cc', '#f1afc8', '#ffffff', '#ffd76a'] });
    for (const [x, z] of [[-1.6, 4.5], [1.4, 2.1], [3.9, 3.2], [-4.8, 5.6], [-6.6, 1.8]]) tuft(B, S, x, z, { h: 0.45 });
    B.height = 9;
  });

  // ---- the crown: leaf clusters (their own kit so the wind sways them gently), plaques on the low limbs
  const crownK = S.kit(405, B => { B.push([0, -(gT + 3.0), 0]); leaves(B, crown); branchPlaques(B, gT); B.pop(); }, { y: S.y0 + gT + 3.0, warp: 0 });
  // the masses only cast the crown's solid shadow (layer SHADOW_ONLY_LAYER, as the vegetation's trees)
  const mass = new THREE.Mesh(mergeGeometries(crown.map((c, i) => { const g = puff(V(c.x, c.y, c.z), c.R * 0.92, { detail: 1, noise: 0.15, squash: 0.85, seed: i }); g.deleteAttribute('uv'); return g; })), new THREE.MeshBasicMaterial());
  mass.layers.set(SHADOW_ONLY_LAYER); mass.castShadow = true; mass.receiveShadow = false; S.add(mass, 0, 0, 0); mass.position.set(S.poi.x, S.y0, S.poi.z);

  // ---- the swing: rocks while you sit (a gentle idle sway otherwise)
  const swingK = pivotKit(S, 406, B => swing(B, L), { x: SWING.x, y: swingY, z: SWING.z, yaw: SWING.yaw, lift: 3 });
  // ---- the wishes you've hung: plaques on the rack's low rail (they appear one a day)
  const slots = [];
  for (let i = 0; i < SLOTS; i++) {
    const u = -0.8 + i * 0.32, ux = Math.cos(RACK.yaw), uz = -Math.sin(RACK.yaw);
    const x = RACK.x + ux * u, z = RACK.z + uz * u, y = H(RACK.x, RACK.z) + 0.98;
    const k = pivotKit(S, 410 + i, B => plaque(B, 0.1 + i * 0.07, i % 2, 0.13), { x, y, z, yaw: RACK.yaw, lift: 1 });
    k.group.visible = false; slots.push(k);
  }
  const shown = () => Math.min(SLOTS, st.wishes || 0);
  for (let i = 0; i < shown(); i++) slots[i].group.visible = true;

  // ---- colliders
  S.collide(TR.x, TR.z, 1.15);
  for (const s of [-1, 1]) S.collide(RACK.x + Math.cos(RACK.yaw) * s * (RACK.w / 2), RACK.z - Math.sin(RACK.yaw) * s * (RACK.w / 2), 0.18);
  S.collide(3.35, 1.55, 0.2);
  for (const [x, z, r] of [[-6.9, -0.4, 1.15], [-6.1, -4.6, 1.0], [-3.6, -6.7, 0.85], [2.3, -5.9, 0.8], [-7.0, 3.6, 0.7], [3.6, -3.6, 0.5], [-5.2, -6.3, 0.55]]) S.collide(x, z, r * 0.85);
  S.collide(-4.35 + 0.55, 3.6 - 0.2, 0.28); // (the basket)

  // ---- interactions
  let riding = false, amp = 0.03;
  const seat = S.W(SWING.x, 0, SWING.z), fx = Math.sin(SWING.yaw), fz = Math.cos(SWING.yaw);
  S.interact({
    x: SWING.x + fx * 0.75, z: SWING.z + fz * 0.75, r: 1.2, label: 'Ride the swing',
    onInteract() {
      const s = ctx.sit({ x: seat.x, z: seat.z, face: SWING.yaw, dur: 14, onDone: () => { riding = false; } });
      if (s) { riding = true; ctx.say('Wheee! Higher! ...No, wait, this is high enough.', { once: 'swing' }); }
    },
  });
  const rf = { x: Math.sin(RACK.yaw), z: Math.cos(RACK.yaw) };
  S.interact({
    x: RACK.x + rf.x * 0.85, z: RACK.z + rf.z * 0.85, r: 1.3, label: 'Hang a wish',
    onInteract() {
      const c = S.W(RACK.x, H(RACK.x, RACK.z) + 1.1, RACK.z);
      ctx.pose('pickup', {
        dur: 1.2, at: 0.55, face: { x: c.x, z: c.z },
        onAct() {
          if (ctx.daily('wish')) {
            const n = (st.wishes || 0); st.wishes = n + 1;
            const k = slots[n % SLOTS]; k.group.visible = true;
            ctx.G.vfx?.sparkle?.(k.group.position.clone().add(V(0, -0.1, 0)), { n: 12, color: '#ffe6a0', r: 0.25, rise: 0.6, size: 0.2 });
            ctx.give({ coins: 10, at: c.clone().add(V(0, 0.4, 0)) });
            ctx.say(WISHES[n % WISHES.length]);
          } else ctx.toast('Your wish is already swaying on the rack. One a day!');
        },
      });
    },
  });

  return {
    tris: tris(inst.group) + tris(crownK.group) + tris(swingK.group) + slots.reduce((a, k) => a + tris(k.group), 0),
    update(dt, t) {
      amp += ((riding ? 0.34 : 0.035) - amp) * Math.min(1, dt * (riding ? 0.9 : 1.6));
      const th = amp * Math.sin(t * 2.1);
      swingK.group.rotation.x = th;
      const P = ctx.G.player;
      if (riding && P?.rig?.root) { // (the hero rides along: his rig follows the seat's arc; the player stays put)
        const dx = -L * Math.sin(th) * fx, dz = -L * Math.sin(th) * fz, dy = L * (1 - Math.cos(th));
        P.rig.root.position.set(P.pos.x + dx, P.pos.y + (P.rig.offsetY || 0) + dy, P.pos.z + dz);
      }
    },
  };
}

// ------------------------------------------------------------------ the tree: flaring roots, a thick twisting trunk,
// big limbs out to the crown's clusters, the low swing branch
function tree(B, S, gT, crown) {
  const T = TR, bA = col(BARK_D), bB = col(BARK), bH = col(BARK_HI);
  const bark = (p, n, o) => o.copy(bA).lerp(bB, clamp(0.5 + 0.35 * n.y + 0.3 * Math.sin(Math.atan2(n.z, n.x) * 5 + p.y * 1.7) + nz(p.y * 3, p.x * 3) * 0.25)).lerp(bH, clamp(n.y * 0.8 - 0.3) * 0.4);
  // the trunk: a twisting tube from the roots up to the fork
  const pts = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8, tw = t * 1.4; pts.push({ p: V(T.x + Math.sin(tw) * 0.25 * t, gT - 0.3 + t * 3.2, T.z + Math.cos(tw) * 0.18 * t - 0.18 * t), r: 0.95 - t * 0.38 + (i === 0 ? 0.15 : 0) }); }
  B.add(tube(pts, 14, false), bark);
  // twisting ribs on the trunk (the camphor's ropey bark)
  for (let k = 0; k < 5; k++) {
    const a0 = k / 5 * TAU, rp = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8, a = a0 + t * 1.3, r = (0.95 - t * 0.38) * 0.96; rp.push({ p: V(T.x + Math.sin(t * 1.4) * 0.25 * t + Math.cos(a) * r, gT - 0.2 + t * 3.0, T.z + Math.cos(t * 1.4) * 0.18 * t - 0.18 * t + Math.sin(a) * r), r: 0.17 - t * 0.06 }); }
    B.add(tube(rp, 6, false), bark);
  }
  // roots flaring into the ground
  for (let k = 0; k < 7; k++) {
    const a = k / 7 * TAU + 0.3, L = 1.5 + (k % 3) * 0.35, ex = T.x + Math.cos(a) * L, ez = T.z + Math.sin(a) * L;
    B.add(branch(V(T.x + Math.cos(a) * 0.5, gT + 0.7, T.z + Math.sin(a) * 0.5), V(ex, S.H(ex, ez) - 0.12, ez), 0.42, 0.08, V(0, 0.25, 0), 5, 8), bark);
  }
  // limbs: from the fork out to the ring clusters, inner limbs upward
  const fork = V(T.x + 0.25, gT + 2.9, T.z - 0.15);
  crown.forEach((c, i) => {
    if (i >= 14) return;
    const end = V(T.x + (c.x - T.x) * 0.72, c.y - 0.6, T.z + (c.z - T.z) * 0.72);
    const r0 = i < 9 ? 0.32 : 0.26;
    B.add(branch(fork.clone().add(V(0, i < 9 ? -0.2 : 0.3, 0)), end, r0, 0.1, V(0, 0.55, 0), 6, 8), bark);
    if (i < 9 && i % 2 === 0) { const e2 = V(c.x + (c.x - T.x) * 0.1, c.y - 0.2, c.z + (c.z - T.z) * 0.1); B.add(branch(end, e2, 0.1, 0.05, V(0, 0.2, 0), 3, 6), bark); }
  });
  // the low swing branch: out of the trunk at 2 m, bending south past the swing, rope wraps where the swing hangs
  const sw = [V(T.x - 0.1, gT + 2.0, T.z + 0.6), V(SWING.x - 0.15, gT + SWING.y + 0.12, SWING.z - 1.2), V(SWING.x, gT + SWING.y + 0.05, SWING.z), V(SWING.x + 0.25, gT + SWING.y + 0.35, SWING.z + 1.3)];
  const sp = []; for (let i = 0; i <= 12; i++) { const t = i / 12, k = t * 3, j = Math.min(2, Math.floor(k)), f = k - j; sp.push({ p: sw[j].clone().lerp(sw[j + 1], f), r: 0.3 - t * 0.2 }); }
  B.add(tube(sp, 10, true), bark);
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const r = G.torus(0.19, 0.026, 4, 10); r.translate(SWING.x, gT + SWING.y + 0.06, SWING.z + s * 0.38 + (k - 1) * 0.06); B.add(r, ROPE); }
  // a second low limb toward the rack (plaques hang from it)
  B.add(branch(V(T.x + 0.6, gT + 2.4, T.z + 0.2), V(T.x + 3.0, gT + 3.3, T.z + 1.1), 0.22, 0.08, V(0, 0.35, 0), 6, 8), bark);
}

// the crown's leaves: chunky broad leaves shingled over each cluster, lying on its surface with their tips pointing down
// the slope like roof tiles (so each cluster reads as a leafy ball and shades as one), a few tilted out for a ragged edge
function leaves(B, crown) {
  const rr = mulberry32(777), cs = LEAVES.map(col), hi = col('#b8d870'), lo = col('#4a7a30');
  const m = new THREE.Matrix4(), n = V(), t = V(), b = V(), UP = V(0, 1, 0);
  crown.forEach((c) => {
    const N = Math.round(c.R * c.R * 152);
    for (let k = 0; k < N; k++) {
      const u = -0.3 + rr() * 1.3, th = rr() * TAU, s = Math.sqrt(Math.max(0, 1 - Math.min(1, u) ** 2));
      n.set(s * Math.cos(th), Math.min(1, u), s * Math.sin(th)).normalize();
      const p = V(c.x, c.y, c.z).add(V(n.x, n.y * 0.85, n.z).multiplyScalar(c.R * (0.96 + rr() * 0.1)));
      t.set(0, -1, 0).addScaledVector(n, n.y); if (t.lengthSq() < 1e-4) t.set(1, 0, 0); t.normalize().applyAxisAngle(n, (rr() - 0.5) * 2.4);
      n.applyAxisAngle(t.clone().cross(n).normalize(), (rr() - 0.5) * 0.6); // (a little lift off the surface)
      b.crossVectors(t, n).normalize(); t.crossVectors(n, b).normalize();
      const L = 0.34 + rr() * 0.14, g = leafGeo(L, L * 0.5, 0.5);
      m.makeBasis(t, n, b); g.applyMatrix4(m); g.translate(p.x - t.x * L * 0.3, p.y - t.y * L * 0.3, p.z - t.z * L * 0.3);
      const k0 = cs[Math.floor(rr() * cs.length)].clone().lerp(rr() < 0.5 ? hi : lo, rr() * 0.3);
      B.add(g, k0, 'leaf');
    }
  });
  void UP;
}
// wish plaques hanging from the low limbs at the crown's edge
function branchPlaques(B, gT) {
  const at = [[SWING.x - 0.05, gT + 2.95, SWING.z - 0.8, 0.3], [SWING.x + 0.1, gT + 3.15, SWING.z + 0.95, 0.4], [TR.x + 1.6, gT + 2.8, TR.z + 0.7, 0.25], [TR.x + 2.5, gT + 3.1, TR.z + 0.95, 0.35], [TR.x + 2.0, gT + 2.95, TR.z + 0.85, 0.3]];
  at.forEach(([x, y, z, cord], i) => B.at([x, y, z], 0.4 + i * 0.7, () => plaque(B, cord, i % 2, 0.15)));
}
// a wooden wish plaque (an ema: a little house shape) hanging on a red cord from local (0, 0, 0): it sways in the
// wind (the cloth bucket: uv.y 1 at the cord's knot); a paw (kind 0) or a leaf (kind 1) mark on both faces
function plaque(B, cord, kind, s = 0.15) {
  const w = s, h = s * 1.45, y0 = -cord;
  const c = G.cyl(0.006, 0.006, cord, 3); c.translate(0, -cord / 2, 0); B.add(c, CORD);
  const sh = new THREE.Shape(); sh.moveTo(-w / 2, -h); sh.lineTo(w / 2, -h); sh.lineTo(w / 2, -h * 0.25); sh.lineTo(0, 0); sh.lineTo(-w / 2, -h * 0.25); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.018, bevelEnabled: false }); g.translate(0, y0, -0.009);
  const parts = [g];
  for (const sz of [1, -1]) {
    const put = (g, x, y) => { if (sz < 0) g.rotateY(PI); g.translate(x, y, sz * 0.0105); parts.push(g); };
    if (kind === 0) { // a paw: a pad and four toes
      const pad = G.disc(w * 0.17, 8); pad.scale(1.2, 1, 1); put(pad, 0, y0 - h * 0.66);
      for (let t = 0; t < 4; t++) put(G.disc(w * 0.075, 6), (t - 1.5) * w * 0.17, y0 - h * 0.44 - Math.abs(t - 1.5) * 0.012);
    } else { const lf = blossomGeo(w * 0.28, 2, 0.15, true, 3); lf.rotateX(PI / 2); put(lf, 0, y0 - h * 0.58); }
  }
  const pc = col(PLAQUE), mk = col(kind ? '#6a9a3a' : '#7a4a2a');
  const geos = parts.map((p, i) => { const q = p.index ? p.toNonIndexed() : p; q.deleteAttribute('uv'); if (!q.attributes.normal) q.computeVertexNormals(); const n = q.attributes.position.count, cc = new Float32Array(n * 3), k = i === 0 ? pc : mk; for (let j = 0; j < n; j++) cc.set([k.r, k.g, k.b], j * 3); q.setAttribute('color', new THREE.BufferAttribute(cc, 3)); return q; });
  const all = mergeGeometries(geos);
  B.cloth(all, null, { x0: -w / 2, x1: w / 2, yTop: y0 + 0.02, yBot: y0 - h * 2.2 });
  const knot = G.sph(0.012, 5, 3); knot.translate(0, y0 + 0.004, 0); B.add(knot, CORD);
}

// ------------------------------------------------------------------ the wish rack: two round posts, a top log and a
// low rail lashed with rope, plaques hanging from both
function rack(B, S) {
  const R = RACK, ux = Math.cos(R.yaw), uz = -Math.sin(R.yaw), gy = S.H(R.x, R.z);
  const ends = [-1, 1].map(s => [R.x + ux * s * R.w / 2, R.z + uz * s * R.w / 2]);
  const tops = ends.map(([x, z]) => post(B, S, x, z, 1.55, { r: 0.09 }));
  const top = (y) => ends.map(([x, z]) => V(x, gy + y, z));
  for (const [y, r, c] of [[1.45, 0.075, WOOD], [1.0, 0.055, WOOD_D]]) {
    const [a, b] = top(y); const ext = b.clone().sub(a).normalize().multiplyScalar(0.18);
    B.add(tube([{ p: a.clone().sub(ext), r }, { p: b.clone().add(ext), r }], 8, false), (p, n, o) => o.set(c).multiplyScalar(0.85 + 0.2 * clamp(n.y * 0.5 + 0.5)));
    for (const e of [a, b]) for (let k = 0; k < 2; k++) { const t = G.torus(r + 0.03, 0.02, 4, 8); t.rotateY(-R.yaw); t.translate(e.x + ux * (k ? 0.05 : -0.05), e.y, e.z + uz * (k ? 0.05 : -0.05)); B.add(t, ROPE); }
  }
  void tops;
  // a paper lantern hung from the right post's top (the place's one light, warm at dusk)
  { const [x, z] = ends[1]; B.at([x + ux * 0.17, gy + 1.38, z + uz * 0.17], R.yaw, () => chochin(B, { r: 0.12, h: 0.22, color: '#fff0d0', cord: 0.03 })); B.light([x + ux * 0.17, gy + 1.22, z + uz * 0.17], { color: '#ffc880', intensity: 1.5, radius: 5, flicker: 0.4 }); }
  // the plaques already there: a row on the top log, a few on the low rail (new wishes fill the rest)
  for (let i = 0; i < 7; i++) { const u = -0.9 + i * 0.3; B.at([R.x + ux * u, gy + 1.43, R.z + uz * u], R.yaw, () => plaque(B, 0.09 + (i % 3) * 0.05, i % 2, 0.14)); }
}

// ------------------------------------------------------------------ the picnic: a coral-and-cream check blanket lying
// on the grass, a wicker basket with a lid and handle, two cups
function picnic(B, S, x, z, rot) {
  const W = 2.0, D = 1.5, g = new THREE.PlaneGeometry(W, D, 16, 12); g.rotateX(-PI / 2); g.rotateY(rot);
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const px = p.getX(i) + x, pz = p.getZ(i) + z; p.setXYZ(i, px, S.H(px, pz) + 0.035 + 0.01 * Math.sin(px * 3 + pz * 2), pz); }
  g.computeVertexNormals();
  const coral = col('#ec7d78'), cream = col('#fff3e2'), mid = col('#f4b6a6'), c = Math.cos(-rot), s = Math.sin(-rot);
  B.add((() => { const q = g.toNonIndexed(); const pp = q.attributes.position, cc = new Float32Array(pp.count * 3);
    for (let f = 0; f < pp.count; f += 3) {
      let cx = 0, cz = 0; for (let k = 0; k < 3; k++) { cx += pp.getX(f + k) / 3; cz += pp.getZ(f + k) / 3; }
      const lx = (cx - x) * c - (cz - z) * s, lz = (cx - x) * s + (cz - z) * c;
      const a = Math.floor((lx + W / 2) / (W / 8)) % 2, b = Math.floor((lz + D / 2) / (D / 6)) % 2, k = a && b ? coral : a || b ? mid : cream;
      for (let j = 0; j < 3; j++) cc.set([k.r, k.g, k.b], (f + j) * 3);
    }
    q.setAttribute('color', new THREE.BufferAttribute(cc, 3)); return q; })(), null);
  // the basket
  const bx = x + 0.55 * Math.cos(rot) + 0.2 * Math.sin(rot), bz = z - 0.55 * Math.sin(rot) - 0.2 * Math.cos(rot) - 0.2, by = S.H(bx, bz) + 0.04;
  B.at([bx, by, bz], rot, () => {
    const body = G.box(0.5, 0.28, 0.35, 0.05); body.translate(0, 0.14, 0);
    B.add(body, (pp, n, o) => o.set('#c58a48').multiplyScalar(Math.abs(n.y) > 0.5 ? 0.95 : (Math.floor(pp.y * 28) + Math.floor((pp.x + pp.z) * 22)) % 2 ? 0.82 : 1.02));
    const lid = G.box(0.52, 0.06, 0.37, 0.025); lid.translate(0, 0.31, 0); B.add(lid, (pp, n, o) => o.set('#b67a3c').multiplyScalar(n.y > 0.5 ? 1.05 : 0.85));
    const hd = G.torus(0.17, 0.018, 4, 12, PI); hd.translate(0, 0.33, 0); B.add(hd, '#8a5a30');
    const clasp = G.box(0.07, 0.08, 0.02, 0); clasp.translate(0, 0.27, 0.185); B.add(clasp, '#7a4a2a');
  });
  for (const [dx, dz, cc] of [[-0.25, 0.15, '#4a78b8'], [0.05, 0.3, '#fff3e2']]) {
    const cx = x + dx * Math.cos(rot) + dz * Math.sin(rot), cz = z - dx * Math.sin(rot) + dz * Math.cos(rot) - 0.1, cy = S.H(cx, cz) + 0.04;
    const cup = G.lathe([[0.001, 0], [0.045, 0.002], [0.05, 0.05], [0.052, 0.1], [0.044, 0.1], [0.001, 0.09]], 10); cup.translate(cx, cy, cz); B.add(cup, cc);
    const h = G.torus(0.025, 0.008, 4, 8, PI * 1.3); h.rotateZ(-PI / 2 - 0.5); h.translate(cx + 0.05, cy + 0.055, cz); B.add(h, cc);
  }
}

// the kite string's ground spool: a wooden reel on a little stake
function spool(B, S, x, z) {
  const y = S.H(x, z);
  const stake = G.cyl(0.02, 0.025, 0.4, 5); stake.translate(x, y + 0.1, z); B.add(stake, WOOD_D);
  B.at([x, y + 0.18, z], 0.6, () => {
    const core = G.cyl(0.05, 0.05, 0.22, 10); core.rotateZ(PI / 2); B.add(core, '#f4ead6');
    for (const s of [-1, 1]) { const d = G.cyl(0.1, 0.1, 0.025, 12); d.rotateZ(PI / 2); d.translate(s * 0.12, 0, 0); B.add(d, WOOD); }
    const h = G.cyl(0.015, 0.015, 0.36, 5); h.rotateZ(PI / 2); B.add(h, WOOD_D);
  });
}

// a diamond kite in its own frame (the bridle at the origin, face toward +z): four coloured panels, two spars, a
// ribbon tail with bows
function kite(B, cols, tailC) {
  const W = 0.8, Hh = 1.0, top = V(0, Hh * 0.62, 0), bot = V(0, -Hh * 0.38, 0), l = V(-W / 2, Hh * 0.22, 0), r = V(W / 2, Hh * 0.22, 0), c = V(0, Hh * 0.22, 0.04);
  const tri = (a, b, d, cc) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([...a.toArray(), ...b.toArray(), ...d.toArray()], 3)); g.computeVertexNormals(); B.add(g, cc); const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute([...a.toArray(), ...d.toArray(), ...b.toArray()], 3)); g2.computeVertexNormals(); B.add(g2, col(cc).multiplyScalar(0.8)); };
  tri(top, l, c, cols[0]); tri(top, c, r, cols[1]); tri(l, bot, c, cols[2]); tri(c, bot, r, cols[3]);
  B.add(tube([{ p: top.clone().add(V(0, 0, 0.02)), r: 0.012 }, { p: bot.clone().add(V(0, 0, 0.02)), r: 0.012 }], 4, false), '#8a5a30');
  B.add(tube([{ p: l.clone().add(V(0, 0, 0.03)), r: 0.012 }, { p: r.clone().add(V(0, 0, 0.03)), r: 0.012 }], 4, false), '#8a5a30');
  const tp = []; for (let i = 0; i <= 8; i++) { const t = i / 8; tp.push({ p: V(Math.sin(t * 5) * 0.15, -Hh * 0.38 - t * 1.25, Math.sin(t * 3) * 0.08), r: 0.014 }); }
  const tl = tube(tp, 4, false); tl.scale(1, 1, 0.4); B.add(tl, tailC);
  for (let k = 1; k <= 3; k++) {
    const t = k / 3.4, p = V(Math.sin(t * 5) * 0.15, -Hh * 0.38 - t * 1.25, Math.sin(t * 3) * 0.08);
    for (const s of [-1, 1]) { const b = G.cone(0.06, 0.13, 4); b.rotateZ(s * PI / 2); b.scale(1, 1, 0.35); b.translate(p.x + s * 0.065, p.y, p.z); B.add(b, k % 2 ? '#fff1dc' : tailC); }
  }
}

// the swing in its own frame (the branch's pivot at the origin; the seat hangs L below, facing +z): two ropes with
// knots, a honey plank seat with rounded edges
function swing(B, L) {
  for (const s of [-1, 1]) {
    B.add(tube([{ p: V(s * 0.36, 0, 0), r: 0.022 }, { p: V(s * 0.36, -L + 0.06, 0), r: 0.022 }], 5, false), (p, n, o) => o.set(ROPE).multiplyScalar(0.88 + 0.12 * Math.sin(p.y * 40)));
    const k = G.sph(0.04, 6, 4); k.scale(1, 1.4, 1); k.translate(s * 0.36, -L + 0.09, 0); B.add(k, ROPE);
  }
  const seat = G.box(0.86, 0.075, 0.32, 0.03); seat.translate(0, -L + 0.0, 0); B.add(seat, (p, n, o) => o.set(WOOD).multiplyScalar(n.y > 0.5 ? 1.05 : 0.82));
  for (const s of [-1, 1]) { const g = G.box(0.03, 0.08, 0.34, 0); g.translate(s * 0.25, -L - 0.005, 0); B.add(g, WOOD_D); }
}

// a low timber-and-rope fence: round posts, a timber rail at the top and one low, lashed at the posts
function fence(B, S, pts) {
  const tops = pts.map(([x, z]) => post(B, S, x, z, 0.75, { r: 0.08 }));
  for (let i = 0; i < pts.length - 1; i++) {
    const a = tops[i].clone().add(V(0, 0.1, 0)), b = tops[i + 1].clone().add(V(0, 0.1, 0));
    rope(B, a, b, { sag: 0.015, r: 0.042, color: WOOD });
    rope(B, a.clone().add(V(0, -0.36, 0)), b.clone().add(V(0, -0.36, 0)), { sag: 0.01, r: 0.032, color: WOOD_D });
  }
  for (const [x, z] of pts) S.collide(x, z, 0.15);
}
void WOOD_HI; void MATS;
