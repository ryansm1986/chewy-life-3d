// RegionWorld: an open-air biome map implementing the world contract (docs/REGIONS.md §3.1) and the biome engine API
// (§3.6). Builds, per visit: the terrain mesh (RegionTerrain: cached heightfield, splat/toon ground shader), water
// (sea / pools / ice), the sky dome + horizon silhouettes, the grass, the biome's populate(ctx) (vegetation through
// the Vegetation batches, merged static props, colliders, lights, decks, pools), and the biome's effects(ctx) (the
// weather kit, critters). dispose() frees what the scene teardown can't reach and restores the global uniforms it
// changed; game.js then disposes the scene (geometries, materials, textures).
import * as THREE from 'three';
import { LightPool } from '../core/engine.js';
import { Collision } from '../world/collision.js';
import { makeToon, U, applyDepth } from '../gfx/materials.js';
import { makeWater } from '../gfx/water.js';
import { merge } from '../gfx/geom.js';
import { Vegetation, VEG_MATS, VEG_BUILD, TREE_SPECIES, buildTree, buildBamboo, buildBush, susukiGeo, rockGeo, flowerGeo } from '../world/vegetation.js';
import { Builder } from '../world/buildings/kit.js';
import { RCELL } from './layoutGen.js';
import { regionTerrain, SIZE, paintMask, MASK_RES } from './regionTerrain.js';
import { Weather } from './weather.js';
import { Critters, CRITTER_MODELS } from './critters.js';
import { Noise, RNG, clamp, lerp, smoothstep, mulberry32, rand } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const MEMO = new Map(); // CPU geometry cache across visits (ctx.memo): BatchedMesh copies its sources, so they stay CPU-only
const FXN = 112;        // fx mask: 1 texel / m (canopy, shade, wet, custom)

export class RegionWorld {
  constructor(engine, layout, def) {
    const t0 = performance.now();
    this.engine = engine; this.L = layout; this.def = def;
    this.quality = engine.quality ?? 2;
    const M = this.mood = def.mood || {};
    const scene = this.scene = new THREE.Scene();
    const fog = M.fog || { color: '#cfe6ff', near: 40, far: 120 };
    scene.background = new THREE.Color(fog.color);
    scene.fog = new THREE.Fog(fog.color, fog.near, fog.far);
    // lights (only the key sun + hemi are raw lights; everything else goes through the pool)
    this.hemi = new THREE.HemisphereLight(M.hemi?.sky || '#cfe8ff', M.hemi?.ground || '#8a8a6a', M.hemi?.intensity ?? 1.2);
    scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(M.sun?.color || '#fff4e0', M.sun?.intensity ?? 2.6);
    sun.castShadow = true;
    const q = this.quality;
    sun.shadow.mapSize.set(q >= 2 ? 4096 : 2048, q >= 2 ? 4096 : 2048);
    const sc = sun.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 180;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
    scene.add(sun, sun.target);
    this.sunDir = V(...(M.sun?.dir || [0.4, 0.8, 0.4])).normalize();
    this.lightPool = new LightPool(scene, 8);
    this.collision = new Collision(4);
    this.collision.blockFn = (x, z) => !this.walkable(x, z);
    this.interactables = [];
    this.arenaLanterns = []; // (populate: lantern-light positions round the boss arena; bosses read them)
    this.decks = [];         // walkable strips over water (ctx.addDeck): nav.js rebuilds when the count changes
    this.pools = [];         // local water bodies (ctx.addPool)
    this.moodHold = false;   // a boss that takes over fog / grade (whiteout) sets it; per-frame mood writes skip while set
    this.mask = null; this.decoTex = null;
    this.disposers = []; this.warmMeshes = []; this.warm = 0;
    this._saved = { cloud: U.uCloudShadow.value, tint: U.uShadowTint.value.clone(), contrast: engine.post?.grade?.uniforms?.get('uContrast')?.value };
    // terrain (CPU part cached per region; the surface masks are copied per visit so populate can paint them)
    const T = this.terrain = layout.terrain || regionTerrain(def, layout.plan);
    this.plan = layout.plan || T.plan;
    this.waterLevel = T.water ? T.water.level : null;
    this.mask0 = T.mask0.slice(); this.mask1 = T.mask1.slice();
    const tex = this.tex = T.textures(this.mask0, this.mask1);
    this.heightTex = tex.height;
    this.fxMask = new Uint8Array(FXN * FXN * 4);
    this.fxMaskTex = new THREE.DataTexture(this.fxMask, FXN, FXN, THREE.RGBAFormat); this.fxMaskTex.magFilter = this.fxMaskTex.minFilter = THREE.LinearFilter; this.fxMaskTex.needsUpdate = true;
    this.noise = new Noise(T.seed + 11);
    this.timing = {};
    const mark = (k, t) => { this.timing[k] = +(performance.now() - t).toFixed(1); return performance.now(); };
    let tt = performance.now();
    this.buildGround(); tt = mark('ground', tt);
    this.buildWater(); this.buildSky(); tt = mark('sky', tt);
    // vegetation + props (the biome's populate), then colliders, batches, grass
    this.veg = new Vegetation(this);
    this.props = new PropChunks(this);
    this.taken = new Uint8Array(424 * 424); // placement occupancy, 0.5 m over [-50, 162]
    this.ctx = this.makeCtx();
    const P = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
    this.flags = { veg: P.get('veg') !== '0', fx: P.get('fx') !== '0', grass: P.get('grass') !== '0' };
    if (this.flags.veg) { try { (def.populate || defaultPopulate)(this.ctx); } catch (e) { console.error('[region] populate failed', e); } }
    tt = mark('populate', tt);
    // the zone village (src/regions/village, docs/ZONES.md §2): its ground, colliders, nav blockers and greenery, before
    // the batches and the grass (RegionMode sets layout.hooks; gameplay pieces, so it runs even with ?veg=0)
    if (layout.hooks?.populate) { try { layout.hooks.populate(this.ctx); } catch (e) { console.error('[region] village populate failed', e); } tt = mark('village', tt); }
    for (const c of this.veg.colliders) c.ref = this.collision.addCircle(c.x, c.z, c.r);
    for (const b of this.veg.batches) b.build(this.veg.group);
    scene.add(this.veg.group);
    this.props.build(scene);
    tt = mark('batches', tt);
    if (this.flags.grass) this.buildGrass();
    tt = mark('grass', tt);
    this.tex.mask0.needsUpdate = true; this.tex.mask1.needsUpdate = true; this.fxMaskTex.needsUpdate = true;
    // effects: the weather kit, critters and the biome's own FX
    this.weather = new Weather(this);
    this.critters = new Critters(this);
    if (this.flags.fx && def.effects) { try { this.effects = def.effects(this.fxCtx()) || null; } catch (e) { console.error('[region] effects failed', e); } }
    tt = mark('effects', tt);
    // first frames draw everything (culling off, behind the entry iris) so buffers / textures upload then, not mid-fight
    scene.traverse(o => { if (o.isBatchedMesh) { o.perObjectFrustumCulled = false; this.warmMeshes.push(o); } else if ((o.isMesh || o.isPoints) && o.frustumCulled) { o.frustumCulled = false; this.warmMeshes.push(o); } });
    this.buildMs = +(performance.now() - t0).toFixed(1);
  }

  // ------------------------------------------------------------------ build pieces
  buildGround() {
    const T = this.terrain, mat = this.groundMat = T.material(this.tex);
    const m = this.ground = new THREE.Mesh(T.geometry(), mat);
    m.receiveShadow = true; m.castShadow = true; m.name = 'regionGround';
    this.scene.add(m);
  }
  buildWater() {
    const T = this.terrain, W = T.water;
    if (!W) return;
    this.water = makeWater({ heightTex: this.heightTex, worldSize: T.hSize, origin: [T.hOrigin, T.hOrigin], size: 520, level: W.level, center: [56, 56], deep: W.deep, shallow: W.shallow, foam: W.foam });
    this.scene.add(this.water);
    for (const f of W.frozen) this.addIce(f);
  }
  /** a frozen patch over the region water: { x, z, r } (walkable ice: waterAt() reports 0 there) */
  addIce(f, level = this.terrain.water?.level ?? 0) {
    const g = new THREE.CircleGeometry(f.r, 48); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 1; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 + this.noise.n2(Math.cos(a) * 1.3 + f.x, Math.sin(a) * 1.3) * 0.08; p.setXYZ(i, x * k, 0, z * k); }
    g.translate(f.x, level + 0.015, f.z);
    const mat = makeToon({
      color: '#dcefff', brush: 0.08, rim: 0.6, term: [-0.3, 0.5], shadowSat: 0.2,
      fragColor: /* glsl */`{
        vec2 q = vCWorld.xz;
        float c1 = texture2D(uBrush, q * 0.11).r, c2 = texture2D(uBrush, q * 0.37 + 0.2).g;
        float crack = 1.0 - smoothstep(0.0, 0.02, abs(c1 - 0.5)) ;
        diffuseColor.rgb = mix(vec3(0.62, 0.82, 0.95), vec3(0.93, 0.97, 1.0), smoothstep(0.3, 0.8, c2));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), crack * 0.6);
      }`,
      fragOut: /* glsl */`{
        vec3 Vv = normalize(cameraPosition - vCWorld);
        float fres = pow(1.0 - clamp(Vv.y, 0.0, 1.0), 2.0);
        outgoingLight = mix(outgoingLight, uSkyHor, fres * 0.35);
        float sp = pow(max(dot(reflect(-Vv, vec3(0.0, 1.0, 0.0)), normalize(uSunDir)), 0.0), 60.0);
        outgoingLight += vec3(1.0, 0.97, 0.9) * sp * 0.6 * cCloud;
      }`,
      uniforms: { uSunDir: U.uSunDir, uSkyHor: U.uSkyHor },
      fragPars: 'uniform vec3 uSunDir; uniform vec3 uSkyHor;',
    });
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.name = 'ice'; m.renderOrder = 1;
    this.scene.add(m);
    return m;
  }
  buildSky() {
    const M = this.mood, fogC = new THREE.Color(M.fog?.color || '#cfe6ff');
    const u = this.skyU = {
      uTop: { value: new THREE.Color(M.sky?.top || '#8cc8ff') }, uHor: { value: new THREE.Color(M.sky?.horizon || fogC) }, uBot: { value: fogC.clone() },
      uSunCol: { value: new THREE.Color(M.sun?.color || '#fff4e0') }, uSunDirS: { value: this.sunDir }, uSunGlow: { value: M.sky?.glow ?? 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: u, depthWrite: false, fog: false, side: THREE.BackSide,
      vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform vec3 uTop, uHor, uBot, uSunCol, uSunDirS; uniform float uSunGlow; varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir); float y = d.y;
          vec3 c = mix(uHor, uTop, smoothstep(0.0, 0.55, y));
          c = mix(c, uBot, smoothstep(0.03, -0.1, y));
          float s = max(dot(d, normalize(uSunDirS)), 0.0);
          c += uSunCol * (pow(s, 5.0) * 0.22 + pow(s, 80.0) * 0.8) * uSunGlow * smoothstep(-0.08, 0.1, y);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const sky = this.sky = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 16), mat);
    sky.frustumCulled = false; sky.renderOrder = -10; sky.name = 'sky';
    this.scene.add(sky);
    this.buildHorizon();
  }
  // distant silhouettes (fog-tinted, unfogged) on rings round the map: layers from terrain.horizon, or two hill ranges
  buildHorizon() {
    const td = this.def.terrain || {}, M = this.mood;
    const fogC = new THREE.Color(M.fog?.color || '#cfe6ff'), hor = new THREE.Color(M.sky?.horizon || fogC);
    const layers = td.horizon?.layers || [{ r: 230, h: [18, 46], kind: 'mountains', color: hor.clone().lerp(new THREE.Color('#6a7a9a'), 0.3) }, { r: 175, h: [8, 20], kind: 'hills', color: hor.clone().lerp(new THREE.Color('#5a7a6a'), 0.42) }];
    if (!layers.length) return;
    const parts = [], N = 256, nz = new Noise(this.terrain.seed + 21);
    for (const [li, L] of layers.entries()) {
      const pos = [], col = [], idx = [], top = new THREE.Color(L.color), bot = fogC.clone().lerp(top, 0.15);
      for (let i = 0; i <= N; i++) {
        const a = i / N * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        let h;
        const u = Math.cos(a) * 3 + li * 7, v = Math.sin(a) * 3;
        if (L.kind === 'mountains') h = Math.pow(Math.max(0, nz.fbm(u * 0.9, v * 0.9, 4) * 0.5 + 0.55), 1.8);
        else if (L.kind === 'forest') h = 0.55 + nz.fbm(u * 5, v * 5, 3) * 0.3 + Math.abs(nz.n2(u * 14, v * 14)) * 0.25;
        else h = 0.5 + nz.fbm(u * 0.7, v * 0.7, 3) * 0.5;
        h = L.h[0] + (L.h[1] - L.h[0]) * clamp(h);
        if (L.gap) { let d = Math.abs(((a - L.gap[0] + Math.PI * 3) % (Math.PI * 2)) - Math.PI); const w = Math.abs(L.gap[1] - L.gap[0]) / 2; const c = (L.gap[0] + L.gap[1]) / 2; d = Math.abs(((a - c + Math.PI * 3) % (Math.PI * 2)) - Math.PI); h *= smoothstep(w * 0.8, w * 1.25, d); if (h < 1) h = -4; }
        const x = 56 + ca * L.r, z = 56 + sa * L.r;
        pos.push(x, -6, z, x, h, z);
        col.push(bot.r, bot.g, bot.b, top.r, top.g, top.b);
        if (i < N) { const b = i * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
      parts.push(g);
    }
    const g = parts.length > 1 ? mergeIndexed(parts) : parts[0];
    const m = this.horizon = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide, depthWrite: false }));
    m.renderOrder = -9; m.frustumCulled = false; m.name = 'horizon';
    this.scene.add(m);
  }
  buildGrass() {
    const T = this.terrain, gs = this.def.terrain?.grass || {}, W = T.water;
    const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat); white.needsUpdate = true;
    const m0 = this.mask0, MN = SIZE * MASK_RES;
    const allowAt = (x, z) => { const i = clamp(Math.floor(x * MASK_RES), 0, MN - 1), j = clamp(Math.floor(z * MASK_RES), 0, MN - 1); return m0[(j * MN + i) * 4 + 3] / 255; };
    const layers = [gs, ...(gs.extra || [])];
    for (const [li, L] of layers.entries()) {
      if (L.density === 0) continue;
      const minH = W ? W.level + 0.08 : -9;
      this.veg.buildGrass(this.quality, {
        colors: L.colors, tipMul: L.tipMul, tipAdd: L.tipAdd, frost: L.frost, density: L.density ?? 30, height: L.height, width: L.width,
        allow: L.allow ? (x, z) => allowAt(x, z) * L.allow(x, z, this.ctx) : allowAt,
        heightAt: (x, z) => this.heightAt(x, z), minH: L.minH ?? minH, tex: white, world: SIZE, bounds: L.bounds || [-14, -14, 126, 126], seed: 99 + li * 17,
      });
    }
  }

  // ------------------------------------------------------------------ populate ctx (docs/REGIONS.md §3.6)
  makeCtx() {
    const W = this, T = this.terrain, P = this.plan, veg = this.veg, rng = new RNG(T.seed * 13 + 7);
    const ctx = {
      world: W, def: this.def, layout: this.L, plan: P, terrain: T, quality: this.quality, scene: this.scene,
      rng, noise: this.noise, n2: (x, z) => this.noise.n2(x, z), fbm: (x, z, o = 4) => this.noise.fbm(x, z, o),
      THREE, V, clamp, lerp, smoothstep, mulberry32,
      get G() { return globalThis.G; },
      get vfx() { return W.vfx || null; },
      heightAt: (x, z) => W.heightAt(x, z), groundAt: (x, z) => T.gridHeight(x, z), slopeAt: (x, z) => T.slopeAt(x, z), normalAt: (x, z) => T.normalAt(x, z),
      surfaceAt: (x, z) => W.surfaceAt(x, z), waterAt: (x, z) => W.waterAt(x, z), walkable: (x, z) => W.walkable(x, z),
      openDist: (x, z) => T.openDist(x, z), trailDist: (x, z) => T.trailDist(x, z), pathDist: (x, z) => W.pathDist(x, z), play: (x, z, s) => T.play(x, z, s),
      isNearPath: (x, z, d = 2) => W.pathDist(x, z) < d,
      inArena: (x, z, pad = 0) => Math.hypot(x - P.arena.x, z - P.arena.z) < P.arena.r + pad,
      inStart: (x, z, pad = 0) => Math.hypot(x - P.start.x, z - P.start.z) < P.start.r + pad,
      inCamp: (x, z, pad = 0) => P.camps.some(c => Math.hypot(x - c.x, z - c.z) < c.r + pad),
      inPoi: (x, z, pad = 0) => P.pois.some(c => Math.hypot(x - c.x, z - c.z) < c.r + pad),
      inVillage: (x, z, pad = 0) => !!P.village && Math.hypot(x - P.village.x, z - P.village.z) < P.village.r + pad,
      onMap: (x, z, pad = 0) => x > pad && z > pad && x < SIZE - pad && z < SIZE - pad,
      isFree: (x, z, r = 0.5, o = {}) => W.isFree(x, z, r, o),
      canPlace: (x, z, r = 0.5, o = {}) => { if (!W.isFree(x, z, r, o)) return false; if (o.reserve !== false) W.reserve(x, z, o.space ?? r); return true; },
      reserve: (x, z, r) => W.reserve(x, z, r),
      /** a Vegetation batch (one BatchedMesh per material, wind/sway shaders); the same name returns the same batch */
      batch: (name, mat, opts) => veg.batches.find(b => b.name === name) || veg.batch(name, mat || VEG_MATS.rock(), opts),
      /** queue instances: variants [[geoPart0, geoPart1...]...], batches [Batch per part], placements [{ x, z, y?, rot, s, sy?, v, tint?, hue? }] */
      place: (variants, batches, placements, o = {}) => W.place(variants, batches, placements, o),
      mats: VEG_MATS, build: { ...VEG_BUILD, tree: buildTree, bamboo: buildBamboo, bush: buildBush, susuki: susukiGeo, rock: rockGeo, flower: flowerGeo }, TREE_SPECIES,
      /** CPU geometry cache across visits: memo('bamboo:0', () => buildBamboo(0)) */
      memo: (key, fn) => { const k = this.def.id + ':' + key; if (!MEMO.has(k)) MEMO.set(k, fn()); return MEMO.get(k); },
      addCollider: (x, z, r) => this.collision.addCircle(x, z, r),
      addRect: (x0, z0, x1, z1) => this.collision.addRect(x0, z0, x1, z1),
      blockCells: (x, z, r) => W.blockCells(x, z, r),
      addLight: (o) => W.addLight(o),
      addMesh: (m) => { this.scene.add(m); return m; },
      add: (m) => { this.scene.add(m); return m; },
      /** merged static prop built with the buildings kit Builder: prop(B => { B.add(geo, color); B.glow(...); B.light([x,y,z]) }, { x, z, y?, rot, s, collide, occluder }) */
      prop: (fn, o) => W.prop(fn, o),
      /** painted geometry (vertex colours) merged into the static chunks: addStatic(geo, { x, z, y?, rot, s, mat: 'body'|'bodyOcc'|'glow'|'hot'|'cloth'|'leaf'|'water' }) */
      addStatic: (geo, o) => W.addStatic(geo, o),
      addPool: (o) => W.addPool(o),
      addDeck: (o) => W.addDeck(o),
      addIce: (o) => W.addIce(o),
      /** paint a terrain surface layer (trail, dirt, sand, grass, moss, litter, snow, accent) before the textures upload */
      paint: (layer, x, z, r, v = 1, soft = 0.5) => paintMask(this.mask0, this.mask1, layer, x, z, r, v, soft),
      /** paint the weather mask (canopy: leaf fall, shade: fireflies / motes, wet, custom) */
      paintFx: (layer, x, z, r, v = 1) => W.paintFx(layer, x, z, r, v),
      arenaLanterns: this.arenaLanterns,
      onDispose: (fn) => this.disposers.push(fn),
      smoke: [],
    };
    return ctx;
  }
  fxCtx() {
    const W = this;
    // (defineProperties, not Object.assign: the populate ctx's vfx / G are getters, and assigning over an inherited
    // getter throws)
    return Object.defineProperties(Object.create(this.ctx), {
      fx: { value: this.weather }, weather: { value: this.weather }, critters: { value: this.critters }, CRITTER_MODELS: { value: CRITTER_MODELS },
      vfx: { get: () => W.vfx || null }, G: { get: () => globalThis.G },
    });
  }
  // occupancy (0.5 m cells over [-50, 162])
  _occ(x, z) { const i = Math.floor((x + 50) * 2), j = Math.floor((z + 50) * 2); return (i < 0 || j < 0 || i >= 424 || j >= 424) ? -1 : j * 424 + i; }
  isFree(x, z, r = 0.5, o = {}) {
    const P = this.plan, T = this.terrain;
    if (x < -48 || z < -48 || x > 160 || z > 160) return false;
    const inMap = x > -1 && z > -1 && x < SIZE + 1 && z < SIZE + 1;
    if (inMap) {
      if (o.path !== 0 && this.pathDist(x, z) < (o.path ?? P.trailW + 0.9) + r) return false;
      if (!o.clearings && (Math.hypot(x - P.arena.x, z - P.arena.z) < P.arena.r + (o.arena ?? 0.5) + r || Math.hypot(x - P.start.x, z - P.start.z) < P.start.r + r ||
        P.camps.some(c => Math.hypot(x - c.x, z - c.z) < c.r + r) || P.pois.some(c => Math.hypot(x - c.x, z - c.z) < c.r + r))) return false;
      if (o.lanes && T.openDist(x, z) < r + (o.lanes === true ? 0 : o.lanes)) return false;
      // the zone village's clearing (src/regions/village) keeps the wild out, clearings or not; the village's own pieces pass o.village
      if (!o.village && P.village && Math.hypot(x - P.village.x, z - P.village.z) < P.village.r + r + (r >= 0.6 ? P.village.clear || 0 : 0)) return false; // (clear: a ring the village's land keeps free of the wild's trees)
      if (o.walkable && !this.walkable(x, z)) return false;
    } else if (o.inside) return false;
    if (!o.water && this.waterAt(x, z) > 0.04) return false;
    if (o.maxSlope != null && T.slopeAt(x, z) > o.maxSlope) return false;
    if (o.minH != null && this.heightAt(x, z) < o.minH) return false;
    if (o.maxH != null && this.heightAt(x, z) > o.maxH) return false;
    const sp = o.space ?? r, n = Math.ceil(sp * 2);
    for (let dj = -n; dj <= n; dj++) for (let di = -n; di <= n; di++) {
      if ((di * di + dj * dj) * 0.25 > sp * sp) continue;
      const k = this._occ(x + di * 0.5, z + dj * 0.5); if (k >= 0 && this.taken[k]) return false;
    }
    return true;
  }
  reserve(x, z, r = 0.5) {
    const n = Math.ceil(r * 2);
    for (let dj = -n; dj <= n; dj++) for (let di = -n; di <= n; di++) { if ((di * di + dj * dj) * 0.25 > r * r) continue; const k = this._occ(x + di * 0.5, z + dj * 0.5); if (k >= 0) this.taken[k] = 1; }
  }
  place(variants, batches, placements, o = {}) {
    for (const p of placements) { if (p.y == null) p.y = this.heightAt(p.x, p.z) + (o.sink ?? 0); if (p.rot == null) p.rot = Math.random() * Math.PI * 2; if (p.s == null) p.s = 1; if (p.v == null) p.v = 0; }
    this.veg._place(variants, batches, placements, { kind: o.kind || 'prop', collide: o.collide || 0 });
    // leaf fall / shade for the weather kit under canopies
    const kind = o.kind;
    if (kind && (TREE_SPECIES[kind] || kind === 'bamboo' || o.canopy)) for (const p of placements) { const r = (o.canopy ?? (kind === 'bamboo' ? 2.2 : 3.4)) * p.s; this.paintFx('canopy', p.x, p.z, r, 1); this.paintFx('shade', p.x, p.z, r * 1.3, 0.8); }
  }
  blockCells(x, z, r) {
    const L = this.L, W = L.W, H = L.H;
    for (let cy = Math.floor((z - r) / RCELL); cy <= Math.floor((z + r) / RCELL); cy++) for (let cx = Math.floor((x - r) / RCELL); cx <= Math.floor((x + r) / RCELL); cx++) {
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
      if (Math.hypot((cx + 0.5) * RCELL - x, (cy + 0.5) * RCELL - z) > r) continue;
      if (L.spawns.some(s => s.x === cx && s.y === cy) || (L.start.x === cx && L.start.y === cy)) continue; // never wall in a spawn / the arrival
      L.grid[cy * W + cx] = 0;
    }
  }
  addLight(o) {
    const src = { pos: o.pos?.isVector3 ? o.pos.clone() : V(...(o.pos || [0, 1, 0])), color: new THREE.Color(o.color || '#ffc880'), intensity: o.intensity ?? 3, radius: o.radius ?? 6, flicker: o.flicker ?? 0, nightOnly: !!o.nightOnly, priority: o.priority || 0 };
    return this.lightPool.addSource(src);
  }
  paintFx(layer, x, z, r, v = 1) {
    const c = { canopy: 0, shade: 1, wet: 2, custom: 3 }[layer]; if (c == null) return;
    const F = this.fxMask;
    for (let j = Math.max(0, Math.floor(z - r)); j <= Math.min(FXN - 1, Math.ceil(z + r)); j++) for (let i = Math.max(0, Math.floor(x - r)); i <= Math.min(FXN - 1, Math.ceil(x + r)); i++) {
      const d = Math.hypot(i + 0.5 - x, j + 0.5 - z) / r; if (d > 1) continue;
      const k = (j * FXN + i) * 4 + c; F[k] = Math.max(F[k], (1 - d * d) * v * 255);
    }
    this.fxMaskTex.needsUpdate = true;
  }
  prop(fn, o = {}) {
    const B = new Builder(o.seed ?? ((o.x * 131 + o.z * 17) | 0));
    if (o.warp != null) B.warpAmt = o.warp;
    fn(B);
    const tpl = B.finish();
    const m = new THREE.Matrix4().compose(V(o.x, o.y ?? this.heightAt(o.x, o.z), o.z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), o.rot || 0), V(1, 1, 1).multiplyScalar(o.s || 1));
    const kind = k => (k === 'body' && o.occluder ? 'bodyOcc' : k);
    for (const k of Object.keys(tpl.geos)) { const g = tpl.geos[k]; g.applyMatrix4(m); this.props.add(g, kind(k)); }
    for (const a of tpl.anims) for (const k of Object.keys(a.geos)) { const g = a.geos[k]; g.translate(a.pivot.x, a.pivot.y, a.pivot.z); g.applyMatrix4(m); this.props.add(g, kind(k)); }
    const lights = tpl.lights.map(l => this.addLight({ ...l, pos: l.pos.clone().applyMatrix4(m) }));
    const smoke = tpl.smoke.map(p => p.clone().applyMatrix4(m));
    this.ctx.smoke.push(...smoke);
    if (o.collide) this.collision.addCircle(o.x, o.z, o.collide * (o.s || 1));
    return { lights, smoke, matrix: m };
  }
  addStatic(geo, o = {}) {
    const g = geo.clone();
    if (o.x != null) g.applyMatrix4(new THREE.Matrix4().compose(V(o.x, o.y ?? this.heightAt(o.x, o.z), o.z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), o.rot || 0), V(1, 1, 1).multiplyScalar(o.s || 1)));
    this.props.add(g, o.mat || 'body');
    if (o.collide) this.collision.addCircle(o.x, o.z, o.collide * (o.s || 1));
    return g;
  }
  /** a local water body { x, z, r, level, deep, shallow, foam }: its own water surface; deep cells blocked for monsters */
  addPool(o) {
    const T = this.terrain, p = { x: o.x, z: o.z, r: o.r, level: o.level ?? 0 };
    this.pools.push(p);
    const w = makeWater({ heightTex: this.heightTex, worldSize: T.hSize, origin: [T.hOrigin, T.hOrigin], size: o.r * 2 + 1, level: p.level, center: [o.x, o.z], deep: o.deep || '#3a9ab0', shallow: o.shallow || '#7ad8d0', foam: o.foam || '#ffffff' });
    this.scene.add(w); p.mesh = w;
    const wade = T.water?.wade ?? 0.35;
    for (let z = Math.floor(o.z - o.r); z <= o.z + o.r; z += 1) for (let x = Math.floor(o.x - o.r); x <= o.x + o.r; x += 1) if (this.waterAt(x, z) > wade + 0.1) this.blockCells(x, z, 0.1);
    return p;
  }
  /** a walkable strip over water / gaps: { pts: [[x, z]...], y (number or per-point array), w } */
  addDeck(o) {
    const pts = o.pts, w = o.w ?? 1.4, ys = Array.isArray(o.y) ? o.y : pts.map(() => o.y ?? 0.3), made = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], ya = ys[i], yb = ys[i + 1], vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1;
      const tAt = (x, z) => clamp(((x - ax) * vx + (z - az) * vz) / l2);
      const d = { x0: Math.min(ax, bx) - w / 2, z0: Math.min(az, bz) - w / 2, x1: Math.max(ax, bx) + w / 2, z1: Math.max(az, bz) + w / 2,
        test: (x, z) => { const t = tAt(x, z); return Math.hypot(x - ax - vx * t, z - az - vz * t) <= w / 2; }, h: (x, z) => lerp(ya, yb, tAt(x, z)) };
      this.decks.push(d); made.push(d);
    }
    return made;
  }

  // ------------------------------------------------------------------ contract
  deckAt(x, z) { for (const d of this.decks) if (x > d.x0 && x < d.x1 && z > d.z0 && z < d.z1 && (!d.test || d.test(x, z))) return d; return null; }
  heightAt(x, z) {
    if (this.decks.length) { const d = this.deckAt(x, z); if (d) return d.h(x, z); }
    const T = this.terrain, h = T.gridHeight(x, z), W = T.water;
    // frozen water: stand on the ice sheet (addIce draws it at level + 0.015), not on the pond bed under it
    if (W?.frozen.length && h < W.level + 0.015 && T.iceAt(x, z)) return W.level + 0.015;
    return h;
  }
  walkable(x, z) {
    if (this.decks.length && this.deckAt(x, z)) return true;
    if (!this.terrain.walkable(x, z)) return false;
    if (this.pools.length) { const T = this.terrain; if (this.waterAt(x, z) > (T.water?.wade ?? 0.35)) return false; }
    return true;
  }
  /** water depth in metres (0 on dry land and on ice): region water + local pools */
  waterAt(x, z) {
    let d = this.terrain.waterAt(x, z);
    if (this.pools.length) { const h = this.terrain.gridHeight(x, z); for (const p of this.pools) if ((x - p.x) ** 2 + (z - p.z) ** 2 < p.r * p.r) d = Math.max(d, p.level - h); }
    return d;
  }
  /** unit { x, z } toward open (region) water from (x, z), or null */
  shoreDir(x, z, R) { return this.terrain.shoreDir(x, z, R); }
  pathDist(x, z) { return this.terrain.pathDist(x, z); }
  surfaceAt(x, z) {
    const MN = SIZE * MASK_RES, i = clamp(Math.floor(x * MASK_RES), 0, MN - 1), j = clamp(Math.floor(z * MASK_RES), 0, MN - 1), k = (j * MN + i) * 4, a = this.mask0, b = this.mask1;
    return { trail: a[k] / 255, dirt: a[k + 1] / 255, sand: a[k + 2] / 255, grass: a[k + 3] / 255, moss: b[k] / 255, litter: b[k + 1] / 255, snow: b[k + 2] / 255, accent: b[k + 3] / 255, water: this.waterAt(x, z) };
  }
  cellToWorld(cx, cy) { const x = (cx + 0.5) * RCELL, z = (cy + 0.5) * RCELL; return V(x, this.heightAt(x, z), z); }
  /** the minimap colour at (x, z) */
  mapColor(x, z) {
    const hc = this.L.hooks?.mapColor?.(x, z); if (hc) return hc; // (the zone village's roofs and square)
    const T = this.terrain, P = T.palette, W = T.water, d = this.waterAt(x, z);
    if (d > 0.04) return d > 0.6 ? (W?.deep || '#3a8ac8') : (W?.shallow || '#6ad0d8');
    if (T.iceAt?.(x, z)) return '#dcefff';
    if (T.slopeAt(x, z) > (this.def.terrain?.shader?.rockSlope ?? 0.34) + 0.08) return hexMix(P.rock[0], '#8a8090', 0.25);
    const s = this.surfaceAt(x, z);
    if (s.trail > 0.45) return hexMix(P.trail.stone[0], '#ffffff', 0.1);
    if (s.snow > 0.5) return P.snow[0];
    if (s.sand > 0.5) return P.sand[0];
    if (s.dirt > 0.5) return P.dirt[1];
    if (s.moss > 0.5) return hexMix(P.moss[0], P.grass[1], 0.4);
    if (s.litter > 0.5) return hexMix(P.litter[0], P.grass[1], 0.5);
    return hexMix(P.grass[1], P.grass[0], 0.4 + 0.3 * (this.noise.n2(x * 0.08, z * 0.08) * 0.5 + 0.5));
  }
  /** spots for auto-placed FX: 'shaft' (open lanes), 'mist' (hollows just off the lanes) */
  autoSpots(n, kind) {
    const T = this.terrain, out = [], rng = new RNG(T.seed * 7 + (kind === 'mist' ? 3 : 1));
    for (let k = 0; k < 600 && out.length < n; k++) {
      const x = rng.range(6, SIZE - 6), z = rng.range(6, SIZE - 6), od = T.openDist(x, z);
      if (kind === 'shaft' ? od > -0.5 : (od < 1 || od > 12)) continue;
      if (Math.hypot(x - this.plan.arena.x, z - this.plan.arena.z) < this.plan.arena.r + 2 || this.waterAt(x, z) > 0.05) continue;
      if (out.some(p => Math.hypot(p.x - x, p.z - z) < (kind === 'shaft' ? 7 : 9))) continue;
      out.push(kind === 'shaft' ? { x, z, w: rng.range(1.6, 3.2), len: rng.range(9, 14) } : { x, z, r: rng.range(5, 8) });
    }
    return out;
  }

  // ------------------------------------------------------------------ mood / sun / frame
  /** sky, fog, lights, global uniforms, grade and bloom for this biome (on entry; bosses call it to restore after taking over fog / grade) */
  applyMood(G) {
    const M = this.mood, post = (G?.engine || this.engine).post, gd = M.grade || {};
    const fog = M.fog || { color: '#cfe6ff', near: 40, far: 120 };
    const sf = this.scene.fog; sf.color.set(fog.color); sf.near = fog.near; sf.far = fog.far;
    this.scene.background.set(fog.color);
    if (this.skyU) { this.skyU.uBot.value.set(fog.color); this.skyU.uHor.value.set(M.sky?.horizon || fog.color); this.skyU.uTop.value.set(M.sky?.top || '#8cc8ff'); }
    this.hemi.color.set(M.hemi?.sky || '#cfe8ff'); this.hemi.groundColor.set(M.hemi?.ground || '#8a8a6a'); this.hemi.intensity = M.hemi?.intensity ?? 1.2;
    this.sun.color.set(M.sun?.color || '#fff4e0'); this.sun.intensity = M.sun?.intensity ?? 2.6;
    this.sunDir.set(...(M.sun?.dir || [0.4, 0.8, 0.4])).normalize();
    U.uSunDir.value.copy(this.sunDir);
    U.uSkyHor.value.set(M.sky?.horizon || fog.color);
    U.uNight.value = M.night ?? 0;
    if (M.rim) U.uRimColor.value.set(M.rim);
    U.uCloudShadow.value = M.clouds ?? 0.22;
    if (M.shadowTint) U.uShadowTint.value.set(M.shadowTint);
    this.windBase = V(...(M.wind?.dir ? [M.wind.dir[0], 0, M.wind.dir[1]] : [0.8, 0, 0.6])).normalize();
    this.windStr = M.wind?.strength ?? 0.8;
    U.uWindDir.value.set(this.windBase.x, this.windBase.z); U.uWindStr.value = this.windStr;
    if (post) {
      const gr = post.grade.uniforms;
      gr.get('uLift').value.set(...(gd.lift || [0.01, 0.01, 0.01])); gr.get('uGain').value.set(...(gd.gain || [1, 1, 1]));
      gr.get('uSat').value = gd.sat ?? 1.05;
      gr.get('uVignette').value = gd.vignette ?? 1.0; gr.get('uVigColor').value.set(...(gd.vigColor || [0.2, 0.15, 0.2]));
      if (gr.get('uContrast') && gd.contrast != null) gr.get('uContrast').value = gd.contrast;
      post.bloom.intensity = M.bloom?.intensity ?? 0.9; post.bloom.luminanceMaterial.threshold = M.bloom?.threshold ?? 0.75;
    }
  }
  // keep the shadow frustum centred on the camera focus, snapped to texels to avoid shimmer (as the village)
  updateSun(focus) {
    const sun = this.sun, sd = this.sunDir, texel = 68 / sun.shadow.mapSize.x;
    const lm = this._lm ||= new THREE.Matrix4(), inv = this._inv ||= new THREE.Matrix4(), f = this._snap ||= V(0, 0, 0);
    lm.lookAt(V(0, 0, 0), this._nd ? this._nd.copy(sd).negate() : (this._nd = sd.clone().negate()), V(0, 1, 0));
    inv.copy(lm).invert();
    f.copy(focus).applyMatrix4(inv); f.x = Math.round(f.x / texel) * texel; f.y = Math.round(f.y / texel) * texel; f.applyMatrix4(lm);
    sun.target.position.copy(f); sun.position.copy(f).addScaledVector(sd, 80); sun.target.updateMatrixWorld();
    U.uSunDir.value.copy(sd);
  }
  update(dt, t, vfx, focus) {
    if (vfx) this.vfx = vfx;
    if (this.warmMeshes.length && ++this.warm > 3) { for (const m of this.warmMeshes) { if (m.isBatchedMesh) m.perObjectFrustumCulled = true; else m.frustumCulled = true; } this.warmMeshes.length = 0; }
    // wind: gusts that swell and fade round the biome's base direction; clouds drift with it
    this.gustT = (this.gustT ?? 3) - dt;
    if (this.gustT <= 0) { this.gustT = rand(5, 11); this.gustTarget = this.windStr * rand(1.4, 2.1); this.gustLife = rand(2.5, 4.5); }
    if (this.gustLife > 0) this.gustLife -= dt; else this.gustTarget = this.windStr;
    this.wind = (this.wind ?? this.windStr ?? 0.8) + ((this.gustTarget ?? this.windStr) - (this.wind ?? 0.8)) * Math.min(1, dt * 0.8);
    U.uWindStr.value = this.wind;
    const wa = Math.atan2(this.windBase?.z ?? 0.6, this.windBase?.x ?? 0.8) + Math.sin(t * 0.021) * 0.25 + Math.sin(t * 0.0073) * 0.15;
    U.uWindDir.value.set(Math.cos(wa), Math.sin(wa));
    U.uCloudOffset.value.x += U.uWindDir.value.x * dt * 0.0035 * (0.6 + this.wind * 0.4);
    U.uCloudOffset.value.y += U.uWindDir.value.y * dt * 0.0035 * (0.6 + this.wind * 0.4);
    const cam = this.engine.camera, box = this.engine.rig?.target || focus;
    this.sky.position.copy(cam.position); this.sky.updateMatrixWorld();
    this.weather.update(dt, t, box);
    this.critters.update(dt, t, box, focus);
    if (this.effects?.update) { try { this.effects.update(dt, t, focus); } catch (e) { if (!this._fxErr) { this._fxErr = true; console.error('[region] effects.update failed', e); } } }
  }
  dispose() {
    try { this.effects?.dispose?.(); } catch (e) { console.warn('[region] effects.dispose failed', e); }
    for (const f of this.disposers) { try { f(); } catch (e) { console.warn('[region] onDispose failed', e); } }
    this.weather.dispose(); this.critters.dispose();
    this.fxMaskTex.dispose(); // (only the weather fields sample it: the scene teardown never reaches it)
    for (const b of this.veg.batches) { b.mesh?.dispose?.(); b.items = null; }
    this.lightPool.clear?.();
    this.collision.map.clear();
    // global uniforms the mood changed that the village doesn't reset itself
    U.uCloudShadow.value = this._saved.cloud; U.uShadowTint.value.copy(this._saved.tint);
    const gc = this.engine.post?.grade?.uniforms?.get('uContrast'); if (gc && this._saved.contrast != null) gc.value = this._saved.contrast;
    this.disposers.length = 0;
  }
}

// ------------------------------------------------------------------ merged static props (the buildings-kit look)
// Region-owned material copies of the kit's shared set (same shader code, so the same compiled programs; the kit's
// singleton materials must not be disposed with a region's scene).
const GLOW_FRAG = /* glsl */`
  totalEmissiveRadiance *= mix(vec3(1.0), vColor.rgb * 1.6, vGl.y)
    * (1.0 + vGl.x * (sin(uTime * 8.3 + vCWorld.x * 2.1 + vCWorld.z * 1.7) * 0.09 + sin(uTime * 19.0 + vCWorld.y * 7.0) * 0.05));
`;
function propMats(night) {
  const glow = (e, i) => makeToon({ vertexColors: true, emissive: e, emissiveIntensity: i, brush: 0.06, rim: 0.12, term: [-0.2, 0.4], vertexPars: 'varying vec2 vGl;', vertexWorld: 'vGl = uv;', fragPars: 'varying vec2 vGl;', fragColor: GLOW_FRAG });
  return {
    body: makeToon({ vertexColors: true, brush: 0.15, brushScale: 0.5, rim: 0.34, term: [-0.06, 0.34], shadowSat: 0.35 }),
    bodyOcc: makeToon({ vertexColors: true, brush: 0.15, brushScale: 0.5, rim: 0.34, term: [-0.06, 0.34], shadowSat: 0.35, occluder: true }),
    glow: glow('#ffcf7a', lerp(0.06, 2.1, night)),
    hot: glow('#ffffff', lerp(1.5, 2.2, night)),
    cloth: makeToon({ vertexColors: true, wind: 'cloth', windAmt: 0.5, side: THREE.DoubleSide, brush: 0.12, rim: 0.3 }),
    leaf: makeToon({ vertexColors: true, wind: 'leaf', windAmt: 0.45, brush: 0.22, brushScale: 0.8, rim: 0.55, shadowSat: 0.5, term: [-0.15, 0.4] }),
    water: makeToon({ vertexColors: true, rim: 0.55, brush: 0.04, term: [-0.3, 0.5], shadowSat: 0.2 }),
  };
}
class PropChunks {
  constructor(world, size = 24) { this.world = world; this.size = size; this.lists = new Map(); this.meshes = []; }
  add(g, mat = 'body') {
    g.computeBoundingSphere?.();
    const c = g.boundingSphere?.center || V(0, 0, 0), key = mat + ':' + Math.floor(c.x / this.size) + ',' + Math.floor(c.z / this.size);
    let l = this.lists.get(key); if (!l) this.lists.set(key, l = { mat, geos: [] });
    l.geos.push(g);
  }
  build(scene) {
    if (!this.lists.size) return;
    const mats = this.mats = propMats(this.world.mood.night ?? 0);
    for (const { mat, geos } of this.lists.values()) {
      const g = merge(geos); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mats[mat] || mats.body);
      m.castShadow = mat !== 'water' && mat !== 'hot'; m.receiveShadow = true; m.name = 'prop:' + mat;
      if (mat === 'cloth' || mat === 'leaf') applyDepth(m);
      scene.add(m); this.meshes.push(m);
      for (const q of geos) q.dispose();
    }
    this.lists.clear();
  }
}

// a fallback populate for recipes that don't have one yet: rocks and a few trees in the wild, bushes by the trail
export function defaultPopulate(ctx) {
  const { rng } = ctx;
  const rocks = [0, 1, 2, 3].map(v => [ctx.memo('rock' + v, () => rockGeo(v * 11 + 3))]);
  const rockB = ctx.batch('rock', ctx.mats.rock(), { sort: false }), pl = [];
  for (let i = 0; i < 260; i++) { const x = rng.range(-20, 132), z = rng.range(-20, 132); if (ctx.canPlace(x, z, 0.9)) pl.push({ x, z, y: ctx.heightAt(x, z) - 0.1, rot: rng.range(0, 6.28), s: rng.range(0.6, 1.6), sy: rng.range(0.8, 1.2), v: rng.int(0, 3) }); }
  ctx.place(rocks, [rockB], pl, { kind: 'rock', collide: 0.45 });
  const bark = ctx.batch('bark', ctx.mats.bark()), fol = ctx.batch('foliage', ctx.mats.foliage()), cards = ctx.batch('cards:round', ctx.mats.cards('round'), { castShadow: false });
  const vars = [1, 2, 3].map(v => { const t = ctx.memo('round' + v, () => buildTree('round', v)); return [t.trunkGeo, t.foliage, t.cardGeo]; });
  const tp = [];
  for (let i = 0; i < 900 && tp.length < 90; i++) { const x = rng.range(-30, 142), z = rng.range(-30, 142); if (ctx.openDist(x, z) < 3) continue; if (ctx.canPlace(x, z, 1.2, { space: 2.4 })) tp.push({ x, z, rot: rng.range(0, 6.28), s: rng.range(0.85, 1.25), v: rng.int(0, 2) }); }
  ctx.place(vars, [bark, fol, cards], tp, { kind: 'round', collide: 0.4 });
}

function mergeIndexed(list) {
  let nv = 0, ni = 0; for (const g of list) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), idx = new Uint32Array(ni); let o = 0, oi = 0;
  for (const g of list) { pos.set(g.attributes.position.array, o * 3); col.set(g.attributes.color.array, o * 3); const I = g.index.array; for (let i = 0; i < I.length; i++) idx[oi++] = I[i] + o; o += g.attributes.position.count; g.dispose(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}
const _ca = new THREE.Color(), _cb = new THREE.Color();
function hexMix(a, b, t) { return '#' + _ca.set(a).lerp(_cb.set(b), t).getHexString(); }
