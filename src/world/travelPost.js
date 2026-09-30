// The Wayfarer's Post (docs/REGIONS.md §1): a signpost at the end of the village's west trail, by the bamboo, with a
// painted board pointing toward each region, a paper lantern and a traveller's bundle. Talking to it opens the Travel Map.
import * as THREE from 'three';
import { makeToon, makeOutline } from '../gfx/materials.js';
import { paint, merge, xf } from '../gfx/geom.js';
import { LANDMARKS } from './layout.js';

const C = h => new THREE.Color(h);
const INKC = '#3a2230';
const col = (g, hex) => { const c = C(hex); return paint(g, (p, n, o) => o.copy(c)); };
const box = (w, h, d, hex, p = [0, 0, 0], r = [0, 0, 0]) => col(xf(new THREE.BoxGeometry(w, h, d, 2, 2, 1), { p, r }), hex);
const cyl = (r0, r1, h, hex, p = [0, 0, 0], r = [0, 0, 0], seg = 10) => col(xf(new THREE.CylinderGeometry(r0, r1, h, seg), { p, r }), hex);
const ball = (r, hex, p = [0, 0, 0], s = [1, 1, 1]) => col(xf(new THREE.SphereGeometry(r, 12, 9), { p, s }), hex);

// one arrow board: a plank with a pointed end, a darker rim and a painted emblem
function board(len, hex, emblem) {
  const parts = [];
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.11); shape.lineTo(len - 0.14, -0.11); shape.lineTo(len, 0); shape.lineTo(len - 0.14, 0.11); shape.lineTo(0, 0.11); shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.045, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1 });
  g.translate(0, 0, -0.022);
  parts.push(col(g, hex));
  const e = C('#fff8ec');
  const ex = len * 0.55;
  if (emblem === 'bamboo') { for (const dx of [-0.05, 0.05]) parts.push(paint(xf(new THREE.BoxGeometry(0.035, 0.16, 0.012), { p: [ex + dx, 0, 0.04] }), (p, n, o) => o.copy(e))); }
  else if (emblem === 'maple') { for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k - 2) * 0.62; parts.push(paint(xf(new THREE.ConeGeometry(0.03, 0.1, 4), { p: [ex + Math.cos(a + Math.PI) * -0.04, Math.sin(a + Math.PI) * -0.04, 0.04], r: [0, 0, a + Math.PI / 2] }), (p, n, o) => o.copy(e))); } }
  else if (emblem === 'wave') { parts.push(paint(xf(new THREE.TorusGeometry(0.05, 0.014, 6, 14, Math.PI * 1.3), { p: [ex, -0.01, 0.04], r: [0, 0, 0.5] }), (p, n, o) => o.copy(e))); }
  else if (emblem === 'snow') { for (let k = 0; k < 3; k++) parts.push(paint(xf(new THREE.BoxGeometry(0.15, 0.02, 0.012), { p: [ex, 0, 0.04], r: [0, 0, k * Math.PI / 3] }), (p, n, o) => o.copy(e))); }
  return merge(parts);
}

export function buildTravelPost() {
  const wood = '#9a6a48', dark = '#6e4830', stone = '#b8b0a4', moss = '#8ab46a';
  const parts = [
    // stone base with moss
    cyl(0.5, 0.62, 0.3, stone, [0, 0.15, 0], [0, 0, 0], 9), cyl(0.36, 0.45, 0.2, '#c8c0b4', [0, 0.38, 0], [0, 0.3, 0], 8),
    ball(0.22, moss, [0.3, 0.3, 0.2], [1.3, 0.5, 1]), ball(0.16, moss, [-0.32, 0.28, -0.1], [1.2, 0.5, 1]),
    // the post and its little gabled cap
    box(0.2, 2.35, 0.2, wood, [0, 1.6, 0]), box(0.24, 0.08, 0.24, dark, [0, 0.52, 0]),
    box(0.62, 0.06, 0.4, '#b8483a', [0, 2.86, 0.1], [0.42, 0, 0]), box(0.62, 0.06, 0.4, '#b8483a', [0, 2.86, -0.1], [-0.42, 0, 0]),
    box(0.66, 0.05, 0.05, dark, [0, 2.95, 0]),
    // a lantern arm
    box(0.5, 0.05, 0.05, dark, [0.3, 2.45, 0]), cyl(0.012, 0.012, 0.16, INKC, [0.5, 2.36, 0]),
    // traveller's bundle (furoshiki) + straw hat at the foot
    ball(0.18, '#5a8ad8', [0.42, 0.58, 0.35], [1, 0.8, 1]), ball(0.07, '#5a8ad8', [0.42, 0.74, 0.35], [1.4, 0.6, 1]),
    cyl(0.28, 0.02, 0.1, '#e8c888', [-0.35, 0.55, 0.38], [0.2, 0, -0.35], 12), cyl(0.07, 0.07, 0.08, '#d8b070', [-0.35, 0.62, 0.38], [0.2, 0, -0.35], 10),
  ];
  // four boards, each pointing the rough map direction of its region, at stacked heights (bamboo W, maple NE, tide S, onsen N)
  const B = [['bamboo', '#6fbf73', 1.2, 0.95, Math.PI], ['maple', '#e8743a', 1.1, 1.3, -0.6], ['wave', '#2fb8c8', 1.05, 1.62, Math.PI * 0.55], ['snow', '#9ac8ff', 1.15, 1.95, Math.PI * 1.45]];
  for (const [emb, hex, len, y, yaw] of B) parts.push(xf(board(len, hex, emb), { p: [0, y, 0], r: [0, yaw, 0] }).translate(0, 0, 0));
  const geo = merge(parts);
  const mat = makeToon({ vertexColors: true, brush: 0.18, rim: 0.4 });
  const g = new THREE.Group(); g.name = 'travelPost';
  const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true;
  const ol = new THREE.Mesh(geo, makeOutline('#3a2230', 0.018));
  // the paper lantern: warm, softly emissive (the light itself comes from the world's LightPool)
  const lg = merge([ball(0.14, '#fff0d0', [0, 0, 0], [1, 1.25, 1]), cyl(0.07, 0.07, 0.04, '#b8483a', [0, 0.17, 0]), cyl(0.07, 0.07, 0.04, '#b8483a', [0, -0.17, 0])]);
  const lantern = new THREE.Mesh(lg, makeToon({ vertexColors: true, emissive: '#ffb860', emissiveIntensity: 0.55, rim: 0.3 }));
  lantern.position.set(0.5, 2.12, 0);
  g.add(m, ol, lantern);
  g.userData.lantern = lantern;
  return g;
}
/** Put the post in the village: model, collider, lantern light and the "open the Travel Map" interaction. */
export function addTravelPost(G, village) {
  const L = LANDMARKS.travel; if (!L) return null;
  const g = buildTravelPost();
  const y = village.heightAt(L.x, L.z);
  g.position.set(L.x, y, L.z); g.rotation.y = L.rot || 0;
  village.scene.add(g);
  village.collision.addCircle(L.x, L.z, 0.55, 'travelPost');
  const lp = g.userData.lantern.getWorldPosition(new THREE.Vector3());
  village.lightPool.addSource({ pos: lp, color: new THREE.Color('#ffc880'), intensity: 3.2, radius: 5.5, flicker: 0.25, nightOnly: true });
  const pos = new THREE.Vector3(L.x + 1.0, y, L.z + 1.0);
  village.interactables.push({ pos, radius: 1.7, label: "Read the Wayfarer's Post", onInteract: () => G.openTravel?.({ from: 'village' }) });
  return g;
}
