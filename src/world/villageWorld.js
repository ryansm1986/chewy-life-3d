// The overworld scene: island terrain, water, sky light, vegetation, buildings, actors.
import * as THREE from 'three';
import { Terrain, WORLD } from './terrain.js';
import { makeWater } from '../gfx/water.js';
import { LightPool } from '../core/engine.js';
import { U } from '../gfx/materials.js';
import { Vegetation, SHADOW_ONLY_LAYER } from './vegetation.js';
import { Details } from './details.js';
import * as Layout from './layout.js';
import { applyLayout, reservedAt, distToPaths, LANDMARKS } from './layout.js';
import { validatePlots } from './plots.js';
import { sizeOf } from './buildings/catalog.js';
import { Collision } from './collision.js';

export class VillageWorld {
  // rank: the village's ring rank (state.village.ringRank): the expansion rings' stub streets up to it are paved
  constructor(engine, { rank = 1 } = {}) {
    this.engine = engine; this.rank = rank;
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color('#cfe6ff');
    scene.fog = new THREE.Fog('#cfe6ff', 60, 140);
    this.terrain = new Terrain(3);
    applyLayout(this.terrain, rank);
    // the plot table must fit the land (docs/VILLAGE_PLAN.md §4): fail loudly in dev
    if (import.meta.env?.DEV) {
      const rep = validatePlots(this.terrain, Layout, sizeOf);
      for (const e of rep.errors) console.error('[plots] ' + e);
    }
    this.terrainMesh = this.terrain.mesh();
    scene.add(this.terrainMesh);
    scene.add(this.terrain.skirt());
    this.water = makeWater({ heightTex: this.terrain.heightTex, worldSize: WORLD, center: [WORLD / 2, WORLD / 2], size: WORLD * 3.75 });
    scene.add(this.water);

    // lights
    this.hemi = new THREE.HemisphereLight('#bcdcff', '#b4c28c', 1.2);
    scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight('#fff4e0', 3);
    sun.castShadow = true;
    const q = engine.quality;
    sun.shadow.mapSize.set(q >= 2 ? 4096 : 2048, q >= 2 ? 4096 : 2048);
    const sc = sun.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 160;
    sc.layers.enable(SHADOW_ONLY_LAYER); // the crowns' shadow-only foliage masses (vegetation.js)
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
    scene.add(sun); scene.add(sun.target);
    this.lightPool = new LightPool(scene, 8);
    this.veg = new Vegetation(this);
    this.veg.bin = 64; // spatial bins for the many-instance batches (VILLAGE_PLAN.md §8)
    this.veg.build((x, z) => !reservedAt(x, z) && distToPaths(x, z) > 0.5, engine.quality);
    scene.add(this.veg.group);
    this.decks = []; // walkable platforms over water (bridges, the pond dock): {x0,z0,x1,z1,h:(x,z)=>y}
    // small land details (curb stones, clover, reeds, the dock, bunting...) share the vegetation records and colliders
    // (&nodetails in the URL skips them, for A/B perf checks)
    if (!(typeof location !== 'undefined' && /[?&]nodetails\b/.test(location.search))) {
      this.details = new Details(this, engine.quality).build();
      scene.add(this.details.group);
    }
    this._snap = new THREE.Vector3();
    // collision: vegetation trunks/rocks + terrain (deep water, cliffs, map edge)
    this.collision = new Collision(4);
    for (const c of this.veg.colliders) c.ref = this.collision.addCircle(c.x, c.z, c.r);
    this.collision.blockFn = (x, z) => !this.walkable(x, z);
    this.interactables = [];
    this.landmarks = LANDMARKS;
  }
  deckAt(x, z) { for (const d of this.decks) if (x > d.x0 && x < d.x1 && z > d.z0 && z < d.z1) return d; return null; }
  heightAt(x, z) { const d = this.deckAt(x, z); if (d) return d.h(x, z); return Math.max(this.terrain.heightAt(x, z), -0.35); }
  walkable(x, z) {
    if (x < 2 || z < 2 || x > WORLD - 2 || z > WORLD - 2) return false;
    if (this.deckAt(x, z)) return true;
    const h = this.terrain.heightAt(x, z);
    return h > -0.22 && this.terrain.slopeAt(x, z) < 0.5;
  }
  onVegRemoved(rec) {
    if (rec.col?.ref) this.collision.remove(rec.col.ref);
    if (rec.lights) { for (const l of rec.lights) this.lightPool.removeSource(l); rec.lights = null; }
  }
  nearPath(x, z, d) { return distToPaths(x, z) < d; }
  onSky(o, day) {
    U.uSunDir.value.copy(day.sunDir);
    U.uSkyHor.value.copy(o.hor);
    this.details?.setNight(o.night);
  }
  // keep the shadow frustum centred on the camera focus, snapped to texels to avoid shimmer
  updateSun(focus, sunDir) {
    const sun = this.sun;
    const sc = sun.shadow.camera, texel = (sc.right - sc.left) / sun.shadow.mapSize.x;
    const f = this._snap.copy(focus);
    // snap in light space
    const lightMat = new THREE.Matrix4().lookAt(new THREE.Vector3(), sunDir.clone().negate(), new THREE.Vector3(0, 1, 0));
    const inv = lightMat.clone().invert();
    f.applyMatrix4(inv); f.x = Math.round(f.x / texel) * texel; f.y = Math.round(f.y / texel) * texel; f.applyMatrix4(lightMat);
    sun.target.position.copy(f);
    sun.position.copy(f).addScaledVector(sunDir, 70);
    sun.target.updateMatrixWorld();
  }
  // per frame: grass chunks beyond the fog are hidden (vegetation.updateGrass)
  update(dt, t) { this.veg.updateGrass?.(this.engine.camera.position); }
}
