// Poe's effects (docs/POE.md): the thrown fūma's spin and trail, smoke (the Smoke Bomb's puff and the cloud it leaves,
// dodge puffs, vanish wisps), Shadow Step's ink puddles and streak, the sneeze. One PoeFX per VFX instance (the
// village's and each Burrow floor's / region's), created through vfx.js' extension hook, so its meshes live in that
// world's scene and go with it.
//
// Budget rules (as spellFx.js): every mesh comes from a per-kind pool (added once, hidden when idle); geometries and
// canvas textures are module-level and shared; materials are per PoeFX; particles go through two atlas layers (one
// normal-blend for the smoke and the ink, one additive for glints) — two draw calls for every puff, wisp and spark.
// Readability: smoke is normal-blend and capped in size and alpha (it never whites the screen: an opaque wall of puffs
// would hide the foes), glints are few and small, flashes go through vfx.light (the world's LightPool, damped on bosses).
//
// API (combat/poeSkills.js is the caller):
//   poeFx(G) → PoeFX        fumaFly(getState) → handle { end() }      trail(pos, dir, dt)
//   puff(pos, { r, n, tint })      smokeCloud(pos, r, dur) → handle     wisps(pos, n, dark)
//   puddle(pos, { r, life })       streak(a, b)        flecks(pos, n)     catchGlint(pos)
//   sneeze(pos, dir)               word(text, pos, o)  blindSwirl(e)     dodge(pos)
import * as THREE from 'three';
import { ParticleLayer } from './particles.js';
import { glowTexture } from './textures.js';
import { registerVfxExtension } from './vfx.js';
import { rand, TAU, clamp, ease } from '../core/util.js';
import { fumaMat, fumaObject, setFumaLook, prewarmPoeGear } from '../actors/poeGear.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const C = h => new THREE.Color(h);
export const POE_COL = {
  smoke: C('#efe8f4'), smoke2: C('#cfc4dc'), smokeDk: C('#9a8fb0'), cream: C('#f8f0dc'), bone: C('#f4ead2'), mustard: C('#ffd860'),
  ink: C('#2a2236'), ink2: C('#4a3c62'), violet: C('#9a86d8'), moss: C('#8fd07a'), white: C('#ffffff'), pink: C('#ffb8c8'), sky: C('#cfe6ff'),
};
const P = POE_COL;

// ================================================================== textures (canvas, module-level, drawn once)
export const PF = { PUFF: 0, CURL: 1, STREAK: 2, DOT: 3, SPARK: 4, STAR: 5, LEAF: 6, BONE: 7, INK: 8, RING: 9, DROP: 10, SHURI: 11, KUNAI: 12, PAW: 13, SEAL: 14, CROSS: 15 };
const INK = '#3a2a44';
const TEX = {};
function canvasTex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true; return t; }
function newCanvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.lineJoin = 'round'; g.lineCap = 'round'; return { c, g }; }
function bonePath(g, len, hw, kr) {
  const x0 = -len / 2, x1 = len / 2, d = kr * 0.72; hw = Math.min(hw, d * 0.95);
  const s = Math.sqrt(kr * kr - (d - hw) * (d - hw)), s2 = Math.sqrt(Math.max(0, kr * kr - d * d));
  g.beginPath(); g.moveTo(x0 + s, -hw); g.lineTo(x1 - s, -hw);
  g.arc(x1, -d, kr, Math.atan2(d - hw, -s), Math.atan2(d, s2) + TAU); g.arc(x1, d, kr, -Math.atan2(d, s2), Math.atan2(hw - d, -s) + TAU);
  g.lineTo(x0 + s, hw); g.arc(x0, d, kr, Math.atan2(hw - d, s), Math.atan2(-d, -s2) + TAU); g.arc(x0, -d, kr, Math.atan2(d, -s2), Math.atan2(d - hw, s) + TAU);
  g.closePath();
}
// 4x4 atlas, 128 px cells, white / grey art tinted by the particle colour
function atlasTex() {
  if (TEX.atlas) return TEX.atlas;
  const N = 4, S = 128, { c, g } = newCanvas(N * S);
  const cell = (i, fn) => { g.save(); g.translate((i % N) * S + S / 2, Math.floor(i / N) * S + S / 2); fn(g); g.restore(); };
  const rg = (x, y, r, stops, fx, fy) => { const gr = g.createRadialGradient(fx ?? x, fy ?? y, 0, x, y, r); for (const [t, col] of stops) gr.addColorStop(t, col); return gr; };
  // a cartoon smoke ball: a lumpy round puff, lit from the top-left, a soft lilac shade underneath and a faint ink rim
  cell(PF.PUFF, g => {
    g.beginPath();
    for (let i = 0; i <= 64; i++) { const a = (i / 64) * TAU, r = 44 + 5 * Math.sin(a * 5 + 0.6) + 2.5 * Math.sin(a * 9); const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.closePath();
    g.fillStyle = rg(0, 0, 54, [[0, '#ffffff'], [0.55, '#f6f2fa'], [0.82, '#d8d0e4'], [1, '#b8acc8']], -14, -16); g.fill();
    g.strokeStyle = 'rgba(90,70,110,0.35)'; g.lineWidth = 3; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.ellipse(-16, -18, 13, 8, -0.6, 0, TAU); g.fill();
  });
  // a smoke curl: the swirl that marks a cartoon puff
  cell(PF.CURL, g => {
    g.strokeStyle = 'rgba(80,60,100,0.55)'; g.lineWidth = 13; g.beginPath(); for (let i = 0; i <= 40; i++) { const t = i / 40, a = t * 4.6 + 0.4, r = 8 + 34 * t; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.stroke();
  });
  cell(PF.STREAK, g => { const lg = g.createLinearGradient(-58, 0, 58, 0); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.7, 'rgba(255,255,255,0.95)'); lg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = lg; g.beginPath(); g.ellipse(0, 0, 58, 6, 0, 0, TAU); g.fill(); });
  cell(PF.DOT, g => { g.fillStyle = rg(0, 0, 50, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.85)'], [1, 'rgba(255,255,255,0)']]); g.beginPath(); g.arc(0, 0, 50, 0, TAU); g.fill(); });
  cell(PF.SPARK, g => {
    g.fillStyle = rg(0, 0, 30, [[0, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(-64, -64, 128, 128);
    g.fillStyle = '#fff'; for (const [w, h] of [[6, 56], [56, 6]]) { g.beginPath(); g.moveTo(-w, 0); g.quadraticCurveTo(0, 0, 0, -h); g.quadraticCurveTo(0, 0, w, 0); g.quadraticCurveTo(0, 0, 0, h); g.quadraticCurveTo(0, 0, -w, 0); g.fill(); }
  });
  cell(PF.STAR, g => {
    g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 22 : 46; const x = Math.cos(a) * r, y = Math.sin(a) * r + 4; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath();
    g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = INK; g.lineWidth = 7; g.stroke();
  });
  cell(PF.LEAF, g => { // a bamboo leaf
    g.rotate(-0.6); g.beginPath(); g.moveTo(0, -54); g.quadraticCurveTo(20, -10, 2, 54); g.quadraticCurveTo(-18, -8, 0, -54); g.closePath();
    const lg = g.createLinearGradient(-16, -50, 16, 50); lg.addColorStop(0, '#ffffff'); lg.addColorStop(1, '#cfd8c8'); g.fillStyle = lg; g.fill();
    g.strokeStyle = 'rgba(60,90,50,0.6)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -46); g.quadraticCurveTo(4, 0, 2, 48); g.stroke();
  });
  cell(PF.BONE, g => { g.rotate(-0.5); bonePath(g, 72, 12, 18); g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = INK; g.lineWidth = 6; g.stroke(); });
  cell(PF.INK, g => { // a soft ink blob (the shadow puddle's wisps)
    g.beginPath(); for (let i = 0; i <= 48; i++) { const a = (i / 48) * TAU, r = 42 + 6 * Math.sin(a * 4 + 1) + 3 * Math.sin(a * 7); const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath();
    g.fillStyle = rg(0, 0, 50, [[0, 'rgba(255,255,255,1)'], [0.7, 'rgba(235,235,240,0.95)'], [1, 'rgba(210,210,220,0)']]); g.fill();
  });
  cell(PF.RING, g => { g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 16; g.beginPath(); g.arc(0, 0, 40, 0, TAU); g.stroke(); g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 40, 0, TAU); g.stroke(); });
  cell(PF.DROP, g => { g.beginPath(); g.moveTo(0, -46); g.bezierCurveTo(9, -26, 28, -6, 28, 14); g.arc(0, 14, 28, 0, Math.PI); g.bezierCurveTo(-28, -6, -9, -26, 0, -46); g.closePath(); g.fillStyle = rg(0, 12, 36, [[0, '#ffffff'], [1, '#d8e8f0']], -8, 4); g.fill(); g.strokeStyle = 'rgba(110,140,160,0.8)'; g.lineWidth = 3; g.stroke(); });
  cell(PF.SHURI, g => { // a tiny four-armed bone shuriken (Thousand Star Flurry, Shuriken Rain)
    g.save(); for (let i = 0; i < 4; i++) { g.save(); g.rotate(i * Math.PI / 2 + Math.PI / 4); g.translate(22, 0); bonePath(g, 46, 8, 12); g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = INK; g.lineWidth = 5; g.stroke(); g.restore(); } g.restore();
    g.beginPath(); g.arc(0, 0, 14, 0, TAU); g.fillStyle = '#f0f0f0'; g.fill(); g.strokeStyle = INK; g.lineWidth = 5; g.stroke(); g.beginPath(); g.arc(0, 0, 5, 0, TAU); g.fillStyle = INK; g.fill();
  });
  cell(PF.KUNAI, g => {
    g.rotate(-Math.PI / 4); g.beginPath(); g.moveTo(0, -56); g.lineTo(12, -16); g.lineTo(5, -10); g.lineTo(5, 34); g.lineTo(-5, 34); g.lineTo(-5, -10); g.lineTo(-12, -16); g.closePath();
    g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = INK; g.lineWidth = 5; g.stroke(); g.beginPath(); g.arc(0, 44, 9, 0, TAU); g.lineWidth = 5; g.stroke();
  });
  cell(PF.PAW, g => { g.beginPath(); g.ellipse(0, 14, 25, 20, 0, 0, TAU); for (const [dx, dy, r] of [[-26, -10, 10], [-10, -26, 10.5], [10, -26, 10.5], [26, -10, 10]]) { g.moveTo(dx + r, dy); g.ellipse(dx, dy, r, r * 1.18, 0, 0, TAU); } g.fillStyle = '#fff'; g.fill(); });
  cell(PF.SEAL, g => { // a hand-seal sigil: a ring of ticks round a paw
    g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 50, 0, TAU); g.stroke();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.beginPath(); g.moveTo(Math.cos(a) * 38, Math.sin(a) * 38); g.lineTo(Math.cos(a) * 46, Math.sin(a) * 46); g.stroke(); }
  });
  cell(PF.CROSS, g => { g.strokeStyle = INK; g.lineWidth = 14; g.beginPath(); g.moveTo(-34, -34); g.lineTo(34, 34); g.moveTo(34, -34); g.lineTo(-34, 34); g.stroke(); g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.stroke(); });
  return (TEX.atlas = canvasTex(c));
}
// the thrown fūma's motion blur: a soft disc with four bright swept wedges (tinted bone-cream, normal blend)
function blurTex() {
  if (TEX.blur) return TEX.blur;
  const { c, g } = newCanvas(256); g.translate(128, 128);
  for (let k = 0; k < 4; k++) {
    const a0 = (k / 4) * TAU;
    for (let i = 0; i < 18; i++) { const a = a0 - i * 0.07; g.fillStyle = `rgba(255,255,255,${0.42 * (1 - i / 18)})`; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 122, a - 0.07, a); g.closePath(); g.fill(); }
  }
  const gr = g.createRadialGradient(0, 0, 18, 0, 0, 126); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.15)'); gr.addColorStop(0.92, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 126, 0, TAU); g.fill();
  // a thin ink rim and a bright inner edge: the disc's outline reads on pale sand as well as on grass
  g.strokeStyle = 'rgba(58,40,70,0.5)'; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 117, 0, TAU); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 111, 0, TAU); g.stroke();
  return (TEX.blur = canvasTex(c));
}
// Shadow Step's ink puddle: a dark pool with a wobbly rim and a soft violet edge
function puddleTex() {
  if (TEX.puddle) return TEX.puddle;
  const { c, g } = newCanvas(256); g.translate(128, 128);
  g.beginPath(); for (let i = 0; i <= 80; i++) { const a = (i / 80) * TAU, r = 100 + 9 * Math.sin(a * 5 + 0.7) + 5 * Math.sin(a * 11); const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath();
  const gr = g.createRadialGradient(0, 0, 10, 0, 0, 116); gr.addColorStop(0, 'rgba(30,22,40,0.92)'); gr.addColorStop(0.72, 'rgba(36,26,50,0.85)'); gr.addColorStop(0.9, 'rgba(90,70,130,0.55)'); gr.addColorStop(1, 'rgba(120,100,170,0)');
  g.fillStyle = gr; g.fill();
  g.strokeStyle = 'rgba(160,140,220,0.55)'; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 84, 0.4, 2.2); g.stroke(); g.beginPath(); g.arc(0, 0, 70, 3.4, 4.6); g.stroke();
  return (TEX.puddle = canvasTex(c));
}
// cartoon word pops ("ACHOO!", "POOF!") — thick ink outline, white rim, candy fill
const WORD = new Map();
function wordTex(word, a, b) {
  const key = word + a + b; if (WORD.has(key)) return WORD.get(key);
  const { c, g } = newCanvas(512, 200); g.translate(256, 104); g.rotate(-0.06);
  g.font = 'bold 116px Fredoka, "Baloo 2", "Arial Rounded MT Bold", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = g.measureText(word).width, k = Math.min(1, 440 / w); g.scale(k, k);
  g.lineWidth = 26; g.strokeStyle = INK; g.strokeText(word, 0, 0);
  g.lineWidth = 12; g.strokeStyle = '#ffffff'; g.strokeText(word, 0, 0);
  const lg = g.createLinearGradient(0, -50, 0, 50); lg.addColorStop(0, a); lg.addColorStop(1, b); g.fillStyle = lg; g.fillText(word, 0, 0);
  const t = canvasTex(c); WORD.set(key, t); return t;
}
const G_PLANE = (() => { let g; return () => g || (g = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2)); })();
// a soft band for flat rings on the floor (the smoke bomb's push, landings, seals): bright edge, soft inside
function bandTex() {
  if (TEX.band) return TEX.band;
  const { c, g } = newCanvas(128); g.translate(64, 64);
  const gr = g.createRadialGradient(0, 0, 30, 0, 0, 63); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.35)'); gr.addColorStop(0.86, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 63, 0, TAU); g.fill();
  return (TEX.band = canvasTex(c));
}
// the floor marker under a thrown fūma: a thin dashed ring with four little ticks (it turns with the spin)
function markTex() {
  if (TEX.mark) return TEX.mark;
  const { c, g } = newCanvas(128); g.translate(64, 64);
  g.strokeStyle = '#ffffff'; g.lineWidth = 5;
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; g.beginPath(); g.arc(0, 0, 54, a + 0.08, a + TAU / 12 - 0.08); g.stroke(); }
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + TAU / 8; g.beginPath(); g.moveTo(Math.cos(a) * 40, Math.sin(a) * 40); g.lineTo(Math.cos(a) * 48, Math.sin(a) * 48); g.stroke(); }
  return (TEX.mark = canvasTex(c));
}
// the fūma's ribbon trail: a flat strip through its last RIB_N positions, widest at the fūma, fading to nothing
const RIB_N = 16;
function ribbonMesh() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RIB_N * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(RIB_N * 2 * 4), 4).setUsage(THREE.DynamicDrawUsage));
  const idx = []; for (let i = 0; i < RIB_N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }));
  m.renderOrder = 10;
  m.userData = { pts: Array.from({ length: RIB_N }, () => new THREE.Vector3()), n: 0, acc: 0, w: 0.5 };
  return m;
}
function pushRibbon(m, x, y, z) {
  const R = m.userData, P0 = R.pts;
  const last = P0[RIB_N - 1]; for (let i = RIB_N - 1; i > 0; i--) P0[i] = P0[i - 1]; P0[0] = last.set(x, y, z); // (rotate the records: no allocation)
  R.n = Math.min(RIB_N, R.n + 1);
}
const RIB_C = new THREE.Color('#fff0d0'), RIB_E = new THREE.Color('#e8d4a8');
function writeRibbon(m) {
  const R = m.userData, pos = m.geometry.attributes.position, col = m.geometry.attributes.color, n = R.n;
  for (let i = 0; i < RIB_N; i++) {
    const j = Math.min(i, Math.max(0, n - 1)), p = R.pts[j], q = R.pts[Math.min(j + 1, Math.max(0, n - 1))], o = R.pts[Math.max(0, j - 1)];
    let dx = o.x - q.x, dz = o.z - q.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const u = n > 1 ? j / (n - 1) : 1, w = R.w * (1 - 0.7 * u) * (i < n ? 1 : 0), a = i < n ? 0.3 * (1 - u) ** 1.5 : 0; // (a soft cream wake, not a sheet)
    pos.setXYZ(i * 2, p.x - dz * w, p.y, p.z + dx * w); pos.setXYZ(i * 2 + 1, p.x + dz * w, p.y, p.z - dx * w);
    const c = u < 0.5 ? RIB_C : RIB_E;
    col.setXYZW(i * 2, c.r, c.g, c.b, a); col.setXYZW(i * 2 + 1, c.r, c.g, c.b, a);
  }
  pos.needsUpdate = true; col.needsUpdate = true;
}

// ================================================================== the effect system
export class PoeFX {
  constructor(vfx) {
    this.vfx = vfx; this.scene = vfx.scene; this.engine = vfx.engine;
    this.active = []; this.pools = new Map(); this.shared = new Map(); this.acc = {};
    this._pa = null; this._pn = null; this.t = 0;
  }
  get pa() { // additive glints (damped on bosses, like vfx.glow)
    if (!this._pa) {
      const L = this._pa = new ParticleLayer(this.scene, atlasTex(), { additive: true, max: 900, order: 13, grid: 4 });
      const raw = L.spawn.bind(L), vfx = this.vfx;
      L.spawn = o => { if (vfx.dampers.length && !vfx._undamped) { const k = vfx.dampAt(o.x, o.y, o.z); if (k < 1) { o.alpha = (o.alpha ?? 1) * k; if (o.size != null) o.size *= 0.55 + 0.45 * k; } } return raw(o); };
    }
    return this._pa;
  }
  get pn() { return this._pn || (this._pn = new ParticleLayer(this.scene, atlasTex(), { additive: false, max: 1400, order: 12, grid: 4 })); }
  emit(key, rate, dt) { const a = (this.acc[key] || 0) + rate * dt; const n = Math.floor(a); this.acc[key] = a - n; return n; }
  take(kind, make) { let Pq = this.pools.get(kind); if (!Pq) this.pools.set(kind, Pq = []); const o = Pq.pop() || this.adopt(make()); o.visible = true; return o; }
  adopt(o) { o.frustumCulled = false; o.traverse?.(c => { c.frustumCulled = false; }); this.scene.add(o); return o; }
  give(kind, o) { if (!o) return; o.visible = false; this.pools.get(kind)?.push(o); }
  mat(key, make) { let m = this.shared.get(key); if (!m) this.shared.set(key, m = make()); return m; }
  run(update, end) { const f = { update, end, t: 0, done: false }; this.active.push(f); return f; }
  update(dt) {
    this.t += dt;
    const A = this.active;
    for (let i = 0; i < A.length; i++) {
      const f = A[i]; f.t += dt;
      let keep = false;
      try { keep = f.update(dt, f.t) !== false; } catch (e) { console.warn('[poeFx]', e); }
      if (!keep) { f.done = true; try { f.end?.(); } catch (e) { console.warn('[poeFx]', e); } A[i] = A[A.length - 1]; A.pop(); i--; }
    }
    const cam = this.engine.camera;
    if (this._pa) this._pa.update(dt, cam);
    if (this._pn) this._pn.update(dt, cam);
  }
  clear() {
    for (const f of this.active) { f.done = true; try { f.end?.(); } catch (e) { /* ignore */ } }
    this.active.length = 0; this._pa?.clear(); this._pn?.clear();
  }

  // ------------------------------------------------------------------ the thrown fūma
  /** a flying fūma (scale: the size it is on her back, so it doesn't shrink when it leaves her). → handle
   *  { set(pos, spin, bank, speed, groundY), end() }. It reads at the game camera on both passes: the bone cross at full
   *  size, a spin disc as wide as the fūma (cream swept wedges inside a thin ink rim, so it shows on sand and on grass),
   *  a flat ribbon trailing its path, and a soft shadow with a faint ring on the floor under it */
  fumaFly(look, scale = 1.4) {
    const g = this.take('fuma', () => {
      const root = new THREE.Group();
      const m = fumaObject(look, fumaMat()); m.name = 'fuma_thrown'; // (the procedural fūma or the Blender one: poeGear.js)
      const blur = new THREE.Mesh(G_PLANE(), new THREE.MeshBasicMaterial({ map: blurTex(), color: P.bone, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }));
      blur.renderOrder = 11;
      root.add(m, blur); root.userData = { m, blur };
      return root;
    });
    const sh = this.take('fumaShadow', () => {
      const o = new THREE.Group();
      const blob = new THREE.Mesh(G_PLANE(), new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#1a1424', transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -3 }));
      const ring = new THREE.Mesh(G_PLANE(), new THREE.MeshBasicMaterial({ map: markTex(), color: P.cream, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -3 }));
      blob.renderOrder = 6; ring.renderOrder = 6; o.add(blob, ring); o.userData = { blob, ring };
      return o;
    });
    const rib = this.take('fumaRibbon', () => ribbonMesh());
    const { m, blur } = g.userData, { blob, ring } = sh.userData, R = rib.userData;
    setFumaLook(m, look);
    m.rotation.set(-Math.PI / 2, 0, 0); m.scale.setScalar(scale); // (flat: its plane horizontal)
    const rad = 0.3 * scale; // (the fūma's radius: hub + arm + knob)
    blur.scale.setScalar(rad * 1.04);
    blob.scale.setScalar(rad * 1.25); ring.scale.setScalar(rad * 1.1);
    R.n = 0; R.acc = 0; rib.visible = false;
    const H = { root: g, alive: true, spin: 0, end: () => {
      if (!H.alive) return; H.alive = false; this.give('fuma', g); this.give('fumaShadow', sh);
      // the ribbon drains away behind the caught fūma
      const n0 = R.n;
      this.run((dt, t) => { R.n = Math.max(0, Math.round(n0 * (1 - t / 0.16))); writeRibbon(rib); return t < 0.16 && R.n > 1; }, () => this.give('fumaRibbon', rib));
    } };
    H.set = (pos, spin, bank, speed, groundY = 0) => {
      g.position.copy(pos); g.rotation.set(bank, 0, 0);
      m.rotation.z = spin; blur.rotation.y = -spin * 0.5;
      blur.material.opacity = clamp(0.18 + speed / 30, 0, 0.62); blur.visible = speed > 2;
      // the floor marker: a soft shadow, and a faint cream ring that turns with it
      const lift = clamp(1 - (pos.y - groundY - 0.6) / 3);
      sh.position.set(pos.x, groundY + 0.03, pos.z); ring.rotation.y = -spin * 0.15;
      blob.material.opacity = 0.42 * lift; ring.material.opacity = 0.45 * lift;
      // the ribbon: the last ~0.3 s of its path, flat, a little under it
      // (a point every 0.14 m of path, the head always at the fūma: ~2 m of trail whatever the frame rate)
      if (R.n < 2 || Math.hypot(pos.x - R.pts[1].x, pos.z - R.pts[1].z) > 0.14) pushRibbon(rib, pos.x, pos.y - 0.04, pos.z);
      else R.pts[0].set(pos.x, pos.y - 0.04, pos.z);
      R.w = rad * 0.62; rib.visible = R.n > 1;
      writeRibbon(rib);
    };
    return H;
  }
  /** the fūma's wake: air streaks off its rim and a few bone-dust motes (allocation-free: spawn records are recycled) */
  trail(pos, dir, dt, k = 1) {
    for (let i = this.emit('ft', 46 * k, dt); i > 0; i--) {
      const a = rand(0, TAU), r = 0.26;
      this.pn.spawn({ frame: PF.STREAK, x: pos.x + Math.cos(a) * r, y: pos.y + rand(-0.03, 0.05), z: pos.z + Math.sin(a) * r, vx: -dir.x * 2.5 - Math.sin(a) * 2, vz: -dir.z * 2.5 + Math.cos(a) * 2, life: rand(0.16, 0.26), size: rand(0.32, 0.5), size1: 0.1, color: P.cream, alpha: 0.75, alpha1: 0, fn: streakFn });
    }
    if (Math.random() < dt * 14) this.pn.spawn({ frame: PF.DOT, x: pos.x, y: pos.y - 0.05, z: pos.z, vy: 0.3, life: 0.35, size: 0.14, size1: 0.04, color: P.bone, alpha: 0.8, alpha1: 0 });
  }
  /** bone flecks off a fūma slash or hit */
  flecks(pos, n = 5, color = P.bone) {
    for (let i = 0; i < n; i++) { const a = rand(0, TAU), s = rand(1.5, 3.5); this.pn.spawn({ frame: PF.BONE, x: pos.x, y: pos.y, z: pos.z, vx: Math.cos(a) * s, vy: rand(1.5, 3.5), vz: Math.sin(a) * s, life: rand(0.3, 0.45), size: rand(0.1, 0.16), size1: 0.06, color, alpha: 1, alpha1: 0.4, grav: 9, spin: rand(-12, 12) }); }
  }
  catchGlint(pos) {
    this.pa.spawn({ frame: PF.SPARK, x: pos.x, y: pos.y, z: pos.z, life: 0.25, size: 0.5, size1: 0.12, color: P.mustard, alpha: 0.9, alpha1: 0, spin: 5 });
    for (let i = 0; i < 4; i++) { const a = rand(0, TAU); this.pa.spawn({ frame: PF.SPARK, x: pos.x, y: pos.y, z: pos.z, vx: Math.cos(a) * 2, vy: rand(0.5, 1.5), vz: Math.sin(a) * 2, life: 0.3, size: 0.16, size1: 0.03, color: P.cream, alpha: 1, alpha1: 0, drag: 3 }); }
  }

  // ------------------------------------------------------------------ smoke
  /** a cartoon smoke burst: puffs thrown out in a ring and up, a few swirl curls, a soft ground ring. r ≈ radius */
  puff(pos, { r = 1.6, n = 16, tint = P.smoke, low = false } = {}) {
    const x0 = pos.x, y0 = pos.y || 0, z0 = pos.z, k = Math.min(1.2, r / 1.6 + 0.25);
    // a ring of puffs thrown out low and fast (they stop at about r), a few rolling upward; the middle stays thin so the
    // hero and the foes in it read (the cloud that lingers is smokeCloud)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rand(-0.2, 0.2), s = rand(0.7, 1) * r * 3.2, up = low ? rand(0.1, 0.6) : rand(0.3, 1.3);
      const c = i % 3 === 0 ? P.smoke2 : tint;
      this.pn.spawn({ frame: PF.PUFF, x: x0 + Math.cos(a) * 0.25, y: y0 + rand(0.12, 0.45), z: z0 + Math.sin(a) * 0.25, vx: Math.cos(a) * s, vy: up, vz: Math.sin(a) * s, life: rand(0.55, 0.85), size: rand(0.3, 0.42) * k, size1: rand(0.55, 0.72) * k, color: c, alpha: 0.82, alpha1: 0, drag: 5.2, spin: rand(-1, 1), rot: rand(0, TAU) });
    }
    for (let i = 0; i < 4; i++) { const a = rand(0, TAU), d = rand(0.4, 0.9) * r; this.pn.spawn({ frame: PF.CURL, x: x0 + Math.cos(a) * d, y: y0 + rand(0.35, 0.9), z: z0 + Math.sin(a) * d, vy: 0.45, life: rand(0.45, 0.7), size: rand(0.24, 0.32), size1: 0.4, color: P.white, alpha: 0.95, alpha1: 0, spin: rand(2, 4) * (i % 2 ? 1 : -1), fadeIn: 0.06 }); }
    // the bang: a small soft bloom that's gone in a blink, and a soft ring that stays inside the cloud (normal blend,
    // capped in size and alpha: the burst never tints more of the floor than the smoke itself — no dome, no flood light)
    this.pn.spawn({ frame: PF.PUFF, x: x0, y: y0 + 0.5, z: z0, life: 0.16, size: Math.min(r * 0.4, 0.9), size1: Math.min(r * 0.7, 1.5), color: P.white, alpha: 0.5, alpha1: 0 });
    this.ring(pos, Math.min(r, 3) * 0.8, 0.4, P.smoke2, 0.3); // (its edge ends at ~0.7 r: inside the puffs)
    this.vfx.light(_a.set(x0, y0 + 0.8, z0), '#efe4ff', 1.2, Math.min(r, 3), 0.18);
  }
  /** the cloud a smoke bomb leaves: slow puffs drifting inside r for dur (kept low and see-through: foes stay readable) */
  smokeCloud(pos, r = 2.6, dur = 1.6) {
    const x0 = pos.x, y0 = pos.y || 0, z0 = pos.z;
    return this.run((dt, t) => {
      const fade = 1 - clamp((t - dur * 0.6) / (dur * 0.4));
      for (let i = this.emit('cloud', 13 * fade, dt); i > 0; i--) {
        const a = rand(0, TAU), d = (0.35 + 0.65 * Math.sqrt(Math.random())) * r * 0.9; // (mostly round the rim: the middle stays see-through)
        this.pn.spawn({ frame: PF.PUFF, x: x0 + Math.cos(a) * d, y: y0 + rand(0.08, 0.45), z: z0 + Math.sin(a) * d, vx: rand(-0.2, 0.2), vy: rand(0.06, 0.22), vz: rand(-0.2, 0.2), life: rand(0.9, 1.3), size: rand(0.4, 0.55), size1: rand(0.7, 0.9), color: i % 2 ? P.smoke : P.smoke2, alpha: 0.3 * fade, alpha1: 0, drag: 1, spin: rand(-0.5, 0.5), fadeIn: 0.25 });
      }
      return t < dur;
    });
  }
  /** dark wisps curling up (the shadow puddle; dark = ink, else lilac smoke) */
  wisps(pos, n = 8, dark = true) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), d = rand(0.1, 0.45);
      this.pn.spawn({ frame: dark ? PF.INK : PF.PUFF, x: pos.x + Math.cos(a) * d, y: (pos.y || 0) + rand(0.05, 0.3), z: pos.z + Math.sin(a) * d, vx: Math.cos(a) * 0.6, vy: rand(1.2, 2.4), vz: Math.sin(a) * 0.6, life: rand(0.35, 0.6), size: rand(0.18, 0.3), size1: rand(0.35, 0.5), color: dark ? (i % 2 ? P.ink : P.ink2) : P.smoke, alpha: dark ? 0.85 : 0.7, alpha1: 0, drag: 2.5, spin: rand(-2, 2) });
    }
    for (let i = 0; i < (dark ? 3 : 0); i++) { const a = rand(0, TAU); this.pa.spawn({ frame: PF.SPARK, x: pos.x + Math.cos(a) * 0.3, y: (pos.y || 0) + rand(0.3, 0.9), z: pos.z + Math.sin(a) * 0.3, vy: 0.8, life: 0.4, size: 0.2, size1: 0.04, color: P.violet, alpha: 0.9, alpha1: 0 }); }
  }
  /** a ring on the ground (smoke and puddles) */
  /** a flat ring on the floor growing from r0 to r1 and fading (a pooled mesh, normal blend: it can't white anything out) */
  ring(pos, r1, life = 0.45, color = P.smoke, alpha = 0.75, r0 = 0.2) {
    const m = this.take('gring', () => { const o = new THREE.Mesh(G_PLANE(), new THREE.MeshBasicMaterial({ map: bandTex(), transparent: true, depthWrite: false, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -3 })); o.renderOrder = 7; return o; });
    m.material.color.copy(color); m.position.set(pos.x, (pos.y || 0) + 0.05, pos.z);
    this.run((dt, t) => { const k = clamp(t / life); m.scale.setScalar(r0 + (r1 - r0) * ease.outCubic(k)); m.material.opacity = alpha * (1 - k * k); return k < 1; }, () => this.give('gring', m));
  }

  // ------------------------------------------------------------------ Shadow Step
  /** an ink puddle on the floor that spreads, holds and drains away */
  puddle(pos, { r = 0.75, life = 0.7 } = {}) {
    const m = this.take('puddle', () => { const o = new THREE.Mesh(G_PLANE(), new THREE.MeshBasicMaterial({ map: puddleTex(), transparent: true, opacity: 0, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3 })); o.renderOrder = 6; return o; });
    m.position.set(pos.x, (pos.y || 0) + 0.03, pos.z); m.rotation.y = rand(0, TAU);
    this.run((dt, t) => {
      const k = t / life, grow = ease.outBack(clamp(t / 0.16)), drain = clamp((k - 0.6) / 0.4);
      m.scale.setScalar(r * (0.25 + 0.75 * grow) * (1 - 0.5 * drain)); m.material.opacity = 0.9 * (1 - drain);
      return k < 1;
    }, () => this.give('puddle', m));
  }
  /** a dark streak from a to b (the step through the shadows), drawn as ink wisps along the line */
  streak(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), n = Math.min(16, Math.ceil(d * 2.2));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      this.pn.spawn({ frame: PF.INK, x: a.x + dx * u, y: (a.y || 0) + 0.45 + Math.sin(u * Math.PI) * 0.35, z: a.z + dz * u, vy: 0.2, life: 0.18 + 0.2 * u, size: 0.24, size1: 0.05, color: i % 2 ? P.ink : P.ink2, alpha: 0.7, alpha1: 0, fadeIn: 0.02 });
      if (i % 3 === 0) this.pa.spawn({ frame: PF.STREAK, x: a.x + dx * u, y: (a.y || 0) + 0.6, z: a.z + dz * u, life: 0.22, size: 0.5, size1: 0.1, color: P.violet, alpha: 0.6, alpha1: 0, rot: -Math.atan2(dz, dx) });
    }
  }

  // ------------------------------------------------------------------ comedy and status
  /** a floating cartoon word */
  word(text, pos, { a = '#fffbe8', b = '#ffb8c8', size = 1.3, life = 0.9, rise = 0.7 } = {}) {
    const s = this.take('word', () => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false })); sp.renderOrder = 30; return sp; });
    s.material.map = wordTex(text, a, b); s.material.needsUpdate = true; s.material.rotation = rand(-0.1, 0.1);
    const x = pos.x, y = pos.y, z = pos.z;
    this.run((dt, t) => {
      const k = t / life, pop = t < 0.16 ? ease.outBack(t / 0.16) : 1, wob = 1 + Math.sin(t * 24) * 0.05 * Math.max(0, 1 - t * 2.5);
      s.scale.set(size * pop * wob, size * 0.39 * pop / wob, 1); s.position.set(x, y + rise * ease.outCubic(Math.min(1, k)), z);
      s.material.opacity = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      return k < 1;
    }, () => this.give('word', s));
  }
  /** ACHOO!: a little spray off her nose (pos), the word, a dust puff */
  sneeze(pos, dir) {
    for (let i = 0; i < 9; i++) { const s = rand(1.5, 3.2); this.pn.spawn({ frame: PF.DROP, x: pos.x, y: pos.y, z: pos.z, vx: dir.x * s + rand(-0.8, 0.8), vy: rand(0.2, 1.4), vz: dir.z * s + rand(-0.8, 0.8), life: rand(0.25, 0.4), size: rand(0.06, 0.1), size1: 0.03, color: P.sky, alpha: 0.95, alpha1: 0.2, grav: 7 }); }
    this.pn.spawn({ frame: PF.PUFF, x: pos.x + dir.x * 0.3, y: pos.y, z: pos.z + dir.z * 0.3, vx: dir.x * 1.5, vz: dir.z * 1.5, life: 0.45, size: 0.25, size1: 0.6, color: P.smoke, alpha: 0.7, alpha1: 0, drag: 3 });
    this.word('ACHOO!', _b.set(pos.x, pos.y + 0.55, pos.z), { a: '#fff6e0', b: '#ff9ab8', size: 1.15 });
  }
  /** a blinded foe: a squinty smoke curl and a pepper sparkle over its head now and then (call per foe, rate-limited) */
  blindSwirl(e) {
    const h = (e.height || 1) * (e.scale || 1);
    this.pn.spawn({ frame: PF.CURL, x: e.pos.x + rand(-0.15, 0.15), y: e.pos.y + h * 0.9 + 0.15, z: e.pos.z + rand(-0.15, 0.15), vy: 0.35, life: 0.6, size: 0.22, size1: 0.3, color: P.smoke2, alpha: 0.9, alpha1: 0, spin: 3 });
  }
  /** a dodge: a tiny smoke puff at her side and two motion streaks */
  dodge(pos, dir) {
    this.puff(pos, { r: 0.45, n: 7, low: true });
    for (let i = 0; i < 2; i++) this.pa.spawn({ frame: PF.STREAK, x: pos.x, y: (pos.y || 0) + 0.5 + i * 0.25, z: pos.z, vx: dir.x * 3, vz: dir.z * 3, life: 0.2, size: 0.6, size1: 0.2, color: P.cream, alpha: 0.6, alpha1: 0, rot: -Math.atan2(dir.z, dir.x) });
  }
  /** compile everything once (behind a floor load): no first-throw hitch */
  prewarm(renderer, camera) {
    const p = new THREE.Vector3(0, -50, 0);
    const h = this.fumaFly({}); h.set(p, 0, 0, 10);
    this.puff(p, { n: 3 }); this.puddle(p); this.word('POOF!', p, { life: 0.05 }); this.pa; this.pn;
    try { renderer.compile(this.scene, camera); } catch (e) { /* ignore */ }
    prewarmPoeGear(renderer, camera, this.scene); // (her smoke ghost and the fūma's own material)
    requestAnimationFrame(() => requestAnimationFrame(() => h.end()));
  }
}
const CAM_R = new THREE.Vector3(1, 0, 0);
function streakFn(q) { q.rot = Math.atan2(q.vz, q.vx) * (CAM_R.x >= 0 ? -1 : 1); }

registerVfxExtension(vfx => (vfx.poe = new PoeFX(vfx)));
export function poeFx(G) { const v = G.vfx; return v.poe || (v.poe = new PoeFX(v)); }
// (for gfx/poeFxArts.js: the rest of her effects extend PoeFX with these shared pieces)
export { G_PLANE, newCanvas, canvasTex, TEX, atlasTex, bandTex, streakFn, bonePath };
