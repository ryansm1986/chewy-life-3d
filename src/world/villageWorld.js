// The overworld scene: island terrain, water, sky light, vegetation, buildings, actors.
import * as THREE from 'three';
import { Terrain, WORLD } from './terrain.js';
import { makeWater } from '../gfx/water.js';
import { LightPool } from '../core/engine.js';
import { U } from '../gfx/materials.js';
import { Vegetation } from './vegetation.js';
import { applyLayout, reservedAt, distToPaths, LANDMARKS } from './layout.js';

export class VillageWorld {
  constructor(engine) {
    this.engine = engine;
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color('#cfe6ff');
    scene.fog = new THREE.Fog('#cfe6ff', 60, 140);
    this.terrain = new Terrain(3);
    applyLayout(this.terrain);
    this.terrainMesh = this.terrain.mesh();
    scene.add(this.terrainMesh);
    scene.add(this.terrain.skirt());
    this.water = makeWater({ heightTex: this.terrain.heightTex, worldSize: WORLD });
    scene.add(this.water);

    // lights
    this.hemi = new THREE.HemisphereLight('#bcdcff', '#b4c28c', 1.2);
    scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight('#fff4e0', 3);
    sun.castShadow = true;
    const q = engine.quality;
    sun.shadow.mapSize.set(q >= 2 ? 4096 : 2048, q >= 2 ? 4096 : 2048);
    const sc = sun.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 160;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
    scene.add(sun); scene.add(sun.target);
    this.lightPool = new LightPool(scene, 8);
    this.veg = new Vegetation(this);
    this.veg.build((x, z) => !reservedAt(x, z) && distToPaths(x, z) > 0.5, engine.quality);
    scene.add(this.veg.group);
    this._snap = new THREE.Vector3();
  }
  heightAt(x, z) { return this.terrain.heightAt(x, z); }
  nearPath(x, z, d) { return distToPaths(x, z) < d; }
  onSky(o, day) {
    U.uSunDir.value.copy(day.sunDir);
    U.uSkyHor.value.copy(o.hor);
  }
  // keep the shadow frustum centred on the camera focus, snapped to texels to avoid shimmer
  updateSun(focus, sunDir) {
    const sun = this.sun;
    const texel = (68 / sun.shadow.mapSize.x);
    const f = this._snap.copy(focus);
    // snap in light space
    const lightMat = new THREE.Matrix4().lookAt(new THREE.Vector3(), sunDir.clone().negate(), new THREE.Vector3(0, 1, 0));
    const inv = lightMat.clone().invert();
    f.applyMatrix4(inv); f.x = Math.round(f.x / texel) * texel; f.y = Math.round(f.y / texel) * texel; f.applyMatrix4(lightMat);
    sun.target.position.copy(f);
    sun.position.copy(f).addScaledVector(sunDir, 70);
    sun.target.updateMatrixWorld();
  }
  update(dt, t) {}
}
