// Shadow's paw-print trail while he leads the way (ROADMAP R-17, actors/shadowLead.js): a few small prints on the
// ground behind him, an ink pad with a cream rim (the HUD's own look, so it reads on grass, stone, sand, snow and a
// dark cave floor alike), each fading out in a few seconds. Capped (CAP prints alive at once) and drawn in one
// instanced call per world: a unit quad, the paw shape drawn in the fragment shader (no texture). Never bright enough
// to bloom, never additive: nothing can wash the screen.
//
//   const T = new PawTrail();
//   T.print(world, x, z, yaw, side)   // a print at (x, z) on that world's ground, its toes along yaw; side ±1
//   T.update(dt)                       // ages and fades them (call every frame, leading or not)
//   T.clear()                          // gone at once (a new world)
// Allocation-free per frame.
import * as THREE from 'three';

const CAP = 22;          // prints alive at once
const LIFE = 3.4;        // s a print lasts (it fades over its last FADE)
const FADE = 1.6;
const SIZE = 0.36;       // m across (reads at the game camera: ~12 px at 1600×900)
const ALPHA = 0.66;      // the newest print's opacity

const VS = /* glsl */`attribute vec4 iP; attribute float iA;
  varying vec2 vU; varying float vA;
  void main() {
    vU = position.xz; vA = iA;
    float c = cos(iP.z), s = sin(iP.z);
    vec2 l = position.xz * ${SIZE.toFixed(3)};
    vec3 wp = vec3(iP.x + l.x * c + l.y * s, iP.w, iP.y - l.x * s + l.y * c);
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }`;
// the paw in the quad's own frame (u across, v along the toes, both -0.5..0.5): a heel pad and four toe beans
const FS = /* glsl */`uniform vec3 uFill; uniform vec3 uInk;
  varying vec2 vU; varying float vA;
  float el(vec2 p, vec2 c, vec2 r) { vec2 d = (p - c) / r; return length(d) - 1.0; }
  void main() {
    vec2 p = vU;
    float d = el(p, vec2(0.0, -0.12), vec2(0.22, 0.19));
    d = min(d, el(p, vec2(-0.25, 0.10), vec2(0.085, 0.10)));
    d = min(d, el(p, vec2(-0.095, 0.25), vec2(0.09, 0.11)));
    d = min(d, el(p, vec2(0.095, 0.25), vec2(0.09, 0.11)));
    d = min(d, el(p, vec2(0.25, 0.10), vec2(0.085, 0.10)));
    float aa = fwidth(d) * 1.2;
    float shape = 1.0 - smoothstep(0.0, aa, d);
    float inner = 1.0 - smoothstep(-0.3 - aa, -0.3, d); // (a cream rim round each bean, the outer ~30% of its radius: reads on a dark floor)
    vec3 col = mix(uFill, uInk, inner);
    float a = shape * vA;
    if (a < 0.01) discard;
    gl_FragColor = vec4(col, a);
  }`;

let MAT = null;
function material() {
  if (MAT) return MAT;
  MAT = new THREE.ShaderMaterial({
    vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    uniforms: { uFill: { value: new THREE.Color('#fff1d2') }, uInk: { value: new THREE.Color('#5a3a2e') } },
  });
  MAT.name = 'pawTrail';
  return MAT;
}
let QUAD = null;
function quad() {
  if (QUAD) return QUAD;
  QUAD = new THREE.BufferGeometry();
  QUAD.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, -0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5], 3));
  QUAD.setIndex([0, 2, 1, 1, 2, 3]);
  return QUAD;
}

export class PawTrail {
  constructor() {
    this.recs = []; for (let i = 0; i < CAP; i++) this.recs.push({ x: 0, z: 0, y: 0, yaw: 0, t: LIFE + 1 });
    this.next = 0; this.alive = 0; this.mesh = null; this.world = null; this.count = 0;
  }
  /** one mesh per world (a floor's teardown frees its own; the material and the quad are shared) */
  meshFor(world) {
    if (this.world === world && this.mesh) return this.mesh;
    this.clear();
    const g = new THREE.InstancedBufferGeometry(); g.index = quad().index; g.setAttribute('position', quad().attributes.position);
    this.aP = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4); this.aP.setUsage(THREE.DynamicDrawUsage); g.setAttribute('iP', this.aP);
    this.aA = new THREE.InstancedBufferAttribute(new Float32Array(CAP), 1); this.aA.setUsage(THREE.DynamicDrawUsage); g.setAttribute('iA', this.aA);
    g.instanceCount = 0;
    const m = new THREE.Mesh(g, material()); m.name = 'shadow:pawTrail'; m.frustumCulled = false; m.renderOrder = 4; m.castShadow = false; m.receiveShadow = false;
    this.mesh = m; this.world = world;
    return m;
  }
  print(world, x, z, yaw, side = 1) {
    if (!world?.scene) return;
    const m = this.meshFor(world);
    if (m.parent !== world.scene) world.scene.add(m);
    const r = this.recs[this.next]; this.next = (this.next + 1) % CAP;
    const off = 0.075 * side, c = Math.cos(yaw), s = Math.sin(yaw);
    r.x = x + c * off; r.z = z - s * off; r.yaw = yaw; r.t = 0;
    r.y = (world.heightAt?.(r.x, r.z) ?? 0) + 0.045;
    this.count++;
  }
  update(dt) {
    const m = this.mesh; if (!m) return;
    if (m.parent && this.world?.scene !== m.parent) { m.parent.remove(m); this.alive = 0; } // (the world it was in was swapped out)
    let n = 0;
    const P = this.aP.array, A = this.aA.array;
    for (const r of this.recs) {
      if (r.t > LIFE) continue;
      r.t += dt;
      if (r.t > LIFE) continue;
      const k = r.t < 0.12 ? r.t / 0.12 : r.t > LIFE - FADE ? (LIFE - r.t) / FADE : 1;
      P[n * 4] = r.x; P[n * 4 + 1] = r.z; P[n * 4 + 2] = r.yaw; P[n * 4 + 3] = r.y;
      A[n] = ALPHA * k * k; n++;
    }
    this.alive = n;
    m.geometry.instanceCount = n;
    m.visible = n > 0;
    if (n) { this.aP.needsUpdate = true; this.aA.needsUpdate = true; }
  }
  clear() {
    for (const r of this.recs) r.t = LIFE + 1;
    this.alive = 0;
    if (this.mesh) { this.mesh.parent?.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh = null; this.world = null; }
  }
}
