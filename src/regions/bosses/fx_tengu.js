// Master Tengu's effects (pooled, one set per region scene): the fan gust (a sweeping wind front + streaks + bamboo
// leaves), leaf-blade tornadoes, the dive (feather bursts, falling streak, slam), and the phase-2 bamboo-leaf storm
// (leaves and wind bands swirling round the arena). Lights only through vfx.light (the world's LightPool).
import * as THREE from 'three';
import { FxHost, fxHost, F, C, alignFn, orbitFn, rand, TAU, clamp, ease } from './kitA.js';

export const TENGU_COL = {
  leaf: [C('#8fcf5a'), C('#6ab04c'), C('#b8e07a'), C('#d8e890')],
  feather: [C('#2a2a44'), C('#3a3a62'), C('#1e1e30')],
  wind: C('#f4fff0'), windTint: C('#d8f5d0'),
  tele: '#ff3a78', // hot pink-red: reads against the bamboo greens
};
const DUST = C('#e8e0c8'), DUST2 = C('#ece4cc'), CHIP = C('#9a8a70');

const VS = /* glsl */`varying vec3 vP; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main() { vP = position; vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; vN = normalMatrix * normal; gl_Position = projectionMatrix * mv; }`;
// gust: a curved wall of wind racing out along the cone (open cylinder segment, uv.x along the arc, uv.y up)
const FS_FRONT = /* glsl */`uniform float uT, uA, uSeed; varying vec3 vP; varying vec2 vUv;
  void main() {
    float u = vUv.x, h = vUv.y;
    float s1 = smoothstep(0.55, 1.0, sin(u * 38.0 + h * 5.0 - uT * 16.0 + uSeed) * 0.5 + 0.5);
    float s2 = smoothstep(0.7, 1.0, sin(u * 71.0 - h * 3.0 + uT * 9.0 + uSeed * 2.0) * 0.5 + 0.5);
    float edge = smoothstep(0.0, 0.12, u) * smoothstep(1.0, 0.88, u);
    float vert = smoothstep(0.0, 0.25, h) * (1.0 - smoothstep(0.55, 1.0, h));
    float a = (0.22 + 0.55 * s1 + 0.35 * s2) * edge * vert * uA;
    if (a < 0.01) discard;
    gl_FragColor = vec4(mix(vec3(0.84, 0.96, 0.82), vec3(1.0), s1), a);
  }`;
// tornado funnel: spiral bands climbing and turning
const FS_FUNNEL = /* glsl */`uniform float uT, uA, uSeed, uInner; varying vec3 vP; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main() {
    float a = atan(vP.x, vP.z), h = vUv.y;
    float sp = uInner > 0.5 ? 1.6 : 1.0;
    float b1 = sin(a * 3.0 + h * 10.0 - uT * 12.0 * sp + uSeed);
    float b2 = sin(a * 5.0 - h * 7.0 - uT * 17.0 * sp + uSeed * 1.7);
    float s1 = smoothstep(0.45, 0.95, b1), s2 = smoothstep(0.7, 1.0, b2);
    float fadeH = smoothstep(0.0, 0.1, h) * (1.0 - smoothstep(0.72, 1.0, h));
    float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.5);
    float al = (0.1 + 0.5 * s1 + 0.3 * s2) * fadeH * (0.45 + 0.55 * fr) * uA;
    if (al < 0.01) discard;
    vec3 col = mix(vec3(0.72, 0.88, 0.62), vec3(1.0, 1.0, 0.96), s1 * 0.7 + s2 * 0.3);
    gl_FragColor = vec4(col, al);
  }`;
// storm band: a curved strip of wind dashes circling the arena
const FS_BAND = /* glsl */`uniform float uT, uA, uSeed; varying vec2 vUv;
  void main() {
    float u = vUv.x, h = vUv.y;
    float d = smoothstep(0.35, 0.9, sin(u * 26.0 - uT * 7.0 + uSeed) * 0.5 + 0.5);
    float edge = smoothstep(0.0, 0.2, u) * smoothstep(1.0, 0.8, u);
    float vert = smoothstep(0.0, 0.35, h) * smoothstep(1.0, 0.65, h);
    float a = d * edge * vert * uA;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vec3(0.97, 1.0, 0.95), a);
  }`;
const shader = (fs, extra = {}) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms: { uT: { value: 0 }, uA: { value: 0 }, uSeed: { value: rand(0, 10) }, uInner: { value: 0 }, ...extra }, transparent: true, depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide });

let FUNNEL_GEO = null, FUNNEL_IN_GEO = null;
function funnelGeo(inner) {
  const pts = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2((inner ? 0.18 : 0.3) + (inner ? 0.62 : 0.95) * Math.pow(t, 1.35) + Math.sin(t * 9) * 0.03, t * (inner ? 2.3 : 2.9))); }
  return new THREE.LatheGeometry(pts, 26);
}

class TenguFX extends FxHost {
  // ---------------------------------------------------------------- pooled meshes
  mkFront() { const g = new THREE.CylinderGeometry(1, 1, 1, 28, 1, true, -0.6, 1.2); g.translate(0, 0.5, 0); const m = new THREE.Mesh(g, shader(FS_FRONT)); m.renderOrder = 14; return m; }
  mkFunnel() {
    const grp = new THREE.Group();
    const o = new THREE.Mesh(FUNNEL_GEO ||= funnelGeo(false), shader(FS_FUNNEL)); o.renderOrder = 14;
    const i = new THREE.Mesh(FUNNEL_IN_GEO ||= funnelGeo(true), shader(FS_FUNNEL, { uInner: { value: 1 } })); i.renderOrder = 15;
    grp.add(o, i); grp.userData = { o, i }; return grp;
  }
  mkBand() { const g = new THREE.CylinderGeometry(1, 1, 1, 48, 1, true, 0, 2.4); g.translate(0, 0.5, 0); const m = new THREE.Mesh(g, shader(FS_BAND)); m.renderOrder = 14; return m; }
  warm() { this.prewarm([['front', () => this.mkFront(), 1], ['funnel', () => this.mkFunnel(), 3], ['band', () => this.mkBand(), 5]]); }

  // ---------------------------------------------------------------- the fan gust
  /** wind gathering into the fan during the wind-up (getPos(v) → the fan's world position) */
  gather(getPos, dur, _v = new THREE.Vector3()) {
    this.run((dt, t) => {
      const p = getPos(_v);
      for (let i = this.emit('tg-gather', 46, dt); i > 0; i--) {
        const a = rand(0, TAU), r = rand(1.6, 2.6), y = rand(-0.8, 1.0);
        this.p('a', F.STREAK, p.x + Math.cos(a) * r, p.y + y, p.z + Math.sin(a) * r, { vx: -Math.cos(a) * r * 3, vy: -y * 3, vz: -Math.sin(a) * r * 3, life: 0.3, size: 0.55, size1: 0.2, color: TENGU_COL.wind, alpha: 0.2, alpha1: 0.8, fn: alignFn, drag: 1 });
        if (Math.random() < 0.35) this.p('n', F.BAMBOO, p.x + Math.cos(a) * r, p.y + y, p.z + Math.sin(a) * r, { vx: -Math.cos(a) * r * 2.6, vy: -y * 2.6, vz: -Math.sin(a) * r * 2.6, life: 0.36, size: 0.3, color: TENGU_COL.leaf[i % 4], alpha: 0.9, alpha1: 0.6, spin: rand(-8, 8) });
      }
      return t < dur;
    });
  }
  /** the gust itself: a curved wind wall racing out along the cone (x, z = apex; yaw = aim), streaks + leaves riding it */
  gust(x, z, yaw, R, half, speed = 18) {
    const m = this.take('front', () => this.mkFront()), U = m.material.uniforms;
    m.rotation.set(0, yaw, 0);
    const y0 = this.heightAt(x, z), dur = R / speed + 0.25;
    this.run((dt, t) => {
      const k = Math.min(1, t / (R / speed)), r = 0.8 + (R - 0.8) * ease.outQuad(k);
      m.position.set(x, y0 + 0.05, z); m.scale.set(r, 1.6 + k * 0.9, r);
      U.uT.value = t; U.uA.value = t < 0.06 ? t / 0.06 : k < 1 ? 1 : Math.max(0, 1 - (t - R / speed) / 0.25);
      // streaks and leaves at the front
      for (let i = this.emit('tg-gust', 150, dt); i > 0; i--) {
        const a = yaw + rand(-half, half) * 0.95, rr = r * rand(0.55, 1.0), vx = Math.sin(a) * speed * rand(0.8, 1.1), vz = Math.cos(a) * speed * rand(0.8, 1.1);
        const px = x + Math.sin(a) * rr, pz = z + Math.cos(a) * rr, py = y0 + rand(0.2, 1.8);
        if (i % 3) this.p('a', F.STREAK, px, py, pz, { vx, vy: rand(-0.3, 0.6), vz, life: rand(0.18, 0.32), size: rand(0.9, 1.5), size1: 0.4, color: TENGU_COL.wind, alpha: 0.85, alpha1: 0, fn: alignFn, drag: 2 });
        else this.p('n', F.BAMBOO, px, py, pz, { vx: vx * 0.7, vy: rand(0.5, 2.5), vz: vz * 0.7, life: rand(0.5, 0.8), size: rand(0.26, 0.4), color: TENGU_COL.leaf[i % 4], alpha: 1, alpha1: 0.7, spin: rand(-12, 12), drag: 2.2, grav: 2 });
      }
      return t < dur;
    }, () => this.give('front', m));
    // a curl of wind at the fan on release
    for (let i = 0; i < 10; i++) { const a = yaw + rand(-half, half); this.p('a', F.SWIRL, x + Math.sin(a) * 1.2, y0 + rand(0.6, 2), z + Math.cos(a) * 1.2, { vx: Math.sin(a) * 6, vz: Math.cos(a) * 6, life: 0.45, size: rand(0.7, 1.1), size1: 1.4, color: TENGU_COL.wind, alpha: 0.8, alpha1: 0, spin: rand(-4, 4), drag: 3 }); }
  }

  // ---------------------------------------------------------------- tornadoes
  /** a leaf-blade tornado following obj ({ x, z, done, k }) until obj.done, then it frays out */
  tornado(obj) {
    const g = this.take('funnel', () => this.mkFunnel()), { o, i } = g.userData;
    const Uo = o.material.uniforms, Ui = i.material.uniforms, cen = obj, kL = 'tg-torn' + obj.id, kD = 'tg-tdust' + obj.id;
    let fade = 0, grow = 0;
    this.run((dt, t) => {
      grow = Math.min(1, grow + dt * 2.2);
      if (obj.done) fade += dt * 2.2;
      const a = Math.max(0, Math.min(grow, 1 - fade));
      const y0 = this.heightAt(obj.x, obj.z);
      g.position.set(obj.x, y0, obj.z); g.rotation.y += dt * 7;
      const sw = 1 + Math.sin(t * 5.3 + (obj.seed || 0)) * 0.06;
      g.scale.set(sw * (0.6 + 0.4 * ease.outBack(grow)), 0.5 + 0.5 * grow, sw * (0.6 + 0.4 * ease.outBack(grow)));
      o.rotation.z = Math.sin(t * 2.1 + (obj.seed || 0)) * 0.08; i.rotation.y -= dt * 5;
      Uo.uT.value = t; Ui.uT.value = t; Uo.uA.value = a; Ui.uA.value = a * 0.9;
      if (a > 0.05) {
        for (let n = this.emit(kL, 34 * a, dt); n > 0; n--) { // leaves riding the funnel up and round
          const h = rand(0, 0.5);
          const q = this.p('n', F.BAMBOO, obj.x, y0 + h, obj.z, { life: rand(0.8, 1.3), size: rand(0.26, 0.4), size1: 0.22, color: TENGU_COL.leaf[n % 4], alpha: 1, alpha1: 0, spin: rand(-10, 10), fn: orbitFn });
          q.cen = cen; q.ang = rand(0, TAU); q.rad = 0.35 + h; q.w = rand(6, 9); q.rin = rand(0.35, 0.7); q.climb = rand(1.5, 2.6);
        }
        for (let n = this.emit(kD, 10 * a, dt); n > 0; n--) { const aa = rand(0, TAU); this.p('n', F.PUFF, obj.x + Math.cos(aa) * 0.6, y0 + 0.08, obj.z + Math.sin(aa) * 0.6, { vx: -Math.sin(aa) * 2.4, vz: Math.cos(aa) * 2.4, vy: 0.3, life: 0.6, size: 0.5, size1: 1.1, color: DUST, alpha: 0.5, alpha1: 0, drag: 2 }); }
        if (Math.random() < dt * 14) { const aa = rand(0, TAU); this.p('a', F.STREAK, obj.x + Math.cos(aa) * 0.9, y0 + rand(0.3, 2.2), obj.z + Math.sin(aa) * 0.9, { vx: -Math.sin(aa) * 8, vz: Math.cos(aa) * 8, vy: 1, life: 0.2, size: 0.9, size1: 0.3, color: TENGU_COL.wind, alpha: 0.7, alpha1: 0, fn: alignFn }); }
      }
      return fade < 1;
    }, () => this.give('funnel', g));
  }

  // ---------------------------------------------------------------- the dive
  feathers(x, y, z, { n = 16, speed = 4, up = 3, size = 0.42, life = 1.4 } = {}) {
    this.leafBurst(x, y, z, { n, frame: F.FEATHER, colors: TENGU_COL.feather, speed, up, size, life, grav: 1.4, drag: 2.2 });
  }
  /** take-off: feathers, dust ring, streaks trailing down below him while he rockets up */
  takeoff(x, z) {
    const y0 = this.heightAt(x, z);
    this.feathers(x, y0 + 1.2, z, { n: 22, speed: 5, up: 4 });
    this.puffs(x, y0 + 0.1, z, { n: 12, color: DUST2, size: 0.7, speed: 4, up: 0.5, r: 0.6 });
    this.leafBurst(x, y0 + 0.3, z, { n: 14, frame: F.BAMBOO, colors: TENGU_COL.leaf, speed: 5, up: 4 });
    this.shockRing(x, z, 0.4, 3.2, { life: 0.35, color: '#e8f8e0' });
  }
  climbTrail(x, y, z) { for (let i = 0; i < 3; i++) this.p('a', F.STREAK, x + rand(-0.5, 0.5), y + rand(-1, 0.5), z + rand(-0.5, 0.5), { vy: -14, life: 0.22, size: 1.6, size1: 0.5, color: TENGU_COL.wind, alpha: 0.8, alpha1: 0, fn: alignFn }); }
  /** the slam: shock band, dust, bamboo leaves and feathers thrown out, a scuff on the ground */
  slam(x, z, r) {
    const y0 = this.heightAt(x, z);
    this.shockRing(x, z, 0.3, r * 1.35, { life: 0.4, color: '#fff4d0', width: 0.09 });
    this.shockRing(x, z, 0.2, r * 0.9, { life: 0.28, color: '#ffffff', width: 0.06 });
    this.puffs(x, y0 + 0.1, z, { n: 18, color: DUST2, size: 0.8, speed: 7, up: 0.8, r: r * 0.5, life: 0.9 });
    this.leafBurst(x, y0 + 0.2, z, { n: 26, frame: F.BAMBOO, colors: TENGU_COL.leaf, speed: 7, up: 6, life: 1.6 });
    this.feathers(x, y0 + 1, z, { n: 12, speed: 4, up: 4 });
    for (let i = 0; i < 10; i++) { const a = rand(0, TAU), s = rand(3, 7); this.p('n', F.CHUNK, x, y0 + 0.2, z, { vx: Math.cos(a) * s, vy: rand(3, 6), vz: Math.sin(a) * s, life: 0.7, size: rand(0.14, 0.24), color: CHIP, alpha: 1, alpha1: 1, grav: 16, spin: rand(-9, 9) }); }
    this.vfx.decal({ x, y: y0, z }, { r: r * 0.85, color: '#3a3020', opacity: 0.35, life: 3.5 });
    this.vfx.light({ x, y: y0 + 1, z }, '#fff4d8', 5, 7, 0.25);
  }

  // ---------------------------------------------------------------- phase 2: the bamboo-leaf storm
  /** leaves and wind bands swirling round (cx, cz) while st.on; st.k (0..1) is the strength, st.dir = ±1 (turning sense) */
  storm(st, cx, cz, R) {
    const bands = [];
    for (let i = 0; i < 5; i++) { const b = this.take('band', () => this.mkBand()); bands.push({ m: b, r: R * (0.35 + i * 0.16), y: 0.35 + (i % 3) * 0.7, h: 0.35 + (i % 2) * 0.25, a: i * 1.3, w: 0.5 + i * 0.08 }); }
    const cen = { x: cx, z: cz };
    let out = 0;
    this.run((dt, t) => {
      if (!st.on) out += dt * 1.2;
      const k = Math.max(0, (st.k || 0) * (1 - out));
      const y0 = this.heightAt(cx, cz);
      for (const b of bands) {
        b.a += dt * b.w * st.dir; const U = b.m.material.uniforms;
        b.m.position.set(cx, y0 + b.y, cz); b.m.rotation.y = b.a; b.m.scale.set(b.r, b.h, b.r);
        U.uT.value = t * st.dir; U.uA.value = 0.42 * k;
      }
      for (let n = this.emit('tg-storm', 48 * k, dt); n > 0; n--) {
        const q = this.p('n', n % 5 ? F.BAMBOO : F.LEAFBIT, cx, y0, cz, { life: rand(2.2, 3.4), size: rand(0.26, 0.4), size1: 0.3, color: TENGU_COL.leaf[n % 4], alpha: 1, alpha1: 0, spin: rand(-9, 9), fn: orbitFn, fadeIn: 0.3 });
        q.cen = cen; q.ang = rand(0, TAU); q.rad = rand(1.5, R + 2); q.w = st.dir * rand(0.7, 1.2) * (6 / (q.rad + 3)); q.rin = rand(-0.6, 0.2); q.climb = rand(-0.1, 0.35); q.y = y0 + rand(0.2, 2.6);
      }
      for (let n = this.emit('tg-stormS', 26 * k, dt); n > 0; n--) {
        const a = rand(0, TAU), r = rand(2, R + 1), tx = -Math.sin(a) * st.dir, tz = Math.cos(a) * st.dir, sp = 9;
        this.p('a', F.STREAK, cx + Math.cos(a) * r, y0 + rand(0.2, 2.4), cz + Math.sin(a) * r, { vx: tx * sp, vz: tz * sp, life: rand(0.25, 0.4), size: rand(1, 1.7), size1: 0.4, color: TENGU_COL.wind, alpha: 0.55, alpha1: 0, fn: alignFn });
      }
      return out < 1;
    }, () => { for (const b of bands) this.give('band', b.m); });
  }
}

/** Master Tengu's effect host for this VFX (made on first use) */
export const tenguFx = vfx => fxHost(vfx, 'tengu', v => new TenguFX(v));
export { clamp };
