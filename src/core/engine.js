// Renderer, camera rig, lights and the per-frame render. Scenes (village / dungeon) plug in.
import * as THREE from 'three';
import { SMAAPreset } from 'postprocessing';
import { Post } from '../gfx/post.js';
import { U, initSharedUniforms } from '../gfx/materials.js';
import { damp, clamp, TAU } from './util.js';
import { bootGraphics, pixelRatioFor, DECK, PRESET, liteOf, releasedGeometries } from './deck.js';

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
    // Framing bias (e.g. a boss fight keeps Chewy AND the boss in frame): an extra world offset added to `focus` and
    // extra distance added to `dist`. Callers set the *Target values every frame; they ease in/out slowly and on their
    // own, independent of whoever drives focus / distTarget, so zoom and follow code need not know about them.
    this.bias = new THREE.Vector3(); this.biasTarget = new THREE.Vector3();
    this.distBias = 0; this.distBiasTarget = 0; this.biasRate = 2.2;
    // follow speed multiplier for the target / distance easing: a slow-motion moment (boss roar) sets 1 / timeScale so
    // the camera still moves at real-time speed while the world crawls
    this.followMul = 1;
    this._f = new THREE.Vector3();
  }
  snap() { this.bias.copy(this.biasTarget); this.distBias = this.distBiasTarget; this.target.copy(this.focus).add(this.bias); this.dist = this.distTarget; this.yaw = this.yawTarget; this.update(0); }
  /** drop any framing bias at once (mode switches) */
  clearBias() { this.bias.set(0, 0, 0); this.biasTarget.set(0, 0, 0); this.distBias = this.distBiasTarget = 0; this.followMul = 1; }
  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a * this.shakeMul); }
  zoom(d) { this.distTarget = clamp(this.distTarget * (1 + d * 0.1), this.minDist, this.maxDist); }
  update(dt) {
    const fm = this.followMul || 1, k = dt > 0 ? 1 - Math.exp(-6 * dt * fm) : 1;
    if (dt > 0) { const kb = 1 - Math.exp(-this.biasRate * dt); this.bias.lerp(this.biasTarget, kb); this.distBias += (this.distBiasTarget - this.distBias) * kb; } // (snap() jumps)
    this.target.lerp(this._f.copy(this.focus).add(this.bias), k);
    this.dist = dt > 0 ? damp(this.dist, this.distTarget, 8 * fm, dt) : this.distTarget;
    this.yaw = dt > 0 ? damp(this.yaw, this.yawTarget, 7, dt) : this.yawTarget;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this._off.set(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp).multiplyScalar(this.dist + this.distBias);
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
      cand.push({ d: d - (s.priority || 0) * 400, pos: s.pos, color: s.color, intensity: s.intensity * fl * nightOnly, radius: s.radius, noPool: s.noPool });
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
      if (c.transient || c.noPool || n >= PP.length) continue;
      PP[n].set(c.pos.x, c.pos.y, c.pos.z, c.radius * 0.7);
      PC[n].set(c.color.r, c.color.g, c.color.b).multiplyScalar(c.intensity * 0.16);
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
    // Settings › Graphics at boot (core/deck.js, ROADMAP R-2): preset 0..3 (3: the Steam Deck), quality 0..2 the density
    // tier the worlds build their grass, flowers, details and shadow maps with (?q= still wins)
    const gq = bootGraphics(params);
    this.preset = gq.preset; this.quality = gq.quality; this.deck = gq.deck; this.lite = liteOf(gq.preset); // (lite: the Deck's or Mobile's numbers, core/deck.js)
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, depth: true, preserveDrawingBuffer: params.has('shot') });
    r.setPixelRatio(pixelRatioFor(this.preset));
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.NoToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.domElement.id = 'game';
    document.body.appendChild(r.domElement);
    // a lost WebGL context (a phone backgrounding the tab) after geometries let go of their arrays (the Mobile preset,
    // core/deck.js releaseAfterUpload) can't be re-uploaded: save on the loss, and reload once the context is back
    r.domElement.addEventListener('webglcontextlost', e => { if (!releasedGeometries()) return; e.preventDefault(); this.lostReleased = true; try { globalThis.G?.save?.(); } catch (er) { /* */ } });
    r.domElement.addEventListener('webglcontextrestored', () => { if (this.lostReleased) location.reload(); });
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
    // Every frame renders into the composer's (linear) input buffer, so programs are keyed with a linear output colour
    // space; a bare renderer.compile() would build the sRGB-output variant and the "prewarm" would compile the wrong
    // shaders. Compile against the same target the scene is really drawn into.
    const compile = r.compile.bind(r);
    r.compile = (scene, camera, target) => {
      const prev = r.getRenderTarget(), rt = this.post?.composer?.inputBuffer;
      if (rt) r.setRenderTarget(rt);
      try { return compile(scene, camera, target); } finally { if (rt) r.setRenderTarget(prev); }
    };
  }
  // A world provides {scene, sun, hemi, lightPool}
  setWorld(world) {
    this.world = world;
    this.scene = world.scene;
    if (!this.post) { this.post = new Post(this.renderer, this.scene, this.camera, this.quality); this.postPreset(); }
    else this.post.setScene(this.scene, this.camera);
    this.tuneShadows(world);
    this._shadowDirty = true; // (a new world's lights have no maps yet: draw them on its first frame)
  }
  /** Settings › Graphics, live: the pixel ratio, AO, tilt-shift and the Deck's shadows. Grass and detail density stay as
   *  the worlds were built (the next start follows: R-2). The particle cap is game.js's (gfx/particles.js). */
  applyPreset(p) {
    this.preset = p; this.deck = p === PRESET.DECK; this.lite = liteOf(p);
    this.renderer.setPixelRatio(pixelRatioFor(p));
    this.postPreset();
    this.tuneShadows();
    this.resize();
  }
  /** the post passes a preset keeps: AO and tilt-shift from Medium up (not the Deck's or Mobile's); Mobile also takes
   *  SMAA down to its low preset and leaves out the chromatic aberration pass (hit flashes keep their tint) */
  postPreset(p = this.preset) {
    const P = this.post; if (!P) return;
    const mob = p === PRESET.MOBILE, lite = !!liteOf(p);
    P.ao.enabled = p >= 1 && !lite; P.ao.configuration.halfRes = p !== PRESET.HIGH; P.tiltPass.enabled = p >= 1 && !lite;
    if (P._smaaMob !== mob) { P._smaaMob = mob; try { P.smaa.applyPreset?.(mob ? SMAAPreset.LOW : SMAAPreset.HIGH); } catch (e) { /* */ } }
    P.noChroma = mob; // (Post.render keeps the hit aberration's pass off while it is set)
  }
  /** the Deck's and Mobile's sun shadows: a smaller map over a tighter area (fewer casters drawn too); other presets keep
   *  the world's own (each world sizes its map by quality and its area by its camera) */
  tuneShadows(world = this.world) {
    const sun = world?.sun; if (!sun?.castShadow) return;
    const sh = sun.shadow, sc = sh.camera, base = sun.userData.shadowBase ||= { size: sh.mapSize.x, ext: sc.right }, L = this.lite;
    const size = L ? Math.min(base.size, L.shadowMap) : base.size, ext = L ? +(base.ext * L.shadowExtent).toFixed(2) : base.ext;
    if (sh.mapSize.x === size && sc.right === ext) return;
    sh.mapSize.set(size, size); sc.left = sc.bottom = -ext; sc.right = sc.top = ext; sc.updateProjectionMatrix();
    if (sh.map) { sh.map.dispose(); sh.map = null; } // (three re-allocates it at the new size on the next shadow render)
    this._shadowDirty = true;
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
    // the Deck preset redraws the shadow maps every DECK.shadowEvery frames (moving things' shadows trail by a frame);
    // only for this render: portraits and thumbnails keep three's own per-render update
    const sm = this.renderer.shadowMap, every = this.lite?.shadowEvery || 1;
    if (every > 1) { sm.autoUpdate = false; this._shN = ((this._shN || 0) + 1) % every; sm.needsUpdate = this._shadowDirty || this._shN === 0; this._shadowDirty = false; }
    try { this.post.render(this.dt, this.time); } finally { if (every > 1) { sm.autoUpdate = true; sm.needsUpdate = false; } }
  }
}
