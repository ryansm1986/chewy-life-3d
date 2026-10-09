// The Expedition Board (docs/COZY.md §4.1; ROADMAP CZ-2): a big noticeboard under a little red gable beside the
// Wayfarer's Post, its planks pinned with job notes (one is a little map), a paw plaque, a paper lantern and a
// traveller's pack and staff leaning on its posts. F (A, a tap) opens the Board panel (ui/expeditions.js). Once the
// Adventurers' Guild is built (CZ-7) a second board hangs inside its door; both open the same panel.
// One merged vertex-coloured mesh + its ink hull + the lantern (3 draw calls), a LightPool lantern light at night, and a
// "!" over it while a report waits.
//   addExpeditionBoard(G, village) → { group, pos, setMark(kind), update(dt) }
import * as THREE from 'three';
import { makeToon, makeOutline } from '../gfx/materials.js';
import { paint, merge, xf } from '../gfx/geom.js';
import { LANDMARKS } from '../world/layout.js';

const C = h => new THREE.Color(h);
const col = (g, hex) => { const c = C(hex); return paint(g, (p, n, o) => o.copy(c)); };
const box = (w, h, d, hex, p = [0, 0, 0], r = [0, 0, 0]) => col(xf(new THREE.BoxGeometry(w, h, d, 1, 1, 1), { p, r }), hex);
const cyl = (r0, r1, h, hex, p = [0, 0, 0], r = [0, 0, 0], seg = 10) => col(xf(new THREE.CylinderGeometry(r0, r1, h, seg), { p, r }), hex);
const ball = (r, hex, p = [0, 0, 0], s = [1, 1, 1], seg = 10) => col(xf(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 3)), { p, s }), hex);
const rbox = (w, h, d, hex, p, r = [0, 0, 0], k = 0.35) => col(xf(new THREE.SphereGeometry(0.5, 12, 9), { p, r, s: [w, h, d] }), hex); // (a soft, pillowy box: bags and bedrolls)

// a pinned note: paper, a few lines of "writing", a pin; tilt in radians round the board's normal
function note(x, y, w, h, paper, tilt, pin, lines = 3, ink = '#b49a80') {
  const P = [], z0 = 0.07;
  P.push(box(w, h, 0.012, paper, [x, y, z0], [0, 0, tilt]));
  const c = Math.cos(tilt), s = Math.sin(tilt), at = (u, v) => [x + u * c - v * s, y + u * s + v * c, z0 + 0.008];
  for (let i = 0; i < lines; i++) { const v = h * 0.22 - i * h * 0.17, len = w * (i === lines - 1 ? 0.45 : 0.72); P.push(box(len, 0.014, 0.004, ink, at(-w * 0.36 + len / 2, v), [0, 0, tilt])); }
  P.push(ball(0.026, pin, at(0, h * 0.42), [1, 1, 0.7], 8));
  return P;
}
// a paw print in flat discs (on a plaque, a note)
function paw(x, y, z, k, hex) {
  const disc = (dx, dy, r, sx = 1) => col(xf(new THREE.CylinderGeometry(r, r, 0.01, 12), { p: [x + dx * k, y + dy * k, z], r: [Math.PI / 2, 0, 0], s: [sx, 1, 1] }), hex);
  return [disc(0, -0.02, 0.05, 1.15), disc(-0.055, 0.045, 0.022), disc(-0.02, 0.07, 0.022), disc(0.02, 0.07, 0.022), disc(0.055, 0.045, 0.022)];
}

export function buildExpeditionBoard() {
  const dark = '#6e4830', wood = '#8a5e3e', stone = '#b8b0a4', red = '#b8483a';
  const P = [];
  // the posts on stone footings, with a little moss
  for (const sx of [-1, 1]) {
    P.push(cyl(0.17, 0.21, 0.16, stone, [sx * 0.98, 0.08, 0], [0, 0.4, 0], 8), box(0.14, 2.2, 0.14, wood, [sx * 0.98, 1.16, 0]));
    P.push(ball(0.09, '#8ab46a', [sx * 0.98 + 0.12, 0.13, 0.08], [1.4, 0.45, 1], 8));
  }
  // the board: four planks of slightly different woods, a back brace, the top and bottom rails
  const planks = ['#cf9f6e', '#c4935f', '#d2a676', '#c08c5a'];
  planks.forEach((c, i) => P.push(box(1.82, 0.27, 0.06, c, [0, 0.86 + i * 0.29, 0])));
  P.push(box(1.84, 0.08, 0.05, dark, [0, 1.22, -0.06], [0, 0, 0.42]));
  P.push(box(2.06, 0.1, 0.1, dark, [0, 2.03, 0.01]), box(2.06, 0.09, 0.09, dark, [0, 0.68, 0.01]));
  // the gable: two boards (a darker underside), tile battens running down each slope, a ridge beam with gold caps
  for (const sz of [-1, 1]) {
    const tilt = [sz * 0.52, 0, 0], at = (d, up = 0) => [0, 2.31 - Math.sin(0.52) * d + Math.cos(0.52) * up, sz * Math.cos(0.52) * d + sz * Math.sin(0.52) * up];
    P.push(box(2.5, 0.05, 0.62, '#7a3a34', at(0.27, -0.03), tilt), box(2.5, 0.05, 0.62, red, at(0.27, 0.02), tilt));
    for (let i = 0; i < 9; i++) P.push(box(0.07, 0.05, 0.6, '#c85a48', [-1.16 + i * 0.29, at(0.27, 0.06)[1], at(0.27, 0.06)[2]], tilt));
    P.push(box(2.56, 0.07, 0.07, '#8a3a32', at(0.58, 0.02), tilt)); // (the eave's edge)
  }
  P.push(box(2.6, 0.1, 0.1, dark, [0, 2.48, 0]), ball(0.07, '#e8c25a', [-1.31, 2.48, 0], [1, 1, 1], 8), ball(0.07, '#e8c25a', [1.31, 2.48, 0], [1, 1, 1], 8));
  // the sign on the ridge: a cream plank in a dark frame with a red paw, on two little posts (the expedition sign)
  P.push(box(0.05, 0.16, 0.05, dark, [-0.24, 2.58, 0]), box(0.05, 0.16, 0.05, dark, [0.24, 2.58, 0]));
  P.push(box(0.74, 0.3, 0.06, dark, [0, 2.79, 0]), box(0.66, 0.23, 0.07, '#f6e6c4', [0, 2.79, 0]));
  P.push(...paw(0, 2.79, 0.04, 1.05, red));
  // the notes (one is a little map with a dotted trail and a red cross; one carries a paw stamp)
  P.push(...note(-0.62, 1.52, 0.34, 0.42, '#fffaf0', 0.06, '#e8503a'));
  P.push(...note(-0.18, 1.6, 0.3, 0.36, '#ffe2ec', -0.08, '#5a8ad8', 3, '#c890a0'));
  P.push(...note(0.3, 1.5, 0.42, 0.46, '#e2f2ff', 0.03, '#ffd24a', 0)); // (the map)
  { const x = 0.3, y = 1.5, t = 0.03, c = Math.cos(t), s = Math.sin(t), at = (u, v) => [x + u * c - v * s, y + u * s + v * c, 0.082];
    for (let i = 0; i < 6; i++) P.push(box(0.035, 0.012, 0.004, '#7a9a5a', at(-0.15 + i * 0.05, -0.12 + Math.sin(i * 1.3) * 0.07), [0, 0, t + 0.4 * Math.cos(i)]));
    P.push(box(0.07, 0.016, 0.004, '#e8503a', at(0.15, 0.06), [0, 0, t + 0.78]), box(0.07, 0.016, 0.004, '#e8503a', at(0.15, 0.06), [0, 0, t - 0.78]));
    P.push(col(xf(new THREE.CircleGeometry(0.05, 10), { p: at(-0.1, 0.1), r: [0, 0, 0] }), '#a8d890')); }
  P.push(...note(0.72, 1.62, 0.28, 0.34, '#e4f6ea', -0.05, '#e8503a', 2));
  P.push(...note(-0.55, 1.02, 0.3, 0.3, '#fff2c4', -0.05, '#8fd0a0', 2));
  P.push(...note(0.0, 1.06, 0.36, 0.32, '#fffaf0', 0.07, '#e8503a', 1));
  P.push(...paw(0.03, 1.02, 0.084, 0.6, '#e8889a'));
  P.push(...note(0.62, 1.04, 0.32, 0.34, '#ffe8d0', 0.1, '#5a8ad8', 3));
  // a traveller's pack leaning on the right post: an indigo bag, its flap, a bedroll with red straps
  P.push(rbox(0.46, 0.56, 0.32, '#4f78c0', [1.22, 0.3, 0.28], [0.12, -0.3, -0.12]));
  P.push(rbox(0.44, 0.2, 0.3, '#3f62a8', [1.2, 0.5, 0.32], [0.3, -0.3, -0.12]));
  P.push(rbox(0.2, 0.18, 0.08, '#6a90d4', [1.18, 0.24, 0.47], [0.1, -0.3, -0.1]));
  P.push(cyl(0.11, 0.11, 0.56, '#efd8a8', [1.24, 0.66, 0.22], [0, -0.3, Math.PI / 2 - 0.12], 12));
  for (const d of [-0.16, 0.16]) P.push(cyl(0.118, 0.118, 0.04, '#d8503a', [1.24 + d * Math.cos(0.3), 0.66 + d * 0.12, 0.22 + d * Math.sin(0.3)], [0, -0.3, Math.PI / 2 - 0.12], 12));
  // a walking staff on the left post, a little gourd tied to it
  P.push(cyl(0.025, 0.03, 1.6, '#a8784e', [-1.2, 0.78, 0.18], [0.08, 0, 0.18], 8));
  P.push(ball(0.075, '#e89a4a', [-1.31, 1.2, 0.2], [1, 1.25, 1], 10), ball(0.05, '#e89a4a', [-1.33, 1.33, 0.2], [1, 1, 1], 8), cyl(0.014, 0.014, 0.05, '#7a5236', [-1.335, 1.39, 0.2]));
  const geo = merge(P);
  const mat = makeToon({ vertexColors: true, brush: 0.16, rim: 0.4 });
  const g = new THREE.Group(); g.name = 'expeditionBoard';
  const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true;
  const ol = new THREE.Mesh(geo, makeOutline('#3a2230', 0.016));
  // the paper lantern at the gable's left end (the light itself is the world's LightPool)
  const lg = merge([ball(0.12, '#fff0d0', [0, 0, 0], [1, 1.25, 1], 12), cyl(0.06, 0.06, 0.035, red, [0, 0.15, 0]), cyl(0.06, 0.06, 0.035, red, [0, -0.15, 0]), cyl(0.008, 0.008, 0.16, '#3a2230', [0, 0.25, 0])]);
  const lantern = new THREE.Mesh(lg, makeToon({ vertexColors: true, emissive: '#ffb860', emissiveIntensity: 0.55, rim: 0.3 }));
  lantern.position.set(-1.18, 1.86, 0.12);
  g.add(m, ol, lantern);
  g.userData.lantern = lantern;
  return g;
}

/** the board's spot: beside the Wayfarer's Post, screen-right of it at the default camera, facing the camera */
export function boardSpot() {
  const L = LANDMARKS.travel; if (!L) return null;
  return { x: L.x + 2.0, z: L.z - 2.0, rot: Math.PI / 4 };
}
/** Put the board in the village: the model, colliders, the lantern light, the "!" and the interaction */
export function addExpeditionBoard(G, village) {
  const S = boardSpot(); if (!S || !village) return null;
  const g = buildExpeditionBoard();
  const y = village.heightAt(S.x, S.z);
  g.position.set(S.x, y, S.z); g.rotation.y = S.rot;
  village.scene.add(g);
  const ax = Math.cos(S.rot), az = -Math.sin(S.rot); // (the board's local +x in the world)
  for (const k of [-0.98, 0, 0.98]) village.collision.addCircle(S.x + ax * k, S.z + az * k, k ? 0.3 : 0.34, 'expeditionBoard');
  village.collision.addCircle(S.x + ax * 1.25 + Math.sin(S.rot) * 0.3, S.z + az * 1.25 + Math.cos(S.rot) * 0.3, 0.28, 'expeditionBoard'); // (the pack)
  const lp = g.userData.lantern.getWorldPosition(new THREE.Vector3());
  village.lightPool.addSource({ pos: lp, color: new THREE.Color('#ffc880'), intensity: 2.6, radius: 4.5, flicker: 0.25, nightOnly: true });
  const fx = Math.sin(S.rot), fz = Math.cos(S.rot); // (its front)
  const pos = new THREE.Vector3(S.x + fx * 1.15, y, S.z + fz * 1.15);
  const it = { pos, radius: 1.8, label: 'Read the Expedition Board', onInteract: () => G.ui?.open?.('expeditions', { at: 'board' }) };
  village.interactables.push(it);
  // the "!" over the gable while a report waits (the village's sprite look: gfx/vfx.js emoteTexture)
  let mark = null, kind = null, t = 0;
  const top = new THREE.Vector3(S.x, y + 3.25, S.z);
  return {
    group: g, pos, it, spot: S,
    setMark(k) {
      if (k !== '!') k = null;
      if (k === kind) return;
      kind = k;
      if (!k) { if (mark) mark.visible = false; return; }
      if (!mark) { mark = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false, toneMapped: false })); mark.renderOrder = 25; village.scene.add(mark); }
      const tex = G.village?.vfx?.emoteTexture?.(k) || G.vfx?.emoteTexture?.(k);
      if (tex) { mark.material.map = tex; mark.material.needsUpdate = true; }
      mark.visible = true;
    },
    update(dt) { if (!mark?.visible) return; t += dt; mark.position.set(top.x, top.y + Math.sin(t * 3) * 0.08, top.z); mark.scale.setScalar(0.64 + Math.sin(t * 6) * 0.02); },
  };
}
