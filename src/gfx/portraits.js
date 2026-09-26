// Renders cute 3D bust portraits of characters to data-URLs (cached) for dialogue boxes and panels.
import * as THREE from 'three';
import { buildHumanoid, buildBoston, CAST } from '../actors/charKit.js';
import { U } from './materials.js';

export class Portraits {
  constructor(engine) {
    this.engine = engine; this.cache = new Map(); this.specs = new Map();
    this.size = 256;
    this.rt = new THREE.WebGLRenderTarget(this.size, this.size, { samples: 4, colorSpace: THREE.SRGBColorSpace });
    const s = this.scene = new THREE.Scene();
    s.add(new THREE.HemisphereLight('#fff4f0', '#b8a0c8', 1.6));
    const key = new THREE.DirectionalLight('#fff0dc', 2.2); key.position.set(1.2, 2, 2.4); s.add(key);
    const rim = new THREE.DirectionalLight('#ffd0f0', 1.4); rim.position.set(-2, 1.5, -1.5); s.add(rim);
    this.cam = new THREE.PerspectiveCamera(22, 1, 0.1, 20);
    this.canvas = document.createElement('canvas'); this.canvas.width = this.canvas.height = this.size;
  }
  register(id, spec) { this.specs.set(id, spec); }
  get(id) {
    if (this.cache.has(id)) return this.cache.get(id);
    let url = null;
    try { url = this.render(id); } catch (e) { console.warn('[portraits]', id, e); }
    this.cache.set(id, url);
    return url;
  }
  render(id) {
    const spec = id === 'chewy' ? CAST.chewy : id === 'rosie' ? CAST.rosie : this.specs.get(id);
    const rig = id === 'shadow' ? buildBoston() : spec ? buildHumanoid(spec) : null;
    if (!rig) return null;
    // hide outlines slightly thinner for close-ups
    rig.outMat.userData.width.value = 0.008;
    const head = rig.parts.head;
    rig.root.updateMatrixWorld(true);
    const hp = new THREE.Vector3(); head.getWorldPosition(hp);
    rig.root.rotation.y = -0.25;
    this.scene.add(rig.root);
    const quad = !!rig.quadruped;
    this.cam.position.set(hp.x + 0.3, hp.y + (quad ? 0.12 : 0.1), hp.z + (quad ? 1.6 : 2.15));
    this.cam.lookAt(hp.x, hp.y - (quad ? 0.0 : 0.04), hp.z);
    const r = this.engine.renderer;
    const prevRT = r.getRenderTarget(), prevBg = this.scene.background;
    const prevTime = U.uTime.value; U.uTime.value = 0;
    const prevOcc = U.uOccl.value.clone(); U.uOccl.value.set(-9999, -9999, 1, 0);
    r.setRenderTarget(this.rt); r.setClearColor(0x000000, 0); r.clear();
    r.render(this.scene, this.cam);
    const px = new Uint8Array(this.size * this.size * 4);
    r.readRenderTargetPixels(this.rt, 0, 0, this.size, this.size, px);
    r.setRenderTarget(prevRT); U.uTime.value = prevTime; U.uOccl.value.copy(prevOcc);
    this.scene.remove(rig.root);
    const g = this.canvas.getContext('2d');
    const img = g.createImageData(this.size, this.size);
    for (let y = 0; y < this.size; y++) img.data.set(px.subarray((this.size - 1 - y) * this.size * 4, (this.size - y) * this.size * 4), y * this.size * 4);
    g.clearRect(0, 0, this.size, this.size); g.putImageData(img, 0, 0);
    return this.canvas.toDataURL('image/png');
  }
}
