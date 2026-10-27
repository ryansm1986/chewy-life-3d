// Koi: little orange-and-white toy fish swimming lazy loops just under the surface (the waterfall's pool, the river by
// the bridge). One instanced mesh per school; the swim (the loop, the heading, the tail's wag) is all in the vertex
// shader, so a school costs one draw call and no CPU. new Koi(scene, [{ x, z, rx, rz, speed, phase, s }, ...])
import * as THREE from 'three';
import { makeToon } from '../gfx/materials.js';
import { paint } from '../gfx/geom.js';

const BODY = '#ff7a3a', WHITE = '#fff6ec', RED = '#e8462e';
function fishGeo() {
  // a plump body along +z (nose at +0.5 of its length), a fan tail behind, two little side fins; ~0.42 m long
  const body = new THREE.SphereGeometry(0.1, 10, 12); body.rotateX(Math.PI / 2); body.scale(0.85, 0.55, 2.1); body.translate(0, 0, 0.04); // (poles nose to tail: rings along the length for the patches)
  const tail = new THREE.ConeGeometry(0.12, 0.2, 8, 1, true); tail.rotateX(-Math.PI / 2); tail.scale(1, 0.22, 1); tail.translate(0, 0, -0.27); // (a broad fan, flat from above)
  const fins = [-1, 1].map(s => { const f = new THREE.CircleGeometry(0.07, 6); f.rotateX(-Math.PI / 2); f.scale(1.2, 1, 0.7); f.translate(s * 0.11, -0.01, 0.08); return f; });
  const parts = [body, tail, ...fins].map(g => (g.index ? g.toNonIndexed() : g));
  for (const g of parts) { g.deleteAttribute('uv'); }
  const g = new THREE.BufferGeometry();
  const n = parts.reduce((a, p) => a + p.attributes.position.count, 0), pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0; for (const p of parts) { pos.set(p.attributes.position.array, o * 3); nor.set(p.attributes.normal.array, o * 3); o += p.attributes.position.count; }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  // painted patches: orange back with white blotches, a white belly, a red cap on the head (the classic kohaku look)
  const w = new THREE.Color(WHITE), b = new THREE.Color(BODY), r = new THREE.Color(RED);
  return paint(g, (p, nn, out) => {
    const blot = (p.z > -0.07 && p.z < 0.02) || (p.x > 0.005 && p.z >= 0.02 && p.z < 0.12) || (p.x < -0.005 && p.z < -0.07 && p.z > -0.15); // (big white patches, lopsided like a real kohaku's)
    out.copy(p.y < -0.02 ? w : blot ? w : b);
    if (p.z > 0.15 && p.y > -0.01) out.copy(r);         // the red cap
    if (p.z > 0.21) out.copy(w);                        // a white nose
    if (p.z < -0.17) out.copy(w).lerp(b, 0.35);         // the tail: white, blushed orange
  });
}

export class Koi {
  // fish: [{ x, z, rx, rz, speed (rad/s), phase, s (scale), y }] (each swims an ellipse of radii rx, rz about (x, z))
  constructor(scene, fish, { y = -0.005 } = {}) {
    const geo = fishGeo(), N = fish.length;
    const ig = new THREE.InstancedBufferGeometry().copy(geo); ig.instanceCount = N;
    const a = new Float32Array(N * 4), b = new Float32Array(N * 4);
    fish.forEach((f, i) => { a.set([f.x, f.z, f.rx, f.rz], i * 4); b.set([f.speed ?? 0.25, f.phase ?? i * 1.7, f.s ?? 1, f.y ?? y], i * 4); });
    ig.setAttribute('aLoop', new THREE.InstancedBufferAttribute(a, 4));
    ig.setAttribute('aSwim', new THREE.InstancedBufferAttribute(b, 4));
    this.mat = makeToon({
      vertexColors: true, brush: 0.05, rim: 0.4, term: [-0.2, 0.4], emissive: '#ff8a4a', emissiveIntensity: 0.12,
      vertexPars: 'attribute vec4 aLoop; attribute vec4 aSwim;',
      // the loop (an ellipse, with a slow wobble so the school doesn't look like a carousel), heading along it, the tail wag
      vertexWorld: /* glsl */`{
        float t = uTime * aSwim.x + aSwim.y;
        float wob = sin(uTime * 0.37 + aSwim.y * 3.1) * 0.25;
        vec2 c = aLoop.xy, R = aLoop.zw * (1.0 + 0.12 * sin(uTime * 0.21 + aSwim.y));
        vec2 p = c + vec2(cos(t + wob) * R.x, sin(t + wob) * R.y);
        vec2 d = normalize(vec2(-sin(t + wob) * R.x, cos(t + wob) * R.y) * sign(aSwim.x) + 1e-5);
        vec3 l = transformed * aSwim.z;
        float wag = sin(uTime * 7.0 + aSwim.y * 5.0) * 0.5 * smoothstep(0.05, -0.3, l.z / aSwim.z);
        l.x += wag * (-l.z) * 0.55;
        vec3 fwd = vec3(d.x, 0.0, d.y), side = vec3(d.y, 0.0, -d.x);
        cWorld.xyz = vec3(p.x, aSwim.w, p.y) + side * l.x + vec3(0.0, l.y, 0.0) + fwd * l.z;
      }`,
    });
    this.mesh = new THREE.Mesh(ig, this.mat);
    this.mesh.frustumCulled = false; // (the instances move in the shader)
    this.mesh.renderOrder = 1;       // (just at the surface: the water would hide them any deeper)
    this.mesh.castShadow = false; this.mesh.receiveShadow = false;
    scene.add(this.mesh);
  }
  dispose() { this.mesh.parent?.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose(); }
}
