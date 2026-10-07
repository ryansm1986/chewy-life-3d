// Cached 3D thumbnails of buildings for the build palette (rendered once with the game's renderer).
import * as THREE from 'three';
import { buildModel, sizeOf } from '../world/buildings/index.js';
import { MATS } from '../world/buildings/kit.js';
import { U } from './materials.js';

export class BuildingThumbs {
  constructor(engine, size = 128) {
    this.engine = engine; this.size = size; this.cache = new Map();
    this.rt = new THREE.WebGLRenderTarget(size, size, { samples: 4, colorSpace: THREE.SRGBColorSpace });
    const s = this.scene = new THREE.Scene();
    s.add(new THREE.HemisphereLight('#f4f0ff', '#b8b0a0', 1.7));
    const key = new THREE.DirectionalLight('#fff2dc', 2.4); key.position.set(3, 5, 4); s.add(key);
    const rim = new THREE.DirectionalLight('#ffd8f0', 1.0); rim.position.set(-4, 3, -3); s.add(rim);
    this.cam = new THREE.PerspectiveCamera(22, 1, 0.1, 200);
    this.canvas = document.createElement('canvas'); this.canvas.width = this.canvas.height = size;
  }
  /** already rendered (the build palette shows those at once and fills in the rest after it opens: world/buildMode.js) */
  has(id) { return this.cache.has(id); }
  /** Compile the thumbnail scene's programs without blocking (KHR_parallel_shader_compile, renderer.compileAsync): its
   *  lights make new variants of the building materials, and the first render otherwise waits ~190 ms on their link
   *  (ROADMAP R-8). Called once, with a first building, before any thumbnail (ui/prewarm.js, buildMode.js). */
  warmPrograms(id) {
    const R = this.engine.renderer;
    if (this._warm) return this._warm;
    if (!R.compileAsync) return (this._warm = Promise.resolve());
    let g = null;
    try {
      g = buildModel(id, { level: 1, seed: 1 }).group;
      // every kit material, not only the first building's: a later building with a water, jet or hot part would
      // otherwise link its program on the spot (~1 s on ANGLE)
      const geo = g.getObjectsByProperty('isMesh', true)[0]?.geometry;
      if (geo) for (const m of Object.values(MATS())) g.add(new THREE.Mesh(geo, m));
      this.scene.add(g); g.updateMatrixWorld(true);
    } catch (e) { return (this._warm = Promise.resolve()); }
    return (this._warm = R.compileAsync(this.scene, this.cam).catch(() => {}).finally(() => this.scene.remove(g)));
  }
  get(id) {
    if (this.cache.has(id)) return this.cache.get(id);
    let url = null;
    try { url = this.render(id); } catch (e) { console.warn('[thumbs]', id, e); }
    this.cache.set(id, url);
    return url;
  }
  /** A cached thumbnail of any model (furniture in the decorate palette: home/furnitureMesh.js): `make()` returns a
   *  group whose geometry and materials are shared (it's only parented to the thumb scene for the render).
   *  o: { foot: [w, d] metres (framing floor), dir: [x, y, z] (camera direction), min: radius floor } */
  object(key, make, o = {}) {
    if (this.cache.has(key)) return this.cache.get(key);
    let url = null;
    try { url = this.renderGroup(make(), o.foot || [0.5, 0.5], o); } catch (e) { console.warn('[thumbs]', key, e); }
    this.cache.set(key, url);
    return url;
  }
  render(id) { return this.renderGroup(buildModel(id, { level: 1, seed: 1 }).group, sizeOf(id, 1)); }
  renderGroup(g, [w, d], o = {}) {
    this.scene.add(g);
    g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g), sphere = box.getBoundingSphere(new THREE.Sphere());
    const r = Math.max(sphere.radius, Math.max(w, d) * 0.55, o.min ?? 0.6);
    const dir = new THREE.Vector3(...(o.dir || [1, 0.95, 1.15])).normalize();
    this.cam.position.copy(sphere.center).addScaledVector(dir, r / Math.sin(THREE.MathUtils.degToRad(11)) * 0.98);
    this.cam.lookAt(sphere.center);
    const R = this.engine.renderer;
    const prev = R.getRenderTarget();
    const prevOcc = U.uOccl.value.clone(); U.uOccl.value.set(-9999, -9999, 1, 0);
    const prevNight = U.uNight.value; U.uNight.value = 0;
    R.setRenderTarget(this.rt); R.setClearColor(0x000000, 0); R.clear();
    R.render(this.scene, this.cam);
    const px = new Uint8Array(this.size * this.size * 4);
    R.readRenderTargetPixels(this.rt, 0, 0, this.size, this.size, px);
    R.setRenderTarget(prev); U.uOccl.value.copy(prevOcc); U.uNight.value = prevNight;
    this.scene.remove(g);
    const ctx = this.canvas.getContext('2d'), img = ctx.createImageData(this.size, this.size), S = this.size;
    for (let y = 0; y < S; y++) img.data.set(px.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
    ctx.clearRect(0, 0, S, S); ctx.putImageData(img, 0, 0);
    return this.canvas.toDataURL('image/png');
  }
}
