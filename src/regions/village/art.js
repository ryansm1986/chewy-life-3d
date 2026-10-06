// Zone village art shared by every theme (docs/ZONES.md §2): the region-owned materials, the siege dressing (boards over
// doors and windows, soot, torn lanterns, war banners, spiked barricades, tents, campfires, debris), the saved dressing
// (lit lanterns, noren, bunting, flowers), the captives' cages and the captain's arena ring. Everything is built with
// the buildings kit Builder (src/world/buildings/kit.js) in a local frame (front = +z), so a theme file composes it.
// The materials copy the RegionWorld prop materials' options (the same shader programs) but belong to the village: the
// region's scene teardown disposes them with everything else.
import * as THREE from 'three';
import { makeToon, applyDepth } from '../../gfx/materials.js';
import { tube, puff } from '../../gfx/geom.js';
import { Builder, G, V, C, PI, shade, mixc } from '../../world/buildings/kit.js';
import { noren as norenPart, bunting as buntingPart, STONES } from '../../world/buildings/parts.js';
import { chochin, crate, barrel, torii as toriiPart, toro as toroPart } from '../../world/buildings/props.js';
import { shimenawa } from '../../world/buildings/props2.js';
import { roof as roofPart } from '../../world/buildings/roofs.js';
import { shapeGeo } from '../../world/buildings/symbols.js';
import { lerp, clamp, mulberry32, TAU } from '../../core/util.js';

// ------------------------------------------------------------------ materials (one set per village visit)
const GLOW_FRAG = /* glsl */`
  totalEmissiveRadiance *= mix(vec3(1.0), vColor.rgb * 1.6, vGl.y)
    * (1.0 + vGl.x * (sin(uTime * 8.3 + vCWorld.x * 2.1 + vCWorld.z * 1.7) * 0.09 + sin(uTime * 19.0 + vCWorld.y * 7.0) * 0.05));
`;
export function villageMats(night = 0) {
  const glow = (e, i) => makeToon({ vertexColors: true, emissive: e, emissiveIntensity: i, brush: 0.06, rim: 0.12, term: [-0.2, 0.4], vertexPars: 'varying vec2 vGl;', vertexWorld: 'vGl = uv;', fragPars: 'varying vec2 vGl;', fragColor: GLOW_FRAG });
  return {
    body: makeToon({ vertexColors: true, brush: 0.15, brushScale: 0.5, rim: 0.34, term: [-0.06, 0.34], shadowSat: 0.35 }),
    bodyOcc: makeToon({ vertexColors: true, brush: 0.15, brushScale: 0.5, rim: 0.34, term: [-0.06, 0.34], shadowSat: 0.35, occluder: true }),
    glow: glow('#ffcf7a', lerp(0.06, 2.1, night)),
    hot: glow('#ffffff', lerp(1.5, 2.2, night)),
    cloth: makeToon({ vertexColors: true, wind: 'cloth', windAmt: 0.5, side: THREE.DoubleSide, brush: 0.12, rim: 0.3 }),
    leaf: makeToon({ vertexColors: true, wind: 'leaf', windAmt: 0.45, brush: 0.22, brushScale: 0.8, rim: 0.55, shadowSat: 0.5, term: [-0.15, 0.4] }),
    water: makeToon({ vertexColors: true, rim: 0.55, brush: 0.04, term: [-0.3, 0.5], shadowSat: 0.2 }),
  };
}
/** a finished Builder template → a Group with one mesh per material bucket (animated parts as their own nodes) */
export function tplGroup(tpl, mats, name = 'village') {
  const g = new THREE.Group(); g.name = name;
  const mk = (geo, k) => {
    const m = new THREE.Mesh(geo, mats[k] || mats.body);
    m.castShadow = k !== 'water' && k !== 'hot'; m.receiveShadow = true;
    if (k === 'cloth' || k === 'leaf') applyDepth(m);
    return m;
  };
  for (const k of Object.keys(tpl.geos)) g.add(mk(tpl.geos[k], k));
  const parts = [];
  for (const a of tpl.anims) {
    const node = new THREE.Group(); node.position.copy(a.pivot);
    for (const k of Object.keys(a.geos)) node.add(mk(a.geos[k], k));
    g.add(node); parts.push({ node, a });
  }
  g.userData.parts = parts;
  return g;
}
/** the kit's sway / spin / bob animation for tplGroup parts (a part with speed 0 is posed by its owner) */
export function animateParts(parts, t) {
  for (const { node, a } of parts) {
    if (!a.speed) continue;
    const ph = t * a.speed + a.phase;
    if (a.kind === 'swing') node.quaternion.setFromAxisAngle(a.axis, Math.sin(ph) * a.amp + Math.sin(ph * 2.3) * a.amp * 0.15);
    else if (a.kind === 'spin') node.quaternion.setFromAxisAngle(a.axis, ph);
    else if (a.kind === 'bob') node.position.set(a.pivot.x, a.pivot.y + Math.sin(ph) * a.amp, a.pivot.z);
  }
}

// ------------------------------------------------------------------ small shapes
const plank = (B, w, h, d, color, x = 0, y = 0, z = 0, rz = 0) => { const g = G.beam(w, h, d, 0.012); g.rotateZ(rz); g.translate(x, y, z); return B.add(g, color); };
const nail = (B, x, y, z) => { const g = G.cyl(0.018, 0.018, 0.02, 5); g.rotateX(PI / 2); g.translate(x, y, z); B.add(g, C.iron); };
/** a flat irregular blob (local xy, facing +z) */
function blobGeo(r, seed, n = 14, rough = 0.32) {
  // a fan with a centre and a mid ring, so per-vertex colour gradients (soot fading into plaster) have room to show
  const rr = mulberry32(seed * 977 + 13), pos = [0, 0, 0], idx = [];
  const ks = []; for (let i = 0; i < n; i++) ks.push(1 - rough * 0.5 + rr() * rough);
  for (const f of [0.5, 1]) for (let i = 0; i < n; i++) { const a = i / n * TAU, k = r * ks[i] * f; pos.push(Math.cos(a) * k, Math.sin(a) * k, 0); }
  for (let i = 0; i < n; i++) { const a = 1 + i, b = 1 + (i + 1) % n; idx.push(0, a, b, a, a + n, b, b, a + n, b + n); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g.toNonIndexed();
}

// ------------------------------------------------------------------ the siege dressing
const BOARD = ['#a8845e', '#9a7656', '#b8946a', '#8e6c4e'];
/** planks nailed over an opening (local face frame: the opening's centre at the origin, its face at z = 0) */
export function boards(B, w, h, { seed = 0, depth = 0.05 } = {}) {
  const r = mulberry32(seed * 131 + 7), z = depth;
  const L = Math.hypot(w, h) * 0.98, a = Math.atan2(h, w);
  plank(B, L, 0.12, 0.035, BOARD[seed % 4], 0, 0, z, a + (r() - 0.5) * 0.08);
  plank(B, L * 0.96, 0.11, 0.035, BOARD[(seed + 1) % 4], 0, 0.02, z + 0.035, -a + (r() - 0.5) * 0.08);
  const nh = Math.max(1, Math.round(h / 0.55));
  for (let i = 0; i < nh; i++) {
    const y = -h / 2 + (i + 0.5) * h / nh + (r() - 0.5) * 0.06;
    plank(B, w * (1.06 + r() * 0.08), 0.1 + r() * 0.03, 0.035, BOARD[(seed + i + 2) % 4], (r() - 0.5) * 0.06, y, z + 0.07, (r() - 0.5) * 0.12);
    for (const s of [-1, 1]) nail(B, s * w * 0.46, y, z + 0.09);
  }
  for (const [sx, sy] of [[-1, -1], [1, 1], [-1, 1], [1, -1]]) nail(B, sx * w * 0.44, sy * h * 0.44, z + 0.055);
}
/** soot licking up a wall from a gap (local face frame, base at the origin); `wall` blends the edge into the plaster */
export function soot(B, w, h, wall = '#efe4d0', seed = 0) {
  const g = blobGeo(1, seed, 16, 0.4); g.scale(w * 0.5, h * 0.5, 1); g.translate(0, h * 0.5, 0.012);
  const dark = new THREE.Color('#2e2622'), wc = new THREE.Color(wall);
  B.add(g, (p, n, o) => { const k = clamp(Math.hypot(p.x / (w * 0.5), (p.y - h * 0.5) / (h * 0.5))); o.copy(dark).lerp(wc, k * k * 0.85 + clamp((p.y - h * 0.3) / h) * 0.25); });
}
/** a torn, unlit paper lantern hanging askew from its cord (top at the origin) */
export function tornLantern(B, { r = 0.15, h = 0.32, seed = 0 } = {}) {
  const rr = mulberry32(seed * 53 + 1), tilt = (rr() - 0.5) * 0.7;
  B.at([0, 0, 0], 0, () => {
    const cord = G.cyl(0.008, 0.008, 0.12, 4); cord.translate(0, -0.06, 0); B.add(cord, C.ink);
    B.at([0, -0.12, 0], rr() * TAU, () => {
      const body = G.sph(r, 10, 7); body.scale(1, h / (2 * r), 1); body.translate(0, -h / 2, 0);
      const P = body.attributes.position;
      for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i); if (z > 0 && y < -h * 0.4) P.setXYZ(i, x * 0.8, y + 0.04, z * 0.55); } // (a crumpled side)
      body.computeVertexNormals();
      B.add(body, (p, n, o) => o.set('#8a4a3e').lerp(new THREE.Color('#4a3430'), clamp(0.5 - n.y) * 0.5));
      const cap = G.cyl(r * 0.55, r * 0.6, 0.04, 8); B.add(cap, '#2e2420');
      const bot = G.cyl(r * 0.5, r * 0.45, 0.035, 8); bot.translate(0, -h, 0); B.add(bot, '#2e2420');
      const rip = blobGeo(r * 0.5, seed + 3, 8); rip.translate(0, -h * 0.5, r * 0.98); B.add(rip, '#1e1614');
    }, 1, tilt, (rr() - 0.5) * 0.4);
  });
}
/** a lit paper lantern (the saved village): glowing paper on the 'hot' bucket */
export function litLantern(B, { r = 0.15, h = 0.32, color = '#e8503a', cord = 0.12 } = {}) {
  const c = G.cyl(0.008, 0.008, cord, 4); c.translate(0, -cord / 2, 0); B.add(c, C.ink);
  B.at([0, -cord, 0], 0, () => {
    const body = G.sph(r, 12, 9); body.scale(1, h / (2 * r), 1); body.translate(0, -h / 2, 0);
    B.glow(body, color, { hot: true, flicker: 0.4, tint: 0.85 });
    for (let k = 1; k < 4; k++) { const rib = G.torus(r * Math.sin(k / 4 * PI) * 1.01, 0.006, 3, 14); rib.rotateX(PI / 2); rib.translate(0, -h * k / 4, 0); B.add(rib, shade(color, 0.6)); }
    const cap = G.cyl(r * 0.55, r * 0.62, 0.05, 10); B.add(cap, C.ink);
    const bot = G.cyl(r * 0.52, r * 0.46, 0.04, 10); bot.translate(0, -h, 0); B.add(bot, C.ink);
    const tas = G.cyl(0.012, 0.03, 0.12, 5); tas.translate(0, -h - 0.08, 0); B.add(tas, C.gold);
  });
}
// the yokai crest: a scowling face with two horns (flat, unit size, facing +z) for war banners
function crestGeo() {
  const face = new THREE.Shape(); face.absarc(0, 0, 0.36, 0, TAU, false);
  const eyeL = new THREE.Path(); eyeL.moveTo(-0.24, 0.1); eyeL.lineTo(-0.06, 0.02); eyeL.lineTo(-0.2, -0.04); eyeL.closePath();
  const eyeR = new THREE.Path(); eyeR.moveTo(0.24, 0.1); eyeR.lineTo(0.06, 0.02); eyeR.lineTo(0.2, -0.04); eyeR.closePath();
  const mouth = new THREE.Path(); mouth.moveTo(-0.18, -0.16); mouth.lineTo(-0.09, -0.12); mouth.lineTo(0, -0.18); mouth.lineTo(0.09, -0.12); mouth.lineTo(0.18, -0.16); mouth.lineTo(0, -0.26); mouth.closePath();
  face.holes.push(eyeL, eyeR, mouth);
  const hornL = new THREE.Shape(); hornL.moveTo(-0.3, 0.2); hornL.quadraticCurveTo(-0.46, 0.46, -0.36, 0.62); hornL.quadraticCurveTo(-0.26, 0.4, -0.14, 0.32); hornL.closePath();
  const hornR = new THREE.Shape(); hornR.moveTo(0.3, 0.2); hornR.quadraticCurveTo(0.46, 0.46, 0.36, 0.62); hornR.quadraticCurveTo(0.26, 0.4, 0.14, 0.32); hornR.closePath();
  const g = new THREE.ShapeGeometry([face, hornL, hornR], 6);
  return g.index ? g.toNonIndexed() : g;
}
/** a yokai war banner: a crooked pole, a ragged cloth with the crest, a little skull-ish totem on top (base at the origin) */
export function warBanner(B, { h = 2.6, w = 0.62, color = '#4a2a5a', mark = '#f0e2c4', seed = 0 } = {}) {
  const rr = mulberry32(seed * 71 + 5), lean = (rr() - 0.5) * 0.12;
  B.at([0, 0, 0], rr() * 0.6 - 0.3, () => {
    const pole = G.cyl(0.035, 0.05, h, 6); pole.translate(0, h / 2, 0); pole.rotateZ(lean); B.add(pole, '#4a3a30');
    const arm = G.cyl(0.025, 0.025, w + 0.12, 5); arm.rotateZ(PI / 2); arm.translate(w / 2 - 0.02, h - 0.12, 0.04); B.add(arm, '#4a3a30');
    // the cloth: hangs from the arm, ragged at the hem (three tongues), the crest on it
    const top = h - 0.14, bot = h - 0.14 - w * 2.1, cl = { x0: 0, x1: w, yTop: top, yBot: bot };
    const sh = new THREE.Shape(); sh.moveTo(0, top); sh.lineTo(w, top); sh.lineTo(w, bot + 0.18);
    for (let k = 3; k >= 0; k--) { const x = k / 3 * w; sh.lineTo(x, k % 2 ? bot + rr() * 0.12 : bot + 0.22 + rr() * 0.1); }
    sh.closePath();
    const cg = new THREE.ShapeGeometry(sh, 4); const g = cg.index ? cg.toNonIndexed() : cg; g.translate(0.02, 0, 0.06);
    B.cloth(g, { grad: [shade(color, 0.7), color] }, cl);
    const back = g.clone(); back.rotateY(PI); back.translate(w + 0.04, 0, 0.12); B.cloth(back, shade(color, 0.8), cl);
    const crest = crestGeo(); crest.scale(w * 0.62, w * 0.62, 1); crest.translate(w / 2 + 0.02, top - w * 0.72, 0.066); B.cloth(crest, mark, cl);
    // totem: a horned knob and two tassels
    const knob = G.sph(0.09, 8, 6); knob.translate(Math.sin(-lean) * h, h + 0.06, 0); B.add(knob, '#e8dcc0');
    for (const s of [-1, 1]) { const hn = G.cone(0.035, 0.14, 6); hn.rotateZ(-s * 0.5); hn.translate(Math.sin(-lean) * h + s * 0.07, h + 0.16, 0); B.add(hn, '#d8c8a0'); }
    for (const s of [-1, 1]) { const t = G.cyl(0.01, 0.025, 0.3, 4); t.translate(s * 0.06 + Math.sin(-lean) * h, h - 0.16, 0.04); B.add(t, '#c83a3a'); }
  }, 1, 0, 0);
}
/** a spiked barricade (cheval-de-frise): a log on trestles bristling with sharpened stakes, along local x */
export function spikes(B, L = 2.4, { seed = 0 } = {}) {
  const rr = mulberry32(seed * 19 + 3);
  const log = G.cyl(0.11, 0.12, L, 8); log.rotateZ(PI / 2); log.translate(0, 0.42, 0); B.add(log, '#7a5a40');
  for (const s of [-1, 1]) { const c = G.cyl(0.115, 0.115, 0.02, 8); c.rotateZ(PI / 2); c.translate(s * L / 2, 0.42, 0); B.add(c, '#c8a878'); }
  const n = Math.max(2, Math.round(L / 0.5));
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + 0.25 + i * (L - 0.5) / Math.max(1, n - 1);
    for (const s of [-1, 1]) {
      const st = G.cyl(0.055, 0.065, 1.25, 6); st.translate(0, 0.62, 0);
      const tip = G.cone(0.055, 0.24, 6); tip.translate(0, 1.36, 0);
      B.at([x + (rr() - 0.5) * 0.08, 0, 0], 0, () => { B.add(st, '#8a6a48'); B.add(tip, '#d8c8a8'); }, 1, s * 0.62, (rr() - 0.5) * 0.15);
    }
  }
  for (let i = 0; i < 2; i++) { const rope = G.torus(0.13, 0.02, 4, 10); rope.rotateY(PI / 2); rope.translate(-L / 4 + i * L / 2, 0.42, 0); B.add(rope, '#c8b088'); }
}
/** a yokai tent: patched cloth over a ridge pole on two crossed pairs of poles, along local x */
export function tent(B, { L = 1.8, w = 1.5, h = 1.25, color = '#6a4a6a', patch = '#a8885a', seed = 0 } = {}) {
  const rr = mulberry32(seed * 29 + 11);
  for (const s of [-1, 1]) for (const k of [-1, 1]) { const p = G.cyl(0.03, 0.035, h * 1.25, 5); p.translate(0, h * 0.62, 0); B.at([s * L / 2, 0, k * w * 0.3], 0, () => B.add(p, '#5a4434'), 1, k * -0.45, 0); }
  const ridge = G.cyl(0.03, 0.03, L + 0.3, 5); ridge.rotateZ(PI / 2); ridge.translate(0, h, 0); B.add(ridge, '#5a4434');
  for (const k of [-1, 1]) {
    const g = G.plane(L + 0.1, Math.hypot(w / 2, h) * 1.02, 4, 3); g.translate(0, -Math.hypot(w / 2, h) * 0.51, 0);
    g.rotateX(k * (PI / 2 - Math.atan2(h, w / 2))); g.translate(0, h, 0);
    if (k < 0) g.rotateY(PI);
    B.add(g, (p, n, o) => { o.set(color).multiplyScalar(0.86 + 0.18 * clamp(p.y / h)); });
    for (let i = 0; i < 2; i++) { const pt = blobGeo(0.16, seed + i * 5 + (k > 0 ? 9 : 0), 6, 0.2); pt.translate((rr() - 0.5) * L * 0.7, -0.35 - rr() * 0.3, 0.01); pt.rotateX(k * (PI / 2 - Math.atan2(h, w / 2)) - (k > 0 ? 0 : 0)); pt.translate(0, h, 0); if (k < 0) pt.rotateY(PI); B.add(pt, patch); }
  }
  // the back gable closed, the front open (a dark mouth)
  const tri = new THREE.Shape(); tri.moveTo(-w / 2, 0); tri.lineTo(w / 2, 0); tri.lineTo(0, h); tri.closePath();
  const back = new THREE.ShapeGeometry(tri); back.rotateY(PI / 2); back.translate(-L / 2 - 0.03, 0, 0); B.add(back.index ? back.toNonIndexed() : back, shade(color, 0.7));
  const mouth = new THREE.ShapeGeometry(tri); mouth.scale(0.8, 0.85, 1); mouth.rotateY(-PI / 2); mouth.translate(L / 2 - 0.1, 0, 0); B.add(mouth.index ? mouth.toNonIndexed() : mouth, '#1e1418');
}
/** a campfire: a stone ring, crossed logs and glowing embers (light added by the caller) */
export function campfire(B, { r = 0.42, seed = 0 } = {}) {
  const rr = mulberry32(seed * 37 + 2);
  for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, s = puff(V(0, 0, 0), 0.11 + rr() * 0.04, { detail: 1, noise: 0.25, squash: 0.65, seed: seed * 9 + i }); s.translate(Math.cos(a) * r, 0.05, Math.sin(a) * r); B.add(s, STONES[i % STONES.length]); }
  for (let i = 0; i < 4; i++) { const lg = G.cyl(0.045, 0.05, r * 1.5, 6); lg.rotateZ(PI / 2 - 0.35); lg.rotateY(i / 4 * PI + rr() * 0.3); lg.translate(0, 0.12, 0); B.add(lg, '#5a3a28'); }
  const ash = G.cyl(r * 0.75, r * 0.8, 0.04, 10); ash.translate(0, 0.02, 0); B.add(ash, '#3a3030');
  const ember = G.ico(r * 0.42, 1); ember.scale(1, 0.4, 1); ember.translate(0, 0.08, 0); B.glow(ember, '#ff8a3a', { hot: true, flicker: 1, tint: 1 });
  for (let i = 0; i < 3; i++) { const f = G.cone(0.09 - i * 0.02, 0.32 - i * 0.06, 6); f.translate((rr() - 0.5) * 0.12, 0.28, (rr() - 0.5) * 0.12); B.glow(f, i ? '#ffd27a' : '#ff9a4a', { hot: true, flicker: 1, tint: 1 }); }
}
/** broken planks, a cracked barrel, spilt crates, scattered leaves round (0, 0) within r */
export function debris(B, r = 1.4, { seed = 0, n = 6 } = {}) {
  const rr = mulberry32(seed * 101 + 9);
  for (let i = 0; i < n; i++) {
    const a = rr() * TAU, d = r * Math.sqrt(rr()), x = Math.cos(a) * d, z = Math.sin(a) * d, k = rr();
    if (k < 0.45) { const p = G.beam(0.5 + rr() * 0.5, 0.04, 0.12, 0.01); p.rotateY(rr() * PI); p.rotateZ((rr() - 0.5) * 0.3); p.translate(x, 0.03, z); B.add(p, BOARD[i % 4]); }
    else if (k < 0.65) B.at([x, 0, z], rr() * TAU, () => crate(B, { s: 0.3 }), 1, (rr() - 0.5) * 0.4, PI / 2 * (rr() < 0.5 ? 1 : 0.15));
    else if (k < 0.8) B.at([x, 0.17, z], rr() * TAU, () => barrel(B, { r: 0.16, h: 0.34, lid: false }), 1, PI / 2, 0);
    else { const s = puff(V(0, 0, 0), 0.08 + rr() * 0.06, { detail: 0, noise: 0.3, squash: 0.6, seed: i + seed }); s.translate(x, 0.04, z); B.add(s, STONES[i % STONES.length]); }
  }
}
/** scattered pale bones and broken pots: the monsters' leftovers */
export function bones(B, r = 0.8, { seed = 0, n = 4 } = {}) {
  const rr = mulberry32(seed * 7 + 41);
  for (let i = 0; i < n; i++) {
    const a = rr() * TAU, d = r * Math.sqrt(rr()), x = Math.cos(a) * d, z = Math.sin(a) * d;
    B.at([x, 0.035, z], rr() * PI, () => {
      const s = G.cyl(0.025, 0.025, 0.28, 5); s.rotateZ(PI / 2); B.add(s, '#efe6d2');
      for (const e of [-1, 1]) for (const f of [-1, 1]) { const k = G.sph(0.035, 6, 4); k.translate(e * 0.15, 0, f * 0.025); B.add(k, '#efe6d2'); }
    });
  }
}
/** a ground scorch mark (flat, at the origin): charred black at the heart, fading to soot-brown */
export function scorch(B, r = 1, seed = 0) {
  const g = blobGeo(r, seed, 18, 0.45); g.rotateX(-PI / 2); g.translate(0, 0.02, 0);
  const c0 = new THREE.Color('#231c1a'), c1 = new THREE.Color('#5a4a3a');
  B.add(g, (p, n, o) => o.copy(c0).lerp(c1, clamp(Math.hypot(p.x, p.z) / r) ** 1.5));
}

// ------------------------------------------------------------------ the saved dressing
/** a noren over a doorway (local face frame, the door's top at y) */
export function noren(B, { w = 0.9, h = 0.5, y = 1.4, z = 0.16, color = C.indigo, sym = null, strips = 2 } = {}) {
  norenPart(B, { w, h, y, z, color, strips, symbol: sym ? () => symbolGeo(sym) : null, symScale: h * 0.42 });
}
/** festival bunting through [x, y, z] points (parts.bunting) */
export const bunting = (B, pts, o) => buntingPart(B, pts, o);
/** a cheerful flower pot */
export function flowerPot(B, { r = 0.17, colors = ['#ff8fb0', '#ffd24a', '#ffffff'], seed = 0 } = {}) {
  const rr = mulberry32(seed * 43 + 1);
  const pot = G.cyl(r, r * 0.78, r * 1.3, 10); pot.translate(0, r * 0.65, 0); B.add(pot, (p, n, o) => o.set(C.terracotta).multiplyScalar(0.84 + 0.2 * clamp(p.y / (r * 1.3))));
  const rim = G.torus(r * 0.98, 0.025, 4, 12); rim.rotateX(PI / 2); rim.translate(0, r * 1.3, 0); B.add(rim, shade(C.terracotta, 1.08));
  const bush = puff(V(0, r * 1.45, 0), r * 0.95, { detail: 1, noise: 0.25, squash: 0.8, seed: seed + 3 }); B.add(bush, '#5a9a48', 'leaf');
  for (let i = 0; i < 7; i++) { const a = rr() * TAU, d = r * 0.65 * Math.sqrt(rr()), f = G.sph(0.045, 6, 4); f.scale(1, 0.6, 1); f.translate(Math.cos(a) * d, r * 1.7 + rr() * 0.08, Math.sin(a) * d); B.add(f, colors[i % colors.length]); }
}

// ------------------------------------------------------------------ symbols the kit lacks (flat, unit size, facing +z)
export function symbolGeo(name) {
  if (name === 'shuriken') {
    const s = new THREE.Shape();
    for (let i = 0; i < 8; i++) { const a = PI / 2 + i * PI / 4, r = i % 2 ? 0.14 : 0.48; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (!i) s.moveTo(x, y); else s.lineTo(x, y); }
    s.closePath(); const hole = new THREE.Path(); hole.absarc(0, 0, 0.07, 0, TAU, true); s.holes.push(hole);
    const g = new THREE.ShapeGeometry(s, 4); return g.index ? g.toNonIndexed() : g;
  }
  if (name === 'bamboo') { // a culm with two nodes and a leaf
    const parts = [];
    for (let k = 0; k < 3; k++) { const s = new THREE.Shape(); const y0 = -0.45 + k * 0.31; s.moveTo(-0.08, y0); s.lineTo(0.08, y0); s.lineTo(0.08, y0 + 0.27); s.lineTo(-0.08, y0 + 0.27); s.closePath(); parts.push(s); }
    const lf = new THREE.Shape(); lf.moveTo(0.08, 0.05); lf.quadraticCurveTo(0.34, 0.18, 0.46, 0.04); lf.quadraticCurveTo(0.3, 0.0, 0.08, 0.02); lf.closePath(); parts.push(lf);
    const g = new THREE.ShapeGeometry(parts, 4); return g.index ? g.toNonIndexed() : g;
  }
  if (name === 'futon') { // a folded futon stack (the inn)
    const parts = [];
    for (let k = 0; k < 3; k++) { const s = new THREE.Shape(), y = -0.32 + k * 0.22, w = 0.42 - k * 0.04; s.moveTo(-w, y); s.lineTo(w, y); s.quadraticCurveTo(w + 0.08, y + 0.09, w, y + 0.18); s.lineTo(-w, y + 0.18); s.quadraticCurveTo(-w - 0.08, y + 0.09, -w, y); parts.push(s); }
    const g = new THREE.ShapeGeometry(parts, 4); return g.index ? g.toNonIndexed() : g;
  }
  if (name === 'basket') { // a woven basket with a handle (the craftshop)
    const s = new THREE.Shape(); s.moveTo(-0.36, 0.05); s.lineTo(0.36, 0.05); s.lineTo(0.26, -0.38); s.lineTo(-0.26, -0.38); s.closePath();
    const h = new THREE.Shape(); h.absarc(0, 0.05, 0.3, 0, PI, false); h.absarc(0, 0.05, 0.22, PI, 0, true);
    const g = new THREE.ShapeGeometry([s, h], 6); return g.index ? g.toNonIndexed() : g;
  }
  // (anything else: a plain round)
  const s = new THREE.Shape(); s.absarc(0, 0, 0.4, 0, TAU, false);
  const g = new THREE.ShapeGeometry(s, 8); return g.index ? g.toNonIndexed() : g;
}
/** a chunky raised symbol (extruded) for signboards, local z out */
export function raisedSymbol(B, name, size, color, depth = 0.025) {
  const g = symbolGeo(name); g.scale(size, size, 1); g.translate(0, 0, depth);
  B.add(g, color);
}

// ------------------------------------------------------------------ cages (each its own small template)
/** a bamboo cage (≈1.25 m): posts, lashed bars, a little thatched lid; the door (front, +z) is returned as an anim
 *  part so it can swing open. → Builder template with { door } info */
export function cageTpl(seed = 0) {
  const B = new Builder(seed + 501); B.warpAmt = 0.02;
  const w = 1.1, d = 1.0, h = 1.2;
  const bamboo = (a, b, r = 0.03, c = '#a8a858') => B.add(tube([{ p: a, r }, { p: b, r: r * 0.92 }], 6, false), (p, n, o) => o.set(c).multiplyScalar(0.84 + 0.2 * clamp(n.y + 0.5)));
  // floor slats and a low stone base
  const base = G.box(w + 0.1, 0.08, d + 0.1, 0.03); base.translate(0, 0.04, 0); B.add(base, '#8a7a62');
  for (let i = 0; i < 6; i++) { const s = G.box(w, 0.03, d / 6 - 0.02, 0.008); s.translate(0, 0.095, -d / 2 + (i + 0.5) * d / 6); B.add(s, i % 2 ? '#b89868' : '#a88858'); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bamboo(V(sx * w / 2, 0.08, sz * d / 2), V(sx * w / 2, h, sz * d / 2), 0.045, '#9a9a50');
  // bars on the back and sides
  const bars = (ax, az, bx, bz, n) => { for (let i = 1; i < n; i++) { const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t; bamboo(V(x, 0.1, z), V(x, h - 0.02, z), 0.022); } };
  bars(-w / 2, -d / 2, w / 2, -d / 2, 6); bars(-w / 2, -d / 2, -w / 2, d / 2, 5); bars(w / 2, -d / 2, w / 2, d / 2, 5);
  for (const y of [0.16, h - 0.08]) { bamboo(V(-w / 2, y, -d / 2), V(w / 2, y, -d / 2), 0.026); bamboo(V(-w / 2, y, -d / 2), V(-w / 2, y, d / 2), 0.026); bamboo(V(w / 2, y, -d / 2), V(w / 2, y, d / 2), 0.026); bamboo(V(-w / 2, y, d / 2), V(w / 2, y, d / 2), 0.026); }
  // a thatched lid
  const lid = G.box(w + 0.28, 0.12, d + 0.28, 0.05); lid.translate(0, h + 0.06, 0); B.add(lid, '#c4a46a');
  const lid2 = G.box(w * 0.7, 0.1, d * 0.7, 0.04); lid2.translate(0, h + 0.16, 0); B.add(lid2, '#b8985e');
  // ropes at the corners
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0.16, h - 0.08]) { const k = G.box(0.06, 0.05, 0.06, 0.01); k.translate(sx * w / 2, y, sz * d / 2); B.add(k, '#5a4434'); }
  // the door: the front bars on a hinge at the left post, with a padlock
  B.anim({ p: [-w / 2, 0, d / 2], kind: 'swing', axis: [0, 1, 0], speed: 0, amp: 0 }, () => {
    for (let i = 1; i < 6; i++) { const x = i / 6 * w; bamboo(V(x, 0.12, 0), V(x, h - 0.04, 0), 0.022); }
    bamboo(V(0.04, 0.2, 0.01), V(w - 0.04, 0.2, 0.01), 0.024); bamboo(V(0.04, h - 0.12, 0.01), V(w - 0.04, h - 0.12, 0.01), 0.024);
    const lock = G.box(0.1, 0.12, 0.05, 0.02); lock.translate(w - 0.05, h * 0.55, 0.05); B.add(lock, '#7a6a50');
    const sh = G.torus(0.035, 0.012, 4, 8, PI); sh.translate(w - 0.05, h * 0.55 + 0.06, 0.05); B.add(sh, C.iron);
  });
  const tpl = B.finish();
  tpl.size = { w, d, h };
  return tpl;
}

// ------------------------------------------------------------------ the captain's arena ring (a ground decal mesh)
export function arenaRing(r, color = '#c83a5a') {
  const g = new THREE.RingGeometry(r - 0.16, r + 0.16, 64, 1); g.rotateX(-PI / 2);
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false });
  const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 2; mesh.name = 'captainRing';
  return mesh;
}
export { mixc, shade, C, G, V, PI, Builder };

/** soft ground scorch / soot decals (one transparent mesh; per-vertex alpha fades each blot out at its rim):
 *  spots [{ x, y, z, r, seed }] → a Mesh to add to the scene (or an overlay group) */
export function scorchMesh(spots, color = '#241c1a') {
  const pos = [], col = [], idx = [], c = new THREE.Color(color), N = 18;
  for (const s of spots) {
    const rr = mulberry32((s.seed || 1) * 977 + 5), base = pos.length / 3;
    pos.push(s.x, s.y + 0.03, s.z); col.push(c.r, c.g, c.b, s.a ?? 0.5);
    for (let ring = 1; ring <= 2; ring++) for (let i = 0; i < N; i++) {
      const a = i / N * TAU, k = s.r * (ring === 1 ? 0.55 : 1) * (0.78 + rr() * 0.36);
      pos.push(s.x + Math.cos(a) * k, s.y + 0.03, s.z + Math.sin(a) * k); col.push(c.r, c.g, c.b, ring === 1 ? (s.a ?? 0.5) * 0.7 : 0);
    }
    for (let i = 0; i < N; i++) { const a = base + 1 + i, b = base + 1 + (i + 1) % N; idx.push(base, b, a); const a2 = a + N, b2 = b + N; idx.push(a, b, b2, a, b2, a2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx);
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 1; mesh.name = 'village:scorch';
  return mesh;
}

// ------------------------------------------------------------------ the siege captain's gear (on a zone monster's model)
/** Captain's gear for a Kamaitachi-shaped body (model space: head at (0, 0.54, 0.38), back at z ≈ -0.2): a black
 *  lacquered kabuto with a gold crescent crest and a flared neck guard, red shoulder plates, and a sashimono war banner on
 *  a pole across its back. → a Builder template (body + cloth buckets) */
/** The siege captain's war gear in its base model's local frame (built for the Kamaitachi's proportions). place: per part
 *  [dx, dy, dz, scale] moves / scales the helm, the shoulder plates (sw: their spread) and the back banner about their own
 *  pivots for another body, or null leaves that part off (captains.js CAPTAINS[id].gear). */
export function captainGearTpl({ lacquer = '#2c2a3c', trim = '#e8b84a', plate = '#b8342e', banner = '#4a2a5a', mark = '#f0e2c4', place = {} } = {}) {
  const B = new Builder(911); B.warpAmt = 0; B.jitter = 0;
  const P = { helm: [0, 0, 0, 1], sode: [0, 0, 0, 1], flag: [0, 0, 0, 1], sw: 1, ...place };
  const part = (q, pivot, fn) => { if (!q) return; B.at([pivot[0] + q[0], pivot[1] + q[1], pivot[2] + q[2]], q[4] || 0, () => { B.push([-pivot[0], -pivot[1], -pivot[2]]); fn(); B.pop(); }, q[3] ?? 1); };
  part(P.helm, [0, 0.62, 0.37], () => {
  // the kabuto: a low dome between the ears, a brim, a flared shikoro behind, the crescent maedate in front
  const dome = G.sph(0.13, 16, 10); dome.scale(1, 0.62, 1.05); dome.translate(0, 0.655, 0.36);
  B.add(dome, (p, n, o) => o.set(lacquer).multiplyScalar(0.85 + 0.3 * clamp(n.y)));
  const rib = G.torus(0.125, 0.012, 4, 18, Math.PI); rib.rotateY(Math.PI / 2); rib.scale(1, 0.62, 1.05); rib.translate(0, 0.655, 0.36); B.add(rib, trim);
  const brim = G.cyl(0.155, 0.16, 0.022, 18); brim.translate(0, 0.62, 0.37); B.add(brim, lacquer);
  for (let k = 0; k < 3; k++) { const s = G.cyl(0.16 + k * 0.022, 0.175 + k * 0.024, 0.03, 16, true); s.scale(1, 1, 0.9); s.translate(0, 0.6 - k * 0.032, 0.3 - k * 0.012); B.add(s, k % 2 ? plate : lacquer); }
  { // the maedate: a gold crescent moon rising from a round boss on the brow
    const sh = new THREE.Shape(); sh.absarc(0, 0, 0.13, Math.PI * 0.08, Math.PI * 0.92, false); sh.absarc(0, -0.035, 0.105, Math.PI * 0.88, Math.PI * 0.12, true);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.018, bevelEnabled: false, curveSegments: 14 }); g.translate(0, 0, -0.009); g.rotateX(-0.3); g.translate(0, 0.645, 0.5);
    B.add(g.index ? g.toNonIndexed() : g, trim);
  }
  const boss = G.sph(0.03, 8, 6); boss.scale(1, 1, 0.6); boss.translate(0, 0.645, 0.505); B.add(boss, '#f8e070');
  });
  // sode: lacquered shoulder plates laced in rows
  part(P.sode, [0, 0.43, 0.2], () => { for (const k of [-1, 1]) B.at([k * 0.165 * P.sw, 0.43, 0.2], 0, () => {
    for (let r = 0; r < 3; r++) { const pl = G.box(0.13, 0.04, 0.16, 0.012); pl.rotateZ(k * 0.55); pl.translate(k * 0.012 * r, -r * 0.045, 0); B.add(pl, r % 2 ? lacquer : plate); }
    const cord = G.box(0.015, 0.14, 0.012, 0); cord.rotateZ(k * 0.55); cord.translate(0, -0.04, 0.085); B.add(cord, trim);
  }, 1, 0, 0); });
  // the sashimono: a pole up from the back, a cross-arm, a tall banner with the yokai crest
  part(P.flag, [0, 0.6, -0.2], () => {
  const pole = G.cyl(0.014, 0.016, 0.9, 6); pole.translate(0, 0.72, -0.2); B.add(pole, '#3a2a22');
  const arm = G.cyl(0.011, 0.011, 0.24, 5); arm.rotateZ(Math.PI / 2); arm.translate(0.11, 1.12, -0.2); B.add(arm, '#3a2a22');
  const flag = G.plane(0.22, 0.5, 2, 4); flag.translate(0.115, 0.86, -0.205); B.cloth(flag, { grad: [shade(banner, 0.75), banner] }, { x0: 0, x1: 0.24, yTop: 1.12, yBot: 0.6 });
  const crest = crestGeo(); crest.scale(0.15, 0.15, 1); crest.translate(0.115, 0.95, -0.198); B.cloth(crest, mark, { x0: 0, x1: 0.24, yTop: 1.12, yBot: 0.6 });
  const back = flag.clone(); back.rotateY(Math.PI); back.translate(0.23, 0, -0.41); B.cloth(back, shade(banner, 0.8), { x0: 0, x1: 0.24, yTop: 1.12, yBot: 0.6 });
  });
  return B.finish();
}

// ------------------------------------------------------------------ the Waypoint Shrine (every village: one design, zone tints)
/** The waystone shrine (ROADMAP Z-D6: one design for all four villages, tinted per zone; data.js WAYSTONE can swap in a
 *  Blender model): a stone plinth, a little hokora on its pedestal under a tinted gable roof with a shimenawa, a tall
 *  standing stone with the carved paw plaque (its rune lights when the village is saved), a torii in front and two
 *  small stone lanterns. o: { roof (zone tint), torii, stone, cap: 'moss' | 'snow' | 'salt' | 'leaves', seed }.
 *  Local frame: front = +z (the torii side). → the builder info the village runtime needs (fp, door, rune, siege, saved) */
export function waystone(B, { roof: roofColor = '#5a9a88', torii: toriiColor = C.vermilion, stone = '#a8a0a8', cap = 'moss', seed = 77 } = {}) {
  const capColor = { moss: '#86a856', snow: '#f4f8ff', salt: '#e8f0ec', leaves: '#d8582e' }[cap] || '#86a856';
  const pl = G.box(2.0, 0.14, 1.7, 0.05); pl.translate(0, 0.07, -0.1); B.add(pl, { grad: ['#9a9088', '#c2b8ae'] });
  // the hokora on its pedestal
  B.at([-0.45, 0.14, -0.45], 0, () => {
    const ped = G.box(0.74, 0.46, 0.62, 0.04); ped.translate(0, 0.23, 0); B.add(ped, '#b0a69a');
    const body = G.box(0.56, 0.5, 0.46, 0.02); body.translate(0, 0.71, 0); B.add(body, '#a0523a');
    const doorG = G.box(0.34, 0.36, 0.02, 0); doorG.translate(0, 0.68, 0.24); B.add(doorG, '#5a3a2a');
    for (let i = 1; i < 4; i++) { const s = G.box(0.012, 0.34, 0.01, 0); s.translate(-0.17 + i * 0.085, 0.68, 0.252); B.add(s, '#c8a060'); }
    roofPart(B, { type: 'gable', w: 0.56, d: 0.46, y0: 0.96, over: 0.2, gOver: 0.14, H: 0.36, curve: 0.4, lift: 0.1, liftW: 0.3, thick: 0.07, ribW: 0.14, color: roofColor, k: 0.3, oni: false });
    if (cap === 'snow') { const sn = puff(V(0, 1.22, 0), 0.34, { detail: 2, noise: 0.25, squash: 0.32, seed: seed + 3 }); sn.scale(1.15, 1, 0.95); B.add(sn, (p, n, o) => o.set(n.y > 0.3 ? '#f6f9ff' : '#c4d2ee')); }
    B.at([0, 0.92, 0.3], 0, () => shimenawa(B, { w: 0.62, y: 0, sag: 0.06, z: 0, r: 0.025 }));
    const box = G.box(0.4, 0.2, 0.2, 0.02); box.translate(0, 0.1, 0.52); B.add(box, '#7a5a42');
  });
  // the waystone: a tall standing stone with a carved paw plaque, its crown mossy / snowy / salt-crusted / leaf-strewn
  B.at([0.55, 0.14, -0.35], 0, () => {
    const st = puff(V(0, 0, 0), 0.32, { detail: 2, noise: 0.18, squash: 1, seed }); st.scale(1.0, 2.25, 0.72); st.translate(0, 0.66, 0);
    B.add(st, (p, n, o) => { o.set(n.y > 0.45 && p.y > 0.95 ? capColor : stone).multiplyScalar(0.86 + 0.18 * clamp(n.y + 0.4)); });
    const crown = puff(V(0.05, 1.28, 0), 0.18, { detail: 1, noise: 0.4, squash: 0.45, seed: seed + 1 }); B.add(crown, capColor);
    const plq = G.box(0.32, 0.36, 0.04, 0.03); plq.translate(0, 0.78, 0.2); B.add(plq, shade(stone, 0.86));
  });
  B.at([0, 0, 0.95], 0, () => toriiPart(B, { w: 1.15, h: 1.5, color: toriiColor }));
  for (const s of [-1, 1]) B.at([s * 0.85, 0.14, 0.45], 0, () => toroPart(B, { s: 0.55 }));
  return {
    fp: [-1.0, -0.95, 1.0, 0.75], door: [0, 1.55], rune: [0.55, 0.14 + 0.78, -0.35 + 0.23], keeper: null,
    lamps: [],
    siege(B) {
      // the rune cracked and dark, a war banner jammed in beside the shrine
      B.at([0.55, 0.14 + 0.78, -0.13], 0, () => { const c = G.box(0.02, 0.3, 0.012, 0); c.rotateZ(0.5); B.add(c, '#2a2226'); const c2 = G.box(0.015, 0.16, 0.012, 0); c2.rotateZ(-0.4); c2.translate(0.06, -0.06, 0); B.add(c2, '#2a2226'); });
      B.at([1.25, 0, -0.9], 0, () => warBanner(B, { h: 2.2, w: 0.5, seed: seed - 16 }));
    },
    saved(B) {
      // the paw rune glowing sky-blue on the plaque
      B.at([0.55, 0.14 + 0.78, -0.12], 0, () => {
        const pad = G.sph(0.06, 8, 6); pad.scale(1, 0.85, 0.3); pad.translate(0, -0.05, 0); B.glow(pad, '#8fd0ff', { hot: true, tint: 1 });
        for (let i = 0; i < 4; i++) { const a = PI / 2 + (i - 1.5) * 0.5, t = G.sph(0.028, 6, 5); t.scale(1, 1, 0.3); t.translate(Math.cos(a) * 0.1, 0.02 + Math.sin(a) * 0.1, 0); B.glow(t, '#8fd0ff', { hot: true, tint: 1 }); }
      });
    },
  };
}
