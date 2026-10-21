// Stella the Sun Oracle's effects (docs/STELLA.md §4): sunlight, not fire. One StellaFX per VFX instance (the village's
// and each floor's / zone's), created through vfx.js' extension hook, so its meshes live in that world's scene.
//
// Readability and the bloom (§4.1): everything wider than a hand is NORMAL blended with soft, rim-weighted alpha (rays
// ≤ 0.35, areas ≤ 0.45, clear in the middle where it can be); additive only for the tiny white cores and the motes, under a
// per-frame budget (CORE_BUDGET); colours kept in a 0.8–0.9 luminance band so the bloom picks out only the cores; a size cap
// where each effect is made (CAP); no screen-space flashes and no full-screen tint. Her signs: the sun disc (a ring with
// twelve short rays), soft rays, slow motes; dawn rose on the Corona's rims and in all of the Dawn tree. Never orange,
// never flame tongues, embers or smoke (Chewy's Blazing Ball and Foosy's embers are fire; hers is light).
//
// Budget rules (as goldenFx.js / shihtzuFx.js): every mesh comes from a per-kind pool (added once, hidden when idle);
// geometries and canvas textures are module-level and shared; particles go through two atlas layers (normal blend for the
// discs, pips, paw prints and birds; additive for the small motes and glints only).
//
// THE API (combat/stellaSkills.js, stellaArts.js, stellaAllies.js, chargedStella.js and actors/stellaJoin.js call it; every
// position is a world THREE.Vector3 that the call may not keep; `k` scales a charged release's size; handles must be
// end()ed):
//   stlFx(G) → StellaFX
//   sweep(at, facing, { arc, r, rev, y, life, k })        a crescent of sunlight thrown off the canopy's rim (the Sunsweep)
//   twirl(at, { r, life, k })                             the twirl's ring of short rays round her
//   ray(from, dir, len, { width, life, rose, k, core })   a lance of light: a thin white core, a soft gold falloff
//   disc(pos, { r, life, rose })                          the small sun disc (at the finial as light leaves it, on a hit)
//   glint(from, facing, arc, len, { life, k })            a quick fan of rays from the finial (a cone, arc in radians)
//   glare(e)                                              little stars of glare over a dazzled foe
//   pips(e, n, flare)                                     the gilding over a foe this frame (n 1..3; call each frame)
//   gildFlare(pos, r)                                     a full gilding flaring
//   shimmer(e)                                            a sunburn tick on a foe: a faint golden heat-haze sparkle
//   beam() → { set(from, to, width, heat), end() }        Solar Ray's held beam (heat 0..1 thicker / whiter)
//   afterglow(from, dir, len, width, life)                the lit line a charged ray leaves (Afterglow)
//   flare(at, r, { k, rose })                             Solar Flare's burst: a white core, a ring of soft rays, rose at the rim
//   loop(from, to)                                        a loop of sunlight arcing from a to b (Prominence)
//   wave(at, r)                                           a ring rolling outward (Coronal Wave)
//   skipper() → { set(pos, spin), end() }                 the skipping sun disc in flight
//   skip(at, r)                                           a skip: a flare and a ring of light on the ground
//   spot(at, r) → { set(pos, r), pulse(), end() }         a sunspot on the ground (a rose rim, slow rays turning in it)
//   column(at, r, { life })                               a Sundial column of light falling, a sun disc on the ground
//   gnomon(at, len) → { set(angle, k), end() }            the planted wagasa's shadow sweeping round like a sundial's
//   rise(at, r) → { set(u), burst(), end() }              Rising Sun's great disc (u 0..1: out of the ground, swelling)
//   hinata({ size, twin }) → { obj, set(pos, t, mood, see), bolt(from, to), pulse(r), hurt(), end() }
//                                                         the little sun (a happy face, soft rays; no shadow) and her sunbolts
//   wash(at, r, { k })                                    Morning Light's wash of rose and gold rising round the pack
//   ripple(pos, size)                                     the rose ripple on a healed ally
//   patch(at, r) → { set(pos), end() }                    First Light's lingering warm patch
//   shell() → { set(pos, h, r, frac), pop(pos), end() }   a sun shell on an ally (a thin golden film, rim only)
//   halo() → { set(pos, h, frac), end() }                 the golden ring over an ally (a faint dome beneath)
//   kind(from, to)                                        Kind Light's rose-gold ray to an ally
//   sunDog() → { set(pos, t), end() }                     Shadow's sun-dog glow and the two bright spots beside him
//   mockSun(from, to)                                     a mock sun's ping (Twin Sun Dogs)
//   dawn(at, r) → { set(pos, k), end() }                  Daybreak: the ground round her brightening like a sunrise
//   allyRing() → { set(pos, r, on), end() }               the soft rose-gold ring under the ally a held heal will go to
//   motes(pos, n, { r, rise, rose })                      motes rising slowly, like dust in a sunbeam
//   paw(pos, facing)                                      a sunny paw print (Zoomies!)
//   birds(at, n)                                          birds' silhouettes far off (Daybreak)
//   heart(pos)                                            a little heart (Shadow mended)
import * as THREE from 'three';
import { ParticleLayer } from './particles.js';
import { registerVfxExtension } from './vfx.js';
import { rand, TAU, clamp, ease } from '../core/util.js';

const C = h => new THREE.Color(h);
export const STL_COL = { gold: '#ffd36a', white: '#fffaf0', rose: '#f7b8a8', amber: '#dfa23c', pale: '#fff1b8', red: '#d9573e' };
const K = { gold: C(STL_COL.gold), white: C(STL_COL.white), rose: C(STL_COL.rose), pale: C(STL_COL.pale), amber: C(STL_COL.amber), shade: C('#5a4632') };
const CAP = 6.5; // (no effect of hers grows past this radius, charged or not)
const CORE_BUDGET = 10; // (additive white cores a frame: the rest draw without one)
const INK = '#4a2c2a';
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();

// ================================================================== textures (canvas, module-level, drawn once)
export const SF = { DISC: 0, STAR: 1, MOTE: 2, PIP: 3, BADGE: 4, PAW: 5, SHIMMER: 6, HEART: 7, RING: 8, BIRD: 9, DOT: 10, SPARK: 11 };
const TEX = {};
const canvasTex = c => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true; return t; };
const newCanvas = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.lineJoin = 'round'; g.lineCap = 'round'; return { c, g }; };
/** the sun disc: a ring with twelve short rays (r: the ring's radius; the rays reach 1.55 r) */
function sunDisc(g, r, { fill = 'rgba(255,255,255,0.55)', line = '#ffffff', w = r * 0.16, rays = 12, ray = 0.55 } = {}) {
  g.fillStyle = fill; g.beginPath(); g.arc(0, 0, r * 0.82, 0, TAU); g.fill();
  g.strokeStyle = line; g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke();
  for (let i = 0; i < rays; i++) { const a = i / rays * TAU; g.beginPath(); g.moveTo(Math.cos(a) * r * 1.18, Math.sin(a) * r * 1.18); g.lineTo(Math.cos(a) * r * (1.18 + ray), Math.sin(a) * r * (1.18 + ray)); g.stroke(); }
}
function pawPath(g, s) {
  g.beginPath(); g.ellipse(0, s * 0.32, s * 0.55, s * 0.45, 0, 0, TAU);
  for (const [x, y, r] of [[-0.62, -0.28, 0.22], [-0.22, -0.62, 0.24], [0.22, -0.62, 0.24], [0.62, -0.28, 0.22]]) { g.moveTo(x * s + r * s, y * s); g.ellipse(x * s, y * s, r * s, r * s * 1.18, 0, 0, TAU); }
}
function atlasTex() {
  if (TEX.atlas) return TEX.atlas;
  const N = 4, S = 128, { c, g } = newCanvas(N * S);
  const cell = (i, fn) => { g.save(); g.translate((i % N) * S + S / 2, Math.floor(i / N) * S + S / 2); fn(g); g.restore(); };
  const rg = (r, stops) => { const gr = g.createRadialGradient(0, 0, 0, 0, 0, r); for (const [t, col] of stops) gr.addColorStop(t, col); return gr; };
  cell(SF.DISC, g => { // (a soft sun: a bright heart, a ring and twelve short rays, all fading out; no hard edge to fringe)
    g.fillStyle = rg(58, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.85)'], [0.5, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(-64, -64, 128, 128);
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 7; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.beginPath(); g.moveTo(Math.cos(a) * 36, Math.sin(a) * 36); g.lineTo(Math.cos(a) * 54, Math.sin(a) * 54); g.stroke(); }
  });
  cell(SF.STAR, g => {
    g.fillStyle = rg(28, [[0, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(-64, -64, 128, 128);
    g.fillStyle = '#fff'; for (const [w, h] of [[5, 56], [56, 5]]) { g.beginPath(); g.moveTo(-w, 0); g.quadraticCurveTo(0, 0, 0, -h); g.quadraticCurveTo(0, 0, w, 0); g.quadraticCurveTo(0, 0, 0, h); g.quadraticCurveTo(0, 0, -w, 0); g.fill(); }
  });
  cell(SF.MOTE, g => { g.fillStyle = rg(40, [[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]); g.beginPath(); g.arc(0, 0, 40, 0, TAU); g.fill(); });
  // a gilding pip: a tiny eight-ray sun with an ink rim (white: tinted sun gold), readable on any floor
  cell(SF.PIP, g => {
    g.strokeStyle = INK; g.lineWidth = 9; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; g.beginPath(); g.moveTo(Math.cos(a) * 30, Math.sin(a) * 30); g.lineTo(Math.cos(a) * 50, Math.sin(a) * 50); g.stroke(); }
    g.strokeStyle = '#ffffff'; g.lineWidth = 5; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; g.beginPath(); g.moveTo(Math.cos(a) * 30, Math.sin(a) * 30); g.lineTo(Math.cos(a) * 48, Math.sin(a) * 48); g.stroke(); }
    g.fillStyle = '#ffffff'; g.strokeStyle = INK; g.lineWidth = 7; g.beginPath(); g.arc(0, 0, 26, 0, TAU); g.fill(); g.stroke();
  });
  // the gilding badge (a full gilding, ready to flare): the sun disc in an ink ring
  cell(SF.BADGE, g => { g.fillStyle = 'rgba(74,44,42,0.75)'; g.beginPath(); g.arc(0, 0, 50, 0, TAU); g.fill(); sunDisc(g, 24, { fill: 'rgba(255,255,255,0.95)', w: 6, ray: 0.62 }); });
  cell(SF.PAW, g => { g.save(); g.translate(0, -4); g.fillStyle = rg(56, [[0, 'rgba(255,255,255,0.95)'], [1, 'rgba(255,255,255,0.65)']]); pawPath(g, 40); g.fill(); g.restore(); });
  // a heat-haze shimmer: three soft wavy strokes rising
  cell(SF.SHIMMER, g => {
    g.lineWidth = 7; for (const [x, a] of [[-22, 0.7], [0, 1], [22, 0.7]]) { g.strokeStyle = `rgba(255,255,255,${a})`; g.beginPath(); g.moveTo(x, 44); g.bezierCurveTo(x + 14, 20, x - 14, 0, x, -20); g.bezierCurveTo(x + 10, -32, x - 6, -40, x, -50); g.stroke(); }
  });
  cell(SF.HEART, g => { g.beginPath(); g.moveTo(0, 38); g.bezierCurveTo(-58, 2, -34, -46, 0, -18); g.bezierCurveTo(34, -46, 58, 2, 0, 38); g.closePath(); g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = INK; g.lineWidth = 7; g.stroke(); });
  cell(SF.RING, g => { g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.beginPath(); g.arc(0, 0, 46, 0, TAU); g.stroke(); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 14; g.beginPath(); g.arc(0, 0, 38, 0, TAU); g.stroke(); });
  // a bird far off (Daybreak): the ink "m" of a gull
  cell(SF.BIRD, g => { g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.beginPath(); g.moveTo(-46, 4); g.quadraticCurveTo(-24, -22, 0, 6); g.quadraticCurveTo(24, -22, 46, 4); g.stroke(); });
  cell(SF.DOT, g => { g.fillStyle = rg(50, [[0, 'rgba(255,255,255,1)'], [0.55, 'rgba(255,255,255,0.75)'], [1, 'rgba(255,255,255,0)']]); g.beginPath(); g.arc(0, 0, 50, 0, TAU); g.fill(); });
  cell(SF.SPARK, g => { g.fillStyle = '#fff'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU - Math.PI / 2, r = i % 2 ? 12 : 44; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); });
  const t = canvasTex(c); t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; // (no mips: transparent black would fringe the soft edges)
  return (TEX.atlas = t);
}
/** a ray: u along it (0 = where it leaves the finial, 1 = its end), v across; a soft falloff, a little brighter at the root,
 *  rounded at the far end */
const RAY_PAL = { gold: [[255, 250, 236], [255, 211, 106], [214, 140, 52]], rose: [[255, 246, 238], [247, 184, 168], [200, 104, 122]], core: [[255, 255, 255], [255, 255, 255], [255, 255, 255]] };
function rayTex(kind = 'gold') {
  const key = 'ray_' + kind; if (TEX[key]) return TEX[key];
  const W = 128, H = 32, { c, g } = newCanvas(W, H), img = g.createImageData(W, H), [c0, c1, c2] = RAY_PAL[kind];
  const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    const u = x / (W - 1), v = Math.abs(y / (H - 1) - 0.5) * 2;
    const along = Math.min(1, u / 0.04) * (0.8 + 0.2 * (1 - u)) * (1 - Math.pow(Math.max(0, u - 0.9) / 0.1, 2));
    const across = kind === 'core' ? Math.pow(Math.max(0, 1 - v), 1.6) : v < 0.85 ? 1 - 0.25 * v : Math.max(0, 1 - (v - 0.85) / 0.15) * 0.8; // (a solid band with a soft amber edge: it reads on a pale floor)
    const col = v < 0.3 ? mix(c0, c1, v / 0.3) : mix(c1, c2, Math.min(1, (v - 0.3) / 0.55));
    const i = (y * W + x) * 4; img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = Math.round(clamp(along * across) * 255);
  }
  g.putImageData(img, 0, 0);
  return (TEX[key] = canvasTex(c));
}
/** the crescent: v across the arc's width (soft both sides, the outer rim brighter), u along it (thin at both ends) */
function crescentTex() {
  if (TEX.cres) return TEX.cres;
  const W = 128, H = 32, { c, g } = newCanvas(W, H), img = g.createImageData(W, H);
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    const u = x / (W - 1), v = y / (H - 1);
    const along = Math.sin(u * Math.PI) ** 0.6, across = clamp(Math.exp(-Math.pow((v - 0.7) / 0.26, 2)) * 1.15) * (0.5 + 0.5 * v);
    const t = clamp((v - 0.45) / 0.5), col = [255 - 40 * t, 243 - 110 * t, 200 - 150 * t]; // (pale gold inside, sun gold, an amber rim)
    const i = (y * W + x) * 4; img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = Math.round(clamp(along * across) * 255);
  }
  g.putImageData(img, 0, 0);
  return (TEX.cres = canvasTex(c));
}
/** ground textures (white / tinted; their alpha does the work): a flare's ring of soft rays with a clear middle; a sunspot's
 *  warm patch with slow rays in it and a rim; a sunrise gradient; a ring of short rays (the twirl); a sun disc; a ring */
function groundTex(kind) {
  if (TEX[kind]) return TEX[kind];
  const S = 256, { c, g } = newCanvas(S); g.translate(S / 2, S / 2);
  const R = S / 2;
  const rad = (r0, r1, stops) => { const gr = g.createRadialGradient(0, 0, r0, 0, 0, r1); for (const [t, col] of stops) gr.addColorStop(t, col); return gr; };
  if (kind === 'flare') {
    g.fillStyle = rad(0, R, [[0, 'rgba(255,255,255,0)'], [0.45, 'rgba(255,255,255,0.12)'], [0.82, 'rgba(255,255,255,0.75)'], [0.9, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(-R, -R, S, S);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 24; i++) { const a = i / 24 * TAU, w = i % 2 ? 0.05 : 0.09; g.fillStyle = rad(R * 0.35, R * 0.98, [[0, 'rgba(255,255,255,0)'], [0.6, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]); g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R * 0.98, a - w, a + w); g.closePath(); g.fill(); }
  } else if (kind === 'spot') {
    g.fillStyle = rad(0, R, [[0, 'rgba(255,255,255,0.4)'], [0.7, 'rgba(255,255,255,0.32)'], [0.9, 'rgba(255,255,255,0.75)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(-R, -R, S, S);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.fillStyle = rad(R * 0.1, R * 0.86, [[0, 'rgba(255,255,255,0.0)'], [0.5, 'rgba(255,255,255,0.22)'], [1, 'rgba(255,255,255,0)']]); g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R * 0.86, a - 0.07, a + 0.07); g.closePath(); g.fill(); }
  } else if (kind === 'dawn') {
    g.fillStyle = rad(0, R, [[0, 'rgba(255,255,255,0.95)'], [0.55, 'rgba(255,255,255,0.6)'], [0.85, 'rgba(255,255,255,0.25)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(-R, -R, S, S);
  } else if (kind === 'twirl') {
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 6;
    for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; g.beginPath(); g.moveTo(Math.cos(a) * R * 0.66, Math.sin(a) * R * 0.66); g.lineTo(Math.cos(a) * R * 0.94, Math.sin(a) * R * 0.94); g.stroke(); }
    g.fillStyle = rad(R * 0.5, R, [[0, 'rgba(255,255,255,0)'], [0.6, 'rgba(255,255,255,0.4)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(-R, -R, S, S);
  } else if (kind === 'disc') {
    g.fillStyle = rad(0, R, [[0, 'rgba(255,255,255,0.15)'], [0.6, 'rgba(255,255,255,0.25)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(-R, -R, S, S);
    sunDisc(g, R * 0.5, { fill: 'rgba(255,255,255,0.18)', w: 10, ray: 0.5 });
  } else if (kind === 'ring') {
    g.fillStyle = rad(0, R, [[0, 'rgba(255,255,255,0)'], [0.78, 'rgba(255,255,255,0.08)'], [0.9, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(-R, -R, S, S);
  } else if (kind === 'shade') { // (the gnomon's shadow: a soft dark strip, u along it)
    const gr = g.createLinearGradient(-R, 0, R, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(-R, -R * 0.8, S, R * 1.6);
  }
  return (TEX[kind] = canvasTex(c));
}
/** a column of light (Sundial): v up the column (bright at the foot, fading up), soft at the sides */
function columnTex() {
  if (TEX.col) return TEX.col;
  const W = 32, H = 128, { c, g } = newCanvas(W, H), img = g.createImageData(W, H);
  for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
    const v = 1 - y / (H - 1), u = Math.abs(x / (W - 1) - 0.5) * 2;
    const a = Math.pow(1 - v, 1.4) * (0.35 + 0.65 * Math.pow(Math.max(0, 1 - u), 1.2));
    const i = (y * W + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(clamp(a) * 255);
  }
  g.putImageData(img, 0, 0);
  return (TEX.col = canvasTex(c));
}
/** Hinata, the little sun (STELLA §4.2): a round sun with soft rays and a happy face, drawn in her own colours */
function hinataTex(twin = false) {
  const key = twin ? 'hikari' : 'hinata'; if (TEX[key]) return TEX[key];
  const S = 256, { c, g } = newCanvas(S); g.translate(S / 2, S / 2);
  const body = twin ? '#ffe9a8' : '#ffd36a', rim = twin ? '#f7b8a8' : '#e8a640', ray = twin ? '#fff1c8' : '#ffe08a';
  // the soft rays (wavy, round-ended)
  g.fillStyle = ray; g.strokeStyle = INK; g.lineWidth = 6;
  g.beginPath(); for (let i = 0; i <= 16; i++) { const a = i / 16 * TAU; for (let j = 0; j < 8; j++) { const b = a + j / 8 * (TAU / 16), r = 70 + 26 * Math.pow(Math.sin(j / 8 * Math.PI), 1.5); const x = Math.cos(b) * r, y = Math.sin(b) * r; i || j ? g.lineTo(x, y) : g.moveTo(x, y); } } g.closePath(); g.fill(); g.stroke();
  // the body
  const gr = g.createRadialGradient(-18, -22, 6, 0, 0, 72); gr.addColorStop(0, '#fffaf0'); gr.addColorStop(0.45, body); gr.addColorStop(1, rim);
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 66, 0, TAU); g.fill(); g.lineWidth = 7; g.stroke();
  // the face: two happy closed eyes, a smile, rosy cheeks
  g.strokeStyle = INK; g.lineWidth = 7;
  for (const x of [-22, 22]) { g.beginPath(); g.arc(x, -2, 10, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
  g.beginPath(); g.arc(0, 12, 18, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
  g.fillStyle = 'rgba(240,120,110,0.55)'; for (const x of [-38, 38]) { g.beginPath(); g.ellipse(x, 16, 11, 7, 0, 0, TAU); g.fill(); }
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.ellipse(-26, -36, 14, 8, -0.6, 0, TAU); g.fill();
  return (TEX[key] = canvasTex(c));
}
/** Rising Sun's great disc: a big soft sun (sun gold with a white heart and a rose rim), rays round it */
function bigSunTex() {
  if (TEX.big) return TEX.big;
  const S = 256, { c, g } = newCanvas(S); g.translate(S / 2, S / 2);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,250,240,0.95)'); gr.addColorStop(0.38, 'rgba(255,214,110,0.92)'); gr.addColorStop(0.5, 'rgba(247,184,168,0.85)'); gr.addColorStop(0.56, 'rgba(255,210,120,0.3)'); gr.addColorStop(1, 'rgba(255,220,140,0)');
  g.fillStyle = gr; g.fillRect(-128, -128, 256, 256);
  g.strokeStyle = 'rgba(255,240,200,0.8)'; g.lineWidth = 5;
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.beginPath(); g.moveTo(Math.cos(a) * 80, Math.sin(a) * 80); g.lineTo(Math.cos(a) * 112, Math.sin(a) * 112); g.stroke(); }
  return (TEX.big = canvasTex(c));
}

// ================================================================== geometries (shared)
const G_STRIP = (() => { let g; return () => g || (g = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0)); })(); // x across, y along 0..1
const G_FLAT = (() => { let g; return () => g || (g = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2)); })(); // a ground square, radius 1
/** a quarter-turn crescent ribbon (radius 1, width 0.3 inward), x = sin, z = cos: the arc runs from −arc/2 to +arc/2 */
const G_CRES = (() => { const M = new Map(); return (arc) => { const k = Math.round(arc * 20) / 20; let g = M.get(k); if (g) return g;
  const n = 24, pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) { const u = i / n, a = -k / 2 + k * u; for (const [r, v] of [[0.7, 0], [1, 1]]) { pos.push(Math.sin(a) * r, 0, Math.cos(a) * r); uv.push(u, v); } }
  for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  M.set(k, g); return g; }; })();
const G_SPHERE = (() => { let g; return () => g || (g = new THREE.SphereGeometry(1, 24, 16)); })();
const G_TUBE = (() => { let g; return () => g || (g = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true).translate(0, 0.5, 0)); })();

// the sun shell's film: rim-lit (fresnel), clear in the middle, normal blended (never adds light to what's behind it)
const SHELL_VERT = `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
const SHELL_FRAG = `uniform vec3 uColor; uniform vec3 uRim; uniform float uAlpha; uniform float uT; varying vec3 vN; varying vec3 vV;
void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); float rim = pow(f, 2.6); float sh = 0.85 + 0.15 * sin(uT * 2.0 + vN.y * 6.0 + vN.x * 3.0);
  vec3 col = mix(uColor, uRim, smoothstep(0.55, 1.0, f)); gl_FragColor = vec4(col, uAlpha * rim * sh); }`;
function shellMat(color = K.gold, rim = K.pale) {
  return new THREE.ShaderMaterial({ vertexShader: SHELL_VERT, fragmentShader: SHELL_FRAG, uniforms: { uColor: { value: color.clone() }, uRim: { value: rim.clone() }, uAlpha: { value: 0.25 }, uT: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.FrontSide, toneMapped: false, fog: false });
}

// ================================================================== the effect system
export class StellaFX {
  constructor(vfx) {
    this.vfx = vfx; this.scene = vfx.scene; this.engine = vfx.engine;
    this.active = []; this.pools = new Map(); this.acc = {}; this._pa = null; this._pn = null; this.t = 0; this._coreF = -1; this._coreN = 0;
  }
  get pa() { // additive motes and glints (damped on bosses, like vfx.glow)
    if (!this._pa) {
      const L = this._pa = new ParticleLayer(this.scene, atlasTex(), { additive: true, max: 700, order: 13, grid: 4 });
      const raw = L.spawn.bind(L), vfx = this.vfx;
      L.spawn = o => { if (vfx.dampers?.length && !vfx._undamped) { const k = vfx.dampAt(o.x, o.y, o.z); if (k < 1) { o.alpha = (o.alpha ?? 1) * k; if (o.size != null) o.size *= 0.55 + 0.45 * k; } } return raw(o); };
    }
    return this._pa;
  }
  get pn() { return this._pn || (this._pn = new ParticleLayer(this.scene, atlasTex(), { additive: false, max: 1400, order: 12, grid: 4 })); }
  emit(key, rate, dt) { const a = (this.acc[key] || 0) + rate * dt; const n = Math.floor(a); this.acc[key] = a - n; return n; }
  take(kind, make) { let Pq = this.pools.get(kind); if (!Pq) this.pools.set(kind, Pq = []); const o = Pq.pop() || this.adopt(make()); o.visible = true; return o; }
  adopt(o) { o.frustumCulled = false; o.traverse?.(c => { c.frustumCulled = false; c.castShadow = false; }); this.scene.add(o); return o; }
  give(kind, o) { if (!o) return; o.visible = false; this.pools.get(kind)?.push(o); }
  run(update, end) { const f = { update, end, t: 0, done: false }; this.active.push(f); return f; }
  /** may this frame draw another additive core? (CORE_BUDGET a frame) */
  core() { const f = this.engine?.renderer?.info?.render?.frame ?? 0; if (f !== this._coreF) { this._coreF = f; this._coreN = 0; } return this._coreN++ < CORE_BUDGET; }
  update(dt) {
    this.t += dt;
    const A = this.active;
    for (let i = 0; i < A.length; i++) {
      const f = A[i]; f.t += dt;
      let keep = false;
      try { keep = f.update(dt, f.t) !== false; } catch (e) { console.warn('[stlFx]', e); }
      if (!keep) { f.done = true; try { f.end?.(); } catch (e) { console.warn('[stlFx]', e); } A[i] = A[A.length - 1]; A.pop(); i--; }
    }
    const cam = this.engine.camera;
    if (this._pa) this._pa.update(dt, cam);
    if (this._pn) this._pn.update(dt, cam);
  }
  clear() {
    for (const f of this.active) { f.done = true; try { f.end?.(); } catch (e) { /* ignore */ } }
    this.active.length = 0; this._pa?.clear(); this._pn?.clear();
  }
  /** her shaders compiled at a combat world's entry (STELLA §10: StellaFX.prewarm) */
  prewarm(renderer) {
    // every kind is drawn for a few real frames far below the floor (as vfx.js prewarm does: compile() only links the
    // programs it can see), its textures uploaded, then pooled: the first Golden Ray of a floor doesn't hitch or skip
    try {
      this.pn; this.pa;
      const kinds = [['strip', () => this.stripMesh(false)], ['stripCore', () => this.stripMesh(true)], ['ground', () => this.groundMesh()], ['cres', () => this.cresMesh(false)], ['cresAdd', () => this.cresMesh(true)],
        ['shell', () => this.shellMesh()], ['col', () => this.columnMesh()], ['haloRing', () => this.haloRingMesh()], ['hinata', () => this.sunSprite(hinataTex(false))], ['hikari', () => this.sunSprite(hinataTex(true))], ['bigSun', () => this.bigSunSprite()]];
      const warm = kinds.map(([k, mk]) => { const o = this.take(k, mk); o.position.set(0, -50, 0); return [k, o]; });
      for (const t of [atlasTex(), rayTex('gold'), rayTex('rose'), rayTex('core'), crescentTex(), columnTex(), bigSunTex(), hinataTex(false), hinataTex(true), ...['flare', 'spot', 'dawn', 'twirl', 'disc', 'ring', 'shade'].map(groundTex)]) { try { renderer?.initTexture?.(t); } catch (e) { /* ignore */ } }
      let n = 0; const done = () => { if (++n < 3) return requestAnimationFrame(done); for (const [k, o] of warm) this.give(k, o); };
      requestAnimationFrame(done);
    } catch (e) { /* cosmetic */ }
  }
  haloRingMesh() { const x = new THREE.Mesh(G_FLAT(), new THREE.MeshBasicMaterial({ map: groundTex('ring'), color: K.gold, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false })); x.renderOrder = 10; return x; }
  sunSprite(tex) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, fog: false })); s.renderOrder = 11; return s; }
  bigSunSprite() { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: bigSunTex(), transparent: true, depthWrite: false, toneMapped: false, fog: false })); s.renderOrder = 10; return s; }

  // ------------------------------------------------------------------ meshes
  stripMesh(add) {
    const m = new THREE.Mesh(G_STRIP(), new THREE.MeshBasicMaterial({ map: rayTex(add ? 'core' : 'gold'), color: '#ffffff', transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }));
    m.matrixAutoUpdate = false; m.renderOrder = add ? 10 : 9; m.material.forceSinglePass = true;
    return m;
  }
  groundMesh() {
    const m = new THREE.Mesh(G_FLAT(), new THREE.MeshBasicMaterial({ map: groundTex('flare'), color: '#ffffff', transparent: true, depthWrite: false, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.renderOrder = 8; return m;
  }
  cresMesh(add = false) {
    const m = new THREE.Mesh(G_CRES(Math.PI / 2), new THREE.MeshBasicMaterial({ map: crescentTex(), color: '#ffffff', transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }));
    m.renderOrder = add ? 10 : 9; return m;
  }
  shellMesh() { const m = new THREE.Mesh(G_SPHERE(), shellMat()); m.renderOrder = 9; return m; }
  columnMesh() {
    const m = new THREE.Mesh(G_TUBE(), new THREE.MeshBasicMaterial({ map: columnTex(), color: '#ffffff', transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }));
    m.renderOrder = 9; return m;
  }
  /** a camera-facing strip from `from` along `dir` (unit) for len m, width w → sets m.matrix (no allocation) */
  orient(m, from, dir, len, w) {
    const cam = this.engine.camera;
    _a.copy(dir).normalize(); _b.subVectors(cam.position, from).normalize(); _c.crossVectors(_a, _b); if (_c.lengthSq() < 1e-6) _c.set(-_a.z, 0, _a.x); _c.normalize();
    _b.crossVectors(_c, _a).normalize();
    m.matrix.makeBasis(_c, _a, _b).setPosition(from); m.matrix.multiply(_m.makeScale(Math.max(0.01, w), Math.max(0.05, len), 1)); m.matrixWorldNeedsUpdate = true;
  }
  rayLook(m, kind) { const t = rayTex(kind); if (m.material.map !== t) { m.material.map = t; m.material.needsUpdate = true; } m.material.color.set('#ffffff'); }
  /** a flat ground decal at `at`, radius r, of texture `tex` → { m } (its life is the caller's run) */
  ground(kind, at, r, color, alpha, spin = 0) {
    const m = this.take('ground', () => this.groundMesh());
    const tex = groundTex(kind); if (m.material.map !== tex) { m.material.map = tex; m.material.needsUpdate = true; }
    const W = this.G?.world, y = W?.heightAt ? W.heightAt(at.x, at.z) : at.y || 0; // (on the ground under it: a decal inside a rise would hide)
    if (color) m.material.color.copy(color); m.material.opacity = alpha; m.position.set(at.x, y + 0.05, at.z); m.scale.setScalar(Math.max(0.01, r)); m.rotation.set(0, spin, 0);
    return m;
  }

  // ------------------------------------------------------------------ the Sunsweep
  sweep(at, facing, o = {}) {
    const k = o.k || 1, r = Math.min(CAP, (o.r || 2.4) * k), life = o.life || 0.28, rev = !!o.rev, y = o.y ?? 0.55;
    const m = this.take('cres', () => this.cresMesh(false)), m2 = this.take('cresAdd', () => this.cresMesh(true));
    m.material.color.set('#ffffff'); m2.material.color.copy(K.pale);
    m.geometry = m2.geometry = G_CRES(Math.min(TAU, (o.arc || Math.PI / 2) * 1.15)); // (a touch wider than the hit arc: it reads as the sweep)
    const p0 = at.clone(), f = facing;
    this.run((dt, t) => {
      const u = clamp(t / life), grow = ease.outCubic(clamp(t / (life * 0.45)));
      const rr = r * (0.55 + 0.45 * grow);
      for (const [mm, s, a, dy] of [[m, rr, 0.85, 0], [m2, rr * 0.97, 0.5, 0.03]]) { // (the crescent, and a thin glow just inside its rim)
        mm.position.set(p0.x, p0.y + y + dy, p0.z); mm.rotation.set(0, f + (rev ? -1 : 1) * (1 - grow) * 0.5, 0); mm.scale.set(s, 1, s);
        mm.material.opacity = a * (1 - ease.inQuad(u)) * Math.min(1, t / 0.03);
      }
      return u < 1;
    }, () => { this.give('cres', m); this.give('cresAdd', m2); });
    // motes thrown off the rim
    for (let i = 0; i < 5; i++) { const a = f + rand(-0.75, 0.75), d = r * rand(0.75, 1); this.pa.spawn({ frame: SF.MOTE, x: p0.x + Math.sin(a) * d, y: p0.y + y + rand(-0.1, 0.2), z: p0.z + Math.cos(a) * d, vx: Math.sin(a) * 0.6, vy: rand(0.3, 0.8), vz: Math.cos(a) * 0.6, life: rand(0.5, 0.8), size: rand(0.1, 0.16), size1: 0.04, color: K.gold, alpha: 0.6, alpha1: 0, drag: 2 }); }
  }
  twirl(at, o = {}) {
    const k = o.k || 1, r = Math.min(CAP, (o.r || 2.2) * k), life = o.life || 0.42, p0 = at.clone();
    const m = this.ground('twirl', p0, r * 0.4, K.gold, 0);
    this.run((dt, t) => { const u = clamp(t / life), g = ease.outCubic(u); m.position.set(p0.x, p0.y + 0.08, p0.z); m.scale.setScalar(Math.max(0.05, r * (0.4 + 0.6 * g))); m.rotation.y = t * 3; m.material.opacity = 0.75 * (1 - ease.inQuad(u)); return u < 1; }, () => this.give('ground', m));
    this.motes(_a.set(p0.x, p0.y + 0.4, p0.z), 8, { r: r * 0.8, rise: 0.8 });
  }

  // ------------------------------------------------------------------ rays
  /** a lance of light from `from` along `dir` for len: a soft gold band (normal, ≤ 0.35) with a thin white core (additive,
   *  budgeted); it shoots out in ~0.06 s and fades by `life` */
  ray(from, dir, len, o = {}) {
    const k = o.k || 1, w = Math.min(1.4, (o.width || 0.35) * 1.5 * k), life = o.life || 0.26, L = Math.min(len, 24);
    const f0 = from.clone(), d0 = dir.clone().setY(dir.y || 0).normalize();
    const band = this.take('strip', () => this.stripMesh(false)); this.rayLook(band, o.rose ? 'rose' : 'gold');
    const core = o.core !== false && this.core() ? this.take('stripCore', () => this.stripMesh(true)) : null; if (core) core.material.color.copy(K.pale);
    this.run((dt, t) => {
      const u = clamp(t / life), g = ease.outCubic(clamp(t / 0.07)), fade = 1 - ease.inQuad(u);
      this.orient(band, f0, d0, L * g, w * (1 - 0.3 * u)); band.material.opacity = 0.8 * fade;
      if (core) { this.orient(core, f0, d0, L * g, w * 0.4); core.material.opacity = 0.55 * fade; }
      return u < 1;
    }, () => { this.give('strip', band); if (core) this.give('stripCore', core); });
    this.disc(f0, { r: 0.22 * k, life: 0.22, rose: o.rose });
  }
  disc(pos, o = {}) {
    const r = o.r || 0.3;
    this.pn.spawn({ frame: SF.DISC, x: pos.x, y: pos.y, z: pos.z, life: o.life || 0.24, size: r * 2.2, size1: r * 3, color: o.rose ? K.rose : K.gold, alpha: 0.75, alpha1: 0, spin: 1.5 });
    if (this.core()) this.pa.spawn({ frame: SF.MOTE, x: pos.x, y: pos.y, z: pos.z, life: (o.life || 0.24) * 0.7, size: r * 0.9, size1: r * 0.3, color: K.white, alpha: 0.5, alpha1: 0 });
  }
  glint(from, facing, arc, len, o = {}) {
    const k = o.k || 1, n = Math.max(5, Math.round(arc / 0.18)), L = Math.min(len, 10);
    for (let i = 0; i < n; i++) { const a = facing + arc * (i / (n - 1) - 0.5); _d.set(Math.sin(a), 0, Math.cos(a)); this.ray(from, _d, L * rand(0.8, 1), { width: 0.14 * k, life: o.life || 0.26, core: i === (n >> 1) }); }
    this.pn.spawn({ frame: SF.STAR, x: from.x, y: from.y, z: from.z, life: 0.25, size: 0.7 * k, size1: 0.2, color: K.white, alpha: 0.9, alpha1: 0, spin: 3 });
  }
  glare(e) { const y = e.pos.y + (e.height || 1) + 0.15; for (let i = 0; i < 2; i++) this.pn.spawn({ frame: SF.STAR, x: e.pos.x + rand(-0.25, 0.25), y: y + rand(-0.1, 0.15), z: e.pos.z + rand(-0.25, 0.25), life: rand(0.4, 0.6), size: rand(0.2, 0.3), size1: 0.06, color: K.pale, alpha: 0.95, alpha1: 0, spin: rand(-3, 3) }); }
  /** the gilding over a foe: one sprite a frame (its pips, or the badge at full) */
  pips(e, n, flare) {
    const y = e.pos.y + (e.height || 1) + 0.38, dt = this.engine?.dt || 1 / 60;
    if (flare) { this.pn.spawn({ frame: SF.BADGE, x: e.pos.x, y, z: e.pos.z, life: Math.max(0.02, dt * 1.05), size: 0.34, color: 0xffffff, alpha: 1, alpha1: 1 }); return; }
    for (let i = 0; i < n; i++) this.pn.spawn({ frame: SF.PIP, x: e.pos.x + (i - (n - 1) / 2) * 0.2, y, z: e.pos.z, life: Math.max(0.02, dt * 1.05), size: 0.16, color: K.gold, alpha: 1, alpha1: 1 });
  }
  gildFlare(pos, r) { this.flare(pos, r, { k: 1, rose: false, small: true }); }
  shimmer(e) {
    const y = e.pos.y + (e.height || 1) * 0.55;
    this.pn.spawn({ frame: SF.SHIMMER, x: e.pos.x + rand(-0.15, 0.15), y, z: e.pos.z + rand(-0.15, 0.15), vy: 0.6, life: 0.55, size: 0.32 * Math.max(0.7, Math.min(1.6, (e.radius || 0.4) * 2)), size1: 0.42, color: K.gold, alpha: 0.5, alpha1: 0 });
    this.pa.spawn({ frame: SF.MOTE, x: e.pos.x + rand(-0.2, 0.2), y: y + rand(-0.1, 0.3), z: e.pos.z + rand(-0.2, 0.2), vy: 0.5, life: 0.5, size: 0.1, size1: 0.03, color: K.gold, alpha: 0.5, alpha1: 0 });
  }
  beam() {
    const band = this.take('strip', () => this.stripMesh(false)), core = this.take('stripCore', () => this.stripMesh(true)), self = this;
    self.rayLook(band, 'gold'); core.material.color.copy(K.pale); band.material.opacity = 0; core.material.opacity = 0;
    let on = true, lastT = 0;
    const end = () => { if (!on) return; on = false; self.give('strip', band); self.give('stripCore', core); };
    return {
      set(from, to, width = 0.25, heat = 0) {
        if (!on) return;
        _d.subVectors(to, from); const len = _d.length(); if (len < 0.01) return; _d.multiplyScalar(1 / len);
        const w = width * 2 * (1 + 0.6 * heat);
        self.orient(band, from, _d, len, w); band.material.opacity = 0.62 + 0.15 * heat;
        self.orient(core, from, _d, len, w * (0.22 + 0.12 * heat)); core.material.opacity = 0.35 + 0.15 * heat;
        if (self.t - lastT > 0.05) { lastT = self.t; self.disc(to, { r: 0.25 + 0.15 * heat, life: 0.12 }); self.pn.spawn({ frame: SF.SHIMMER, x: to.x + rand(-0.2, 0.2), y: to.y, z: to.z + rand(-0.2, 0.2), vy: 0.8, life: 0.4, size: 0.3, size1: 0.4, color: K.pale, alpha: 0.35, alpha1: 0 }); }
      },
      end,
    };
  }
  afterglow(from, dir, len, width, life) {
    const band = this.take('strip', () => this.stripMesh(false)), f0 = from.clone(), d0 = dir.clone(), L = Math.min(len, 20);
    this.rayLook(band, 'gold');
    this.run((dt, t) => { const u = clamp(t / life); this.orient(band, f0, d0, L, width * 2 * (1 + 0.15 * Math.sin(t * 9))); band.material.opacity = 0.4 * (1 - ease.inQuad(u)) * Math.min(1, t / 0.1); if (Math.random() < dt * 14) { const s = rand(0, L); this.pa.spawn({ frame: SF.MOTE, x: f0.x + d0.x * s, y: f0.y + rand(-0.1, 0.2), z: f0.z + d0.z * s, vy: 0.5, life: 0.6, size: 0.1, size1: 0.03, color: K.gold, alpha: 0.5, alpha1: 0 }); } return u < 1; }, () => this.give('strip', band));
  }

  // ------------------------------------------------------------------ flares and the Corona
  /** a flare of sunlight: a ring of soft rays rolling out (clear in the middle, rose at the rim), a small white core */
  flare(at, r, o = {}) {
    const k = o.k || 1, R = Math.min(CAP, r * k), life = o.small ? 0.32 : 0.45, p0 = at.clone();
    const m = this.ground('flare', p0, R * 0.3, o.rose === false ? K.gold : K.rose, 0, rand(0, TAU));
    const m2 = this.ground('ring', p0, R * 0.3, K.pale, 0);
    this.run((dt, t) => {
      const u = clamp(t / life), g = ease.outCubic(u), fade = 1 - ease.inQuad(u);
      m.scale.setScalar(R * (0.35 + 0.7 * g)); m.material.opacity = 0.6 * fade; m.rotation.y += dt * 0.6;
      m2.scale.setScalar(R * (0.2 + 0.9 * g)); m2.material.opacity = 0.6 * fade;
      return u < 1;
    }, () => { this.give('ground', m); this.give('ground', m2); });
    _a.set(p0.x, p0.y + 0.45, p0.z);
    if (this.core()) this.pa.spawn({ frame: SF.MOTE, x: _a.x, y: _a.y, z: _a.z, life: 0.2, size: Math.min(1.1, 0.35 + R * 0.12), size1: 0.2, color: K.white, alpha: 0.55, alpha1: 0 });
    this.pn.spawn({ frame: SF.DISC, x: _a.x, y: _a.y, z: _a.z, life: 0.3, size: Math.min(1.4, 0.5 + R * 0.18), size1: Math.min(2, 0.8 + R * 0.25), color: K.gold, alpha: 0.6, alpha1: 0, spin: 2 });
    this.motes(_a, o.small ? 4 : 8, { r: R * 0.6, rise: 1 });
  }
  loop(from, to) {
    const a = from.clone(), b = to.clone(), h = 0.8 + a.distanceTo(b) * 0.2, life = 0.38;
    this.run((dt, t) => {
      const u = clamp(t / 0.22);
      for (let i = 0; i < 3; i++) { const s = clamp(u - i * 0.04); _c.lerpVectors(a, b, s); _c.y += Math.sin(s * Math.PI) * h; this.pn.spawn({ frame: SF.DOT, x: _c.x, y: _c.y, z: _c.z, life: 0.22, size: 0.22, size1: 0.08, color: i ? K.rose : K.gold, alpha: 0.7, alpha1: 0 }); }
      return t < life;
    });
  }
  wave(at, r) {
    const p0 = at.clone(), R = Math.min(CAP, r), m = this.ground('ring', p0, 0.5, K.gold, 0);
    this.run((dt, t) => { const u = clamp(t / 0.5); m.scale.setScalar(Math.max(0.1, R * ease.outCubic(u))); m.material.opacity = 0.65 * (1 - u); return u < 1; }, () => this.give('ground', m));
  }
  skipper() {
    const self = this; let on = true, spin = 0;
    return {
      set(pos, s = 0) { if (!on) return; spin += 0.3; self.pn.spawn({ frame: SF.DISC, x: pos.x, y: pos.y, z: pos.z, life: 0.05, size: 0.5, color: K.gold, alpha: 0.95, alpha1: 0.9, rot: spin }); if (Math.random() < 0.6) self.pa.spawn({ frame: SF.MOTE, x: pos.x, y: pos.y, z: pos.z, life: 0.3, size: 0.14, size1: 0.04, color: K.gold, alpha: 0.5, alpha1: 0 }); },
      end() { on = false; },
    };
  }
  skip(at, r) {
    const p0 = at.clone(), R = Math.min(CAP, r);
    for (const [kind, c, a, s, life] of [['ring', K.gold, 0.7, 1, 0.42], ['ring', K.rose, 0.5, 0.6, 0.5]]) {
      const m = this.ground(kind, p0, 0.2, c, 0);
      this.run((dt, t) => { const u = clamp(t / life); m.scale.setScalar(Math.max(0.1, R * s * ease.outCubic(u))); m.material.opacity = a * (1 - u); return u < 1; }, () => this.give('ground', m));
    }
    this.flare(p0, R * 0.9, { small: true });
  }
  spot(at, r) {
    const p0 = at.clone(), m = this.ground('spot', p0, r, K.gold, 0), rim = this.ground('ring', p0, r, K.rose, 0), self = this;
    let on = true, R = r, pulse = 0;
    const f = this.run((dt, t) => {
      if (!on) return false;
      const g = ease.outCubic(clamp(t / 0.3)); pulse = Math.max(0, pulse - dt * 2.5);
      m.position.set(p0.x, p0.y + 0.05, p0.z); m.scale.setScalar(Math.max(0.05, R * g * (1 + 0.06 * pulse))); m.rotation.y = t * 0.35; m.material.opacity = 0.45 + 0.12 * pulse;
      rim.position.set(p0.x, p0.y + 0.06, p0.z); rim.scale.setScalar(Math.max(0.05, R * 1.02 * g)); rim.material.opacity = 0.62 + 0.1 * Math.sin(t * 3);
      if (Math.random() < dt * 6 * Math.min(2, R)) { const a = rand(0, TAU), d = Math.sqrt(Math.random()) * R * 0.9; self.pa.spawn({ frame: SF.MOTE, x: p0.x + Math.cos(a) * d, y: p0.y + 0.1, z: p0.z + Math.sin(a) * d, vy: rand(0.4, 0.9), life: rand(0.7, 1.1), size: rand(0.08, 0.13), size1: 0.03, color: K.gold, alpha: 0.5, alpha1: 0 }); }
      return true;
    }, () => { this.give('ground', m); this.give('ground', rim); });
    return { set(pos, r2) { p0.copy(pos); if (r2) R = r2; }, pulse() { pulse = 1; }, end() { if (!on) return; on = false; } };
  }
  column(at, r, o = {}) {
    const p0 = at.clone(), life = o.life || 0.6, H = 6.5, m = this.take('col', () => this.columnMesh());
    m.material.color.copy(K.pale);
    const disc = this.ground('disc', p0, r, K.gold, 0, rand(0, TAU));
    this.run((dt, t) => {
      const u = clamp(t / life), drop = ease.outCubic(clamp(t / 0.14));
      m.position.set(p0.x, p0.y + (1 - drop) * H * 0.6, p0.z); m.scale.set(r * (0.5 + 0.15 * u), H * (0.3 + 0.7 * drop), r * (0.5 + 0.15 * u)); m.material.opacity = 0.42 * (1 - ease.inQuad(u));
      disc.scale.setScalar(Math.max(0.05, r * (0.6 + 0.4 * drop))); disc.material.opacity = 0.7 * (1 - u);
      return u < 1;
    }, () => { this.give('col', m); this.give('ground', disc); });
    if (this.core()) this.pa.spawn({ frame: SF.MOTE, x: p0.x, y: p0.y + 0.2, z: p0.z, life: 0.2, size: 0.6, size1: 0.2, color: K.white, alpha: 0.5, alpha1: 0 });
    this.motes(_a.set(p0.x, p0.y + 0.2, p0.z), 4, { r: r * 0.7, rise: 1.2 });
  }
  gnomon(at, len) {
    const p0 = at.clone(), m = this.ground('shade', p0, len * 0.5, K.shade, 0), self = this;
    let on = true, ang = 0, k = 1;
    this.run((dt, t) => { if (!on) return false; const a = ang; m.position.set(p0.x + Math.sin(a) * len * 0.5, p0.y + 0.05, p0.z + Math.cos(a) * len * 0.5); m.rotation.y = a + Math.PI / 2; m.scale.set(len * 0.5, 1, 0.16); m.material.opacity = 0.32 * k * Math.min(1, t / 0.2); return true; }, () => self.give('ground', m));
    return { set(a, kk = 1) { ang = a; k = kk; }, end() { on = false; } };
  }
  rise(at, r) {
    const p0 = at.clone(), R = Math.min(CAP, r), self = this;
    const spr = this.take('bigSun', () => this.bigSunSprite());
    const glow = this.ground('dawn', p0, R * 0.5, K.gold, 0);
    let on = true, u = 0;
    spr.material.opacity = 0;
    this.run((dt, t) => {
      if (!on) return false;
      const s = R * (0.25 + 0.55 * ease.outCubic(u)), y = p0.y + s * 0.35 + u * 0.6;
      spr.position.set(p0.x, y, p0.z); spr.scale.setScalar(s * 1.6); spr.material.opacity = 0.85 * Math.min(1, u * 3);
      glow.scale.setScalar(Math.max(0.05, R * (0.4 + 0.6 * u))); glow.material.opacity = 0.22 * u;
      if (Math.random() < dt * 12) { const a = rand(0, TAU), d = rand(0.2, 1) * R; self.pa.spawn({ frame: SF.MOTE, x: p0.x + Math.cos(a) * d, y: p0.y + 0.1, z: p0.z + Math.sin(a) * d, vx: -Math.cos(a) * d * 0.8, vy: rand(0.6, 1.2), vz: -Math.sin(a) * d * 0.8, life: 0.7, size: 0.12, size1: 0.04, color: K.gold, alpha: 0.55, alpha1: 0 }); }
      return true;
    }, () => { this.give('bigSun', spr); this.give('ground', glow); });
    return {
      set(v) { u = clamp(v); },
      burst() {
        if (!on) return; on = false;
        self.flare(p0, R, { k: 1 }); self.wave(p0, R * 1.1);
        for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; _d.set(Math.sin(a), 0, Math.cos(a)); self.ray(_b.set(p0.x + _d.x * R * 0.25, p0.y + 0.35, p0.z + _d.z * R * 0.25), _d, R * 0.8, { width: 0.2, life: 0.36, core: false }); }
      },
      end() { on = false; },
    };
  }

  // ------------------------------------------------------------------ Hinata, the little sun
  hinata(o = {}) {
    const tw = !!o.twin, size = (o.size || 1) * 0.55;
    const spr = this.take(tw ? 'hikari' : 'hinata', () => this.sunSprite(hinataTex(tw)));
    spr.scale.setScalar(size); spr.material.opacity = 0; spr.material.rotation = 0;
    const self = this; let on = true, hurtK = 0;
    const H = {
      obj: spr,
      set(pos, t = 0, mood = 0, see = 1) {
        if (!on) return;
        spr.position.copy(pos); hurtK = Math.max(0, hurtK - 0.05);
        const s = size * (1 + 0.04 * Math.sin(t * 5) + 0.12 * mood);
        spr.scale.setScalar(s); spr.material.rotation = Math.sin(t * 1.3) * 0.12; spr.material.opacity = see * Math.min(1, t * 3);
        spr.material.color.setRGB(1, 1 - 0.35 * hurtK, 1 - 0.35 * hurtK);
        if (Math.random() < 0.12) self.pa.spawn({ frame: SF.MOTE, x: pos.x + rand(-0.15, 0.15), y: pos.y - 0.1, z: pos.z + rand(-0.15, 0.15), vy: rand(-0.2, 0.3), life: 0.6, size: 0.08, size1: 0.02, color: K.gold, alpha: 0.5 * see, alpha1: 0 });
      },
      bolt(from, to) {
        const a = from.clone(), b = to.clone(), T = Math.max(0.08, a.distanceTo(b) / 18);
        self.run((dt, t) => { const u = clamp(t / T); _c.lerpVectors(a, b, u); _c.y += Math.sin(u * Math.PI) * 0.25; self.pn.spawn({ frame: SF.SPARK, x: _c.x, y: _c.y, z: _c.z, life: 0.1, size: 0.22, size1: 0.1, color: K.gold, alpha: 1, alpha1: 0, rot: t * 12 }); if (u >= 1) { self.disc(b, { r: 0.18, life: 0.16 }); return false; } return true; });
      },
      pulse(r) {
        const p = spr.position, g = self.ground('ring', _a.set(p.x, self.groundY(p), p.z), 0.3, K.rose, 0), p0 = _a.clone();
        self.run((dt, t) => { const u = clamp(t / 0.6); g.position.set(p0.x, p0.y + 0.05, p0.z); g.scale.setScalar(Math.max(0.05, r * ease.outCubic(u))); g.material.opacity = 0.32 * (1 - u); return u < 1; }, () => self.give('ground', g));
      },
      hurt() { hurtK = 1; },
      end() { if (!on) return; on = false; self.motes(spr.position, 6, { r: 0.3, rise: 1 }); self.give(tw ? 'hikari' : 'hinata', spr); },
    };
    return H;
  }
  groundY(p) { return this.G?.world?.heightAt?.(p.x, p.z) ?? (p.y - 1.2); }

  // ------------------------------------------------------------------ the Dawn tree
  wash(at, r, o = {}) {
    const k = o.k || 1, R = Math.min(CAP, r * k), p0 = at.clone();
    const g = this.ground('dawn', p0, R * 0.3, K.rose, 0), rim = this.ground('ring', p0, R * 0.3, K.pale, 0);
    this.run((dt, t) => { const u = clamp(t / 0.8), e = ease.outCubic(clamp(t / 0.45)); g.scale.setScalar(Math.max(0.05, R * (0.3 + 0.7 * e))); g.material.opacity = 0.42 * (1 - ease.inQuad(u)); rim.scale.setScalar(Math.max(0.05, R * (0.25 + 0.8 * e))); rim.material.opacity = 0.6 * (1 - u); return u < 1; }, () => { this.give('ground', g); this.give('ground', rim); });
    const n = Math.round(Math.min(24, 8 + R * 2) * (o.k ? Math.min(1.5, o.k) : 1));
    for (let i = 0; i < n; i++) { const a = rand(0, TAU), d = Math.sqrt(Math.random()) * R * 0.85; this.pa.spawn({ frame: SF.MOTE, x: p0.x + Math.cos(a) * d, y: p0.y + rand(0.05, 0.4), z: p0.z + Math.sin(a) * d, vy: rand(0.6, 1.2), life: rand(0.9, 1.4), size: rand(0.1, 0.16), size1: 0.03, color: i % 3 ? K.rose : K.gold, alpha: 0.55, alpha1: 0, drag: 0.5 }); }
  }
  ripple(pos, size = 1) {
    const p0 = pos.clone(), m = this.ground('ring', p0, 0.2, K.rose, 0);
    this.run((dt, t) => { const u = clamp(t / 0.5); m.position.set(p0.x, p0.y + 0.06, p0.z); m.scale.setScalar(Math.max(0.05, 0.85 * size * ease.outCubic(u))); m.material.opacity = 0.75 * (1 - u); return u < 1; }, () => this.give('ground', m));
    for (let i = 0; i < 4; i++) { const a = rand(0, TAU); this.pa.spawn({ frame: SF.MOTE, x: p0.x + Math.cos(a) * 0.3 * size, y: p0.y + rand(0.2, 0.7), z: p0.z + Math.sin(a) * 0.3 * size, vy: rand(0.5, 0.9), life: 0.7, size: 0.12, size1: 0.03, color: K.rose, alpha: 0.6, alpha1: 0 }); }
  }
  patch(at, r) {
    const p0 = at.clone(), R = Math.min(CAP, r), g = this.ground('dawn', p0, R, K.rose, 0), rim = this.ground('ring', p0, R, K.pale, 0), self = this;
    let on = true;
    this.run((dt, t) => { if (!on) return false; const e = ease.outCubic(clamp(t / 0.4)); g.position.set(p0.x, p0.y + 0.05, p0.z); g.scale.setScalar(Math.max(0.05, R * e)); g.material.opacity = 0.3 + 0.05 * Math.sin(t * 2); rim.position.set(p0.x, p0.y + 0.06, p0.z); rim.scale.setScalar(Math.max(0.05, R * e)); rim.material.opacity = 0.5; if (Math.random() < dt * 8) { const a = rand(0, TAU), d = Math.sqrt(Math.random()) * R; self.pa.spawn({ frame: SF.MOTE, x: p0.x + Math.cos(a) * d, y: p0.y + 0.1, z: p0.z + Math.sin(a) * d, vy: rand(0.4, 0.8), life: 1, size: 0.1, size1: 0.03, color: K.rose, alpha: 0.5, alpha1: 0 }); } return true; }, () => { this.give('ground', g); this.give('ground', rim); });
    return { set(pos) { p0.copy(pos); }, end() { on = false; } };
  }
  /** a sun shell: a thin golden film round the ally (rim only, ≤ 0.25 alpha), a slow shimmer; frac 0..1 its fill */
  shell() {
    const m = this.take('shell', () => this.shellMesh()), self = this; let on = true;
    m.material.uniforms.uColor.value.copy(K.gold); m.material.uniforms.uRim.value.copy(K.amber); m.material.uniforms.uAlpha.value = 0;
    return {
      set(pos, h, r, frac) { if (!on) return; m.position.set(pos.x, pos.y + h * 0.5, pos.z); m.scale.set(r, h * 0.62, r); m.material.uniforms.uAlpha.value = 0.3 + 0.3 * clamp(frac); m.material.uniforms.uT.value = self.t; },
      pop(pos) { self.motes(pos, 8, { r: 0.45, rise: 0.9 }); self.ripple(pos, 0.8); },
      end() { if (!on) return; on = false; self.give('shell', m); },
    };
  }
  halo() {
    const ring = this.take('haloRing', () => this.haloRingMesh());
    const dome = this.take('shell', () => this.shellMesh()), self = this; let on = true;
    dome.material.uniforms.uColor.value.copy(K.pale); dome.material.uniforms.uRim.value.copy(K.gold); dome.material.uniforms.uAlpha.value = 0; ring.material.opacity = 0; // (pooled: hidden until its first set)
    return {
      set(pos, h, frac = 1) {
        if (!on) return;
        const bob = Math.sin(self.t * 2.4) * 0.04;
        ring.position.set(pos.x, pos.y + h + 0.22 + bob, pos.z); ring.scale.setScalar(0.34); ring.material.opacity = 0.9 * (0.55 + 0.45 * clamp(frac));
        dome.position.set(pos.x, pos.y + h * 0.5, pos.z); dome.scale.set(h * 0.55, h * 0.7, h * 0.55); dome.material.uniforms.uAlpha.value = 0.2 + 0.15 * clamp(frac); dome.material.uniforms.uT.value = self.t;
      },
      end() { if (!on) return; on = false; self.give('haloRing', ring); self.give('shell', dome); },
    };
  }
  kind(from, to) {
    _d.subVectors(to, from); const L = _d.length(); if (L < 0.05) { this.disc(to, { rose: true }); return; }
    this.ray(from, _d.multiplyScalar(1 / L), L, { width: 0.2, rose: true, life: 0.3 });
    this.disc(to, { r: 0.3, rose: true, life: 0.35 });
  }
  sunDog() {
    const self = this; let on = true;
    return {
      set(pos, t) {
        if (!on) return;
        const y = pos.y + 0.45;
        // the two bright mock suns beside him (one sprite each a frame, normal blend), a few motes
        for (const s of [-1, 1]) { const a = t * 1.4 + (s > 0 ? Math.PI : 0); self.pn.spawn({ frame: SF.DISC, x: pos.x + Math.cos(a) * 0.55, y: y + 0.1 + Math.sin(t * 3 + s) * 0.05, z: pos.z + Math.sin(a) * 0.55, life: Math.max(0.02, (self.engine?.dt || 1 / 60) * 1.05), size: 0.26, color: K.gold, alpha: 0.9, alpha1: 0.9 }); }
        if (Math.random() < 0.2) self.pa.spawn({ frame: SF.MOTE, x: pos.x + rand(-0.2, 0.2), y: y + rand(-0.1, 0.2), z: pos.z + rand(-0.2, 0.2), vy: 0.5, life: 0.6, size: 0.1, size1: 0.03, color: K.gold, alpha: 0.5, alpha1: 0 });
      },
      end() { on = false; },
    };
  }
  mockSun(from, to) { this.hinata0 ||= null; const a = from.clone(), b = to.clone(); this.run((dt, t) => { const u = clamp(t / 0.14); _c.lerpVectors(a, b, u); this.pn.spawn({ frame: SF.SPARK, x: _c.x, y: _c.y, z: _c.z, life: 0.08, size: 0.18, size1: 0.08, color: K.pale, alpha: 1, alpha1: 0 }); if (u >= 1) { this.disc(b, { r: 0.15, life: 0.14 }); return false; } return true; }); }
  dawn(at, r) {
    const p0 = at.clone(), R = Math.min(CAP, r), g = this.ground('dawn', p0, 0.1, K.rose, 0), g2 = this.ground('dawn', p0, 0.1, K.gold, 0), rim = this.ground('ring', p0, 0.1, K.pale, 0), self = this;
    let on = true, k = 1;
    this.run((dt, t) => {
      if (!on) return false;
      const e = ease.outCubic(clamp(t / 1.1));
      for (const [m, s, a] of [[g, 1, 0.26], [g2, 0.55, 0.24], [rim, 1.02, 0.45]]) { m.position.set(p0.x, p0.y + 0.05 + (m === g2 ? 0.01 : 0), p0.z); m.scale.setScalar(Math.max(0.05, R * s * e)); m.material.opacity = a * k * Math.min(1, t / 0.3); }
      if (Math.random() < dt * 10 * k) { const a = rand(0, TAU), d = Math.sqrt(Math.random()) * R * e; self.pa.spawn({ frame: SF.MOTE, x: p0.x + Math.cos(a) * d, y: p0.y + 0.1, z: p0.z + Math.sin(a) * d, vy: rand(0.8, 1.4), life: 1.2, size: 0.12, size1: 0.03, color: Math.random() < 0.5 ? K.rose : K.gold, alpha: 0.5, alpha1: 0 }); }
      return true;
    }, () => { this.give('ground', g); this.give('ground', g2); this.give('ground', rim); });
    return { set(pos, kk = 1) { p0.copy(pos); k = kk; }, end() { on = false; } };
  }
  allyRing() {
    const m = this.ground('ring', _a.set(0, -99, 0), 0.6, K.rose, 0), self = this; let on = true, want = 0, cur = 0;
    m.material.color.copy(K.rose).lerp(K.gold, 0.35);
    this.run(dt => { if (!on && cur <= 0.01) return false; cur += ((on ? want : 0) - cur) * Math.min(1, dt * 10); m.material.opacity = 0.8 * cur; return true; }, () => self.give('ground', m));
    return { set(pos, r = 0.6, vis = true) { if (pos) { m.position.set(pos.x, pos.y + 0.05, pos.z); m.scale.setScalar(r * (1 + 0.04 * Math.sin(self.t * 5))); } want = vis ? 1 : 0; }, end() { on = false; } };
  }
  motes(pos, n = 6, o = {}) {
    const r = Math.min(CAP, o.r ?? 0.6), rise = o.rise ?? 0.8;
    for (let i = 0; i < n; i++) { const a = rand(0, TAU), d = Math.sqrt(Math.random()) * r; this.pa.spawn({ frame: SF.MOTE, x: pos.x + Math.cos(a) * d, y: pos.y + rand(-0.1, 0.3), z: pos.z + Math.sin(a) * d, vx: Math.cos(a) * 0.2, vy: rand(0.6, 1) * rise, vz: Math.sin(a) * 0.2, life: rand(0.8, 1.3), size: rand(0.09, 0.15), size1: 0.03, color: o.rose ? K.rose : K.gold, alpha: 0.55, alpha1: 0, drag: 0.6 }); }
  }
  paw(pos, facing = 0) { this.pn.spawn({ frame: SF.PAW, x: pos.x, y: pos.y + 0.04, z: pos.z, life: 1.2, size: 0.2, size1: 0.2, color: K.gold, alpha: 0.6, alpha1: 0, rot: -facing }); this.pa.spawn({ frame: SF.MOTE, x: pos.x, y: pos.y + 0.1, z: pos.z, vy: 0.6, life: 0.6, size: 0.1, size1: 0.03, color: K.gold, alpha: 0.5, alpha1: 0 }); }
  birds(at, n = 4) {
    for (let i = 0; i < n; i++) { const a = rand(0, TAU), d = rand(6, 9), y = at.y + rand(4, 6), s = rand(1.4, 2.2); this.pn.spawn({ frame: SF.BIRD, x: at.x + Math.cos(a) * d, y, z: at.z + Math.sin(a) * d, vx: -Math.sin(a) * s, vy: rand(0, 0.3), vz: Math.cos(a) * s, life: rand(2, 3), size: rand(0.3, 0.45), size1: 0.3, color: C('#5a4a5a'), alpha: 0.7, alpha1: 0 }); }
  }
  heart(pos) { this.pn.spawn({ frame: SF.HEART, x: pos.x, y: pos.y, z: pos.z, vy: 0.6, life: 1, size: 0.3, size1: 0.36, color: C('#ff8fb0'), alpha: 1, alpha1: 0 }); }
}
registerVfxExtension(vfx => (vfx.stl = new StellaFX(vfx)));
/** the StellaFX of the current world's VFX (made there if the hook missed it) */
export function stlFx(G) { const v = G.vfx; if (!v.stl) { v.stl = new StellaFX(v); v.ext?.push(v.stl); } if (!v.stl.G) v.stl.G = G; return v.stl; }
