// Fishing models (docs/HOMESTEAD.md §3): the two rods (grip at the origin, rod along +z, tip at ROD_TIP), the float,
// and a chunky toy fish per species for the catch (head +z, ~0.5 m long at scale 1). Built once, cached.
import * as THREE from 'three';
import { Builder, G, C, PI, col, shade } from '../world/buildings/kit.js';
import { tube, merge, paint } from '../gfx/geom.js';
import { clamp, TAU } from '../core/util.js';

export const ROD_TIP = new THREE.Vector3(0, 0, 1.08);
const CACHE = new Map();
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
function build(key, fn, warp = 0.015) {
  let g = CACHE.get(key); if (g) return g;
  const B = new Builder(hashStr(key)); B.warpAmt = warp; B.jitter = 0.01;
  fn(B);
  const t = B.finish();
  g = merge([t.geos.body, t.geos.leaf].filter(Boolean));
  CACHE.set(key, g);
  return g;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** rod 1: a bamboo rod with a cork grip and a red reel; rod 2: the Moonlit Rod, navy lacquer, gold fittings, a moon charm */
export function rodGeo(tier = 1) {
  return build('rod' + tier, B => {
    const moon = tier >= 2, L = 1.12;
    const sh = G.cyl(0.009, 0.019, L, 7); sh.rotateX(PI / 2); sh.translate(0, 0, L / 2 - 0.04);
    B.add(sh, (p, n, o) => { if (moon) o.set('#2f3a72').lerp(col('#5a6ab8'), clamp(n.y * 0.5 + 0.3)); else { o.set('#d8b868').multiplyScalar(0.92 + 0.12 * clamp(n.y + 0.4)); if (Math.abs(((p.z + 0.04) % 0.27) - 0.02) < 0.012) o.set('#a88a40'); } });
    const grip = G.cyl(0.027, 0.027, 0.2, 9); grip.rotateX(PI / 2); grip.translate(0, 0, -0.02); B.add(grip, moon ? '#3a2a4a' : '#c8865a');
    const butt = G.sph(0.03, 8, 6); butt.translate(0, 0, -0.13); B.add(butt, moon ? '#ffd24a' : '#8a5a3a');
    for (const z of [0.3, 0.55, 0.8, 1.02]) { const r = G.torus(0.016, 0.004, 4, 8); r.translate(0, -0.016, z); B.add(r, moon ? '#ffd24a' : '#c8c0b8'); }
    const reel = G.cyl(0.042, 0.042, 0.035, 12); reel.rotateZ(PI / 2); reel.translate(0, -0.05, 0.1); B.add(reel, moon ? '#ffd24a' : '#e8503a');
    const knob = G.sph(0.012, 6, 4); knob.translate(0.03, -0.075, 0.1); B.add(knob, '#fff6e8');
    const hub = G.cyl(0.018, 0.018, 0.04, 8); hub.rotateZ(PI / 2); hub.translate(0, -0.05, 0.1); B.add(hub, moon ? '#fff3c0' : '#fff6e8');
    if (moon) { // a little crescent charm on a cord near the grip
      const cord = tube([{ p: V(0, -0.02, 0.18), r: 0.004 }, { p: V(0.005, -0.09, 0.2), r: 0.004 }], 3, false); B.add(cord, '#ff8fb0');
      const m = G.torus(0.025, 0.011, 5, 12, PI * 1.3); m.rotateY(PI / 2); m.rotateX(0.4); m.translate(0.005, -0.115, 0.2); B.add(m, '#ffe070');
    }
  }, 0.004);
}
/** the float: a red-capped, white-bellied ball with a little antenna */
export function bobberGeo() {
  let g = CACHE.get('bobber'); if (g) return g;
  const b = new THREE.SphereGeometry(0.065, 12, 9); b.scale(1, 1.08, 1);
  paint(b, (p, n, o) => o.set(p.y > 0.008 ? '#ff4a52' : '#fffaf2').multiplyScalar(Math.abs(p.y - 0.008) < 0.008 ? 0.75 : 1));
  const a = new THREE.CylinderGeometry(0.008, 0.008, 0.09, 5); a.translate(0, 0.1, 0); paint(a, (p, n, o) => o.set('#fff6e0'));
  const t = new THREE.SphereGeometry(0.016, 6, 4); t.translate(0, 0.15, 0); paint(t, (p, n, o) => o.set('#ffe070'));
  g = merge([b, a, t]); CACHE.set('bobber', g); return g;
}

/** an ice-fishing hole (the onsen region's frozen pond): dark water ringed by a jagged, snowy rim and a few chipped
 *  ice chunks. Origin at the ice surface. */
export function iceHoleGeo() {
  let g = CACHE.get('iceHole'); if (g) return g;
  const parts = [], R = 0.36;
  const w = new THREE.CircleGeometry(R, 20); w.rotateX(-PI / 2); w.translate(0, 0.004, 0);
  paint(w, (p, n, o) => o.set('#14385e').lerp(col('#2a6a9a'), clamp(1 - Math.hypot(p.x, p.z) / R) * 0.55));
  parts.push(w);
  const rim = new THREE.RingGeometry(R - 0.02, R + 0.13, 20, 1); rim.rotateX(-PI / 2);
  const rp = rim.attributes.position;
  for (let i = 0; i < rp.count; i++) { const x = rp.getX(i), z = rp.getZ(i), r = Math.hypot(x, z), a = Math.atan2(z, x); if (r > R + 0.05) { const k = 1 + 0.12 * Math.sin(a * 7 + 1.3) + 0.06 * Math.sin(a * 13); rp.setXYZ(i, x * k, 0.03, z * k); } else rp.setY(i, 0.018); }
  rim.computeVertexNormals();
  paint(rim, (p, n, o) => o.set(Math.hypot(p.x, p.z) > R + 0.06 ? '#f6fbff' : '#bfe0f4'));
  parts.push(rim);
  for (let i = 0; i < 5; i++) {
    const a = i * 1.37 + 0.4, r = R + 0.22 + (i % 2) * 0.1, c = new THREE.BoxGeometry(0.1 + (i % 3) * 0.03, 0.05, 0.08);
    c.rotateY(a * 2.1); c.rotateZ(0.2 * (i % 2 ? 1 : -1)); c.translate(Math.cos(a) * r, 0.025, Math.sin(a) * r);
    paint(c, (p, n, o) => o.set(n.y > 0.5 ? '#ffffff' : '#cfe8f8'));
    parts.push(c);
  }
  g = merge(parts); CACHE.set('iceHole', g); return g;
}

// ------------------------------------------------------------------ the fish
// [back, body, belly, fin, length, height, pattern, patternColour]
const LOOK = {
  crucian: ['#8a6a30', '#d0a858', '#f6e4a8', '#b88a40', 0.42, 0.22, 'none'],
  koi: ['#fff4ec', '#fff8f2', '#ffffff', '#ffe2d8', 0.5, 0.18, 'koi', '#ff5a3a'],
  goldKoi: ['#f4ac2a', '#ffd84a', '#fff4b8', '#ffe680', 0.5, 0.18, 'scales', '#fff6c0'],
  moonKoi: ['#dfe8ff', '#f6f9ff', '#ffffff', '#eef2ff', 0.52, 0.19, 'koi', '#a8c4ff'],
  ayu: ['#7a8a50', '#cfd09a', '#f6f6ea', '#e8e2a8', 0.5, 0.13, 'spot', '#ffd84a'],
  trout: ['#6a7a5a', '#cfcfb6', '#fff8f0', '#c8c0a0', 0.48, 0.15, 'parr', '#5a6870'],
  char: ['#48585a', '#8a9a8c', '#f4c890', '#f0a870', 0.48, 0.15, 'dots', '#f6f2e0'],
  seaBream: ['#e05568', '#ff8a9a', '#ffe2e6', '#ff9aaa', 0.44, 0.24, 'dots', '#8ad0ff'],
  mackerel: ['#2a6a8a', '#9ccad8', '#f6fafa', '#8ab8c8', 0.5, 0.13, 'waves', '#1a3a5a'],
  salmon: ['#6a7a9a', '#dccad2', '#ffd8d0', '#c8b0b8', 0.52, 0.17, 'blush', '#ff9a8a'],
  loach: ['#7a6040', '#bca474', '#efe0bc', '#a88a5a', 0.5, 0.09, 'dots', '#5a4428'],
  rainbowTrout: ['#7a8a7a', '#dbe2ea', '#ffffff', '#c8d0c8', 0.5, 0.15, 'rainbow', '#ff8aa8'],
};
function fishBody(B, id) {
  const [back, body, belly, fin, L, H, pat, pc] = LOOK[id];
  const W = H * 0.55, g = new THREE.SphereGeometry(0.5, 20, 12), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { // a teardrop: blunt round head at +z, tapering to the tail stalk at -z
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), u = z + 0.5; // 0 tail .. 1 head
    const k = Math.pow(Math.sin(clamp(u * 0.92 + 0.08) * PI * 0.5 + 0.12 * Math.sin(u * PI)), 0.8) * (u < 0.15 ? 0.5 + u * 3.3 : 1);
    p.setXYZ(i, x * W * 2 * k, y * H * 2 * k, z * L);
  }
  g.computeVertexNormals();
  const cb = col(back), cm = col(body), cl = col(belly), cp = pc ? col(pc) : null;
  B.add(g, (q, n, o) => {
    const v = clamp(q.y / H + 0.5); // 0 belly .. 1 back
    o.copy(cl).lerp(cm, clamp(v * 2)).lerp(cb, clamp(v * 2 - 1));
    const s = Math.sin, a = q.z / L;
    if (pat === 'koi' && s(q.z * 22 + 1.3) + s(q.x * 30 + q.y * 14) > 0.55 && v > 0.35) o.copy(cp);
    else if (pat === 'scales' && Math.abs(s(q.z * 70 + (s(q.y * 60) > 0 ? 1.5 : 0))) > 0.93) o.copy(cp);
    else if (pat === 'spot' && Math.hypot(a - 0.22, q.y / H) < 0.1) o.copy(cp);
    else if (pat === 'parr' && Math.abs(s(a * 22)) > 0.82 && Math.abs(q.y / H) < 0.18) o.lerp(cp, 0.55);
    else if (pat === 'dots' && s(q.z * 90) * s(q.y * 90) * s(q.x * 70) > 0.45 && v > 0.3) o.copy(cp);
    else if (pat === 'waves' && v > 0.62 && Math.abs(s(q.z * 40 + s(q.y * 50) * 1.2)) < 0.3) o.copy(cp);
    else if (pat === 'blush' && Math.abs(q.y / H) < 0.16) o.lerp(cp, 0.45);
    else if (pat === 'rainbow' && Math.abs(q.y / H + 0.02) < 0.1) o.lerp(cp, 0.7);
  });
  // tail fin (a forked vertical fan), dorsal fin, a pair of pectorals
  const tf = new THREE.Shape(); tf.moveTo(0, 0); tf.quadraticCurveTo(-0.08, 0.1, -0.16, 0.13); tf.quadraticCurveTo(-0.11, 0, -0.16, -0.13); tf.quadraticCurveTo(-0.08, -0.1, 0, 0);
  const tg = new THREE.ExtrudeGeometry(tf, { depth: 0.02, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 1, curveSegments: 6 });
  tg.translate(0, 0, -0.01); tg.rotateY(PI / 2); tg.scale(1, H / 0.2, L / 0.5); tg.translate(0, 0, -L / 2 + 0.03); B.add(tg, fin);
  const df = new THREE.Shape(); df.moveTo(-0.1, 0); df.quadraticCurveTo(-0.02, 0.09, 0.08, 0.02); df.lineTo(0.08, 0); df.lineTo(-0.1, 0);
  const dg = new THREE.ExtrudeGeometry(df, { depth: 0.012, bevelEnabled: false, curveSegments: 5 }); dg.translate(0, 0, -0.006); dg.rotateY(PI / 2); dg.scale(1, H / 0.2, L / 0.5); dg.translate(0, H * 0.82, -0.02); B.add(dg, fin);
  for (const s of [-1, 1]) { const pf = G.sph(0.05, 7, 5); pf.scale(0.3, 0.6, 1); pf.rotateY(s * 0.6); pf.translate(s * W * 0.9, -H * 0.15, L * 0.18); B.add(pf, fin); }
  // big friendly eyes and a little mouth
  for (const s of [-1, 1]) {
    const e = G.sph(H * 0.17, 10, 8); e.translate(s * W * 0.82, H * 0.12, L * 0.33); B.add(e, '#ffffff');
    const pu = G.sph(H * 0.1, 8, 6); pu.translate(s * (W * 0.82 + H * 0.09), H * 0.13, L * 0.34); B.add(pu, '#2a1a20');
    const gl = G.sph(H * 0.035, 5, 4); gl.translate(s * (W * 0.82 + H * 0.17), H * 0.18, L * 0.355); B.add(gl, '#ffffff');
  }
  const mo = G.torus(H * 0.08, H * 0.022, 3, 8, PI); mo.rotateX(PI / 2); mo.rotateZ(PI); mo.translate(0, -H * 0.08, L * 0.49); B.add(mo, '#6a2a30');
}
function octopus(B) {
  const head = G.sph(0.17, 16, 12); head.scale(1, 1.15, 1); head.translate(0, 0.17, 0);
  B.add(head, (p, n, o) => o.set('#ff7a6a').lerp(col('#ffb0a0'), clamp(n.y * 0.4)).multiplyScalar(Math.sin(p.x * 60) * Math.sin(p.z * 60) > 0.6 ? 0.88 : 1));
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * TAU, pts = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8, r = 0.1 + t * 0.2, c = Math.sin(t * PI) * 0.06; pts.push({ p: V(Math.cos(a) * r + Math.cos(a + 1.6) * c * t * 2, 0.06 - t * 0.04 + Math.sin(t * PI * 1.5) * 0.04, Math.sin(a) * r + Math.sin(a + 1.6) * c * t * 2), r: 0.045 * (1 - t * 0.75) }); }
    B.add(tube(pts, 6, true), (p, n, o) => o.set(n.y < -0.3 ? '#ffd8c8' : '#ff7a6a'));
  }
  for (const s of [-1, 1]) { const e = G.sph(0.045, 8, 6); e.translate(s * 0.07, 0.22, 0.14); B.add(e, '#ffffff'); const pu = G.sph(0.026, 6, 5); pu.translate(s * 0.075, 0.22, 0.175); B.add(pu, '#2a1a20'); }
}
function pufferfish(B) {
  const b = G.sph(0.17, 16, 12); b.translate(0, 0, 0);
  B.add(b, (p, n, o) => o.set('#fff8e8').lerp(col('#f2c84a'), clamp(p.y / 0.12 + 0.3)).multiplyScalar(Math.sin(p.x * 50) * Math.sin(p.z * 50) > 0.7 && p.y > 0 ? 0.8 : 1));
  for (let i = 0; i < 26; i++) { const u = i / 26 * 2 - 1, th = i * 2.4, r = Math.sqrt(1 - u * u), d = V(r * Math.cos(th), u, r * Math.sin(th)); const s = G.cone(0.022, 0.07, 5); s.translate(0, 0.17, 0); s.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize())); B.add(s, '#fff6d0'); }
  const tf = G.cone(0.07, 0.1, 6); tf.rotateX(-PI / 2); tf.scale(0.3, 1, 1); tf.translate(0, 0, -0.2); B.add(tf, '#f0d070');
  for (const s of [-1, 1]) { const e = G.sph(0.045, 8, 6); e.translate(s * 0.08, 0.05, 0.13); B.add(e, '#ffffff'); const pu = G.sph(0.026, 6, 5); pu.translate(s * 0.085, 0.05, 0.165); B.add(pu, '#2a1a20'); }
  const m = G.sph(0.03, 8, 6); m.scale(1, 0.7, 0.6); m.translate(0, -0.03, 0.17); B.add(m, '#ff9aa0');
}
function flounder(B) {
  const ry = 0.035, top = (x, z) => 0.035 + ry * Math.sqrt(Math.max(0, 1 - (x / 0.17) ** 2 - (z / 0.24) ** 2));
  const g = G.sph(0.5, 20, 10); g.scale(0.34, 0.07, 0.48); g.translate(0, 0.035, 0);
  B.add(g, (p, n, o) => o.set(n.y > 0 ? '#c09a6a' : '#fff8ee').lerp(col('#e2c79c'), n.y > 0 ? clamp(1 - Math.hypot(p.x / 0.17, p.z / 0.24)) * 0.45 : 0));
  // a thin frilly fin all the way round, a fan tail, freckles on top
  const fr = G.torus(0.19, 0.02, 4, 28); fr.rotateX(PI / 2); fr.scale(0.92, 1, 1.24); fr.translate(0, 0.032, -0.01);
  B.add(fr, (p, n, o) => o.set('#e8cc9c').multiplyScalar(Math.sin(Math.atan2(p.z, p.x) * 26) > 0 ? 1 : 0.88));
  const tf = G.cone(0.1, 0.13, 8); tf.rotateX(PI / 2); tf.scale(1, 0.22, 1); tf.translate(0, 0.035, -0.3);
  B.add(tf, (p, n, o) => o.set('#d6b07a').multiplyScalar(Math.sin(Math.atan2(p.y, p.x) * 9 + p.x * 40) > 0.3 ? 0.86 : 1));
  for (const [x, z, r] of [[-0.07, -0.08, 0.026], [0.06, -0.12, 0.02], [-0.03, 0.03, 0.018], [0.09, -0.01, 0.016], [-0.1, 0.06, 0.014], [0.01, -0.17, 0.016]]) {
    const d = G.sph(r, 8, 5); d.scale(1, 0.3, 1.2); d.translate(x, top(x, z) - 0.002, z); B.add(d, '#9a7650');
  }
  for (const s of [0, 1]) { const x = 0.04 + s * 0.05, z = 0.1 + s * 0.03; const e = G.sph(0.03, 8, 6); e.translate(x, top(x, z) + 0.012, z); B.add(e, '#ffffff'); const pu = G.sph(0.017, 6, 5); pu.translate(x, top(x, z) + 0.032, z + 0.006); B.add(pu, '#2a1a20'); }
  const mo = G.torus(0.022, 0.006, 3, 8, PI); mo.rotateX(PI / 2); mo.rotateZ(PI); mo.translate(0.03, 0.04, 0.235); B.add(mo, '#6a3a30');
}
/** The catch model for a species (head toward +z). */
export function fishGeo(id) {
  return build('fish:' + id, B => {
    if (id === 'octopus') return octopus(B);
    if (id === 'pufferfish') return pufferfish(B);
    if (id === 'flounder') return flounder(B);
    fishBody(B, LOOK[id] ? id : 'crucian');
  });
}
