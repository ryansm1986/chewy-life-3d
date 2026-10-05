// Charged-ability looks (docs/CHARGE.md §4): the charge ring at the hero's feet with its stage pips, the energy
// gathering at the paw / ball / staff orb, the stage pulses, the release burst, and the charged skills' own shapes
// (Chomp's shockwave crescent, the Fastball's sonic ring and streak trail, the big water orb's trail).
// One ChargeFX per VFX instance (the village's and each Burrow floor's) through vfx.js' extension hook, like SpellFX.
// Budget: every mesh is pooled (added to the scene once, hidden when idle), materials are per ChargeFX, particles go
// through SpellFX's additive atlas layer with module-level update fns (no closures, nothing allocated per frame).
import * as THREE from 'three';
import { registerVfxExtension } from './vfx.js';
import { spellFx, F, PAL } from './spellFx.js';
import { glowTexture, ringTexture } from './textures.js';
import { rand, TAU, clamp, ease } from '../core/util.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const CAM_R = new THREE.Vector3(1, 0, 0), CAM_U = new THREE.Vector3(0, 1, 0), CAM_F = new THREE.Vector3();
const WHITE = new THREE.Color('#ffffff');
// where the energy gathers this frame (one charge at a time: the hero's)
const FOCUS = new THREE.Vector3();
let FOCUS_K = 0;
// gathering sparkles spiral in toward FOCUS (fields on the recycled particle record: ga angle, gr radius, gy height, gs spin)
function gatherFn(q, dt, k) {
  const e = 1 - ease.inQuad(k), a = q.ga + k * q.gs;
  q.x = FOCUS.x + Math.cos(a) * q.gr * e; q.z = FOCUS.z + Math.sin(a) * q.gr * e; q.y = FOCUS.y + q.gy * e;
}
// speed lines point along their motion on screen
function streakFn(q) {
  const sx = q.vx * CAM_R.x + q.vy * CAM_R.y + q.vz * CAM_R.z, sy = q.vx * CAM_U.x + q.vy * CAM_U.y + q.vz * CAM_U.z;
  q.rot = Math.atan2(sy, sx);
}

// ------------------------------------------------------------------ shaders
const VS_UV = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
// The ground ring: a thick cream track with a bold ink outline that fills clockwise from 12 o'clock (screen-up) in the
// skill's colour like a candy tube (a soft highlight along it, a bright round head at the fill's front); sparkle-star
// pips sit on the band at each stage (cream = not yet, coloured with a white core = reached, lavender-grey = can't
// afford, the next one breathing). A soft pool of the colour sits inside it.
const FS_RING = /* glsl */`
uniform float uK, uA, uT, uFull, uPulse; uniform vec3 uCol, uPip, uLit, uAff; varying vec2 vUv;
const float TAU = 6.2831853;
float astroid(vec2 p, float s) { p = abs(p) / s; return sqrt(p.x) + sqrt(p.y); }
vec4 over(vec4 dst, vec3 c, float a) { return vec4(mix(dst.rgb, c, a), a + dst.a * (1.0 - a)); }
void main() {
  vec2 q = (vUv - 0.5) * 2.0; float r = length(q);
  if (r > 1.0) discard;
  float f = atan(q.x, q.y) / TAU; f = f < 0.0 ? f + 1.0 : f;
  float aa = fwidth(r) * 1.4, fa = max(fwidth(f) * 1.5, 0.002);
  const float R0 = 0.55, R1 = 0.8, W = 0.06, RM = 0.675;
  vec3 ink = vec3(0.23, 0.13, 0.22), cream = vec3(1.0, 0.96, 0.89);
  float breathe = 0.5 + 0.5 * sin(uT * 8.0);
  // colour pool inside the ring
  float pool = (1.0 - smoothstep(0.1, R0 - W, r)) * (0.08 + 0.16 * uK + 0.28 * uPulse + 0.08 * uFull * breathe);
  vec4 o = vec4(mix(uCol, vec3(1.0), 0.25), pool);
  // bold ink outline, then the band
  float outer = smoothstep(R0 - W - aa, R0 - W, r) * (1.0 - smoothstep(R1 + W, R1 + W + aa, r));
  o = over(o, ink, outer * 0.92);
  float band = smoothstep(R0 - aa, R0, r) * (1.0 - smoothstep(R1, R1 + aa, r));
  float fill = uK >= 0.999 ? 1.0 : (uK <= 0.001 ? 0.0 : 1.0 - smoothstep(uK - fa, uK, f));
  float rr = clamp((r - R0) / (R1 - R0), 0.0, 1.0);
  // candy tube: deeper at the inner edge, a thin soft highlight near the outer edge, a slow glint running round
  // (kept a touch darker than the raw colour: the bloom lifts it back, and light colours would wash to white)
  vec3 base = uCol * 0.9, deep = uCol * vec3(0.7, 0.58, 0.55);
  vec3 fc = mix(deep, base, smoothstep(0.0, 0.5, rr));
  fc = mix(fc, mix(base, vec3(1.0), 0.5), smoothstep(0.62, 0.74, rr) * (1.0 - smoothstep(0.8, 0.9, rr)) * 0.7);
  float glint = smoothstep(0.93, 1.0, 0.5 + 0.5 * sin((f - uT * 0.35) * TAU * 3.0));
  fc = mix(fc, vec3(1.0), glint * 0.25 + uFull * 0.15 * breathe + uPulse * 0.3);
  // the empty track: a dark translucent groove with cream dotted ticks, so the fill always pops against it
  float dots = 1.0 - smoothstep(0.012, 0.03, length(vec2((fract(f * 36.0) - 0.5) * 0.12, (rr - 0.5) * 0.08)));
  vec3 track = mix(ink, uCol * 0.5, 0.22);
  track = mix(track, cream, dots * 0.65);
  o = over(o, fill > 0.5 ? fc : track, band * mix(0.55 + 0.3 * dots, 1.0, fill));
  // the fill's round head
  if (uK > 0.001 && uK < 0.999) {
    float ha = uK * TAU; vec2 hc = vec2(sin(ha), cos(ha)) * RM;
    float hd = length(q - hc);
    o = over(o, ink, 1.0 - smoothstep(0.155, 0.155 + aa, hd));
    o = over(o, mix(uCol, vec3(1.0), 0.55), 1.0 - smoothstep(0.115, 0.115 + aa, hd));
    o = over(o, vec3(1.0), (1.0 - smoothstep(0.0, 0.07, hd)) * 0.9);
  }
  // stage pips
  for (int i = 0; i < 3; i++) {
    float pf = uPip[i]; if (pf < 0.0) continue;
    float ang = pf * TAU; vec2 c = vec2(sin(ang), cos(ang)) * RM;
    bool next = uLit[i] < 0.5 && (i == 0 || uLit[max(i - 1, 0)] > 0.5);
    float s = 0.2 + 0.025 * float(i) + 0.05 * uLit[i] * uPulse + (next ? 0.015 * breathe : 0.0);
    float d = astroid(q - c, s);
    float body = 1.0 - smoothstep(0.9, 0.9 + aa * 6.0, d), rim = 1.0 - smoothstep(1.28, 1.28 + aa * 7.0, d);
    vec3 pc = uAff[i] < 0.5 ? vec3(0.68, 0.64, 0.74) : mix(cream, uCol, uLit[i]);
    o = over(o, ink, rim * 0.96);
    o = over(o, pc, body);
    o = over(o, vec3(1.0), uLit[i] * (1.0 - smoothstep(0.0, 0.55, d)) * 0.95);
  }
  gl_FragColor = vec4(o.rgb, o.a * uA);
}`;
// Chomp's shockwave crescent: a cartoon swoosh of force rolling outward: a crisp ink line and a white-hot front edge,
// the skill colour behind it streaked with speed lines, fading toward the back and tapering at both horns.
const FS_CRESCENT = /* glsl */`
uniform float uK, uA, uArc, uW, uT; uniform vec3 uCol; varying vec2 vUv;
float h1(float x) { return fract(sin(x * 91.7) * 43758.5); }
void main() {
  vec2 q = (vUv - 0.5) * 2.0; float r = length(q);
  float th = atan(q.x, q.y);
  float hw = uArc * 0.5, ang = abs(th) / max(hw, 0.01);
  if (ang > 1.0 || r > 1.0) discard;
  float taper = 1.0 - smoothstep(0.45, 1.0, ang);
  float w = uW * (0.3 + 0.7 * taper);
  float d = (1.0 - r) / max(w, 0.001); // 0 at the leading edge, 1 at the back of the band
  if (d < -0.2 || d > 1.0) discard;
  float aa = fwidth(d) * 1.5;
  vec3 ink = vec3(0.23, 0.13, 0.22);
  float lineIn = smoothstep(-0.2, -0.2 + aa, d) * (1.0 - smoothstep(-0.03, -0.03 + aa, d));
  float body = smoothstep(-0.02, -0.02 + aa, d) * (1.0 - smoothstep(0.75, 1.0, d));
  float lane = floor(th * 34.0), streak = smoothstep(0.45, 1.0, h1(lane)) * smoothstep(0.2, 0.55, d) * (1.0 - smoothstep(0.75, 1.0, d));
  vec3 c = mix(vec3(1.0), uCol, smoothstep(0.04, 0.2, d));
  c = mix(c, uCol * vec3(0.85, 0.75, 0.7), smoothstep(0.45, 1.0, d));
  c = mix(c, mix(uCol, vec3(1.0), 0.65), streak * 0.7);
  float fade = 1.0 - smoothstep(0.6, 1.0, uK);
  float a = body * (1.0 - 0.7 * smoothstep(0.25, 1.0, d)) * (0.5 + 0.5 * taper) * fade;
  vec4 o = vec4(c, a);
  o.rgb = mix(o.rgb, ink, lineIn); o.a = max(o.a, lineIn * 0.92 * taper * fade);
  gl_FragColor = vec4(o.rgb, o.a * uA);
}`;
// a clean expanding ring of light (stage pulse, release): coloured body, a white crest, a faint ink edge, a flash disc
const FS_BURST = /* glsl */`
uniform float uK, uA, uW; uniform vec3 uCol; varying vec2 vUv;
void main() {
  vec2 q = (vUv - 0.5) * 2.0; float r = length(q); if (r > 1.0) discard;
  float R = 0.12 + 0.88 * (1.0 - pow(1.0 - uK, 3.0)), w = uW * (1.0 - 0.45 * uK), d = r - R;
  float body = 1.0 - smoothstep(0.0, w, abs(d));
  float crest = 1.0 - smoothstep(0.0, w * 0.35, abs(d + w * 0.15));
  float inkE = smoothstep(w * 0.8, w, abs(d)) * (1.0 - smoothstep(w, w * 1.35, abs(d))) * step(0.0, d);
  float fade = 1.0 - smoothstep(0.45, 1.0, uK);
  vec3 c = mix(uCol, vec3(1.0), crest * 0.85);
  float a = (body * 0.8 + crest * 0.2) * fade;
  c = mix(c, vec3(0.23, 0.13, 0.22), inkE * 0.7); a = max(a, inkE * 0.55 * fade);
  float disc = (1.0 - smoothstep(0.0, R, r)) * (1.0 - smoothstep(0.0, 0.3, uK)) * 0.4;
  gl_FragColor = vec4(mix(c, mix(uCol, vec3(1.0), 0.5), disc / max(a + disc, 0.001)), clamp(a + disc, 0.0, 1.0) * uA);
}`;

const SHADER_OPTS = { transparent: true, depthWrite: false, toneMapped: false, fog: false };
const GEO = {};
const planeGeo = () => GEO.plane || (GEO.plane = (() => { const g = new THREE.PlaneGeometry(2, 2); g.rotateX(-Math.PI / 2); return g; })());
const quadGeo = () => GEO.quad || (GEO.quad = new THREE.PlaneGeometry(2, 2));

export class ChargeFX {
  constructor(vfx) {
    this.vfx = vfx; this.scene = vfx.scene; this.engine = vfx.engine;
    this.pools = new Map(); this.active = []; this.acc = {};
    this.t = 0; this.uT = { value: 0 };
    this.ringM = null; this.ringA = 0; this.ringWant = 0;
    this.orbS = null;
  }
  get spell() { return this.vfx.spell || spellFx({ vfx: this.vfx }); }
  get pa() { return this.spell.pa; }
  // ------------------------------------------------------------------ pools
  take(kind, make) {
    let P = this.pools.get(kind); if (!P) this.pools.set(kind, P = []);
    const o = P.pop() || this.adopt(make());
    o.visible = true; return o;
  }
  adopt(o) { o.frustumCulled = false; o.traverse?.(c => { c.frustumCulled = false; }); this.scene.add(o); return o; }
  give(kind, o) { if (!o) return; o.visible = false; this.pools.get(kind)?.push(o); }
  run(update, end) { const f = { update, end, t: 0 }; this.active.push(f); return f; }
  emit(key, rate, dt) { const a = (this.acc[key] || 0) + rate * dt; const n = Math.floor(a); this.acc[key] = a - n; return n; }
  update(dt) {
    this.t += dt; this.uT.value = this.t;
    this.engine.camera.matrixWorld.extractBasis(CAM_R, CAM_U, CAM_F);
    const A = this.active;
    for (let i = 0; i < A.length; i++) {
      const f = A[i]; f.t += dt;
      let keep = false;
      try { keep = f.update(dt, f.t) !== false; } catch (e) { console.warn('[chargeFx]', e); }
      if (!keep) { try { f.end?.(); } catch (e) { console.warn('[chargeFx]', e); } A[i] = A[A.length - 1]; A.pop(); i--; }
    }
    // the ring fades in / out on its own
    if (this.ringM) {
      this.ringA += (this.ringWant - this.ringA) * Math.min(1, dt * (this.ringWant ? 14 : this.ringQuick ? 18 : 7));
      const U = this.ringM.material.uniforms;
      U.uA.value = this.ringA; U.uPulse.value = Math.max(0, U.uPulse.value - dt * 3.2);
      this.ringM.scale.setScalar(this.ringR * (1 + 0.12 * U.uPulse.value) * (0.92 + 0.08 * this.ringA));
      if (this.ringA < 0.01 && !this.ringWant) { this.ringM.visible = false; }
    }
    if (this.orbS) {
      const m = this.orbS.material; m.opacity += ((this.orbWant || 0) - m.opacity) * Math.min(1, dt * 12);
      if (m.opacity < 0.01 && !this.orbWant) this.orbS.visible = false;
    }
  }
  clear() {
    for (const f of this.active) { try { f.end?.(); } catch (e) { /* ignore */ } }
    this.active.length = 0;
    if (this.ringM) { this.ringM.visible = false; this.ringA = 0; this.ringWant = 0; }
    if (this.orbS) { this.orbS.visible = false; this.orbWant = 0; this.orbS.material.opacity = 0; }
  }
  // ------------------------------------------------------------------ materials
  mRing() { return new THREE.ShaderMaterial({ vertexShader: VS_UV, fragmentShader: FS_RING, ...SHADER_OPTS, uniforms: { uK: { value: 0 }, uA: { value: 0 }, uT: this.uT, uFull: { value: 0 }, uPulse: { value: 0 }, uCol: { value: new THREE.Color('#ffc24a') }, uPip: { value: new THREE.Vector3(1, -1, -1) }, uLit: { value: new THREE.Vector3() }, uAff: { value: new THREE.Vector3(1, 1, 1) } }, polygonOffset: true, polygonOffsetFactor: -3 }); }
  mCrescent() { return new THREE.ShaderMaterial({ vertexShader: VS_UV, fragmentShader: FS_CRESCENT, ...SHADER_OPTS, side: THREE.DoubleSide, uniforms: { uK: { value: 0 }, uA: { value: 1 }, uArc: { value: 2 }, uW: { value: 0.25 }, uT: this.uT, uCol: { value: new THREE.Color('#ffc24a') } } }); }
  mBurst() { return new THREE.ShaderMaterial({ vertexShader: VS_UV, fragmentShader: FS_BURST, ...SHADER_OPTS, uniforms: { uK: { value: 0 }, uA: { value: 1 }, uW: { value: 0.12 }, uCol: { value: new THREE.Color('#ffffff') } }, polygonOffset: true, polygonOffsetFactor: -3 }); }
  mGlow(color, opacity = 0) { return new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(color), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }); }
  ring() {
    if (!this.ringM) { const m = this.ringM = this.adopt(new THREE.Mesh(planeGeo(), this.mRing())); m.renderOrder = 9; m.visible = false; this.ringR = 1; }
    return this.ringM;
  }
  // ------------------------------------------------------------------ the charge (driven every frame by combat/charge.js)
  /** o: { pos, focus, color(THREE.Color), k (0..1 of the whole ring), pips [f1,f2,f3] (−1 unused), lit [..], aff [..], full, r } */
  charging(o, dt) {
    const m = this.ring(), U = m.material.uniforms;
    if (!m.visible) { m.visible = true; this.ringA = 0; U.uPulse.value = 0; }
    this.ringWant = 1; this.ringQuick = false; this.ringR = o.r || 1;
    m.position.set(o.pos.x, o.pos.y + 0.05, o.pos.z);
    // 12 o'clock = screen-up: local −z turned onto the camera's ground forward
    const fx = CAM_F.x, fz = CAM_F.z; m.rotation.set(0, Math.atan2(-fx, -fz) + Math.PI, 0);
    U.uK.value = o.k; U.uCol.value.copy(o.color); U.uFull.value = o.full ? 1 : 0;
    U.uPip.value.set(o.pips[0], o.pips[1], o.pips[2]); U.uLit.value.set(o.lit[0], o.lit[1], o.lit[2]); U.uAff.value.set(o.aff[0], o.aff[1], o.aff[2]);
    // the glow gathering at the paw / ball / orb
    FOCUS.copy(o.focus); FOCUS_K = o.k;
    const s = this.orbS || (this.orbS = this.adopt(new THREE.Sprite(this.mGlow('#ffffff', 0))));
    if (!s.visible) { s.visible = true; s.material.opacity = 0; }
    s.renderOrder = 14; s.material.color.copy(o.color);
    s.position.copy(o.focus);
    const big = o.orb ?? 1; // (Moka's staff orb carries a big glow; a paw / ball a small one, so the hero stays readable)
    s.scale.setScalar((0.3 + 0.5 * o.k + (o.full ? 0.07 * Math.sin(this.t * 14) : 0) + 0.35 * U.uPulse.value) * big);
    this.orbWant = (0.45 + 0.3 * o.k) * (0.6 + 0.4 * big);
    // sparkles spiralling in (more as it fills; a gentle trickle when held at full)
    const rate = o.full ? 26 : 16 + 46 * o.k, pa = this.pa;
    for (let i = this.emit('gather', rate, dt); i > 0; i--) {
      const big = Math.random() < 0.3;
      const q = pa.spawn({ frame: big ? F.GLOWSTAR : (Math.random() < 0.5 ? F.SPARK : F.STAR), x: FOCUS.x, y: FOCUS.y, z: FOCUS.z, life: rand(0.38, 0.6), size: big ? rand(0.2, 0.3) : rand(0.12, 0.22), size1: 0.05, color: Math.random() < 0.3 ? WHITE : o.color, alpha: 0.15, alpha1: 1, spin: rand(-6, 6), fn: gatherFn });
      q.ga = rand(0, TAU); q.gr = rand(0.7, 1.25); q.gy = rand(-0.55, 0.6); q.gs = rand(2.5, 4.5) * (Math.random() < 0.5 ? -1 : 1);
    }
    // a soft glint at the focus
    if (this.emit('core', 18, dt)) pa.spawn({ frame: F.GLOWSTAR, x: FOCUS.x, y: FOCUS.y, z: FOCUS.z, life: 0.16, size: 0.32 + 0.3 * o.k, size1: 0.12, color: o.color, alpha: 0.9, alpha1: 0, spin: 5 });
  }
  /** stop showing the charge (the ring and orb fade out) */
  idle(quick = false) { this.ringWant = 0; this.orbWant = 0; this.ringQuick = quick; }
  /** a clean expanding ring of light on the ground (pooled) */
  burst(pos, { r = 1.6, life = 0.36, color = WHITE, w = 0.12, y = 0.07, a = 1 } = {}) {
    const m = this.take('burst', () => { const o = new THREE.Mesh(planeGeo(), this.mBurst()); o.renderOrder = 10; return o; });
    const U = m.material.uniforms; U.uCol.value.copy(color); U.uW.value = w; U.uA.value = a; U.uK.value = 0;
    m.position.set(pos.x, (pos.y || 0) + y, pos.z); m.scale.setScalar(r);
    this.run((dt, t) => { U.uK.value = Math.min(1, t / life); return t < life; }, () => this.give('burst', m));
  }
  /** a stage was reached: the ring and the orb flash, a ring of light pops at the feet, sparkles burst from the orb */
  stage(pos, focus, color, s) {
    const m = this.ring(); m.material.uniforms.uPulse.value = 1;
    const sp = this.spell;
    this.burst(pos, { r: 1.5 + 0.12 * s, life: 0.32, color, w: 0.1 });
    sp.sparkBurst(focus, { n: 7 + 3 * s, color, speed: 2.6 + 0.6 * s, size: 0.26, life: 0.42, frame: F.STAR, up: 1.2 });
    sp.castFlash(focus, color, 0.65 + 0.2 * s);
    this.vfx.light(_a.copy(focus), '#' + color.getHexString(), 2.5 + 1.5 * s, 4, 0.2);
  }
  /** the charged release: a burst at the feet and the orb, a little bigger per stage (the skill's own effect is the star) */
  release(pos, focus, color, s) {
    this.idle(true);
    const sp = this.spell, hex = '#' + color.getHexString();
    this.burst(pos, { r: 1.45 + 0.3 * s, life: 0.34 + 0.03 * s, color, w: 0.12, a: 0.85 });
    sp.sparkBurst(focus, { n: 7 + 4 * s, color, speed: 3.5 + s, size: 0.28, life: 0.45, frame: F.GLOWSTAR, up: 1.3 });
    sp.sparkBurst(focus, { n: 3 + 2 * s, color: WHITE, speed: 4.5 + s, size: 0.18, life: 0.32, frame: F.SPARK });
    sp.castFlash(focus, color, 0.6 + 0.15 * s);
    this.vfx.light(_a.copy(focus), hex, 2.5 + 1.2 * s, 4.5, 0.22);
  }
  /** the charge fizzled (a roll, a menu): a little puff of the colour, nothing more */
  fizzle(pos, focus, color) {
    this.idle();
    this.spell.sparkBurst(focus, { n: 8, color, speed: 2, size: 0.2, life: 0.4, frame: F.SPARK, grav: 6 });
    this.vfx.smoke.spawn({ x: focus.x, y: focus.y, z: focus.z, vy: 0.6, life: 0.5, size: 0.35, size1: 0.8, color: '#fff6e8', alpha: 0.5, alpha1: 0, drag: 2 });
  }

  // ------------------------------------------------------------------ Chomp: the rolling shockwave crescent
  /** an arc that rolls from r0 to r1 over `life` s around origin (facing = atan2 angle); onStep(rPrev, r) sweeps hits */
  crescent(origin, facing, { arc = 2.4, r0 = 1.5, r1 = 4.5, life = 0.42, color = '#ffc24a', width = 1.4, onStep = null } = {}) {
    const m = this.take('crescent', () => { const o = new THREE.Mesh(planeGeo(), this.mCrescent()); o.renderOrder = 13; return o; });
    const U = m.material.uniforms; U.uArc.value = Math.min(TAU * 0.92, arc); U.uCol.value.set(color); U.uA.value = 1; U.uK.value = 0;
    const ox = origin.x, oy = origin.y, oz = origin.z;
    m.position.set(ox, oy + 0.32, oz); m.rotation.set(0, facing + Math.PI, 0);
    let rPrev = r0;
    this.run((dt, t) => {
      const k = Math.min(1, t / life), r = r0 + (r1 - r0) * ease.outQuad(k);
      m.scale.setScalar(r); U.uK.value = k; U.uW.value = clamp(width / Math.max(0.5, r), 0.08, 0.6);
      // dust kicked up along the arc
      for (let i = this.emit('cres', 70, dt); i > 0; i--) {
        const a = facing + (Math.random() - 0.5) * U.uArc.value * 0.9;
        this.vfx.smoke.spawn({ x: ox + Math.sin(a) * r, y: oy + 0.15, z: oz + Math.cos(a) * r, vx: Math.sin(a) * 2, vy: rand(0.4, 1.2), vz: Math.cos(a) * 2, life: rand(0.35, 0.6), size: 0.35, size1: 0.9, color: '#efe2c8', alpha: 0.55, alpha1: 0, drag: 4 });
        if (Math.random() < 0.4) this.pa.spawn({ frame: F.SPARK, x: ox + Math.sin(a) * r, y: oy + 0.4, z: oz + Math.cos(a) * r, vy: rand(1, 2.5), life: 0.35, size: 0.22, size1: 0.04, color: U.uCol.value, alpha: 1, alpha1: 0 });
      }
      if (onStep) onStep(rPrev, r);
      rPrev = r;
      return k < 1;
    }, () => this.give('crescent', m));
  }
  // ------------------------------------------------------------------ Power Throw: the Fastball
  /** a ring of air bursting off the ball at launch, facing along the throw */
  sonic(pos, dir, color = '#d8f25a') {
    const m = this.take('sonic', () => { const o = new THREE.Mesh(quadGeo(), new THREE.MeshBasicMaterial({ map: ringTexture(), color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, fog: false })); o.renderOrder = 13; return o; });
    m.material.color.set(color);
    // the ring's face points along the throw, turned partly toward the camera so the iso view sees an ellipse, not an edge
    m.position.copy(pos); _b.copy(dir).multiplyScalar(0.55).addScaledVector(CAM_F, 0.85).normalize().add(pos); m.lookAt(_b);
    const x = pos.x, y = pos.y, z = pos.z, dx = dir.x, dz = dir.z;
    this.run((dt, t) => {
      const k = Math.min(1, t / 0.32);
      m.position.set(x + dx * k * 1.4, y, z + dz * k * 1.4); m.scale.setScalar(0.25 + 0.95 * ease.outCubic(k)); m.material.opacity = 0.95 * (1 - k);
      return k < 1;
    }, () => this.give('sonic', m));
    this.spell.sparkBurst(pos, { n: 10, color: WHITE, speed: 4, size: 0.22, life: 0.3, frame: F.SPARK, grav: 0 });
  }
  shared(key, make) { const M = this.mats || (this.mats = new Map()); let m = M.get(key); if (!m) M.set(key, m = make()); return m; }
  /** the Fastball's glow (the tennis ball itself is projectile.js' ball mesh) */
  fastballMesh(size = 1.5) {
    const g = new THREE.Group();
    const halo = new THREE.Sprite(this.shared('fbHalo', () => this.mGlow('#d8f25a', 0.5))); halo.scale.setScalar(0.62 * size); g.add(halo);
    const core = new THREE.Sprite(this.shared('fbCore', () => this.mGlow('#ffffff', 0.45))); core.scale.setScalar(0.3 * size); g.add(core);
    return g;
  }
  trailFastball(pr, dt) {
    const p = pr.pos, d = pr.dir, pa = this.pa, s = pr.o.size || 1.5;
    // speed lines streaming off the back of the ball, and a short soft glow trail
    for (let i = this.emit('fb', 110, dt); i > 0; i--) {
      const j = rand(-0.14, 0.14) * s, b = rand(0, 0.6);
      pa.spawn({ frame: F.STREAK, x: p.x - d.x * b + d.z * j, y: p.y + rand(-0.12, 0.12), z: p.z - d.z * b - d.x * j, vx: -d.x * 5, vy: 0, vz: -d.z * 5, life: rand(0.12, 0.22), size: rand(0.32, 0.5) * s * 0.6, size1: 0.06, color: Math.random() < 0.6 ? WHITE : PAL.duck, alpha: 0.95, alpha1: 0, fn: streakFn, stretch: 3 });
    }
    for (let i = this.emit('fbg', 34, dt); i > 0; i--) this.vfx.glow.spawn({ x: p.x, y: p.y, z: p.z, life: 0.24, size: 0.38 * s, size1: 0.05, color: '#c8f04a', alpha: 0.42, alpha1: 0 });
  }
  // ------------------------------------------------------------------ Splash Bolt: the big orb
  bigOrbMesh(size = 1.8) { const g = this.spell.orbMesh(); g.scale.setScalar(size); return g; }
  trailBigOrb(pr, dt) {
    const sp = this.spell; sp.trailOrb(pr, dt);
    const p = pr.pos, s = pr.o.size || 1.8;
    for (let i = this.emit('bo', 40 * s, dt); i > 0; i--) sp.pn.spawn({ frame: F.DROP, x: p.x + rand(-0.2, 0.2) * s, y: p.y + rand(-0.15, 0.15) * s, z: p.z + rand(-0.2, 0.2) * s, vx: -pr.dir.x * 2 + rand(-0.8, 0.8), vy: rand(0.4, 1.8), vz: -pr.dir.z * 2 + rand(-0.8, 0.8), life: rand(0.3, 0.5), size: rand(0.12, 0.22), size1: 0.05, color: i % 2 ? PAL.aqua : PAL.foam, alpha: 0.95, alpha1: 0.3, grav: 9 });
    if (Math.random() < dt * 14) sp.pn.spawn({ frame: F.BUBBLE, x: p.x, y: p.y, z: p.z, vy: 0.9, vx: rand(-0.5, 0.5), vz: rand(-0.5, 0.5), life: 0.6, size: rand(0.14, 0.24), size1: 0.18, color: PAL.foam, alpha: 0.9, alpha1: 0 });
  }

  // ------------------------------------------------------------------ prewarm
  prewarm(renderer, camera) {
    if (this.warmed) return; this.warmed = true;
    const y = -54, made = [];
    const r = this.ring(); r.visible = true; r.position.set(0, y, 0); r.material.uniforms.uA.value = 1;
    const c = this.take('crescent', () => { const o = new THREE.Mesh(planeGeo(), this.mCrescent()); o.renderOrder = 13; return o; }); c.position.set(0, y, 0); made.push(['crescent', c]);
    const s = this.take('sonic', () => { const o = new THREE.Mesh(quadGeo(), new THREE.MeshBasicMaterial({ map: ringTexture(), color: 0xffffff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, fog: false })); o.renderOrder = 13; return o; }); s.position.set(0, y, 0); made.push(['sonic', s]);
    const bu = this.take('burst', () => { const o = new THREE.Mesh(planeGeo(), this.mBurst()); o.renderOrder = 10; return o; }); bu.position.set(0, y, 0); made.push(['burst', bu]);
    const fb = this.adopt(this.fastballMesh()); fb.position.set(0, y, 0);
    let frames = 0;
    const done = () => {
      if (++frames < 3) return requestAnimationFrame(done);
      r.visible = false; r.material.uniforms.uA.value = 0;
      for (const [k, o] of made) this.give(k, o);
      fb.parent?.remove(fb);
    };
    requestAnimationFrame(done);
  }
}

registerVfxExtension(vfx => (vfx.charge = new ChargeFX(vfx)));
/** the ChargeFX of the current world */
export function chargeFx(G) { const v = G.vfx; return v.charge || (v.charge = new ChargeFX(v)); }
