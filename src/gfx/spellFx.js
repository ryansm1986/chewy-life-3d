// Moka's spell effects (water, starlight, duck hunt). One SpellFX per VFX instance (the village's and each Burrow
// floor's), created through vfx.js' extension hook, so it lives in that world's scene and is torn down with it.
//
// Budget rules: every mesh comes from a per-kind pool (added to the scene once, hidden when idle); geometries are
// module-level and shared; materials are per SpellFX (the village's stay alive for the whole session, so their
// programs never recompile). Particles go through two atlas layers (one additive, one normal-blend: 2 draw calls for
// every droplet, star, feather, crumb and confetti). Lights only through the world's LightPool (vfx.light flashes and
// addSource for the few persistent ones). No allocations in per-frame paths beyond the particle spawn records.
//
// API (see mokaSpells.js for the callers):
//   spellFx(G) → SpellFX of the current world          sfx.prewarm(renderer, camera)
//   water: orbMesh() trailOrb(p) splash(pos,o) ripple(pos,o) shakeSpray(pos,r) bubble(getPos) puddle(pos,o)
//          whirlpool(pos,r,dur) greatWave(origin,dir,o)
//   star:  boltMesh() trailBolt(p) kibbleMesh() trailKibble(p) starBurst(pos,o) squeak(pos,r,headY) dizzy(e,dur)
//          pawRune(pos,r) moonbeam(r) constellation() meteor(from,to,o) crater(pos,r)
//   duck:  duckModel() quack(pos) confetti(pos,n) leash(getA,getB) featherMesh() trailFeather(p) featherBurst(pos,n)
//          lure(pos,r,dur) retrieverModel() poseRetriever(m,s) mallards(o)
//   misc:  text(word,pos,o) charge(getPos,color,dur) castFlash(pos,color) chill(e)
import * as THREE from 'three';
import { ParticleLayer } from './particles.js';
import { glowTexture, ringTexture } from './textures.js';
import { makeToon, makeOutline } from './materials.js';
import { paint, merge } from './geom.js';
import { registerVfxExtension } from './vfx.js';
import { rand, TAU, clamp, ease } from '../core/util.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1);
const _o = new THREE.Object3D();
const UP = new THREE.Vector3(0, 1, 0);
const C = h => new THREE.Color(h);
const lerp = (a, b, t) => a + (b - a) * t;

// ------------------------------------------------------------------ palette (pre-made: no per-spawn allocations)
export const PAL = {
  sea: C('#5ce0d0'), aqua: C('#8ff0ff'), deep: C('#1c7f9c'), foam: C('#f0fffd'), ice: C('#c8f4ff'), teal: C('#2fb8a8'),
  gold: C('#ffd36a'), star: C('#fff2b0'), violet: C('#b89aff'), lilac: C('#d8c8ff'), pink: C('#ffb0dc'), moon: C('#e8ecff'),
  orange: C('#ffb04a'), green: C('#8fd068'), duck: C('#ffd84a'), cream: C('#fff6e0'), biscuit: C('#e8b070'), crumb: C('#c98a4c'),
  fire: C('#ffb04a'), ember: C('#ff6a2a'), white: C('#ffffff'), smoke: C('#5a4a52'), mint: C('#9ff0c8'), sky: C('#9fd8ff'),
};
const CONFETTI = ['#ff8fb0', '#ffd84a', '#8fe0c0', '#8fd0ff', '#b89aff', '#ffb04a'].map(C);

// ------------------------------------------------------------------ camera basis (droplets align with their motion)
const CAM_R = new THREE.Vector3(1, 0, 0), CAM_U = new THREE.Vector3(0, 1, 0), CAM_F = new THREE.Vector3();
// teardrop sprites point their tail away from where they're flying, and stretch with speed
function dropFn(q) {
  const sx = q.vx * CAM_R.x + q.vy * CAM_R.y + q.vz * CAM_R.z, sy = q.vx * CAM_U.x + q.vy * CAM_U.y + q.vz * CAM_U.z;
  q.rot = Math.atan2(-sy, -sx) - Math.PI / 2;
  q.stretch = 1 + Math.min(1.1, Math.hypot(sx, sy) * 0.07);
}
function streakFn(q) {
  const sx = q.vx * CAM_R.x + q.vy * CAM_R.y + q.vz * CAM_R.z, sy = q.vx * CAM_U.x + q.vy * CAM_U.y + q.vz * CAM_U.z;
  q.rot = Math.atan2(sy, sx);
}

// ================================================================== textures (canvas, module-level, drawn once)
export const F = { DROP: 0, STAR: 1, SPARK: 2, FEATHER: 3, BUBBLE: 4, CONFETTI: 5, CRUMB: 6, HEART: 7, PAW: 8, FOAM: 9, DOT: 10, KIBBLE: 11, RING: 12, STREAK: 13, NOTE: 14, GLOWSTAR: 15 };
const INK = '#3a2440';
const TEX = {};
function canvasTex(c, srgb = true) { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true; return t; }
function newCanvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.lineJoin = 'round'; g.lineCap = 'round'; return { c, g }; }
function starPath(g, x, y, r, ri, n = 5, rot = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) { const a = rot + (i * Math.PI) / n, q = i % 2 ? ri : r; pts.push([x + Math.cos(a) * q, y + Math.sin(a) * q]); }
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  g.beginPath(); let m = mid(pts[pts.length - 1], pts[0]); g.moveTo(m[0], m[1]);
  for (let i = 0; i < pts.length; i++) { const p = pts[i], nx = mid(p, pts[(i + 1) % pts.length]); g.quadraticCurveTo(p[0], p[1], nx[0], nx[1]); }
  g.closePath();
}
function heartPath(g, x, y, s) {
  g.beginPath(); g.moveTo(x, y + s * 0.9);
  g.bezierCurveTo(x - s * 1.25, y + s * 0.05, x - s * 1.0, y - s * 1.05, x, y - s * 0.4);
  g.bezierCurveTo(x + s * 1.0, y - s * 1.05, x + s * 1.25, y + s * 0.05, x, y + s * 0.9); g.closePath();
}
function pawPath(g, x, y, s) {
  g.beginPath(); g.ellipse(x, y + s * 0.28, s * 0.5, s * 0.4, 0, 0, TAU);
  for (const [dx, dy, r] of [[-0.52, -0.2, 0.2], [-0.2, -0.52, 0.21], [0.2, -0.52, 0.21], [0.52, -0.2, 0.2]]) { g.moveTo(x + dx * s + r * s, y + dy * s); g.ellipse(x + dx * s, y + dy * s, r * s, r * s * 1.18, 0, 0, TAU); }
}
function bonePath(g, len, hw, kr) {
  const x0 = -len / 2, x1 = len / 2, d = kr * 0.72; hw = Math.min(hw, d * 0.95);
  const s = Math.sqrt(kr * kr - (d - hw) * (d - hw)), s2 = Math.sqrt(Math.max(0, kr * kr - d * d));
  g.beginPath(); g.moveTo(x0 + s, -hw); g.lineTo(x1 - s, -hw);
  g.arc(x1, -d, kr, Math.atan2(d - hw, -s), Math.atan2(d, s2) + TAU);
  g.arc(x1, d, kr, -Math.atan2(d, s2), Math.atan2(hw - d, -s) + TAU);
  g.lineTo(x0 + s, hw);
  g.arc(x0, d, kr, Math.atan2(hw - d, s), Math.atan2(-d, -s2) + TAU);
  g.arc(x0, -d, kr, Math.atan2(d, -s2), Math.atan2(d - hw, s) + TAU);
  g.closePath();
}
// 4x4 particle atlas, 128 px cells: white / grey art (tinted by the particle colour); some frames carry an ink outline so
// they read on bright floors in the normal-blend layer
function atlasTex() {
  if (TEX.atlas) return TEX.atlas;
  const N = 4, S = 128, { c, g } = newCanvas(N * S);
  const cell = (i, fn) => { g.save(); g.translate((i % N) * S + S / 2, Math.floor(i / N) * S + S / 2); fn(g); g.restore(); };
  const rg = (x, y, r, stops, fx, fy) => { const gr = g.createRadialGradient(fx ?? x, fy ?? y, 0, x, y, r); for (const [t, col] of stops) gr.addColorStop(t, col); return gr; };
  cell(F.DROP, g => {
    g.beginPath(); g.moveTo(0, -50); g.bezierCurveTo(9, -28, 32, -8, 32, 16); g.arc(0, 16, 32, 0, Math.PI); g.bezierCurveTo(-32, -8, -9, -28, 0, -50); g.closePath();
    g.fillStyle = rg(0, 14, 40, [[0, '#ffffff'], [0.62, '#eef8fa'], [1, '#9fc0cc']], -10, 4); g.fill();
    g.strokeStyle = 'rgba(120,160,175,0.9)'; g.lineWidth = 3; g.stroke();
    g.fillStyle = 'rgba(255,255,255,1)'; g.beginPath(); g.ellipse(-11, 8, 6, 11, -0.35, 0, TAU); g.fill();
  });
  cell(F.STAR, g => {
    starPath(g, 0, 4, 48, 24); g.fillStyle = rg(0, 4, 50, [[0, '#ffffff'], [0.7, '#f4f0ea'], [1, '#d8d0d0']], -12, -10); g.fill();
    g.strokeStyle = INK; g.lineWidth = 7; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.ellipse(-12, -8, 7, 4, -0.6, 0, TAU); g.fill();
  });
  cell(F.SPARK, g => {
    g.fillStyle = rg(0, 0, 34, [[0, 'rgba(255,255,255,0.9)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(-64, -64, 128, 128);
    g.fillStyle = '#fff';
    for (const [w, h] of [[6, 58], [58, 6]]) { g.beginPath(); g.moveTo(-w, 0); g.quadraticCurveTo(0, 0, 0, -h); g.quadraticCurveTo(0, 0, w, 0); g.quadraticCurveTo(0, 0, 0, h); g.quadraticCurveTo(0, 0, -w, 0); g.fill(); }
  });
  cell(F.FEATHER, g => {
    g.rotate(-0.5);
    g.beginPath(); g.moveTo(0, -54); g.bezierCurveTo(26, -32, 24, 18, 4, 44); g.lineTo(-4, 44); g.bezierCurveTo(-24, 18, -26, -32, 0, -54); g.closePath();
    const lg = g.createLinearGradient(-20, -50, 20, 44); lg.addColorStop(0, '#ffffff'); lg.addColorStop(1, '#d8d4e0'); g.fillStyle = lg; g.fill();
    g.strokeStyle = 'rgba(150,140,165,0.45)'; g.lineWidth = 2;
    for (let y = -38; y < 34; y += 7) { g.beginPath(); g.moveTo(0, y); g.lineTo(17, y - 9); g.moveTo(0, y); g.lineTo(-17, y - 9); g.stroke(); }
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.moveTo(26, -6); g.lineTo(9, 0); g.lineTo(26, 6); g.fill();
    g.beginPath(); g.moveTo(-26, 12); g.lineTo(-10, 16); g.lineTo(-26, 22); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = '#a89cb8'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(0, -48); g.quadraticCurveTo(2, 10, 0, 56); g.stroke();
  });
  cell(F.BUBBLE, g => {
    g.fillStyle = rg(0, 0, 46, [[0, 'rgba(255,255,255,0.05)'], [0.8, 'rgba(255,255,255,0.18)'], [1, 'rgba(255,255,255,0.35)']]); g.beginPath(); g.arc(0, 0, 46, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 4.5; g.beginPath(); g.arc(0, 0, 45, 0, TAU); g.stroke();
    g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.beginPath(); g.arc(0, 0, 32, Math.PI * 1.08, Math.PI * 1.45); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(-8, -34, 5, 0, TAU); g.fill();
  });
  cell(F.CONFETTI, g => {
    g.beginPath(); g.roundRect(-34, -17, 68, 34, 7); const lg = g.createLinearGradient(0, -17, 0, 17); lg.addColorStop(0, '#ffffff'); lg.addColorStop(1, '#d8d8d8'); g.fillStyle = lg; g.fill();
    g.strokeStyle = 'rgba(60,40,60,0.55)'; g.lineWidth = 4; g.stroke();
  });
  cell(F.CRUMB, g => {
    g.beginPath(); const n = 8;
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU, r = 30 + ((i * 37) % 13); const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.8; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.closePath(); g.fillStyle = rg(0, 0, 44, [[0, '#ffffff'], [0.7, '#e8dccc'], [1, '#b8a48c']], -10, -10); g.fill();
    g.strokeStyle = 'rgba(90,50,40,0.8)'; g.lineWidth = 4; g.stroke();
    g.fillStyle = 'rgba(120,80,60,0.6)'; for (const [x, y] of [[-8, 4], [10, -6], [4, 12]]) { g.beginPath(); g.arc(x, y, 3.2, 0, TAU); g.fill(); }
  });
  cell(F.HEART, g => { heartPath(g, 0, 4, 44); g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = INK; g.lineWidth = 7; g.stroke(); g.fillStyle = 'rgba(255,255,255,1)'; g.beginPath(); g.ellipse(-16, -8, 7, 5, -0.6, 0, TAU); g.fill(); });
  cell(F.PAW, g => { g.shadowColor = 'rgba(255,255,255,0.9)'; g.shadowBlur = 10; pawPath(g, 0, 4, 50); g.fillStyle = '#ffffff'; g.fill(); });
  cell(F.FOAM, g => { // sea foam: a soft wash with little bubble rims in it
    g.fillStyle = rg(0, 0, 50, [[0, 'rgba(255,255,255,0.75)'], [0.6, 'rgba(255,255,255,0.4)'], [1, 'rgba(255,255,255,0)']]); g.beginPath(); g.arc(0, 0, 50, 0, TAU); g.fill();
    for (const [x, y, r] of [[-14, -8, 11], [10, -14, 8], [16, 8, 10], [-6, 14, 9], [0, -2, 7], [-24, 8, 6], [24, -4, 5], [4, 26, 5]]) { g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.strokeStyle = 'rgba(190,230,235,0.9)'; g.lineWidth = 2; g.stroke(); }
  });
  cell(F.DOT, g => { g.fillStyle = rg(0, 0, 50, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.85)'], [1, 'rgba(255,255,255,0)']]); g.beginPath(); g.arc(0, 0, 50, 0, TAU); g.fill(); });
  cell(F.KIBBLE, g => { g.rotate(-0.5); bonePath(g, 64, 11, 17); g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = INK; g.lineWidth = 6; g.stroke(); });
  cell(F.RING, g => { g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 16; g.beginPath(); g.arc(0, 0, 40, 0, TAU); g.stroke(); g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 40, 0, TAU); g.stroke(); });
  cell(F.STREAK, g => { const lg = g.createLinearGradient(-58, 0, 58, 0); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.7, 'rgba(255,255,255,0.9)'); lg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = lg; g.beginPath(); g.ellipse(0, 0, 58, 7, 0, 0, TAU); g.fill(); });
  cell(F.NOTE, g => {
    const note = () => { g.beginPath(); g.ellipse(-12, 26, 18, 13, -0.4, 0, TAU); g.rect(1, -44, 8, 70); g.moveTo(9, -44); g.quadraticCurveTo(40, -30, 30, -2); g.quadraticCurveTo(30, -20, 9, -24); };
    note(); g.strokeStyle = INK; g.lineWidth = 9; g.stroke(); note(); g.fillStyle = '#ffffff'; g.fill();
  });
  cell(F.GLOWSTAR, g => {
    g.fillStyle = rg(0, 0, 58, [[0, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(-64, -64, 128, 128);
    g.shadowColor = '#ffffff'; g.shadowBlur = 12; starPath(g, 0, 3, 40, 18); g.fillStyle = '#ffffff'; g.fill();
  });
  return (TEX.atlas = canvasTex(c));
}
// Paw rune glyph: ring of star ticks round a big paw print (additive, tinted gold / violet by the material)
function runeTex() {
  if (TEX.rune) return TEX.rune;
  const { c, g } = newCanvas(256); g.translate(128, 128);
  g.shadowColor = '#ffffff'; g.shadowBlur = 14;
  g.strokeStyle = '#ffffff'; g.lineWidth = 7; g.beginPath(); g.arc(0, 0, 112, 0, TAU); g.stroke();
  g.lineWidth = 3; g.globalAlpha = 0.8; g.beginPath(); g.arc(0, 0, 98, 0, TAU); g.stroke(); g.globalAlpha = 1;
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; g.save(); g.rotate(a); if (i % 3 === 0) { starPath(g, 0, -105, 11, 5); g.fillStyle = '#ffffff'; g.fill(); } else { g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, -105, 3.5, 0, TAU); g.fill(); } g.restore(); }
  g.globalAlpha = 0.25; g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, 0, 96, 0, TAU); g.fill(); g.globalAlpha = 1;
  pawPath(g, 0, 8, 78); g.fillStyle = '#ffffff'; g.fill();
  return (TEX.rune = canvasTex(c));
}
// Moonbeam ground pool: crescent + dotted ring
function moonTex() {
  if (TEX.moon) return TEX.moon;
  const { c, g } = newCanvas(256); g.translate(128, 128);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 120); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(-128, -128, 256, 256);
  g.shadowColor = '#ffffff'; g.shadowBlur = 10; g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 100, 0, TAU); g.stroke();
  for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; g.fillStyle = '#ffffff'; g.beginPath(); g.arc(Math.cos(a) * 86, Math.sin(a) * 86, i % 2 ? 2.5 : 4.5, 0, TAU); g.fill(); }
  g.beginPath(); g.arc(-8, 0, 46, 0.65, TAU - 0.65); g.arc(14, -6, 40, TAU - 1.0, 1.0, true); g.closePath(); g.fillStyle = '#ffffff'; g.fill();
  return (TEX.moon = canvasTex(c));
}
// Crater decal (normal blend): scorched rim, cracks and crumbs round a lighter dent
function craterTex() {
  if (TEX.crater) return TEX.crater;
  const { c, g } = newCanvas(256); g.translate(128, 128);
  const gr = g.createRadialGradient(0, 0, 10, 0, 0, 124);
  gr.addColorStop(0, 'rgba(90,55,40,0.55)'); gr.addColorStop(0.5, 'rgba(50,28,24,0.8)'); gr.addColorStop(0.72, 'rgba(40,22,20,0.75)'); gr.addColorStop(0.86, 'rgba(60,34,26,0.35)'); gr.addColorStop(1, 'rgba(60,34,26,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 124, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(30,14,12,0.85)'; g.lineWidth = 4;
  for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + 0.3; g.beginPath(); let r = 50; g.moveTo(Math.cos(a) * r, Math.sin(a) * r); for (let k = 0; k < 4; k++) { r += 14; const b = a + (k % 2 ? 0.12 : -0.1); g.lineTo(Math.cos(b) * r, Math.sin(b) * r); } g.stroke(); }
  g.fillStyle = 'rgba(210,150,90,0.9)'; for (let i = 0; i < 26; i++) { const a = i * 2.4, r = 70 + ((i * 29) % 45); g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, 3 + (i % 3) * 1.6, 0, TAU); g.fill(); }
  return (TEX.crater = canvasTex(c));
}
// Biscuit face: golden bake, darker toasted rim, docking holes and a pressed paw
function biscuitTex() {
  if (TEX.biscuit) return TEX.biscuit;
  const { c, g } = newCanvas(256, 128);
  const lg = g.createLinearGradient(0, 0, 0, 128); lg.addColorStop(0, '#f2c486'); lg.addColorStop(1, '#d89456'); g.fillStyle = lg; g.fillRect(0, 0, 256, 128);
  const vg = g.createRadialGradient(128, 64, 30, 128, 64, 150); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(120,50,20,0.45)'); g.fillStyle = vg; g.fillRect(0, 0, 256, 128);
  g.fillStyle = 'rgba(110,55,30,0.7)'; for (const x of [58, 84, 172, 198]) for (const y of [46, 82]) { g.beginPath(); g.arc(x, y, 5, 0, TAU); g.fill(); }
  g.fillStyle = 'rgba(150,80,40,0.55)'; pawPath(g, 128, 66, 26); g.fill();
  const r = (i) => ((i * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 160; i++) { g.fillStyle = r(i) > 0.5 ? 'rgba(255,230,180,0.25)' : 'rgba(140,70,30,0.2)'; g.fillRect(r(i * 3) * 256, r(i * 7) * 128, 2, 2); }
  return (TEX.biscuit = canvasTex(c));
}
function featherTex() {
  if (TEX.feather) return TEX.feather;
  const { c, g } = newCanvas(256, 96); g.translate(128, 48);
  g.beginPath(); g.moveTo(-118, 0); g.bezierCurveTo(-70, -40, 60, -38, 112, -6); g.lineTo(112, 6); g.bezierCurveTo(60, 38, -70, 40, -118, 0); g.closePath();
  const lg = g.createLinearGradient(-118, 0, 112, 0); lg.addColorStop(0, '#fff3d0'); lg.addColorStop(0.6, '#ffe0a0'); lg.addColorStop(1, '#ffffff'); g.fillStyle = lg; g.fill();
  g.strokeStyle = 'rgba(200,140,60,0.5)'; g.lineWidth = 2;
  for (let x = -90; x < 100; x += 10) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 12, -24); g.moveTo(x, 0); g.lineTo(x + 12, 24); g.stroke(); }
  g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.moveTo(10, -40); g.lineTo(22, -10); g.lineTo(34, -40); g.fill(); g.beginPath(); g.moveTo(-40, 40); g.lineTo(-28, 12); g.lineTo(-16, 40); g.fill();
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = '#c8904a'; g.lineWidth = 4; g.beginPath(); g.moveTo(-124, 0); g.quadraticCurveTo(0, 3, 116, 0); g.stroke();
  g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(-118, 0); g.bezierCurveTo(-70, -40, 60, -38, 112, -6); g.moveTo(-118, 0); g.bezierCurveTo(-70, 40, 60, 38, 112, 6); g.stroke();
  return (TEX.feather = canvasTex(c));
}
// Cartoon word pops ("SQUEAK!", "QUACK!") — thick ink outline, white inner rim, candy gradient fill
const WORD = new Map();
try { document.fonts?.load?.('bold 100px Fredoka'); } catch (e) { /* ignore */ }
function wordTex(word, a, b) {
  const key = word + a + b;
  if (WORD.has(key)) return WORD.get(key);
  const { c, g } = newCanvas(512, 200); g.translate(256, 104); g.rotate(-0.07);
  g.font = 'bold 116px Fredoka, "Baloo 2", "Arial Rounded MT Bold", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let w = g.measureText(word).width; const k = Math.min(1, 440 / w); g.scale(k, k);
  g.lineWidth = 28; g.strokeStyle = INK; g.strokeText(word, 0, 0);
  g.lineWidth = 12; g.strokeStyle = '#ffffff'; g.strokeText(word, 0, 0);
  const lg = g.createLinearGradient(0, -50, 0, 50); lg.addColorStop(0, a); lg.addColorStop(1, b); g.fillStyle = lg; g.fillText(word, 0, 0);
  g.globalAlpha = 0.55; g.fillStyle = '#ffffff'; g.fillText(word, -3, -5); g.globalAlpha = 1; g.fillStyle = lg; g.fillText(word, 0, 2);
  const t = canvasTex(c); WORD.set(key, t); return t;
}

// ================================================================== geometries (module-level, shared)
const GEO = {};
const geo = (k, make) => GEO[k] || (GEO[k] = make());
const G_PLANE = () => geo('plane', () => { const g = new THREE.PlaneGeometry(2, 2); g.rotateX(-Math.PI / 2); return g; });
const G_SPHERE = () => geo('sphere', () => new THREE.SphereGeometry(1, 28, 20));
const G_CYL = () => geo('cyl', () => new THREE.CylinderGeometry(1, 1, 1, 32, 3, true).translate(0, 0.5, 0));
function boneShape(len = 1.8, hw = 0.24, kr = 0.36) {
  const s = new THREE.Shape(), x1 = len / 2 - kr * 0.75, d = kr * 0.83;
  const nx = Math.sqrt(Math.max(0, kr * kr - d * d)); // notch where the knob circles meet
  const at = (cx, cy, x, y) => Math.atan2(y - cy, x - cx);
  s.moveTo(-x1, hw); s.lineTo(x1, hw);
  const jx = x1 + 0; // junction x on the shaft line
  s.absarc(x1, d, kr, at(x1, d, jx, hw) + TAU * 0, at(x1, d, x1 + nx, 0), true);
  s.absarc(x1, -d, kr, at(x1, -d, x1 + nx, 0), at(x1, -d, jx, -hw), true);
  s.lineTo(-x1, -hw);
  s.absarc(-x1, -d, kr, at(-x1, -d, -jx, -hw), at(-x1, -d, -x1 - nx, 0), true);
  s.absarc(-x1, d, kr, at(-x1, d, -x1 - nx, 0), at(-x1, d, -jx, hw), true);
  return s;
}
// bone biscuit (meteor, squeaky toy): extruded, uv remapped from the face so the biscuit texture covers it
const G_BONE = () => geo('bone', () => {
  const g = new THREE.ExtrudeGeometry(boneShape(), { depth: 0.42, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 3, curveSegments: 14 });
  g.center(); g.computeBoundingBox();
  const bb = g.boundingBox, p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (p.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
  return g;
});
const G_KIBBLE = () => geo('kibble', () => {
  const s = new THREE.Shape(), n = 5, r = 0.15, ri = 0.075;
  const pts = []; for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + (i * Math.PI) / n, q = i % 2 ? ri : r; pts.push(new THREE.Vector2(Math.cos(a) * q, -Math.sin(a) * q)); }
  s.moveTo((pts[9].x + pts[0].x) / 2, (pts[9].y + pts[0].y) / 2);
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; s.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2); }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelSegments: 2, curveSegments: 4 });
  g.center(); return g;
});
const G_FEATHER = () => geo('feather', () => { const g = new THREE.PlaneGeometry(0.62, 0.23); g.rotateX(-Math.PI / 2); g.rotateY(-Math.PI / 2); return g; }); // long axis along +z
// breaking wave sheet: u across (x −0.5..0.5), v up the profile from the back base to the curling lip (unit scale:
// ~1 high, ~2.6 deep; the mesh is scaled to width × height)
const G_WAVE = () => geo('wave', () => {
  const prof = new THREE.CatmullRomCurve3([[-1.0, 0], [-0.62, 0.2], [-0.3, 0.55], [0.0, 0.84], [0.34, 1.0], [0.74, 0.96], [1.0, 0.76], [0.98, 0.54], [0.8, 0.44]].map(([z, y]) => new THREE.Vector3(0, y, z)));
  const NU = 30, NV = 22, pos = [], uv = [], idx = [];
  for (let j = 0; j <= NV; j++) { const pp = prof.getPoint(j / NV); for (let i = 0; i <= NU; i++) { pos.push(i / NU - 0.5, pp.y, pp.z); uv.push(i / NU, j / NV); } }
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
});
// wind-up rubber duck (toon, vertex colours) + its brass key (separate so it can turn)
const G_DUCK = () => geo('duck', () => {
  const Y = '#ffd84a', Yd = '#ffc234', O = '#ff9a3a', K = '#2a1a22';
  const col = (g, c) => paint(g, (p, n, o) => o.set(c));
  const body = new THREE.SphereGeometry(0.26, 18, 14); body.scale(1.05, 0.78, 1.28); body.translate(0, 0.2, -0.02); col(body, Y);
  const tail = new THREE.ConeGeometry(0.09, 0.2, 10); tail.rotateX(-2.1); tail.translate(0, 0.32, -0.34); col(tail, Y);
  const head = new THREE.SphereGeometry(0.165, 18, 14); head.translate(0, 0.47, 0.16); col(head, Y);
  const beak = new THREE.SphereGeometry(0.08, 14, 10); beak.scale(1.25, 0.42, 1.35); beak.translate(0, 0.43, 0.31); col(beak, O);
  const wings = [-1, 1].map(s => { const w = new THREE.SphereGeometry(0.13, 12, 10); w.scale(0.32, 0.62, 1.0); w.rotateX(-0.25); w.translate(s * 0.25, 0.23, -0.04); return col(w, Yd); });
  const eyes = [-1, 1].flatMap(s => { const e = new THREE.SphereGeometry(0.03, 10, 8); e.translate(s * 0.075, 0.51, 0.285); const h = new THREE.SphereGeometry(0.011, 6, 5); h.translate(s * 0.075 - 0.01, 0.522, 0.31); return [col(e, K), col(h, '#ffffff')]; });
  const blush = [-1, 1].map(s => { const b = new THREE.SphereGeometry(0.032, 10, 6); b.scale(1, 0.55, 0.3); b.translate(s * 0.115, 0.455, 0.265); return col(b, '#ff9ab0'); });
  const feet = [-1, 1].map(s => { const f = new THREE.SphereGeometry(0.06, 10, 6); f.scale(1.1, 0.35, 1.5); f.translate(s * 0.1, 0.02, 0.14); return col(f, O); });
  const tuft = new THREE.ConeGeometry(0.025, 0.08, 6); tuft.rotateX(-0.4); tuft.translate(0, 0.65, 0.12); col(tuft, Y);
  return merge([body, tail, head, beak, ...wings, ...eyes, ...blush, ...feet, tuft]);
});
const G_KEY = () => geo('duckKey', () => {
  const B = '#e8b848', stem = new THREE.CylinderGeometry(0.018, 0.018, 0.12, 8); stem.rotateX(Math.PI / 2); stem.translate(0, 0, -0.06);
  const loops = [-1, 1].map(s => { const t = new THREE.TorusGeometry(0.048, 0.017, 8, 16); t.translate(s * 0.052, 0, -0.14); return t; });
  const nub = new THREE.SphereGeometry(0.028, 8, 6); nub.translate(0, 0, -0.13);
  return paint(merge([stem, ...loops, nub]), (p, n, o) => o.set(B));
});
// spectral golden retriever: one mesh, uv.x = part id (0 body, 1 head, 2/3 ears, 4 tail, 5-8 legs FL FR BL BR);
// the vertex shader moves each part with its own matrix (uPart[]), so the whole dog is one draw call
const RET_PIVOT = [[0, 0.46, 0], [0, 0.6, 0.24], [0.105, 0.78, 0.3], [-0.105, 0.78, 0.3], [0, 0.56, -0.3], [0.1, 0.4, 0.2], [-0.1, 0.4, 0.2], [0.1, 0.4, -0.2], [-0.1, 0.4, -0.2]].map(a => new THREE.Vector3(...a));
const G_RETRIEVER = () => geo('retriever', () => {
  const Au = '#ffc868', Lt = '#ffe6ae', K = '#281830', Pk = '#ff7ab0';
  const part = (g, id, c) => { if (typeof c === 'function') paint(g, c); else paint(g, (p, n, o) => o.set(c)); const uv = new Float32Array(g.attributes.position.count * 2); for (let i = 0; i < uv.length; i += 2) uv[i] = id; g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g; };
  const list = [];
  const body = new THREE.CapsuleGeometry(0.16, 0.42, 8, 16); body.rotateX(Math.PI / 2); body.scale(1, 1.02, 1); body.translate(0, 0.46, 0);
  list.push(part(body, 0, (p, n, o) => o.set(n.y < -0.4 ? Lt : Au)));
  const chest = new THREE.SphereGeometry(0.15, 14, 10); chest.scale(1, 1.1, 0.8); chest.translate(0, 0.44, 0.22); list.push(part(chest, 0, Lt));
  const bandana = new THREE.ConeGeometry(0.1, 0.12, 3); bandana.rotateX(Math.PI); bandana.scale(1.4, 1, 0.5); bandana.translate(0, 0.5, 0.33); list.push(part(bandana, 0, Pk));
  const head = new THREE.SphereGeometry(0.145, 18, 14); head.scale(1, 0.95, 1.05); head.translate(0, 0.72, 0.33); list.push(part(head, 1, Au));
  const snout = new THREE.SphereGeometry(0.085, 14, 10); snout.scale(0.95, 0.75, 1.35); snout.translate(0, 0.67, 0.46); list.push(part(snout, 1, Lt));
  const nose = new THREE.SphereGeometry(0.032, 10, 8); nose.scale(1.2, 0.85, 1); nose.translate(0, 0.7, 0.56); list.push(part(nose, 1, K));
  for (const s of [-1, 1]) { const e = new THREE.SphereGeometry(0.024, 10, 8); e.translate(s * 0.058, 0.76, 0.445); list.push(part(e, 1, K)); }
  const tongue = new THREE.SphereGeometry(0.03, 8, 6); tongue.scale(1, 0.4, 1.4); tongue.translate(0, 0.61, 0.5); list.push(part(tongue, 1, '#ff8aa0'));
  for (const [s, id] of [[1, 2], [-1, 3]]) { const ear = new THREE.SphereGeometry(0.075, 12, 10); ear.scale(0.45, 1.25, 0.85); ear.translate(s * 0.13, 0.69, 0.3); list.push(part(ear, id, Au)); }
  const tail = new THREE.SphereGeometry(0.07, 12, 10); tail.scale(0.8, 0.8, 3.2); tail.rotateX(0.75); tail.translate(0, 0.66, -0.47); list.push(part(tail, 4, Au));
  RET_PIVOT.slice(5).forEach((pv, k) => { const l = new THREE.CapsuleGeometry(0.05, 0.28, 4, 10); l.translate(pv.x, 0.19, pv.z); list.push(part(l, 5 + k, (p, n, o) => o.set(p.y < 0.07 ? Lt : Au))); });
  return merge(list);
});
// spectral mallard: uv.x = 1 on the wings (the shader flaps them), 0 on the body
const G_MALLARD = () => geo('mallard', () => {
  const part = (g, wing, c) => { paint(g, (p, n, o) => o.set(c)); const uv = new Float32Array(g.attributes.position.count * 2); for (let i = 0; i < uv.length; i += 2) uv[i] = wing; g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g; };
  const body = new THREE.SphereGeometry(0.2, 14, 10); body.scale(0.95, 0.8, 1.55); const head = new THREE.SphereGeometry(0.12, 12, 10); head.translate(0, 0.1, 0.3);
  const ring = new THREE.TorusGeometry(0.075, 0.018, 6, 14); ring.rotateX(Math.PI / 2 - 0.5); ring.translate(0, 0.04, 0.24);
  const beak = new THREE.SphereGeometry(0.05, 8, 6); beak.scale(1, 0.45, 1.8); beak.translate(0, 0.08, 0.43);
  const tail = new THREE.ConeGeometry(0.06, 0.14, 6); tail.rotateX(-Math.PI / 2 - 0.3); tail.translate(0, 0.04, -0.33);
  const wings = [-1, 1].map(s => { const w = new THREE.SphereGeometry(0.2, 12, 8); w.scale(1.55, 0.14, 0.62); w.translate(s * 0.34, 0.06, -0.02); return part(w, 1, '#c8f0ff'); });
  return merge([part(body, 0, '#a8e8e0'), part(head, 0, '#5ad890'), part(ring, 0, '#ffffff'), part(beak, 0, '#ffd23a'), part(tail, 0, '#e8fff8'), ...wings]);
});

// ================================================================== shaders
const VS_UV = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const VS_UVXZ = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const NOISE = /* glsl */`
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }`;
// ground ripple: three rings chasing outward, a wet sheen inside the first, bright crest lines
const FS_RIPPLE = /* glsl */`uniform float uK, uA; uniform vec3 uCol; varying vec2 vUv;
void main(){
  vec2 q = vUv * 2.0 - 1.0; float r = length(q); if (r > 1.0) discard;
  float a = 0.0, hi = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i), kk = clamp((uK - fi * 0.17) / (1.0 - fi * 0.17), 0.0, 1.0);
    float rr = 0.1 + 0.9 * (1.0 - (1.0 - kk) * (1.0 - kk));
    float w = 0.03 + 0.05 * kk, live = step(0.001, kk) * (1.0 - kk);
    a += smoothstep(w, 0.0, abs(r - rr)) * live * (1.0 - fi * 0.3);
    hi += smoothstep(w * 0.45, 0.0, abs(r - rr + w * 0.35)) * live;
  }
  float k0 = clamp(uK * 1.2, 0.0, 1.0);
  a += (1.0 - smoothstep(0.0, 0.1 + 0.9 * k0, r)) * 0.22 * (1.0 - k0);
  vec3 c = mix(uCol, vec3(1.25, 1.3, 1.3), clamp(hi, 0.0, 1.0));
  gl_FragColor = vec4(c, clamp(a, 0.0, 1.0) * uA);
}`;
// splash crown: an open cylinder that shoots up, flares out and tears into spiky droplet tips
const VS_CROWN = /* glsl */`uniform float uK, uSeed; varying vec2 vUv;
void main(){
  vUv = uv; vec3 p = position; float k = uK;
  float grow = 1.0 - pow(1.0 - clamp(k * 2.2, 0.0, 1.0), 3.0);
  float h = grow * (1.0 - smoothstep(0.5, 1.0, k) * 0.6) * (0.8 + 0.2 * sin(uv.x * 6.2831 * 5.0 + uSeed));
  p.y *= h;
  float rr = (0.4 + 0.75 * k) * (1.0 + p.y * (0.7 + 1.1 * k));
  p.xz *= rr;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const FS_CROWN = /* glsl */`uniform float uK, uA, uSeed; uniform vec3 uCol; varying vec2 vUv;
${NOISE}
void main(){
  float lobe = abs(sin(vUv.x * 3.14159265 * 11.0 + uSeed));
  float edge = 0.42 + 0.58 * pow(lobe, 0.55);
  float top = vUv.y / edge; if (top > 1.0) discard;
  float n = vnoise(vUv * vec2(26.0, 6.0) + uSeed), dis = smoothstep(0.45, 1.0, uK);
  float keep = smoothstep(dis - 0.08, dis + 0.08, n * 0.9 + 0.1 * (1.0 - top));
  if (keep < 0.01) discard;
  vec3 c = mix(uCol, vec3(1.3, 1.35, 1.35), smoothstep(0.5, 0.95, top));
  float a = uA * (0.3 + 0.7 * smoothstep(0.0, 0.55, top)) * keep;
  gl_FragColor = vec4(c, a);
}`;
// glossy water orb: fresnel rim, drifting caustics, a crisp view-space highlight, wobbly surface
const VS_ORB = /* glsl */`uniform float uT; varying vec3 vN, vV, vO;
void main(){
  vec3 p = position; float t = uT * 1.0;
  p += normal * (sin(t * 11.0 + p.y * 7.0) * 0.055 + sin(t * 8.0 + p.x * 9.0 + 1.3) * 0.045);
  vec4 mv = modelViewMatrix * vec4(p, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; vO = position;
  gl_Position = projectionMatrix * mv;
}`;
const FS_ORB = /* glsl */`uniform float uT, uA; uniform vec3 uCol, uDeep; varying vec3 vN, vV, vO;
void main(){
  vec3 N = normalize(vN), V = normalize(vV); float ndv = clamp(dot(N, V), 0.0, 1.0), fr = pow(1.0 - ndv, 2.2);
  vec3 c = mix(uDeep, uCol, 0.35 + 0.55 * fr);
  float ca = sin(vO.x * 13.0 + uT * 5.0) * sin(vO.y * 12.0 - uT * 4.0) * sin(vO.z * 11.0 + uT * 3.0);
  c += smoothstep(0.3, 0.9, ca) * 0.55 * uCol;
  float sp = smoothstep(0.9, 0.975, dot(N, normalize(vec3(-0.45, 0.6, 0.66))));
  float sp2 = smoothstep(0.95, 0.99, dot(N, normalize(vec3(0.5, -0.5, 0.7)))) * 0.5;
  c += (sp + sp2) * 1.8 + fr * vec3(0.7, 1.0, 1.0) * 0.9;
  gl_FragColor = vec4(c * 1.15, uA * (0.72 + 0.28 * fr) + sp * 0.3);
}`;
// wet-dog-shake spray disk: spiral arms of droplets racing out behind an expanding front
const FS_SPRAY = /* glsl */`uniform float uK, uA, uT; uniform vec3 uCol; varying vec2 vUv;
void main(){
  vec2 q = vUv * 2.0 - 1.0; float r = length(q); if (r > 1.0) discard;
  float a = atan(q.y, q.x), k = uK;
  float front = 0.2 + 0.8 * (1.0 - (1.0 - k) * (1.0 - k)), wob = 0.035 * sin(a * 11.0 + uT * 7.0);
  float arm = pow(0.5 + 0.5 * sin(a * 6.0 + r * 9.0 - uT * 24.0), 7.0);               // curved arms trailing the spin
  float u = (a + r * 1.6 - uT * 4.0) * 12.0, v = r * 15.0;                               // droplet speckle riding them
  float h = fract(sin(dot(floor(vec2(u, v)), vec2(12.9898, 78.233))) * 43758.5453);
  float dotm = step(0.68, h) * smoothstep(0.34, 0.12, length(fract(vec2(u, v)) - 0.5));
  float band = smoothstep(front + 0.03, front - 0.14, r) * smoothstep(0.08, front * 0.55, r);
  float edge = smoothstep(0.045, 0.0, abs(r - front - wob));
  float fade = 1.0 - smoothstep(0.55, 1.0, k);
  float alpha = (arm * 0.55 * band + dotm * band + edge * 0.85) * uA * fade;
  vec3 c = mix(uCol, vec3(1.3, 1.35, 1.35), clamp(edge + dotm * 0.8, 0.0, 1.0));
  gl_FragColor = vec4(c, clamp(alpha, 0.0, 1.0));
}`;
// soap bubble: thin-film iridescence on the fresnel rim, two window highlights, jiggles when hit
const VS_BUBBLE = /* glsl */`uniform float uT, uJ; varying vec3 vN, vV, vO;
void main(){
  vec3 p = position;
  float j = uJ * (sin(p.y * 9.0 + uT * 30.0) * 0.5 + sin(p.x * 7.0 - uT * 25.0) * 0.5) * 0.07;
  p += normal * (j + sin(p.y * 4.0 + uT * 2.6) * 0.015 + sin(p.x * 5.0 - uT * 2.1) * 0.012);
  vec4 mv = modelViewMatrix * vec4(p, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; vO = position;
  gl_Position = projectionMatrix * mv;
}`;
const FS_BUBBLE = /* glsl */`uniform float uT, uA; varying vec3 vN, vV, vO;
void main(){
  vec3 N = normalize(vN), V = normalize(vV); float ndv = clamp(dot(N, V), 0.0, 1.0), fr = pow(1.0 - ndv, 2.5);
  float th = ndv * 2.3 + vO.y * 0.9 + sin(vO.x * 3.0 + uT * 1.4) * 0.3 + uT * 0.22;
  vec3 irid = 0.55 + 0.45 * cos(6.2831853 * (th + vec3(0.0, 0.33, 0.67)));
  vec3 c = mix(vec3(0.78, 0.97, 1.0), irid, 0.7);
  float s1 = smoothstep(0.93, 0.985, dot(N, normalize(vec3(-0.45, 0.62, 0.64))));
  float s2 = smoothstep(0.965, 0.99, dot(N, normalize(vec3(0.52, -0.42, 0.74)))) * 0.6;
  float a = uA * (0.07 + fr * 0.78) + (s1 * 0.85 + s2 * 0.5) * uA;
  gl_FragColor = vec4(c * 1.15 + (s1 + s2) * 1.4, clamp(a, 0.0, 1.0));
}`;
// puddle: a wobbly-edged pool with a sheen and slow ripple lines
const FS_PUDDLE = /* glsl */`uniform float uT, uA, uK; uniform vec3 uCol, uDeep; varying vec2 vUv;
${NOISE}
void main(){
  vec2 q = vUv * 2.0 - 1.0; float r = length(q), a = atan(q.y, q.x);
  float edge = 0.86 + 0.08 * sin(a * 5.0 + 1.3) + 0.05 * sin(a * 9.0 - 0.7);
  float R = edge * uK; if (r > R) discard;
  float x = r / max(R, 1e-3);
  vec3 c = mix(uDeep, uCol, 0.35 + 0.65 * x);
  float rip = smoothstep(0.12, 0.0, abs(fract(x * 3.0 - uT * 1.2) - 0.5) - 0.38);
  c += rip * 0.25 + smoothstep(0.82, 1.0, x) * 0.5;
  float sheen = smoothstep(0.6, 1.0, vnoise(q * 3.0 + vec2(uT * 0.3, 0.0))) * (1.0 - x) * 0.5;
  c += sheen;
  gl_FragColor = vec4(c, uA * (0.72 + 0.28 * smoothstep(0.85, 1.0, x)));
}`;
// whirlpool: three log-spiral arms churning inward, a dark eye, foam crests and a bright rim
const FS_VORTEX = /* glsl */`uniform float uT, uA; uniform vec3 uCol, uDeep; varying vec2 vUv;
void main(){
  vec2 q = vUv * 2.0 - 1.0; float r = length(q); if (r > 1.0) discard;
  float a = atan(q.y, q.x), lr = log(r + 0.03);
  float arm = 0.5 + 0.5 * sin(a * 3.0 + lr * 4.5 + uT * 5.5);
  float fine = 0.5 + 0.5 * sin(a * 8.0 + lr * 11.0 + uT * 9.0);
  float foam = smoothstep(0.7, 0.96, arm) * (0.45 + 0.55 * fine);
  float depth = smoothstep(0.9, 0.05, r);
  vec3 c = mix(uCol, uDeep, depth * 0.85);
  c = mix(c, vec3(0.01, 0.07, 0.12), smoothstep(0.2, 0.0, r));
  c += foam * vec3(0.95, 1.05, 1.05) * (0.35 + 0.65 * (1.0 - depth * 0.7));
  float rim = smoothstep(0.07, 0.0, abs(r - 0.9));
  c = mix(c, vec3(1.2, 1.25, 1.25), rim * 0.85);
  float alpha = uA * (smoothstep(1.0, 0.86, r) * 0.86 + rim * 0.25);
  gl_FragColor = vec4(c, clamp(alpha, 0.0, 1.0));
}`;
// whirlpool rim wall / funnel: streaks spinning round an open cylinder, fading to the top
const FS_WALL = /* glsl */`uniform float uT, uA; uniform vec3 uCol; varying vec2 vUv;
void main(){
  float s = 0.5 + 0.5 * sin(vUv.x * 6.2831853 * 9.0 + vUv.y * 5.0 + uT * 9.0);
  float s2 = 0.5 + 0.5 * sin(vUv.x * 6.2831853 * 23.0 - vUv.y * 3.0 + uT * 13.0);
  float fade = smoothstep(1.0, 0.25, vUv.y) * smoothstep(0.0, 0.12, vUv.y);
  float a = uA * fade * (0.25 + 0.55 * smoothstep(0.55, 1.0, s) + 0.3 * smoothstep(0.7, 1.0, s2));
  vec3 c = mix(uCol, vec3(1.25), smoothstep(0.6, 1.0, s) * 0.7);
  gl_FragColor = vec4(c, a);
}`;
// the Great Wave: deep teal base → aqua → glassy light near the crest, a torn foam lip, streaks flowing up the face
const VS_WAVE = /* glsl */`uniform float uT, uH; varying vec2 vUv; varying vec3 vN, vV;
void main(){
  vUv = uv; vec3 p = position;
  float endT = 1.0 - pow(abs(uv.x * 2.0 - 1.0), 1.7);
  p.y *= uH * (0.12 + 0.88 * max(endT, 0.0));
  p.z *= 0.55 + 0.45 * uH;
  p.y += (sin(uv.x * 19.0 + uT * 4.0) * 0.035 + sin(uv.x * 7.0 - uT * 2.3) * 0.06) * uv.y * uH;
  p.z += sin(uv.x * 12.0 - uT * 3.0) * 0.07 * uv.y + (1.0 - endT) * 0.35 * uv.y;
  vec4 mv = modelViewMatrix * vec4(p, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
const FS_WAVE = /* glsl */`uniform float uT, uA; uniform vec3 uDeep, uMid, uLight; varying vec2 vUv; varying vec3 vN, vV;
${NOISE}
void main(){
  float v = vUv.y;
  vec3 c = mix(uDeep, uMid, smoothstep(0.0, 0.5, v));
  c = mix(c, uLight, smoothstep(0.42, 0.72, v));
  float n = vnoise(vec2(vUv.x * 26.0, v * 7.0 - uT * 2.6)) * 0.6 + vnoise(vec2(vUv.x * 64.0, v * 18.0 - uT * 4.2)) * 0.4;
  float line = 0.8 + 0.07 * vnoise(vec2(vUv.x * 12.0, uT * 0.8));
  float foam = smoothstep(line - 0.04, line + 0.02, v + n * 0.12) * (0.55 + 0.45 * smoothstep(0.35, 0.7, n));
  float fleck = smoothstep(0.78, 0.9, vnoise(vec2(vUv.x * 60.0, v * 30.0 - uT * 3.0))) * smoothstep(0.45, 0.75, v);
  float cap = 0.0;
  float streak = smoothstep(0.6, 0.92, vnoise(vec2(vUv.x * 48.0, v * 2.5 - uT * 1.9))) * smoothstep(0.08, 0.55, v) * 0.4;
  float bands = smoothstep(0.75, 1.0, sin(v * 38.0 - uT * 6.0 + vnoise(vec2(vUv.x * 9.0, 0.0)) * 5.0)) * smoothstep(0.1, 0.5, v) * (1.0 - foam) * 0.18;
  c += streak + bands;
  c = mix(c, vec3(1.22, 1.28, 1.28), max(max(foam, cap), fleck * 0.8));
  vec3 N = normalize(vN), V = normalize(vV); float fr = pow(1.0 - abs(dot(N, V)), 2.0);
  c += fr * 0.3 * uLight;
  float ends = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
  float a = uA * mix(mix(0.45, 0.88, smoothstep(0.25, 0.6, v)), 1.0, foam) * smoothstep(0.0, 0.32, v) * mix(0.35, 1.0, ends);
  gl_FragColor = vec4(c, a);
}`;
// the water sheet the Great Wave drags over the floor behind its crest: foam streaks racing forward, fading behind
const FS_SURGE = /* glsl */`uniform float uT, uA, uLen; uniform vec3 uCol, uDeep; varying vec2 vUv;
${NOISE}
void main(){
  float along = vUv.y, across = abs(vUv.x - 0.5) * 2.0;
  float n = vnoise(vec2(vUv.x * 18.0, along * uLen * 1.4 - uT * 7.0)) * 0.65 + vnoise(vec2(vUv.x * 40.0, along * uLen * 3.0 - uT * 11.0)) * 0.35;
  float foam = smoothstep(0.58, 0.8, n) * (0.4 + 0.6 * along);
  vec3 c = mix(uDeep, uCol, 0.35 + 0.5 * along + 0.15 * n);
  c = mix(c, vec3(1.2, 1.25, 1.25), foam);
  float edge = 1.0 - smoothstep(0.7, 1.0, across + 0.15 * (vnoise(vec2(along * 9.0, uT)) - 0.5));
  float a = uA * edge * smoothstep(0.0, 0.55, along) * smoothstep(1.0, 0.8, along) * (0.55 + 0.35 * foam);
  gl_FragColor = vec4(c, a);
}`;
// moonbeam cylinder: soft volumetric sides, streaks sliding down, bright foot, fades out high up
const VS_BEAM = /* glsl */`varying vec2 vUv; varying vec3 vN, vV;
void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
const FS_BEAM = /* glsl */`uniform float uT, uA; uniform vec3 uCol; varying vec2 vUv; varying vec3 vN, vV;
void main(){
  float ndv = abs(dot(normalize(vN), normalize(vV))), core = pow(ndv, 1.6);
  float st = 0.55 + 0.45 * sin(vUv.x * 6.2831853 * 5.0 + sin(vUv.y * 7.0 + uT * 1.7) * 1.4);
  float flow = 0.62 + 0.38 * sin(vUv.y * 34.0 + uT * 11.0 + vUv.x * 12.0);
  float fy = smoothstep(1.0, 0.35, vUv.y) * (0.75 + 0.25 * smoothstep(0.0, 0.05, vUv.y)) + smoothstep(0.12, 0.0, vUv.y) * 0.6;
  float a = uA * core * fy * (0.45 + 0.55 * st * flow);
  gl_FragColor = vec4(uCol * (1.0 + core * 0.9), a);
}`;
// camera-facing ribbon (constellation lines, leash): position = points, aT tangent, aS side ±1, aU along 0..1
const VS_RIBBON = /* glsl */`attribute vec3 aT; attribute float aS; attribute float aU; uniform float uW; varying float vS, vU;
void main(){
  vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz, view = normalize(cameraPosition - wp);
  vec3 side = cross(aT, view); float l = length(side); side = l > 1e-4 ? side / l : vec3(1.0, 0.0, 0.0);
  wp += side * aS * uW; vS = aS; vU = aU;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const FS_RIBBON = /* glsl */`uniform float uT, uA, uStyle, uLen; uniform vec3 uCol, uCore; varying float vS, vU;
void main(){
  float x = abs(vS);
  if (uStyle < 0.5) { // starlight chain: white core, violet glow, sparkles running along it
    float core = exp(-x * x * 16.0), glow = exp(-x * x * 2.6);
    float s = pow(0.5 + 0.5 * sin(vU * uLen * 2.6 - uT * 14.0), 12.0);
    vec3 c = uCol * glow + uCore * (core * 1.2 + s * glow);
    gl_FragColor = vec4(c, uA * clamp(glow * 0.75 + core, 0.0, 1.0));
  } else { // leash: a glowing braided rope with an ink edge (normal blend, reads on any floor)
    if (x > 0.98) discard;
    float braid = 0.5 + 0.5 * sin(vU * uLen * 16.0 + vS * 2.8);
    vec3 c = mix(uCol, uCore, braid * 0.55 + (1.0 - x) * 0.35);
    c = mix(c, vec3(0.22, 0.12, 0.2), smoothstep(0.7, 0.9, x));
    gl_FragColor = vec4(c * 1.2, uA);
  }
}`;
// duck-call lure: candy rings sliding inward toward the lure point
const FS_LURE = /* glsl */`uniform float uT, uA; uniform vec3 uCol, uCol2; varying vec2 vUv;
void main(){
  vec2 q = vUv * 2.0 - 1.0; float r = length(q); if (r > 1.0) discard;
  float ph = r * 3.2 + uT * 2.4, f = fract(ph);
  float ring = smoothstep(0.1, 0.02, abs(f - 0.5) - 0.07);
  vec3 c = mod(floor(ph), 2.0) < 1.0 ? uCol : uCol2;
  float edge = smoothstep(1.0, 0.82, r) * smoothstep(0.03, 0.18, r);
  float rim = smoothstep(0.045, 0.0, abs(r - 0.94)), ink = smoothstep(0.03, 0.0, abs(r - 0.985));
  vec3 col = mix(c * 1.15, vec3(1.25), rim * 0.7); col = mix(col, vec3(0.23, 0.14, 0.2), ink);
  gl_FragColor = vec4(col, uA * clamp(ring * 0.5 * edge * (0.4 + 0.6 * r) + rim + ink * 0.8, 0.0, 1.0));
}`;
// candy-stripe cartoon shock ring with an ink contour (Squeaky Nova, rune eruptions, meteor)
const FS_SHOCK = /* glsl */`uniform float uK, uA, uW; uniform vec3 uCol, uCol2; varying vec2 vUv;
void main(){
  vec2 q = vUv * 2.0 - 1.0; float r = length(q);
  float R = 0.12 + 0.88 * (1.0 - pow(1.0 - uK, 3.0)), w = uW * (1.0 - 0.55 * uK);
  float d = abs(r - R); if (d > w) discard;
  float ink = smoothstep(w - 0.02, w, d), hl = smoothstep(0.4 * w, 0.0, abs(r - R + w * 0.35));
  vec3 c = mix(uCol, uCol2, step(0.5, fract(atan(q.y, q.x) * 1.9098593)));
  c = mix(c, vec3(1.3), hl * 0.65); c = mix(c, vec3(0.23, 0.14, 0.25), ink);
  gl_FragColor = vec4(c, uA * (1.0 - smoothstep(0.65, 1.0, uK)));
}`;
// spectral creatures (Spirit Retriever: per-part matrices; mallards: instanced, flapping wings)
const FS_SPECTRAL = /* glsl */`uniform float uT, uA; uniform vec3 uCol, uRim; varying vec3 vN, vV, vC; varying float vY;
void main(){
  vec3 N = normalize(vN), V = normalize(vV); float ndv = clamp(dot(N, V), 0.0, 1.0), fr = pow(1.0 - ndv, 2.2);
  float flow = smoothstep(0.8, 1.0, 0.5 + 0.5 * sin(vY * 16.0 - uT * 5.0)) * 0.22;
  float feat = 1.0 - smoothstep(0.08, 0.2, max(vC.r, max(vC.g, vC.b)));
  vec3 c = uCol * vC * (0.8 + 0.4 * ndv) + uRim * (fr * 1.35 + flow);
  c = mix(c, vec3(0.08, 0.04, 0.14), feat * 0.9);
  float a = uA * (0.3 + 0.62 * fr + flow);
  gl_FragColor = vec4(c, clamp(max(a, feat * uA * 0.95), 0.0, 1.0));
}`;
const VS_RETRIEVER = /* glsl */`uniform mat4 uPart[9]; varying vec3 vN, vV, vC; varying float vY;
void main(){
  mat4 M = uPart[int(uv.x + 0.5)];
  vec4 lp = M * vec4(position, 1.0);
  vec4 mv = modelViewMatrix * lp; vN = normalize(normalMatrix * (mat3(M) * normal)); vV = -mv.xyz; vC = color; vY = lp.y;
  gl_Position = projectionMatrix * mv;
}`;
const VS_MALLARD = /* glsl */`uniform float uT; attribute float iPhase; varying vec3 vN, vV, vC; varying float vY;
void main(){
  vec3 p = position, n = normal;
  if (uv.x > 0.5) {
    float s = p.x > 0.0 ? 1.0 : -1.0, ang = (sin(uT * 17.0 + iPhase) * 0.9 + 0.15) * s;
    float c0 = cos(ang), s0 = sin(ang); vec2 xy = vec2(p.x, p.y - 0.05);
    p.xy = vec2(xy.x * c0 - xy.y * s0, xy.x * s0 + xy.y * c0) + vec2(0.0, 0.05);
    n.xy = vec2(n.x * c0 - n.y * s0, n.x * s0 + n.y * c0);
  }
  vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vec4 mv = viewMatrix * wp; vN = normalize(mat3(viewMatrix) * mat3(modelMatrix) * mat3(instanceMatrix) * n); vV = -mv.xyz; vC = color; vY = p.y + p.z;
  gl_Position = projectionMatrix * mv;
}`;

const SHADER_OPTS = { transparent: true, depthWrite: false, toneMapped: false, fog: false };
const shader = (vs, fs, uniforms, o = {}) => new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms, ...SHADER_OPTS, ...o });

// ================================================================== the effect system
let GAME = null;
/** mokaSpells/skillRunner hand over the game context (used to decide whether Moka's shaders are worth prewarming) */
export function setSpellGame(G) { GAME = G; }
const mokaAround = () => { const st = GAME?.state; return !!(st && (st.activeHero === 'moka' || st.flags?.mokaJoined || st.player?.cls === 'moka')); };

export class SpellFX {
  constructor(vfx) {
    this.vfx = vfx; this.scene = vfx.scene; this.engine = vfx.engine;
    this.active = []; this.pools = new Map(); this.shared = new Map();
    this.uT = { value: 0 }; this.t = 0;
    this._pa = null; this._pn = null; this.acc = {};
  }
  // ------------------------------------------------------------------ particles (created on first use)
  get pa() {
    if (!this._pa) {
      const L = this._pa = new ParticleLayer(this.scene, atlasTex(), { additive: true, max: 1600, order: 13, grid: 4 });
      const raw = L.spawn.bind(L), vfx = this.vfx;
      L.spawn = o => { if (vfx.dampers.length && !vfx._undamped) { const k = vfx.dampAt(o.x, o.y, o.z); if (k < 1) { o.alpha = (o.alpha ?? 1) * k; if (o.size != null) o.size *= 0.55 + 0.45 * k; } } return raw(o); };
    }
    return this._pa;
  }
  get pn() { return this._pn || (this._pn = new ParticleLayer(this.scene, atlasTex(), { additive: false, max: 1600, order: 12, grid: 4 })); }
  /** rate-limited emitter: how many to spawn this frame for `rate`/s (fractional carry per key) */
  emit(key, rate, dt) { const a = (this.acc[key] || 0) + rate * dt; const n = Math.floor(a); this.acc[key] = a - n; return n; }
  // ------------------------------------------------------------------ pools & shared materials
  take(kind, make) {
    let P = this.pools.get(kind); if (!P) this.pools.set(kind, P = []);
    const o = P.pop() || this.adopt(make());
    o.visible = true; return o;
  }
  adopt(o) { o.frustumCulled = false; o.traverse?.(c => { c.frustumCulled = false; }); this.scene.add(o); return o; }
  give(kind, o) { if (!o) return; o.visible = false; this.pools.get(kind)?.push(o); }
  mat(key, make) { let m = this.shared.get(key); if (!m) this.shared.set(key, m = make()); return m; }
  /** run fn(dt, t) every frame until it returns false; end() is called once when it finishes or the world is cleared */
  run(update, end) { const f = { update, end, t: 0, done: false }; this.active.push(f); return f; }
  update(dt) {
    const cam = this.engine.camera;
    cam.matrixWorld.extractBasis(CAM_R, CAM_U, CAM_F);
    this.t += dt; this.uT.value = this.t;
    const A = this.active;
    for (let i = 0; i < A.length; i++) {
      const f = A[i]; f.t += dt;
      let keep = false;
      try { keep = f.update(dt, f.t) !== false; } catch (e) { console.warn('[spellFx]', e); }
      if (!keep) { f.done = true; try { f.end?.(); } catch (e) { console.warn('[spellFx]', e); } A[i] = A[A.length - 1]; A.pop(); i--; }
    }
    if (this._pa) this._pa.update(dt, cam);
    if (this._pn) this._pn.update(dt, cam);
  }
  clear() {
    for (const f of this.active) { f.done = true; try { f.end?.(); } catch (e) { /* ignore */ } }
    this.active.length = 0;
    this._pa?.clear(); this._pn?.clear();
  }
  // ------------------------------------------------------------------ materials (per SpellFX)
  mRipple() { return shader(VS_UV, FS_RIPPLE, { uK: { value: 0 }, uA: { value: 1 }, uCol: { value: PAL.aqua.clone() } }); }
  mCrown() { return shader(VS_CROWN, FS_CROWN, { uK: { value: 0 }, uA: { value: 1 }, uSeed: { value: 0 }, uCol: { value: PAL.aqua.clone() } }, { side: THREE.DoubleSide }); }
  mOrb() { return this.mat('orb', () => shader(VS_ORB, FS_ORB, { uT: this.uT, uA: { value: 0.92 }, uCol: { value: C('#9ff6ff') }, uDeep: { value: C('#1a8fb0') } })); }
  mSpray() { return shader(VS_UV, FS_SPRAY, { uK: { value: 0 }, uA: { value: 1 }, uT: this.uT, uCol: { value: PAL.aqua.clone() } }, { side: THREE.DoubleSide }); }
  mBubble() { return shader(VS_BUBBLE, FS_BUBBLE, { uT: this.uT, uJ: { value: 0 }, uA: { value: 0 } }); }
  mPuddle() { return shader(VS_UV, FS_PUDDLE, { uT: this.uT, uA: { value: 0 }, uK: { value: 0 }, uCol: { value: C('#7ee8f0') }, uDeep: { value: C('#2a90b0') } }); }
  mVortex() { return shader(VS_UV, FS_VORTEX, { uT: this.uT, uA: { value: 0 }, uCol: { value: C('#4fd8e0') }, uDeep: { value: C('#0e5a78') } }); }
  mWall() { return shader(VS_UV, FS_WALL, { uT: this.uT, uA: { value: 0 }, uCol: { value: C('#a8f4ff') } }, { side: THREE.DoubleSide }); }
  mWave() { return shader(VS_WAVE, FS_WAVE, { uT: this.uT, uA: { value: 0 }, uH: { value: 0 }, uDeep: { value: C('#11708e') }, uMid: { value: C('#35c4d6') }, uLight: { value: C('#b4fff4') } }, { side: THREE.DoubleSide }); }
  mBeam(core) { return shader(VS_BEAM, FS_BEAM, { uT: this.uT, uA: { value: 0 }, uCol: { value: core ? C('#fffaf0') : C('#b8b8ff') } }, { side: THREE.DoubleSide, blending: THREE.AdditiveBlending }); }
  mRibbon(style) { return shader(VS_RIBBON, FS_RIBBON, { uT: this.uT, uA: { value: 0 }, uW: { value: 0.1 }, uStyle: { value: style }, uLen: { value: 5 }, uCol: { value: style ? C('#ffb04a') : C('#9a7aff') }, uCore: { value: style ? C('#fff2b0') : C('#fff8e0') } }, style ? {} : { blending: THREE.AdditiveBlending }); }
  mSurge() { return shader(VS_UV, FS_SURGE, { uT: this.uT, uA: { value: 0 }, uLen: { value: 8 }, uCol: { value: C('#5ad8e4') }, uDeep: { value: C('#1a86a4') } }); }
  mLure() { return shader(VS_UV, FS_LURE, { uT: this.uT, uA: { value: 0 }, uCol: { value: C('#ffb04a') }, uCol2: { value: C('#8fd068') } }); }
  mShock() { return shader(VS_UV, FS_SHOCK, { uK: { value: 0 }, uA: { value: 1 }, uW: { value: 0.12 }, uCol: { value: C('#ffb0dc') }, uCol2: { value: C('#fff2a0') } }); }
  mGlyph(tex) { return new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2 }); }
  mDecal(tex) { return new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 }); }
  mHalo(color, op = 0.6) { return new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }); }
  mSpectral(vs, col, rim, instanced) { return shader(vs, FS_SPECTRAL, { uT: this.uT, uA: { value: 0 }, uCol: { value: C(col) }, uRim: { value: C(rim) }, ...(instanced ? {} : { uPart: { value: RET_PIVOT.map(() => new THREE.Matrix4()) } }) }, { vertexColors: true }); }
  // ------------------------------------------------------------------ small building blocks
  p(layer, o) { return layer === 'a' ? this.pa.spawn(o) : this.pn.spawn(o); }
  sparkBurst(pos, { n = 10, color = PAL.star, speed = 4, size = 0.3, life = 0.5, up = 1, frame = F.SPARK, grav = 4, layer = 'a' } = {}) {
    for (let i = 0; i < n; i++) { const a = rand(0, TAU), s = rand(0.4, 1) * speed; this.p(layer, { frame, x: pos.x, y: pos.y, z: pos.z, vx: Math.cos(a) * s, vy: rand(0.3, 1.2) * up * s * 0.6, vz: Math.sin(a) * s, life: rand(0.6, 1) * life, size: size * rand(0.7, 1.25), size1: size * 0.2, color, alpha: 1, alpha1: 0, drag: 2.5, grav, spin: rand(-6, 6) }); }
  }
  droplets(pos, { n = 12, speed = 3.5, up = 4.5, size = 0.16, life = 0.65, spread = 0.2, colors = [PAL.aqua, PAL.foam, PAL.sea] } = {}) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(0.35, 1) * speed;
      this.pn.spawn({ frame: F.DROP, x: pos.x + Math.cos(a) * spread, y: pos.y + rand(0, 0.2), z: pos.z + Math.sin(a) * spread, vx: Math.cos(a) * s, vy: rand(0.5, 1) * up, vz: Math.sin(a) * s, life: rand(0.6, 1) * life, size: size * rand(0.7, 1.3), size1: size * 0.55, color: colors[i % colors.length], alpha: 1, alpha1: 0.6, grav: 13, drag: 0.6, fn: dropFn });
    }
  }
  mist(pos, { n = 6, color = PAL.foam, size = 0.55, r = 0.4, alpha = 0.45 } = {}) {
    for (let i = 0; i < n; i++) this.vfx.smoke.spawn({ x: pos.x + rand(-r, r), y: pos.y + rand(0, 0.3), z: pos.z + rand(-r, r), vx: rand(-0.6, 0.6), vy: rand(0.3, 0.9), vz: rand(-0.6, 0.6), life: rand(0.5, 0.9), size, size1: size * 2, color, alpha, alpha1: 0, drag: 2 });
  }
  castFlash(pos, color = PAL.sea, size = 1) {
    this.pa.spawn({ frame: F.GLOWSTAR, x: pos.x, y: pos.y, z: pos.z, life: 0.28, size: 0.9 * size, size1: 0.2, color, alpha: 1, alpha1: 0, spin: 4 });
    this.pa.spawn({ frame: F.DOT, x: pos.x, y: pos.y, z: pos.z, life: 0.22, size: 1.1 * size, size1: 1.8 * size, color, alpha: 0.7, alpha1: 0 });
    this.sparkBurst(pos, { n: 6, color, speed: 3, size: 0.22 * size, life: 0.35 });
  }
  /** sparkles spiralling into a point (spell wind-up at the staff) */
  charge(getPos, color = PAL.sea, dur = 0.35, n = 14) {
    const P = getPos(_a).clone();
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), r = rand(0.6, 1.1), y = rand(-0.4, 0.5), life = dur * rand(0.7, 1);
      const q = this.pa.spawn({ frame: i % 3 ? F.SPARK : F.GLOWSTAR, x: P.x, y: P.y, z: P.z, life, size: rand(0.16, 0.3), size1: 0.06, color, alpha: 0.2, alpha1: 1, fn: (q, dt, k) => { const pp = getPos(_d), rr = r * (1 - k), aa = a + k * 4; q.x = pp.x + Math.cos(aa) * rr; q.y = pp.y + y * (1 - k); q.z = pp.z + Math.sin(aa) * rr; } });
    }
  }
  /** floating cartoon word ("SQUEAK!", "QUACK!") */
  text(word, pos, { a = '#ffe08a', b = '#ff8fb0', size = 1.6, life = 0.9, rise = 0.9 } = {}) {
    const s = this.take('word', () => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false })); sp.renderOrder = 30; return sp; });
    s.material.map = wordTex(word, a, b); s.material.needsUpdate = true;
    const x = pos.x, y = pos.y, z = pos.z, tilt = rand(-0.12, 0.12);
    s.material.rotation = tilt;
    this.run((dt, t) => {
      const k = t / life, pop = t < 0.18 ? ease.outBack(t / 0.18) : 1, wob = 1 + Math.sin(t * 22) * 0.05 * Math.max(0, 1 - t * 2.5);
      s.scale.set(size * pop * wob * 1.25, size * 0.49 * pop / wob * 1.25, 1);
      s.position.set(x, y + rise * ease.outCubic(Math.min(1, k)), z);
      s.material.opacity = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      return k < 1;
    }, () => this.give('word', s));
  }
  /** ground ripple rings */
  ripple(pos, { r = 1.8, life = 0.9, color = PAL.aqua, alpha = 0.95, y = 0.04 } = {}) {
    const m = this.take('ripple', () => { const o = new THREE.Mesh(G_PLANE(), this.mRipple()); o.renderOrder = 9; return o; });
    m.position.set(pos.x, (pos.y || 0) + y, pos.z); m.scale.setScalar(r); m.material.uniforms.uCol.value.copy(color);
    const U = m.material.uniforms;
    this.run((dt, t) => { U.uK.value = t / life; U.uA.value = alpha; return t < life; }, () => this.give('ripple', m));
  }
  shock(pos, { r = 3, life = 0.45, w = 0.13, a = '#ffb0dc', b = '#fff2a0', y = 0.1 } = {}) {
    const m = this.take('shock', () => { const o = new THREE.Mesh(G_PLANE(), this.mShock()); o.renderOrder = 10; return o; });
    m.position.set(pos.x, (pos.y || 0) + y, pos.z); m.scale.setScalar(r);
    const U = m.material.uniforms; U.uCol.value.set(a); U.uCol2.value.set(b); U.uW.value = w / Math.max(1, r * 0.33);
    this.run((dt, t) => { U.uK.value = Math.min(1, t / life); return t < life; }, () => this.give('shock', m));
  }

  // ================================================================== WATER
  orbMesh() {
    const g = new THREE.Group();
    const orb = new THREE.Mesh(G_SPHERE(), this.mOrb()); orb.scale.setScalar(0.3); orb.renderOrder = 11; g.add(orb);
    const halo = new THREE.Sprite(this.mat('haloSea', () => this.mHalo(PAL.sea, 0.42))); halo.scale.setScalar(0.95); g.add(halo);
    return g;
  }
  trailOrb(pr, dt) {
    const p = pr.pos;
    for (let i = this.emit('orb', 70, dt); i > 0; i--) this.pn.spawn({ frame: F.DROP, x: p.x + rand(-0.08, 0.08), y: p.y + rand(-0.08, 0.08), z: p.z + rand(-0.08, 0.08), vx: -pr.dir.x * 1.5 + rand(-0.6, 0.6), vy: rand(0.2, 1.4), vz: -pr.dir.z * 1.5 + rand(-0.6, 0.6), life: rand(0.25, 0.45), size: rand(0.1, 0.19), size1: 0.05, color: i % 2 ? PAL.aqua : PAL.foam, alpha: 0.95, alpha1: 0.3, grav: 9, fn: dropFn });
    for (let i = this.emit('orbG', 50, dt); i > 0; i--) this.vfx.glow.spawn({ x: p.x, y: p.y, z: p.z, life: 0.3, size: 0.42, size1: 0.05, color: PAL.sea, alpha: 0.55, alpha1: 0 });
    if (Math.random() < dt * 8) this.pn.spawn({ frame: F.BUBBLE, x: p.x, y: p.y, z: p.z, vy: 0.8, vx: rand(-0.4, 0.4), vz: rand(-0.4, 0.4), life: 0.5, size: rand(0.1, 0.18), size1: 0.14, color: PAL.foam, alpha: 0.9, alpha1: 0 });
  }
  /** a splash: crown, ripples, droplets, mist. r ≈ splash radius */
  splash(pos, { r = 1.2, big = false, color = PAL.aqua } = {}) {
    const m = this.take('crown', () => { const o = new THREE.Mesh(G_CYL(), this.mCrown()); o.renderOrder = 11; return o; });
    const life = big ? 0.7 : 0.55, U = m.material.uniforms;
    m.position.set(pos.x, (pos.y || 0) + 0.02, pos.z); m.scale.set(r * 0.85, r * (big ? 1.5 : 1.15), r * 0.85); m.rotation.y = rand(0, TAU);
    U.uSeed.value = rand(0, 100); U.uCol.value.copy(color);
    this.run((dt, t) => { U.uK.value = t / life; U.uA.value = 0.95; return t < life; }, () => this.give('crown', m));
    this.ripple(pos, { r: r * (big ? 1.7 : 1.45), life: big ? 1.1 : 0.85, color });
    const n = big ? 30 : 18;
    this.pa.spawn({ frame: F.DOT, x: pos.x, y: (pos.y || 0) + 0.5, z: pos.z, life: 0.16, size: r * 1.3, size1: r * 2.4, color: PAL.foam, alpha: 0.75, alpha1: 0 });
    this.droplets(_a.set(pos.x, (pos.y || 0) + 0.15, pos.z), { n, speed: 2.6 * r, up: big ? 6 : 4.5, size: big ? 0.2 : 0.15, spread: r * 0.35 });
    this.mist(pos, { n: big ? 8 : 4, r: r * 0.5 });
    this.sparkBurst(_a.set(pos.x, (pos.y || 0) + 0.4, pos.z), { n: big ? 8 : 4, color: PAL.foam, speed: 3, size: 0.26, life: 0.4 });
    this.vfx.light(_a.set(pos.x, (pos.y || 0) + 0.6, pos.z), '#7ff0ff', big ? 6 : 3.5, big ? 6 : 4, 0.25);
  }
  /** Wet Dog Shake: spinning spray disk + spiral droplet streams flung off the body */
  shakeSpray(pos, r = 3.2) {
    const m = this.take('spray', () => { const o = new THREE.Mesh(G_PLANE(), this.mSpray()); o.renderOrder = 11; return o; });
    const U = m.material.uniforms, life = 0.55, cx = pos.x, cz = pos.z, y0 = pos.y || 0;
    m.position.set(cx, y0 + 0.35, cz); m.scale.setScalar(r * 0.98); m.rotation.y = 0;
    this.run((dt, t) => { U.uK.value = t / life; m.rotation.y -= dt * 7; return t < life; }, () => this.give('spray', m));
    const spin = rand(0, TAU);
    this.run((dt, t) => { // 0.3 s of spiral streams
      const n = this.emit('shake', 330, dt);
      for (let i = 0; i < n; i++) {
        const a = spin + t * 22 + rand(-0.5, 0.5) + (i % 3) * (TAU / 3), s = rand(5.5, 9) * r / 3.2;
        const rx = Math.cos(a), rz = Math.sin(a), tx = -rz, tz = rx; // radial + tangential (spiral)
        const h = rand(0.35, 0.95);
        this.pn.spawn({ frame: i % 5 === 0 ? F.FOAM : F.DROP, x: cx + rx * 0.3, y: y0 + h, z: cz + rz * 0.3, vx: rx * s + tx * s * 0.55, vy: rand(0.6, 2.4), vz: rz * s + tz * s * 0.55, life: rand(0.35, 0.55), size: i % 5 === 0 ? rand(0.28, 0.42) : rand(0.16, 0.28), size1: 0.08, color: i % 4 === 0 ? PAL.foam : i % 4 === 1 ? PAL.sea : PAL.aqua, alpha: 1, alpha1: 0.5, drag: 1.4, grav: 7, fn: i % 5 === 0 ? null : dropFn });
      }
      if (Math.random() < 0.5) { const a = rand(0, TAU); this.pa.spawn({ frame: F.STREAK, x: cx + Math.cos(a) * 0.45, y: y0 + rand(0.4, 1.0), z: cz + Math.sin(a) * 0.45, vx: Math.cos(a) * 3, vz: Math.sin(a) * 3, life: 0.18, size: 0.5, size1: 0.2, color: PAL.foam, alpha: 0.9, alpha1: 0, fn: streakFn }); }
      return t < 0.3;
    });
    this.ripple(pos, { r: r * 1.1, life: 0.8 });
    this.mist(_a.set(cx, y0 + 0.3, cz), { n: 8, r: 0.6, size: 0.7, alpha: 0.35 });
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; this.pa.spawn({ frame: F.SPARK, x: cx + Math.cos(a) * r * 0.5, y: y0 + 0.4, z: cz + Math.sin(a) * r * 0.5, vx: Math.cos(a) * r * 1.6, vz: Math.sin(a) * r * 1.6, vy: 0.5, life: 0.4, size: 0.32, size1: 0.05, color: PAL.ice, alpha: 1, alpha1: 0, drag: 3, spin: 5 }); }
    this.vfx.light(_a.set(cx, y0 + 0.8, cz), '#8ff0ff', 7, r * 2, 0.3);
  }
  /** Bubble Barrier around a moving actor. handle: hit(), pop(), end() */
  bubble(getPos) {
    const m = this.take('bubble', () => { const o = new THREE.Mesh(G_SPHERE(), this.mBubble()); o.renderOrder = 14; return o; });
    const U = m.material.uniforms, H = { alive: true, jig: 0, popT: -1 };
    const R = 0.92;
    this.run((dt, t) => {
      const p = getPos(_a); m.position.set(p.x, p.y + 0.66, p.z);
      H.jig = Math.max(0, H.jig - dt * 3); U.uJ.value = H.jig;
      if (H.popT >= 0) {
        H.popT += dt; const k = H.popT / 0.14;
        m.scale.setScalar(R * (1 + 0.35 * k)); U.uA.value = Math.max(0, 1 - k);
        return k < 1;
      }
      const inK = Math.min(1, t / 0.22);
      m.scale.set(R * ease.outBack(inK) * (1 + Math.sin(t * 5) * 0.02), R * ease.outBack(inK) * (1 - Math.sin(t * 5) * 0.02), R * ease.outBack(inK));
      U.uA.value = inK;
      if (Math.random() < dt * 3) this.pn.spawn({ frame: F.BUBBLE, x: p.x + rand(-0.5, 0.5), y: p.y + rand(0.1, 0.6), z: p.z + rand(-0.5, 0.5), vy: 0.7, life: 0.9, size: rand(0.08, 0.15), size1: 0.12, color: PAL.foam, alpha: 0.9, alpha1: 0 });
      return H.alive;
    }, () => { H.alive = false; this.give('bubble', m); });
    H.hit = () => {
      H.jig = 1;
      const p = m.position, a = rand(0, TAU);
      this.droplets(_b.set(p.x + Math.cos(a) * R * 0.8, p.y + rand(-0.2, 0.4), p.z + Math.sin(a) * R * 0.8), { n: 5, speed: 2, up: 2, size: 0.12, spread: 0.05 });
    };
    H.pop = () => {
      if (H.popT >= 0 || !H.alive) return;
      H.popT = 0;
      const p = m.position;
      _b.set(p.x, p.y - 0.66, p.z);
      this.splash(_b, { r: 1.5, big: true });
      this.droplets(_c.set(p.x, p.y, p.z), { n: 30, speed: 5, up: 3, size: 0.17, spread: R * 0.9 });
      for (let i = 0; i < 12; i++) { const a = rand(0, TAU), s = rand(1, 3); this.pn.spawn({ frame: F.BUBBLE, x: p.x, y: p.y + rand(-0.3, 0.3), z: p.z, vx: Math.cos(a) * s, vy: rand(0.5, 2), vz: Math.sin(a) * s, life: rand(0.6, 1), size: rand(0.12, 0.26), size1: 0.18, color: PAL.foam, alpha: 1, alpha1: 0, drag: 2.5 }); }
      this.pa.spawn({ frame: F.RING, x: p.x, y: p.y, z: p.z, life: 0.25, size: 1.6, size1: 3.6, color: PAL.aqua, alpha: 1, alpha1: 0 });
    };
    H.end = () => { H.alive = false; };
    return H;
  }
  /** a puddle on the floor (Puddle Hop). handle.end() drains it */
  puddle(pos, { r = 0.9, life = 1.2 } = {}) {
    const m = this.take('puddle', () => { const o = new THREE.Mesh(G_PLANE(), this.mPuddle()); o.renderOrder = 8; return o; });
    m.position.set(pos.x, (pos.y || 0) + 0.035, pos.z); m.scale.setScalar(r); m.rotation.y = rand(0, TAU);
    const U = m.material.uniforms;
    this.run((dt, t) => { U.uK.value = t < 0.18 ? ease.outBack(t / 0.18) : t > life - 0.35 ? Math.max(0, (life - t) / 0.35) : 1; U.uA.value = 0.9; return t < life; }, () => this.give('puddle', m));
  }
  /** Whirlpool: churning disk + spinning rim wall + spiral spray. handle.end() closes it early */
  whirlpool(pos, r, dur) {
    const disk = this.take('vortex', () => { const o = new THREE.Mesh(G_PLANE(), this.mVortex()); o.renderOrder = 8; return o; });
    const wall = this.take('vwall', () => { const o = new THREE.Mesh(G_CYL(), this.mWall()); o.renderOrder = 10; return o; });
    const cx = pos.x, cz = pos.z, y0 = pos.y || 0, UD = disk.material.uniforms, UW = wall.material.uniforms;
    disk.position.set(cx, y0 + 0.035, cz); wall.position.set(cx, y0, cz);
    const light = this.vfx.lightPool?.addSource({ pos: new THREE.Vector3(cx, y0 + 0.8, cz), color: new THREE.Color('#5ce0e0'), intensity: 3.5, radius: r * 2.2, priority: 3 });
    const H = { alive: true, pos: new THREE.Vector3(cx, y0, cz), r };
    this.run((dt, t) => {
      const tin = Math.min(1, t / 0.35), tout = Math.max(0, Math.min(1, (dur - t) / 0.4)), vis = Math.min(tin, tout);
      const s = r * (0.35 + 0.65 * ease.outBack(tin)) * (0.6 + 0.4 * tout);
      disk.scale.setScalar(s); disk.rotation.y -= dt * 0.8;
      wall.scale.set(s * 0.93, 0.42 + 0.12 * Math.sin(t * 3), s * 0.93); wall.rotation.y -= dt * 2.4;
      UD.uA.value = vis; UW.uA.value = vis * 0.9;
      if (light) light.intensity = 3.5 * vis;
      // spiral spray drawn in toward the eye
      for (let i = this.emit('whirl', 55 * vis, dt); i > 0; i--) {
        const a0 = rand(0, TAU), r0 = s * rand(0.55, 0.98), y = y0 + rand(0.05, 0.35), foam = Math.random() < 0.45;
        this.pn.spawn({ frame: foam ? F.FOAM : F.DROP, x: cx, y, z: cz, life: rand(0.6, 1.0), size: foam ? rand(0.2, 0.34) : rand(0.1, 0.16), size1: 0.05, color: foam ? PAL.foam : PAL.aqua, alpha: 0.95, alpha1: 0.2,
          fn: (q, dt2, k) => { const rr = r0 * (1 - k * 0.85), aa = a0 - k * (3.5 + 2 / Math.max(0.3, rr)); q.x = cx + Math.cos(aa) * rr; q.z = cz + Math.sin(aa) * rr; q.y = y + Math.sin(k * 3.1) * 0.25; q.rot = -aa; } });
      }
      if (Math.random() < dt * 10 * vis) this.pa.spawn({ frame: F.SPARK, x: cx + rand(-s, s) * 0.6, y: y0 + 0.2, z: cz + rand(-s, s) * 0.6, vy: 0.8, life: 0.6, size: 0.24, size1: 0.02, color: PAL.ice, alpha: 1, alpha1: 0 });
      return H.alive && t < dur;
    }, () => { H.alive = false; this.give('vortex', disk); this.give('vwall', wall); if (light) this.vfx.lightPool?.removeSource(light); });
    H.end = () => { H.alive = false; };
    return H;
  }
  /** The Great Wave. Returns a handle whose .front (m from origin) and .pos track the crest for the gameplay sweep. */
  greatWave(origin, dir, { length = 13, width = 5.5, speed = 11, height = 2.9 } = {}) {
    const m = this.take('wave', () => { const o = new THREE.Mesh(G_WAVE(), this.mWave()); o.renderOrder = 11; return o; });
    const sg = this.take('surge', () => { const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); g.rotateY(Math.PI); g.translate(0, 0, 0.5); const o = new THREE.Mesh(g, this.mSurge()); o.renderOrder = 8; return o; });
    const US = sg.material.uniforms;
    const U = m.material.uniforms, yaw = Math.atan2(dir.x, dir.z);
    const px = dir.z, pz = -dir.x; // across the wave
    m.rotation.set(0, yaw, 0);
    const rise = 0.32, travel = length / speed, fall = 0.4, life = rise + travel + fall;
    const H = { alive: true, front: 0.8, pos: new THREE.Vector3(), dir: dir.clone(), width, t: 0, life, fallAt: -1 };
    H.stop = () => { if (H.fallAt < 0) H.fallAt = H.t; }; // crash early (a wall)
    const light = this.vfx.lightPool?.addSource({ pos: new THREE.Vector3(), color: new THREE.Color('#6ae8f0'), intensity: 5, radius: width * 1.6, priority: 4 });
    this.run((dt, t) => {
      H.t = t;
      const kr = Math.min(1, t / rise), kf = Math.min(1, Math.max(0, H.fallAt >= 0 ? (t - H.fallAt) / fall : (t - rise - travel) / fall));
      if (H.fallAt < 0 || t - H.fallAt < 0.12) H.front = Math.min(H.front + (t > rise * 0.55 ? speed * dt : 0), length + 0.6);
      const h = height * (kf > 0 ? 1 - ease.inQuad(kf) * 0.9 : ease.outBack(kr));
      H.pos.set(origin.x + dir.x * H.front, origin.y || 0, origin.z + dir.z * H.front);
      m.position.set(H.pos.x - dir.x * 1.0, H.pos.y, H.pos.z - dir.z * 1.0);
      m.scale.set(width, height, height * 0.95);
      U.uH.value = h / height; U.uA.value = Math.min(1, t / 0.12) * (1 - kf * 0.8);
      // the surge sheet: from just behind Moka's start to the foot of the wave
      const back = Math.max(0.5, H.front + 0.6);
      sg.position.set(origin.x, (origin.y || 0) + 0.04, origin.z); sg.rotation.set(0, yaw, 0); sg.scale.set(width * 1.02, 1, back);
      US.uLen.value = back; US.uA.value = Math.min(1, t / 0.2) * (1 - ease.inQuad(kf)) * 0.95;
      if (light) { light.pos.set(H.pos.x, 1.4, H.pos.z); light.intensity = 5 * (1 - kf); }
      const hh = h, cz = 0.55 * hh; // crest ≈ 0.9·h up, a little in front of the mesh origin
      // crest foam spray flung forward
      for (let i = this.emit('waveCrest', 240 * (1 - kf), dt); i > 0; i--) {
        const u = rand(-0.5, 0.5) * width * (0.9 - Math.abs(rand(-0.3, 0.3)));
        const x = m.position.x + px * u + dir.x * cz, z = m.position.z + pz * u + dir.z * cz, y = H.pos.y + hh * rand(0.8, 1.0) * (1 - Math.pow(Math.abs(u / width) * 2, 2.2) * 0.6);
        const f = rand(2, 5.5);
        this.pn.spawn({ frame: i % 3 ? F.FOAM : F.DROP, x, y, z, vx: dir.x * f + rand(-0.8, 0.8), vy: rand(0.5, 3), vz: dir.z * f + rand(-0.8, 0.8), life: rand(0.3, 0.5), size: i % 3 ? rand(0.2, 0.36) : rand(0.13, 0.2), size1: 0.08, color: i % 4 ? PAL.foam : PAL.aqua, alpha: 1, alpha1: 0.2, grav: 9, drag: 0.8, fn: i % 3 ? null : dropFn });
      }
      // spindrift: fine spray blown back off the lip, glinting
      for (let i = this.emit('waveDrift', 90 * (1 - kf), dt); i > 0; i--) {
        const u = rand(-0.45, 0.45) * width;
        this.pa.spawn({ frame: i % 4 ? F.DOT : F.SPARK, x: m.position.x + px * u + dir.x * cz * 0.8, y: H.pos.y + hh * rand(0.9, 1.05), z: m.position.z + pz * u + dir.z * cz * 0.8, vx: -dir.x * rand(1.5, 4), vy: rand(1.2, 3.2), vz: -dir.z * rand(1.5, 4), life: rand(0.3, 0.55), size: i % 4 ? rand(0.12, 0.26) : rand(0.2, 0.32), size1: 0.3, color: PAL.foam, alpha: 0.55, alpha1: 0, drag: 2.5, grav: 3 });
      }
      // foam left on the floor behind it
      for (let i = this.emit('waveTrail', 45 * (1 - kf), dt); i > 0; i--) {
        const u = rand(-0.5, 0.5) * width, back = rand(0.4, 1.6);
        this.pn.spawn({ frame: F.FOAM, x: H.pos.x + px * u - dir.x * back, y: H.pos.y + 0.06, z: H.pos.z + pz * u - dir.z * back, life: rand(0.4, 0.7), size: rand(0.22, 0.42), size1: 0.45, color: i % 3 ? PAL.foam : PAL.sea, alpha: 0.4, alpha1: 0, spin: rand(-0.5, 0.5) });
      }
      // droplets at the churning foot
      for (let i = this.emit('waveFoot', 60 * (1 - kf), dt); i > 0; i--) {
        const u = rand(-0.5, 0.5) * width;
        this.pn.spawn({ frame: F.DROP, x: H.pos.x + px * u + dir.x * 0.4, y: H.pos.y + 0.2, z: H.pos.z + pz * u + dir.z * 0.4, vx: dir.x * rand(3, 6), vy: rand(2, 4.5), vz: dir.z * rand(3, 6), life: rand(0.4, 0.6), size: rand(0.12, 0.2), size1: 0.06, color: PAL.aqua, alpha: 1, alpha1: 0.4, grav: 12, fn: dropFn });
      }
      if (kf > 0 && !H.crashed) { H.crashed = true; for (let i = 0; i < 5; i++) { const u = (i / 4 - 0.5) * width * 0.8; this.splash(_b.set(H.pos.x + px * u, H.pos.y, H.pos.z + pz * u), { r: 1.4, big: true }); } }
      return kf < 1;
    }, () => { H.alive = false; this.give('wave', m); this.give('surge', sg); if (light) this.vfx.lightPool?.removeSource(light); });
    return H;
  }

  // ================================================================== STARLIGHT
  boltMesh() {
    const g = new THREE.Group();
    const a = new THREE.Sprite(this.mat('haloBolt', () => this.mHalo(C('#7ff0e0'), 0.85))); a.scale.setScalar(0.85); g.add(a);
    const b = new THREE.Sprite(this.mat('haloCore', () => this.mHalo(C('#ffffff'), 1))); b.scale.setScalar(0.34); g.add(b);
    return g;
  }
  trailBolt(pr, dt) {
    const p = pr.pos;
    for (let i = this.emit('bolt', 60, dt); i > 0; i--) this.pa.spawn({ frame: i % 4 ? F.SPARK : F.GLOWSTAR, x: p.x + rand(-0.06, 0.06), y: p.y + rand(-0.06, 0.06), z: p.z + rand(-0.06, 0.06), vx: rand(-0.4, 0.4), vy: rand(-0.2, 0.5), vz: rand(-0.4, 0.4), life: rand(0.2, 0.38), size: rand(0.16, 0.28), size1: 0.02, color: i % 3 ? PAL.sea : PAL.lilac, alpha: 1, alpha1: 0, spin: rand(-6, 6) });
  }
  kibbleMesh() {
    const g = new THREE.Group();
    const k = new THREE.Mesh(G_KIBBLE(), this.mat('kibble', () => makeToon({ color: '#ffd46a', emissive: '#ffb030', emissiveIntensity: 0.75, rim: 0.8, brush: 0.05, objectBrush: true }))); k.castShadow = false; k.scale.setScalar(1.4); g.add(k);
    const h = new THREE.Sprite(this.mat('haloKibble', () => this.mHalo(C('#ffcf6a'), 0.45))); h.scale.setScalar(0.95); g.add(h);
    return g;
  }
  trailKibble(pr, dt) {
    const p = pr.pos;
    for (let i = this.emit('kib' + (pr._id ||= Math.random()), 45, dt); i > 0; i--) this.pa.spawn({ frame: i % 3 ? F.SPARK : F.GLOWSTAR, x: p.x, y: p.y, z: p.z, vx: rand(-0.5, 0.5), vy: rand(-0.3, 0.4), vz: rand(-0.5, 0.5), life: rand(0.3, 0.5), size: rand(0.14, 0.26), size1: 0.02, color: i % 2 ? PAL.gold : PAL.violet, alpha: 1, alpha1: 0, spin: rand(-5, 5), drag: 2 });
  }
  starBurst(pos, { r = 1, n = 10, color = PAL.gold, color2 = PAL.violet, ink = true } = {}) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(2, 4.5) * r;
      if (ink && i % 2 === 0) this.pn.spawn({ frame: F.STAR, x: pos.x, y: pos.y, z: pos.z, vx: Math.cos(a) * s, vy: rand(1.5, 4) * r, vz: Math.sin(a) * s, life: rand(0.45, 0.7), size: rand(0.22, 0.34) * Math.sqrt(r), size1: 0.06, color: i % 4 ? color : color2, alpha: 1, alpha1: 0.8, grav: 8, drag: 2, spin: rand(-7, 7) });
      else this.pa.spawn({ frame: F.GLOWSTAR, x: pos.x, y: pos.y, z: pos.z, vx: Math.cos(a) * s * 1.2, vy: rand(0.5, 3) * r, vz: Math.sin(a) * s * 1.2, life: rand(0.35, 0.55), size: rand(0.25, 0.4) * Math.sqrt(r), size1: 0.04, color: i % 3 ? color : color2, alpha: 1, alpha1: 0, drag: 3, spin: rand(-5, 5) });
    }
    this.pa.spawn({ frame: F.DOT, x: pos.x, y: pos.y, z: pos.z, life: 0.2, size: 0.9 * r, size1: 2 * r, color, alpha: 0.8, alpha1: 0 });
    this.pa.spawn({ frame: F.RING, x: pos.x, y: pos.y, z: pos.z, life: 0.26, size: 0.5 * r, size1: 2.4 * r, color: color2, alpha: 0.9, alpha1: 0 });
  }
  /** dizzy stars circling a stunned entity's head (one set per entity; re-stuns extend it) */
  dizzy(e, dur = 1) {
    if (!e || !e.pos) return;
    const now = this.t, rec = e._dizzy;
    if (rec && rec.until > now + 0.05 && rec.fx === this) { rec.until = Math.max(rec.until, now + dur); return; }
    const R = e._dizzy = { until: now + dur, fx: this };
    const h = (e.height || 1) * (e.def?.boss ? 1 : 1.05) + 0.25, rr = Math.max(0.3, (e.bodyR || e.radius || 0.35) * 0.8);
    for (let i = 0; i < 3; i++) {
      this.pn.spawn({ frame: F.STAR, x: e.pos.x, y: e.pos.y + h, z: e.pos.z, life: 30, size: 0.24, size1: 0.24, color: i === 1 ? PAL.pink : PAL.duck, alpha: 1, alpha1: 1,
        fn: (q) => { const T = this.t; if (!e.alive || T > R.until || e._dizzy !== R) { q.t = q.life; return; } const a = T * 5.5 + (i * TAU) / 3; q.x = e.pos.x + Math.cos(a) * rr; q.z = e.pos.z + Math.sin(a) * rr; q.y = e.pos.y + h + Math.sin(a * 2) * 0.06; q.rot = T * 3; const fade = Math.min(1, (R.until - T) * 4); q.a0 = q.a1 = fade; } });
    }
  }
  /** a small chill cue on a slowed foe */
  chill(e) { if (!e?.pos) return; for (let i = 0; i < 4; i++) this.pa.spawn({ frame: F.SPARK, x: e.pos.x + rand(-0.3, 0.3), y: e.pos.y + rand(0.2, (e.height || 1)), z: e.pos.z + rand(-0.3, 0.3), vy: 0.4, life: 0.6, size: rand(0.18, 0.28), size1: 0.02, color: PAL.ice, alpha: 1, alpha1: 0, spin: 3 }); }
  /** Squeaky Nova: a pink squeaky bone squeezed overhead, a candy shock ring, SQUEAK!, stars */
  squeak(pos, r, headY = 1.9) {
    const toy = this.take('squeakToy', () => new THREE.Mesh(G_BONE(), this.mat('squeakMat', () => makeToon({ color: '#ff9ccc', emissive: '#ff6aa8', emissiveIntensity: 0.25, rim: 0.6, brush: 0.06, objectBrush: true }))));
    const x = pos.x, y = (pos.y || 0) + headY, z = pos.z;
    toy.castShadow = false;
    this.run((dt, t) => {
      const pop = Math.min(1, t / 0.12), sq = t > 0.1 && t < 0.3 ? Math.sin((t - 0.1) / 0.2 * Math.PI) : 0, out = Math.max(0, (t - 0.45) / 0.2);
      const s = 0.32 * ease.outBack(pop) * (1 - out);
      toy.position.set(x, y + t * 0.3, z); toy.rotation.set(0.3, t * 2, Math.sin(t * 18) * 0.15);
      toy.scale.set(s * (1 + sq * 0.45), s * (1 - sq * 0.5), s * (1 + sq * 0.2));
      return t < 0.65;
    }, () => this.give('squeakToy', toy));
    this.run((dt, t) => {
      if (t < 0.16) return true;
      this.shock(pos, { r: r * 1.05, life: 0.42, w: 0.16 });
      this.shock(pos, { r: r * 0.7, life: 0.34, w: 0.1, a: '#fff2a0', b: '#bfe8ff', y: 0.14 });
      this.vfx.dustRing(pos, r * 0.7, 14);
      this.text('SQUEAK!', _b.set(x, y + 0.5, z), { a: '#fff2a0', b: '#ff8fc8', size: 1.9 });
      for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, s = r * rand(2.2, 3.2); this.pn.spawn({ frame: i % 4 ? F.STAR : F.HEART, x, y: (pos.y || 0) + 0.6, z, vx: Math.cos(a) * s, vy: rand(0.8, 2.2), vz: Math.sin(a) * s, life: rand(0.4, 0.55), size: rand(0.24, 0.34), size1: 0.1, color: i % 3 === 0 ? PAL.pink : i % 3 === 1 ? PAL.duck : PAL.lilac, alpha: 1, alpha1: 0.6, drag: 3.2, grav: 3, spin: rand(-8, 8) }); }
      this.pa.spawn({ frame: F.DOT, x, y: y - 0.2, z, life: 0.2, size: 1.2, size1: 3, color: PAL.pink, alpha: 0.8, alpha1: 0 });
      this.vfx.light(_b.set(x, (pos.y || 0) + 1.2, z), '#ffc0e8', 6, r * 1.8, 0.25);
      return false;
    });
  }
  /** Paw Rune on the floor. handle: erupt(), end() */
  pawRune(pos, r = 1.2) {
    const m = this.take('rune', () => { const o = new THREE.Mesh(G_PLANE(), this.mGlyph(runeTex())); o.renderOrder = 9; return o; });
    const x = pos.x, y0 = pos.y || 0, z = pos.z, H = { alive: true, erupting: -1, t: 0 };
    m.position.set(x, y0 + 0.045, z); m.material.color.set('#ffd98a');
    this.vfx.dust(_a.set(x, y0, z), { n: 5, color: '#fff0c0' });
    this.pa.spawn({ frame: F.RING, x, y: y0 + 0.1, z, life: 0.3, size: 0.6, size1: 3.2 * r, color: PAL.gold, alpha: 1, alpha1: 0 });
    this.run((dt, t) => {
      H.t = t;
      if (H.erupting >= 0) {
        H.erupting += dt; const k = H.erupting / 0.35;
        m.scale.setScalar(r * (1 + k * 0.5)); m.material.opacity = Math.max(0, 1.4 * (1 - k)); m.material.color.set('#fff6d0');
        return k < 1;
      }
      const stamp = Math.min(1, t / 0.22), s = r * (1.7 - 0.7 * ease.outBack(stamp));
      m.scale.setScalar(s); m.rotation.y += dt * 0.35;
      m.material.opacity = stamp * (0.62 + 0.3 * Math.sin(t * 3.2)) * (H.fade ?? 1);
      if (H.fade != null) { H.fade -= dt * 3; if (H.fade <= 0) return false; }
      if (Math.random() < dt * 6) { const a = rand(0, TAU), rr = rand(0.2, 0.9) * r; this.pa.spawn({ frame: Math.random() < 0.3 ? F.GLOWSTAR : F.SPARK, x: x + Math.cos(a) * rr, y: y0 + 0.1, z: z + Math.sin(a) * rr, vy: rand(0.4, 1), life: rand(0.6, 1), size: rand(0.12, 0.22), size1: 0.02, color: Math.random() < 0.5 ? PAL.gold : PAL.violet, alpha: 0.9, alpha1: 0 }); }
      return H.alive;
    }, () => { H.alive = false; this.give('rune', m); });
    H.erupt = (R = 2.3) => {
      if (H.erupting >= 0) return; H.erupting = 0;
      const p = _b.set(x, y0, z);
      this.vfx.pillar(p, { color: '#ffe8a0', r: 0.75, h: 5.5, life: 0.55, opacity: 0.9 });
      this.shock(p, { r: R * 1.1, life: 0.4, w: 0.14, a: '#ffe08a', b: '#c8b0ff' });
      for (let i = 0; i < 26; i++) {
        const a = rand(0, TAU), s = rand(0.5, 2.6), ink = i % 2 === 0;
        this.p(ink ? 'n' : 'a', { frame: ink ? F.STAR : F.GLOWSTAR, x: x + Math.cos(a) * 0.2, y: y0 + 0.3, z: z + Math.sin(a) * 0.2, vx: Math.cos(a) * s, vy: rand(5, 10), vz: Math.sin(a) * s, life: rand(0.6, 1.0), size: rand(0.24, 0.4), size1: 0.08, color: i % 3 ? PAL.gold : PAL.violet, alpha: 1, alpha1: 0.3, grav: 14, drag: 0.8, spin: rand(-6, 6) });
      }
      this.pa.spawn({ frame: F.PAW, x, y: y0 + 1.2, z, vy: 1.5, life: 0.5, size: 1.4, size1: 2.2, color: PAL.gold, alpha: 1, alpha1: 0 });
      this.vfx.flash(_c.set(x, y0 + 0.6, z), '#fff0b0', 2.4, 0.2);
      this.vfx.light(_c, '#ffe08a', 10, R * 2.4, 0.35);
    };
    H.end = () => { if (H.fade == null) H.fade = 1; };
    return H;
  }
  /** Moonbeam from the sky. handle.pos is moved by the caller; handle.end() */
  moonbeam(r = 1.3) {
    const outer = this.take('beamO', () => { const o = new THREE.Mesh(G_CYL(), this.mBeam(false)); o.renderOrder = 13; return o; });
    const core = this.take('beamC', () => { const o = new THREE.Mesh(G_CYL(), this.mBeam(true)); o.renderOrder = 13; return o; });
    const pool = this.take('moonPool', () => { const o = new THREE.Mesh(G_PLANE(), this.mGlyph(moonTex())); o.renderOrder = 9; return o; });
    pool.material.color.set('#d8d0ff');
    const H = { alive: true, pos: new THREE.Vector3(), endT: -1 };
    const light = this.vfx.lightPool?.addSource({ pos: new THREE.Vector3(), color: new THREE.Color('#c8c8ff'), intensity: 6, radius: 6, priority: 5 });
    const HT = 16;
    this.run((dt, t) => {
      let k = Math.min(1, t / 0.16);
      if (H.endT >= 0) { H.endT += dt; k *= Math.max(0, 1 - H.endT / 0.22); if (H.endT > 0.22) return false; }
      const p = H.pos, wob = 1 + Math.sin(t * 9) * 0.04;
      outer.position.set(p.x, p.y, p.z); outer.scale.set(r * 1.05 * k * wob, HT, r * 1.05 * k * wob);
      core.position.set(p.x, p.y, p.z); core.scale.set(r * 0.42 * k, HT, r * 0.42 * k);
      outer.material.uniforms.uA.value = 0.75 * k; core.material.uniforms.uA.value = 1.0 * k;
      pool.position.set(p.x, p.y + 0.05, p.z); pool.scale.setScalar(r * 1.35 * (0.9 + 0.1 * Math.sin(t * 6))); pool.rotation.y += dt * 0.9; pool.material.opacity = 0.85 * k;
      if (light) { light.pos.set(p.x, p.y + 1.5, p.z); light.intensity = 6 * k; }
      // dust motes drifting in the shaft, sparkles where it lands
      for (let i = this.emit('motes', 45 * k, dt); i > 0; i--) { const a = rand(0, TAU), rr = Math.sqrt(Math.random()) * r * 0.9; this.pa.spawn({ frame: i % 4 ? F.DOT : F.SPARK, x: p.x + Math.cos(a) * rr, y: p.y + rand(0.1, 5), z: p.z + Math.sin(a) * rr, vy: rand(-0.6, 0.6), vx: rand(-0.1, 0.1), vz: rand(-0.1, 0.1), life: rand(0.7, 1.3), size: rand(0.05, 0.12), size1: 0.03, color: i % 3 ? PAL.moon : PAL.lilac, alpha: 0.9, alpha1: 0, fadeIn: 0.2, flicker: 12 }); }
      for (let i = this.emit('mbSpark', 20 * k, dt); i > 0; i--) { const a = rand(0, TAU); this.pa.spawn({ frame: F.GLOWSTAR, x: p.x + Math.cos(a) * r * 0.6, y: p.y + 0.15, z: p.z + Math.sin(a) * r * 0.6, vx: Math.cos(a) * 1.5, vy: rand(1, 2.5), vz: Math.sin(a) * 1.5, life: 0.45, size: rand(0.16, 0.26), size1: 0.02, color: PAL.moon, alpha: 1, alpha1: 0, drag: 2 }); }
      return H.alive || H.endT >= 0;
    }, () => { H.alive = false; this.give('beamO', outer); this.give('beamC', core); this.give('moonPool', pool); if (light) this.vfx.lightPool?.removeSource(light); });
    H.end = () => { if (H.endT < 0) { H.endT = 0; H.alive = false; } };
    return H;
  }
  /** Constellation: star nodes on entities + chain segments that draw in; twinkle(), end() */
  constellation() {
    const MAXS = 16;
    const m = this.take('ribbonStar', () => { const o = new THREE.Mesh(ribbonGeometry(MAXS * 4), this.mRibbon(0)); o.renderOrder = 14; return o; });
    m.position.set(0, 0, 0);
    const U = m.material.uniforms, H = { alive: true, nodes: [], segs: [], fadeT: -1, glow: 0 };
    U.uW.value = 0.18; U.uLen.value = 6; U.uCol.value.set('#a07aff'); U.uCore.value.set('#fff8d8');
    const node = (e) => {
      const at = e.pos ? e : { pos: e.clone(), alive: true, height: 0.8 };
      H.nodes.push(at);
      const h = () => (at.height || 1) * 0.6;
      const born = this.t;
      this.pa.spawn({ frame: F.GLOWSTAR, x: at.pos.x, y: at.pos.y + h(), z: at.pos.z, life: 30, size: 0.7, size1: 0.7, color: PAL.star, alpha: 1, alpha1: 1,
        fn: (q) => { if (!H.alive && H.fadeT < 0) { q.t = q.life; return; } const fade = H.fadeT >= 0 ? Math.max(0, 1 - H.fadeT / 0.35) : 1; if (H.fadeT > 0.35) { q.t = q.life; return; } q.x = at.pos.x; q.y = at.pos.y + h(); q.z = at.pos.z; const age = this.t - born; q.s0 = q.s1 = (0.55 + 0.25 * Math.sin(this.t * 9 + born * 7) + (age < 0.15 ? (0.15 - age) * 6 : 0) + H.glow * 0.6) * fade; q.a0 = q.a1 = fade; q.rot = this.t * 1.5; } });
      this.pn.spawn({ frame: F.STAR, x: at.pos.x, y: at.pos.y + h(), z: at.pos.z, life: 30, size: 0.3, size1: 0.3, color: PAL.gold, alpha: 1, alpha1: 1,
        fn: (q) => { if (!H.alive && H.fadeT < 0) { q.t = q.life; return; } if (H.fadeT > 0.35) { q.t = q.life; return; } const fade = H.fadeT >= 0 ? Math.max(0, 1 - H.fadeT / 0.35) : 1; q.x = at.pos.x; q.y = at.pos.y + h(); q.z = at.pos.z; q.s0 = q.s1 = (0.3 + H.glow * 0.2) * fade; q.a0 = q.a1 = fade; q.rot = -this.t * 2; } });
      this.starBurst(_a.set(at.pos.x, at.pos.y + h(), at.pos.z), { r: 0.6, n: 6 });
      return at;
    };
    H.node = node;
    H.link = (a, b) => { if (H.segs.length < MAXS) H.segs.push({ a, b, t0: this.t }); };
    H.twinkle = () => { H.glow = 1; for (const n of H.nodes) this.starBurst(_a.set(n.pos.x, n.pos.y + (n.height || 1) * 0.6, n.pos.z), { r: 0.8, n: 8 }); };
    H.end = () => { if (H.fadeT < 0) H.fadeT = 0; };
    const geoR = m.geometry, pos = geoR.attributes.position, tan = geoR.attributes.aT, au = geoR.attributes.aU;
    this.run((dt, t) => {
      H.glow = Math.max(0, H.glow - dt * 2.5);
      let alpha = 1;
      if (H.fadeT >= 0) { H.fadeT += dt; alpha = Math.max(0, 1 - H.fadeT / 0.35); if (H.fadeT > 0.4) return false; }
      U.uA.value = alpha * (0.95 + H.glow * 0.5); U.uW.value = 0.17 + H.glow * 0.12;
      let n = 0;
      for (const s of H.segs) {
        const k = Math.min(1, (this.t - s.t0) / 0.09);
        const ha = (s.a.height || 1) * 0.6, hb = (s.b.height || 1) * 0.6;
        _a.set(s.a.pos.x, s.a.pos.y + ha, s.a.pos.z); _b.set(s.b.pos.x, s.b.pos.y + hb, s.b.pos.z); _b.lerpVectors(_a, _b, k);
        writeSegment(pos, tan, au, n++, _a, _b);
      }
      geoR.setDrawRange(0, n * 6); pos.needsUpdate = tan.needsUpdate = au.needsUpdate = true;
      return true;
    }, () => { H.alive = false; this.give('ribbonStar', m); });
    return H;
  }
  /** Treat Meteor: a giant bone biscuit streaks down; onImpact(pos) fires on landing */
  meteor(from, to, { time = 1, r = 3.4, onImpact } = {}) {
    const bis = this.take('biscuit', () => { const o = new THREE.Mesh(G_BONE(), this.mat('biscuitMat', () => makeToon({ map: biscuitTex(), rim: 0.45, brush: 0.08, objectBrush: true, emissive: '#ff7a2a', emissiveIntensity: 0.6 }))); o.castShadow = true; return o; });
    const tgt = this.take('target', () => { const o = new THREE.Mesh(G_PLANE(), this.mGlyph(ringTexture())); o.renderOrder = 9; return o; });
    const inner = this.take('targetIn', () => { const o = new THREE.Mesh(G_PLANE(), this.mGlyph(glowTexture())); o.renderOrder = 9; return o; });
    tgt.material.color.set('#ff9a50'); inner.material.color.set('#ff6a3a');
    const F0 = from.clone(), T0 = to.clone(), dir = T0.clone().sub(F0).normalize(), spin = rand(-1, 1);
    const light = this.vfx.lightPool?.addSource({ pos: F0.clone(), color: new THREE.Color('#ffa050'), intensity: 7, radius: 7, priority: 6 });
    const H = { alive: true, landed: false, cancel: false };
    H.end = () => { H.cancel = true; };
    const S = 1.3;
    bis.scale.setScalar(S);
    this.run((dt, t) => {
      if (H.cancel) return false;
      if (!H.landed) {
        const k = Math.min(1, t / time), kk = Math.pow(k, 1.35); // a slightly accelerating streak
        bis.position.lerpVectors(F0, T0, Math.min(1, kk)); bis.position.y += 0.4 * S;
        bis.lookAt(this.engine.camera.position); bis.rotateX(-0.35); bis.rotateZ(t * 3.2 * (spin > 0 ? 1 : -1) + 0.5);
        tgt.position.set(T0.x, T0.y + 0.05, T0.z); tgt.scale.setScalar(r * (1.28 - 0.28 * k)); tgt.rotation.y += dt * 2.5; tgt.material.opacity = 0.75 * Math.min(1, t * 4) * (0.8 + 0.2 * Math.sin(t * 24));
        inner.position.set(T0.x, T0.y + 0.045, T0.z); inner.scale.setScalar(r * (0.3 + 0.6 * k)); inner.material.opacity = 0.12 + 0.3 * k;
        bis.material.emissiveIntensity = 0.12 + 0.22 * k;
        if (light) { light.pos.copy(bis.position); light.intensity = 7 + 6 * k; }
        const p = bis.position;
        for (let i = this.emit('metFire', 140, dt); i > 0; i--) this.vfx.glow.spawn({ x: p.x + rand(-0.5, 0.5), y: p.y + rand(-0.4, 0.4), z: p.z + rand(-0.5, 0.5), vx: -dir.x * 3 + rand(-1, 1), vy: -dir.y * 3 + rand(0, 1.5), vz: -dir.z * 3 + rand(-1, 1), life: rand(0.3, 0.55), size: rand(0.7, 1.3), size1: 0.1, color: '#ffc050', color1: '#ff3a1a', alpha: 0.95, alpha1: 0, drag: 2 });
        for (let i = this.emit('metSmoke', 40, dt); i > 0; i--) this.vfx.smoke.spawn({ x: p.x + rand(-0.4, 0.4), y: p.y, z: p.z + rand(-0.4, 0.4), vx: -dir.x * 1.5, vy: -dir.y * 1.5 + 0.5, vz: -dir.z * 1.5, life: rand(0.7, 1.1), size: rand(0.6, 0.9), size1: 1.8, color: '#6a5058', alpha: 0.45, alpha1: 0, drag: 1.5 });
        for (let i = this.emit('metCrumb', 30, dt); i > 0; i--) this.pn.spawn({ frame: F.CRUMB, x: p.x + rand(-0.6, 0.6), y: p.y + rand(-0.3, 0.3), z: p.z + rand(-0.6, 0.6), vx: rand(-1.5, 1.5), vy: rand(-1, 1), vz: rand(-1.5, 1.5), life: rand(0.5, 0.8), size: rand(0.14, 0.24), size1: 0.1, color: PAL.biscuit, alpha: 1, alpha1: 1, grav: 12, spin: rand(-8, 8) });
        for (let i = this.emit('metSpark', 30, dt); i > 0; i--) this.pa.spawn({ frame: F.GLOWSTAR, x: p.x + rand(-0.6, 0.6), y: p.y + rand(-0.4, 0.4), z: p.z + rand(-0.6, 0.6), vx: rand(-1, 1), vy: rand(-0.5, 1), vz: rand(-1, 1), life: 0.5, size: rand(0.2, 0.35), size1: 0.02, color: i % 2 ? PAL.star : PAL.violet, alpha: 1, alpha1: 0 });
        if (k >= 1) {
          H.landed = true; H.tl = t;
          this.give('target', tgt); this.give('targetIn', inner);
          if (light) this.vfx.lightPool?.removeSource(light);
          this.impact(T0, r);
          onImpact?.(T0.clone());
          bis.position.set(T0.x, T0.y + 0.28 * S, T0.z); bis.rotation.set(-Math.PI / 2 + 0.42, 0, rand(-0.6, 0.6)); // face up, half buried
        }
        return true;
      }
      // stuck in its crater, then crumbles away
      const u = t - H.tl;
      bis.material.emissiveIntensity = Math.max(0, 0.55 * (1 - u / 0.6));
      if (u > 0.7) {
        const k = Math.min(1, (u - 0.7) / 0.35); bis.scale.setScalar(S * (1 - k)); bis.position.y = T0.y + 0.3 * S * (1 - k);
        if (Math.random() < 0.8) this.pn.spawn({ frame: F.CRUMB, x: T0.x + rand(-0.9, 0.9), y: T0.y + rand(0.2, 0.6), z: T0.z + rand(-0.9, 0.9), vx: rand(-1.5, 1.5), vy: rand(1, 3), vz: rand(-1.5, 1.5), life: 0.6, size: rand(0.14, 0.26), size1: 0.1, color: PAL.biscuit, alpha: 1, alpha1: 1, grav: 12, spin: rand(-6, 6) });
        if (k >= 1) return false;
      } else if (Math.random() < dt * 20) this.vfx.smoke.spawn({ x: T0.x + rand(-0.8, 0.8), y: T0.y + 0.3, z: T0.z + rand(-0.8, 0.8), vy: rand(0.8, 1.5), life: 1, size: 0.6, size1: 1.4, color: '#7a6a6a', alpha: 0.35, alpha1: 0 });
      return true;
    }, () => { H.alive = false; this.give('biscuit', bis); if (!H.landed) { this.give('target', tgt); this.give('targetIn', inner); if (light) this.vfx.lightPool?.removeSource(light); } });
    return H;
  }
  impact(pos, r) {
    const v = this.vfx, x = pos.x, y0 = pos.y || 0, z = pos.z;
    v.flash(_a.set(x, y0 + 0.8, z), '#fff0c8', r * 1.6, 0.26);
    v.light(_a, '#ffc070', 22, r * 3, 0.5);
    this.shock(pos, { r: r * 1.3, life: 0.5, w: 0.13, a: '#ffe0a0', b: '#ffb070' });
    this.ripple(pos, { r: r * 1.6, life: 0.7, color: PAL.gold, alpha: 0.8 });
    v.shockwave(pos, r * 1.3, '#ffe0b0');
    v.fire(_a.set(x, y0 + 0.2, z), 28, { spread: r * 0.45, size: 0.9 });
    for (let i = 0; i < 14; i++) v.smoke.spawn({ x: x + rand(-1, 1) * r * 0.4, y: y0 + 0.3, z: z + rand(-1, 1) * r * 0.4, vx: rand(-1.5, 1.5), vy: rand(2, 4.5), vz: rand(-1.5, 1.5), life: rand(0.8, 1.2), size: rand(0.7, 1.1), size1: 2, color: '#8a7478', alpha: 0.38, alpha1: 0, drag: 2 });
    for (let i = 0; i < 40; i++) { const a = rand(0, TAU), s = rand(2, 7); this.pn.spawn({ frame: F.CRUMB, x, y: y0 + 0.4, z, vx: Math.cos(a) * s, vy: rand(3, 8), vz: Math.sin(a) * s, life: rand(0.7, 1.1), size: rand(0.16, 0.34), size1: 0.12, color: i % 3 ? PAL.biscuit : PAL.crumb, alpha: 1, alpha1: 1, grav: 16, drag: 0.6, spin: rand(-9, 9) }); }
    this.starBurst(_a.set(x, y0 + 0.8, z), { r: 1.6, n: 16 });
    this.crater(pos, r);
  }
  crater(pos, r) {
    const m = this.take('crater', () => { const o = new THREE.Mesh(G_PLANE(), this.mDecal(craterTex())); o.renderOrder = 8; return o; });
    m.position.set(pos.x, (pos.y || 0) + 0.04, pos.z); m.scale.setScalar(r * 0.8); m.rotation.y = rand(0, TAU);
    const life = 6;
    this.run((dt, t) => { m.material.opacity = 0.8 * Math.min(1, t * 8) * (1 - ease.inQuad(Math.min(1, t / life))); return t < life; }, () => this.give('crater', m));
  }

  // ================================================================== DUCK HUNT
  /** wind-up rubber duck: { root, key } (pooled; release with giveDuck) */
  duckModel() {
    const root = this.take('duck', () => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(G_DUCK(), this.mat('duckMat', () => makeToon({ vertexColors: true, rim: 0.55, brush: 0.06, objectBrush: true })));
      body.castShadow = true; g.add(body);
      g.add(new THREE.Mesh(G_DUCK(), this.mat('duckOl', () => makeOutline('#3a2230', 0.012))));
      const key = new THREE.Mesh(G_KEY(), this.mat('keyMat', () => makeToon({ vertexColors: true, rim: 0.7, brush: 0.03, emissive: '#ffb030', emissiveIntensity: 0.15 })));
      key.position.set(0, 0.31, -0.3); key.castShadow = true; key.name = 'key'; g.add(key);
      const halo = new THREE.Mesh(G_PLANE(), this.mGlyph(glowTexture())); halo.name = 'halo'; halo.position.y = 0.03; halo.scale.setScalar(0.7); halo.material.color.set('#ffb04a'); halo.renderOrder = 8; g.add(halo);
      return g;
    });
    root.scale.setScalar(1); root.rotation.set(0, 0, 0);
    return { root, key: root.getObjectByName('key'), halo: root.getObjectByName('halo') };
  }
  giveDuck(d) { this.give('duck', d.root); }
  quack(pos, { r = 5, big = false } = {}) {
    const y = pos.y || 0;
    this.text(big ? 'QUACK!!' : 'QUACK!', _a.set(pos.x, y + 1.25, pos.z), { a: '#fff4a0', b: '#ffae3a', size: big ? 1.7 : 1.2, life: 0.8, rise: 0.6 });
    this.pa.spawn({ frame: F.RING, x: pos.x, y: y + 0.5, z: pos.z, life: 0.35, size: 0.4, size1: 2.4, color: PAL.orange, alpha: 1, alpha1: 0 });
    this.ripple(pos, { r: r * 0.5, life: 0.6, color: PAL.orange, alpha: 0.85 });
    for (let i = 0; i < 3; i++) this.pn.spawn({ frame: F.NOTE, x: pos.x + rand(-0.3, 0.3), y: y + 0.7, z: pos.z + rand(-0.3, 0.3), vx: rand(-0.6, 0.6), vy: rand(1, 1.8), vz: rand(-0.6, 0.6), life: 0.9, size: 0.3, size1: 0.22, color: i % 2 ? PAL.orange : PAL.green, alpha: 1, alpha1: 0, spin: rand(-2, 2) });
  }
  confetti(pos, n = 36) {
    for (let i = 0; i < n; i++) { const a = rand(0, TAU), s = rand(1.5, 4.5); this.pn.spawn({ frame: i % 7 === 0 ? F.HEART : F.CONFETTI, x: pos.x, y: (pos.y || 0) + 0.4, z: pos.z, vx: Math.cos(a) * s, vy: rand(3, 7), vz: Math.sin(a) * s, life: rand(0.9, 1.4), size: rand(0.14, 0.24), size1: 0.14, color: CONFETTI[i % CONFETTI.length], alpha: 1, alpha1: 0.8, grav: 9, drag: 2.2, spin: rand(-12, 12) }); }
  }
  /** glowing leash between two moving points. handle: set({sag, frac, a}), snap(), end() */
  leash(getA, getB) {
    const NP = 18;
    const m = this.take('ribbonLeash', () => { const o = new THREE.Mesh(ribbonGeometry(NP * 2, true), this.mRibbon(1)); o.renderOrder = 14; return o; });
    m.position.set(0, 0, 0);
    const U = m.material.uniforms, H = { alive: true, sag: 0.8, frac: 0, a: 1, snapT: -1 };
    U.uW.value = 0.075; U.uCol.value.set('#ffa040'); U.uCore.value.set('#fff0a0');
    const gm = m.geometry, pos = gm.attributes.position, tan = gm.attributes.aT, au = gm.attributes.aU;
    const pts = Array.from({ length: NP }, () => new THREE.Vector3());
    this.run((dt, t) => {
      const A = getA(_a), B = getB(_b);
      if (H.snapT >= 0) { H.snapT += dt; H.a = Math.max(0, 1 - H.snapT / 0.2); if (H.snapT > 0.2) return false; }
      const L = A.distanceTo(B); U.uLen.value = L;
      for (let i = 0; i < NP; i++) { const u = (i / (NP - 1)) * H.frac; pts[i].lerpVectors(A, B, u); pts[i].y -= Math.sin(u * Math.PI) * H.sag * Math.min(1, L / 6) + Math.sin(u * 20 - t * 30) * 0.03 * H.sag; }
      writePolyline(pos, tan, au, pts);
      gm.setDrawRange(0, (NP - 1) * 6); pos.needsUpdate = tan.needsUpdate = au.needsUpdate = true;
      U.uA.value = H.a;
      if (Math.random() < 0.5) { const q = pts[(Math.random() * NP) | 0]; this.pa.spawn({ frame: F.SPARK, x: q.x, y: q.y, z: q.z, vy: 0.4, life: 0.3, size: 0.16, size1: 0.02, color: PAL.gold, alpha: 1, alpha1: 0 }); }
      return H.alive || H.snapT >= 0;
    }, () => { H.alive = false; this.give('ribbonLeash', m); });
    H.snap = () => {
      if (H.snapT >= 0) return; H.snapT = 0; H.alive = false;
      for (let i = 0; i < NP; i += 2) this.pa.spawn({ frame: i % 4 ? F.SPARK : F.GLOWSTAR, x: pts[i].x, y: pts[i].y, z: pts[i].z, vx: rand(-1, 1), vy: rand(0.5, 2), vz: rand(-1, 1), life: 0.4, size: 0.24, size1: 0.02, color: i % 4 ? PAL.gold : PAL.orange, alpha: 1, alpha1: 0 });
    };
    H.end = H.snap;
    return H;
  }
  /** glowing collar ring on a leashed foe (follows it) */
  collar(e, dur = 0.8) {
    const h = (e.height || 1) * 0.72;
    this.pa.spawn({ frame: F.RING, x: e.pos.x, y: e.pos.y + h, z: e.pos.z, life: dur, size: 0.9, size1: 0.7, color: PAL.orange, alpha: 1, alpha1: 0.3, fn: q => { q.x = e.pos.x; q.y = e.pos.y + h; q.z = e.pos.z; } });
  }
  featherMesh() {
    const m = new THREE.Mesh(G_FEATHER(), this.mat('featherMat', () => new THREE.MeshBasicMaterial({ map: featherTex(), color: C('#fff0d0').multiplyScalar(1.3), transparent: true, alphaTest: 0.25, side: THREE.DoubleSide, depthWrite: true, toneMapped: false })));
    m.renderOrder = 11;
    const g = new THREE.Group(); g.add(m);
    const h = new THREE.Sprite(this.mat('haloFeather', () => this.mHalo(C('#ffc070'), 0.45))); h.scale.setScalar(0.7); g.add(h);
    g.userData.spin = rand(0, TAU);
    return g;
  }
  trailFeather(pr, dt) {
    const p = pr.pos, g = pr.mesh;
    g.rotation.set(0, Math.atan2(pr.dir.x, pr.dir.z), 0); g.children[0].rotation.z = Math.sin(pr.t * 22 + g.userData.spin) * 0.6; g.position.y = p.y + Math.sin(pr.t * 14 + g.userData.spin) * 0.06;
    for (let i = this.emit('fea', 90, dt); i > 0; i--) this.pa.spawn({ frame: F.SPARK, x: p.x, y: p.y, z: p.z, vx: rand(-0.3, 0.3), vy: rand(-0.1, 0.4), vz: rand(-0.3, 0.3), life: rand(0.2, 0.35), size: rand(0.14, 0.24), size1: 0.02, color: i % 2 ? PAL.orange : PAL.star, alpha: 0.9, alpha1: 0 });
  }
  featherBurst(pos, n = 8, { color = PAL.cream, color2 = PAL.orange } = {}) {
    for (let i = 0; i < n; i++) { const a = rand(0, TAU), s = rand(1, 3); this.pn.spawn({ frame: F.FEATHER, x: pos.x, y: pos.y, z: pos.z, vx: Math.cos(a) * s, vy: rand(1, 3), vz: Math.sin(a) * s, life: rand(0.8, 1.3), size: rand(0.26, 0.4), size1: 0.22, color: i % 3 ? color : color2, alpha: 1, alpha1: 0, grav: 2.2, drag: 3.5, spin: rand(-5, 5) }); }
    this.sparkBurst(pos, { n: 5, color: PAL.star, speed: 3, size: 0.22, life: 0.3 });
  }
  /** Duck Call lure rings at a point, feathers swirling in */
  lure(pos, r, dur = 1.2) {
    const m = this.take('lure', () => { const o = new THREE.Mesh(G_PLANE(), this.mLure()); o.renderOrder = 9; return o; });
    const U = m.material.uniforms, x = pos.x, y0 = pos.y || 0, z = pos.z;
    m.position.set(x, y0 + 0.05, z);
    this.run((dt, t) => {
      const tin = Math.min(1, t / 0.2), tout = Math.max(0, Math.min(1, (dur - t) / 0.3));
      m.scale.setScalar(r * (0.6 + 0.4 * ease.outBack(tin)) * (1 - (1 - tout) * 0.4)); U.uA.value = Math.min(tin, tout);
      for (let i = this.emit('lure', 26 * tout, dt); i > 0; i--) {
        const a0 = rand(0, TAU), r0 = r * rand(0.7, 1), y = y0 + rand(0.3, 1.2);
        this.pn.spawn({ frame: F.FEATHER, x, y, z, life: rand(0.5, 0.8), size: rand(0.22, 0.34), size1: 0.1, color: Math.random() < 0.5 ? PAL.cream : PAL.orange, alpha: 1, alpha1: 0.3,
          fn: (q, d2, k) => { const rr = r0 * (1 - k), aa = a0 + k * 2.5; q.x = x + Math.cos(aa) * rr; q.z = z + Math.sin(aa) * rr; q.y = y * (1 - k) + (y0 + 0.4) * k; q.rot = aa * 2; } });
      }
      return t < dur;
    }, () => this.give('lure', m));
    this.quack(pos, { r, big: true });
    this.pa.spawn({ frame: F.DOT, x, y: y0 + 0.5, z, life: 0.25, size: 1, size1: 3, color: PAL.orange, alpha: 0.8, alpha1: 0 });
    this.vfx.light(_a.set(x, y0 + 1, z), '#ffc060', 7, r * 1.6, 0.35);
  }
  /** spectral retriever mesh (one draw call); pose it every frame with poseRetriever */
  retrieverModel() {
    const m = this.take('retriever', () => { const o = new THREE.Mesh(G_RETRIEVER(), this.mSpectral(VS_RETRIEVER, '#ffe2a8', '#fff8e0', false)); o.renderOrder = 12; return o; });
    const glow = this.take('retrieverGlow', () => { const o = new THREE.Mesh(G_PLANE(), this.mGlyph(glowTexture())); o.renderOrder = 8; return o; });
    glow.material.color.set('#ffc860');
    m.userData.glow = glow;
    return m;
  }
  giveRetriever(m) { this.give('retrieverGlow', m.userData.glow); this.give('retriever', m); }
  /** s: { x, y, z, yaw, t, move (0..1 trot), phase, bite (0..1), bark (0..1), alpha, scale } */
  poseRetriever(m, s) {
    const M = m.material.uniforms.uPart.value, P = RET_PIVOT;
    m.material.uniforms.uA.value = s.alpha ?? 1;
    m.position.set(s.x, s.y, s.z); m.rotation.set(0, s.yaw, 0); m.scale.setScalar(s.scale ?? 1);
    const g = m.userData.glow; g.position.set(s.x, s.y + 0.04, s.z); g.scale.setScalar(0.9 * (s.scale ?? 1)); g.material.opacity = 0.32 * (s.alpha ?? 1);
    const ph = s.phase, mv = s.move, t = s.t, bite = s.bite || 0, bark = s.bark || 0;
    const bob = Math.abs(Math.sin(ph)) * 0.04 * mv + Math.sin(t * 2.2) * 0.008;
    // body: bob + a lunge forward/down on a bite
    pivotRot(M[0], P[0], -0.05 * mv + bite * 0.18, 0, Math.sin(ph) * 0.03 * mv, 0, bob, bite * 0.12);
    // head: looks around idly, dips on a bite, lifts on a bark
    pivotRot(_m2, P[1], Math.sin(ph * 2) * 0.06 * mv + bite * 0.5 - bark * 0.45 + Math.sin(t * 0.9) * 0.05, Math.sin(t * 0.6) * 0.2 * (1 - mv), 0, 0, 0, 0); M[1].multiplyMatrices(M[0], _m2);
    // ears flop with the trot (and fly up on a bark)
    for (const [i, s2] of [[2, 1], [3, -1]]) { pivotRot(_m2, P[i], -0.2 * bark + Math.sin(ph * 2 + 0.5) * 0.15 * mv, 0, s2 * (0.15 + Math.sin(ph * 2) * 0.2 * mv + bark * 0.5), 0, 0, 0); M[i].multiplyMatrices(M[1], _m2); }
    // tail: happy wag
    pivotRot(_m2, P[4], -0.2 + Math.sin(t * 3) * 0.1, Math.sin(t * 14) * (0.45 + 0.2 * mv), 0, 0, 0, 0); M[4].multiplyMatrices(M[0], _m2);
    // legs: trot (diagonal pairs)
    const sw = Math.sin(ph) * 0.7 * mv;
    pivotRot(M[5], P[5], sw, 0, 0, 0, 0, 0); pivotRot(M[8], P[8], sw, 0, 0, 0, 0, 0);
    pivotRot(M[6], P[6], -sw, 0, 0, 0, 0, 0); pivotRot(M[7], P[7], -sw, 0, 0, 0, 0, 0);
  }
  /** Mallard Squadron. o: { from, center, n, area, points:[Vector3]|null, onImpact(pos, i) } → handle */
  mallards({ from, center, n = 6, area = 4, points = null, onImpact } = {}) {
    const MAX = 12;
    const m = this.take('mallards', () => {
      const g = G_MALLARD().clone();
      const ph = new Float32Array(MAX); for (let i = 0; i < MAX; i++) ph[i] = rand(0, TAU);
      g.setAttribute('iPhase', new THREE.InstancedBufferAttribute(ph, 1));
      const o = new THREE.InstancedMesh(g, this.mSpectral(VS_MALLARD, '#c8fff4', '#e8fff8', true), MAX); o.renderOrder = 12; return o;
    });
    m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1);
    const U = m.material.uniforms; n = Math.min(MAX, n); m.count = n;
    const fwd = _a.set(center.x - from.x, 0, center.z - from.z); const L = fwd.length() || 1; fwd.multiplyScalar(1 / L);
    const side = new THREE.Vector3(fwd.z, 0, -fwd.x), F2 = fwd.clone();
    const birds = [];
    for (let i = 0; i < n; i++) {
      const rank = Math.ceil(i / 2), s = i === 0 ? 0 : (i % 2 ? 1 : -1);
      const off = new THREE.Vector3().addScaledVector(side, s * rank * 0.95).addScaledVector(F2, -rank * 0.85);
      const start = new THREE.Vector3(from.x, (from.y || 0) + 6.5, from.z).addScaledVector(F2, -6).add(off);
      const over = new THREE.Vector3(center.x, (center.y || 0) + 3.4, center.z).addScaledVector(F2, -0.6).add(off);
      const a = rand(0, TAU), rr = Math.sqrt(Math.random()) * area * 0.85;
      const hit = points?.[i] ? points[i].clone() : new THREE.Vector3(center.x + Math.cos(a) * rr, center.y || 0, center.z + Math.sin(a) * rr);
      birds.push({ start, over, hit, t0: 0.72 + i * 0.085, done: false, pos: new THREE.Vector3(), prev: start.clone() });
    }
    const H = { alive: true, cancel: false };
    H.end = () => { H.cancel = true; };
    const dive = 0.34, life = 0.72 + n * 0.085 + dive + 0.1;
    this.run((dt, t) => {
      if (H.cancel) return false;
      U.uA.value = Math.min(1, t / 0.25);
      for (let i = 0; i < n; i++) {
        const b = birds[i];
        if (b.done) { _o.position.set(0, -100, 0); _o.scale.setScalar(0.0001); _o.updateMatrix(); m.setMatrixAt(i, _o.matrix); continue; }
        b.prev.copy(b.pos);
        if (t < b.t0) { const k = ease.outQuad(Math.min(1, t / 0.72)); b.pos.lerpVectors(b.start, b.over, k); b.pos.y += Math.sin(t * 6 + i) * 0.1; }
        else {
          const k = Math.min(1, (t - b.t0) / dive), kk = k * k;
          _b.set((b.over.x + b.hit.x) / 2, b.over.y + 0.6, (b.over.z + b.hit.z) / 2); // arc: a little rise, then a steep dive
          const u = 1 - kk; b.pos.set(u * u * b.over.x + 2 * u * kk * _b.x + kk * kk * b.hit.x, u * u * b.over.y + 2 * u * kk * _b.y + kk * kk * (b.hit.y + 0.2), u * u * b.over.z + 2 * u * kk * _b.z + kk * kk * b.hit.z);
          if (k >= 1) {
            b.done = true;
            this.featherBurst(_c.set(b.hit.x, b.hit.y + 0.4, b.hit.z), 7, { color: PAL.mint, color2: PAL.foam });
            this.splash(b.hit, { r: 0.9 });
            this.pa.spawn({ frame: F.RING, x: b.hit.x, y: b.hit.y + 0.15, z: b.hit.z, life: 0.3, size: 0.4, size1: 2.6, color: PAL.mint, alpha: 1, alpha1: 0 });
            onImpact?.(b.hit, i);
          }
        }
        _c.subVectors(b.pos, b.prev); if (_c.lengthSq() < 1e-8) _c.copy(F2);
        _o.position.copy(b.pos); _o.scale.setScalar(1.25); _o.lookAt(_d.copy(b.pos).add(_c)); _o.updateMatrix(); m.setMatrixAt(i, _o.matrix);
        if (Math.random() < 0.7) this.pa.spawn({ frame: F.DOT, x: b.pos.x, y: b.pos.y, z: b.pos.z, life: 0.3, size: 0.5, size1: 0.1, color: PAL.mint, alpha: 0.5, alpha1: 0 });
        if (Math.random() < dt * 4) this.pn.spawn({ frame: F.FEATHER, x: b.pos.x, y: b.pos.y, z: b.pos.z, vx: rand(-0.5, 0.5), vy: rand(-0.5, 0.2), vz: rand(-0.5, 0.5), life: 1, size: 0.24, size1: 0.18, color: PAL.mint, alpha: 1, alpha1: 0, grav: 1.5, drag: 3, spin: rand(-4, 4) });
      }
      m.instanceMatrix.needsUpdate = true;
      return t < life;
    }, () => { H.alive = false; this.give('mallards', m); });
    return H;
  }

  // ================================================================== hero hand-off (vfx.heroSwap)
  /** a starlight column over a spinning paw glyph: flashes the outgoing hero's colour, then blooms in the incoming one's (~0.65 s) */
  heroSwap(pos, { from = '#e8475c', to = '#2fb8a8' } = {}) {
    const cF = C(from), cT = C(to), x = pos.x, y0 = pos.y || 0, z = pos.z;
    const beam = this.take('swapBeam', () => { const o = new THREE.Mesh(G_CYL(), this.mBeam(false)); o.renderOrder = 13; return o; });
    const core = this.take('swapCore', () => { const o = new THREE.Mesh(G_CYL(), this.mBeam(true)); o.renderOrder = 13; return o; });
    const glyph = this.take('swapGlyph', () => { const o = new THREE.Mesh(G_PLANE(), this.mGlyph(runeTex())); o.renderOrder = 9; return o; });
    beam.position.set(x, y0, z); core.position.set(x, y0, z); glyph.position.set(x, y0 + 0.05, z);
    const UB = beam.material.uniforms, UC = core.material.uniforms, col = new THREE.Color();
    this.vfx.light(_a.set(x, y0 + 1.2, z), cF, 9, 6, 0.4);
    this.sparkBurst(_a.set(x, y0 + 0.5, z), { n: 12, color: cF, speed: 3, size: 0.3, life: 0.5, up: 2 });
    let bloomed = false;
    this.run((dt, t) => {
      const u1 = Math.min(1, t / 0.3), u2 = clamp((t - 0.3) / 0.38);
      col.copy(cF).lerp(cT, u2 * u2 * (3 - 2 * u2));
      const w = t < 0.3 ? 0.9 * ease.outBack(u1) * (1 - 0.55 * Math.max(0, (t - 0.2) / 0.1)) : lerp(0.5, 1.35, ease.outCubic(Math.min(1, u2 * 2))) * (1 - ease.inQuad(u2));
      beam.scale.set(w, 9, w); core.scale.set(w * 0.4, 9, w * 0.4);
      UB.uCol.value.copy(col).multiplyScalar(1.3); UB.uA.value = 0.9 * Math.min(1, t * 8) * (1 - u2 * u2); UC.uA.value = UB.uA.value;
      glyph.scale.setScalar(1.1 + 0.9 * u1 + 0.8 * u2); glyph.rotation.y += dt * (2 + 5 * u2); glyph.material.color.copy(col); glyph.material.opacity = Math.min(1, t * 6) * (1 - u2);
      for (let i = this.emit('swap', 70 * (1 - u2), dt); i > 0; i--) { const a = rand(0, TAU), r = rand(0.2, 0.9); this.pa.spawn({ frame: i % 3 ? F.SPARK : F.GLOWSTAR, x: x + Math.cos(a) * r, y: y0 + rand(0, 0.6), z: z + Math.sin(a) * r, vy: rand(2, 5), life: rand(0.4, 0.7), size: rand(0.16, 0.3), size1: 0.02, color: col, alpha: 1, alpha1: 0, drag: 1 }); }
      if (!bloomed && t >= 0.3) {
        bloomed = true;
        this.vfx.light(_a.set(x, y0 + 1.2, z), cT, 12, 7, 0.45);
        this.vfx.flash(_a, to, 2.6, 0.24);
        this.pa.spawn({ frame: F.RING, x, y: y0 + 0.2, z, life: 0.35, size: 0.6, size1: 4.2, color: cT, alpha: 1, alpha1: 0 });
        this.starBurst(_a.set(x, y0 + 0.9, z), { r: 1.3, n: 14, color: cT, color2: PAL.star });
        for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; this.pn.spawn({ frame: F.PAW, x: x + Math.cos(a) * 0.3, y: y0 + 0.25, z: z + Math.sin(a) * 0.3, vx: Math.cos(a) * 3, vy: rand(1.5, 3), vz: Math.sin(a) * 3, life: 0.6, size: 0.34, size1: 0.2, color: cT, alpha: 1, alpha1: 0, drag: 3, spin: rand(-3, 3) }); }
      }
      return t < 0.7;
    }, () => { this.give('swapBeam', beam); this.give('swapCore', core); this.give('swapGlyph', glyph); });
  }

  // ================================================================== prewarm
  /** Build + draw one of everything below the floor for a few frames so the first cast of each spell doesn't compile */
  prewarm(renderer, camera, force = false) {
    if (this.warmed || (!force && !mokaAround())) return;
    this.warmed = true;
    const y = -52, P = new THREE.Vector3(0, y, 0), made = [];
    const keep = (kind, o) => { made.push([kind, o]); o.position.set(0, y, 0); o.visible = true; };
    const kinds = {
      ripple: () => { const o = new THREE.Mesh(G_PLANE(), this.mRipple()); return o; }, crown: () => new THREE.Mesh(G_CYL(), this.mCrown()), spray: () => new THREE.Mesh(G_PLANE(), this.mSpray()),
      bubble: () => new THREE.Mesh(G_SPHERE(), this.mBubble()), puddle: () => new THREE.Mesh(G_PLANE(), this.mPuddle()), vortex: () => new THREE.Mesh(G_PLANE(), this.mVortex()), vwall: () => new THREE.Mesh(G_CYL(), this.mWall()),
      wave: () => new THREE.Mesh(G_WAVE(), this.mWave()), surge: () => { const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); g.rotateY(Math.PI); g.translate(0, 0, 0.5); return new THREE.Mesh(g, this.mSurge()); }, beamO: () => new THREE.Mesh(G_CYL(), this.mBeam(false)), beamC: () => new THREE.Mesh(G_CYL(), this.mBeam(true)),
      moonPool: () => new THREE.Mesh(G_PLANE(), this.mGlyph(moonTex())), rune: () => new THREE.Mesh(G_PLANE(), this.mGlyph(runeTex())), target: () => new THREE.Mesh(G_PLANE(), this.mGlyph(ringTexture())), targetIn: () => new THREE.Mesh(G_PLANE(), this.mGlyph(glowTexture())),
      crater: () => new THREE.Mesh(G_PLANE(), this.mDecal(craterTex())), lure: () => new THREE.Mesh(G_PLANE(), this.mLure()), shock: () => new THREE.Mesh(G_PLANE(), this.mShock()),
      ribbonStar: () => new THREE.Mesh(ribbonGeometry(64), this.mRibbon(0)), ribbonLeash: () => new THREE.Mesh(ribbonGeometry(36, true), this.mRibbon(1)),
      biscuit: () => new THREE.Mesh(G_BONE(), this.mat('biscuitMat', () => makeToon({ map: biscuitTex(), rim: 0.45, brush: 0.08, objectBrush: true, emissive: '#ff7a2a', emissiveIntensity: 0.6 }))),
      squeakToy: () => new THREE.Mesh(G_BONE(), this.mat('squeakMat', () => makeToon({ color: '#ff9ccc', emissive: '#ff6aa8', emissiveIntensity: 0.25, rim: 0.6, brush: 0.06, objectBrush: true }))),
    };
    for (const [k, make] of Object.entries(kinds)) { const o = this.adopt(make()); o.renderOrder = 9; keep(k, o); }
    const d = this.duckModel(); keep('duck', d.root);
    const r = this.retrieverModel(); keep('retriever', r); keep('retrieverGlow', r.userData.glow); this.poseRetriever(r, { x: 0, y, z: 0, yaw: 0, t: 0, move: 0, phase: 0 });
    const ml = this.take('mallards', () => { const g = G_MALLARD().clone(); g.setAttribute('iPhase', new THREE.InstancedBufferAttribute(new Float32Array(12), 1)); const o = new THREE.InstancedMesh(g, this.mSpectral(VS_MALLARD, '#c8fff4', '#e8fff8', true), 12); return o; });
    ml.count = 1; _o.position.copy(P); _o.scale.setScalar(1); _o.updateMatrix(); ml.setMatrixAt(0, _o.matrix); ml.instanceMatrix.needsUpdate = true; keep('mallards', ml);
    const w = this.take('word', () => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false })); sp.renderOrder = 30; return sp; });
    w.material.map = wordTex('SQUEAK!', '#fff2a0', '#ff8fc8'); keep('word', w);
    const loose = [this.orbMesh(), this.boltMesh(), this.kibbleMesh(), this.featherMesh()];
    for (const o of loose) { this.adopt(o); o.position.copy(P); }
    for (const [k, f] of [[F.DROP, 'n'], [F.SPARK, 'a']]) this.p(f, { frame: k, x: 0, y, z: 0, life: 0.1, size: 0.1 });
    for (const t of [atlasTex(), runeTex(), moonTex(), craterTex(), biscuitTex(), featherTex()]) { try { renderer.initTexture(t); } catch (e) { /* ignore */ } }
    this._pa?.update(0.016, camera); this._pn?.update(0.016, camera);
    let frames = 0;
    const done = () => {
      if (++frames < 3) return requestAnimationFrame(done);
      for (const [k, o] of made) { let Pl = this.pools.get(k); if (!Pl) this.pools.set(k, Pl = []); o.visible = false; o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); if (!Pl.includes(o)) Pl.push(o); }
      for (const o of loose) o.parent?.remove(o);
    };
    requestAnimationFrame(done);
  }
}

// ------------------------------------------------------------------ ribbon geometry helpers
function ribbonGeometry(maxVerts, poly = false) {
  const n = poly ? maxVerts : maxVerts; // poly: 2 verts per point; segments: 4 verts per segment
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aU', new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
  const side = new Float32Array(n); for (let i = 0; i < n; i++) side[i] = i % 2 ? 1 : -1;
  g.setAttribute('aS', new THREE.BufferAttribute(side, 1));
  const idx = [];
  if (poly) { for (let i = 0; i < n / 2 - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
  else { for (let s = 0; s < n / 4; s++) { const a = s * 4; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
  g.setIndex(idx); g.setDrawRange(0, 0);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  return g;
}
function writeSegment(pos, tan, au, s, a, b) {
  const tx = b.x - a.x, ty = b.y - a.y, tz = b.z - a.z, i = s * 4;
  for (let k = 0; k < 4; k++) { const p = k < 2 ? a : b; pos.setXYZ(i + k, p.x, p.y, p.z); tan.setXYZ(i + k, tx, ty, tz); au.setX(i + k, k < 2 ? 0 : 1); }
}
function writePolyline(pos, tan, au, pts) {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const tx = b.x - a.x, ty = b.y - a.y, tz = b.z - a.z, u = i / (n - 1);
    for (let k = 0; k < 2; k++) { pos.setXYZ(i * 2 + k, p.x, p.y, p.z); tan.setXYZ(i * 2 + k, tx, ty, tz); au.setX(i * 2 + k, u); }
  }
}
// M = T(p) · R(rx, ry, rz) · T(−p), then an extra offset (dx, dy, dz)
function pivotRot(M, p, rx, ry, rz, dx, dy, dz) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e);
  M.makeRotationFromQuaternion(_q);
  const e = M.elements;
  // translation = p − R·p + d
  const x = p.x, y = p.y, z = p.z;
  e[12] = x - (e[0] * x + e[4] * y + e[8] * z) + dx;
  e[13] = y - (e[1] * x + e[5] * y + e[9] * z) + dy;
  e[14] = z - (e[2] * x + e[6] * y + e[10] * z) + dz;
  return M;
}

// every VFX instance (village + each Burrow floor) gets its SpellFX
registerVfxExtension(vfx => (vfx.spell = new SpellFX(vfx)));
/** the SpellFX of the current world */
export function spellFx(G) { const v = G.vfx; return v.spell || (v.spell = new SpellFX(v)); }
export { lerp as _lerp, UP as _UP, _s as _unit };
