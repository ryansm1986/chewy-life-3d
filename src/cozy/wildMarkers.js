// The wild areas' world markers (docs/COZY.md §6.2; ROADMAP CZ-4), placed while a region builds (RegionMode wraps the
// layout's populate hook, so they go in even with ?veg=0):
//  - wildMarker: at each area's entry, two weathered posts strung with a sagging shimenawa, hung with red ofuda and
//    white shide (cloth: they flutter in the wind), a red charm pasted on each post, and a little wooden "yokai" sign
//    on a stake (a red oni face and three claw scratches). Built with the buildings kit and merged into the region's
//    static prop chunks: no extra draw calls.
//  - the edge tint: one soft violet band on the ground round every disc's rim (one transparent mesh for the whole zone,
//    a soft dashed band, alpha at most 0.42 over the ground: a tint, never a glow, so it can't wash the screen).
import * as THREE from 'three';
import { G as KG } from '../world/buildings/kit.js';
import { tube } from '../gfx/geom.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const WOOD = '#6e4c3a', WOOD_D = '#4e3428', STRAW = '#d8b878', STRAW_D = '#a88848', RED = '#d23a3a', PAPER = '#fbf6ea', INK = '#2a1e22';

/** the gateway, local frame: across the path along x (posts at ±span/2), facing +z (toward whoever comes up the path) */
export function wildMarker(B, { span = 3.2, seed = 0 } = {}) {
  const h = 1.95, hx = span / 2;
  for (const s of [-1, 1]) B.at([s * hx, 0, 0], 0, () => {
    const foot = KG.cyl(0.2, 0.24, 0.16, 8); foot.translate(0, 0.08, 0); B.add(foot, '#9a948a');
    const post = KG.beam(0.17, h, 0.17, 0.02); post.translate(0, h / 2, 0); B.add(post, (p, n, o) => o.set(WOOD).multiplyScalar(0.85 + 0.2 * Math.sin(p.y * 9 + s * 3) * 0.5 + 0.1));
    const cap = KG.box(0.24, 0.07, 0.24, 0.02); cap.translate(0, h + 0.03, 0); B.add(cap, WOOD_D);
    const charm = KG.box(0.11, 0.26, 0.012, 0); charm.translate(0, 1.15, 0.092); B.add(charm, RED);
    const mark = KG.box(0.025, 0.16, 0.014, 0); mark.translate(0, 1.15, 0.096); B.add(mark, INK);
  }, 1, 0, s * 0.04);
  // the shimenawa: two straw strands twisted round each other, sagging between the post tops
  const top = h - 0.12, sag = 0.34, N = 18, strand = ph => {
    const pts = [];
    for (let i = 0; i <= N; i++) { const t = i / N, x = -hx + span * t, y = top - sag * 4 * t * (1 - t), a = t * Math.PI * 9 + ph; pts.push({ p: V(x, y + Math.sin(a) * 0.035, Math.cos(a) * 0.035), r: 0.05 * (0.75 + 0.25 * Math.sin(t * Math.PI)) }); }
    return tube(pts, 6, true);
  };
  B.add(strand(0), STRAW); B.add(strand(Math.PI), STRAW_D);
  for (const t of [0.04, 0.96]) { const x = -hx + span * t, k = KG.torus(0.075, 0.025, 5, 10); k.rotateY(Math.PI / 2); k.translate(x, top - sag * 4 * t * (1 - t), 0); B.add(k, STRAW_D); }
  // hanging from the rope: red ofuda and white shide, alternating (cloth: their lower ends flutter)
  const hang = [0.18, 0.32, 0.5, 0.68, 0.82];
  hang.forEach((t, i) => {
    const x = -hx + span * t, y = top - sag * 4 * t * (1 - t) - 0.04;
    if (i % 2 === 0) { // an ofuda: a red paper strip with an ink stroke
      const L = 0.36, w = 0.1;
      for (const z of [0.012, -0.012]) { const g = KG.plane(w, L, 1, 3); if (z < 0) g.rotateY(Math.PI); g.translate(x, y - L / 2, z); B.cloth(g, RED, { x0: x - w / 2, x1: x + w / 2, yTop: y, yBot: y - L }); }
      const ink = KG.plane(0.024, L * 0.6, 1, 2); ink.translate(x, y - L * 0.5, 0.016); B.cloth(ink, INK, { x0: x - 0.02, x1: x + 0.02, yTop: y, yBot: y - L });
    } else { // a shide: a white paper zigzag
      for (let k = 0; k < 4; k++) {
        const g = KG.plane(0.075, 0.1, 1, 1), ox = (k % 2 ? 0.04 : 0);
        for (const z of [0.01, -0.01]) { const q = g.clone(); if (z < 0) q.rotateY(Math.PI); q.translate(x + ox, y - 0.05 - k * 0.095, z); B.cloth(q, PAPER, { x0: x - 0.06, x1: x + 0.1, yTop: y, yBot: y - 0.42 }); }
      }
    }
  });
  // the little yokai sign on a stake beside the left post, tilted toward the path
  B.at([-hx - 0.62, 0, 0.32], 0.35, () => {
    const st = KG.beam(0.07, 1.15, 0.07, 0.01); st.translate(0, 0.575, 0); B.add(st, WOOD);
    B.at([0, 0.98, 0.05], 0, () => {
      const bd = KG.box(0.62, 0.42, 0.05, 0.02); B.add(bd, '#c8965e');
      const face = KG.box(0.54, 0.34, 0.02, 0.01); face.translate(0, 0, 0.03); B.add(face, '#f2e2bc');
      const head = KG.disc(0.105, 14); head.translate(-0.1, 0.0, 0.043); B.add(head, RED);
      for (const s of [-1, 1]) { const horn = KG.cone(0.026, 0.07, 5); horn.translate(-0.1 + s * 0.06, 0.12, 0.043); horn.rotateZ(0); B.add(horn, '#f6eedc'); const eye = KG.box(0.028, 0.018, 0.01, 0); eye.translate(-0.1 + s * 0.04, 0.02, 0.05); B.add(eye, INK); }
      const mouth = KG.box(0.07, 0.014, 0.01, 0); mouth.translate(-0.1, -0.045, 0.05); B.add(mouth, INK);
      for (let k = 0; k < 3; k++) { const c = KG.box(0.026, 0.24, 0.01, 0); c.rotateZ(0.5); c.translate(0.1 + k * 0.055, 0.0, 0.045); B.add(c, '#7a2a2a'); }
    }, 1, -0.08);
  });
}

/** Place the markers and the edge tint for a region's wild areas (populate ctx; RegionMode's hook) */
export function wildPopulate(ctx) {
  const areas = ctx.plan.wild || []; if (!areas.length) return;
  areas.forEach((a, i) => {
    if (!a.entry) return;
    const ox = a.entry[0] - a.x, oz = a.entry[1] - a.z, ol = Math.hypot(ox, oz) || 1, x = a.entry[0] + ox / ol * 0.8, z = a.entry[1] + oz / ol * 0.8;
    const rot = Math.atan2(ox, oz); // (local +z: outward, toward the trail)
    ctx.prop(B => wildMarker(B, { seed: i }), { x, z, rot, seed: 801 + i * 7, warp: 0.015 });
    const ux = Math.cos(rot), uz = -Math.sin(rot);
    for (const s of [-1, 1]) ctx.addCollider(x + ux * 1.6 * s, z + uz * 1.6 * s, 0.2);
    ctx.addCollider(x - ux * 2.22 + ox / ol * 0.32, z - uz * 2.22 + oz / ol * 0.32, 0.15);
    ctx.reserve(x, z, 1.4); ctx.reserve(x - ux * 1.6, z - uz * 1.6, 0.5); ctx.reserve(x + ux * 1.6, z + uz * 1.6, 0.5);
  });
  const m = edgeTint(ctx, areas); ctx.add(m);
  ctx.onDispose(() => { m.geometry.dispose(); m.material.dispose(); });
}

/** one soft violet band round every disc's rim, hugging the ground (alpha peaks at the rim) */
export function edgeTint(ctx, areas) {
  const N = 128, rings = [[-1.7, 0], [-0.5, 1], [0.0, 1], [0.7, 0]], pos = [], col = [], idx = [];
  const c0 = new THREE.Color('#9a5ce0'), PEAK = 0.42;
  for (const a of areas) {
    const base = pos.length / 3;
    for (let i = 0; i <= N; i++) {
      const t = i / N * Math.PI * 2, wob = Math.sin(t * 5 + a.x) * 0.3 + Math.sin(t * 11 + a.z) * 0.15;
      for (const [dr, al] of rings) {
        const r = a.r + dr + wob, x = a.x + Math.cos(t) * r, z = a.z + Math.sin(t) * r;
        pos.push(x, ctx.heightAt(x, z) + 0.05, z);
        const dash = Math.sin(t * a.r * 1.6) > -0.2 ? 1 : 0.35; // (a soft dashed band: the ofuda rope's rhythm)
        col.push(c0.r, c0.g, c0.b, al * PEAK * dash);
      }
    }
    for (let i = 0; i < N; i++) for (let k = 0; k < rings.length - 1; k++) {
      const p = base + i * rings.length + k, q = p + rings.length;
      idx.push(p, q, p + 1, p + 1, q, q + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx); g.computeBoundingSphere();
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
  const m = new THREE.Mesh(g, mat); m.name = 'wildEdge'; m.renderOrder = 2; m.receiveShadow = false; m.castShadow = false;
  return m;
}
