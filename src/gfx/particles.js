// CPU-simulated, GPU-billboarded particle system. One instanced draw per (texture, blend) layer.
// Optional texture atlas: new ParticleLayer(scene, atlasTex, { grid: 4 }) and spawn({ frame: 0..15 }) (frame 0 = top-left).
// Dead particle records are recycled (no per-spawn garbage in long fights); an empty layer skips its draw call.
import * as THREE from 'three';

const VERT = /* glsl */`
attribute vec3 iPos;
attribute vec4 iColor;
attribute vec3 iMisc; // size, rotation, stretch
#ifdef ATLAS
attribute float iFrame;
uniform float uGrid;
#endif
varying vec2 vUv;
varying vec4 vColor;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
void main() {
  vUv = uv;
#ifdef ATLAS
  vUv = (uv + vec2(mod(iFrame, uGrid), uGrid - 1.0 - floor(iFrame / uGrid))) / uGrid;
#endif
  vColor = iColor;
  float s = iMisc.x, r = iMisc.y;
  vec2 q = position.xy;
  q.y *= iMisc.z;
  float c = cos(r), si = sin(r);
  q = vec2(q.x * c - q.y * si, q.x * si + q.y * c);
  vec3 wp = iPos + (uCamRight * q.x + uCamUp * q.y) * s;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const FRAG = /* glsl */`
uniform sampler2D uMap;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec4 t = texture2D(uMap, vUv);
  vec4 c = vec4(vColor.rgb * t.rgb, vColor.a * t.a);
  if (c.a < 0.004) discard;
  gl_FragColor = c;
}`;

const _col = new THREE.Color();
const _fwd = new THREE.Vector3();
const FREE_MAX = 1024;

export class ParticleLayer {
  constructor(scene, map, { additive = true, max = 3000, depthTest = true, order = 10, grid = 0 } = {}) {
    this.max = max; this.n = 0; this.killed = 0;
    this.p = []; // particle objects
    this.free = []; // recycled particle objects
    const g = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    g.index = quad.index; g.attributes.position = quad.attributes.position; g.attributes.uv = quad.attributes.uv;
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3); this.aPos.setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); this.aCol.setUsage(THREE.DynamicDrawUsage);
    this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3); this.aMisc.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iColor', this.aCol); g.setAttribute('iMisc', this.aMisc);
    this.aFrame = null;
    if (grid > 1) { this.aFrame = new THREE.InstancedBufferAttribute(new Float32Array(max), 1); this.aFrame.setUsage(THREE.DynamicDrawUsage); g.setAttribute('iFrame', this.aFrame); }
    g.instanceCount = 0;
    this.uniforms = { uMap: { value: map }, uCamRight: { value: new THREE.Vector3(1, 0, 0) }, uCamUp: { value: new THREE.Vector3(0, 1, 0) } };
    if (grid > 1) this.uniforms.uGrid = { value: grid };
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, transparent: true, depthWrite: false, depthTest,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, defines: grid > 1 ? { ATLAS: '' } : {},
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = order;
    this.geo = g;
    scene.add(this.mesh);
  }
  // spawn one particle; o: {x,y,z, vx,vy,vz, life, size, size1, color(THREE.Color|hex), color1, alpha, alpha1, rot, spin, drag, grav,
  // stretch, fn(q, dt, k), fadeIn, flicker, frame (atlas layers)} → the particle record (fn may keep extra fields on it)
  spawn(o) {
    // a full layer drops its oldest particle: it is marked spent (this frame's update compacts it out before the draw,
    // as shift() did) instead of shifting the whole array — a saturated layer made every spawn O(max) (ROADMAP Z-B5)
    if (this.p.length - this.killed >= this.max) { const old = this.p[this.killed++]; if (old) { old.t = old.life; old.fn = null; } }
    const c = o.color instanceof THREE.Color ? o.color : _col.set(o.color ?? '#ffffff');
    const q = this.free.pop() || { _c1: null };
    q.x = o.x; q.y = o.y; q.z = o.z; q.vx = o.vx || 0; q.vy = o.vy || 0; q.vz = o.vz || 0; q.t = 0; q.life = o.life || 1;
    q.s0 = o.size ?? 0.3; q.s1 = o.size1 ?? (o.size ?? 0.3); q.r = c.r; q.g = c.g; q.b = c.b;
    q.c1 = o.color1 ? (q._c1 ||= new THREE.Color()).set(o.color1) : null;
    q.a0 = o.alpha ?? 1; q.a1 = o.alpha1 ?? 0; q.rot = o.rot ?? Math.random() * 6.28; q.spin = o.spin || 0; q.drag = o.drag ?? 0; q.grav = o.grav ?? 0;
    q.stretch = o.stretch || 1; q.fn = o.fn || null; q.fadeIn = o.fadeIn || 0; q.flicker = o.flicker || 0; q.frame = o.frame || 0;
    this.p.push(q);
    return q;
  }
  update(dt, camera) {
    camera.matrixWorld.extractBasis(this.uniforms.uCamRight.value, this.uniforms.uCamUp.value, _fwd);
    const P = this.p; let w = 0;
    this.killed = 0;
    const pos = this.aPos.array, col = this.aCol.array, misc = this.aMisc.array, fr = this.aFrame ? this.aFrame.array : null;
    for (let i = 0; i < P.length; i++) {
      const q = P[i];
      q.t += dt;
      if (q.t >= q.life) { if (this.free.length < FREE_MAX) { q.fn = null; this.free.push(q); } continue; }
      const k = q.t / q.life;
      q.vy -= q.grav * dt;
      const dr = Math.exp(-q.drag * dt); q.vx *= dr; q.vy *= dr; q.vz *= dr;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      q.rot += q.spin * dt;
      if (q.fn) { q.fn(q, dt, k); if (q.t >= q.life) { if (this.free.length < FREE_MAX) { q.fn = null; this.free.push(q); } continue; } }
      P[w++] = q;
      const j = w - 1;
      if (j >= this.max) continue;
      pos[j * 3] = q.x; pos[j * 3 + 1] = q.y; pos[j * 3 + 2] = q.z;
      let a = q.a0 + (q.a1 - q.a0) * k;
      if (q.fadeIn) a *= Math.min(1, q.t / q.fadeIn);
      if (q.flicker) a *= 0.6 + 0.4 * Math.sin(q.t * q.flicker + i);
      let r = q.r, g = q.g, b = q.b;
      if (q.c1) { r += (q.c1.r - r) * k; g += (q.c1.g - g) * k; b += (q.c1.b - b) * k; }
      col[j * 4] = r; col[j * 4 + 1] = g; col[j * 4 + 2] = b; col[j * 4 + 3] = Math.max(0, a);
      misc[j * 3] = q.s0 + (q.s1 - q.s0) * k; misc[j * 3 + 1] = q.rot; misc[j * 3 + 2] = q.stretch;
      if (fr) fr[j] = q.frame;
    }
    P.length = w;
    const n = this.geo.instanceCount = Math.min(w, this.max);
    this.mesh.visible = w > 0;
    // upload only the live records (the buffers hold `max`: a full upload every frame was ~120 KB per layer)
    if (n) for (const a of [this.aPos, this.aCol, this.aMisc, this.aFrame]) if (a) { a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); a.needsUpdate = true; }
  }
  clear() { for (const q of this.p) if (this.free.length < FREE_MAX) { q.fn = null; this.free.push(q); } this.p.length = 0; this.killed = 0; this.geo.instanceCount = 0; this.mesh.visible = false; }
  dispose() { this.mesh.parent?.remove(this.mesh); this.geo.dispose(); this.mat.dispose(); }
}
