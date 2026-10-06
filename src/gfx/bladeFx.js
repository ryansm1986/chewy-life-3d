// Chewy the samurai's effects (docs/HEROES.md "Chewy the samurai"): the katana's swing trails (bone-white crescents
// with a warm gold edge: samuraiPalette.js), Crescent Chomp's moon-shaped crescent and its charged wave, Flash Draw's cut line, the Kiai!
// shout ring and burst, the sheathing glint and the chiburi flick. One BladeFX per VFX instance (the village's and each
// Burrow floor's) through vfx.js' extension hook, like SpellFX / ChargeFX.
// Readability (docs/CHARGE.md §4): everything is normal-blended (bone-white, the outfit's gold and a thin ink line read on any floor
// without adding light), see-through toward its inner edge, short-lived and capped in size (CAP below), so a burst of
// cuts never sheets the screen. Budget: every mesh is pooled (added to the scene once, hidden when idle), the materials
// are per pooled mesh (one shader program per kind), particles go through SpellFX's atlas layers, and nothing in a
// per-frame path allocates.
import * as THREE from 'three';
import { registerVfxExtension } from './vfx.js';
import { spellFx, F } from './spellFx.js';
import { SAMURAI, BONE_WHITE } from './samuraiPalette.js';
import { bannerMesh, spectralBladeGeo, spectralMaterial } from './samuraiProps.js';
import { rand, TAU, clamp, ease } from '../core/util.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _m = new THREE.Matrix4();
const CAM_R = new THREE.Vector3(), CAM_U = new THREE.Vector3(), CAM_F = new THREE.Vector3();
const CORE = new THREE.Color(BONE_WHITE), EDGE = new THREE.Color(SAMURAI.trailEdge), WHITE = new THREE.Color('#ffffff');
const INK = new THREE.Color('#3a2230'), GOLD = new THREE.Color(SAMURAI.gold), MOON = new THREE.Color('#dfe8ff'), WATER = new THREE.Color('#bfe8ff');
// size caps (m): the trails, the crescent wave and the shout ring never grow past these, whatever a charge asks for
export const CAP = { arc: 4.2, wave: 9, shout: 6.5, line: 16 };

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
// The trails lie on a finely tessellated flat disc, lifted along the arc by uTilt (its rise from the cut's left end to
// its right end, in disc radii): a kesa from high right to low left is a ribbon that descends round him, which reads as
// a diagonal from the high camera far better than a tilted flat plane (seen almost edge-on).
const VS_ARC = /* glsl */`
uniform float uTilt, uArc; varying vec2 vUv;
void main() {
  vUv = uv; vec3 p = position;
  p.y += uTilt * clamp(atan(p.x, -p.z) / max(uArc, 0.01), -0.5, 0.5);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
// A swing trail (polar round its centre): the arc spans ±uArc/2 about local −Z; uHead (0..1) is how far the cut has swept,
// uK its fade. Mode 0 a blade trail (bold at the head, thinning back along the arc); mode 1 Crescent Chomp's crescent moon
// (full in the middle, horns at both ends); mode 2 a Kiai! shout front (a zigzag leading edge). Across the band (d: 0 the
// outer edge → 1 the inner): a thin ink line just outside (it reads on bright floors), the outfit's warm accent as a rim,
// the bone-white body, then see-through toward the middle (the foes behind stay readable).
const FS_ARC = /* glsl */`
uniform float uK, uHead, uArc, uW, uRev, uMode, uA;
uniform vec3 uCore, uEdge; varying vec2 vUv;
float h1(float x) { return fract(sin(x * 91.7) * 43758.5); }
void main() {
  vec2 q = (vUv - 0.5) * 2.0; float r = length(q);
  float th = atan(q.x, q.y), hw = uArc * 0.5;
  if (abs(th) > hw || r > 1.0) discard;
  float s = th / uArc + 0.5; if (uRev > 0.5) s = 1.0 - s; // 0 where the cut starts, 1 where it ends
  if (s > uHead) discard;
  float shape = uMode < 0.5 ? smoothstep(uHead - 1.0, uHead - 0.3, s) : sin(3.14159 * clamp(s, 0.0, 1.0));
  shape *= 1.0 - 0.35 * smoothstep(uHead - 0.04, uHead, s); // (a round head)
  float w = uW * (0.15 + 0.85 * shape);
  float R0 = uMode > 1.5 ? 1.0 - 0.07 * abs(fract(th * 9.0 / 3.14159) - 0.5) * 2.0 : 1.0; // (mode 2: a shout's zigzag front)
  float d = (R0 - r) / max(w, 1e-3);
  float ink = 0.13;
  if (d < -ink || d > 1.0) discard;
  float aa = fwidth(d) * 1.4;
  float lane = floor(th * 40.0), streak = smoothstep(0.55, 1.0, h1(lane)) * smoothstep(0.3, 0.55, d);
  float rim = 1.0 - smoothstep(0.02, 0.26, d);
  vec3 c = mix(uCore, uEdge, rim);
  c = mix(c, uCore * 0.88, streak * 0.35);
  float body = smoothstep(-aa, aa, d) * (1.0 - smoothstep(0.5, 1.0, d)) * (0.45 + 0.55 * shape);
  float line = smoothstep(-ink - aa, -ink + aa, d) * (1.0 - smoothstep(-aa, aa, d)) * shape * (uMode > 1.5 ? 1.0 : 0.7);
  c = mix(c, vec3(0.23, 0.13, 0.19), line / max(line + body, 1e-3));
  float fade = 1.0 - smoothstep(0.25, 1.0, uK);
  gl_FragColor = vec4(c, max(body * 0.96, line) * fade * uA);
}`;
// the Kiai! shout: a ground ring whose front is a zigzag of comic shout lines, a bold ink rim, white behind it
const FS_SHOUT = /* glsl */`
uniform float uK, uA, uW; uniform vec3 uCol; varying vec2 vUv;
void main() {
  vec2 q = (vUv - 0.5) * 2.0; float r = length(q); if (r > 1.0) discard;
  float th = atan(q.x, q.y), z = abs(fract(th * 6.0 / 3.14159) - 0.5) * 2.0; // 12 teeth
  float R = 1.0 - 0.08 * z, w = uW * (1.0 - 0.5 * uK);
  float d = (R - r) / w; if (d < -0.15 || d > 1.0) discard;
  float aa = fwidth(d) * 1.5;
  float ink = smoothstep(-0.15, -0.15 + aa, d) * (1.0 - smoothstep(0.08, 0.08 + aa, d));
  float body = smoothstep(0.06, 0.06 + aa, d) * (1.0 - smoothstep(0.5, 1.0, d));
  float fade = 1.0 - smoothstep(0.4, 1.0, uK);
  vec3 c = mix(uCol, vec3(0.23, 0.13, 0.19), ink);
  gl_FragColor = vec4(c, max(body * 0.9, ink * 0.85) * fade * uA);
}`;
// Flash Draw's cut line: a thin white-hot stroke with the outfit's warm accent glowing round it, wiping in along the path
const FS_LINE = /* glsl */`
uniform float uK, uWipe, uA; uniform vec3 uCore, uEdge; varying vec2 vUv;
void main() {
  if (vUv.x > uWipe) discard;
  float v = abs(vUv.y - 0.5) * 2.0, end = smoothstep(0.0, 0.06, vUv.x) * (1.0 - smoothstep(0.94, 1.0, vUv.x));
  float thin = mix(0.32, 0.12, smoothstep(0.0, 0.4, uK));
  float core = 1.0 - smoothstep(thin * 0.6, thin, v), glow = (1.0 - smoothstep(thin, 1.0, v)) * 0.75;
  float fade = 1.0 - smoothstep(0.3, 1.0, uK);
  vec3 c = mix(uEdge, uCore, core);
  gl_FragColor = vec4(c, max(core, glow) * end * fade * uA);
}`;
const OPTS = { transparent: true, depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide };
const GEO = {};
const flatGeo = () => GEO.flat || (GEO.flat = (() => { const g = new THREE.PlaneGeometry(2, 2); g.rotateX(-Math.PI / 2); return g; })());
const discGeo = () => GEO.disc || (GEO.disc = (() => { const g = new THREE.PlaneGeometry(2, 2, 40, 40); g.rotateX(-Math.PI / 2); return g; })()); // (the trails bend along it)
// a unit strip from the origin back along −z (the crack runs along it; v = 0 at the origin, v = 1 at the far end)
const stripGeo = () => GEO.strip || (GEO.strip = (() => { const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); g.translate(0, 0, -0.5); return g; })());
const lineGeo = () => GEO.line ||(GEO.line = (() => { const g = new THREE.PlaneGeometry(1, 1); g.translate(0.5, 0, 0); return g; })());

// the Kiai! burst: a comic shout balloon (a jagged star, ink-outlined, two bold marks), drawn once
let BURST = null;
function burstTex() {
  if (BURST) return BURST;
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.translate(128, 128); g.lineJoin = 'round';
  g.beginPath();
  for (let i = 0; i < 28; i++) { const a = (i / 28) * TAU, r = i % 2 ? 78 : 112 + (i % 4 === 0 ? 8 : 0); g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r * 0.86); }
  g.closePath(); g.fillStyle = '#fffaf0'; g.fill(); g.lineWidth = 12; g.strokeStyle = '#3a2230'; g.stroke();
  g.fillStyle = SAMURAI.gold; g.strokeStyle = '#3a2230'; g.lineWidth = 9;
  for (const x of [-26, 26]) { g.beginPath(); g.roundRect(x - 13, -58, 26, 72, 12); g.fill(); g.stroke(); g.beginPath(); g.arc(x, 40, 13, 0, TAU); g.fill(); g.stroke(); }
  BURST = new THREE.CanvasTexture(c); BURST.colorSpace = THREE.SRGBColorSpace; BURST.anisotropy = 4;
  return BURST;
}

export class BladeFX {
  constructor(vfx) {
    this.vfx = vfx; this.scene = vfx.scene; this.engine = vfx.engine;
    this.pools = new Map(); this.active = []; this.acc = {};
  }
  get spell() { return this.vfx.spell || spellFx({ vfx: this.vfx }); }
  take(kind, make) { let P = this.pools.get(kind); if (!P) this.pools.set(kind, P = []); const o = P.pop() || this.adopt(make()); o.visible = true; return o; }
  adopt(o) { o.frustumCulled = false; this.scene.add(o); return o; }
  give(kind, o) { o.visible = false; this.pools.get(kind)?.push(o); }
  run(update, end) { this.active.push({ update, end, t: 0 }); }
  emit(key, rate, dt) { const a = (this.acc[key] || 0) + rate * dt; const n = Math.floor(a); this.acc[key] = a - n; return n; }
  update(dt) {
    this.engine.camera.matrixWorld.extractBasis(CAM_R, CAM_U, CAM_F);
    const A = this.active;
    for (let i = 0; i < A.length; i++) {
      const f = A[i]; f.t += dt; let keep = false;
      try { keep = f.update(dt, f.t) !== false; } catch (e) { console.warn('[bladeFx]', e); }
      if (!keep) { try { f.end?.(); } catch (e) { console.warn('[bladeFx]', e); } A[i] = A[A.length - 1]; A.pop(); i--; }
    }
  }
  clear() { for (const f of this.active) { try { f.end?.(); } catch (e) { /* ignore */ } } this.active.length = 0; }
  mArc() { return new THREE.ShaderMaterial({ vertexShader: VS_ARC, fragmentShader: FS_ARC, ...OPTS, uniforms: { uTilt: { value: 0 }, uK: { value: 0 }, uHead: { value: 0 }, uArc: { value: 2 }, uW: { value: 0.2 }, uRev: { value: 0 }, uMode: { value: 0 }, uA: { value: 1 }, uCore: { value: CORE.clone() }, uEdge: { value: EDGE.clone() } } }); }
  mShout() { return new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS_SHOUT, ...OPTS, uniforms: { uK: { value: 0 }, uA: { value: 1 }, uW: { value: 0.12 }, uCol: { value: WHITE.clone() } }, polygonOffset: true, polygonOffsetFactor: -3 }); }
  mLine() { return new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS_LINE, ...OPTS, uniforms: { uK: { value: 0 }, uWipe: { value: 0 }, uA: { value: 1 }, uCore: { value: WHITE.clone() }, uEdge: { value: EDGE.clone() } } }); }
  arcMesh() { return this.take('arc', () => { const o = new THREE.Mesh(discGeo(), this.mArc()); o.renderOrder = 13; o.rotation.order = 'YXZ'; return o; }); }

  // ------------------------------------------------------------------ the swing trail
  /**
   * A katana trail round the hero: an arc of `arc` rad centred on his facing, radius r (m), at height y; tilt (m): how
   * much higher its right end is than its left (a kesa from high right to low left is tilt > 0), roll: the plane's own
   * roll about his facing (small). rev: the cut sweeps right to left (else left to right). sweep: the seconds the cut takes to draw; life: until it's gone.
   * mode 0 a trail, 1 Crescent Chomp's crescent moon. edge / core: colours (defaults: the outfit's warm accent,
   * samuraiPalette.js trailEdge, on bone white).
   */
  arc(origin, facing, { arc = 2.2, r = 1.7, roll = 0, tilt = 0, y = 0.6, rev = false, width = 0.34, life = 0.26, sweep = 0.07, mode = 0, grow = 0.1, a = 1, edge = null, core = null, pitch = 0 } = {}) {
    const m = this.arcMesh(), U = m.material.uniforms;
    r = Math.min(r, CAP.arc);
    U.uArc.value = Math.min(TAU * 0.95, arc); U.uW.value = clamp(width / r, 0.05, 0.6); U.uRev.value = rev ? 1 : 0; U.uMode.value = mode; U.uA.value = a;
    U.uCore.value.copy(core || CORE); U.uEdge.value.copy(edge || EDGE); U.uK.value = 0; U.uHead.value = 0; U.uTilt.value = tilt / r;
    m.position.set(origin.x, (origin.y || 0) + y, origin.z); m.rotation.set(pitch, facing + Math.PI, roll); m.scale.setScalar(r);
    const fx = facing, spell = this.spell;
    let sparked = false;
    this.run((dt, t) => {
      U.uHead.value = Math.min(1, t / Math.max(0.01, sweep));
      const k = Math.min(1, t / life); U.uK.value = k; m.scale.setScalar(r * (1 + grow * ease.outCubic(k)));
      if (!sparked && U.uHead.value >= 1) { // a few bone-white glints flung off the end of the cut
        sparked = true;
        const end = (rev ? -1 : 1) * U.uArc.value * 0.5, ax = Math.sin(fx - end), az = Math.cos(fx - end);
        _a.set(origin.x + ax * r, (origin.y || 0) + y + tilt * (rev ? -0.5 : 0.5), origin.z + az * r);
        spell.sparkBurst(_a, { n: 5, color: CORE, speed: 2.6, size: 0.2, life: 0.3, frame: F.SPARK, grav: 3, layer: 'n' });
      }
      return k < 1;
    }, () => this.give('arc', m));
  }
  /** Crescent Chomp's charged wave: a bone-white crescent moon that rolls out from r0 to r1; onStep(rPrev, r) sweeps hits */
  wave(origin, facing, { arc = 2.4, r0 = 1.4, r1 = 5, life = 0.42, width = 0.7, y = 0.4, onStep = null, edge = null, core = null, mode = 1, a = 1 } = {}) {
    const m = this.arcMesh(), U = m.material.uniforms;
    r1 = Math.min(r1, CAP.wave);
    U.uArc.value = Math.min(TAU * 0.9, arc); U.uRev.value = 0; U.uMode.value = mode; U.uA.value = a; U.uHead.value = 1; U.uK.value = 0; U.uTilt.value = 0;
    U.uCore.value.copy(core || CORE); U.uEdge.value.copy(edge || EDGE);
    const ox = origin.x, oy = origin.y || 0, oz = origin.z;
    m.position.set(ox, oy + y, oz); m.rotation.set(0, facing + Math.PI, 0);
    let rPrev = r0;
    this.run((dt, t) => {
      const k = Math.min(1, t / life), r = r0 + (r1 - r0) * ease.outQuad(k);
      m.scale.setScalar(r); U.uK.value = k * k; U.uW.value = clamp(width / Math.max(0.5, r), 0.06, 0.5);
      for (let i = this.emit('wave', 40, dt); i > 0; i--) { // dust and glints kicked up along the front
        const a = facing + (Math.random() - 0.5) * U.uArc.value * 0.85;
        this.vfx.smoke.spawn({ x: ox + Math.sin(a) * r, y: oy + 0.15, z: oz + Math.cos(a) * r, vx: Math.sin(a) * 2, vy: rand(0.3, 1), vz: Math.cos(a) * 2, life: rand(0.3, 0.5), size: 0.3, size1: 0.8, color: '#efe2c8', alpha: 0.5, alpha1: 0, drag: 4 });
        if (Math.random() < 0.35) this.spell.pn.spawn({ frame: F.SPARK, x: ox + Math.sin(a) * r, y: oy + y + 0.1, z: oz + Math.cos(a) * r, vy: rand(0.8, 2), life: 0.3, size: 0.2, size1: 0.04, color: CORE, alpha: 1, alpha1: 0 });
      }
      if (onStep) onStep(rPrev, r);
      rPrev = r;
      return k < 1;
    }, () => this.give('arc', m));
  }

  // ------------------------------------------------------------------ Flash Draw: the cut line along the path
  /** a white-hot cut that wipes along a → b (the dash path) and fades; sparks pop along it */
  cutLine(a, b, { y = 0.6, width = 0.5, life = 0.5 } = {}) {
    const len = Math.min(CAP.line, Math.hypot(b.x - a.x, b.z - a.z)); if (len < 0.2) return;
    const m = this.take('line', () => { const o = new THREE.Mesh(lineGeo(), this.mLine()); o.renderOrder = 14; return o; });
    const U = m.material.uniforms; U.uK.value = 0; U.uWipe.value = 0; U.uA.value = 1;
    // a ribbon along the path, turned to face the camera round its own axis (and a slight anime slant)
    const dx = (b.x - a.x) / len, dz = (b.z - a.z) / len;
    const slant = 0.06;
    _a.set(dx, slant, dz).normalize(); _b.crossVectors(_a, CAM_F).normalize(); _c.crossVectors(_a, _b);
    _m.makeBasis(_a.multiplyScalar(len), _b.multiplyScalar(width), _c); m.matrixAutoUpdate = false;
    m.matrix.copy(_m).setPosition(a.x, (a.y || 0) + y - slant * len * 0.5, a.z); m.matrixWorldNeedsUpdate = true;
    const ax = a.x, ay = (a.y || 0) + y, az = a.z, sp = this.spell;
    this.run((dt, t) => {
      const wipe = Math.min(1, t / 0.06); U.uWipe.value = wipe; const k = Math.min(1, t / life); U.uK.value = k;
      for (let i = this.emit('line', 90 * (1 - k), dt); i > 0; i--) { const s = Math.random() * wipe; sp.pn.spawn({ frame: Math.random() < 0.3 ? F.GLOWSTAR : F.SPARK, x: ax + dx * len * s, y: ay + rand(-0.1, 0.25), z: az + dz * len * s, vx: rand(-0.6, 0.6), vy: rand(0.4, 1.6), vz: rand(-0.6, 0.6), life: 0.35, size: rand(0.14, 0.24), size1: 0.03, color: Math.random() < 0.4 ? EDGE : CORE, alpha: 1, alpha1: 0 }); }
      return k < 1;
    }, () => { m.matrixAutoUpdate = true; this.give('line', m); });
  }

  // ------------------------------------------------------------------ Kiai!: the shout
  /** a zigzag shout ring rolling out to r on the ground, and a comic burst popping at the head (headY above pos) */
  shout(pos, { r = 3.5, life = 0.42, color = WHITE, headY = 1.3, burst = true } = {}) {
    r = Math.min(r, CAP.shout);
    const m = this.take('shout', () => { const o = new THREE.Mesh(flatGeo(), this.mShout()); o.renderOrder = 10; return o; });
    const U = m.material.uniforms; U.uK.value = 0; U.uA.value = 1; U.uCol.value.copy(color); U.uW.value = Math.min(0.5 / r, 0.3);
    const x = pos.x, y = pos.y || 0, z = pos.z;
    m.position.set(x, y + 0.08, z); m.rotation.set(0, rand(0, TAU), 0);
    this.run((dt, t) => { const k = Math.min(1, t / life); m.scale.setScalar(0.4 + (r - 0.4) * ease.outCubic(k)); U.uK.value = k; return k < 1; }, () => this.give('shout', m));
    // short radial speed lines at chest height, rushing out with the ring
    const sp = this.spell;
    for (let i = 0; i < 14; i++) { const a = i / 14 * TAU + rand(-0.1, 0.1), v = rand(7, 10); sp.pn.spawn({ frame: F.STREAK, x: x + Math.cos(a) * 0.5, y: y + 0.6 + rand(-0.1, 0.3), z: z + Math.sin(a) * 0.5, vx: Math.cos(a) * v, vy: 0, vz: Math.sin(a) * v, life: 0.22, size: 0.42, size1: 0.1, color: WHITE, alpha: 1, alpha1: 0, drag: 4, stretch: 3, fn: streakFn }); }
    if (!burst) return;
    const s = this.take('burst', () => { const o = new THREE.Sprite(new THREE.SpriteMaterial({ map: burstTex(), transparent: true, depthWrite: false, depthTest: false, toneMapped: false, fog: false })); o.renderOrder = 22; return o; });
    const rot = rand(-0.25, 0.25); s.material.rotation = rot; s.material.opacity = 1;
    this.run((dt, t) => {
      const k = Math.min(1, t / 0.5), pop = ease.outBack(Math.min(1, t / 0.12));
      s.position.set(x, y + headY + 0.55 + 0.2 * k, z); s.scale.setScalar(0.62 * pop * (1 + 0.08 * k)); s.material.opacity = 1 - ease.inQuad(Math.max(0, (k - 0.5) / 0.5));
      return k < 1;
    }, () => this.give('burst', s));
  }

  // ------------------------------------------------------------------ little touches
  /** a star glint (the draw, the sheath's click) */
  glint(pos, size = 0.5) {
    const sp = this.spell;
    sp.pa.spawn({ frame: F.GLOWSTAR, x: pos.x, y: pos.y, z: pos.z, life: 0.22, size: size * 0.6, size1: size, color: CORE, alpha: 1, alpha1: 0, spin: 2 });
    sp.pn.spawn({ frame: F.SPARK, x: pos.x, y: pos.y, z: pos.z, life: 0.26, size: size, size1: size * 0.2, color: WHITE, alpha: 1, alpha1: 0, spin: 1 });
  }
  /** the chiburi flick: bone-white sparkles shaken off the blade along dir */
  flick(pos, dir) {
    const sp = this.spell;
    for (let i = 0; i < 9; i++) { const v = rand(2.5, 4.5); sp.pn.spawn({ frame: i % 3 ? F.SPARK : F.DOT, x: pos.x, y: pos.y, z: pos.z, vx: dir.x * v + rand(-0.6, 0.6), vy: rand(0.5, 1.8), vz: dir.z * v + rand(-0.6, 0.6), life: rand(0.3, 0.45), size: rand(0.1, 0.18), size1: 0.03, color: CORE, alpha: 1, alpha1: 0, grav: 9, drag: 1.5 }); }
  }

  // ------------------------------------------------------------------ cherry petals
  /** n cherry petals on a ring round pos, swirling round it (spin: +1 counter-clockwise from above) and drifting up */
  petalSwirl(pos, { n = 8, r = 1.2, y = 0.6, spin = 1, speed = 3, rise = 0.6, life = 0.9, size = 0.17 } = {}) {
    const L = this.vfx.petal;
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), rr = r * rand(0.75, 1.1), c = Math.cos(a), s = Math.sin(a), v = speed * rand(0.7, 1.2) * spin;
      L.spawn({ x: pos.x + c * rr, y: (pos.y || 0) + y + rand(-0.3, 0.4), z: pos.z + s * rr, vx: -s * v - c * 0.3, vy: rise * rand(0.5, 1.4), vz: c * v - s * 0.3, life: life * rand(0.7, 1.2), size: size * rand(0.8, 1.2), color: '#ffffff', alpha: 1, alpha1: 0, drag: 1.2, grav: 0.4, spin: rand(-6, 6), stretch: 0.8 });
    }
  }

  /** a few petals shed behind something flying (a spectral blade) */
  petalTrail(pos, dt, rate = 22) {
    const L = this.vfx.petal;
    for (let i = this.emit('ptrail', rate, dt); i > 0; i--) L.spawn({ x: pos.x + rand(-0.12, 0.12), y: pos.y + rand(-0.1, 0.1), z: pos.z + rand(-0.12, 0.12), vx: rand(-0.4, 0.4), vy: rand(0.1, 0.6), vz: rand(-0.4, 0.4), life: rand(0.5, 0.9), size: rand(0.12, 0.17), color: '#ffffff', alpha: 1, alpha1: 0, drag: 2, grav: 0.6, spin: rand(-6, 6), stretch: 0.8 });
  }
  /** Flowing Water: a bright ripple and droplets trailing his feet while the stacks last (more with more stacks) */
  flow(P, stacks, dt) {
    const sp = this.spell, p = P.pos;
    for (let i = this.emit('flow', 5 + 4 * stacks, dt); i > 0; i--) sp.pn.spawn({ frame: F.DROP, x: p.x + rand(-0.25, 0.25), y: (p.y || 0) + rand(0.05, 0.3), z: p.z + rand(-0.25, 0.25), vx: rand(-0.6, 0.6), vy: rand(0.8, 1.8), vz: rand(-0.6, 0.6), life: rand(0.3, 0.45), size: rand(0.09, 0.14), size1: 0.05, color: WATER, alpha: 0.95, alpha1: 0.3, grav: 9, drag: 0.6 });
    if (this.emit('flowR', 1.6 + 0.5 * stacks, dt)) sp.pa.spawn({ frame: F.RING, x: p.x, y: (p.y || 0) + 0.06, z: p.z, life: 0.45, size: 0.35, size1: 1.0, color: WATER, alpha: 0.5, alpha1: 0 });
  }

  // ------------------------------------------------------------------ Helmet Splitter: the crack in the ground
  /** a jagged crack running ahead of pos along facing (len m) with a burst of short cracks where the blade struck */
  // (two decals so a long split stays a crack, not a stretched blot: the strike's star at a fixed size, and the split a
  //  strip of constant width that only stretches along its length, running out from the strike. star:false skips the
  //  star when another crack already put one there.)
  crack(pos, facing, { len = 3, r = 1.6, life = 3.5, star = true } = {}) {
    const y = (pos.y || 0) + 0.035, mk = tex => () => { const o = new THREE.Mesh(tex === 'star' ? flatGeo() : stripGeo(), new THREE.MeshBasicMaterial({ map: crackTex(tex), transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 })); o.renderOrder = 8; return o; };
    const s = star ? this.take('crackStar', mk('star')) : null, m = this.take('crackLine', mk('line'));
    const w = Math.min(1.5, 0.45 + r * 0.3), L = Math.min(len, 7), W = Math.min(0.9, 0.55 + L * 0.06);
    m.position.set(pos.x, y, pos.z); m.rotation.set(0, facing + Math.PI, 0); m.scale.set(W, 1, 0.01); m.material.opacity = 0;
    if (s) { s.position.set(pos.x, y + 0.002, pos.z); s.rotation.set(0, facing + Math.PI, 0); s.scale.set(w, 1, w); s.material.opacity = 0; }
    this.run((dt, t) => {
      const kin = Math.min(1, t / 0.08), run = ease.outCubic(Math.min(1, t / 0.16)), kout = Math.max(0, Math.min(1, (life - t) / 0.8));
      m.material.opacity = 0.85 * kin * kout; m.scale.z = Math.max(0.01, L * run);
      if (s) { s.material.opacity = 0.85 * kin * kout; const k = w * (0.7 + 0.3 * ease.outCubic(kin)); s.scale.set(k, 1, k); }
      return t < life;
    }, () => { this.give('crackLine', m); if (s) this.give('crackStar', s); });
  }

  // ------------------------------------------------------------------ War Banner Howl: the nobori
  /** plant the banner at pos (it springs up, flutters for life s, then sinks away); → { end() } */
  banner(pos, { life = 10, scale = 1 } = {}) {
    const g = this.take('banner', bannerMesh), H = { alive: true };
    g.position.set(pos.x, pos.y || 0, pos.z); g.rotation.set(0, Math.atan2(-CAM_F.x, -CAM_F.z), 0); g.scale.set(scale, 0.01, scale);
    const sp = this.spell, x = pos.x, y = pos.y || 0, z = pos.z;
    sp.sparkBurst(_a.set(x, y + 0.2, z), { n: 10, color: GOLD, speed: 3, size: 0.24, life: 0.45, frame: F.STAR, up: 1.5, layer: 'n' });
    this.vfx.dust(_a.set(x, y, z), { n: 6 });
    this.run((dt, t) => {
      const tin = Math.min(1, t / 0.28), tout = H.alive ? Math.max(0, Math.min(1, (life - t) / 0.45)) : 0;
      g.scale.set(scale * (0.4 + 0.6 * tin), scale * ease.outBack(tin) * (0.15 + 0.85 * tout), scale * (0.4 + 0.6 * tin));
      g.userData.flutter(t, 0.6 + 0.4 * Math.sin(t * 0.7));
      if (Math.random() < dt * 3) sp.pn.spawn({ frame: F.SPARK, x: x + rand(0.05, 0.55) * scale, y: y + rand(0.7, 1.9) * scale, z: z + rand(-0.05, 0.05), vy: 0.4, life: 0.6, size: 0.16, size1: 0.03, color: GOLD, alpha: 1, alpha1: 0 });
      return tout > 0 || t < 0.3;
    }, () => { H.alive = false; this.give('banner', g); });
    H.end = () => { H.alive = false; };
    return H;
  }

  // ------------------------------------------------------------------ Moonlit Blades: a blade of moonlight falls
  /** a giant spectral blade drops point-first into the ground at pos, rings it with moonlight, then fades */
  moonBlade(pos, { scale = 2.4, life = 0.75 } = {}) {
    const m = this.take('moonBlade', () => { const o = new THREE.Mesh(spectralBladeGeo(), spectralMaterial('#f6f8ff', '#8fa8ff', 0.92)); o.renderOrder = 12; return o; });
    const U = m.material.uniforms, x = pos.x, y = pos.y || 0, z = pos.z, half = 0.46 * scale, a0 = rand(0, TAU);
    m.scale.setScalar(scale); m.rotation.set(Math.PI + rand(-0.12, 0.12), a0, rand(-0.12, 0.12));
    const sp = this.spell; let landed = false;
    this.run((dt, t) => {
      const fall = Math.min(1, t / 0.1), hy = y + half - 0.25 + 7 * (1 - ease.inQuad(fall));
      m.position.set(x, hy, z);
      if (fall >= 1 && !landed) {
        landed = true;
        sp.sparkBurst(_a.set(x, y + 0.2, z), { n: 12, color: MOON, speed: 3.5, size: 0.24, life: 0.45, frame: F.STAR, up: 1.4, layer: 'n' });
        this.vfx.dust(_a.set(x, y, z), { n: 4, color: '#dfe6ff' });
      }
      U.uA.value = 0.92 * (1 - Math.max(0, (t - life * 0.55) / (life * 0.45)));
      return t < life;
    }, () => this.give('moonBlade', m));
  }
  prewarm() {
    if (this.warmed) return; this.warmed = true;
    const p = _a.set(0, -54, 0);
    this.arc(p, 0, { life: 0.05 }); this.shout(p, { life: 0.05 }); this.cutLine(p, _b.set(1, -54, 0), { life: 0.05 });
    this.crack(_a.set(0, -54, 0), 0, { life: 0.05 }); this.moonBlade(_a.set(0, -60, 0), { life: 0.05 }); this.banner(_a.set(0, -54, 0), { life: 0.05 });
  }
}
// the crack decals, drawn once: an ink-dark split with a pale dusty lip. 'star': the short cracks round the strike (the
// centre of a square); 'line': the long split up a narrow strip from the strike (v = 0) to its far tip (v = 1), jagging
// side to side and thinning, with a few short branches.
const CRACK = {};
function crackTex(kind) {
  if (CRACK[kind]) return CRACK[kind];
  const star = kind === 'star', c = document.createElement('canvas'); c.width = star ? 256 : 64; c.height = star ? 256 : 512; const g = c.getContext('2d');
  g.lineCap = 'round'; g.lineJoin = 'round';
  const rnd = i => { const v = Math.sin(i * 127.1) * 43758.5453; return v - Math.floor(v); };
  const lines = [];
  if (star) {
    for (let k = 0; k < 7; k++) { const a = k / 7 * TAU + 0.4, L = 40 + (rnd(k + 20) + 0.5) * 30, pts = [[128, 128]]; for (let j = 1; j <= 3; j++) pts.push([128 + Math.sin(a) * L * j / 3 + (rnd(k * 3 + j) - 0.5) * 12, 128 + Math.cos(a) * L * j / 3 + (rnd(k * 5 + j) - 0.5) * 12]); lines.push([pts, 9, 4]); }
  } else {
    // (y runs from the strike at the canvas bottom to the tip at the top; the strip is ~0.6 m across its 64 px)
    const pts = []; for (let i = 0; i <= 14; i++) pts.push([32 + (i ? (rnd(i) - 0.5) * 22 : 0), 512 - i * (512 / 14)]); lines.push([pts, 13, 3]);
    for (let b = 0; b < 4; b++) { const i0 = 2 + b * 3, s = b % 2 ? 1 : -1, [x0, y0] = pts[i0], br = [[x0, y0]]; for (let j = 1; j <= 3; j++) br.push([x0 + s * j * 5, y0 - j * 14 + (rnd(i0 + j) - 0.5) * 6]); lines.push([br, 4, 2]); }
  }
  // each line tapers from w0 to w1 along its points: the dusty lip under, the ink split over
  const stroke = (pts, w0, w1, extra, col) => { g.strokeStyle = col; for (let i = 1; i < pts.length; i++) { g.lineWidth = w0 + (w1 - w0) * (i / (pts.length - 1)) + extra; g.beginPath(); g.moveTo(...pts[i - 1]); g.lineTo(...pts[i]); g.stroke(); } };
  for (const [pts, w0, w1] of lines) stroke(pts, w0, w1, 6, 'rgba(240,228,206,0.5)');
  for (const [pts, w0, w1] of lines) stroke(pts, w0, w1, 0, 'rgba(46,30,26,0.9)');
  if (star) { const gr = g.createRadialGradient(128, 128, 0, 128, 128, 60); gr.addColorStop(0, 'rgba(46,30,26,0.4)'); gr.addColorStop(1, 'rgba(46,30,26,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); }
  const T = CRACK[kind] = new THREE.CanvasTexture(c); T.colorSpace = THREE.SRGBColorSpace; T.anisotropy = 4;
  return T;
}
// streak sprites point along their motion on screen
function streakFn(q) { const sx = q.vx * CAM_R.x + q.vy * CAM_R.y + q.vz * CAM_R.z, sy = q.vx * CAM_U.x + q.vy * CAM_U.y + q.vz * CAM_U.z; q.rot = Math.atan2(sy, sx); }

registerVfxExtension(vfx => (vfx.blade = new BladeFX(vfx)));
/** the BladeFX of the current world */
export function bladeFx(G) { const v = G.vfx; return v.blade || (v.blade = new BladeFX(v)); }
