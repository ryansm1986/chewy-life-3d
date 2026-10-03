// Waterfall off the northern cliffs: scrolling painted water sheet, churning foam, mist and a soft rainbow.
import * as THREE from 'three';
import { U } from '../gfx/materials.js';
import { rand } from '../core/util.js';
import { LANDMARKS } from './layout.js';

const FALL_VS = /* glsl */`
varying vec2 vUv; varying vec3 vW;
void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FALL_FS = /* glsl */`
uniform float uTime; uniform sampler2D uBrush; uniform vec3 uSky; uniform float uNight;
varying vec2 vUv; varying vec3 vW;
void main() {
  float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
  vec2 q = vec2(vUv.x * 2.5, vUv.y * 1.2 + uTime * 1.6);
  float n = texture2D(uBrush, q).r * 0.6 + texture2D(uBrush, q * 1.9 + 0.3).r * 0.4;
  float streak = smoothstep(0.45, 0.75, n);
  vec3 deep = vec3(0.35, 0.75, 0.9), foam = vec3(0.96, 0.99, 1.0);
  vec3 c = mix(deep, foam, streak * 0.8 + (1.0 - vUv.y) * 0.25);
  c = mix(c, foam, smoothstep(0.75, 1.0, 1.0 - vUv.y) * 0.8);
  c *= mix(1.0, 0.45, uNight);
  float a = edge * (0.72 + streak * 0.28);
  gl_FragColor = vec4(c, a);
}`;

export class Waterfall {
  // x / z: LANDMARKS.waterfall (the lip is 2.3 m behind it, the foot 2.3 m in front)
  constructor(world, vfx, { x = LANDMARKS.waterfall.x, zTop = LANDMARKS.waterfall.z - 2.3, zBot = LANDMARKS.waterfall.z + 2.3, width = 3.4 } = {}) {
    this.world = world; this.vfx = vfx;
    const top = Math.max(world.terrain.heightAt(x, zTop - 1), world.terrain.heightAt(x, zTop)) + 0.1;
    this.top = top; this.base = new THREE.Vector3(x, -0.1, zBot);
    // curved sheet: slight outward bulge at the lip
    const segY = 24, pts = [];
    for (let i = 0; i <= segY; i++) { const t = i / segY; pts.push(new THREE.Vector3(0, top * (1 - t) - 0.1 * t, zTop + (zBot - zTop) * Math.pow(t, 1.8) + Math.sin(t * Math.PI) * 0.4)); }
    const g = new THREE.BufferGeometry(), pos = [], uv = [], idx = [];
    for (let i = 0; i <= segY; i++) for (let j = 0; j <= 6; j++) { const u = j / 6, p = pts[i]; const w = width * (1 + i / segY * 0.35); pos.push(x + (u - 0.5) * w, p.y, p.z); uv.push(u, 1 - i / segY); }
    for (let i = 0; i < segY; i++) for (let j = 0; j < 6; j++) { const a = i * 7 + j, b = a + 7; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({ vertexShader: FALL_VS, fragmentShader: FALL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uTime: U.uTime, uBrush: U.uBrush, uSky: U.uSkyHor, uNight: U.uNight } });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.renderOrder = 3; world.scene.add(this.mesh);
    // rainbow arc in the mist
    const rb = document.createElement('canvas'); rb.width = 256; rb.height = 16; const rg = rb.getContext('2d');
    const grd = rg.createLinearGradient(0, 0, 0, 16);
    ['#ff5a5a', '#ffa04a', '#ffe85a', '#6ae07a', '#5ab0ff', '#9a7aff'].forEach((c, i) => grd.addColorStop(i / 5, c));
    rg.fillStyle = grd; rg.fillRect(0, 0, 256, 16);
    const rt = new THREE.CanvasTexture(rb);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.28, 4, 48, Math.PI), new THREE.MeshBasicMaterial({ map: rt, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
    arc.position.set(x + 1.2, 0.4, zBot + 1.2); arc.rotation.y = Math.PI / 4; arc.renderOrder = 4;
    world.scene.add(arc); this.arc = arc;
    this.acc = 0;
  }
  update(dt, t, day) {
    const vfx = this.vfx, b = this.base;
    this.acc += dt * 40;
    while (this.acc > 1) {
      this.acc--;
      const x = b.x + rand(-1.8, 1.8), z = b.z + rand(-0.6, 0.8);
      if (Math.random() < 0.55) vfx.smoke.spawn({ x, y: 0.05, z, vx: rand(-0.8, 0.8), vy: rand(0.6, 1.6), vz: rand(0.2, 1.4), life: rand(1, 2), size: rand(0.5, 0.9), size1: rand(1.4, 2.4), color: '#ffffff', alpha: 0.45, alpha1: 0, drag: 1.2, spin: rand(-1, 1) });
      else vfx.dot.spawn({ x, y: 0.1, z, vx: rand(-1.5, 1.5), vy: rand(1.5, 3), vz: rand(-0.5, 2), life: rand(0.4, 0.8), size: rand(0.08, 0.16), color: '#e8faff', alpha: 0.9, alpha1: 0, grav: 9 });
    }
    // rainbow only in daylight with the sun behind the viewer
    const nightK = day ? day.out.night : 0;
    this.arc.material.opacity = 0.2 * (1 - nightK) * (0.8 + 0.2 * Math.sin(t * 0.5));
  }
}
