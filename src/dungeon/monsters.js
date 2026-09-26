// Cute yokai monsters: definitions + procedural models + lightweight procedural animation.
import * as THREE from 'three';
import { makeToon, makeOutline } from '../gfx/materials.js';
import { paint, merge, tube, xf, RoundedBox } from '../gfx/geom.js';
import { buildHumanoid } from '../actors/charKit.js';
import { clamp, TAU, rand, ease } from '../core/util.js';

const C = h => new THREE.Color(h);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const INK = '#3a2230';

function ell(rx, ry, rz, color, p = [0, 0, 0], r = [0, 0, 0], seg = 18) {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7)); g.scale(rx, ry, rz);
  if (r[0] || r[1] || r[2]) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...r)));
  g.translate(...p); return paint(g, (pp, n, o) => o.set(color));
}
function cone(r, h, color, p, rot = [0, 0, 0], seg = 10) { const g = new THREE.ConeGeometry(r, h, seg, 2); g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot))); g.translate(...p); return paint(g, (pp, n, o) => o.set(color)); }
function eyes(y, z, sep, size = 1, angry = true, col = '#2a1418') {
  const out = [];
  for (const s of [-1, 1]) {
    out.push(ell(0.05 * size, 0.06 * size, 0.025, col, [s * sep, y, z], [0, s * 0.3, 0]));
    out.push(ell(0.018 * size, 0.018 * size, 0.012, '#ffffff', [s * sep - 0.012 * size, y + 0.022 * size, z + 0.02]));
    if (angry) out.push(tube([{ p: V(s * (sep + 0.05 * size), y + 0.09 * size, z - 0.01), r: 0.012 * size }, { p: V(s * (sep - 0.05 * size), y + 0.065 * size, z + 0.012), r: 0.012 * size }], 4, true));
  }
  out.forEach(g => { if (!g.attributes.color) paint(g, (p, n, o) => o.set(INK)); });
  return out;
}
function blush(y, z, sep, s = 1) { return [-1, 1].map(k => ell(0.04 * s, 0.022 * s, 0.012, '#ff8aa8', [k * sep, y, z], [0, k * 0.5, 0])); }

// thin double-sided shell from an open surface (outer as built, inner = shrunk copy with flipped winding)
function shell(g, k = 0.965, inner = null) {
  if (!g.attributes.normal) g.computeVertexNormals();
  const a = g.index ? g.toNonIndexed() : g; // keeps the smooth (shared-vertex) normals
  const b = a.clone(); b.scale(k, k, k);
  const p = b.attributes.position, n = b.attributes.normal;
  for (let i = 0; i < p.count; i += 3) for (const at of [p, n, b.attributes.color, b.attributes.uv]) { if (!at) continue; for (let c = 0; c < at.itemSize; c++) { const t = at.getComponent(i + 1, c); at.setComponent(i + 1, c, at.getComponent(i + 2, c)); at.setComponent(i + 2, c, t); } }
  for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  if (inner) paint(b, (pp, nn, o) => o.set(inner));
  return [a, b];
}
// camera-facing additive glow for instanced sprites; leaves the scene alpha alone (see dungeonWorld keepAlphaAdd)
function glowBillboard(color, size = 0.5) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(color) }, uSize: { value: size } },
    vertexShader: /* glsl */`uniform float uSize; varying vec2 vQ;
      void main() { vQ = position.xy * 2.0; vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float s = length((modelMatrix * instanceMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz); c.xy += position.xy * s * uSize * 2.0; gl_Position = projectionMatrix * c; }`,
    fragmentShader: /* glsl */`uniform vec3 uCol; varying vec2 vQ;
      void main() { float k = clamp(1.0 - length(vQ), 0.0, 1.0); gl_FragColor = vec4(uCol * k * k * (0.5 + 0.5 * k), 0.0); }`,
    transparent: true, depthWrite: false, toneMapped: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  });
  return m;
}
// ------------------------------------------------------------------ model builders -> {root, body, mat, parts}
// Monsters get a view-space fresnel edge on top of the lit rim so dark bodies (dust bunnies, oni) separate from the floor
// (weighted toward dark bodies: on pale ones a bright edge would melt neighbours together, the ink outline does that job)
const EDGE_OUT = 'outgoingLight += vec3(1.0, 0.94, 0.86) * pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 3.0) * 0.34 * (1.0 - 0.85 * clamp(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)) * 1.6, 0.0, 1.0));';
function finish(parts, opts = {}) {
  const mat = makeToon({ vertexColors: true, objectBrush: true, brush: 0.1, rim: 0.7, term: [-0.02, 0.3], ...(opts.mat || {}), fragOut: EDGE_OUT + (opts.mat?.fragOut || '') });
  const geo = merge(parts);
  const body = new THREE.Mesh(geo, mat); body.castShadow = true; body.receiveShadow = true;
  const ol = new THREE.Mesh(geo, makeOutline(INK, opts.outline ?? 0.021));
  const pivot = new THREE.Group(); pivot.add(body, ol);
  const root = new THREE.Group(); root.add(pivot);
  return { root, pivot, body, mat, outline: ol };
}
const BUILD = {
  mochi(v) {
    const col = v.color || '#ffd6e4';
    const b = new THREE.SphereGeometry(0.42, 26, 18); b.scale(1, 0.72, 1); b.translate(0, 0.3, 0);
    paint(b, (p, n, o) => { o.set(col).lerp(C('#ffffff'), clamp(n.y * 0.35)); if (p.y < 0.12) o.multiplyScalar(0.9); });
    const parts = [b, ...eyes(0.36, 0.36, 0.13, 1.1, v.angry !== false), ...blush(0.28, 0.35, 0.22)];
    parts.push(tube([{ p: V(-0.04, 0.26, 0.39), r: 0.01 }, { p: V(0, 0.24, 0.4), r: 0.01 }, { p: V(0.04, 0.26, 0.39), r: 0.01 }], 4, true));
    if (v.topping === 'leaf') parts.push(ell(0.14, 0.03, 0.07, '#6ab04c', [0.05, 0.6, 0], [0, 0.4, 0.3]));
    if (v.topping === 'berry') parts.push(ell(0.08, 0.1, 0.08, '#ff4a5a', [0, 0.64, 0]), ell(0.06, 0.02, 0.04, '#5aa040', [0, 0.73, 0]));
    if (v.topping === 'snow') parts.push(ell(0.2, 0.06, 0.2, '#ffffff', [0, 0.58, 0]));
    if (v.crown) { for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; parts.push(cone(0.06, 0.16, '#ffd24a', [Math.cos(a) * 0.16, 0.66, Math.sin(a) * 0.16])); } parts.push(paint(xf(new THREE.CylinderGeometry(0.2, 0.22, 0.08, 16), { p: [0, 0.6, 0] }), (p, n, o) => o.set('#ffd24a'))); }
    if (v.king) { // King Mochi: velvet-capped jewelled crown, ermine-trimmed royal cape, a very serious moustache
      const GOLD = '#ffcf3a';
      parts.push(ell(0.17, 0.12, 0.17, '#c8283a', [0, 0.63, 0], [0, 0, 0], 16)); // velvet cap
      parts.push(paint(xf(new THREE.CylinderGeometry(0.2, 0.23, 0.1, 20, 1, true), { p: [0, 0.6, 0] }), (p, n, o) => o.set(GOLD)));
      parts.push(paint(xf(new THREE.TorusGeometry(0.225, 0.025, 6, 22), { p: [0, 0.555, 0], r: [Math.PI / 2, 0, 0] }), (p, n, o) => o.set('#fff0a8')));
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU + Math.PI / 6, x = Math.sin(a) * 0.2, z = Math.cos(a) * 0.2;
        parts.push(cone(0.05, 0.15, GOLD, [x, 0.7, z], [Math.cos(a) * 0.18, 0, -Math.sin(a) * 0.18], 8));
        parts.push(ell(0.028, 0.028, 0.028, '#fff8ee', [x * 1.08, 0.79, z * 1.08], [0, 0, 0], 8));
      }
      [['#ff3a5a', 0], ['#4a9aff', 0.62], ['#4ad08a', -0.62]].forEach(([c, a]) => parts.push(ell(0.036, 0.04, 0.02, c, [Math.sin(a) * 0.225, 0.6, Math.cos(a) * 0.225], [0, a, 0], 10)));
      parts.push(ell(0.035, 0.035, 0.035, GOLD, [0, 0.76, 0], [0, 0, 0], 10), cone(0.012, 0.08, GOLD, [0, 0.82, 0], [0, 0, 0], 6));
      // cape: back half-cone shell falling from the "shoulders" to the floor, with an ermine collar
      const cprof = []; for (let i = 0; i <= 6; i++) { const t = i / 6; cprof.push(new THREE.Vector2(0.3 + t * 0.2 + Math.sin(t * Math.PI) * 0.04, 0.5 - t * 0.47)); }
      const cape = new THREE.LatheGeometry(cprof.reverse(), 18, Math.PI * 0.62, Math.PI * 0.76); cape.translate(0, 0, -0.06);
      paint(cape, (p, n, o) => { o.set('#b8203a'); if (p.y < 0.07) o.set('#ffd24a'); });
      parts.push(...shell(cape, 0.96, '#ff9ab8'));
      const col = new THREE.TorusGeometry(0.3, 0.06, 8, 18, Math.PI * 0.9); col.rotateX(Math.PI / 2); col.rotateY(Math.PI); col.translate(0, 0.49, -0.07);
      parts.push(paint(col, (p, n, o) => { o.set('#fffaf4'); if (Math.sin(p.x * 60) * Math.sin(p.z * 60 + p.y * 30) > 0.8) o.set('#2a1a20'); }));
      for (const s of [-1, 1]) { // curly royal moustache: two plump lobes with up-curled tips
        parts.push(ell(0.06, 0.028, 0.03, '#a8683e', [s * 0.052, 0.3, 0.418], [0, s * 0.35, s * -0.12], 12));
        parts.push(paint(tube([{ p: V(s * 0.1, 0.302, 0.405), r: 0.02 }, { p: V(s * 0.14, 0.315, 0.385), r: 0.014 }, { p: V(s * 0.15, 0.345, 0.378), r: 0.01 }, { p: V(s * 0.13, 0.36, 0.385), r: 0.006 }], 6, true), (p, n, o) => o.set('#a8683e')));
      }
    }
    return finish(parts);
  },
  dustbunny(v) {
    const parts = [];
    const col = v.color || '#d0c8dc'; // light lavender-grey fluff so they read on the dark earth
    for (let i = 0; i < 26; i++) { const u = rand(-1, 1), th = rand(0, TAU); const d = V(Math.sqrt(1 - u * u) * Math.cos(th), u, Math.sqrt(1 - u * u) * Math.sin(th)); parts.push(ell(0.12, 0.12, 0.12, i % 3 ? col : '#f0eaf6', [d.x * 0.24, 0.3 + d.y * 0.22, d.z * 0.24], [0, 0, 0], 8)); }
    parts.push(ell(0.3, 0.27, 0.3, col, [0, 0.3, 0]));
    parts.push(...eyes(0.34, 0.28, 0.1, 1.0, true, '#1a1020'));
    for (const s of [-1, 1]) parts.push(ell(0.05, 0.14, 0.03, col, [s * 0.12, 0.6, 0], [0, 0, -s * 0.3]));
    return finish(parts);
  },
  kinoko(v) {
    const cap = v.color || '#ff5a5a';
    const c = new THREE.SphereGeometry(0.42, 22, 14, 0, TAU, 0, Math.PI * 0.55); c.scale(1, 0.75, 1); c.translate(0, 0.42, 0);
    paint(c, (p, n, o) => { o.set(cap); const q = p.clone().normalize(); if (Math.sin(q.x * 11) * Math.sin(q.z * 11) * Math.cos(q.y * 7) > 0.35) o.set('#fff6ee'); });
    const under = new THREE.CylinderGeometry(0.4, 0.3, 0.06, 20); under.translate(0, 0.44, 0); paint(under, (p, n, o) => o.set('#f4e0c8'));
    const stem = new THREE.CylinderGeometry(0.2, 0.24, 0.42, 16); stem.translate(0, 0.22, 0); paint(stem, (p, n, o) => o.set('#fff4e4'));
    const parts = [c, under, stem, ...eyes(0.26, 0.21, 0.08, 0.9, true), ...blush(0.18, 0.2, 0.14, 0.8)];
    for (const s of [-1, 1]) parts.push(ell(0.08, 0.05, 0.1, '#f4e0c8', [s * 0.11, 0.03, 0.04]));
    return finish(parts);
  },
  lantern(v) {
    const col = v.color || '#ff8a4a';
    const b = new THREE.SphereGeometry(0.36, 22, 16); b.scale(1, 1.25, 1); b.translate(0, 0.75, 0);
    paint(b, (p, n, o) => { o.set(col); if (Math.sin((p.y - 0.75) * 34) > 0.75) o.multiplyScalar(0.8); });
    const top = new THREE.CylinderGeometry(0.2, 0.22, 0.1, 14); top.translate(0, 1.2, 0); paint(top, (p, n, o) => o.set('#3a2020'));
    const bot = new THREE.CylinderGeometry(0.22, 0.2, 0.1, 14); bot.translate(0, 0.3, 0); paint(bot, (p, n, o) => o.set('#3a2020'));
    const parts = [b, top, bot];
    parts.push(ell(0.13, 0.13, 0.06, '#fffaf0', [0, 0.88, 0.33]), ell(0.07, 0.08, 0.04, '#2a1418', [0, 0.87, 0.37]), ell(0.025, 0.025, 0.02, '#ffffff', [-0.02, 0.9, 0.4]));
    parts.push(tube([{ p: V(0, 0.62, 0.34), r: 0.07 }, { p: V(0.02, 0.5, 0.42), r: 0.06 }, { p: V(0.06, 0.4, 0.44), r: 0.04 }], 6, true));
    paint(parts[parts.length - 1], (p, n, o) => o.set('#ff6a8a'));
    const m = finish(parts, { mat: { fragOut: 'outgoingLight += diffuseColor.rgb * 0.55 * step(0.5, diffuseColor.r);' } });
    m.glow = col; return m;
  },
  kasa(v) {
    const col = C(v.color || '#8a5ad0'), paper = C('#fff4ec');
    const RIBS = 10, top = 1.5, hem = 0.5;
    // domed wagasa canopy (lathe profile), pleated between ribs, with a scalloped hem that dips between ribs
    const prof = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; prof.push(new THREE.Vector2(0.02 + 0.56 * Math.pow(t, 0.85) * (1 + 0.08 * Math.sin(t * Math.PI)), top - (top - hem) * t)); }
    prof.reverse(); // bottom → top so lathe normals face outward
    const u = new THREE.LatheGeometry(prof, RIBS * 4);
    const pos = u.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), a = Math.atan2(x, z);
      const t = (top - y) / (top - hem);
      const pleat = 1 - 0.07 * t * (0.5 - 0.5 * Math.cos(a * RIBS));
      pos.setX(i, x * pleat); pos.setZ(i, z * pleat);
      if (t > 0.97) pos.setY(i, y + 0.07 * (0.5 - 0.5 * Math.cos(a * RIBS))); // scallops lift between ribs
    }
    u.computeVertexNormals();
    paint(u, (p, n, o) => {
      const a = Math.atan2(p.x, p.z), t = (top - p.y) / (top - hem), fold = 0.5 + 0.5 * Math.cos(a * RIBS);
      o.copy(col).lerp(paper, 0.08 + (1 - fold) * 0.14);
      if (t > 0.86) o.copy(col).multiplyScalar(0.72); // darker hem band
      if (t < 0.2) o.lerp(paper, 0.35);                // pale crown
      if (Math.abs(t - 0.55) < 0.025) o.set('#ffe29a');  // thin painted stripe
    });
    const inner = new THREE.LatheGeometry(prof.slice().reverse().map(q => new THREE.Vector2(q.x * 0.95, q.y - 0.02)), RIBS * 2); // underside
    paint(inner, (p, n, o) => o.copy(col).multiplyScalar(0.55));
    const parts = [u, inner];
    // bamboo ribs along every fold, poking out at the hem
    for (let i = 0; i < RIBS; i++) {
      const a = (i / RIBS) * TAU, s = Math.sin(a), c = Math.cos(a), R = 0.58;
      const rib = tube([{ p: V(0, top + 0.02, 0), r: 0.012 }, { p: V(s * R * 0.55, top - 0.5, c * R * 0.55), r: 0.016 }, { p: V(s * (R + 0.01), hem + 0.01, c * (R + 0.01)), r: 0.014 }], 4, true);
      parts.push(paint(rib, (p, n, o) => o.set('#8a5a3a')));
    }
    parts.push(cone(0.05, 0.24, '#8a5a3a', [0, top + 0.12, 0]));
    parts.push(paint(xf(new THREE.TorusGeometry(0.075, 0.02, 6, 20), { p: [0, top - 0.12, 0], r: [Math.PI / 2, 0, 0] }), (p, n, o) => o.set('#e8503a')));
    // face on the paper
    parts.push(ell(0.13, 0.14, 0.05, '#fffaf0', [0, 1.0, 0.43], [-0.3, 0, 0]), ell(0.07, 0.08, 0.04, '#2a1418', [0, 1.0, 0.47], [-0.3, 0, 0]), ell(0.024, 0.024, 0.02, '#ffffff', [-0.024, 1.03, 0.5]));
    const brow = tube([{ p: V(-0.07, 1.14, 0.42), r: 0.013 }, { p: V(0.06, 1.18, 0.41), r: 0.013 }], 4, true); paint(brow, (p, n, o) => o.set(INK)); parts.push(brow);
    if (!v.lord) { const tongue = tube([{ p: V(0, 0.78, 0.47), r: 0.075 }, { p: V(0, 0.64, 0.55), r: 0.06 }, { p: V(0.03, 0.5, 0.53), r: 0.03 }], 6, true); paint(tongue, (p, n, o) => o.set('#ff6a8a')); parts.push(tongue); }
    // single wooden leg + geta
    const leg = new THREE.CylinderGeometry(0.035, 0.04, 0.5, 6); leg.translate(0, 0.25, 0); paint(leg, (p, n, o) => o.set('#c98f5e')); parts.push(leg);
    const geta = new RoundedBox(0.22, 0.06, 0.32, 1, 0.02); geta.translate(0, 0.03, 0.03); paint(geta, (p, n, o) => o.set('#b07a4a')); parts.push(geta);
    for (const z of [-0.08, 0.12]) { const t = new THREE.BoxGeometry(0.2, 0.05, 0.04); t.translate(0, -0.01, z); paint(t, (p, n, o) => o.set('#6a4a3a')); parts.push(t); }
    if (v.lord) { // Lord Karakasa: second tier of indigo paper, gold tassels on every rib, crown + talisman, a truly royal tongue
      const GOLD = '#ffcf3a', R2 = 0.8, y0 = hem + 0.06, y1 = 0.3;
      const sk = []; for (let i = 0; i <= 6; i++) { const t = i / 6; sk.push(new THREE.Vector2(0.44 + (R2 - 0.44) * Math.pow(t, 0.8), y0 - (y0 - y1) * t)); }
      const skirt = new THREE.LatheGeometry(sk.reverse(), RIBS * 4);
      const sp = skirt.attributes.position;
      for (let i = 0; i < sp.count; i++) { const x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i), a = Math.atan2(x, z), t = (y0 - y) / (y0 - y1); const pl = 1 - 0.08 * t * (0.5 - 0.5 * Math.cos(a * RIBS + Math.PI)); sp.setX(i, x * pl); sp.setZ(i, z * pl); if (t > 0.97) sp.setY(i, y + 0.06 * (0.5 - 0.5 * Math.cos(a * RIBS + Math.PI))); }
      skirt.computeVertexNormals();
      paint(skirt, (p, n, o) => { const a = Math.atan2(p.x, p.z), t = (y0 - p.y) / (y0 - y1); o.set('#34407e').lerp(C('#fff4ec'), 0.06 * (0.5 + 0.5 * Math.cos(a * RIBS))); if (t > 0.84) o.set(GOLD); else if (Math.abs(t - 0.62) < 0.05) o.set('#ff8aa0'); });
      parts.push(...shell(skirt, 0.97, '#1e2450'));
      for (let i = 0; i < RIBS; i++) { // gold tassels hanging from both tiers
        const a = (i / RIBS) * TAU, s = Math.sin(a), c = Math.cos(a);
        for (const [R, y, len] of [[0.6, hem + 0.02, 0.12], [R2 * 0.97, y1 + 0.04, 0.1]]) {
          const a2 = R === 0.6 ? a : a + Math.PI / RIBS, s2 = Math.sin(a2), c2 = Math.cos(a2);
          parts.push(paint(tube([{ p: V(s2 * R, y, c2 * R), r: 0.008 }, { p: V(s2 * R, y - len, c2 * R), r: 0.008 }], 4, false), (p, n, o) => o.set('#c83a2e')));
          parts.push(ell(0.022, 0.022, 0.022, GOLD, [s2 * R, y - len, c2 * R], [0, 0, 0], 8), cone(0.03, 0.09, i % 2 ? '#e8364a' : GOLD, [s2 * R, y - len - 0.06, c2 * R], [Math.PI, 0, 0], 8));
        }
      }
      // crown ring round the finial + big ofuda talisman on the brow
      parts.push(paint(xf(new THREE.CylinderGeometry(0.13, 0.16, 0.08, 16, 1, true), { p: [0, top - 0.02, 0] }), (p, n, o) => o.set(GOLD)));
      for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; parts.push(cone(0.035, 0.12, GOLD, [Math.sin(a) * 0.14, top + 0.07, Math.cos(a) * 0.14], [Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25], 6), ell(0.02, 0.02, 0.02, i % 2 ? '#4a9aff' : '#ff3a5a', [Math.sin(a) * 0.16, top - 0.02, Math.cos(a) * 0.16], [0, 0, 0], 6)); }
      const of = new THREE.BoxGeometry(0.13, 0.22, 0.014, 1, 6, 1); of.translate(0, -0.11, 0); of.rotateX(-0.5); of.translate(0, top - 0.06, 0.09);
      parts.push(paint(of, (p, n, o) => { o.set('#fff2c8'); if (Math.abs(p.x) < 0.024 && Math.sin(p.y * 80) > -0.4) o.set('#d8302a'); }));
      // heavy lidded brow + royal tongue down to the floor
      const brow = tube([{ p: V(-0.15, 1.12, 0.4), r: 0.026 }, { p: V(0, 1.16, 0.43), r: 0.03 }, { p: V(0.14, 1.17, 0.39), r: 0.022 }], 6, true); parts.push(paint(brow, (p, n, o) => o.set(INK)));
      const tg = tube([{ p: V(0, 0.8, 0.46), r: 0.1 }, { p: V(0.02, 0.62, 0.62), r: 0.09 }, { p: V(0.06, 0.4, 0.68), r: 0.075 }, { p: V(0.1, 0.24, 0.62), r: 0.05 }, { p: V(0.12, 0.2, 0.52), r: 0.025 }], 8, true);
      parts.push(paint(tg, (p, n, o) => { o.set('#ff6a8a'); if (Math.abs(p.x - 0.03 - (0.8 - p.y) * 0.1) < 0.012) o.set('#e04a6a'); }));
    }
    // the tongue hangs under the canopy where only the dark ground bounce reaches it: let the pink self-light a little
    return finish(parts, { mat: { fragOut: 'outgoingLight += diffuseColor.rgb * 0.3 * step(0.8, diffuseColor.r) * step(0.16, diffuseColor.b) * step(diffuseColor.g, 0.3);' } });
  },
  wisp(v) {
    const col = v.color || '#7ab8ff';
    const b = new THREE.SphereGeometry(0.28, 18, 12); b.scale(1, 1.1, 1); b.translate(0, 0.9, 0);
    paint(b, (p, n, o) => o.set(col).lerp(C('#ffffff'), clamp(n.y * 0.5 + 0.2)));
    const flame = cone(0.22, 0.5, col, [0, 1.2, -0.05], [-0.3, 0, 0]);
    const parts = [b, flame, ...eyes(0.94, 0.25, 0.09, 0.9, false, '#1a2a5a')];
    const m = finish(parts, { mat: { fragOut: 'outgoingLight += diffuseColor.rgb * 0.9;' }, outline: 0.012 });
    m.glow = col; return m;
  },
  oni(v) {
    const skin = v.color || '#ff6a5a';
    const body = new THREE.SphereGeometry(0.34, 20, 16); body.scale(1, 1.05, 0.95); body.translate(0, 0.52, 0); paint(body, (p, n, o) => o.set(skin));
    const head = new THREE.SphereGeometry(0.28, 20, 16); head.translate(0, 0.95, 0.02); paint(head, (p, n, o) => o.set(skin));
    const shorts = new THREE.CylinderGeometry(0.34, 0.3, 0.2, 16); shorts.translate(0, 0.3, 0); paint(shorts, (p, n, o) => o.set(Math.sin(p.x * 40 + p.y * 20) > 0.3 ? '#2a2020' : '#ffc83a'));
    const parts = [body, head, shorts, cone(0.06, 0.18, '#fff4d8', [0.12, 1.24, 0], [0, 0, -0.3]), cone(0.06, 0.18, '#fff4d8', [-0.12, 1.24, 0], [0, 0, 0.3]), ...eyes(0.98, 0.25, 0.09, 1.0, true)];
    parts.push(ell(0.1, 0.05, 0.03, '#fff4d8', [0, 0.84, 0.26]));
    for (const s of [-1, 1]) { parts.push(ell(0.08, 0.1, 0.08, skin, [s * 0.14, 0.13, 0.02])); parts.push(ell(0.07, 0.14, 0.07, skin, [s * 0.36, 0.52, 0.05], [0, 0, s * 0.4])); }
    // kanabo club
    const club = new THREE.CylinderGeometry(0.09, 0.05, 0.8, 8); club.rotateZ(-0.6); club.translate(-0.55, 0.75, 0.15); paint(club, (p, n, o) => o.set('#6a4a3a')); parts.push(club);
    for (let i = 0; i < 5; i++) parts.push(cone(0.03, 0.06, '#c8c0b8', [-0.72 + i * 0.05, 1.0 - i * 0.07, 0.24]));
    return finish(parts);
  },
  oniChef(v) { // Oni Chef Gorobei: big red oni in a towering toque and apron, cleaver + ladle instead of the club
    const skin = v.color || '#ff5a4a', WHITE = '#fffaf2', STEEL = '#d4dae4';
    const body = new THREE.SphereGeometry(0.36, 22, 16); body.scale(1.02, 1.0, 0.95); body.translate(0, 0.53, 0); paint(body, (p, n, o) => o.set(skin));
    const head = new THREE.SphereGeometry(0.28, 20, 16); head.translate(0, 0.97, 0.02); paint(head, (p, n, o) => o.set(skin));
    const pants = new THREE.CylinderGeometry(0.36, 0.32, 0.22, 18); pants.translate(0, 0.3, 0); paint(pants, (p, n, o) => o.set(Math.sin(p.x * 40 + p.y * 20) > 0.3 ? '#2a2020' : '#ffc83a'));
    const parts = [body, head, pants, ...eyes(0.99, 0.25, 0.09, 1.05, true)];
    // apron: front shell over the belly with red trim and a sauce splat, bib strap and neckerchief
    const ap = new THREE.SphereGeometry(0.375, 20, 12, Math.PI / 2 - 0.95, 1.9, 0.75, 1.55); ap.scale(1.02, 1.0, 0.95); ap.translate(0, 0.53, 0);
    paint(ap, (p, n, o) => { o.set(WHITE); const e = Math.min(Math.abs(Math.atan2(p.x, p.z)) - 0.95, 0) ; if (e > -0.1 || p.y < 0.26) o.set('#e0443a'); if (Math.hypot(p.x - 0.1, p.y - 0.46) < 0.05) o.set('#f0a040'); });
    parts.push(...shell(ap, 0.985, '#f0e6da'));
    parts.push(paint(xf(new THREE.TorusGeometry(0.17, 0.035, 6, 18), { p: [0, 0.78, 0.02], r: [Math.PI / 2 + 0.15, 0, 0] }), (p, n, o) => o.set('#e0443a')));
    parts.push(ell(0.06, 0.05, 0.03, '#e0443a', [0.07, 0.74, 0.18]), cone(0.04, 0.1, '#e0443a', [0.1, 0.68, 0.18], [0, 0, 0.5], 6));
    // face: bushy brows, fangs, handlebar moustache
    for (const s of [-1, 1]) {
      parts.push(paint(tube([{ p: V(s * 0.04, 1.08, 0.26), r: 0.03 }, { p: V(s * 0.12, 1.1, 0.24), r: 0.032 }, { p: V(s * 0.18, 1.06, 0.2), r: 0.02 }], 6, true), (p, n, o) => o.set('#2a1a1a')));
      parts.push(paint(tube([{ p: V(0, 0.9, 0.29), r: 0.03 }, { p: V(s * 0.09, 0.9, 0.27), r: 0.03 }, { p: V(s * 0.17, 0.93, 0.21), r: 0.018 }, { p: V(s * 0.19, 0.99, 0.19), r: 0.01 }], 6, true), (p, n, o) => o.set('#2a1a1a')));
      parts.push(cone(0.025, 0.06, '#fff4d8', [s * 0.07, 0.83, 0.26], [Math.PI, 0, 0], 6));
    }
    parts.push(ell(0.05, 0.04, 0.04, '#e04a3a', [0, 0.95, 0.29]));
    // tall pleated toque; horns burst out through its sides
    const band = new THREE.CylinderGeometry(0.235, 0.25, 0.16, 20); band.translate(0, 1.2, 0); paint(band, (p, n, o) => o.set(WHITE).multiplyScalar(0.94 + 0.06 * Math.cos(Math.atan2(p.x, p.z) * 10)));
    const crown = new THREE.CylinderGeometry(0.27, 0.23, 0.3, 20, 3); crown.translate(0, 1.42, 0); paint(crown, (p, n, o) => o.set(WHITE).multiplyScalar(0.9 + 0.1 * Math.cos(Math.atan2(p.x, p.z) * 8)));
    parts.push(band, crown);
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; parts.push(ell(0.14, 0.12, 0.14, WHITE, [Math.sin(a) * 0.12, 1.6, Math.cos(a) * 0.12], [0, 0, 0], 12)); }
    parts.push(ell(0.16, 0.14, 0.16, WHITE, [0, 1.66, 0], [0, 0, 0], 14));
    for (const s of [-1, 1]) parts.push(cone(0.06, 0.2, '#fff4d8', [s * 0.24, 1.16, 0], [0, 0, -s * 1.0], 8));
    // stubby legs, arms; cleaver raised in the right paw, ladle in the left
    for (const s of [-1, 1]) { parts.push(ell(0.09, 0.1, 0.09, skin, [s * 0.15, 0.13, 0.02])); parts.push(ell(0.075, 0.15, 0.075, skin, [s * 0.38, 0.55, 0.05], [0, 0, s * 0.5])); }
    parts.push(ell(0.08, 0.08, 0.08, skin, [0.46, 0.44, 0.12]), ell(0.08, 0.08, 0.08, skin, [-0.46, 0.44, 0.12]));
    parts.push(paint(xf(new THREE.CylinderGeometry(0.03, 0.03, 0.26, 8), { p: [0.47, 0.56, 0.14], r: [0.3, 0, -0.15] }), (p, n, o) => o.set('#6a4a30')));
    const blade = paint(new RoundedBox(0.04, 0.42, 0.27, 2, 0.015), (p, n, o) => { o.set(STEEL); if (p.z > 0.085) o.set('#f6f9ff'); if (p.z < -0.11) o.set('#9aa2b0'); if (Math.hypot(p.y - 0.13, p.z + 0.05) < 0.032) o.set('#3a3a48'); });
    blade.rotateX(0.3); blade.translate(0.49, 0.9, 0.22); parts.push(blade);
    parts.push(paint(xf(new THREE.CylinderGeometry(0.018, 0.018, 0.7, 6), { p: [-0.5, 0.66, 0.18], r: [0.25, 0, 0.35] }), (p, n, o) => o.set('#b88a5a')));
    const bowl = new THREE.SphereGeometry(0.1, 12, 8, 0, TAU, Math.PI / 2, Math.PI / 2); bowl.translate(-0.62, 0.98, 0.27);
    parts.push(...shell(paint(bowl, (p, n, o) => o.set(STEEL)), 0.9, '#9aa0ac'));
    return finish(parts);
  },
  tamamo(v) { // Tamamo-no-Mae: white kitsune in an indigo kimono, fan of nine foxfire-tipped tails, fox mask + kanzashi, orbiting wisps
    const rig = buildHumanoid({ name: 'Tamamo', species: 'fox', fur: v.color || '#f8eee6', fur2: '#ffffff', earColor: '#fff8f2', earInner: '#c8a8ff', eye: '#ff3a6a', blush: '#ffb0d0', outfit: { top: 'kimono', topColor: '#3c2c78', topColor2: '#ffd24a', bottomColor: '#281a50', sash: '#ffcf3a' } });
    const P = rig.parts;
    if (P.tail) P.tail.visible = false;
    // --- one fluffy tail (puffs along an S-curve, white fading to a foxfire tip); nine instances fan out behind her
    const path = [[0, 0, 0, 0.05], [0, 0.1, -0.05, 0.08], [0, 0.22, -0.08, 0.105], [0, 0.36, -0.08, 0.12], [0, 0.5, -0.05, 0.115], [0, 0.62, 0.0, 0.095], [0, 0.71, 0.06, 0.07], [0, 0.77, 0.12, 0.04]];
    const tp = [], TIP = C('#9ad0ff'), LAV = C('#d8c8ff'), WH = C('#fffaf4');
    for (let i = 0; i < 15; i++) {
      const u = i / 14 * (path.length - 1), k = Math.min(path.length - 2, Math.floor(u)), f = u - k, A = path[k], B = path[k + 1];
      const x = A[0] + (B[0] - A[0]) * f, y = A[1] + (B[1] - A[1]) * f, z = A[2] + (B[2] - A[2]) * f, r = A[3] + (B[3] - A[3]) * f, t = i / 14;
      const g = new THREE.SphereGeometry(1, 12, 9); g.scale(r * 1.05, r * 1.25, r); g.translate(x + (i % 2 ? 0.012 : -0.012), y, z);
      tp.push(paint(g, (p, n, o) => { o.copy(WH); if (t > 0.55) o.lerp(LAV, clamp((t - 0.55) / 0.2)); if (t > 0.78) o.lerp(TIP, clamp((t - 0.78) / 0.18)); o.multiplyScalar(0.92 + 0.08 * clamp(n.y + 0.5)); }));
    }
    const tailGeo = merge(tp);
    const N = 9, tails = new THREE.InstancedMesh(tailGeo, rig.mat, N), tailsOl = new THREE.InstancedMesh(tailGeo, rig.outMat, N);
    tails.castShadow = true; tails.receiveShadow = true; tails.frustumCulled = tailsOl.frustumCulled = false;
    const fan = new THREE.Group(); fan.position.set(0, 0.06, -0.16); P.body.add(fan); fan.add(tails, tailsOl);
    // --- kanzashi hairpins with dangling sakura + a white fox mask worn on the side of the head
    const acc = [];
    for (const [a, l] of [[0.5, 0.3], [0.85, 0.26], [1.15, 0.22]]) acc.push(paint(xf(new THREE.CylinderGeometry(0.012, 0.012, l, 6), { p: [0.13, 0.27, -0.05], r: [0.2, 0, -a] }), (p, n, o) => o.set('#ffcf3a')));
    acc.push(ell(0.036, 0.036, 0.036, '#ff3a5a', [0.24, 0.35, -0.03], [0, 0, 0], 10));
    for (const [cx, cy, cz, k] of [[0.2, 0.31, 0.05, 1], [0.27, 0.27, -0.01, 0.8]]) for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; acc.push(ell(0.045 * k, 0.016 * k, 0.034 * k, '#ffbcd6', [cx + Math.cos(a) * 0.045 * k, cy, cz + Math.sin(a) * 0.045 * k], [0.3, -a, 0], 8)); acc.push(ell(0.016 * k, 0.016 * k, 0.016 * k, '#ffe070', [cx, cy + 0.01, cz], [0, 0, 0], 6)); }
    for (let i = 0; i < 4; i++) acc.push(ell(0.018, 0.018, 0.018, i === 3 ? '#ff8ab0' : '#ffcf3a', [0.29, 0.22 - i * 0.05, 0.06], [0, 0, 0], 6));
    const mk = []; // mask (built facing +z, then turned to the left side of the head)
    mk.push(ell(0.11, 0.13, 0.05, '#fffaf4', [0, 0, 0], [0, 0, 0], 16));
    mk.push(ell(0.05, 0.04, 0.05, '#fffaf4', [0, -0.04, 0.05], [0, 0, 0], 10), ell(0.014, 0.012, 0.012, '#2a1418', [0, -0.03, 0.1], [0, 0, 0], 6));
    for (const s of [-1, 1]) {
      mk.push(cone(0.04, 0.09, '#fffaf4', [s * 0.07, 0.13, -0.005], [0, 0, -s * 0.35], 6));
      mk.push(paint(tube([{ p: V(s * 0.03, 0.03, 0.05), r: 0.008 }, { p: V(s * 0.075, 0.045, 0.04), r: 0.006 }], 4, true), (p, n, o) => o.set('#2a1418')));
      mk.push(paint(tube([{ p: V(s * 0.04, 0.08, 0.04), r: 0.01 }, { p: V(s * 0.09, 0.02, 0.035), r: 0.008 }, { p: V(s * 0.08, -0.06, 0.03), r: 0.005 }], 4, true), (p, n, o) => o.set('#e8304a')));
    }
    const mask = merge(mk); mask.rotateY(-1.25); mask.rotateZ(0.35); mask.translate(-0.25, 0.14, 0.02);
    acc.push(mask);
    rig.add(P.head, merge(acc), 'regalia');
    // --- orbiting foxfire wisps (unlit, bloom picks them up)
    // hitodama-style foxfire: glowing head with a tapering comet tail that trails behind along the orbit (-x)
    const fl = new THREE.LatheGeometry([[0.001, -0.075], [0.05, -0.06], [0.07, -0.02], [0.066, 0.03], [0.05, 0.08], [0.034, 0.14], [0.02, 0.2], [0.008, 0.26], [0.001, 0.3]].map(([r, y]) => new THREE.Vector2(r, y)), 10);
    const fp = fl.attributes.position; for (let i = 0; i < fp.count; i++) { const y = fp.getY(i); fp.setX(i, fp.getX(i) + Math.max(0, y) * Math.max(0, y) * 1.4); } // tail curls upward (x becomes y below)
    fl.rotateZ(Math.PI / 2);
    const wg = paint(fl, (p, n, o) => { const k = clamp((-p.x + 0.06) / 0.34); o.setRGB(1.7 - k * 1.1, 1.9 - k * 1.0, 2.2 - k * 0.3); });
    const NW = 7, wisps = new THREE.InstancedMesh(wg, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: false }), NW);
    const wh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), glowBillboard('#3a6aff', 0.7), NW); // soft additive halo per wisp
    wisps.frustumCulled = wh.frustumCulled = false; wh.renderOrder = 9; rig.root.add(wisps, wh);
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = V(0, 0, 0), _s = V(1, 1, 1);
    let stream = 0;
    const animate = (dt, t, moving) => {
      stream += ((moving ? 1 : 0) - stream) * Math.min(1, dt * 3);
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1) - 0.5, a = u * 3.3 + Math.sin(t * 1.4 + i * 0.75) * 0.08;
        const rx = -0.5 - (0.5 - Math.abs(u)) * 0.5 - stream * 0.4 + Math.sin(t * 2.1 + i * 1.3) * 0.07;
        _q.setFromEuler(_e.set(rx, 0, a, 'ZXY'));
        _m.compose(_p.set(0, 0, -Math.abs(u) * 0.02 - 0.005 * i), _q, _s.setScalar(1 + 0.04 * Math.sin(t * 2.6 + i)));
        tails.setMatrixAt(i, _m); tailsOl.setMatrixAt(i, _m);
      }
      tails.instanceMatrix.needsUpdate = true; tailsOl.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < NW; i++) {
        const a = t * 1.1 + i / NW * TAU, rr = 0.8 + Math.sin(t * 0.9 + i * 2.1) * 0.08;
        _q.setFromEuler(_e.set(0, -a - Math.PI / 2, Math.sin(t * 3 + i) * 0.15, 'YXZ')); // head leads, tail trails along the orbit
        _m.compose(_p.set(Math.cos(a) * rr, 0.6 + Math.sin(t * 2.3 + i * 1.7) * 0.12 + (i % 2) * 0.2, Math.sin(a) * rr), _q, _s.setScalar(1 + 0.18 * Math.sin(t * 9 + i * 3)));
        wisps.setMatrixAt(i, _m); wh.setMatrixAt(i, _m);
      }
      wisps.instanceMatrix.needsUpdate = true; wh.instanceMatrix.needsUpdate = true;
    };
    animate(0, 0, false);
    return { root: rig.root, pivot: P.body, body: rig.meshes[0], mat: rig.mat, rig, animate, glow: '#9ac4ff' };
  },
  tanuki(v) {
    const rig = buildHumanoid({ name: 'Tanuki Bandit', species: 'tanuki', fur: '#8a6a58', fur2: '#e0cbb0', fur3: '#3a2c28', earColor: '#3a2c28', outfit: { top: 'gi', topColor: v.color || '#4a4a6a', bottomColor: '#2a2a3a', scarf: '#e8503a' } });
    return { root: rig.root, pivot: rig.parts.body, body: rig.meshes[0], mat: rig.mat, rig };
  },
  fox(v) {
    const rig = buildHumanoid({ name: 'Kitsune', species: 'fox', fur: v.color || '#fff4ea', fur2: '#ffffff', earColor: '#ff9ad0', earInner: '#ff5aa0', eye: '#ff3a6a', outfit: { top: 'kimono', topColor: '#e8364a', bottomColor: '#2a1a3a', sash: '#ffd24a' } });
    return { root: rig.root, pivot: rig.parts.body, body: rig.meshes[0], mat: rig.mat, rig };
  },
};

// ------------------------------------------------------------------ definitions
// life/dmg are multipliers on monsterStats(); speed m/s; attack: melee | ranged | charge | aoe | summon
export const MONSTERS = {
  mochi: { name: 'Mochi Slime', build: 'mochi', radius: 0.42, speed: 2.2, life: 1.0, dmg: 1.0, move: 'bounce', attack: { type: 'melee', range: 1.1, cd: 1.4, windup: 0.35 }, variants: [{ color: '#ffd6e4', topping: 'berry' }, { color: '#d8f0c0', topping: 'leaf' }, { color: '#fff8f4', topping: 'snow', element: 'frost', name: 'Snow Mochi' }] },
  dustbunny: { name: 'Dust Bunny', build: 'dustbunny', radius: 0.32, vr: 0.42, speed: 3.6, life: 0.55, dmg: 0.7, move: 'scurry', attack: { type: 'melee', range: 0.9, cd: 0.9, windup: 0.2 }, pack: 1.6, variants: [{ color: '#d0c8dc' }, { color: '#c4ccd8' }, { color: '#dccabc' }] },
  kinoko: { name: 'Kinoko', build: 'kinoko', scale: 0.8, radius: 0.34, speed: 1.6, life: 1.3, dmg: 0.9, move: 'waddle', element: 'stink', pack: 0.6, attack: { type: 'aoe', range: 2.0, radius: 1.8, cd: 4.6, windup: 0.9 }, variants: [{ color: '#ff5a5a' }, { color: '#8a6aff', name: 'Dream Kinoko' }, { color: '#ffae3a' }] },
  lantern: { name: 'Chochin Ghost', build: 'lantern', radius: 0.38, speed: 1.8, life: 0.9, dmg: 1.1, move: 'float', element: 'fire', attack: { type: 'ranged', range: 7, cd: 2.2, windup: 0.45, proj: 'fireball', speed: 7 }, variants: [{ color: '#ff8a4a' }, { color: '#ff6a8a' }] },
  kasa: { name: 'Kasa-obake', build: 'kasa', radius: 0.42, vr: 0.56, speed: 2.6, life: 1.1, dmg: 1.1, move: 'hop', attack: { type: 'charge', range: 5, cd: 2.6, windup: 0.5, dash: 9 }, variants: [{ color: '#8a5ad0' }, { color: '#e8503a' }, { color: '#3a8ad0' }] },
  wisp: { name: 'Kitsune-bi', build: 'wisp', radius: 0.3, speed: 2.8, life: 0.6, dmg: 1.0, move: 'float', element: 'zap', attack: { type: 'ranged', range: 8, cd: 1.6, windup: 0.3, proj: 'foxfire', speed: 9 }, variants: [{ color: '#7ab8ff' }, { color: '#b88aff' }] },
  oni: { name: 'Oni Imp', build: 'oni', radius: 0.45, vr: 0.5, speed: 2.4, life: 1.8, dmg: 1.5, move: 'waddle', attack: { type: 'melee', range: 1.3, cd: 1.8, windup: 0.55, heavy: true }, variants: [{ color: '#ff6a5a' }, { color: '#5a8aff', name: 'Blue Oni Imp' }] },
  tanuki: { name: 'Tanuki Bandit', build: 'tanuki', radius: 0.32, speed: 3.0, life: 1.0, dmg: 0.9, move: 'walk', attack: { type: 'ranged', range: 6.5, cd: 1.5, windup: 0.35, proj: 'acorn', speed: 10 }, variants: [{ color: '#4a4a6a' }, { color: '#6a3a3a' }] },
  // bosses
  mochiKing: { name: 'King Mochi the Squishy', build: 'mochi', boss: true, scale: 3.0, radius: 1.3, vr: 1.3, speed: 1.8, life: 1, dmg: 1.2, move: 'bounce', attack: { type: 'slam', range: 3.5, radius: 4.2, cd: 3.4, windup: 1.0 }, variants: [{ color: '#ffe8f0', king: true }], summon: 'mochi' },
  kasaLord: { name: 'Lord Karakasa', build: 'kasa', boss: true, scale: 2.6, radius: 1.1, vr: 1.7, speed: 2.2, life: 1, dmg: 1.3, move: 'hop', attack: { type: 'spin', range: 3, radius: 3.4, cd: 3.0, windup: 0.7 }, variants: [{ color: '#c8364a', lord: true }], summon: 'kasa' },
  oniChef: { name: 'Oni Chef Gorobei', build: 'oniChef', boss: true, scale: 2.4, radius: 1.1, vr: 1.25, speed: 2.0, life: 0.75, dmg: 1.4, move: 'waddle', element: 'fire', noKite: true, attack: { type: 'barrage', range: 9, cd: 3.0, windup: 0.8, proj: 'firepot', speed: 8, n: 5, nEnraged: 7, spread: 2.8, blast: 1.6, dmgMul: 0.6, rest: 1.3 }, variants: [{ color: '#ff5a4a' }], summon: 'lantern', summonN: [3, 3] },
  nineTails: { name: 'Tamamo, the Nine-Tailed', build: 'tamamo', boss: true, scale: 2.5, radius: 0.9, vr: 1.15, light: '#9ac4ff', speed: 1.9, life: 1, dmg: 1.5, move: 'walk', element: 'zap', pattern: 'kitsune', attack: { type: 'barrage', range: 10, cd: 2.4, windup: 0.8, proj: 'foxfire', speed: 9, homing: 0.8, n: 5, nEnraged: 7, dmgMul: 0.5 }, variants: [{ color: '#fff4ea' }], summon: 'wisp', summonN: [2, 3] },
};

// Procedural motion for monster models
export class MonsterAnim {
  constructor(model, def) { this.m = model; this.def = def; this.t = rand(0, 10); this.flash = 0; this.flashC = new THREE.Color('#ffffff'); this.flashAmp = 0.9; this.flashRate = 6; this.lastFlash = -9; this.lunge = 0; this.wind = 0; this.spin = 0; this.deathT = -1; this.rig = model.rig; }
  // hit flash. Small monsters pop white (0.9, ~170 ms); bosses / elites pass {amp, dur, gap}: a gentle tint that stays under
  // the bloom threshold, short, and rate-limited so a stream of hits flickers instead of holding the body lit.
  hit(c = '#ffffff', { amp = 0.9, dur = 1 / 6, gap = 0 } = {}) {
    if (gap && this.t - this.lastFlash < gap) return false;
    this.lastFlash = this.t; this.flash = 1; this.flashC.set(c); this.flashAmp = amp; this.flashRate = 1 / dur;
    return true;
  }
  update(dt, moving, speed) {
    this.t += dt; const t = this.t, p = this.m.pivot, s = this.def.scale || 1;
    let y = 0, sx = 1, sy = 1, rz = 0, rx = 0;
    const mv = moving ? 1 : 0;
    switch (this.def.move) {
      case 'bounce': { const ph = (t * (moving ? 3.2 : 1.4)) % 1; const hop = Math.sin(ph * Math.PI); y = hop * (moving ? 0.35 : 0.06); sy = 1 + (hop - 0.5) * (moving ? 0.25 : 0.08); sx = 1 / Math.sqrt(sy); break; }
      case 'scurry': y = Math.abs(Math.sin(t * 16)) * 0.08 * (0.3 + mv); rz = Math.sin(t * 30) * 0.06 * mv; break;
      case 'float': y = 0.25 + Math.sin(t * 2.2) * 0.12; rx = moving ? 0.18 : 0; rz = Math.sin(t * 1.3) * 0.08; break;
      case 'hop': { const ph = (t * (moving ? 2.8 : 1.2)) % 1; y = Math.sin(ph * Math.PI) * (moving ? 0.4 : 0.1); rz = Math.sin(t * 2) * 0.1; break; }
      case 'waddle': rz = Math.sin(t * 7) * 0.1 * mv; y = Math.abs(Math.sin(t * 7)) * 0.05 * mv; sy = 1 + Math.sin(t * 2) * 0.02; break;
      default: break;
    }
    // attack windup: squash & tremble; lunge: stretch forward
    if (this.wind > 0) { sy *= 1 - this.wind * 0.18; sx *= 1 + this.wind * 0.12; rz += Math.sin(t * 60) * 0.05 * this.wind; }
    if (this.lunge > 0) { this.lunge = Math.max(0, this.lunge - dt * 4); rx += 0.4 * this.lunge; sy *= 1 + 0.1 * this.lunge; }
    if (this.spin > 0) { p.rotation.y += dt * 18; }
    if (this.deathT >= 0) { this.deathT += dt; const k = clamp(this.deathT / 0.45); sy *= 1 - k; sx *= 1 + k * 0.6; y += k * 0.2; }
    this.m.animate?.(dt, t, moving, this); // extra parts (Tamamo's tails & foxfire)
    if (this.rig) { // humanoid monsters use the kit animator externally
      this.m.root.scale.setScalar(s);
    } else {
      p.position.y = y; p.scale.set(sx * s, sy * s, sx * s); p.rotation.z = rz; p.rotation.x = rx;
    }
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * this.flashRate);
    this.m.mat.emissive.copy(this.flashC).multiplyScalar(this.flash * this.flashAmp);
  }
}

export function buildMonster(id, variantIdx = 0) {
  const def = MONSTERS[id];
  const v = (def.variants || [{}])[variantIdx % (def.variants?.length || 1)];
  const model = BUILD[def.build](v);
  model.variant = v;
  return model;
}
