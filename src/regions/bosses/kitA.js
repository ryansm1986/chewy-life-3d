// Shared kit for the Bosses A pair (Master Tengu, Danzaburō): one effect host per VFX instance (registered as a VFX
// extension, so it keeps running and fading after the boss has fallen, and vfx.clear() on the way out stops it), a
// particle atlas of leaves / feathers / wind streaks / steam, terrain-draped telegraph shapes (disc, ring, cone, line)
// with the vfx.telegraph look, pooled meshes, cartoon word pops, and the hit / push / summon helpers both fights use.
// Everything lives in the region's scene, so disposeScene() frees it with the region; module-level canvases and
// geometries are simply re-uploaded on the next visit.
import * as THREE from 'three';
import { registerVfxExtension } from '../../gfx/vfx.js';
import { ParticleLayer } from '../../gfx/particles.js';
import { MONSTERS } from '../../dungeon/monsters.js';
import { Events } from '../../core/events.js';
import { TAU, clamp, rand, ease } from '../../core/util.js';

export const C = h => new THREE.Color(h);
const _v = new THREE.Vector3();
export const CAM_R = new THREE.Vector3(1, 0, 0), CAM_U = new THREE.Vector3(0, 1, 0);
const CAM_F = new THREE.Vector3();

// ------------------------------------------------------------------ particle atlas (4x4, 128 px cells, drawn once)
export const F = { MAPLE: 0, BAMBOO: 1, FEATHER: 2, STREAK: 3, PUFF: 4, STAR4: 5, DIZZY: 6, RING: 7, DOT: 8, GINKGO: 9, CHUNK: 10, SWIRL: 11, DROP: 12, LEAFBIT: 13, SPARK: 14, NOTE: 15 };
let ATLAS = null;
function atlasTex() {
  if (ATLAS) return ATLAS;
  const N = 4, S = 128, c = document.createElement('canvas'); c.width = c.height = N * S;
  const g = c.getContext('2d'); g.lineJoin = 'round'; g.lineCap = 'round';
  const cell = (i, fn) => { g.save(); g.translate((i % N) * S + S / 2, Math.floor(i / N) * S + S / 2); fn(); g.restore(); };
  const INKL = 'rgba(52,24,34,0.55)';
  cell(F.MAPLE, () => { // 7-lobed momiji leaf, pale art (tinted per particle) with a soft ink edge and veins
    const lobes = [[0, 1], [0.95, 0.82], [-0.95, 0.82], [1.55, 0.6], [-1.55, 0.6], [2.25, 0.36], [-2.25, 0.36]];
    g.beginPath();
    const pts = [];
    for (let i = 0; i <= 28; i++) {
      const a = -Math.PI / 2 + (i / 28) * TAU, u = Math.sin(a * 3.5 + Math.PI / 2);
      let r = 22 + 30 * Math.pow(Math.max(0, u), 1.6);
      if (Math.sin(a) > 0.55) r *= 0.55; // stem side is shorter
      pts.push([Math.cos(a) * r, Math.sin(a) * r - 4]);
    }
    g.moveTo(pts[0][0], pts[0][1]); for (const p of pts) g.lineTo(p[0], p[1]); g.closePath();
    g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = INKL; g.lineWidth = 4; g.stroke();
    g.strokeStyle = 'rgba(80,30,30,0.35)'; g.lineWidth = 3;
    for (const [a] of lobes) { g.beginPath(); g.moveTo(0, 14); g.lineTo(Math.sin(a) * 40, -Math.cos(a) * 40 + 10); g.stroke(); }
    g.beginPath(); g.moveTo(0, 14); g.lineTo(0, 48); g.stroke();
  });
  cell(F.BAMBOO, () => { // slender bamboo leaf
    g.beginPath(); g.moveTo(-56, 0); g.quadraticCurveTo(-10, -17, 58, 0); g.quadraticCurveTo(-10, 17, -56, 0); g.closePath();
    g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = INKL; g.lineWidth = 3; g.stroke();
    g.strokeStyle = 'rgba(40,70,30,0.35)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(-52, 0); g.lineTo(52, 0); g.stroke();
  });
  cell(F.FEATHER, () => { // crow feather: dark vanes, pale rachis
    g.beginPath(); g.moveTo(-54, 0); g.quadraticCurveTo(-8, -22, 50, -6); g.quadraticCurveTo(58, 0, 50, 6); g.quadraticCurveTo(-8, 22, -54, 0); g.closePath();
    g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = INKL; g.lineWidth = 3; g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
    for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(i * 12, 0); g.lineTo(i * 12 + 10, -14); g.moveTo(i * 12, 0); g.lineTo(i * 12 + 10, 14); g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 3; g.beginPath(); g.moveTo(-60, 0); g.lineTo(50, 0); g.stroke();
  });
  cell(F.STREAK, () => { // soft tapered wind line (horizontal), for velocity-aligned streaks
    const gr = g.createLinearGradient(-60, 0, 60, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.85, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(-60, 0); g.quadraticCurveTo(20, -7, 60, 0); g.quadraticCurveTo(20, 7, -60, 0); g.fill();
  });
  cell(F.PUFF, () => { // soft cloud puff (steam / dust)
    for (const [x, y, r] of [[-16, 8, 30], [14, 6, 32], [0, -14, 34], [-26, -8, 22], [28, -6, 22]]) {
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    }
  });
  cell(F.STAR4, () => {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 20); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = '#ffffff'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? 9 : 56; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill();
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 20, 0, TAU); g.fill();
  });
  cell(F.DIZZY, () => { // chunky 5-point star with an ink edge (dizzy stars, stays readable in normal blend)
    g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 22 : 50; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath();
    g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = 'rgba(70,40,30,0.9)'; g.lineWidth = 7; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(-10, -12, 7, 0, TAU); g.fill();
  });
  cell(F.RING, () => { g.strokeStyle = '#ffffff'; g.lineWidth = 9; g.beginPath(); g.arc(0, 0, 50, 0, TAU); g.stroke(); });
  cell(F.DOT, () => { const gr = g.createRadialGradient(0, 0, 0, 0, 0, 60); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 60, 0, TAU); g.fill(); });
  cell(F.GINKGO, () => { // fan-shaped ginkgo leaf with a notch
    g.beginPath(); g.moveTo(0, 46); g.lineTo(-4, 10); g.quadraticCurveTo(-54, -2, -46, -34); g.quadraticCurveTo(-24, -52, -3, -38); g.lineTo(0, -26); g.lineTo(3, -38); g.quadraticCurveTo(24, -52, 46, -34); g.quadraticCurveTo(54, -2, 4, 10); g.closePath();
    g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = INKL; g.lineWidth = 4; g.stroke();
  });
  cell(F.CHUNK, () => { // rock chip
    g.beginPath(); [[-30, -18], [-6, -34], [28, -22], [36, 8], [12, 30], [-24, 26], [-38, 4]].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath();
    g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = 'rgba(50,34,30,0.85)'; g.lineWidth = 6; g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.moveTo(36, 8); g.lineTo(12, 30); g.lineTo(-24, 26); g.lineTo(4, 6); g.closePath(); g.fill();
  });
  cell(F.SWIRL, () => { // a curling wind stroke, tapered
    for (let i = 0; i < 40; i++) {
      const t = i / 39, a = t * 4.2, r = 50 - t * 34, x = Math.cos(a) * r, y = Math.sin(a) * r * 0.8;
      g.fillStyle = `rgba(255,255,255,${0.25 + 0.75 * Math.sin(t * Math.PI)})`; g.beginPath(); g.arc(x, y, 2 + 7 * Math.sin(t * Math.PI), 0, TAU); g.fill();
    }
  });
  cell(F.DROP, () => { g.beginPath(); g.moveTo(0, -46); g.bezierCurveTo(10, -24, 30, -6, 30, 14); g.arc(0, 14, 30, 0, Math.PI); g.bezierCurveTo(-30, -6, -10, -24, 0, -46); g.closePath(); g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = INKL; g.lineWidth = 4; g.stroke(); });
  cell(F.LEAFBIT, () => { g.beginPath(); g.ellipse(0, 0, 40, 24, 0.5, 0, TAU); g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = INKL; g.lineWidth = 4; g.stroke(); });
  cell(F.SPARK, () => { g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(0, -56); g.lineTo(9, 0); g.lineTo(0, 56); g.lineTo(-9, 0); g.closePath(); g.fill(); g.beginPath(); g.moveTo(-56, 0); g.lineTo(0, 9); g.lineTo(56, 0); g.lineTo(0, -9); g.closePath(); g.fill(); });
  cell(F.NOTE, () => { // a drum "pon" burst: little radiating dashes
    g.strokeStyle = '#ffffff'; g.lineWidth = 10;
    for (let i = 0; i < 8; i++) { const a = i * TAU / 8; g.beginPath(); g.moveTo(Math.cos(a) * 22, Math.sin(a) * 22); g.lineTo(Math.cos(a) * 52, Math.sin(a) * 52); g.stroke(); }
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (ATLAS = t);
}

// velocity-aligned sprites (wind streaks, feathers and leaves riding a gust): rotate the quad along the screen velocity
export function alignFn(q) {
  const sx = q.vx * CAM_R.x + q.vy * CAM_R.y + q.vz * CAM_R.z, sy = q.vx * CAM_U.x + q.vy * CAM_U.y + q.vz * CAM_U.z;
  q.rot = Math.atan2(sy, sx);
}
// particles that orbit a moving centre (q.cen = {x, z} object, q.ang, q.rad, q.w angular speed, q.climb)
export function orbitFn(q, dt) {
  q.ang += q.w * dt; q.rad += (q.rin || 0) * dt; q.y += (q.climb || 0) * dt;
  q.x = q.cen.x + Math.cos(q.ang) * q.rad; q.z = q.cen.z + Math.sin(q.ang) * q.rad;
}

// ------------------------------------------------------------------ cartoon words ("PON!", "KA-KA-KA!")
const WORDS = new Map();
function wordTex(word, a, b) {
  const key = word + a + b; let t = WORDS.get(key); if (t) return t;
  const c = document.createElement('canvas'); c.width = 512; c.height = 192; const g = c.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  let size = 118; g.font = `900 ${size}px Fredoka, "Baloo 2", system-ui, sans-serif`;
  while (g.measureText(word).width > 470 && size > 40) { size -= 6; g.font = `900 ${size}px Fredoka, "Baloo 2", system-ui, sans-serif`; }
  const gr = g.createLinearGradient(0, 40, 0, 150); gr.addColorStop(0, a); gr.addColorStop(1, b);
  g.lineWidth = 22; g.strokeStyle = '#3a2440'; g.strokeText(word, 256, 100);
  g.fillStyle = gr; g.fillText(word, 256, 96);
  g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,0.6)'; g.strokeText(word, 256, 92);
  t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  WORDS.set(key, t); return t;
}

// ------------------------------------------------------------------ telegraph shapes (the vfx.telegraph look, any shape)
// shape 0 = disc / ring (uIn = inner radius fraction), 1 = cone (apex at the origin, +z forward, uHalf = half angle),
// 2 = line (x in [-0.5, 0.5] * uW, z in [0, 1] * uL). e = signed distance to the edge in metres (< 0 inside), s = fill coordinate.
const TELE_VS = /* glsl */`varying vec2 vL; varying vec2 vW;
  void main() { vL = position.xz; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const TELE_FS = /* glsl */`uniform float uK, uT, uA, uShape, uR, uIn, uHalf, uW, uL, uFire, uBlob; uniform vec3 uC; varying vec2 vL; varying vec2 vW;
  void main() {
    float e, s, d = length(vL);
    if (uShape < 0.5) { e = max(d - 1.0, uIn - d) * uR; s = uIn > 0.0 ? (d - uIn) / (1.0 - uIn) : d; }
    else if (uShape < 1.5) { float a = abs(atan(vL.x, vL.y)); e = max((d - 1.0) * uR, d * uR * sin(clamp(a - uHalf, -1.4, 1.4))); if (a - uHalf > 1.4) e = d * uR; s = d; }
    else { float x = vL.x * uW, y = vL.y * uL; e = max(abs(x) - uW * 0.5, max(-y, y - uL)); s = vL.y; }
    if (e > 0.03) discard;
    float aa = max(fwidth(e), 0.004) * 1.4, inside = step(s, uK);
    float ink = smoothstep(-0.34 - aa, -0.34, e) * (1.0 - smoothstep(-aa * 0.5, aa * 0.5, e));
    float rim = smoothstep(-0.25 - aa, -0.25, e) * (1.0 - smoothstep(-0.11, -0.11 + aa, e));
    float lead = smoothstep(uK - 0.07, uK, s) * inside;
    float hatch = smoothstep(0.42, 0.5, abs(fract((vW.x - vW.y) * 0.9 + uT * 1.4) - 0.5) * 2.0 - 0.1);
    float urg = 0.72 + 0.28 * sin(uT * (9.0 + 22.0 * uK));
    vec3 hot = mix(uC, vec3(1.0), 0.36), ink3 = vec3(0.13, 0.05, 0.1);
    vec3 col = ink3; float a = 0.24;
    col = mix(col, uC, inside * (0.6 + 0.3 * hatch)); a = mix(a, 0.36 + 0.18 * hatch, inside);
    col = mix(col, hot, lead); a = max(a, lead * 0.82);
    col = mix(col, ink3, ink); a = max(a, ink * 0.72);
    col = mix(col, hot, rim); a = max(a, rim * (0.7 + 0.3 * urg));
    if (uBlob > 0.0) { float bl = (1.0 - smoothstep(uBlob * 0.55, uBlob, d)); col = mix(col, vec3(0.06, 0.03, 0.08), bl * 0.75); a = max(a, bl * 0.62); }
    col = mix(col, vec3(1.0, 0.98, 0.9), uFire * 0.7); a = max(a, uFire * 0.55 * step(e, 0.0));
    gl_FragColor = vec4(col, a * uA);
  }`;
const SHOCK_FS = /* glsl */`uniform float uK, uA, uW, uIn; uniform vec3 uCol, uCol2; varying vec2 vL; varying vec2 vW;
  void main() {
    float d = length(vL); if (d > 1.0 || d < uIn - 0.02) discard;
    float band = 1.0 - smoothstep(0.0, uW, abs(d - uK));
    float trail = smoothstep(uK - uW * 5.0, uK, d) * step(d, uK) * 0.4;
    float a = (band + trail) * uA; if (a < 0.01) discard;
    gl_FragColor = vec4(mix(uCol, uCol2, band * band), min(1.0, a));
  }`;
function teleMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: TELE_VS, fragmentShader: TELE_FS, transparent: true, depthWrite: false, toneMapped: false, fog: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    uniforms: { uK: { value: 0 }, uT: { value: 0 }, uA: { value: 1 }, uShape: { value: 0 }, uR: { value: 1 }, uIn: { value: 0 }, uHalf: { value: 0.5 }, uW: { value: 1 }, uL: { value: 1 }, uFire: { value: 0 }, uBlob: { value: 0 }, uC: { value: new THREE.Color() } },
  });
}
// a flat grid (x/z), draped over the terrain when placed
function gridGeo(x0, x1, z0, z1, nx, nz) {
  const g = new THREE.PlaneGeometry(1, 1, nx, nz); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { p.setX(i, x0 + (p.getX(i) + 0.5) * (x1 - x0)); p.setZ(i, z0 + (p.getZ(i) + 0.5) * (z1 - z0)); }
  g.attributes.position.setUsage(THREE.DynamicDrawUsage);
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------------ the per-VFX host
export class FxHost {
  constructor(vfx) {
    this.vfx = vfx; this.scene = vfx.scene; this.engine = vfx.engine;
    this.pools = new Map(); this.active = []; this.t = 0; this.acc = {};
    this._pn = null; this._pa = null;
    this.heightAt = (x, z) => 0;
  }
  /** normal-blend atlas layer (leaves, feathers, steam, chips) / additive one (streaks, sparkles, glows) */
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
  take(kind, make) {
    let P = this.pools.get(kind); if (!P) this.pools.set(kind, P = { free: [], all: [] });
    let o = P.free.pop();
    if (!o) { o = make(); o.frustumCulled = false; o.traverse?.(c => { c.frustumCulled = false; }); this.scene.add(o); P.all.push(o); }
    o.visible = true; return o;
  }
  give(kind, o) { if (!o) return; o.visible = false; this.pools.get(kind)?.free.push(o); }
  /** fn(dt, t) every frame until it returns false; end() once when it finishes or the world is cleared */
  run(update, end) { const f = { update, end, t: 0 }; this.active.push(f); return f; }
  update(dt) {
    if (!this.active.length && !this._pn && !this._pa) return;
    const cam = this.engine.camera; cam.matrixWorld.extractBasis(CAM_R, CAM_U, CAM_F);
    this.t += dt;
    const A = this.active;
    for (let i = 0; i < A.length; i++) {
      const f = A[i]; f.t += dt; let keep = false;
      try { keep = f.update(dt, f.t) !== false; } catch (e) { console.warn('[bossesA fx]', e); }
      if (!keep) { try { f.end?.(); } catch (e) { console.warn('[bossesA fx]', e); } A[i] = A[A.length - 1]; A.pop(); i--; }
    }
    if (this._pn) this._pn.update(dt, cam);
    if (this._pa) this._pa.update(dt, cam);
  }
  clear() {
    for (const f of this.active) { try { f.end?.(); } catch (e) { /* ignore */ } }
    this.active.length = 0;
    this._pn?.clear(); this._pa?.clear();
    for (const P of this.pools.values()) for (const o of P.all) o.visible = false;
  }
  /** Build a few of each pooled kind and DRAW them for 3 frames far below the ground (behind the region iris), so the
   *  first gust / drum of the fight doesn't pay for program links and uploads. `makers` = [[kind, make, n]]. */
  prewarm(makers) {
    const warm = [];
    makers = [['teleDisc', this.mkTeleDisc, 4], ['teleLine', this.mkTeleLine, 1], ['shock', this.mkShock, 2], ...makers];
    for (const [kind, make, n = 1] of makers) for (let i = 0; i < n; i++) { const o = this.take(kind, make); o.position.set(rand(-2, 2), -60, rand(-2, 2)); warm.push([kind, o]); }
    for (let i = 0; i < 3; i++) { this.p('n', F.MAPLE, 0, -60, 0, { life: 0.2 }); this.p('a', F.STREAK, 0, -60, 0, { life: 0.2 }); }
    const w = this.wordSprite(); w.position.set(0, -60, 0); warm.push(['word', w]);
    let frames = 0;
    const done = () => { if (++frames < 3) return requestAnimationFrame(done); for (const [k, o] of warm) this.give(k, o); };
    requestAnimationFrame(done);
  }
  // ---------------------------------------------------------------- particles (scratch spawn record: no garbage per spawn)
  p(layer, frame, x, y, z, o) {
    const S = SCR;
    S.frame = frame; S.x = x; S.y = y; S.z = z;
    S.vx = o.vx || 0; S.vy = o.vy || 0; S.vz = o.vz || 0; S.life = o.life || 1;
    S.size = o.size ?? 0.3; S.size1 = o.size1 ?? S.size; S.color = o.color || WHITE; S.color1 = o.color1 || null;
    S.alpha = o.alpha ?? 1; S.alpha1 = o.alpha1 ?? 0; S.rot = o.rot; S.spin = o.spin || 0; S.drag = o.drag || 0; S.grav = o.grav || 0;
    S.stretch = o.stretch || 1; S.fn = o.fn || null; S.fadeIn = o.fadeIn || 0; S.flicker = o.flicker || 0;
    return (layer === 'a' ? this.pa : this.pn).spawn(S);
  }
  /** a burst of leaves (frame, colours[]) flying out of a point */
  leafBurst(x, y, z, { n = 16, frame = F.MAPLE, colors = [WHITE], speed = 4, up = 3, size = 0.34, life = 1.3, grav = 3.2, drag = 1.6 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(0.35, 1) * speed;
      this.p('n', frame, x + Math.cos(a) * 0.2, y + rand(-0.1, 0.3), z + Math.sin(a) * 0.2, { vx: Math.cos(a) * s, vy: rand(0.4, 1) * up, vz: Math.sin(a) * s, life: rand(0.7, 1) * life, size: size * rand(0.7, 1.25), size1: size * 0.8, color: colors[i % colors.length], alpha: 1, alpha1: 0.9, spin: rand(-7, 7), drag, grav });
    }
  }
  /** soft puffs (smoke / steam / dust) */
  puffs(x, y, z, { n = 8, color = WHITE, size = 0.6, grow = 1.9, speed = 1.6, up = 1.2, life = 0.9, alpha = 0.85, r = 0.3 } = {}) {
    for (let i = 0; i < n; i++) { const a = rand(0, TAU), s = rand(0.3, 1) * speed; this.p('n', F.PUFF, x + Math.cos(a) * r, y + rand(0, 0.3), z + Math.sin(a) * r, { vx: Math.cos(a) * s, vy: rand(0.3, 1) * up, vz: Math.sin(a) * s, life: rand(0.7, 1) * life, size: size * rand(0.7, 1.2), size1: size * grow, color, alpha, alpha1: 0, spin: rand(-1.5, 1.5), drag: 2.5 }); }
  }
  twinkles(x, y, z, { n = 8, color = WHITE, r = 0.6, size = 0.3, life = 0.7, rise = 0.8 } = {}) {
    for (let i = 0; i < n; i++) this.p('a', F.STAR4, x + rand(-r, r), y + rand(0, r), z + rand(-r, r), { vy: rand(0.2, 1) * rise, life: rand(0.5, 1) * life, size: size * rand(0.6, 1.2), size1: 0.02, color, alpha: 1, alpha1: 0, spin: rand(-3, 3), fadeIn: 0.06 });
  }
  // ---------------------------------------------------------------- word pops
  wordSprite() { return this.take('word', () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false })); s.renderOrder = 30; return s; }); }
  word(text, pos, { a = '#fff2a0', b = '#ff9a6a', size = 1.5, life = 0.85, rise = 0.8, tilt = rand(-0.14, 0.14) } = {}) {
    const s = this.wordSprite();
    s.material.map = wordTex(text, a, b); s.material.rotation = tilt; s.material.opacity = 1; s.material.needsUpdate = true;
    const x = pos.x, y = pos.y, z = pos.z;
    this.run((dt, t) => {
      const k = t / life, pop = t < 0.16 ? ease.outBack(t / 0.16) : 1, wob = 1 + Math.sin(t * 24) * 0.06 * Math.max(0, 1 - t * 2.6);
      s.scale.set(size * pop * wob, size * 0.375 * pop / wob, 1);
      s.position.set(x, y + rise * ease.outCubic(Math.min(1, k)), z);
      s.material.opacity = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      return k < 1;
    }, () => this.give('word', s));
  }
  // ---------------------------------------------------------------- telegraphs
  mkTeleDisc() { const m = new THREE.Mesh(gridGeo(-1, 1, -1, 1, 30, 30), teleMaterial()); m.renderOrder = 9; return m; }
  mkTeleLine() { const m = new THREE.Mesh(gridGeo(-0.5, 0.5, 0, 1, 4, 44), teleMaterial()); m.renderOrder = 9; return m; }
  mkShock() {
    const m = new THREE.Mesh(gridGeo(-1, 1, -1, 1, 26, 26), new THREE.ShaderMaterial({ vertexShader: TELE_VS, fragmentShader: SHOCK_FS, transparent: true, depthWrite: false, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
      uniforms: { uK: { value: 0 }, uA: { value: 1 }, uW: { value: 0.07 }, uIn: { value: 0 }, uCol: { value: new THREE.Color() }, uCol2: { value: new THREE.Color() } } }));
    m.renderOrder = 10; return m;
  }
  /** A ground warning shape that fills over `time`. o: { shape: 'disc'|'ring'|'cone'|'line', x, z, yaw, r, inner (m),
   *  half (rad), w, len, time, color, blob }. → handle { k, fire(), kill(), place(x, z, yaw) }. Call fire() when the
   *  attack lands (white flash, fades) or kill() to drop it; it fades by itself 1.2 s after filling otherwise. */
  tele(o) {
    const shape = o.shape === 'line' ? 2 : o.shape === 'cone' ? 1 : 0;
    const kind = shape === 2 ? 'teleLine' : 'teleDisc';
    const m = this.take(kind, shape === 2 ? this.mkTeleLine : this.mkTeleDisc);
    const U = m.material.uniforms;
    U.uShape.value = shape; U.uK.value = 0; U.uT.value = 0; U.uA.value = 1; U.uFire.value = 0; U.uBlob.value = o.blob || 0;
    U.uC.value.set(o.color || '#ff3a5a');
    if (shape === 2) { U.uW.value = o.w || 2; U.uL.value = o.len || 8; m.scale.set(U.uW.value, 1, U.uL.value); }
    else { const R = o.r || 2; U.uR.value = R; U.uIn.value = o.inner ? o.inner / R : 0; U.uHalf.value = o.half || 0.5; m.scale.set(R, 1, R); }
    const time = Math.max(0.05, o.time ?? 1), host = this;
    const h = { m, k: 0, fired: 0, dead: false, x: o.x, z: o.z, yaw: o.yaw || 0, time,
      place(x, z, yaw = h.yaw) { h.x = x; h.z = z; h.yaw = yaw; host.drape(m, x, z, yaw); },
      fire() { if (!h.fired && !h.dead) h.fired = 1e-4; },
      kill() { if (!h.dead && !h.fired) { h.fired = 1e-4; h.quiet = true; } },
    };
    h.place(o.x, o.z, o.yaw || 0);
    this.run((dt, t) => {
      U.uT.value = t;
      if (!h.fired) { h.k = Math.min(1, t / time); U.uK.value = h.k; if (t > time + (o.hold ?? 1.2)) h.kill(); return true; }
      h.fired += dt; const f = h.fired / (h.quiet ? 0.12 : 0.22);
      U.uFire.value = h.quiet ? 0 : Math.max(0, 1 - f * 1.4); U.uA.value = Math.max(0, 1 - f);
      return f < 1;
    }, () => { h.dead = true; this.give(kind, m); });
    return h;
  }
  /** a flat shock band sweeping out from r0 to r1 (m) over `life` s */
  shockRing(x, z, r0, r1, { life = 0.32, color = '#fff2c0', color2 = '#ffffff', width = 0.07, alpha = 0.95 } = {}) {
    const m = this.take('shock', this.mkShock);
    const U = m.material.uniforms; U.uCol.value.set(color); U.uCol2.value.set(color2); U.uW.value = width * 8 / Math.max(1, r1); U.uIn.value = r0 / r1; U.uK.value = r0 / r1; U.uA.value = alpha;
    m.scale.set(r1, 1, r1); this.drape(m, x, z, 0);
    const k0 = r0 / r1;
    this.run((dt, t) => { const k = Math.min(1, t / life); U.uK.value = k0 + (1 - k0) * ease.outCubic(k); U.uA.value = alpha * (1 - k * k); return k < 1; }, () => this.give('shock', m));
  }
  /** cartoon dizzy stars circling `cen` (an object with x / z, e.g. the monster's pos) at height y for dur s */
  dizzy(cen, y, dur, { r = 0.5, n = 5, color = '#ffe25a', size = 0.32 } = {}) {
    for (let i = 0; i < n; i++) {
      const q = this.p('n', F.DIZZY, cen.x, y, cen.z, { life: dur, size, size1: size * 0.8, color: C(color), alpha: 1, alpha1: 0.6, fn: orbitFn, spin: 2 });
      q.cen = cen; q.ang = i / n * TAU; q.rad = r; q.w = 5; q.rin = 0; q.climb = 0; q.y = y + Math.sin(i * 2.1) * 0.06;
    }
  }
  /** move a grid mesh to (x, z, yaw) and lay its vertices on the terrain (flat ground: a no-op past the first pose) */
  drape(m, x, z, yaw) {
    const hy = this.heightAt(x, z);
    m.position.set(x, hy, z); m.rotation.set(0, yaw, 0); m.updateMatrixWorld(true);
    const p = m.geometry.attributes.position, sx = m.scale.x, sz = m.scale.z, c = Math.cos(yaw), s = Math.sin(yaw);
    let flat = true;
    for (let i = 0; i < p.count; i++) {
      const lx = p.getX(i) * sx, lz = p.getZ(i) * sz;
      const wx = x + lx * c + lz * s, wz = z - lx * s + lz * c;
      const y = this.heightAt(wx, wz) - hy + 0.07;
      if (Math.abs(y - p.getY(i)) > 1e-3) { p.setY(i, y); flat = false; }
    }
    if (!flat) { p.needsUpdate = true; m.geometry.computeBoundingSphere(); }
  }
}
const WHITE = new THREE.Color('#ffffff');
const SCR = { frame: 0, x: 0, y: 0, z: 0 };

// one host per VFX instance (the village's stays empty), created on first use
registerVfxExtension(vfx => {
  const ext = { hosts: new Map(), update(dt) { for (const h of ext.hosts.values()) h.update(dt); }, clear() { for (const h of ext.hosts.values()) h.clear(); } };
  vfx.bossesA = ext;
  return ext;
});
/** the effect host `key` of this VFX (made with make(vfx) the first time) */
export function fxHost(vfx, key, make) {
  let ext = vfx.bossesA;
  if (!ext) { // (a VFX made before this module loaded)
    ext = vfx.bossesA = { hosts: new Map() };
    ext.update = dt => { for (const h of ext.hosts.values()) h.update(dt); };
    ext.clear = () => { for (const h of ext.hosts.values()) h.clear(); };
    vfx.ext?.push(ext);
  }
  let h = ext.hosts.get(key);
  if (!h) ext.hosts.set(key, h = make(vfx));
  return h;
}

// ------------------------------------------------------------------ fight helpers
export const sfx = (name, pos, o) => Events.emit('sfx', name, pos ? (o ? { pos, ...o } : { pos }) : o || {});
/** a damage roll from the monster's range, times k */
export function roll(m, k = 1) { const d = m.stats.dmg; return Math.max(1, Math.round((d[0] + Math.random() * (d[1] - d[0])) * k)); }
/** the first registered id (region monsters may not exist yet) */
export function pickId(ids, fallback) { for (const id of ids) if (MONSTERS[id]) return id; return MONSTERS[fallback] ? fallback : null; }
/** hit the player (and allies inside test(x, z)) — test(x, z, r) → bool. → true if the player was hit */
export function hitWhere(m, test, raw, { element = 'phys', knock = 0.6, from = m.pos, allies = true } = {}) {
  const G = m.G, C = m.mode.combat, P = G.player;
  let hit = false;
  if (P && !G.playerDead && !P.invuln && test(P.pos.x, P.pos.z, P.radius || 0.3)) { hit = C.hitPlayer(raw, { element, level: m.level, from, knock, src: m }) !== 0; }
  if (allies) for (const e of C.entities) if (e.alive && e.team === 'ally' && e !== P && !e.untargetable && e.pos && test(e.pos.x, e.pos.z, e.radius || 0.3)) C.hitAlly(e, Math.round(raw * 0.8), { element, from });
  return hit;
}
/** shove the player along (dx, dz) at `speed` m/s this frame (rides Player.knock, so walls still stop him) */
export function pushPlayer(G, dx, dz, speed) {
  const P = G.player; if (!P || G.playerDead || P.leap || P.dash) return;
  const k = P.knock ||= new THREE.Vector3();
  const L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
  // raise the knock's component along the push to `speed` (a stronger hit knock already under way is kept)
  const along = k.x * ux + k.z * uz;
  if (along < speed) { k.x += ux * (speed - along); k.z += uz * (speed - along); }
}
/** summon `ids[i]` adds around (cx, cz) in a ring r0..r1 m (walkable spots only), boss adds (they vanish with it) */
export function summonAdds(m, ids, cx, cz, { r0 = 2.6, r1 = 4.6, onEach } = {}) {
  const M = m.mode, W = m.world, out = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]; if (!MONSTERS[id]) continue;
    let x = cx, z = cz, ok = false;
    for (let k = 0; k < 14 && !ok; k++) {
      const a = (i / ids.length) * TAU + rand(-0.5, 0.5) + k * 0.7, r = rand(r0, r1);
      x = cx + Math.cos(a) * r; z = cz + Math.sin(a) * r;
      ok = W.walkable(x, z) && W.walkable(x + 0.4, z) && W.walkable(x - 0.4, z) && W.walkable(x, z + 0.4) && W.walkable(x, z - 0.4);
    }
    if (!ok) continue;
    const a = new m.constructor(M, id, { level: M.layout?.mlvl ?? m.level, x, z, rng: () => M.rng?.next?.() ?? Math.random() });
    a.aggro = true; a.bossAdd = true;
    M.monsters.push(a); M.combat.add(a); out.push(a);
    onEach?.(a, x, z);
  }
  return out;
}
/** how far (m, up to max) a straight path from (x, z) along (dx, dz) stays on walkable ground `r` wide */
export function clearRun(W, x, z, dx, dz, max, r = 0.8) {
  const px = -dz, pz = dx;
  for (let s = 0.5; s <= max; s += 0.35) {
    const cx = x + dx * s, cz = z + dz * s;
    if (!W.walkable(cx, cz) || !W.walkable(cx + px * r, cz + pz * r) || !W.walkable(cx - px * r, cz - pz * r)) return Math.max(0, s - 0.35);
  }
  return max;
}
/** the fight's arena (layout.arena for regions; a circle around the boss's home otherwise) */
export function arenaOf(m, home) {
  const A = m.mode.layout?.arena;
  return A ? { x: A.x, z: A.z, r: A.r } : { x: home.x, z: home.z, r: 11 };
}
export { clamp, rand, TAU, ease };
