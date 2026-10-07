// The rest of the Shih Tzu's effects (docs/SHIHTZU.md §3): Tug of Woe's flung ball and its rope, the Maelstrom's gloom
// swirl, the Sulk's little rain cloud, the Heaviest Sigh's bone-shaped crack and shockwaves, the Grumble Cloud, the
// mopes over a foe, the Awoo's notes and ring, Everlasting Gloom's falling paw and its bursts, Borrowed Warmth's
// threads, the Wayhome Lantern, the spectral tome he reads from, and the ghosts (gfx/shihtzuGhosts.js: the pup and bone
// batches and Grandpaw, one set per scene). They extend ShihtzuFX (gfx/shihtzuFx.js) and keep its budget rules: pooled
// meshes, module-level geometry and canvas textures, the two particle layers (normal blend for anything big; additive only
// for small glints and the lantern's flame), every alpha and size capped where it's made so nothing washes the screen.
// combat/shihtzuArts.js and combat/shihtzuAllies.js are the callers (they import this module for its side effect).
import * as THREE from 'three';
import { ShihtzuFX, SF, STZ_COL, TEX, newCanvas, canvasTex, pawPath, G_PLANE, atlasCell } from './shihtzuFx.js';
import { GhostBatch, grandpawModel, lanternTip } from './shihtzuGhosts.js';
import { makeToon } from './materials.js';
import { rand, TAU, clamp, ease } from '../core/util.js';

const K = STZ_COL, _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const C = h => new THREE.Color(h);
const COL = { warm: C('#ffc8a0'), heart: C('#ff9ab8'), rain: C('#9fe8d8'), cloud: C('#d8d2e4'), cloudDk: C('#a8a0bc'), rope: C('#7a4a7a'), earth: C('#8a7058'), note: C('#e8dcf0'), flame: C('#5ce0c0') };
export const STZ_ARTS_COL = COL;

// ------------------------------------------------------------------ textures
// the Maelstrom's swirl: three soft spiral arms, gloom-grey with a teal edge (a floor decal, normal blend)
function swirlTex() {
  if (TEX.swirl) return TEX.swirl;
  const { c, g } = newCanvas(256); g.translate(128, 128);
  for (let arm = 0; arm < 3; arm++) {
    for (let i = 0; i < 60; i++) {
      const u = i / 60, a = arm * (TAU / 3) + u * 3.4, r = 30 + u * 92, w = 18 * (1 - u * 0.6);
      g.fillStyle = `rgba(106,96,120,${0.5 * (1 - u) + 0.1})`; g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, w, 0, TAU); g.fill();
      g.fillStyle = `rgba(92,224,192,${0.35 * (1 - u)})`; g.beginPath(); g.arc(Math.cos(a + 0.08) * (r + w * 0.6), Math.sin(a + 0.08) * (r + w * 0.6), w * 0.35, 0, TAU); g.fill();
    }
  }
  return (TEX.swirl = canvasTex(c));
}
// the Maelstrom's whirl overhead: the ball's path as a motion smear, a 300° arc fading off behind its head (cream core, teal edge)
function whirlTex() {
  if (TEX.whirl) return TEX.whirl;
  const { c, g } = newCanvas(256); g.translate(128, 128); g.lineCap = 'butt';
  const N = 90, A = Math.PI * 1.65;
  for (let i = 0; i < N; i++) {
    const u = i / N, a0 = u * A, a1 = (i + 1.4) / N * A, k = Math.pow(u, 1.6);
    g.strokeStyle = `rgba(92,224,192,${0.55 * k})`; g.lineWidth = 22; g.beginPath(); g.arc(0, 0, 100, a0, a1); g.stroke();
    g.strokeStyle = `rgba(248,242,234,${0.9 * k})`; g.lineWidth = 9; g.beginPath(); g.arc(0, 0, 100, a0, a1); g.stroke();
  }
  return (TEX.whirl = canvasTex(c));
}
// the Heaviest Sigh's crack: a bone outline cracked into the floor, with a few cracks running off it
function crackTex() {
  if (TEX.crack) return TEX.crack;
  const { c, g } = newCanvas(512, 256); g.translate(256, 128);
  // the bone: a bar and four knobs (strokes first, the fill over them, so only the outer edge of each stroke shows)
  const shapes = () => { g.beginPath(); g.rect(-156, -24, 312, 48); for (const [x, y] of [[-170, -26], [-170, 26], [170, -26], [170, 26]]) { g.moveTo(x + 32, y); g.arc(x, y, 32, 0, TAU); } };
  g.strokeStyle = 'rgba(92,224,192,0.55)'; g.lineWidth = 18; shapes(); g.stroke(); // (a teal glow along the edge)
  g.strokeStyle = 'rgba(30,22,36,0.95)'; g.lineWidth = 8; shapes(); g.stroke();
  g.fillStyle = 'rgb(70,56,80)'; shapes(); g.fill();
  g.fillStyle = 'rgba(92,224,192,0.25)'; g.beginPath(); g.rect(-150, -6, 300, 12); g.fill(); // (ghostlight down the middle)
  // cracks running off it
  g.strokeStyle = 'rgba(30,22,36,0.85)'; g.lineCap = 'round';
  const crack = (x, y, a, n, w) => { g.lineWidth = w; g.beginPath(); g.moveTo(x, y); for (let i = 0; i < n; i++) { a += (Math.random() - 0.5) * 0.8; x += Math.cos(a) * 18; y += Math.sin(a) * 18; g.lineTo(x, y); } g.stroke(); };
  for (const [x, y, a] of [[-120, -26, -1.8], [-40, -26, -1.4], [60, -26, -1.7], [130, 26, 1.5], [20, 26, 1.7], [-90, 26, 1.4], [200, 0, 0.1], [-200, 0, Math.PI - 0.1]]) crack(x, y, a, 4 + Math.floor(Math.random() * 3), 4);
  return (TEX.crack = canvasTex(c));
}
// a soft ground disc (a cloud's shadow, the lantern's light): a radial falloff, tinted by the material
function discTex() {
  if (TEX.disc) return TEX.disc;
  const { c, g } = newCanvas(128); const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return (TEX.disc = canvasTex(c));
}
// the lantern's light pool: a warm-teal disc with a dashed paw-print ring (the edge of its light, so you can see it)
function lightTex() {
  if (TEX.lanternLight) return TEX.lanternLight;
  const { c, g } = newCanvas(256); g.translate(128, 128);
  const gr = g.createRadialGradient(0, 0, 8, 0, 0, 124); gr.addColorStop(0, 'rgba(220,255,240,0.32)'); gr.addColorStop(0.75, 'rgba(92,224,192,0.1)'); gr.addColorStop(1, 'rgba(92,224,192,0)'); // (a soft pool: the dashed edge shows the area, the floor stays readable)
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 124, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(92,224,192,0.6)'; g.lineWidth = 4; g.setLineDash([14, 12]); g.beginPath(); g.arc(0, 0, 114, 0, TAU); g.stroke(); g.setLineDash([]);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.save(); g.translate(Math.cos(a) * 114, Math.sin(a) * 114); g.rotate(a + Math.PI / 2); g.fillStyle = 'rgba(191,246,230,0.85)'; pawPath(g, 6); g.fill(); g.restore(); }
  return (TEX.lanternLight = canvasTex(c));
}
// a braided rope (Tug of Woe): plum with lighter twists, ink edges (u along the rope, v across)
function ropeTex() {
  if (TEX.rope) return TEX.rope;
  const { c, g } = newCanvas(64, 32);
  g.fillStyle = '#7a4a7a'; g.fillRect(0, 0, 64, 32);
  g.fillStyle = '#a873a8'; for (let x = -32; x < 96; x += 16) { g.beginPath(); g.moveTo(x, 4); g.lineTo(x + 10, 4); g.lineTo(x + 22, 28); g.lineTo(x + 12, 28); g.closePath(); g.fill(); }
  g.fillStyle = '#2a1f30'; g.fillRect(0, 0, 64, 4); g.fillRect(0, 28, 64, 4);
  const t = canvasTex(c); t.wrapS = THREE.RepeatWrapping;
  return (TEX.rope = t);
}
// a ghostlight thread (Borrowed Warmth): a soft teal band with a bright core
function threadTex() {
  if (TEX.thread) return TEX.thread;
  const { c, g } = newCanvas(32, 32);
  const gr = g.createLinearGradient(0, 0, 0, 32); gr.addColorStop(0, 'rgba(92,224,192,0)'); gr.addColorStop(0.3, 'rgba(92,224,192,0.7)'); gr.addColorStop(0.5, 'rgba(232,255,248,1)'); gr.addColorStop(0.7, 'rgba(92,224,192,0.7)'); gr.addColorStop(1, 'rgba(92,224,192,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  return (TEX.thread = canvasTex(c));
}
const GEO = {};
/** a flat ring sector (the wallop's sweep), +x centred, `arc` radians wide, inner 0.42 of the outer radius 1; vertex colours: cream
 *  toward the inside, ghostlight at the rim; alpha fading in toward the middle of the sweep and out at both ends */
function sweepGeo(arc) {
  // a thin band near the rim (inner 0.6 of the radius: the middle stays clear), +x centred, `arc` radians; each vertex
  // carries u (0 → 1 along the sweep, the way the flail travels) and r (0 inner → 1 outer) for the shader
  const key = 'sweep' + Math.round(arc * 20);
  if (GEO[key]) return GEO[key];
  const g = new THREE.RingGeometry(0.6, 1, 40, 3, -arc / 2, arc); g.rotateX(-Math.PI / 2); g.deleteAttribute('uv');
  const pos = g.attributes.position, n = pos.count, aU = new Float32Array(n), aR = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = pos.getX(i), z = pos.getZ(i); aU[i] = clamp((Math.atan2(-z, x) + arc / 2) / arc); aR[i] = clamp((Math.hypot(x, z) - 0.6) / 0.4); }
  g.setAttribute('aU', new THREE.BufferAttribute(aU, 1)); g.setAttribute('aR', new THREE.BufferAttribute(aR, 1));
  return (GEO[key] = g);
}
const SWEEP_VS = /* glsl */`attribute float aU, aR; varying float vU, vR; void main() { vU = aU; vR = aR; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SWEEP_FS = /* glsl */`uniform float uHead, uAlpha; uniform vec3 uIn, uOut; varying float vU, vR;
void main() {
  float behind = uHead - vU; if (behind < 0.0) discard;              // (nothing ahead of the leading edge)
  float trail = exp(-behind * 9.0);                                  // the edge bright, a short smear behind it
  float band = smoothstep(0.0, 0.55, vR) * (1.0 - smoothstep(0.85, 1.0, vR)); // a soft band, brightest just inside the rim
  float a = uAlpha * trail * band; if (a < 0.01) discard;
  gl_FragColor = vec4(mix(uIn, uOut, vR * 0.8), a);
}`;
const boxG = (w, h, d) => { const g = new THREE.BoxGeometry(w, h, d); g.deleteAttribute('uv'); return g; };

/** a camera-facing strip through N points (a rope, a thread): → mesh with userData.pts (Vector3 × n) */
function stripMesh(n, mat) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2 * 2), 2).setUsage(THREE.DynamicDrawUsage));
  const idx = []; for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } g.setIndex(idx);
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false;
  m.userData.pts = Array.from({ length: n }, () => new THREE.Vector3());
  return m;
}
function writeStrip(m, cam, width, uScale = 1) {
  const P = m.userData.pts, n = P.length, pos = m.geometry.attributes.position, uv = m.geometry.attributes.uv;
  cam.getWorldPosition(_c);
  let len = 0;
  for (let i = 0; i < n; i++) {
    const p = P[i], q = P[Math.min(n - 1, i + 1)], o = P[Math.max(0, i - 1)];
    _d.subVectors(q, o); if (_d.lengthSq() < 1e-8) _d.set(1, 0, 0);
    _b.subVectors(p, _c).cross(_d).normalize();
    const w = typeof width === 'function' ? width(i / (n - 1)) : width;
    if (i) len += p.distanceTo(P[i - 1]);
    pos.setXYZ(i * 2, p.x + _b.x * w, p.y + _b.y * w, p.z + _b.z * w); pos.setXYZ(i * 2 + 1, p.x - _b.x * w, p.y - _b.y * w, p.z - _b.z * w);
    uv.setXY(i * 2, len * uScale, 0); uv.setXY(i * 2 + 1, len * uScale, 1);
  }
  pos.needsUpdate = true; uv.needsUpdate = true;
}
const sprite = (cell, color, o = {}) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: atlasCell(cell), color, transparent: true, depthWrite: false, toneMapped: false, fog: false, ...o })); return s; };
const decal = (tex, o = {}) => { const m = new THREE.Mesh(G_PLANE(), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, ...o })); m.renderOrder = 6; return m; };

let MOPES = 0; const MOPES_MAX = 14; // (little clouds over moping foes, capped)

const M = {
  /** a heavy sweep across the front (Woeful Wallop): a soft cream-to-ghostlight sector at hip height, swelling and fading
   *  (0.3 s, alpha ≤ 0.55: the foes it catches stay readable through it) */
  sweep(pos, facing, arcDeg, r) {
    // the leading edge runs round the arc in 0.14 s (the strike), then the whole band fades by 0.25 s; the middle stays
    // clear, so even a charged near-full circle 6 m across leaves the fight readable (the owner's CP2 review)
    const arc = Math.min(Math.PI * 2, arcDeg * Math.PI / 180); this._lastSweep = this.t; // (QA reads when the last one started)
    const m = this.take('sweep', () => {
      const x = new THREE.Mesh(sweepGeo(arc), new THREE.ShaderMaterial({ vertexShader: SWEEP_VS, fragmentShader: SWEEP_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
        uniforms: { uHead: { value: 0 }, uAlpha: { value: 0 }, uIn: { value: new THREE.Color('#f8f2ea') }, uOut: { value: new THREE.Color('#7ae8cc') } } }));
      x.renderOrder = 9; return x;
    });
    m.geometry = sweepGeo(arc); m.position.set(pos.x, pos.y + 0.5, pos.z); m.rotation.y = facing - Math.PI / 2; m.scale.setScalar(r);
    const U = m.material.uniforms, a0 = 0.62 * clamp(2.6 / r, 0.6, 1);
    this.run((dt, t) => { U.uHead.value = 1.15 * ease.outCubic(clamp(t / 0.14)); U.uAlpha.value = a0 * (1 - ease.inQuad(clamp((t - 0.1) / 0.15))); return t < 0.25; }, () => this.give('sweep', m));
  },
  // ================================================================== the ghosts (one set per scene)
  pupBatch() { return this._pups || (this._pups = new GhostBatch(this.scene, 'pup', 8)); },
  boneBatch() { return this._bones || (this._bones = new GhostBatch(this.scene, 'bone', 12)); },
  /** a Grandpaw from the pool: → { model, flame } (the flame: a small additive glow at his lantern) */
  grandpaw() {
    const g = this.take('grandpaw', () => {
      const model = grandpawModel(), flame = sprite(SF.MOTE, COL.flame, { blending: THREE.AdditiveBlending, opacity: 0.5 });
      flame.scale.setScalar(0.42); flame.renderOrder = 13;
      const root = new THREE.Group(); root.add(model.root, flame); root.userData = { model, flame };
      return root;
    });
    return g.userData;
  },
  giveGrandpaw(G) { this.give('grandpaw', G.model.root.parent); },
  lanternFlame(G, s, dt) { lanternTip(G.model, s, G.flame.position); G.flame.material.opacity = Math.min(0.55, (0.42 + 0.1 * Math.sin(this.t * 9)) * (s.alpha ?? 1)); },

  // ================================================================== Flail Arts
  /** Tug of Woe: the ball flies out on a lengthening rope (the real ball is hidden meanwhile). F: the flail record.
   *  → handle { ball (Object3D), set(from, ballPos, slack), end() } */
  tug(F) {
    const rope = this.take('tugRope', () => { const m = stripMesh(18, new THREE.MeshBasicMaterial({ map: ropeTex(), transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false })); m.renderOrder = 10; return m; });
    const ball = F?.head ? F.head.clone(true) : new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), new THREE.MeshBasicMaterial({ color: '#2c2a30' }));
    ball.traverse(o => { o.castShadow = false; }); // (no shadow: cheap in a horde)
    ball.position.set(0, 0, 0); ball.rotation.set(0, 0, 0);
    const s0 = F?.holder ? F.holder.getWorldScale(_a).x : 1; ball.scale.setScalar(s0);
    this.scene.add(ball);
    const cam = this.engine.camera, P = rope.userData.pts;
    let alive = true;
    return {
      ball,
      set: (from, to, slack = 0) => {
        ball.position.copy(to); ball.rotation.x += 0.3; ball.rotation.z += 0.2;
        const L = from.distanceTo(to);
        for (let i = 0; i < P.length; i++) { const u = i / (P.length - 1); P[i].lerpVectors(from, to, u); P[i].y -= Math.sin(u * Math.PI) * slack * Math.min(1.2, L * 0.2); }
        writeStrip(rope, cam, 0.032, 6);
      },
      end: () => { if (!alive) return; alive = false; this.give('tugRope', rope); ball.parent?.remove(ball); },
    };
  },
  /** Melancholy Maelstrom: a gloom swirl on the floor round him and puffs being drawn in. → handle { set(pos, r, dt), end() } */
  swirl() {
    const m = this.take('swirl', () => decal(swirlTex(), { opacity: 0.0 }));
    const w = this.take('whirlTop', () => { const x = new THREE.Mesh(G_PLANE(), new THREE.MeshBasicMaterial({ map: whirlTex(), transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false })); x.renderOrder = 10; return x; });
    let k = 0, ended = false, at = new THREE.Vector3(), R = 2;
    const H = {
      set: (pos, r, dt) => {
        at.copy(pos); R = r;
        for (let i = this.emit('swirlPuff', 16, dt); i > 0; i--) {
          const a0 = rand(0, TAU), r0 = r * rand(0.9, 1.35), y = rand(0.15, 0.9);
          this.pn.spawn({ x: pos.x + Math.cos(a0) * r0, y: pos.y + y, z: pos.z + Math.sin(a0) * r0, life: 0.55, size: rand(0.2, 0.3), size1: 0.12, color: K.gloomLt, alpha: 0.55, alpha1: 0, frame: SF.PUFF,
            fn: (q, dd, kk) => { const rr = r0 * (1 - kk * 0.8), aa = a0 - kk * 2.6; q.x = at.x + Math.cos(aa) * rr; q.z = at.z + Math.sin(aa) * rr; } });
        }
        if (Math.random() < dt * 6) this.glint(_a.set(pos.x + rand(-r, r) * 0.6, pos.y + 0.6, pos.z + rand(-r, r) * 0.6), 1);
      },
      end: () => { ended = true; },
    };
    this.run(dt => {
      k = ended ? Math.max(0, k - dt * 4) : Math.min(1, k + dt * 5);
      m.position.set(at.x, at.y + 0.05, at.z); m.scale.setScalar(R * 1.15); m.rotation.y -= dt * 4.5;
      m.material.opacity = 0.62 * k;
      // the whirl overhead: the ball's circle, smeared, turning with it (≈ 2 turns a second, clockwise from above)
      w.position.set(at.x, at.y + 1.3, at.z); w.scale.setScalar(0.85); w.rotation.y += dt * 13; w.material.opacity = 0.6 * k;
      return !(ended && k <= 0);
    }, () => { this.give('swirl', m); this.give('whirlTop', w); });
    return H;
  },
  /** Steadfast Sulk: a small, very grumpy rain cloud over his head and drizzle on his topknot. → { set(pos), blow(pos), end() } */
  sulk() {
    const s = this.take('sulkCloud', () => { const x = sprite(SF.CLOUD, COL.cloud); x.renderOrder = 14; return x; });
    let k = 0, ended = false; const at = new THREE.Vector3();
    const H = {
      set: pos => at.copy(pos),
      blow: pos => { this.gloomPuff(_a.copy(pos), 3, 0.35, K.lilac); this.glint(_a, 2); },
      end: () => { ended = true; },
    };
    this.run((dt, t) => {
      k = ended ? Math.max(0, k - dt * 5) : Math.min(1, k + dt * 6);
      s.position.set(at.x + Math.sin(t * 1.7) * 0.06, at.y + 1.75 + Math.sin(t * 2.3) * 0.04, at.z);
      s.scale.setScalar(0.62 * ease.outBack(k)); s.material.opacity = 0.95 * k; s.material.rotation = Math.sin(t * 2) * 0.06;
      if (k > 0.5) for (let i = this.emit('sulkRain', 14, dt); i > 0; i--) this.pn.spawn({ x: s.position.x + rand(-0.22, 0.22), y: s.position.y - 0.15, z: s.position.z + rand(-0.12, 0.12), vy: -3.2, life: 0.32, size: 0.06, color: COL.rain, alpha: 0.9, alpha1: 0.5, frame: SF.DROP, rot: Math.PI });
      return !(ended && k <= 0);
    }, () => this.give('sulkCloud', s));
    return H;
  },
  /** The Heaviest Sigh lands: a bone-shaped crack along his facing, chunks of floor, dust */
  crack(pos, facing, r = 1) {
    const m = this.take('crack', () => { const x = new THREE.Mesh(GEO.crackPlane || (GEO.crackPlane = new THREE.PlaneGeometry(2, 1).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ map: crackTex(), transparent: true, depthWrite: false, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -3 })); x.renderOrder = 6; return x; });
    m.position.set(pos.x, pos.y + 0.04, pos.z); m.rotation.set(0, facing + Math.PI / 2, 0); m.scale.setScalar(1.6 * r);
    const life = 2.6;
    this.run((dt, t) => { const kk = clamp(t / life); m.material.opacity = 0.95 * (1 - ease.inQuad(kk)) * Math.min(1, t * 12); return kk < 1; }, () => this.give('crack', m));
    for (let i = 0; i < 12; i++) { const a = rand(0, TAU), sp = rand(1.5, 3.5); this.pn.spawn({ x: pos.x + Math.cos(a) * 0.3, y: pos.y + 0.1, z: pos.z + Math.sin(a) * 0.3, vx: Math.cos(a) * sp, vy: rand(3, 5.5), vz: Math.sin(a) * sp, life: rand(0.55, 0.8), size: rand(0.1, 0.17), color: COL.earth, alpha: 1, alpha1: 0.7, grav: 14, frame: SF.CHUNK, spin: rand(-8, 8) }); }
    this.vfx.dustRing?.(pos, 1.6 * r, 16);
    this.glint(_a.copy(pos).setY(pos.y + 0.3), 6);
    this.vfx.light?.(_a.copy(pos).setY(pos.y + 0.8), '#5ce0c0', 2.2, 4, 0.3);
  },
  /** one of the Sigh's shockwaves: a ring rolling out to r over `life`, dust kicked up along it */
  shock(pos, r, life = 0.42) {
    this.ring(pos, r, life, K.cream, 0.6);
    this.ring(pos, r * 0.92, life * 1.1, K.ghost, 0.35);
    const n = Math.round(10 + r * 3);
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU, rr = r * 0.85; this.vfx.smoke.spawn({ x: pos.x + Math.cos(a) * rr, y: pos.y + 0.1, z: pos.z + Math.sin(a) * rr, vx: Math.cos(a) * 1.5, vy: rand(0.3, 0.8), vz: Math.sin(a) * 1.5, life: 0.5, size: 0.3, size1: 0.7, color: '#e8dcc8', alpha: 0.45, alpha1: 0, drag: 3 }); }
  },

  // ================================================================== Gloom Hexes
  /** Grumble Cloud: the grumpy cloud parked over a spot, raining gloom, its shadow on the floor marking the area.
   *  → handle { pos, set(pos), end() } */
  cloud(pos, r = 2) {
    const g = this.take('grumble', () => {
      const root = new THREE.Group();
      const face = sprite(SF.CLOUD, COL.cloud); face.renderOrder = 14;
      const puffs = [0, 1, 2, 3].map(() => { const p = sprite(SF.PUFF, COL.cloudDk); p.renderOrder = 13; return p; });
      const shadow = decal(discTex(), { color: '#2a1f30' });
      root.add(face, ...puffs); root.userData = { face, puffs, shadow };
      return root;
    });
    const { face, puffs, shadow } = g.userData; this.scene.add(shadow); shadow.visible = true;
    const H = { pos: pos.clone(), r, k: 0, ended: false, set: p => H.pos.copy(p), end: () => { H.ended = true; } };
    const at = new THREE.Vector3().copy(pos);
    this.run((dt, t) => {
      H.k = H.ended ? Math.max(0, H.k - dt * 3) : Math.min(1, H.k + dt * 4);
      at.lerp(H.pos, 1 - Math.exp(-6 * dt));
      const y = at.y + 1.95 + Math.sin(t * 1.4) * 0.08, s = Math.min(1.7, H.r * 0.62) * ease.outBack(H.k); // (sized to read as a cloud over the spot, not a screen-filling face)
      face.position.set(at.x, y, at.z); face.scale.setScalar(Math.max(0.01, s)); face.material.opacity = 0.9 * H.k; face.material.rotation = Math.sin(t * 1.2) * 0.04;
      puffs.forEach((p, i) => { const a = i * 1.57 + t * 0.4; p.position.set(at.x + Math.cos(a) * H.r * 0.42, y + Math.sin(a * 2) * 0.1 - 0.12, at.z + Math.sin(a) * H.r * 0.3); p.scale.setScalar(Math.max(0.01, s * 0.5)); p.material.opacity = 0.75 * H.k; });
      shadow.position.set(at.x, at.y + 0.04, at.z); shadow.scale.setScalar(H.r * 1.05); shadow.material.opacity = 0.22 * H.k;
      if (H.k > 0.4) for (let i = this.emit('grumbleRain' + H.r, 26 * H.r / 2, dt); i > 0; i--) {
        const a = rand(0, TAU), d = Math.sqrt(Math.random()) * H.r * 0.85, x = at.x + Math.cos(a) * d, z = at.z + Math.sin(a) * d;
        this.pn.spawn({ x, y: y - 0.3, z, vy: -6.5, life: 0.38, size: 0.08, color: COL.rain, alpha: 0.95, alpha1: 0.7, frame: SF.DROP, rot: Math.PI });
      }
      if (H.k > 0.4 && Math.random() < dt * 8) { const a = rand(0, TAU), d = Math.sqrt(Math.random()) * H.r * 0.8; this.pn.spawn({ x: at.x + Math.cos(a) * d, y: at.y + 0.08, z: at.z + Math.sin(a) * d, life: 0.3, size: 0.1, size1: 0.3, color: COL.rain, alpha: 0.6, alpha1: 0, frame: SF.RING }); }
      return !(H.ended && H.k <= 0);
    }, () => { shadow.parent?.remove(shadow); this.give('grumble', g); });
    return H;
  },
  /** a foe with the mopes: a tiny drooping cloud over its head (capped at MOPES_MAX at once). → handle { end() } | null */
  mopes(e) {
    if (MOPES >= MOPES_MAX) return null;
    MOPES++;
    const s = this.take('mopeCloud', () => { const x = sprite(SF.CLOUD, COL.cloudDk); x.renderOrder = 14; return x; });
    const H = { k: 0, ended: false, end: () => { H.ended = true; } };
    const ph = rand(0, TAU);
    this.run((dt, t) => {
      H.k = H.ended || !e.alive ? Math.max(0, H.k - dt * 4) : Math.min(1, H.k + dt * 5);
      const top = e.pos.y + Math.min(2.6, (e.height || 1) * (e.scale || 1)) + 0.55;
      s.position.set(e.pos.x, top + Math.sin(t * 2 + ph) * 0.04, e.pos.z); s.scale.setScalar(0.42 * H.k); s.material.opacity = 0.9 * H.k;
      if (H.k > 0.6 && Math.random() < dt * 5) this.pn.spawn({ x: s.position.x + rand(-0.12, 0.12), y: s.position.y - 0.1, z: s.position.z, vy: -2.4, life: 0.35, size: 0.05, color: COL.rain, alpha: 0.9, alpha1: 0.4, frame: SF.DROP, rot: Math.PI });
      return !((H.ended || !e.alive) && H.k <= 0);
    }, () => { MOPES--; this.give('mopeCloud', s); });
    return H;
  },
  /** Case of the Mopes lands: a heavy sigh of gloom spreading over the area */
  mopeWave(pos, r) {
    this.ring(pos, r, 0.6, K.gloomLt, 0.5);
    for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU + rand(-0.1, 0.1), d = r * rand(0.3, 0.9); this.pn.spawn({ x: pos.x + Math.cos(a) * 0.3, y: pos.y + 0.3, z: pos.z + Math.sin(a) * 0.3, vx: Math.cos(a) * d * 2.2, vy: rand(0.1, 0.4), vz: Math.sin(a) * d * 2.2, life: rand(0.6, 0.9), size: rand(0.26, 0.36), size1: 0.5, color: K.gloomLt, alpha: 0.6, alpha1: 0, drag: 3, frame: SF.PUFF, spin: rand(-1, 1) }); }
  },
  /** Mournful Awoo: notes rising off him and a ring of sound rolling out to r */
  awoo(pos, r) {
    for (let i = 0; i < 9; i++) { const a = rand(-0.9, 0.9) + Math.PI / 2; this.pn.spawn({ x: pos.x + rand(-0.2, 0.2), y: pos.y + 1.3, z: pos.z + rand(-0.2, 0.2), vx: Math.cos(a) * rand(0.6, 1.6), vy: rand(1.4, 2.4), vz: rand(-0.8, 0.8), life: rand(0.9, 1.3), size: rand(0.18, 0.26), size1: 0.14, color: i % 3 ? COL.note : K.ghostLt, alpha: 1, alpha1: 0, drag: 1.2, frame: SF.NOTE, spin: rand(-2, 2) }); }
    this.ring(pos, r, 0.55, K.ghostLt, 0.45);
    this.ring(pos, r * 0.7, 0.45, K.lilac, 0.35);
    this.glint(_a.copy(pos).setY(pos.y + 1.3), 4);
  },
  /** the Awoo's howl travelling out: a bright ghostlight ring at chest height and a softer one on the floor, rolling out
   *  to r over `life` (the hex hops land as it passes: hexHop) */
  howlWave(pos, r, life = 0.5) {
    for (const [lift, col, a, w] of [[0.75, K.ghostLt, 0.6, 1], [0.7, K.ghost, 0.5, 0.9], [0.05, K.ghost, 0.45, 0.94]]) this.ring(pos, r * w, life, col, a, lift);
    for (let i = 0; i < 16; i++) { const an = (i / 16) * TAU; this.pa.spawn({ x: pos.x + Math.cos(an) * 0.4, y: pos.y + 0.8, z: pos.z + Math.sin(an) * 0.4, vx: Math.cos(an) * r / life, vz: Math.sin(an) * r / life, life, size: 0.22, size1: 0.1, color: K.ghostLt, alpha: 0.7, alpha1: 0, frame: SF.SPARK }); }
  },
  /** a hex hopping from one foe to the next (the Awoo's spread): a small arc of ghostlight wisps, a pop on arrival */
  hexHop(from, to, dur = 0.22) {
    const a = from.clone(), b = to.clone(), h = 0.6 + Math.min(1, a.distanceTo(b) * 0.15);
    this.run((dt, t) => {
      const k = clamp(t / dur);
      for (let i = this.emit('hexHop', 90, dt); i > 0; i--) { _a.lerpVectors(a, b, k); _a.y += 0.7 + Math.sin(k * Math.PI) * h; this.pa.spawn({ x: _a.x, y: _a.y, z: _a.z, life: 0.22, size: 0.16, size1: 0.04, color: K.ghost, alpha: 0.85, alpha1: 0, frame: SF.WISP }); }
      if (k >= 1) { this.glint(_a.set(b.x, b.y + 0.9, b.z), 2); this.drip(_a, 2); return false; }
      return true;
    });
  },
  /** Everlasting Gloom: a great ghostlight paw print falls on the crowd (0.25 s), then soaks into the floor */
  bigHex(pos, r) {
    const s = this.take('bigPaw', () => { const x = sprite(SF.PAW, K.ghostLt); x.renderOrder = 14; return x; });
    const fall = 0.25;
    this.run((dt, t) => {
      const kk = clamp(t / fall);
      s.position.set(pos.x, pos.y + 0.3 + (1 - ease.inQuad(kk)) * 3.2, pos.z); s.scale.setScalar(r * 1.2 * (0.6 + 0.4 * kk)); s.material.opacity = 0.9 * Math.min(1, t * 8);
      if (kk >= 1) { this.splat(pos, r * 1.6); this.ring(pos, r * 1.1, 0.45, K.ghost, 0.5); return false; }
      return true;
    }, () => this.give('bigPaw', s));
  },
  /** a hexed foe bursts (Everlasting Gloom): a puff of gloom and flung drips */
  burst(pos, r) {
    this.gloomPuff(_a.copy(pos).setY(pos.y + 0.4), 8, r * 0.4);
    this.ring(pos, r, 0.4, K.ghost, 0.45);
    for (let i = 0; i < 8; i++) { const a = rand(0, TAU), sp = rand(1.5, 3); this.pn.spawn({ x: pos.x, y: pos.y + 0.5, z: pos.z, vx: Math.cos(a) * sp, vy: rand(1.5, 3), vz: Math.sin(a) * sp, life: 0.6, size: 0.1, color: K.ghost, alpha: 1, alpha1: 0.5, grav: 9, frame: SF.DROP, rot: Math.PI }); }
  },
  /** a hex jumping from a fallen foe to the next: a ghostlight wisp arcing between them (0.3 s) */
  hexJump(from, to) {
    const a = from.clone(), b = to.clone();
    this.run((dt, t) => {
      const k = clamp(t / 0.3);
      for (let i = this.emit('hexJump', 60, dt); i > 0; i--) { _a.lerpVectors(a, b, k); _a.y += 0.6 + Math.sin(k * Math.PI) * 1.2; this.pn.spawn({ x: _a.x, y: _a.y, z: _a.z, life: 0.3, size: 0.18, size1: 0.05, color: K.ghost, alpha: 0.8, alpha1: 0, frame: SF.WISP }); }
      return k < 1;
    });
  },

  // ================================================================== Ghostlight Tome
  /** the spectral tome, open and floating at his left paw while he reads. → handle { set(pos, facing, k), pages(n), end() } */
  tome() {
    const g = this.take('tome', () => {
      const root = new THREE.Group();
      const mat = makeToon({ color: '#6a3a6a', rim: 0.5, brush: 0.04, emissive: '#2f9a86', emissiveIntensity: 0.12 }), page = makeToon({ color: '#f2ece0', rim: 0.3, brush: 0.03, emissive: '#bff6e6', emissiveIntensity: 0.25 });
      const L = new THREE.Group(), R = new THREE.Group();
      const cl = new THREE.Mesh(boxG(0.16, 0.012, 0.22), mat); cl.position.x = -0.08; L.add(cl);
      const pl = new THREE.Mesh(boxG(0.15, 0.02, 0.2), page); pl.position.set(-0.075, 0.014, 0); L.add(pl);
      const cr = new THREE.Mesh(boxG(0.16, 0.012, 0.22), mat); cr.position.x = 0.08; R.add(cr);
      const pr = new THREE.Mesh(boxG(0.15, 0.02, 0.2), page); pr.position.set(0.075, 0.014, 0); R.add(pr);
      const flap = new THREE.Mesh(boxG(0.14, 0.004, 0.19), page); flap.position.x = 0.07; const F = new THREE.Group(); F.add(flap);
      const glow = sprite(SF.MOTE, K.ghost, { blending: THREE.AdditiveBlending, opacity: 0.3 }); glow.scale.setScalar(0.5); glow.position.y = 0.06;
      root.add(L, R, F, glow); root.userData = { L, R, F, glow };
      root.traverse(o => { if (o.isMesh) o.castShadow = false; });
      return root;
    });
    const U = g.userData; let k = 0, ended = false; const at = new THREE.Vector3(); let face = 0;
    const H = {
      set: (pos, facing, open = 1) => { at.copy(pos); face = facing; },
      pages: (n = 4) => { for (let i = 0; i < n; i++) this.pn.spawn({ x: g.position.x, y: g.position.y + 0.1, z: g.position.z, vx: rand(-1, 1), vy: rand(1.2, 2.2), vz: rand(-1, 1), life: rand(0.7, 1), size: 0.14, size1: 0.1, color: K.cream, alpha: 1, alpha1: 0, drag: 2, grav: -0.5, frame: SF.PAGE, spin: rand(-5, 5) }); },
      end: () => { ended = true; },
    };
    this.run((dt, t) => {
      k = ended ? Math.max(0, k - dt * 5) : Math.min(1, k + dt * 6);
      g.position.set(at.x, at.y + Math.sin(t * 3) * 0.02, at.z); g.rotation.set(0, face, 0);
      g.scale.setScalar(Math.max(0.01, 1.15 * ease.outBack(k)));
      const open = 0.9 * k; U.L.rotation.z = open * 0.55; U.R.rotation.z = -open * 0.55; U.F.rotation.z = -open * 0.55 + Math.max(0, Math.sin(t * 7)) * 2.4 * k; // (a page flicking over)
      U.glow.material.opacity = 0.28 * k;
      if (k > 0.5) for (let i = this.emit('tomeMote', 10, dt); i > 0; i--) this.pa.spawn({ x: g.position.x + rand(-0.1, 0.1), y: g.position.y + 0.08, z: g.position.z + rand(-0.1, 0.1), vy: rand(0.4, 0.9), life: 0.6, size: 0.09, size1: 0.02, color: K.ghost, alpha: 0.7, alpha1: 0, frame: SF.SPARK });
      return !(ended && k <= 0);
    }, () => this.give('tome', g));
    return H;
  },
  /** ghostlight spilling out of the tome (a summon): a column of wisps and pages */
  summonPuff(pos, r = 0.6) {
    for (let i = 0; i < 14; i++) { const a = rand(0, TAU), d = rand(0, r); this.pn.spawn({ x: pos.x + Math.cos(a) * d, y: pos.y + rand(0, 0.4), z: pos.z + Math.sin(a) * d, vx: Math.cos(a) * 0.6, vy: rand(1, 2.2), vz: Math.sin(a) * 0.6, life: rand(0.5, 0.8), size: rand(0.2, 0.32), size1: 0.06, color: i % 2 ? K.ghostLt : K.ghost, alpha: 0.7, alpha1: 0, drag: 1.5, frame: SF.WISP }); }
    this.ring(pos, r * 2.2, 0.45, K.ghost, 0.4);
    this.glint(_a.copy(pos).setY(pos.y + 0.5), 3);
  },
  hearts(pos, n = 4) {
    for (let i = 0; i < n; i++) this.pn.spawn({ x: pos.x + rand(-0.15, 0.15), y: pos.y, z: pos.z + rand(-0.15, 0.15), vx: rand(-0.5, 0.5), vy: rand(0.9, 1.6), vz: rand(-0.5, 0.5), life: rand(0.8, 1.1), size: rand(0.16, 0.22), size1: 0.1, color: COL.heart, alpha: 1, alpha1: 0, drag: 1.5, frame: SF.HEART, spin: rand(-1, 1) });
  },
  /** Borrowed Warmth: a ghostlight thread from a foe to him, warm motes running along it to him. → { set(foePos, heroPos, dt), end() } */
  tether() {
    const m = this.take('tether', () => { const x = stripMesh(14, new THREE.MeshBasicMaterial({ map: threadTex(), transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false, opacity: 0.8 })); x.renderOrder = 10; return x; });
    const cam = this.engine.camera, P = m.userData.pts; let k = 0, ended = false, ph = rand(0, TAU);
    const A = new THREE.Vector3(), B = new THREE.Vector3();
    const H = {
      set: (a, b, dt) => {
        A.copy(a); B.copy(b);
        if (k > 0.5) for (let i = this.emit('tetherMote' + ph, 9, dt); i > 0; i--) {
          const q = this.pn.spawn({ x: A.x, y: A.y, z: A.z, life: 0.55, size: 0.12, size1: 0.07, color: COL.warm, alpha: 1, alpha1: 0.8, frame: SF.MOTE,
            fn: (qq, dd, kk) => { const u = kk; qq.x = A.x + (B.x - A.x) * u; qq.z = A.z + (B.z - A.z) * u; qq.y = A.y + (B.y - A.y) * u + Math.sin(u * Math.PI) * 0.35 + Math.sin(u * 9 + ph) * 0.05; } });
        }
      },
      end: () => { ended = true; },
    };
    this.run((dt, t) => {
      k = ended ? Math.max(0, k - dt * 6) : Math.min(1, k + dt * 8);
      const L = A.distanceTo(B);
      for (let i = 0; i < P.length; i++) { const u = i / (P.length - 1); P[i].lerpVectors(B, A, u * k); P[i].y += Math.sin(u * Math.PI) * 0.35 + Math.sin(u * Math.min(10, L * 2) - t * 7 + ph) * 0.06 * Math.sin(u * Math.PI); }
      writeStrip(m, cam, u => 0.05 + 0.03 * Math.sin(u * Math.PI), 1);
      m.material.opacity = 0.8 * k;
      return !(ended && k <= 0);
    }, () => this.give('tether', m));
    return H;
  },
  /** a roadside ghostlight lantern (his joining scene): a small plum paper lantern on the ground, unlit until light().
   *  → handle { root, light(), snuff(to, dur) (its flame flies off as a wisp to `to`), end() } */
  shrineLantern(pos, yaw = 0) {
    const g = this.take('shrineLantern', () => {
      const root = new THREE.Group();
      const frame = GEO.lanFrame ||= makeToon({ color: '#4a2a4a', rim: 0.5, brush: 0.04 });
      const paper = GEO.lanPaper ||= makeToon({ color: '#f2ead8', rim: 0.4, brush: 0.05, emissive: '#5ce0c0', emissiveIntensity: 0 });
      const add = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.castShadow = false; root.add(m); return m; };
      add(new THREE.CylinderGeometry(0.1, 0.12, 0.04, 10), frame, 0.02);
      const body = add(new THREE.SphereGeometry(0.13, 14, 10).scale(1, 1.25, 1), paper.clone(), 0.2);
      add(new THREE.CylinderGeometry(0.06, 0.09, 0.04, 10), frame, 0.37);
      const flame = sprite(SF.MOTE, COL.flame, { blending: THREE.AdditiveBlending, opacity: 0 }); flame.scale.setScalar(0.42); flame.position.y = 0.2; flame.renderOrder = 13; root.add(flame);
      root.userData = { flame, body };
      return root;
    });
    const { flame, body } = g.userData; g.position.copy(pos); g.rotation.y = yaw; g.scale.setScalar(1);
    const H = { root: g, lit: 0, want: 0, done: false,
      light: () => { H.want = 1; this.glint(_a.set(pos.x, pos.y + 0.3, pos.z), 4); this.pa.spawn({ frame: SF.DOT, x: pos.x, y: pos.y + 0.22, z: pos.z, life: 0.3, size: 0.2, size1: 0.7, color: K.ghost, alpha: 0.6, alpha1: 0 }); },
      snuff: (to, dur = 0.45) => {
        H.want = 0; const a = _b.set(pos.x, pos.y + 0.22, pos.z).clone(), b = to.clone();
        this.run((dt, t) => { const k = clamp(t / dur); for (let i = this.emit('snuff' + pos.x, 70, dt); i > 0; i--) { _c.lerpVectors(a, b, ease.inQuad(k)); _c.y += Math.sin(k * Math.PI) * 0.6; this.pa.spawn({ x: _c.x, y: _c.y, z: _c.z, life: 0.25, size: 0.16, size1: 0.04, color: K.ghost, alpha: 0.8, alpha1: 0, frame: SF.WISP }); } return k < 1; });
      },
      end: () => { H.done = true; },
    };
    this.run((dt, t) => {
      H.lit += (H.want - H.lit) * Math.min(1, dt * 6);
      flame.material.opacity = Math.min(0.55, 0.5 * H.lit * (0.85 + 0.15 * Math.sin(t * 9 + pos.x)));
      body.material.emissiveIntensity = 0.35 * H.lit;
      if (H.lit > 0.5 && Math.random() < dt * 3) this.pa.spawn({ x: pos.x + rand(-0.06, 0.06), y: pos.y + 0.35, z: pos.z + rand(-0.06, 0.06), vy: rand(0.3, 0.6), life: 1, size: 0.07, size1: 0.02, color: K.ghost, alpha: 0.7, alpha1: 0, frame: SF.MOTE });
      return !H.done;
    }, () => this.give('shrineLantern', g));
    return H;
  },
  /** Wayhome Lantern: the lantern set on the floor, its pool of light (the area), a few motes, a small light.
   *  → handle { pos, set(k), flare(), end() } */
  lantern(pos, r) {
    const g = this.take('lantern', () => {
      const root = new THREE.Group();
      const frame = makeToon({ color: '#4a2a4a', rim: 0.5, brush: 0.04 }), silver = makeToon({ color: '#c8ccd8', rim: 0.6, brush: 0.03 });
      const glass = new THREE.MeshBasicMaterial({ color: '#c8fff0', transparent: true, opacity: 0.88, toneMapped: false });
      const add = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.castShadow = false; root.add(m); return m; }; // (no shadow: an effect, cheap in a horde)
      add(new THREE.CylinderGeometry(0.16, 0.19, 0.06, 12), frame, 0.03);
      add(new THREE.CylinderGeometry(0.13, 0.13, 0.3, 12), glass, 0.21);
      for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + Math.PI / 4, m = add(new THREE.CylinderGeometry(0.014, 0.014, 0.32, 5), frame, 0.21); m.position.x = Math.cos(a) * 0.135; m.position.z = Math.sin(a) * 0.135; }
      add(new THREE.CylinderGeometry(0.09, 0.17, 0.08, 12), frame, 0.4);
      add(new THREE.TorusGeometry(0.06, 0.012, 6, 14), silver, 0.5).rotation.x = 0;
      const flame = sprite(SF.MOTE, COL.flame, { blending: THREE.AdditiveBlending, opacity: 0.55 }); flame.scale.setScalar(0.5); flame.position.y = 0.22; flame.renderOrder = 13; root.add(flame);
      const pool = decal(lightTex()); root.userData = { flame, pool };
      return root;
    });
    const { flame, pool } = g.userData; this.scene.add(pool); pool.visible = true;
    g.position.copy(pos); pool.position.set(pos.x, pos.y + 0.04, pos.z);
    const light = this.vfx.lightPool?.addSource?.({ pos: _a.copy(pos).setY(pos.y + 0.7).clone(), color: new THREE.Color('#7af0d0'), intensity: 2.2, radius: Math.min(6, r * 1.1) });
    const H = { pos: pos.clone(), k: 0, ended: false, flareT: 0, set: () => {}, flare: () => { H.flareT = 1; this.summonPuff(H.pos, 0.8); this.hearts(_a.copy(H.pos).setY(H.pos.y + 1), 6); }, end: () => { H.ended = true; } };
    this.run((dt, t) => {
      H.k = H.ended ? Math.max(0, H.k - dt * 2.5) : Math.min(1, H.k + dt * 3);
      H.flareT = Math.max(0, H.flareT - dt * 1.5);
      g.scale.setScalar(Math.max(0.01, ease.outBack(Math.min(1, H.k * 1.2))));
      flame.material.opacity = Math.min(0.6, (0.42 + 0.08 * Math.sin(t * 8) + 0.2 * H.flareT) * H.k); flame.scale.setScalar(0.45 + 0.05 * Math.sin(t * 11) + 0.4 * H.flareT);
      pool.scale.setScalar(r * (0.6 + 0.4 * ease.outCubic(H.k))); pool.material.opacity = 0.75 * H.k; pool.rotation.y += dt * 0.15;
      if (H.k > 0.5) for (let i = this.emit('lanternMote', 6, dt); i > 0; i--) { const a = rand(0, TAU), d = Math.sqrt(Math.random()) * r * 0.9; this.pa.spawn({ x: pos.x + Math.cos(a) * d, y: pos.y + 0.1, z: pos.z + Math.sin(a) * d, vy: rand(0.3, 0.7), life: rand(1, 1.6), size: 0.08, size1: 0.02, color: i % 2 ? COL.warm : K.ghost, alpha: 0.65, alpha1: 0, frame: SF.MOTE }); }
      return !(H.ended && H.k <= 0);
    }, () => { if (light) this.vfx.lightPool?.removeSource?.(light); pool.parent?.remove(pool); this.give('lantern', g); });
    return H;
  },
};
for (const k in M) if (!(k in ShihtzuFX.prototype)) ShihtzuFX.prototype[k] = M[k];
// prewarm (vfx.prewarm at each combat world's entry): build one of each below the floor and compile, so the first ghost pup,
// Grandpaw, tome, lantern or cloud of a session doesn't hitch on its shaders (the ghosts' are their own ShaderMaterials)
const prewarm0 = ShihtzuFX.prototype.prewarm;
ShihtzuFX.prototype.prewarm = function (renderer, camera) {
  prewarm0.call(this, renderer, camera);
  try {
    const p = new THREE.Vector3(0, -50, 0), B = this.pupBatch(), W = this.boneBatch(), s1 = B.add(), s2 = W.add();
    B.set(s1, { x: 0, y: -50, z: 0, alpha: 1 }); W.set(s2, { x: 0, y: -50, z: 0, alpha: 1 });
    const gp = this.grandpaw(); gp.model.set({ x: 0, y: -50, z: 0, alpha: 1 });
    const tome = this.tome(); tome.set(p, 0); const sw = this.swirl(); sw.set(p, 2, 0.016); const cl = this.cloud(p, 2); const te = this.tether(); te.set(p, p.clone().setX(1), 0.016);
    const lan = this.lantern(p, 2); this.sweep(p, 0, 120, 2);
    renderer.compile(this.scene, camera);
    requestAnimationFrame(() => requestAnimationFrame(() => { B.remove(s1); W.remove(s2); this.giveGrandpaw(gp); tome.end(); sw.end(); cl.end(); te.end(); lan.end(); }));
  } catch (e) { /* cosmetic */ }
};
// (the ghost batches outlive their effects: a floor change empties them, the allies' handles then find no slot)
const clear0 = ShihtzuFX.prototype.clear;
ShihtzuFX.prototype.clear = function () { clear0.call(this); for (const b of [this._pups, this._bones]) if (b) { while (b.slots.length) b.remove(b.slots[b.slots.length - 1]); } };
