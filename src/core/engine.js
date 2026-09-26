// Renderer, camera rig, lights and the per-frame render. Scenes (village / dungeon) plug in.
import * as THREE from 'three';
import { Post } from '../gfx/post.js';
import { U, initSharedUniforms } from '../gfx/materials.js';
import { damp, clamp, TAU } from './util.js';

export const QUALITY = { LOW: 0, MED: 1, HIGH: 2 };

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.target = new THREE.Vector3();
    this.focus = new THREE.Vector3();
    this.yaw = Math.PI / 4;
    this.yawTarget = this.yaw;
    this.pitch = 0.62;
    this.dist = 34; this.distTarget = 34;
    this.minDist = 12; this.maxDist = 66;
    this.shakeAmt = 0; this.shakeT = 0; this.shakeMul = 1;
    this.lead = new THREE.Vector3();
    this._off = new THREE.Vector3();
  }
  snap() { this.target.copy(this.focus); this.dist = this.distTarget; this.yaw = this.yawTarget; this.update(0); }
  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a * this.shakeMul); }
  zoom(d) { this.distTarget = clamp(this.distTarget * (1 + d * 0.1), this.minDist, this.maxDist); }
  update(dt) {
    const k = dt > 0 ? 1 - Math.exp(-6 * dt) : 1;
    this.target.lerp(this.focus, k);
    this.dist = dt > 0 ? damp(this.dist, this.distTarget, 8, dt) : this.distTarget;
    this.yaw = dt > 0 ? damp(this.yaw, this.yawTarget, 7, dt) : this.yawTarget;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this._off.set(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp).multiplyScalar(this.dist);
    this.camera.position.copy(this.target).add(this._off);
    this.shakeT += dt * 60;
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.5);
    const s = this.shakeAmt * this.shakeAmt * 0.6;
    if (s > 0.0001) this.camera.position.add(new THREE.Vector3(Math.sin(this.shakeT * 1.3) * s, Math.sin(this.shakeT * 1.7 + 1) * s * 0.6, Math.cos(this.shakeT * 1.1) * s));
    this.camera.lookAt(this.target);
  }
  // unit vectors on the ground plane for screen-relative movement
  groundAxes() {
    const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const r = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    return { f, r };
  }
}

// A fixed pool of point lights assigned each frame to the nearest light sources (avoids shader recompiles)
export class LightPool {
  constructor(scene, n = 8) {
    this.lights = [];
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight('#ffffff', 0, 6, 1.6);
      scene.add(l); this.lights.push(l);
    }
    this.sources = new Set();
    this.transient = [];
  }
  addSource(src) { this.sources.add(src); return src; } // {pos:Vector3, color, intensity, radius, flicker, enabled}
  removeSource(src) { this.sources.delete(src); }
  flash(pos, color, intensity, radius, life) { this.transient.push({ pos: pos.clone(), color: new THREE.Color(color), intensity, radius, life, max: life }); }
  clear() { this.sources.clear(); this.transient.length = 0; }
  update(dt, center, time, nightFactor) {
    const cand = [];
    for (const s of this.sources) {
      if (s.enabled === false) continue;
      const nightOnly = s.nightOnly ? nightFactor : 1;
      if (nightOnly <= 0.01) continue;
      const d = s.pos.distanceToSquared(center);
      if (d > 40 * 40) continue;
      const fl = s.flicker ? 1 + Math.sin(time * 9 + s.pos.x * 3) * 0.06 * s.flicker + Math.sin(time * 23 + s.pos.z) * 0.04 * s.flicker : 1;
      cand.push({ d: d - (s.priority || 0) * 400, pos: s.pos, color: s.color, intensity: s.intensity * fl * nightOnly, radius: s.radius });
    }
    for (let i = this.transient.length - 1; i >= 0; i--) {
      const t = this.transient[i]; t.life -= dt;
      if (t.life <= 0) { this.transient.splice(i, 1); continue; }
      cand.push({ d: t.pos.distanceToSquared(center) - 5000, pos: t.pos, color: t.color, intensity: t.intensity * (t.life / t.max), radius: t.radius, transient: true });
    }
    cand.sort((a, b) => a.d - b.d);
    // painted ground pools for the nearest lamps (materials.js POOL_GLSL); skill flashes only use the real lights
    const PP = U.uPoolPos.value, PC = U.uPoolCol.value;
    let n = 0;
    for (const c of cand) {
      if (c.transient || n >= PP.length) continue;
      PP[n].set(c.pos.x, c.pos.y, c.pos.z, c.radius * 0.55);
      PC[n].set(c.color.r, c.color.g, c.color.b).multiplyScalar(c.intensity * 0.1);
      n++;
    }
    if (n < PP.length) PP[n].w = 0;
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i], c = cand[i];
      if (c) { l.position.copy(c.pos); l.color.copy(c.color); l.intensity = c.intensity; l.distance = c.radius; }
      else l.intensity = 0;
    }
  }
}

export class Engine {
  constructor() {
    const params = new URLSearchParams(location.search);
    this.params = params;
    this.quality = params.has('q') ? +params.get('q') : QUALITY.HIGH;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, depth: true, preserveDrawingBuffer: params.has('shot') });
    r.setPixelRatio(Math.min(devicePixelRatio, this.quality >= 2 ? 1.5 : 1));
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.NoToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.domElement.id = 'game';
    document.body.appendChild(r.domElement);
    initSharedUniforms();

    this.camera = new THREE.PerspectiveCamera(20, innerWidth / innerHeight, 1, 500);
    this.rig = new CameraRig(this.camera);
    this.scene = null;
    this.post = null;
    this.time = 0; this.dt = 0;
    this.timeScale = 1; this.hitStop = 0;
    this.clock = new THREE.Timer(); this.clock.connect(document);
    this.raycaster = new THREE.Raycaster();
    addEventListener('resize', () => this.resize());
  }
  // A world provides {scene, sun, hemi, lightPool}
  setWorld(world) {
    this.world = world;
    this.scene = world.scene;
    if (!this.post) this.post = new Post(this.renderer, this.scene, this.camera, this.quality);
    else this.post.setScene(this.scene, this.camera);
  }
  resize() {
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.post?.setSize(innerWidth, innerHeight);
  }
  // Ray from mouse NDC to a horizontal plane at height h (refined against a height function)
  mouseGround(nx, ny, heightFn) {
    this.raycaster.setFromCamera({ x: nx, y: ny }, this.camera);
    const ro = this.raycaster.ray.origin, rd = this.raycaster.ray.direction;
    let h = 0; const p = new THREE.Vector3();
    for (let i = 0; i < 4; i++) {
      const t = (h - ro.y) / rd.y; p.copy(ro).addScaledVector(rd, t);
      if (!heightFn) break; h = heightFn(p.x, p.z);
    }
    return p;
  }
  tick() {
    this.clock.update(); let dt = Math.min(this.clock.getDelta(), 1 / 20);
    if (this.hitStop > 0) { this.hitStop -= dt; dt *= 0.08; }
    dt *= this.timeScale;
    this.dt = dt; this.time += dt;
    U.uTime.value = this.time;
    return dt;
  }
  render() {
    if (!this.scene) return;
    this.post.render(this.dt, this.time);
  }
}
