// The Shih Tzu's effects (docs/SHIHTZU.md): the flail's trail (a ribbon following the real ball on its chain), its
// thuds and dust, the ghostlight paw curse (the flying paw print, the splat, the dripping hex on a foe), gloom puffs.
// One ShihtzuFX per VFX instance (the village's and each floor's / zone's), created through vfx.js' extension hook, so
// its meshes live in that world's scene and go with it.
//
// Budget rules (as poeFx.js): every mesh comes from a per-kind pool (added once, hidden when idle); geometries and
// canvas textures are module-level and shared; particles go through two atlas layers (normal blend for the gloom puffs,
// paw prints and drops, so they read on any floor; additive only for small ghostlight glints).
// Readability (docs/POE.md §3d): no effect washes the screen: the ghostlight is a teal accent on cream and ink, every
// glow is small and capped where it's made, lights are short and small.
//
// API (combat/shihtzuSkills.js is the caller):
//   stzFx(G) → ShihtzuFX     trail(F) → handle { on(k), end() }      thud(pos, r, big)     swoosh(pos, facing, o)
//   pawShot(from) → handle { set(pos, dir), end() }                   splat(pos, r)         hexMark(e) → handle
//   drip(pos, n)             gloomPuff(pos, n, r)                      glint(pos, n)         gather(pos, dt, k)
import * as THREE from 'three';
import { ParticleLayer } from './particles.js';
import { registerVfxExtension } from './vfx.js';
import { rand, TAU, clamp, ease } from '../core/util.js';
import { flailBall } from '../actors/shihtzuGear.js';
import { ghostTick } from './shihtzuGhosts.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _v = new THREE.Vector3();
const C = h => new THREE.Color(h);
export const STZ_COL = {
  ghost: C('#5ce0c0'), ghostDk: C('#2f9a86'), ghostLt: C('#bff6e6'), plum: C('#4a2a4a'), plumLt: C('#9a6a9a'), lilac: C('#e6dcef'),
  cream: C('#f8f2ea'), ink: C('#2a1f30'), silver: C('#c8ccd8'), gloom: C('#6a6078'), gloomLt: C('#b8b0c8'), dust: C('#e6d8c4'),
};
const K = STZ_COL;

// ================================================================== textures (canvas, module-level, drawn once)
export const SF = { PUFF: 0, PAW: 1, DROP: 2, SPARK: 3, DOT: 4, RING: 5, CLOUD: 6, BADGE: 7, WISP: 8, STAR: 9, NOTE: 10, PIP: 11, HEART: 12, PAGE: 13, CHUNK: 14, MOTE: 15 };
const INK = '#2a1f30';
export const TEX = {};
export function canvasTex(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true; return t; }
export function newCanvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.lineJoin = 'round'; g.lineCap = 'round'; return { c, g }; }
/** a dog's paw print: the big pad and four toes (centred on 0,0, about 2s across) */
export function pawPath(g, s) {
  g.beginPath(); g.ellipse(0, s * 0.32, s * 0.55, s * 0.45, 0, 0, TAU);
  for (const [x, y, r] of [[-0.62, -0.28, 0.22], [-0.22, -0.62, 0.24], [0.22, -0.62, 0.24], [0.62, -0.28, 0.22]]) { g.moveTo(x * s + r * s, y * s); g.ellipse(x * s, y * s, r * s, r * s * 1.18, 0, 0, TAU); }
}
// 4x4 atlas, 128 px cells, white / grey art tinted by the particle colour
function atlasTex() {
  if (TEX.atlas) return TEX.atlas;
  const N = 4, S = 128, { c, g } = newCanvas(N * S);
  const cell = (i, fn) => { g.save(); g.translate((i % N) * S + S / 2, Math.floor(i / N) * S + S / 2); fn(g); g.restore(); };
  const rg = (x, y, r, stops, fx, fy) => { const gr = g.createRadialGradient(fx ?? x, fy ?? y, 0, x, y, r); for (const [t, col] of stops) gr.addColorStop(t, col); return gr; };
  // a gloom puff: a lumpy little cloud ball, lit top-left, with a soft ink rim (tinted grey-violet by the caller)
  cell(SF.PUFF, g => {
    g.beginPath();
    for (let i = 0; i <= 64; i++) { const a = (i / 64) * TAU, r = 42 + 6 * Math.sin(a * 4 + 1.1) + 3 * Math.sin(a * 9); const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.closePath(); g.fillStyle = rg(0, 0, 52, [[0, '#ffffff'], [0.6, '#eeeaf2'], [1, '#bdb4c8']], -14, -16); g.fill();
    g.strokeStyle = 'rgba(42,31,48,0.45)'; g.lineWidth = 4; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.ellipse(-15, -17, 12, 7, -0.6, 0, TAU); g.fill();
  });
  // the curse's paw print: an ink-rimmed paw with two drips running off the pad
  cell(SF.PAW, g => {
    g.save(); g.translate(0, -6);
    g.fillStyle = '#ffffff'; pawPath(g, 40); g.fill();
    g.beginPath(); g.moveTo(-8, 30); g.quadraticCurveTo(-10, 46, -6, 52); g.quadraticCurveTo(-2, 46, -3, 30); g.fill();
    g.beginPath(); g.moveTo(10, 28); g.quadraticCurveTo(9, 38, 12, 42); g.quadraticCurveTo(15, 37, 14, 28); g.fill();
    g.strokeStyle = INK; g.lineWidth = 6; pawPath(g, 40); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath(); g.ellipse(-8, 8, 9, 5, -0.5, 0, TAU); g.fill();
    g.restore();
  });
  // a drip: a teardrop with an ink rim and a highlight
  cell(SF.DROP, g => {
    g.beginPath(); g.moveTo(0, -46); g.bezierCurveTo(14, -18, 30, 6, 30, 20); g.arc(0, 20, 30, 0, Math.PI); g.bezierCurveTo(-30, 6, -14, -18, 0, -46); g.closePath();
    g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = INK; g.lineWidth = 6; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.0)'; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 5; g.beginPath(); g.arc(0, 20, 18, 3.6, 4.5); g.stroke();
  });
  cell(SF.SPARK, g => {
    g.fillStyle = rg(0, 0, 30, [[0, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(-64, -64, 128, 128);
    g.fillStyle = '#fff'; for (const [w, h] of [[6, 52], [52, 6]]) { g.beginPath(); g.moveTo(-w, 0); g.quadraticCurveTo(0, 0, 0, -h); g.quadraticCurveTo(0, 0, w, 0); g.quadraticCurveTo(0, 0, 0, h); g.quadraticCurveTo(0, 0, -w, 0); g.fill(); }
  });
  cell(SF.DOT, g => { g.fillStyle = rg(0, 0, 50, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]); g.beginPath(); g.arc(0, 0, 50, 0, TAU); g.fill(); });
  cell(SF.RING, g => { g.strokeStyle = '#ffffff'; g.lineWidth = 9; g.beginPath(); g.arc(0, 0, 46, 0, TAU); g.stroke(); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 16; g.beginPath(); g.arc(0, 0, 38, 0, TAU); g.stroke(); });
  // a grumpy little storm cloud with a frown (Grumble Cloud; the gloom's mascot)
  cell(SF.CLOUD, g => {
    g.beginPath(); for (const [x, y, r] of [[-28, 8, 24], [0, -6, 32], [28, 6, 24], [12, 18, 20], [-12, 18, 20]]) { g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); }
    g.strokeStyle = INK; g.lineWidth = 10; g.stroke(); g.fillStyle = rg(0, 0, 56, [[0, '#ffffff'], [1, '#d6d0de']], -10, -20); g.fill(); // (the ink under the fill: one outline round the whole cloud)
    g.fillStyle = INK; for (const x of [-12, 12]) { g.beginPath(); g.ellipse(x, 6, 3.5, 5, 0, 0, TAU); g.fill(); }
    g.lineWidth = 4; g.beginPath(); g.moveTo(-18, -4); g.lineTo(-7, 0); g.moveTo(18, -4); g.lineTo(7, 0); g.stroke(); // (grumpy brows)
    g.beginPath(); g.arc(0, 24, 8, 1.15 * Math.PI, 1.85 * Math.PI); g.stroke(); // (the frown)
  });
  // the hex badge over a cursed foe (in its own colours: spawned white): a dripping teal paw in an ink ring
  cell(SF.BADGE, g => {
    g.fillStyle = 'rgba(42,31,48,0.85)'; g.beginPath(); g.arc(0, 0, 50, 0, TAU); g.fill();
    g.strokeStyle = '#5ce0c0'; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 47, 0, TAU); g.stroke();
    g.save(); g.translate(0, -4); g.fillStyle = '#bff6e6'; pawPath(g, 26); g.fill(); g.restore();
    g.fillStyle = '#5ce0c0'; g.beginPath(); g.moveTo(-6, 22); g.quadraticCurveTo(-8, 34, -4, 40); g.quadraticCurveTo(0, 34, -1, 22); g.fill();
  });
  // a soft wisp (ghostlight trailing off things)
  cell(SF.WISP, g => { g.fillStyle = rg(0, 0, 40, [[0, 'rgba(255,255,255,0.95)'], [1, 'rgba(255,255,255,0)']]); g.beginPath(); g.ellipse(0, 0, 22, 54, 0, 0, TAU); g.fill(); });
  cell(SF.STAR, g => {
    g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 20 : 44; const x = Math.cos(a) * r, y = Math.sin(a) * r + 4; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath();
    g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = INK; g.lineWidth = 7; g.stroke();
  });
  // a little music note (the awoo)
  cell(SF.NOTE, g => { g.fillStyle = '#ffffff'; g.strokeStyle = INK; g.lineWidth = 6; g.beginPath(); g.ellipse(-10, 24, 18, 13, -0.4, 0, TAU); g.fill(); g.stroke(); g.fillRect(4, -40, 7, 64); g.strokeRect(4, -40, 7, 64); g.beginPath(); g.moveTo(11, -40); g.quadraticCurveTo(34, -30, 30, -8); g.stroke(); });
  // a stack pip
  cell(SF.PIP, g => { g.fillStyle = '#ffffff'; g.strokeStyle = INK; g.lineWidth = 8; g.beginPath(); g.arc(0, 0, 30, 0, TAU); g.fill(); g.stroke(); });
  // a heart (Grandpaw's lick, borrowed warmth arriving)
  cell(SF.HEART, g => { g.beginPath(); g.moveTo(0, 38); g.bezierCurveTo(-58, 2, -34, -46, 0, -18); g.bezierCurveTo(34, -46, 58, 2, 0, 38); g.closePath(); g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = INK; g.lineWidth = 7; g.stroke(); g.fillStyle = 'rgba(255,255,255,0.0)'; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 5; g.beginPath(); g.arc(-18, -14, 10, 3.4, 4.6); g.stroke(); });
  // a tome page fluttering out (a cream sheet with ink lines)
  cell(SF.PAGE, g => { g.rotate(-0.15); g.fillStyle = '#ffffff'; g.strokeStyle = INK; g.lineWidth = 6; g.beginPath(); g.moveTo(-30, -40); g.lineTo(26, -40); g.quadraticCurveTo(36, -2, 28, 40); g.lineTo(-30, 40); g.quadraticCurveTo(-22, 0, -30, -40); g.closePath(); g.fill(); g.stroke(); g.lineWidth = 4; g.strokeStyle = 'rgba(42,31,48,0.5)'; for (const y of [-20, -6, 8, 22]) { g.beginPath(); g.moveTo(-18, y); g.lineTo(18, y); g.stroke(); } });
  // a chunk of earth (the Heaviest Sigh's crack spits them up)
  cell(SF.CHUNK, g => { g.beginPath(); g.moveTo(-34, -10); g.lineTo(-8, -36); g.lineTo(30, -24); g.lineTo(38, 12); g.lineTo(6, 36); g.lineTo(-30, 24); g.closePath(); g.fillStyle = '#ffffff'; g.fill(); g.strokeStyle = INK; g.lineWidth = 7; g.stroke(); g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.moveTo(-20, -8); g.lineTo(-6, -24); g.lineTo(12, -18); g.closePath(); g.fill(); });
  // a warm mote (borrowed warmth, the lantern's light): a soft dot with a bright core
  cell(SF.MOTE, g => { g.fillStyle = rg(0, 0, 40, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.85)'], [1, 'rgba(255,255,255,0)']]); g.beginPath(); g.arc(0, 0, 40, 0, TAU); g.fill(); });
  return (TEX.atlas = canvasTex(c));
}
// the flail's trail: soft across its width, a bright core and a ghostlight edge (u along the trail, v across)
function trailTex() {
  if (TEX.trail) return TEX.trail;
  const { c, g } = newCanvas(64, 64);
  const gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(0.82, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return (TEX.trail = canvasTex(c));
}
// a floor splat: the paw print with a wobbly gloom puddle round it
function splatTex() {
  if (TEX.splat) return TEX.splat;
  const { c, g } = newCanvas(256); g.translate(128, 128);
  g.beginPath(); for (let i = 0; i <= 80; i++) { const a = (i / 80) * TAU, r = 96 + 12 * Math.sin(a * 6 + 0.4) + 6 * Math.sin(a * 13); const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath();
  const gr = g.createRadialGradient(0, 0, 10, 0, 0, 112); gr.addColorStop(0, 'rgba(42,31,48,0.55)'); gr.addColorStop(0.75, 'rgba(47,154,134,0.5)'); gr.addColorStop(1, 'rgba(92,224,192,0)'); g.fillStyle = gr; g.fill();
  for (let i = 0; i < 9; i++) { const a = i * 0.7 + 0.3, r = 108 + (i % 3) * 8; g.fillStyle = 'rgba(92,224,192,0.6)'; g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, 7 - (i % 3) * 2, 0, TAU); g.fill(); }
  g.fillStyle = 'rgba(191,246,230,0.95)'; pawPath(g, 52); g.fill(); g.strokeStyle = 'rgba(42,31,48,0.85)'; g.lineWidth = 7; pawPath(g, 52); g.stroke();
  return (TEX.splat = canvasTex(c));
}
export const G_PLANE = (() => { let g; return () => g || (g = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2)); })();

// the flail's trail ribbon: a camera-facing strip through the ball's last TR_N positions, widest at the ball
const TR_N = 14, TR_STEP = 0.11; // (samples, and the spacing along the path: about a 1.4 m tail)
function trailMesh() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TR_N * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TR_N * 2 * 4), 4).setUsage(THREE.DynamicDrawUsage));
  const uv = new Float32Array(TR_N * 2 * 2); for (let i = 0; i < TR_N; i++) { uv[i * 4] = i / (TR_N - 1); uv[i * 4 + 1] = 0; uv[i * 4 + 2] = i / (TR_N - 1); uv[i * 4 + 3] = 1; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const idx = []; for (let i = 0; i < TR_N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: trailTex(), vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }));
  m.renderOrder = 10; m.frustumCulled = false;
  m.userData = { pts: Array.from({ length: TR_N }, () => new THREE.Vector3()), n: 0, fade: 0 };
  return m;
}
const TR_CORE = C('#e8dcf0'), TR_EDGE = C('#4ad0b0');

// ================================================================== the effect system
export class ShihtzuFX {
  constructor(vfx) {
    this.vfx = vfx; this.scene = vfx.scene; this.engine = vfx.engine;
    this.active = []; this.pools = new Map(); this.acc = {};
    this._pa = null; this._pn = null; this.t = 0;
  }
  get pa() { // additive ghostlight glints (damped on bosses, like vfx.glow)
    if (!this._pa) {
      const L = this._pa = new ParticleLayer(this.scene, atlasTex(), { additive: true, max: 700, order: 13, grid: 4 });
      const raw = L.spawn.bind(L), vfx = this.vfx;
      L.spawn = o => { if (vfx.dampers.length && !vfx._undamped) { const k = vfx.dampAt(o.x, o.y, o.z); if (k < 1) { o.alpha = (o.alpha ?? 1) * k; if (o.size != null) o.size *= 0.55 + 0.45 * k; } } return raw(o); };
    }
    return this._pa;
  }
  get pn() { return this._pn || (this._pn = new ParticleLayer(this.scene, atlasTex(), { additive: false, max: 1200, order: 12, grid: 4 })); }
  emit(key, rate, dt) { const a = (this.acc[key] || 0) + rate * dt; const n = Math.floor(a); this.acc[key] = a - n; return n; }
  take(kind, make) { let Pq = this.pools.get(kind); if (!Pq) this.pools.set(kind, Pq = []); const o = Pq.pop() || this.adopt(make()); o.visible = true; return o; }
  adopt(o) { o.frustumCulled = false; o.traverse?.(c => { c.frustumCulled = false; }); this.scene.add(o); return o; }
  give(kind, o) { if (!o) return; o.visible = false; this.pools.get(kind)?.push(o); }
  run(update, end) { const f = { update, end, t: 0, done: false }; this.active.push(f); return f; }
  update(dt) {
    this.t += dt; ghostTick(this.t);
    const A = this.active;
    for (let i = 0; i < A.length; i++) {
      const f = A[i]; f.t += dt;
      let keep = false;
      try { keep = f.update(dt, f.t) !== false; } catch (e) { console.warn('[stzFx]', e); }
      if (!keep) { f.done = true; try { f.end?.(); } catch (e) { console.warn('[stzFx]', e); } A[i] = A[A.length - 1]; A.pop(); i--; }
    }
    const cam = this.engine.camera;
    if (this._pa) this._pa.update(dt, cam);
    if (this._pn) this._pn.update(dt, cam);
  }
  clear() {
    for (const f of this.active) { f.done = true; try { f.end?.(); } catch (e) { /* ignore */ } }
    this.active.length = 0; this._pa?.clear(); this._pn?.clear();
  }
  prewarm(renderer, camera) {
    try { const t = this.trail(null); t.end(); this.pn; this.pa; } catch (e) { /* cosmetic */ }
  }

  // ------------------------------------------------------------------ the flail's trail
  /** a ribbon following the flail's ball (F: shihtzuGear.js's flail record). → handle { on(k), end() }: on(k) sets how
   *  strongly it draws this frame (0 = fade out); it samples the ball while drawn and fades its tail away */
  trail(F) {
    const m = this.take('trail', () => trailMesh()), R = m.userData;
    R.n = 0; R.fade = 0; m.visible = false;
    let k = 0, ended = false;
    const H = { mesh: m, on: v => { k = v; }, end: () => { ended = true; } };
    const cam = this.engine.camera;
    this.run(dt => {
      if (!F || !F.holder.parent) return false;
      R.fade = k > R.fade ? k : Math.max(0, R.fade - dt * 4);
      if (R.fade > 0.01) {
        // samples every TR_STEP along the ball's path (not per frame: a 25 m/s whip would space them half a metre apart,
        // and a frozen frame would pile them up), the head always at the ball itself
        flailBall(F, _a);
        const P0 = R.pts;
        if (!R.n) { P0[0].copy(_a); P0[1].copy(_a); R.n = 2; }
        else {
          let guard = 0;
          while (P0[1].distanceTo(_a) > TR_STEP && guard++ < 8) {
            _b.subVectors(_a, P0[1]).setLength(TR_STEP).add(P0[1]);
            const last = P0[TR_N - 1]; for (let i = TR_N - 1; i > 1; i--) P0[i] = P0[i - 1]; P0[1] = last.copy(_b);
            R.n = Math.min(TR_N, R.n + 1);
          }
          P0[0].copy(_a);
        }
      } else R.n = 0;
      m.visible = R.n > 1;
      if (m.visible) this.writeTrail(m, cam);
      return !ended || R.n > 0;
    }, () => this.give('trail', m));
    return H;
  }
  writeTrail(m, cam) {
    const R = m.userData, pos = m.geometry.attributes.position, col = m.geometry.attributes.color, n = R.n;
    cam.getWorldPosition(_c);
    for (let i = 0; i < TR_N; i++) {
      const j = Math.min(i, n - 1), p = R.pts[j], q = R.pts[Math.min(j + 1, n - 1)], o = R.pts[Math.max(0, j - 1)];
      _v.subVectors(o, q); if (_v.lengthSq() < 1e-8) _v.set(1, 0, 0);
      _b.subVectors(p, _c).cross(_v).normalize(); // (across the path, facing the camera)
      const u = n > 1 ? j / (n - 1) : 1, w = (0.14 * (1 - 0.7 * u) + 0.02) * (i < n ? 1 : 0), a = i < n ? 0.5 * R.fade * (1 - u) ** 1.4 : 0; // (capped: a slam's trail falls between the camera and him)
      pos.setXYZ(i * 2, p.x + _b.x * w, p.y + _b.y * w, p.z + _b.z * w); pos.setXYZ(i * 2 + 1, p.x - _b.x * w, p.y - _b.y * w, p.z - _b.z * w);
      // the head of the trail is cream with a teal edge; its tail cools toward ghostlight
      const r = TR_CORE.r + (TR_EDGE.r - TR_CORE.r) * u * 0.6, g = TR_CORE.g + (TR_EDGE.g - TR_CORE.g) * u * 0.6, b = TR_CORE.b + (TR_EDGE.b - TR_CORE.b) * u * 0.6;
      col.setXYZW(i * 2, r, g, b, a); col.setXYZW(i * 2 + 1, r, g, b, a);
    }
    pos.needsUpdate = true; col.needsUpdate = true;
  }

  // ------------------------------------------------------------------ thuds and swooshes
  /** the ball hits the floor: a dust ring, flung dirt, a few ghostlight glints (big: the slam) */
  thud(pos, r = 1, big = false) {
    const V = this.vfx, n = big ? 14 : 7;
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU + rand(-0.2, 0.2), s = rand(1.6, 3) * r; V.smoke.spawn({ x: pos.x + Math.cos(a) * 0.15, y: pos.y + 0.08, z: pos.z + Math.sin(a) * 0.15, vx: Math.cos(a) * s, vy: rand(0.4, 1.2), vz: Math.sin(a) * s, life: rand(0.45, 0.7), size: 0.3 * r, size1: 0.75 * r, color: '#e8dcc8', alpha: 0.6, alpha1: 0, drag: 4 }); }
    for (let i = 0; i < (big ? 8 : 4); i++) this.pn.spawn({ x: pos.x, y: pos.y + 0.1, z: pos.z, vx: rand(-2.5, 2.5), vy: rand(2, 4), vz: rand(-2.5, 2.5), life: rand(0.4, 0.6), size: rand(0.07, 0.11), color: '#8a7058', alpha: 1, alpha1: 0.6, grav: 11, frame: SF.DOT });
    this.ring(pos, big ? 1.6 * r : 0.9 * r, big ? 0.32 : 0.22, K.cream, 0.55);
    this.glint(_a.copy(pos).setY(pos.y + 0.2), big ? 5 : 2);
  }
  /** a flat ring on the floor (a soft normal-blend band, capped at 0.6 alpha); lift raises it off the floor (the Maelstrom's, overhead) */
  ring(pos, r, life, color = K.cream, alpha = 0.5, lift = 0) {
    const m = this.take('ring', () => { const x = new THREE.Mesh(G_PLANE(), new THREE.MeshBasicMaterial({ map: atlasCell(SF.RING), color: '#ffffff', transparent: true, depthWrite: false, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2 })); x.renderOrder = 7; return x; });
    m.material.color.copy(color); m.position.set(pos.x, pos.y + 0.05 + lift, pos.z);
    const a0 = Math.min(0.6, alpha);
    this.run((dt, t) => { const k = clamp(t / life); m.scale.setScalar(Math.max(0.05, r * (0.25 + 0.75 * ease.outCubic(k)))); m.material.opacity = a0 * (1 - k); return k < 1; }, () => this.give('ring', m));
  }
  /** small ghostlight glints */
  glint(pos, n = 3) {
    for (let i = 0; i < n; i++) this.pa.spawn({ x: pos.x + rand(-0.2, 0.2), y: pos.y + rand(0, 0.3), z: pos.z + rand(-0.2, 0.2), vx: rand(-0.6, 0.6), vy: rand(0.4, 1.2), vz: rand(-0.6, 0.6), life: rand(0.35, 0.6), size: rand(0.12, 0.2), size1: 0.04, color: K.ghost, alpha: 0.8, alpha1: 0, frame: SF.SPARK, spin: rand(-3, 3) });
  }
  /** gloom puffs (soft grey-violet cloudlets, normal blend) */
  gloomPuff(pos, n = 4, r = 0.4, tint = K.gloomLt) {
    for (let i = 0; i < n; i++) { const a = rand(0, TAU), d = rand(0, r); this.pn.spawn({ x: pos.x + Math.cos(a) * d, y: pos.y + rand(0, 0.25), z: pos.z + Math.sin(a) * d, vx: Math.cos(a) * rand(0.2, 0.8), vy: rand(0.3, 0.8), vz: Math.sin(a) * rand(0.2, 0.8), life: rand(0.6, 1), size: rand(0.18, 0.28), size1: rand(0.34, 0.46), color: tint, alpha: 0.7, alpha1: 0, drag: 2, frame: SF.PUFF, spin: rand(-0.6, 0.6) }); }
  }
  /** ghostlight drips falling off something */
  drip(pos, n = 1) {
    for (let i = 0; i < n; i++) this.pn.spawn({ x: pos.x + rand(-0.15, 0.15), y: pos.y, z: pos.z + rand(-0.15, 0.15), vy: rand(-0.3, 0), life: rand(0.5, 0.7), size: rand(0.08, 0.12), color: K.ghost, alpha: 0.95, alpha1: 0.4, grav: 6, frame: SF.DROP, rot: Math.PI });
  }
  /** motes gathering on a charging / casting paw */
  gather(pos, dt, k = 0) {
    for (let i = this.emit('gather', 14 + 20 * k, dt); i > 0; i--) { const a = rand(0, TAU), d = rand(0.5, 0.8); this.pa.spawn({ x: pos.x + Math.cos(a) * d, y: pos.y + rand(-0.2, 0.3), z: pos.z + Math.sin(a) * d, vx: -Math.cos(a) * d * 2.2, vy: rand(-0.2, 0.2), vz: -Math.sin(a) * d * 2.2, life: 0.4, size: 0.12, size1: 0.04, color: K.ghost, alpha: 0.75, alpha1: 0.1, frame: SF.DOT }); }
  }

  // ------------------------------------------------------------------ Dripping Paw
  /** the flying curse: a ghostlight paw print (normal blend, ink-rimmed: it reads on grass and sand) with a teal glint
   *  core and a trail of drips. → handle { set(pos, dir), end() } */
  pawShot() {
    const g = this.take('pawShot', () => {
      const root = new THREE.Group();
      const paw = new THREE.Sprite(new THREE.SpriteMaterial({ map: atlasCell(SF.PAW), color: K.ghostLt, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: atlasCell(SF.DOT), color: K.ghost, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }));
      paw.scale.setScalar(0.5); glow.scale.setScalar(0.62); paw.renderOrder = 12; glow.renderOrder = 11;
      root.add(glow, paw); root.userData = { paw, glow };
      return root;
    });
    let alive = true;
    const H = { root: g, set: (p, dir, dt = 0) => {
      g.position.copy(p);
      g.userData.paw.material.rotation = Math.sin(this.t * 9) * 0.25;
      if (dt) {
        for (let i = this.emit('pawTrail', 22, dt); i > 0; i--) this.pn.spawn({ x: p.x - dir.x * 0.2 + rand(-0.06, 0.06), y: p.y + rand(-0.06, 0.06), z: p.z - dir.z * 0.2 + rand(-0.06, 0.06), vx: -dir.x * 0.5, vy: rand(-0.4, 0), vz: -dir.z * 0.5, life: 0.35, size: rand(0.06, 0.1), color: K.ghost, alpha: 0.9, alpha1: 0.2, grav: 4, frame: SF.DROP, rot: Math.PI });
        for (let i = this.emit('pawWisp', 12, dt); i > 0; i--) this.pn.spawn({ x: p.x, y: p.y, z: p.z, vx: -dir.x, vy: 0.2, vz: -dir.z, life: 0.4, size: 0.16, size1: 0.3, color: K.gloomLt, alpha: 0.4, alpha1: 0, drag: 3, frame: SF.PUFF });
      }
    }, end: () => { if (!alive) return; alive = false; this.give('pawShot', g); } };
    return H;
  }
  /** the curse lands: a paw-print splat on the floor that soaks away, gloom puffs, drips flung round, a small light */
  splat(pos, r = 1.6) {
    const m = this.take('splat', () => { const x = new THREE.Mesh(G_PLANE(), new THREE.MeshBasicMaterial({ map: splatTex(), transparent: true, depthWrite: false, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -3 })); x.renderOrder = 6; return x; });
    m.position.set(pos.x, pos.y + 0.04, pos.z); m.rotation.y = rand(0, TAU);
    const life = 1.6, R = r * 0.62;
    this.run((dt, t) => { const k = clamp(t / life); m.scale.setScalar(R * (0.55 + 0.45 * ease.outBack(clamp(t / 0.18)))); m.material.opacity = 0.85 * (1 - ease.inQuad(k)); return k < 1; }, () => this.give('splat', m));
    this.gloomPuff(_a.copy(pos).setY(pos.y + 0.3), 6, r * 0.45);
    for (let i = 0; i < 10; i++) { const a = rand(0, TAU), s = rand(1.5, 3.2); this.pn.spawn({ x: pos.x, y: pos.y + 0.4, z: pos.z, vx: Math.cos(a) * s, vy: rand(1.5, 3.2), vz: Math.sin(a) * s, life: rand(0.45, 0.7), size: rand(0.07, 0.12), color: K.ghost, alpha: 1, alpha1: 0.5, grav: 9, frame: SF.DROP, rot: Math.PI }); }
    this.glint(_a.copy(pos).setY(pos.y + 0.4), 3);
    this.vfx.light?.(_a.copy(pos).setY(pos.y + 0.6), '#5ce0c0', 1.6, 2.4, 0.25);
  }
  /** a hexed foe (e): the dripping paw badge over its head with a pip per stack, drips running off it. → handle
   *  { stacks, end() }: the caller sets stacks; end() fades it out (it frees itself; it also fades when the foe dies) */
  hexMark(e) {
    // (a hexed crowd is the Shih Tzu's whole game: an Awoo or the great hex can mark 60+ foes at once. The badge is one
    // particle a frame in the normal layer, not a sprite each (one draw for all of them); the pips and the drips run on a
    // per-frame budget shared by every mark, so a hundred badges cost about what twenty do)
    this._marks = (this._marks || 0) + 1;
    const key = 'drip' + (this.dripKey = ((this.dripKey || 0) + 1) % 64);
    const H = { stacks: 1, k: 0, t: 0, dying: false, end: () => { H.dying = true; } };
    this.run(dt => {
      H.t += dt; H.k = H.dying || !e.alive ? Math.max(0, H.k - dt * 4) : Math.min(1, H.k + dt * 6);
      if (this._budgetT !== this.t) { this._budgetT = this.t; this._pips = 90; } // (per frame, shared)
      const top = e.pos.y + Math.min(2.6, (e.height || 1) * (e.scale || 1)) + 0.18, size = 0.3 + 0.04 * H.stacks + 0.05 * Math.max(0, 1 - H.t * 4);
      const y = top + size * 0.5 + Math.sin(H.t * 3) * 0.04, a = 0.95 * H.k;
      if (a > 0.02) this.pn.spawn({ frame: SF.BADGE, x: e.pos.x, y, z: e.pos.z, life: Math.max(0.02, dt * 1.05), size, color: 0xffffff, alpha: a, alpha1: a });
      if (H.k > 0.5) {
        // drips run off the foe (more with more stacks; fewer each when many foes are marked), and the pips orbit the badge
        const share = Math.min(1, 24 / Math.max(1, this._marks));
        for (let i = this.emit(key, (1.2 + H.stacks * 0.9) * share, dt); i > 0; i--) this.drip(_a.set(e.pos.x, e.pos.y + (e.height || 1) * 0.75, e.pos.z), 1);
        if (this._pips >= H.stacks) {
          this._pips -= H.stacks;
          for (let i = 0; i < H.stacks; i++) { const an = H.t * 2.2 + (i / H.stacks) * TAU; this.pn.spawn({ x: e.pos.x + Math.cos(an) * 0.24, y: y + size * 0.5 + 0.02 + Math.sin(an) * 0.05, z: e.pos.z + Math.sin(an) * 0.24, life: Math.max(0.02, dt * 1.05), size: 0.07, color: K.ghost, alpha: 1, alpha1: 1, frame: SF.PIP }); }
        }
      }
      return !((H.dying || !e.alive) && H.k <= 0);
    }, () => { this._marks--; });
    return H;
  }
}
// one atlas cell as its own texture (sprites can't pick a frame): cached per cell
const CELLS = new Map();
export function atlasCell(i) {
  let t = CELLS.get(i); if (t) return t;
  const src = atlasTex();
  t = src.clone(); t.needsUpdate = true;
  t.repeat.set(0.25, 0.25); t.offset.set((i % 4) * 0.25, 0.75 - Math.floor(i / 4) * 0.25);
  CELLS.set(i, t);
  return t;
}

registerVfxExtension(vfx => (vfx.stz = new ShihtzuFX(vfx)));
export function stzFx(G) { const v = G.vfx; return v.stz || (v.stz = new ShihtzuFX(v)); }
