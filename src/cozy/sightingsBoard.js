// Blossom Hollow's Sightings board (docs/COZY.md §6.3; ROADMAP CZ-4): a narrow wanted-board beside the Expedition Board
// (the Wayfarer's Post, the Expedition Board, then this one, left to right on screen): a dark frame under a little shingled roof hung with ofuda, three posted
// sighting notes, each with a red oni stamp, claw-scratch marks across one, a red pin. F (A, a tap) opens the Sightings
// panel (ui/sightings.js). One merged vertex-coloured mesh + its ink hull (2 draw calls); a "!" over it while today's
// sightings haven't been read.
//   addSightingsBoard(G, village) → { group, pos, it, update(dt) }
import * as THREE from 'three';
import { makeToon, makeOutline } from '../gfx/materials.js';
import { paint, merge, xf } from '../gfx/geom.js';
import { LANDMARKS } from '../world/layout.js';

const C = h => new THREE.Color(h);
const col = (g, hex) => { const c = C(hex); return paint(g, (p, n, o) => o.copy(c)); };
const box = (w, h, d, hex, p = [0, 0, 0], r = [0, 0, 0]) => col(xf(new THREE.BoxGeometry(w, h, d), { p, r }), hex);
const cyl = (r0, r1, h, hex, p = [0, 0, 0], r = [0, 0, 0], seg = 10) => col(xf(new THREE.CylinderGeometry(r0, r1, h, seg), { p, r }), hex);
const disc = (r, hex, p, seg = 14) => col(xf(new THREE.CircleGeometry(r, seg), { p }), hex);

// a posted sighting: paper, an oni stamp, a few lines of writing
function notice(x, y, tilt, paper, scratch) {
  const P = [], z0 = 0.06, c = Math.cos(tilt), s = Math.sin(tilt), at = (u, v, dz = 0.006) => [x + u * c - v * s, y + u * s + v * c, z0 + dz];
  P.push(box(0.36, 0.46, 0.012, paper, [x, y, z0], [0, 0, tilt]));
  P.push(disc(0.075, '#d23a3a', at(0, 0.09, 0.008)));
  for (const k of [-1, 1]) { P.push(col(xf(new THREE.ConeGeometry(0.02, 0.05, 5), { p: at(k * 0.045, 0.175, 0.008), r: [0, 0, tilt] }), '#f6eedc')); P.push(box(0.022, 0.014, 0.004, '#2a1e22', at(k * 0.028, 0.1, 0.012), [0, 0, tilt])); }
  for (let i = 0; i < 3; i++) P.push(box(i === 2 ? 0.14 : 0.24, 0.016, 0.004, '#a08870', at(-0.03 + (i === 2 ? -0.05 : 0), -0.06 - i * 0.055, 0.008), [0, 0, tilt]));
  if (scratch) for (let k = 0; k < 3; k++) P.push(box(0.018, 0.3, 0.004, '#7a2a2a', at(-0.08 + k * 0.07, -0.02, 0.012), [0, 0, tilt + 0.55]));
  P.push(col(xf(new THREE.SphereGeometry(0.022, 8, 6), { p: at(0, 0.2, 0.014), s: [1, 1, 0.7] }), '#e8343c'));
  return P;
}

export function buildSightingsBoard() {
  const dark = '#4e3428', wood = '#7a5238', P = [];
  for (const sx of [-1, 1]) {
    P.push(cyl(0.14, 0.17, 0.14, '#a8a096', [sx * 0.7, 0.07, 0], [0, 0.3, 0], 8), box(0.12, 2.0, 0.12, wood, [sx * 0.7, 1.06, 0]));
    P.push(box(0.1, 0.24, 0.012, '#d23a3a', [sx * 0.7, 1.55, 0.065]), box(0.022, 0.15, 0.014, '#2a1e22', [sx * 0.7, 1.55, 0.07])); // (a charm on each post)
  }
  // the board: dark frame, warm planks
  ['#b88a5c', '#c4966a', '#b0845a'].forEach((c, i) => P.push(box(1.28, 0.36, 0.05, c, [0, 0.9 + i * 0.37, 0])));
  P.push(box(1.4, 0.08, 0.09, dark, [0, 1.66, 0.01]), box(1.4, 0.08, 0.09, dark, [0, 0.7, 0.01]));
  // the little roof: two shingled slopes and a ridge
  for (const sz of [-1, 1]) { const t = sz * 0.55; P.push(box(1.7, 0.05, 0.5, '#3e4a5a', [0, 1.95 - 0.12, sz * 0.2], [t, 0, 0])); for (let i = 0; i < 7; i++) P.push(box(0.06, 0.04, 0.48, '#56657a', [-0.72 + i * 0.24, 1.88, sz * 0.21], [t, 0, 0])); }
  P.push(box(1.78, 0.08, 0.08, dark, [0, 2.0, 0]));
  // ofuda hanging under the eave
  for (const x of [-0.5, -0.17, 0.17, 0.5]) P.push(box(0.07, 0.2, 0.01, Math.abs(x) > 0.3 ? '#fbf6ea' : '#d23a3a', [x, 1.62, 0.3], [0.1, 0, 0]));
  // the three notices (one clawed across), and a sign plank above: a red claw on cream
  P.push(...notice(-0.4, 1.12, 0.05, '#fffaf0', false), ...notice(0.02, 1.2, -0.04, '#fff2dc', true), ...notice(0.42, 1.1, 0.07, '#fffaf0', false));
  P.push(box(0.56, 0.18, 0.04, dark, [0, 2.22, 0]), box(0.5, 0.13, 0.05, '#f4e6c4', [0, 2.22, 0]));
  for (let k = 0; k < 3; k++) P.push(box(0.02, 0.11, 0.01, '#c8303a', [-0.06 + k * 0.06, 2.22, 0.03], [0, 0, 0.45]));
  P.push(box(0.04, 0.14, 0.04, dark, [-0.18, 2.1, 0]), box(0.04, 0.14, 0.04, dark, [0.18, 2.1, 0]));
  const geo = merge(P);
  const g = new THREE.Group(); g.name = 'sightingsBoard';
  const m = new THREE.Mesh(geo, makeToon({ vertexColors: true, brush: 0.16, rim: 0.4 })); m.castShadow = true; m.receiveShadow = true;
  g.add(m, new THREE.Mesh(geo, makeOutline('#3a2230', 0.016)));
  return g;
}

/** the board's spot: down and right of the Expedition Board, in the post's clearing, facing the camera */
export function sightingsSpot() { const L = LANDMARKS.travel; return L ? { x: L.x + 3.8, z: L.z + 0.9, rot: Math.PI / 4 } : null; }

export function addSightingsBoard(G, village) {
  const S = sightingsSpot(); if (!S || !village?.scene) return null;
  const g = buildSightingsBoard(), y = village.heightAt(S.x, S.z);
  g.position.set(S.x, y, S.z); g.rotation.y = S.rot; village.scene.add(g);
  const ax = Math.cos(S.rot), az = -Math.sin(S.rot);
  for (const k of [-0.7, 0, 0.7]) village.collision.addCircle(S.x + ax * k, S.z + az * k, 0.24, 'sightingsBoard');
  const fx = Math.sin(S.rot), fz = Math.cos(S.rot), pos = new THREE.Vector3(S.x + fx * 1.05, y, S.z + fz * 1.05);
  const it = { pos, radius: 1.6, label: 'Read the Sightings board', onInteract: () => G.ui?.open?.('sightings', { at: 'village' }) };
  village.interactables.push(it);
  return { group: g, pos, it, spot: S };
}
