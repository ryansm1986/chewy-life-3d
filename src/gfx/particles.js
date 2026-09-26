// CPU-simulated, GPU-billboarded particle system. One instanced draw per (texture, blend) layer.
import * as THREE from 'three';

const VERT = /* glsl */`
attribute vec3 iPos;
attribute vec4 iColor;
attribute vec3 iMisc; // size, rotation, stretch
varying vec2 vUv;
varying vec4 vColor;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
void main() {
  vUv = uv;
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

export class ParticleLayer {
  constructor(scene, map, { additive = true, max = 3000, depthTest = true, order = 10 } = {}) {
    this.max = max; this.n = 0;
    this.p = []; // particle objects
    const g = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    g.index = quad.index; g.attributes.position = quad.attributes.position; g.attributes.uv = quad.attributes.uv;
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3); this.aPos.setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); this.aCol.setUsage(THREE.DynamicDrawUsage);
    this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3); this.aMisc.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iColor', this.aCol); g.setAttribute('iMisc', this.aMisc);
    g.instanceCount = 0;
    this.uniforms = { uMap: { value: map }, uCamRight: { value: new THREE.Vector3(1, 0, 0) }, uCamUp: { value: new THREE.Vector3(0, 1, 0) } };
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, transparent: true, depthWrite: false, depthTest,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = order;
    this.geo = g;
    scene.add(this.mesh);
  }
  // spawn one particle; o: {x,y,z, vx,vy,vz, life, size, size1, color(THREE.Color|hex), alpha, alpha1, rot, spin, drag, grav, stretch, fn}
  spawn(o) {
    if (this.p.length >= this.max) this.p.shift();
    const c = o.color instanceof THREE.Color ? o.color : new THREE.Color(o.color ?? '#ffffff');
    this.p.push({
      x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, t: 0, life: o.life || 1,
      s0: o.size ?? 0.3, s1: o.size1 ?? (o.size ?? 0.3), r: c.r, g: c.g, b: c.b, c1: o.color1 ? new THREE.Color(o.color1) : null,
      a0: o.alpha ?? 1, a1: o.alpha1 ?? 0, rot: o.rot ?? Math.random() * 6.28, spin: o.spin || 0, drag: o.drag ?? 0, grav: o.grav ?? 0,
      stretch: o.stretch || 1, fn: o.fn || null, fadeIn: o.fadeIn || 0, flicker: o.flicker || 0,
    });
  }
  update(dt, camera) {
    camera.matrixWorld.extractBasis(this.uniforms.uCamRight.value, this.uniforms.uCamUp.value, new THREE.Vector3());
    const P = this.p; let w = 0;
    const pos = this.aPos.array, col = this.aCol.array, misc = this.aMisc.array;
    for (let i = 0; i < P.length; i++) {
      const q = P[i];
      q.t += dt;
      if (q.t >= q.life) continue;
      const k = q.t / q.life;
      q.vy -= q.grav * dt;
      const dr = Math.exp(-q.drag * dt); q.vx *= dr; q.vy *= dr; q.vz *= dr;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      q.rot += q.spin * dt;
      if (q.fn) q.fn(q, dt, k);
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
    }
    P.length = w;
    this.geo.instanceCount = Math.min(w, this.max);
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aMisc.needsUpdate = true;
  }
  clear() { this.p.length = 0; this.geo.instanceCount = 0; }
  dispose() { this.mesh.parent?.remove(this.mesh); this.geo.dispose(); this.mat.dispose(); }
}
