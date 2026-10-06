// Frost effects for the Yukimi Onsen fight set (docs/REGIONS.md §2): the three onsen monsters (../monsters/onsen.js) and
// Yuki-onna (./yukionna.js). One FrostFx per VFX instance (a VFX extension: it updates with the world, clears with
// vfx.clear() and prewarms behind the region's iris when an onsen monster asked for it):
//   particles     a frost atlas (snowflakes, ice shards, snow chunks, puffs, glints, mirror shards…) on a normal-blend and an
//                 additive layer, spawned through one scratch record (no garbage per spawn)
//   tele(o)       pooled, terrain-draped ground warnings (circle / lane / cone) in the house look, with hold / fire / kill
//   pools         snowballs, icicles, ice darts, ice sheets, ice mirrors (geometry + materials shared per world)
//   run(fn, end)  frame tasks that die with the world
//   whiteoutMesh  Yuki-onna's phase-2 screen overlay: a snow haze with clear ellipses round Chewy and the lanterns
// Everything lives in the region scene and is freed with it (disposeScene); only the CPU-side atlas canvas stays module-level.
import * as THREE from 'three';
import { registerVfxExtension } from '../../gfx/vfx.js';
import { ParticleLayer } from '../../gfx/particles.js';
import { makeToon, makeOutline } from '../../gfx/materials.js';
import { paint, merge, mergeVertices } from '../../gfx/geom.js';
import { ell, EDGE_OUT, INK } from '../../dungeon/monsters.js';
import { iceTexture } from './kitB.js';
import { lookIn } from '../../dungeon/horde.js';
import { teleBatchFor } from '../../gfx/teleBatch.js';
import { TAU, clamp, rand, ease } from '../../core/util.js';

export const C = h => new THREE.Color(h);
/** atlas frames */
export const FR = { FLAKE: 0, BLOSSOM: 1, SHARD: 2, CHUNK: 3, PUFF: 4, STAR: 5, STREAK: 6, DOT: 7, RING: 8, GLINT: 9, CRYSTAL: 10, MIRROR: 11, SWIRL: 12, BALL: 13, DIZZY: 14, WISP: 15 };
/** shared palette (THREE.Color: particle spawns never parse strings) */
export const ICE = {
  white: C('#ffffff'), snow: C('#f4f9ff'), pale: C('#e2f4ff'), ice: C('#b4e6ff'), cyan: C('#7ad8ff'), blue: C('#5a9cff'),
  deep: C('#3a64d0'), lilac: C('#cbbcff'), violet: C('#9a86ff'), warm: C('#ffd49a'), ember: C('#ffb060'), glow: C('#c4f2ff'),
  shade: C('#c6dcf2'), gold: C('#ffe27a'), mist: C('#dcecfa'),
};

// ------------------------------------------------------------------ atlas (4x4 cells of 128 px, drawn once per session)
let ATLAS = null;
function atlasTex() {
  if (ATLAS) return ATLAS;
  const N = 4, S = 128, c = document.createElement('canvas'); c.width = c.height = N * S;
  const g = c.getContext('2d'); g.lineJoin = 'round'; g.lineCap = 'round';
  const cell = (i, fn) => { g.save(); g.translate((i % N) * S + S / 2, Math.floor(i / N) * S + S / 2); fn(); g.restore(); };
  const INKC = 'rgba(46,70,130,0.8)', INKS = 'rgba(46,70,130,0.55)';
  const poly = pts => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
  cell(FR.FLAKE, () => { // six-armed snowflake: white arms over an ink-blue underlay (reads on snow and on sky alike)
    const arms = (w, col) => { g.strokeStyle = col; g.lineWidth = w; for (let i = 0; i < 6; i++) { g.save(); g.rotate(i * TAU / 6); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -50); for (const [y, l] of [[-22, 14], [-37, 10]]) { g.moveTo(0, y); g.lineTo(-l, y - l); g.moveTo(0, y); g.lineTo(l, y - l); } g.stroke(); g.restore(); } };
    arms(15, INKC); arms(8, '#ffffff');
    g.fillStyle = INKC; g.beginPath(); g.arc(0, 0, 14, 0, TAU); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, 0, 10, 0, TAU); g.fill();
  });
  cell(FR.BLOSSOM, () => { // plump six-lobed flake (cute, chunky)
    for (const [r, col] of [[20, INKC], [15.5, '#ffffff']]) { g.fillStyle = col; for (let i = 0; i < 6; i++) { const a = i * TAU / 6; g.beginPath(); g.arc(Math.cos(a) * 26, Math.sin(a) * 26, r, 0, TAU); g.fill(); } g.beginPath(); g.arc(0, 0, r + 8, 0, TAU); g.fill(); }
    g.fillStyle = 'rgba(150,200,255,0.9)'; g.beginPath(); g.arc(0, 0, 9, 0, TAU); g.fill();
  });
  cell(FR.SHARD, () => { // ice shard (long diamond), pale gradient, white edge glint
    poly([[0, -58], [17, -8], [4, 56], [-15, -2]]);
    const gr = g.createLinearGradient(-15, -58, 17, 56); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#d4f0ff'); gr.addColorStop(1, '#9ad6ff');
    g.fillStyle = gr; g.fill(); g.strokeStyle = INKC; g.lineWidth = 5; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 4; g.beginPath(); g.moveTo(-2, -44); g.lineTo(-9, -4); g.stroke();
  });
  cell(FR.CHUNK, () => { // lumpy snow clump with a cool shadow side
    const pts = []; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, r = 36 + Math.sin(i * 2.7) * 7 + (i % 3) * 3; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    poly(pts); g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = INKC; g.lineWidth = 6; g.stroke();
    g.save(); poly(pts); g.clip(); g.fillStyle = 'rgba(170,200,235,0.7)'; g.beginPath(); g.arc(18, 22, 34, 0, TAU); g.fill(); g.restore();
    g.fillStyle = 'rgba(255,255,255,1)'; g.beginPath(); g.arc(-12, -14, 9, 0, TAU); g.fill();
  });
  cell(FR.PUFF, () => { // soft cloud puff (snow dust / breath / mist)
    for (const [x, y, r] of [[-16, 8, 30], [14, 6, 32], [0, -14, 34], [-26, -8, 22], [28, -6, 22]]) {
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
  });
  cell(FR.STAR, () => { // four-point sparkle
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 22); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = '#ffffff'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? 8 : 58; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill();
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 22, 0, TAU); g.fill();
  });
  cell(FR.STREAK, () => { // tapered wind line (horizontal): velocity-aligned blizzard streaks
    const gr = g.createLinearGradient(-60, 0, 60, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.85, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(-60, 0); g.quadraticCurveTo(20, -8, 60, 0); g.quadraticCurveTo(20, 8, -60, 0); g.fill();
  });
  cell(FR.DOT, () => { const gr = g.createRadialGradient(0, 0, 0, 0, 0, 60); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 60, 0, TAU); g.fill(); });
  cell(FR.RING, () => { g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.beginPath(); g.arc(0, 0, 50, 0, TAU); g.stroke(); });
  cell(FR.GLINT, () => { // long thin cross glint (ice sparkle)
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 18); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = '#ffffff';
    poly([[0, -60], [4, 0], [0, 60], [-4, 0]]); g.fill(); poly([[-60, 0], [0, 4], [60, 0], [0, -4]]); g.fill();
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 18, 0, TAU); g.fill();
  });
  cell(FR.CRYSTAL, () => { // faceted hexagonal crystal
    const pts = []; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + Math.PI / 6; pts.push([Math.cos(a) * 44, Math.sin(a) * 50]); }
    poly(pts); const gr = g.createLinearGradient(-40, -50, 40, 50); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#a8dcff');
    g.fillStyle = gr; g.fill(); g.strokeStyle = INKC; g.lineWidth = 6; g.stroke();
    g.strokeStyle = 'rgba(120,170,230,0.6)'; g.lineWidth = 3; g.beginPath(); for (const [x, y] of pts) { g.moveTo(0, 0); g.lineTo(x, y); } g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.95)'; poly([[0, 0], [pts[3][0], pts[3][1]], [pts[4][0], pts[4][1]]]); g.fill();
  });
  cell(FR.MIRROR, () => { // a triangular mirror shard with a glint
    poly([[-38, -44], [44, -30], [-10, 52]]);
    const gr = g.createLinearGradient(-38, -44, 30, 40); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, '#cfe8ff'); gr.addColorStop(0.55, '#ffffff'); gr.addColorStop(1, '#b4c8ff');
    g.fillStyle = gr; g.fill(); g.strokeStyle = INKC; g.lineWidth = 5; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 4; g.beginPath(); g.moveTo(-20, -30); g.lineTo(18, -20); g.stroke();
  });
  cell(FR.SWIRL, () => { // curling wind stroke
    for (let i = 0; i < 40; i++) { const t = i / 39, a = t * 4.2, r = 50 - t * 34; g.fillStyle = `rgba(255,255,255,${0.25 + 0.75 * Math.sin(t * Math.PI)})`; g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r * 0.8, 2 + 7 * Math.sin(t * Math.PI), 0, TAU); g.fill(); }
  });
  cell(FR.BALL, () => { // little snowball
    g.fillStyle = INKC; g.beginPath(); g.arc(0, 0, 44, 0, TAU); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, 0, 39, 0, TAU); g.fill();
    g.save(); g.beginPath(); g.arc(0, 0, 39, 0, TAU); g.clip(); g.fillStyle = 'rgba(160,195,235,0.75)'; g.beginPath(); g.arc(16, 20, 38, 0, TAU); g.fill(); g.restore();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(-14, -14, 10, 0, TAU); g.fill();
  });
  cell(FR.DIZZY, () => { // chunky five-point star with an ink edge (dizzy stars)
    g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 22 : 50; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath();
    g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = 'rgba(70,50,40,0.9)'; g.lineWidth = 7; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(-10, -12, 7, 0, TAU); g.fill();
  });
  cell(FR.WISP, () => { // a soft curl of frosty breath
    for (let i = 0; i < 26; i++) { const t = i / 25, a = -0.6 + t * 3.4, r = 12 + t * 34, x = Math.cos(a) * r * 0.9 - 8, y = Math.sin(a) * r * 0.55; const gr = g.createRadialGradient(x, y, 0, x, y, 20 - t * 8); gr.addColorStop(0, `rgba(255,255,255,${0.55 * (1 - t * 0.6)})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, 20 - t * 8, 0, TAU); g.fill(); }
  });
  void INKS;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (ATLAS = t);
}

// camera basis for velocity-aligned sprites (refreshed once per frame by FrostFx.update)
const CR = new THREE.Vector3(1, 0, 0), CU = new THREE.Vector3(0, 1, 0), CF = new THREE.Vector3();
/** particle fn: turn the quad along its screen-space velocity (blizzard streaks, flying shards) */
export function alignFn(q) { const sx = q.vx * CR.x + q.vy * CR.y + q.vz * CR.z, sy = q.vx * CU.x + q.vy * CU.y + q.vz * CU.z; q.rot = Math.atan2(sy, sx); }
/** particle fn: orbit a moving centre (q.cen {x, z}, q.ang, q.rad, q.w, q.rin, q.climb) */
export function orbitFn(q, dt) { q.ang += q.w * dt; q.rad = Math.max(0.05, q.rad + (q.rin || 0) * dt); q.y += (q.climb || 0) * dt; q.x = q.cen.x + Math.cos(q.ang) * q.rad; q.z = q.cen.z + Math.sin(q.ang) * q.rad; }
/** screen angle of a world direction (for streaks spawned with a fixed rot) */
export function screenAngle(dx, dy, dz) { return Math.atan2(dx * CU.x + dy * CU.y + dz * CU.z, dx * CR.x + dy * CR.y + dz * CR.z); }

// ------------------------------------------------------------------ draped telegraphs (the vfx.telegraph look)
const TELE_VS = /* glsl */`varying vec2 vM; void main() { vM = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const TELE_FS = /* glsl */`uniform float uK, uT, uShape, uR, uLen, uArc, uA, uFire; uniform vec3 uC; varying vec2 vM;
  void main() {
    float e, fd, fm;
    if (uShape < 0.5) { float d = length(vM); e = uR - d; fd = d; fm = uR; }
    else if (uShape < 1.5) { float y = clamp(vM.y, uR, max(uR, uLen - uR)); e = uR - length(vec2(vM.x, vM.y - y)); fd = vM.y; fm = uLen; }
    else { float d = length(vM), a = abs(atan(vM.x, vM.y)); e = min(uR - d, d * sin(clamp(uArc - a, -1.5, 1.5))); fd = d; fm = uR; }
    if (e < 0.0) discard;
    float aa = max(fwidth(e) * 1.3, 0.004), inside = step(fd, uK * fm);
    float ink = 1.0 - smoothstep(0.075, 0.075 + aa, e);
    float rim = smoothstep(0.075, 0.075 + aa, e) * (1.0 - smoothstep(0.14, 0.14 + aa, e));
    float lead = smoothstep(uK * fm - 0.3, uK * fm, fd) * inside;
    float hatch = smoothstep(0.42, 0.5, abs(fract((vM.x - vM.y) * 1.6 + uT * 1.4) - 0.5) * 2.0 - 0.1);
    float urg = 0.72 + 0.28 * sin(uT * (9.0 + 22.0 * uK));
    vec3 hot = mix(uC, vec3(1.0), 0.36), ink3 = vec3(0.1, 0.06, 0.16);
    vec3 c = ink3; float al = 0.3;   // (a touch stronger than vfx.telegraph: these sit on pale snow and ice)
    c = mix(c, uC, inside * (0.66 + 0.3 * hatch)); al = mix(al, 0.5 + 0.2 * hatch, inside);
    c = mix(c, hot, lead); al = max(al, lead * 0.82);
    c = mix(c, ink3, ink); al = max(al, ink * 0.75);
    c = mix(c, hot, rim); al = max(al, rim * (0.7 + 0.3 * urg));
    c = mix(c, vec3(1.0, 0.99, 0.96), uFire * 0.8); al = max(al, uFire * 0.62);
    gl_FragColor = vec4(c, al * smoothstep(0.0, aa, e) * uA);
  }`;
const TELE_RES = { circle: [22, 22], lane: [3, 30], cone: [14, 18] };
function teleMesh(shape) {
  const [nx, ny] = TELE_RES[shape], n = (nx + 1) * (ny + 1), idx = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + nx + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2).setUsage(THREE.DynamicDrawUsage));
  g.setIndex(idx);
  const U = { uK: { value: 0 }, uT: { value: 0 }, uShape: { value: shape === 'circle' ? 0 : shape === 'lane' ? 1 : 2 }, uR: { value: 1 }, uLen: { value: 1 }, uArc: { value: 0.5 }, uA: { value: 1 }, uFire: { value: 0 }, uC: { value: new THREE.Color() } };
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: TELE_VS, fragmentShader: TELE_FS, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const m = new THREE.Mesh(g, mat); m.renderOrder = 9; m.userData.res = [nx, ny];
  return m;
}

// ------------------------------------------------------------------ pooled props
const TOON = { vertexColors: true, objectBrush: true, brush: 0.1, rim: 0.7, term: [-0.02, 0.3], fragOut: EDGE_OUT }; // (= the monster kit's program)
function lumpy(seg, rings, r, amp, seed, color) {
  let g = new THREE.SphereGeometry(1, seg, rings); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g, 1e-4);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).normalize(); const k = 1 + amp * (Math.sin(v.x * 5 + seed) * Math.cos(v.z * 4 - seed) + 0.5 * Math.sin(v.y * 7 + seed * 2)); p.setXYZ(i, v.x * r * k, v.y * r * k, v.z * r * k); }
  g.computeVertexNormals();
  return paint(g, color);
}
const snowPaint = (p, n, o) => { o.copy(ICE.snow); if (n.y < 0.2) o.lerp(ICE.shade, clamp((0.2 - n.y) * 0.9)); };
function snowballGeo() { return lumpy(12, 9, 0.17, 0.06, 1.3, snowPaint); }
function icicleGeo() { // tip down, the top at y = 0: a faceted main spike, two side spikes, a snow cap
  const parts = [];
  const spike = (r, h, x, z, seg, tw) => {
    const g = new THREE.ConeGeometry(r, h, seg, 4); g.rotateX(Math.PI); g.translate(x, -h / 2, z);
    const P = g.attributes.position; for (let i = 0; i < P.count; i++) { const y = P.getY(i), k = -y / h; const a = k * tw; const px = P.getX(i) - x, pz = P.getZ(i) - z; P.setX(i, x + px * Math.cos(a) - pz * Math.sin(a)); P.setZ(i, z + px * Math.sin(a) + pz * Math.cos(a)); }
    g.computeVertexNormals();
    return paint(g, (p, n, o) => { const k = clamp(-p.y / h); o.copy(ICE.pale).lerp(ICE.cyan, 0.35 + 0.3 * Math.sin(Math.atan2(n.x, n.z) * 3)); o.lerp(ICE.white, k * k * 0.8); });
  };
  parts.push(spike(0.17, 1.25, 0, 0, 7, 0.6), spike(0.08, 0.55, 0.12, 0.04, 6, -0.4), spike(0.07, 0.45, -0.1, -0.06, 6, 0.5));
  parts.push(ell(0.21, 0.08, 0.2, '#ffffff', [0, 0.02, 0], [0, 0, 0], 12));
  return merge(parts);
}
function dartGeo() { // an ice dart pointing +z
  const g = new THREE.OctahedronGeometry(1, 0); g.scale(0.11, 0.11, 0.5); g.computeVertexNormals(); // (already non-indexed: flat facets)
  const a = paint(g, (p, n, o) => { o.copy(ICE.pale).lerp(ICE.cyan, 0.5 + 0.5 * n.x); if (p.z > 0.2) o.lerp(ICE.white, 0.7); });
  const tail = new THREE.OctahedronGeometry(1, 0); tail.scale(0.07, 0.07, 0.22); tail.translate(0, 0, -0.42); tail.computeVertexNormals();
  return merge([a, paint(tail, (p, n, o) => o.copy(ICE.ice))]);
}
function sheetGeo(RINGS = 7, SEG = 44) { // polar grid (radius 1), re-laid on the terrain when placed
  const n = (RINGS + 1) * (SEG + 1), pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = [], base = new Float32Array(n * 2);
  for (let j = 0, k = 0; j <= RINGS; j++) for (let i = 0; i <= SEG; i++, k++) {
    const a = i / SEG * TAU, r = j / RINGS, wob = j === RINGS ? 1 + 0.06 * Math.sin(a * 5 + 1) + 0.04 * Math.sin(a * 11) : 1;
    base[k * 2] = Math.cos(a) * r * wob; base[k * 2 + 1] = Math.sin(a) * r * wob;
    uv[k * 2] = 0.5 + base[k * 2] * 0.47; uv[k * 2 + 1] = 0.5 + base[k * 2 + 1] * 0.47;
  }
  for (let j = 0; j < RINGS; j++) for (let i = 0; i < SEG; i++) { const a = j * (SEG + 1) + i, b = a + SEG + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
  g.userData.base = base;
  return g;
}
// the ice mirror: a tall rounded frame of ice round a glassy, shimmering pane (Yuki-onna's clones step out of these)
const MIRROR_VS = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const MIRROR_FS = /* glsl */`uniform float uT, uA, uK; varying vec2 vUv;
  void main() {
    vec2 q = vUv - 0.5; float r = length(q * vec2(1.0, 0.62));
    vec3 c = mix(vec3(0.78, 0.9, 1.0), vec3(0.58, 0.7, 1.0), vUv.y);
    float band = smoothstep(0.06, 0.0, abs(fract(vUv.x * 0.8 - vUv.y * 0.5 + uT * 0.35) - 0.5) - 0.1);
    c += vec3(1.0) * band * 0.45;
    c = mix(c, vec3(1.0), smoothstep(0.2, 0.0, r) * 0.25 * (0.6 + 0.4 * sin(uT * 3.0)));
    gl_FragColor = vec4(c, uA * (0.62 + 0.25 * band) * (0.35 + 0.65 * uK));
  }`;
function mirrorObj(fx) {
  const grp = new THREE.Group();
  const sh = new THREE.Shape(), W = 0.78, H = 1.45, R = 0.34, w = W - 0.13, h = H - 0.13, rr = R - 0.1;
  const rrect = (s, w2, h2, r) => { s.moveTo(-w2 + r, -h2); s.lineTo(w2 - r, -h2); s.quadraticCurveTo(w2, -h2, w2, -h2 + r); s.lineTo(w2, h2 - r); s.quadraticCurveTo(w2, h2, w2 - r, h2); s.lineTo(-w2 + r, h2); s.quadraticCurveTo(-w2, h2, -w2, h2 - r); s.lineTo(-w2, -h2 + r); s.quadraticCurveTo(-w2, -h2, -w2 + r, -h2); };
  rrect(sh, W, H, R); const hole = new THREE.Path(); rrect(hole, w, h, rr); sh.holes.push(hole);
  let fg = new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 6 });
  fg.translate(0, H + 0.05, -0.05); fg.deleteAttribute('uv');
  fg = paint(fg, (p, n, o) => { o.copy(ICE.pale).lerp(ICE.cyan, 0.3 + 0.25 * Math.sin(p.y * 7 + p.x * 3)); if (n.z > 0.6) o.lerp(ICE.white, 0.4); });
  // crystal finials on top and little icicles under the frame
  const deco = [];
  for (const [x, s] of [[0, 1], [-0.5, 0.7], [0.5, 0.7]]) { const c = new THREE.ConeGeometry(0.1 * s, 0.42 * s, 6); c.translate(x, 2 * H + 0.12 + 0.18 * s, 0); deco.push(paint(c, (p, n, o) => o.copy(ICE.ice).lerp(ICE.white, clamp((p.y - 2 * H) * 2)))); }
  for (const x of [-0.55, -0.2, 0.25, 0.6]) { const c = new THREE.ConeGeometry(0.05, 0.26, 5); c.rotateX(Math.PI); c.translate(x, 0.02, 0.03); deco.push(paint(c, (p, n, o) => o.copy(ICE.ice))); }
  const frame = merge([fg, ...deco]);
  const m = new THREE.Mesh(frame, fx.mat('toon')); m.castShadow = true;
  const ol = new THREE.Mesh(frame, fx.mat('ol'));
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(2 * w, 2 * h), new THREE.ShaderMaterial({ uniforms: { uT: fx.uT, uA: { value: 1 }, uK: { value: 0 } }, vertexShader: MIRROR_VS, fragmentShader: MIRROR_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  pane.position.set(0, H + 0.05, 0); pane.renderOrder = 7;
  grp.add(m, ol, pane); grp.userData.pane = pane;
  return grp;
}

// ------------------------------------------------------------------ the whiteout overlay (Yuki-onna phase 2)
// A full-screen pass drawn after the opaque world but under telegraphs and particles (renderOrder 5, no depth): a cold
// snow haze with wind-driven streaks; clear ellipses (screen-space projections of ground circles) round Chewy and every
// lantern, the lantern ones rimmed warm. The fight writes uPool[10] (x, y, rx, ry in NDC) and uWarm (0..1 per pool).
const WO_VS = /* glsl */`varying vec2 vN; void main() { vN = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const WO_FS = /* glsl */`uniform vec4 uPool[10]; uniform float uWarm[10]; uniform float uA, uT, uAsp; uniform vec3 uCol, uWarmC; varying vec2 vN;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  void main() {
    float clearK = 0.0, warm = 0.0;
    for (int i = 0; i < 10; i++) {
      vec4 P = uPool[i]; if (P.z <= 0.0) continue;
      float d = length((vN - P.xy) / P.zw);
      float c = 1.0 - smoothstep(0.55, 1.0, d);
      clearK = max(clearK, c);
      warm = max(warm, uWarm[i] * (1.0 - smoothstep(0.7, 1.25, d)) * smoothstep(0.35, 0.85, d));
    }
    vec2 s = vec2(vN.x * uAsp, vN.y);
    float n = vn(s * 3.0 + vec2(uT * 1.7, -uT * 0.6)) * 0.6 + vn(s * 7.0 + vec2(uT * 3.1, -uT * 1.3)) * 0.4;
    float streak = smoothstep(0.78, 0.98, vn(vec2(s.x * 2.0 - s.y * 7.0 + uT * 5.0, s.y * 1.2 + s.x * 0.6)));
    float haze = (1.0 - clearK) * (0.78 + 0.22 * n);
    vec3 col = mix(uCol * (0.92 + 0.12 * n), vec3(1.0), streak * 0.35);
    col = mix(col, uWarmC, warm * 0.55);
    float a = uA * max(haze, warm * 0.35) + uA * streak * 0.18 * (1.0 - clearK * 0.6);
    gl_FragColor = vec4(col, clamp(a, 0.0, 0.94));
  }`;
export function whiteoutMesh() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const U = { uPool: { value: Array.from({ length: 10 }, () => new THREE.Vector4()) }, uWarm: { value: new Array(10).fill(0) }, uA: { value: 0 }, uT: { value: 0 }, uAsp: { value: 1.6 }, uCol: { value: C('#d4e2f2') }, uWarmC: { value: C('#ffcf8a') } };
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: U, vertexShader: WO_VS, fragmentShader: WO_FS, transparent: true, depthTest: false, depthWrite: false, fog: false }));
  m.frustumCulled = false; m.renderOrder = 5; m.visible = false;
  return m;
}

// ------------------------------------------------------------------ the per-VFX host
const SCR = { frame: 0, x: 0, y: 0, z: 0 };
export class FrostFx {
  constructor(vfx) {
    this.vfx = vfx; this.scene = vfx.scene; this.engine = vfx.engine;
    this.active = []; this.pools = new Map(); this.acc = {}; this.mats = {}; this.geos = {};
    this.uT = { value: 0 }; this.t = 0;
    this._pn = null; this._pa = null;
    this.W = null; this.wanted = false; this.warmList = []; this.warmFrames = 0; this.warmed = false; this.wants = [];
  }
  heightAt(x, z) { return this.W?.heightAt?.(x, z) || 0; }
  /** normal-blend atlas layer (flakes, chunks, shards, puffs) / additive one (glints, stars, streaks, glows) */
  get pn() { return this._pn || (this._pn = new ParticleLayer(this.scene, atlasTex(), { additive: false, max: 1400, order: 12, grid: 4 })); }
  get pa() {
    if (!this._pa) {
      const L = this._pa = new ParticleLayer(this.scene, atlasTex(), { additive: true, max: 1400, order: 13, grid: 4 });
      const raw = L.spawn.bind(L), vfx = this.vfx; // boss readability damping (as vfx.glow / spark)
      L.spawn = o => { if (vfx.dampers.length && !vfx._undamped) { const k = vfx.dampAt(o.x, o.y, o.z); if (k < 1) { o.alpha = (o.alpha ?? 1) * k; if (o.alpha1) o.alpha1 *= k; } } return raw(o); };
    }
    return this._pa;
  }
  /** rate-limited emitter: how many to spawn this frame for `rate` per second (fractional carry per key) */
  emit(key, rate, dt) { const a = (this.acc[key] || 0) + rate * dt; const n = Math.floor(a); this.acc[key] = a - n; return n; }
  /** one particle from a scratch record (o's fields are read, never kept) */
  p(layer, frame, x, y, z, o) {
    const S = SCR;
    S.frame = frame; S.x = x; S.y = y; S.z = z;
    S.vx = o.vx || 0; S.vy = o.vy || 0; S.vz = o.vz || 0; S.life = o.life || 1;
    S.size = o.size ?? 0.3; S.size1 = o.size1 ?? S.size; S.color = o.color || ICE.white; S.color1 = o.color1 || null;
    S.alpha = o.alpha ?? 1; S.alpha1 = o.alpha1 ?? 0; S.rot = o.rot; S.spin = o.spin || 0; S.drag = o.drag || 0; S.grav = o.grav || 0;
    S.stretch = o.stretch || 1; S.fn = o.fn || null; S.fadeIn = o.fadeIn || 0; S.flicker = o.flicker || 0;
    return (layer === 'a' ? this.pa : this.pn).spawn(S);
  }
  /** a burst flying out of a point */
  burst(x, y, z, { frame = FR.FLAKE, n = 12, colors = PAL_SNOW, speed = 4, up = 3, size = 0.3, life = 0.9, grav = 5, drag = 1.6, spin = 7, layer = 'n', r = 0.15, size1 = null, alpha1 = 0 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(0.35, 1) * speed;
      this.p(layer, frame, x + Math.cos(a) * r, y + rand(-0.1, 0.2), z + Math.sin(a) * r, { vx: Math.cos(a) * s, vy: rand(0.4, 1) * up, vz: Math.sin(a) * s, life: rand(0.7, 1) * life, size: size * rand(0.7, 1.25), size1: size1 ?? size * 0.6, color: colors[i % colors.length], alpha: 1, alpha1, spin: rand(-spin, spin), drag, grav });
    }
  }
  /** soft snow puffs */
  puffs(x, y, z, { n = 8, color = ICE.snow, size = 0.55, grow = 2, speed = 1.6, up = 1.1, life = 0.9, alpha = 0.8, r = 0.3 } = {}) {
    for (let i = 0; i < n; i++) { const a = rand(0, TAU), s = rand(0.3, 1) * speed; this.p('n', FR.PUFF, x + Math.cos(a) * r, y + rand(0, 0.3), z + Math.sin(a) * r, { vx: Math.cos(a) * s, vy: rand(0.3, 1) * up, vz: Math.sin(a) * s, life: rand(0.7, 1) * life, size: size * rand(0.7, 1.2), size1: size * grow, color, alpha, alpha1: 0, spin: rand(-1.5, 1.5), drag: 2.5 }); }
  }
  /** sparkles twinkling up */
  twinkle(x, y, z, { n = 8, color = ICE.glow, r = 0.6, size = 0.34, life = 0.8, rise = 0.8, frame = FR.STAR } = {}) {
    for (let i = 0; i < n; i++) this.p('a', frame, x + rand(-r, r), y + rand(0, r), z + rand(-r, r), { vy: rand(0.2, 1) * rise, life: rand(0.5, 1) * life, size: size * rand(0.6, 1.2), size1: 0.02, color, alpha: 1, alpha1: 0, spin: rand(-3, 3), fadeIn: 0.06 });
  }
  /** a snowball / snow chunk splat on the ground */
  splat(x, y, z, r = 0.8, big = false) {
    this.burst(x, y + 0.15, z, { frame: FR.CHUNK, n: big ? 14 : 8, colors: PAL_SNOW, speed: 2.6 * r + 1, up: 3.4, size: big ? 0.3 : 0.22, grav: 12, drag: 1, life: 0.6, spin: 6, alpha1: 0.9 });
    this.puffs(x, y + 0.1, z, { n: big ? 8 : 5, size: 0.4 * r + 0.2, speed: 1.4 * r, up: 0.6, life: 0.7, alpha: 0.7 });
    this.burst(x, y + 0.2, z, { frame: FR.FLAKE, n: 5, colors: PAL_SNOW, speed: 2, up: 2, size: 0.2, grav: 1.5, drag: 2, life: 1 });
  }
  /** ice shatter: shards, crystals and glints */
  shatter(x, y, z, { n = 12, r = 0.3, speed = 4.5, colors = PAL_ICE, size = 0.3 } = {}) {
    this.burst(x, y, z, { frame: FR.SHARD, n, colors, speed, up: 3.5, size, grav: 11, drag: 1, life: 0.75, spin: 9, r, alpha1: 0.8 });
    this.burst(x, y, z, { frame: FR.CRYSTAL, n: Math.ceil(n / 3), colors, speed: speed * 0.7, up: 3, size: size * 0.7, grav: 9, drag: 1, life: 0.7, spin: 6, r });
    this.twinkle(x, y, z, { n: Math.ceil(n / 2), r: r + 0.3, frame: FR.GLINT, size: 0.5, life: 0.5 });
  }
  // ---------------------------------------------------------------- pools + tasks
  mat(key) {
    const M = this.mats;
    if (M[key]) return M[key];
    if (key === 'toon') return (M.toon = makeToon(TOON));
    if (key === 'ol') return (M.ol = makeOutline(INK, 0.021));
    if (key === 'ice') return (M.ice = new THREE.MeshBasicMaterial({ map: iceTexture(), color: C('#dff6ff'), transparent: true, opacity: 0.92, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    return null;
  }
  geo(key, make) { if (!this.geos[key]) { this.geos[key] = make(); this.geos[key].userData.shared = true; } return this.geos[key]; }
  take(kind, make) {
    let P = this.pools.get(kind); if (!P) this.pools.set(kind, P = { free: [], all: [] });
    let o = P.free.pop();
    if (!o) { o = make(this); o.frustumCulled = false; o.traverse?.(c => { c.frustumCulled = false; }); this.scene.add(o); P.all.push(o); }
    lookIn(this.G?.dungeon, o, this.scene); // (drawn instanced with the monsters where it can be: dungeon/horde.js)
    o.visible = true; return o;
  }
  give(kind, o) { if (!o) return; o.visible = false; this.pools.get(kind)?.free.push(o); }
  /** fn(dt, t) every frame until it returns false; end() once when it stops or the world is cleared */
  run(update, end) { const f = { update, end, t: 0 }; this.active.push(f); return f; }
  /** fn() after `sec` seconds */
  after(sec, fn) { return this.run((dt, t) => { if (t < sec) return true; fn(); return false; }); }
  update(dt) {
    const hasWork = this.active.length || this._pn || this._pa || this.warmList.length;
    if (!hasWork) return;
    this.engine.camera.matrixWorld.extractBasis(CR, CU, CF);
    this.t += dt; this.uT.value = this.t;
    if (this.warmList.length && ++this.warmFrames > 3) { for (const [k, o] of this.warmList) { o.position.set(0, 0, 0); this.give(k, o); } this.warmList.length = 0; }
    const A = this.active;
    for (let i = 0; i < A.length; i++) {
      const f = A[i]; f.t += dt; let keep = false;
      try { keep = f.update(dt, f.t) !== false; } catch (e) { console.warn('[frost fx]', e); }
      if (!keep) { try { f.end?.(); } catch (e) { console.warn('[frost fx]', e); } A[i] = A[A.length - 1]; A.pop(); i--; }
    }
    const cam = this.engine.camera;
    if (this._pn) this._pn.update(dt, cam);
    if (this._pa) this._pa.update(dt, cam);
  }
  clear() {
    for (const f of this.active) { try { f.end?.(); } catch (e) { /* ignore */ } }
    this.active.length = 0;
    this._pn?.clear(); this._pa?.clear();
    for (const P of this.pools.values()) { for (const o of P.all) o.visible = false; P.free = P.all.slice(); }
    this.warmList.length = 0;
  }
  /** ask for pooled kinds to be built + drawn behind the region's iris (VFX.prewarm calls prewarm() right after the
   *  camps spawn); later requests (a boss spawned after the prewarm) are warmed at once */
  want(kind, make, n = 1) {
    this.wanted = true;
    if (this.wants.some(w => w[0] === kind)) return;
    this.wants.push([kind, make, n]);
    if (this.warmed) this.warmKind(kind, make, n);
  }
  warmKind(kind, make, n) {
    for (let i = 0; i < n; i++) { const o = this.take(kind, make); o.position.set(rand(-2, 2), -60, rand(-2, 2)); this.warmList.push([kind, o]); }
    this.warmFrames = 0;
  }
  prewarm() {
    if (!this.wanted || this.warmed) return;
    this.warmed = true;
    for (const [kind, make, n] of this.wants) this.warmKind(kind, make, n);
    for (const s of ['circle', 'lane', 'cone']) this.warmKind('tele_' + s, () => teleMesh(s), s === 'circle' ? 4 : 1);
    this.p('n', FR.FLAKE, 0, -60, 0, { life: 0.2 }); this.p('a', FR.STAR, 0, -60, 0, { life: 0.2 });
  }
  // ---------------------------------------------------------------- telegraphs
  /**
   * o: { shape: 'circle' | 'lane' | 'cone', x, z, r (radius / lane half-width / cone range), dir (yaw: lanes + cones),
   *      len (lane), arc (cone half-angle), time (fill), hold (s kept lit after filling), color, manual (wait for fire()) }
   * → handle { k, place(x, z, dir), fire(), kill() }. Fills over `time`, flashes white when it fires (at `time` unless
   *   manual), stays lit for `hold`, then fades.
   */
  tele(o) {
    const shape = o.shape || 'circle', kind = 'tele_' + shape;
    if (this.G?.dungeon && !this.G.dungeon.isRegion) return this.teleFlat(o, shape);
    const m = this.take(kind, () => teleMesh(shape)), U = m.material.uniforms;
    U.uK.value = 0; U.uT.value = 0; U.uA.value = 1; U.uFire.value = 0;
    U.uR.value = o.r || 1; U.uLen.value = o.len || 4; U.uArc.value = o.arc || 0.5; U.uC.value.set(o.color || '#ff4a6a');
    const time = Math.max(0.05, o.time ?? 0.8), hold = o.hold ?? 0.12, fx = this;
    const h = { k: 0, x: o.x, z: o.z, dir: o.dir || 0, firedAt: -1, killT: -1, dead: false,
      place(x, z, dir = h.dir) { h.x = x; h.z = z; h.dir = dir; fx.drape(m, shape, x, z, dir, U.uR.value, U.uLen.value, U.uArc.value); },
      fire() { if (h.firedAt < 0 && h.killT < 0) h.firedAt = h.t ?? 0; },
      kill() { if (h.killT < 0) h.killT = h.t ?? 0; } };
    h.place(o.x, o.z, h.dir);
    this.run((dt, t) => {
      h.t = t; U.uT.value = t;
      if (h.killT >= 0) { const f = (t - h.killT) / 0.14; U.uA.value = Math.max(0, 1 - f); return f < 1; }
      h.k = Math.min(1, t / time); U.uK.value = h.k;
      if (h.firedAt < 0 && t >= time && !o.manual) h.firedAt = t;
      if (h.firedAt < 0) { if (t > time + 4) h.killT = t; return true; }
      const f = t - h.firedAt;
      U.uFire.value = Math.max(0, 1 - f / 0.24);
      if (f > hold) { const g = (f - hold) / 0.16; U.uA.value = Math.max(0, 1 - g); return g < 1; }
      return true;
    }, () => { h.dead = true; this.give(kind, m); });
    return h;
  }
  /** tele() on a flat floor (the zone dungeons): the same handle and timeline, drawn in one instanced batch with every
   *  other frost telegraph of the floor (gfx/teleBatch.js) instead of a mesh each */
  teleFlat(o, shape) {
    const time = Math.max(0.05, o.time ?? 0.8), hold = o.hold ?? 0.12;
    const q = teleBatchFor(this.vfx, 'frost', TELE_FS).add({ x: o.x, z: o.z, dir: o.dir || 0, shape: shape === 'circle' ? 0 : shape === 'lane' ? 1 : 2, r: o.r || 1, len: o.len || 4, arc: o.arc || 0.5, color: o.color || '#ff4a6a', time, driven: true });
    const h = { k: 0, x: o.x, z: o.z, dir: o.dir || 0, firedAt: -1, killT: -1, dead: false,
      place(x, z, dir = h.dir) { h.x = x; h.z = z; h.dir = dir; q.x = x; q.z = z; q.dir = dir; },
      fire() { if (h.firedAt < 0 && h.killT < 0) h.firedAt = h.t ?? 0; },
      kill() { if (h.killT < 0) h.killT = h.t ?? 0; } };
    this.run((dt, t) => {
      h.t = t; q.t = t;
      if (h.killT >= 0) { const f = (t - h.killT) / 0.14; q.a = Math.max(0, 1 - f); return f < 1; }
      h.k = Math.min(1, t / time); q.k = h.k;
      if (h.firedAt < 0 && t >= time && !o.manual) h.firedAt = t;
      if (h.firedAt < 0) { if (t > time + 4) h.killT = t; return true; }
      const f = t - h.firedAt;
      q.fire = Math.max(0, 1 - f / 0.24);
      if (f > hold) { const g = (f - hold) / 0.16; q.a = Math.max(0, 1 - g); return g < 1; }
      return true;
    }, () => { h.dead = true; q.done = true; });
    return h;
  }
  /** lay a telegraph grid on the terrain (world-space vertices; uv = local metres) */
  drape(m, shape, x, z, dir, r, len, arc) {
    const [nx, ny] = m.userData.res, P = m.geometry.attributes.position, UV = m.geometry.attributes.uv, pa = P.array, ua = UV.array;
    const fx = Math.sin(dir), fz = Math.cos(dir), rx = fz, rz = -fx;
    let x0, x1, y0, y1;
    if (shape === 'circle') { x0 = -r; x1 = r; y0 = -r; y1 = r; }
    else if (shape === 'lane') { x0 = -r; x1 = r; y0 = 0; y1 = len; }
    else { const s = arc < Math.PI / 2 ? Math.sin(arc) * r : r; x0 = -s; x1 = s; y0 = arc < Math.PI / 2 ? 0 : -r; y1 = r; }
    for (let j = 0, k = 0; j <= ny; j++) for (let i = 0; i <= nx; i++, k++) {
      const lx = x0 + (x1 - x0) * i / nx, ly = y0 + (y1 - y0) * j / ny;
      const wx = x + rx * lx + fx * ly, wz = z + rz * lx + fz * ly;
      pa[k * 3] = wx; pa[k * 3 + 1] = this.heightAt(wx, wz) + 0.075; pa[k * 3 + 2] = wz;
      ua[k * 2] = lx; ua[k * 2 + 1] = ly;
    }
    P.needsUpdate = true; UV.needsUpdate = true;
  }
  // ---------------------------------------------------------------- pooled makers
  mkSnowball() { const g = this.geo('snowball', snowballGeo); const m = new THREE.Mesh(g, this.mat('toon')); m.castShadow = true; m.add(new THREE.Mesh(g, this.mat('ol'))); return m; }
  mkIcicle() { const g = this.geo('icicle', icicleGeo); const grp = new THREE.Group(); const m = new THREE.Mesh(g, this.mat('toon')); m.castShadow = true; grp.add(m, new THREE.Mesh(g, this.mat('ol'))); return grp; }
  mkDart() { const g = this.geo('dart', dartGeo); const m = new THREE.Mesh(g, this.mat('toon')); m.add(new THREE.Mesh(g, this.mat('ol'))); return m; }
  mkSheet() { const m = new THREE.Mesh(sheetGeo(), this.mat('ice').clone()); m.renderOrder = 7; return m; }
  mkMirror() { return mirrorObj(this); }
  /** lay an ice sheet (from mkSheet) of radius r at (x, z) on the terrain */
  laySheet(m, x, z, r, rot = 0) {
    const g = m.geometry, P = g.attributes.position, b = g.userData.base, pa = P.array, c = Math.cos(rot), s = Math.sin(rot);
    for (let k = 0; k < P.count; k++) { const bx = b[k * 2] * r, bz = b[k * 2 + 1] * r, wx = x + bx * c - bz * s, wz = z + bx * s + bz * c; pa[k * 3] = wx; pa[k * 3 + 1] = this.heightAt(wx, wz) + 0.045; pa[k * 3 + 2] = wz; }
    P.needsUpdate = true; g.computeBoundingSphere();
  }
}
const PAL_SNOW = [ICE.white, ICE.snow, ICE.pale];
const PAL_ICE = [ICE.white, ICE.pale, ICE.ice, ICE.cyan];
export { PAL_SNOW, PAL_ICE };

// one FrostFx per VFX instance (village + each world), kept in a module WeakMap (never a property on the VFX: `vfx.frost`
// is VFX's own frost-hit preset). It runs as a VFX extension, so it updates with the world, clears with vfx.clear() and
// goes (with its scene) when the world is disposed. A VFX made before this module loaded gets one on first use.
const HOSTS = new WeakMap();
registerVfxExtension(vfx => { const f = new FrostFx(vfx); HOSTS.set(vfx, f); return f; });
/** the FrostFx of the current world (bound to its terrain for draping) */
export function frostFx(G) {
  const v = G.vfx; let f = HOSTS.get(v);
  if (!f) { f = new FrostFx(v); HOSTS.set(v, f); v.ext?.push(f); }
  if (f.W !== G.world) f.W = G.world;
  f.G = G;
  return f;
}
export { ease };
