// Momiji Hollow effects: Danzaburō's fight (belly-drum shock rings with a gap, DORON! transformation poofs, boulder dust
// and crashes, kettle steam jets, the giant form's belly-flop) and the hollow's monsters (maple-leaf flurries, crow
// feathers, straw, chestnut bits). One host per VFX instance (kitA.js FxHost: pooled meshes, an atlas particle layer
// pair, draped telegraphs), shared by maple.js and tanuki.js so the region pays for one set of particle layers.
// Lights only through vfx.light (the world's LightPool). Nothing here allocates per frame beyond particle records.
import * as THREE from 'three';
import { FxHost, fxHost, F, C, alignFn, orbitFn, rand, TAU, clamp, ease } from './kitA.js';

export const MCOL = {
  maple: [C('#e2482e'), C('#f47034'), C('#ffb84e'), C('#c42e2a')],
  gold: [C('#ffd84a'), C('#f4c030'), C('#ffe98a')],
  ember: [C('#ff6a2a'), C('#ffb040'), C('#c8281e')],
  green: [C('#6ccf4a'), C('#9be06a'), C('#4aa83a')],
  straw: [C('#f0cc6a'), C('#d8a848'), C('#f8e0a0')],
  crow: [C('#2a2c44'), C('#3a3e62'), C('#1c1c2c')],
  smoke: C('#fbf3e6'), smoke2: C('#eadcc6'), steam: C('#ffffff'), dust: C('#e6cfa4'), chip: C('#8a7a68'), nut: C('#7a3a1c'),
  wind: C('#fff6e4'), twinkle: C('#fff2b0'), pon: C('#fff0c0'), sake: C('#fff4d8'),
  tele: '#ff2d8a', // hot magenta: reads on the golden straw ground and the red leaf litter alike
};

// ------------------------------------------------------------------ the belly-drum shock ring
// A draped band (ground) + a low translucent wall, rebuilt each frame at the ring's radius (97 terrain samples a ring),
// with a gap sector (the safe spot). Rows: 0 inner edge, 1 outer edge (the band), 2 wall foot, 3 wall top.
const _lv = new THREE.Vector3();
const NSEG = 96, SIN = new Float32Array(NSEG + 1), COS = new Float32Array(NSEG + 1);
for (let i = 0; i <= NSEG; i++) { const a = i / NSEG * TAU; SIN[i] = Math.sin(a); COS[i] = Math.cos(a); }
const RING_VS = /* glsl */`varying vec2 vU; void main() { vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RING_FS = /* glsl */`uniform float uA, uGapA, uGapW, uT; uniform vec3 uCol, uHot; varying vec2 vU;
  void main() {
    float ang = vU.x * 6.2831853;
    float gm = abs(mod(ang - uGapA + 3.14159265, 6.2831853) - 3.14159265) - uGapW; // < 0 inside the gap
    if (uGapW > 0.0 && gm < 0.0) discard;
    float gEdge = uGapW > 0.0 ? smoothstep(0.0, 0.05, gm) : 1.0;
    vec3 ink = vec3(0.16, 0.06, 0.1), c; float a;
    if (vU.y < 1.5) {
      float v = vU.y, e = min(v, 1.0 - v);
      float inkE = 1.0 - smoothstep(0.1, 0.2, e);
      float lead = smoothstep(0.35, 0.85, v);
      float beat = 0.8 + 0.2 * sin(ang * 24.0 - uT * 14.0);
      c = mix(uCol, uHot, lead * beat);
      c = mix(c, ink, inkE * 0.9);
      c = mix(ink, c, gEdge);
      a = max(0.6 + 0.35 * lead, inkE * 0.85) * uA;
    } else {
      float h = vU.y - 2.0;
      float streak = 0.55 + 0.45 * sin(ang * 36.0 + uT * 11.0 + h * 4.0);
      c = mix(uHot, vec3(1.0), 0.35 + 0.3 * h);
      a = (1.0 - h) * (1.0 - h) * 0.5 * streak * uA * gEdge;
    }
    if (a < 0.01) discard;
    gl_FragColor = vec4(c, a);
  }`;
function ringGeo() {
  const nv = (NSEG + 1) * 4, pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = [];
  for (let r = 0; r < 4; r++) for (let i = 0; i <= NSEG; i++) { const k = r * (NSEG + 1) + i; uv[k * 2] = i / NSEG; uv[k * 2 + 1] = r === 0 ? 0 : r === 1 ? 1 : r === 2 ? 2 : 3; }
  for (const [ra, rb] of [[0, 1], [2, 3]]) for (let i = 0; i < NSEG; i++) { const a = ra * (NSEG + 1) + i, b = rb * (NSEG + 1) + i; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  return g;
}

class MapleFX extends FxHost {
  mkRing() {
    const m = new THREE.Mesh(ringGeo(), new THREE.ShaderMaterial({ vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
      uniforms: { uA: { value: 1 }, uGapA: { value: 0 }, uGapW: { value: 0.5 }, uT: { value: 0 }, uCol: { value: new THREE.Color() }, uHot: { value: new THREE.Color() } } }));
    m.renderOrder = 10; return m;
  }
  warm() { if (!this._warm) { this._warm = true; this.prewarm([['ring', () => this.mkRing(), 3]]); } }

  /** Lay a ring mesh at (x, z) radius r, band width w, wall height h. */
  layRing(m, x, z, r, w, h) {
    const p = m.geometry.attributes.position.array, N1 = NSEG + 1, ri = Math.max(0.05, r - w * 0.5), ro = r + w * 0.5;
    for (let i = 0; i <= NSEG; i++) {
      const s = SIN[i], c = COS[i], y = this.heightAt(x + s * r, z + c * r);
      let k = i * 3; p[k] = x + s * ri; p[k + 1] = y + 0.07; p[k + 2] = z + c * ri;
      k = (N1 + i) * 3; p[k] = x + s * ro; p[k + 1] = y + 0.07; p[k + 2] = z + c * ro;
      k = (N1 * 2 + i) * 3; p[k] = x + s * r; p[k + 1] = y + 0.04; p[k + 2] = z + c * r;
      k = (N1 * 3 + i) * 3; p[k] = x + s * r; p[k + 1] = y + h; p[k + 2] = z + c * r;
    }
    m.geometry.attributes.position.needsUpdate = true;
  }
  /**
   * An expanding shock ring. o: { x, z, r0, r1, speed, w, h, gapA, gapW (half angle, 0 = none), color, hot }. The ring
   * state { x, z, r, w, gapA, gapW, done, t } is advanced here; read ring.r for hit tests. Set ring.done to fade it early.
   */
  shock(o) {
    const m = this.take('ring', () => this.mkRing()), U = m.material.uniforms;
    m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.scale.set(1, 1, 1); m.updateMatrixWorld(true); // (vertices are written in world space; the prewarm parks pooled meshes below the ground)
    const S = { x: o.x, z: o.z, r: o.r0 ?? 0.6, r1: o.r1 ?? 10, speed: o.speed ?? 6, w: o.w ?? 0.8, h: o.h ?? 0.45, gapA: o.gapA ?? 0, gapW: o.gapW ?? 0, done: false, t: 0, fade: 0 };
    U.uCol.value.set(o.color || '#ffd890'); U.uHot.value.set(o.hot || '#fff8e8'); U.uGapA.value = S.gapA; U.uGapW.value = S.gapW; U.uA.value = 1;
    const emitKey = 'mf-ring' + (this._ringN = ((this._ringN || 0) + 1) % 8); // (a few reused emitter keys)
    this.run((dt, t) => {
      S.t = t; U.uT.value = t;
      if (!S.done) { S.r += S.speed * dt; if (S.r >= S.r1) { S.r = S.r1; S.done = true; } }
      if (S.done) S.fade += dt * 5;
      const k = S.r / S.r1;
      U.uA.value = Math.max(0, (1 - k * k * 0.45) * (1 - S.fade));
      this.layRing(m, S.x, S.z, S.r, S.w * (1 + k * 0.25), S.h * (1 - k * 0.4));
      // dust and leaves kicked up along the front
      if (!S.done) for (let n = this.emit(emitKey, 26 + S.r * 5, dt); n > 0; n--) {
        const a = rand(0, TAU); if (S.gapW > 0 && Math.abs(((a - S.gapA + Math.PI) % TAU + TAU) % TAU - Math.PI) < S.gapW) continue;
        const px = S.x + Math.sin(a) * S.r, pz = S.z + Math.cos(a) * S.r, py = this.heightAt(px, pz);
        if (n % 3) this.p('n', F.PUFF, px, py + 0.1, pz, { vx: Math.sin(a) * 1.5, vy: rand(0.3, 0.9), vz: Math.cos(a) * 1.5, life: rand(0.4, 0.6), size: 0.45, size1: 0.9, color: MCOL.dust, alpha: 0.5, alpha1: 0, drag: 2.5 });
        else this.p('n', F.MAPLE, px, py + 0.15, pz, { vx: Math.sin(a) * 2.5, vy: rand(1.5, 3), vz: Math.cos(a) * 2.5, life: rand(0.6, 0.9), size: 0.26, size1: 0.2, color: MCOL.maple[n & 3], alpha: 1, alpha1: 0.6, spin: rand(-9, 9), grav: 5, drag: 1.5 });
      }
      return S.fade < 1;
    }, () => this.give('ring', m));
    return S;
  }
  /** a "PON!" burst at the belly (drum beat) */
  pon(x, y, z, s = 1) {
    this.p('a', F.NOTE, x, y, z, { life: 0.28, size: 1.1 * s, size1: 2.2 * s, color: MCOL.pon, alpha: 0.95, alpha1: 0, rot: rand(0, TAU) });
    this.p('a', F.RING, x, y, z, { life: 0.3, size: 0.6 * s, size1: 2.6 * s, color: MCOL.pon, alpha: 0.8, alpha1: 0 });
    this.twinkles(x, y, z, { n: 4, color: MCOL.twinkle, r: 0.5 * s, size: 0.35, life: 0.5 });
  }
  /** DORON! the transformation poof: a big smoke cloud, a flurry of leaves and twinkles */
  doron(x, y, z, s = 1) {
    this.puffs(x, y, z, { n: Math.round(18 * s), color: MCOL.smoke, size: 0.9 * s, grow: 2.2, speed: 2.8 * s, up: 1.6, life: 1.0, alpha: 0.95, r: 0.5 * s });
    this.puffs(x, y + 0.6 * s, z, { n: Math.round(8 * s), color: MCOL.smoke2, size: 0.7 * s, grow: 2, speed: 1.6 * s, up: 2.4, life: 0.9, alpha: 0.9, r: 0.3 * s });
    this.leafBurst(x, y + 0.4 * s, z, { n: Math.round(18 * s), frame: F.MAPLE, colors: MCOL.maple, speed: 4.5 * s, up: 4, size: 0.34, life: 1.4 });
    this.leafBurst(x, y + 0.8 * s, z, { n: 5, frame: F.LEAFBIT, colors: MCOL.green, speed: 3 * s, up: 3, size: 0.3, life: 1.2 });
    this.twinkles(x, y + 0.5 * s, z, { n: 10, color: MCOL.twinkle, r: 0.9 * s, size: 0.4, life: 0.8, rise: 1.4 });
    this.shockRing(x, z, 0.3, 2.2 * s, { life: 0.35, color: '#fff6e0', width: 0.08 });
  }
  /** sparkles gathering at a point (the leaf on his head glowing before a transformation). getPos(v) → world pos */
  gather(getPos, dur, color = MCOL.twinkle, _v = new THREE.Vector3()) {
    this.run((dt, t) => {
      const p = getPos(_v);
      for (let i = this.emit('mf-gather', 34, dt); i > 0; i--) {
        const a = rand(0, TAU), r = rand(0.8, 1.5), y = rand(-0.5, 0.8);
        this.p('a', F.STAR4, p.x + Math.cos(a) * r, p.y + y, p.z + Math.sin(a) * r, { vx: -Math.cos(a) * r * 3, vy: -y * 3, vz: -Math.sin(a) * r * 3, life: 0.32, size: 0.3, size1: 0.1, color, alpha: 0.3, alpha1: 1, drag: 0.5 });
      }
      return t < dur;
    });
  }
  /** boulder dust: puffs and pebbles behind a rolling body */
  rollDust(x, z, dx, dz, key, dt, s = 1) {
    const y = this.heightAt(x, z);
    for (let n = this.emit(key, 40, dt); n > 0; n--) {
      const sd = rand(-0.6, 0.6) * s;
      this.p('n', F.PUFF, x - dx * 0.6 * s - dz * sd, y + 0.15, z - dz * 0.6 * s + dx * sd, { vx: -dx * rand(1, 2.5) + rand(-0.5, 0.5), vy: rand(0.4, 1.2), vz: -dz * rand(1, 2.5) + rand(-0.5, 0.5), life: rand(0.5, 0.8), size: 0.5 * s, size1: 1.2 * s, color: MCOL.dust, alpha: 0.6, alpha1: 0, drag: 2 });
      if (n % 4 === 0) this.p('n', F.MAPLE, x + rand(-0.5, 0.5) * s, y + 0.2, z + rand(-0.5, 0.5) * s, { vx: rand(-2, 2), vy: rand(2, 4), vz: rand(-2, 2), life: 0.9, size: 0.28, size1: 0.2, color: MCOL.maple[n & 3], alpha: 1, alpha1: 0.6, spin: rand(-9, 9), grav: 5, drag: 1.2 });
    }
  }
  /** a heavy landing / crash: shock band, dust, chips, leaves, a scuff and a flash of light */
  crash(x, z, r, { chips = MCOL.chip, leaves = true, light = true } = {}) {
    const y0 = this.heightAt(x, z);
    this.shockRing(x, z, 0.3, r * 1.3, { life: 0.4, color: '#fff2d0', width: 0.09 });
    this.shockRing(x, z, 0.2, r * 0.85, { life: 0.26, color: '#ffffff', width: 0.06 });
    this.puffs(x, y0 + 0.1, z, { n: 16, color: MCOL.dust, size: 0.8, speed: 6, up: 0.8, r: r * 0.4, life: 0.9 });
    if (leaves) this.leafBurst(x, y0 + 0.2, z, { n: 20, frame: F.MAPLE, colors: MCOL.maple, speed: 6, up: 5.5, life: 1.5 });
    for (let i = 0; i < 10; i++) { const a = rand(0, TAU), s = rand(3, 7); this.p('n', F.CHUNK, x, y0 + 0.2, z, { vx: Math.cos(a) * s, vy: rand(3, 6), vz: Math.sin(a) * s, life: 0.7, size: rand(0.14, 0.24), color: chips, alpha: 1, alpha1: 1, grav: 16, spin: rand(-9, 9) }); }
    this.vfx.decal({ x, y: y0, z }, { r: r * 0.8, color: '#3a2a18', opacity: 0.3, life: 3 });
    if (light) this.vfx.light(_lv.set(x, y0 + 1, z), '#fff0d0', 5, 7, 0.25); // (the light pool clones a Vector3)
  }
  /** steam jet from a spout: o = { x, y, z, yaw, half, R, on } (the boss keeps x/y/z/yaw current; clear o.on to stop) */
  steam(o) {
    this.run((dt) => {
      if (!o.on) return false;
      const y0 = this.heightAt(o.x, o.z);
      for (let n = this.emit('mf-steam', 70, dt); n > 0; n--) {
        const a = o.yaw + rand(-o.half, o.half) * 0.9, sp = o.R * rand(1.3, 1.9), up = rand(0.2, 1.2);
        this.p('n', F.PUFF, o.x, o.y, o.z, { vx: Math.sin(a) * sp, vy: up, vz: Math.cos(a) * sp, life: rand(0.45, 0.7), size: 0.35, size1: rand(1.4, 2.1), color: MCOL.steam, alpha: 0.85, alpha1: 0, drag: 2.2, spin: rand(-2, 2) });
      }
      for (let n = this.emit('mf-steamS', 24, dt); n > 0; n--) {
        const a = o.yaw + rand(-o.half, o.half) * 0.7, sp = o.R * 2.4;
        this.p('a', F.STREAK, o.x, o.y, o.z, { vx: Math.sin(a) * sp, vy: 0.3, vz: Math.cos(a) * sp, life: 0.28, size: 1.2, size1: 0.4, color: MCOL.wind, alpha: 0.6, alpha1: 0, fn: alignFn, drag: 2 });
      }
      if (Math.random() < dt * 10) { const a = o.yaw + rand(-o.half, o.half), r = rand(0.4, 1) * o.R; this.p('n', F.PUFF, o.x + Math.sin(a) * r, y0 + 0.1, o.z + Math.cos(a) * r, { vx: Math.sin(a), vy: 0.6, vz: Math.cos(a), life: 0.8, size: 0.6, size1: 1.6, color: MCOL.steam, alpha: 0.5, alpha1: 0, drag: 2 }); }
      return true;
    });
  }
  /** little puffs from a spout / ears (kettle wind-up, drunk giant) */
  wisps(x, y, z, { n = 3, color = MCOL.steam, size = 0.3, up = 1.4 } = {}) {
    for (let i = 0; i < n; i++) this.p('n', F.PUFF, x + rand(-0.08, 0.08), y, z + rand(-0.08, 0.08), { vx: rand(-0.3, 0.3), vy: up * rand(0.7, 1.2), vz: rand(-0.3, 0.3), life: rand(0.5, 0.8), size, size1: size * 3, color, alpha: 0.7, alpha1: 0, drag: 1.5 });
  }
  /** a swirl of leaves at (x, z) that rises for `dur` s (a summon spot) */
  swirl(x, z, dur, colors = MCOL.maple) {
    const cen = { x, z }, y0 = this.heightAt(x, z), key = 'mf-sw' + (this._swN = ((this._swN || 0) + 1) % 6);
    this.run((dt, t) => {
      for (let n = this.emit(key, 40, dt); n > 0; n--) {
        const q = this.p('n', F.MAPLE, x, y0 + rand(0, 0.3), z, { life: rand(0.7, 1.0), size: rand(0.24, 0.34), size1: 0.18, color: colors[n % colors.length], alpha: 1, alpha1: 0, spin: rand(-9, 9), fn: orbitFn });
        q.cen = cen; q.ang = rand(0, TAU); q.rad = rand(0.5, 0.9); q.w = rand(7, 10); q.rin = -0.3; q.climb = rand(1.2, 2.2);
      }
      return t < dur;
    });
  }
  feathers(x, y, z, { n = 8, speed = 3, up = 2.5 } = {}) { this.leafBurst(x, y, z, { n, frame: F.FEATHER, colors: MCOL.crow, speed, up, size: 0.34, life: 1.3, grav: 1.4, drag: 2.2 }); }
  straw(x, y, z, { n = 10, speed = 3, up = 3 } = {}) { this.leafBurst(x, y, z, { n, frame: F.LEAFBIT, colors: MCOL.straw, speed, up, size: 0.2, life: 1.0, grav: 6, drag: 1.4 }); }
  leaves(x, y, z, { n = 10, speed = 3, up = 3, colors = MCOL.maple, frame = F.MAPLE, size = 0.3, life = 1.2 } = {}) { this.leafBurst(x, y, z, { n, frame, colors, speed, up, size, life, grav: 3, drag: 1.6 }); }
  chips(x, y, z, { n = 8, color = MCOL.nut, speed = 4, size = 0.14 } = {}) {
    for (let i = 0; i < n; i++) { const a = rand(0, TAU), s = rand(0.4, 1) * speed; this.p('n', F.CHUNK, x, y, z, { vx: Math.cos(a) * s, vy: rand(2, 5), vz: Math.sin(a) * s, life: 0.7, size: size * rand(0.7, 1.3), color, alpha: 1, alpha1: 1, grav: 14, spin: rand(-9, 9) }); }
  }
}

/** The Momiji Hollow effect host for this VFX (made on first use; heightAt follows the current world) */
export function mapleFx(vfx, world) {
  const h = fxHost(vfx, 'maple', v => new MapleFX(v));
  if (world?.heightAt && h._world !== world) { h._world = world; h.heightAt = (x, z) => world.heightAt(x, z); }
  return h;
}
export { F, C, alignFn, orbitFn, rand, TAU, clamp, ease };
