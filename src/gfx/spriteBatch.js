// Instanced glow sprites (ROADMAP Z-B5): a projectile's glow (fireballs, foxfire, sparks, the balls' halos) used to be a
// THREE.Sprite each — a draw call per projectile, twice with the AO pass's transparency render — and a 150-monster
// fight keeps dozens in the air. Sprites that blend additively without writing depth are drawn here instead, one
// instanced draw per (texture, blend, depth test, fog) per scene: their sum doesn't depend on draw order, and the vertex
// and fragment code below is three's sprite shader (r186) with the sprite's matrix / colour / opacity / rotation per
// instance, so every pixel comes out the same.
//
// adoptSprites(root, scene) after adding a look to a scene; the sprites stay where they are in the graph (their parents
// move them, their `visible` still counts) but move to a layer no camera draws. A sprite that leaves the scene leaves
// the batch on the next frame. `?nosprites` turns it off.
import * as THREE from 'three';

const QS = typeof location !== 'undefined' ? location.search : '';
const OFF = /[?&]nosprites\b/.test(QS);
const HIDDEN_LAYER = 31;
const BATCHES = new WeakMap(); // scene → SpriteBatches
const _v = new THREE.Vector3(), _cam = new THREE.Vector3(), _fwd = new THREE.Vector3();

const VS = /* glsl */`
attribute vec3 iPos; attribute vec2 iScale; attribute vec4 iCol; attribute float iRot;
uniform mat3 uMapM;
varying vec2 vUv; varying vec4 vCol;
#include <common>
#include <fog_pars_vertex>
void main() {
  vUv = ( uMapM * vec3( uv, 1.0 ) ).xy;
  vCol = iCol;
  vec4 mvPosition = viewMatrix * vec4( iPos, 1.0 );
  vec2 alignedPosition = position.xy * iScale;
  vec2 rotatedPosition;
  rotatedPosition.x = cos( iRot ) * alignedPosition.x - sin( iRot ) * alignedPosition.y;
  rotatedPosition.y = sin( iRot ) * alignedPosition.x + cos( iRot ) * alignedPosition.y;
  mvPosition.xy += rotatedPosition;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FS = /* glsl */`
uniform sampler2D uMap;
varying vec2 vUv; varying vec4 vCol;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec4 diffuseColor = vCol;
  diffuseColor *= texture2D( uMap, vUv );
  vec3 outgoingLight = diffuseColor.rgb;
  #include <opaque_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const ok = s => s.isSprite && s.material?.isSpriteMaterial && s.material.map && s.material.transparent && !s.material.alphaMap && !s.material.alphaTest &&
  s.material.blending === THREE.AdditiveBlending && !s.material.depthWrite && s.material.sizeAttenuation !== false &&
  s.center.x === 0.5 && s.center.y === 0.5;

class Batch {
  constructor(H, m) {
    this.H = H; this.n = 0; this.cap = 0; this.im = null;
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: null }, uMapM: { value: new THREE.Matrix3() } }]),
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, depthTest: m.depthTest, blending: m.blending, fog: m.fog, toneMapped: m.toneMapped,
    });
    this.mat.uniforms.uMap.value = m.map;
    this.map = m.map;
    this.grow(32);
  }
  grow(cap) {
    const g = new THREE.InstancedBufferGeometry(), q = new THREE.PlaneGeometry(1, 1);
    g.index = q.index; g.attributes.position = q.attributes.position; g.attributes.uv = q.attributes.uv;
    const A = this.attrs = [['iPos', 3], ['iScale', 2], ['iCol', 4], ['iRot', 1]].map(([k, s]) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * s), s); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, a); return a; });
    [this.aPos, this.aScale, this.aCol, this.aRot] = A;
    g.instanceCount = 0;
    const im = new THREE.Mesh(g, this.mat); im.frustumCulled = false; im.name = 'sprites';
    if (this.im) { this.im.removeFromParent(); this.im.geometry.dispose(); } // (its buffers are its own)
    this.im = im; this.cap = cap; this.H.scene.add(im);
  }
}

// one sprite's instance (position, size from its matrix, colour × opacity, rotation) into batch b
function write(b, s) {
  if (b.n >= b.cap) { const old = b.attrs.map(a => a.array); b.grow(b.cap * 2); b.attrs.forEach((a, k) => a.array.set(old[k])); }
  const m = s.material, i3 = b.n * 3, e = s.matrixWorld.elements;
  b.aPos.array[i3] = e[12]; b.aPos.array[i3 + 1] = e[13]; b.aPos.array[i3 + 2] = e[14];
  b.aScale.array[b.n * 2] = Math.hypot(e[0], e[1], e[2]); b.aScale.array[b.n * 2 + 1] = Math.hypot(e[4], e[5], e[6]);
  const c = m.color, i4 = b.n * 4; b.aCol.array[i4] = c.r; b.aCol.array[i4 + 1] = c.g; b.aCol.array[i4 + 2] = c.b; b.aCol.array[i4 + 3] = m.opacity;
  b.aRot.array[b.n] = m.rotation || 0;
  b.n++;
}
function upload(b) {
  const g = b.im.geometry; g.instanceCount = b.n; b.im.visible = b.n > 0;
  if (b.map.matrixAutoUpdate) b.map.updateMatrix();
  b.mat.uniforms.uMapM.value.copy(b.map.matrix);
  if (b.n) for (const a of b.attrs) { a.clearUpdateRanges(); a.addUpdateRange(0, b.n * a.itemSize); a.needsUpdate = true; }
}
const emoteOk = s => s.isSprite && s.material?.isSpriteMaterial && s.material.map && s.material.transparent && !s.material.depthWrite && !s.material.alphaMap && !s.material.alphaTest && s.material.sizeAttenuation !== false && s.center.x === 0.5 && s.center.y === 0.5;
const MAX_RUNS = 800; // (run offsets stay under +0.8 of the sprites' render order)

class SpriteBatches {
  constructor(scene) {
    this.scene = scene; this.list = []; this.batches = new Map(); this.sprites = [];
    this.emotes = []; this.runs = new Map(); this.used = new Map(); this.vis = [];
    const prev = scene.onBeforeRender;
    scene.onBeforeRender = (r, s, cam, rt) => { prev?.call(s, r, s, cam, rt); if (s.matrixWorldAutoUpdate !== false) this.sync(cam); };
  }
  batchFor(m) {
    const key = `${m.map.uuid}|${m.blending}|${+m.depthTest}|${+m.fog}|${+m.toneMapped}`;
    let b = this.batches.get(key);
    if (!b) { b = new Batch(this, m); this.batches.set(key, b); this.list.push(b); }
    return b;
  }
  adopt(root) {
    root.traverse(o => { if (ok(o) && !o._sb) { o._sb = this.batchFor(o.material); o.layers.set(HIDDEN_LAYER); this.sprites.push(o); } });
  }
  adoptSorted(s) { if (emoteOk(s) && !s._eb) { s._eb = true; s.layers.set(HIDDEN_LAYER); this.emotes.push(s); } }
  // Normal-blended bubbles: three draws them one by one by render order, then far to near, then creation. They are sorted
  // the same way here, and each stretch of one texture becomes one instanced draw whose render order is the sprites' +
  // run / 1000 — so the bubbles still come out in exactly that order, one draw per run instead of one per bubble.
  syncSorted() {
    const E = this.emotes, vis = this.vis; let w = 0; vis.length = 0;
    for (let i = 0; i < E.length; i++) {
      const s = E[i];
      let top = s, shown = true; for (; top.parent; top = top.parent) if (!top.visible) shown = false;
      if (top !== this.scene) { s._eb = false; s.layers.set(0); continue; }
      E[w++] = s;
      if (!shown || !s.visible) continue;
      const e = s.matrixWorld.elements; s._hz = (e[12] - _cam.x) * _fwd.x + (e[13] - _cam.y) * _fwd.y + (e[14] - _cam.z) * _fwd.z;
      vis.push(s);
    }
    E.length = w;
    vis.sort((a, b) => (a.renderOrder - b.renderOrder) || (b._hz - a._hz) || (a.id - b.id));
    const used = this.used; used.clear();
    let run = -1, cur = null, key = null, base = null;
    for (const s of vis) {
      const m = s.material, k = `${m.map.uuid}|${m.blending}|${+m.depthTest}|${+m.fog}|${+m.toneMapped}`;
      if (k !== key || s.renderOrder !== base) {
        if (run < MAX_RUNS - 1 || !cur) {
          run++; key = k; base = s.renderOrder;
          let pool = this.runs.get(k); if (!pool) this.runs.set(k, pool = []);
          const idx = used.get(k) || 0; used.set(k, idx + 1);
          cur = pool[idx] ||= new Batch(this, m);
          cur.n = 0; cur.im.renderOrder = s.renderOrder + run * 0.001;
        }
      }
      write(cur, s);
    }
    for (const [k, pool] of this.runs) { const n = used.get(k) || 0; for (let i = 0; i < pool.length; i++) { if (i >= n) pool[i].n = 0; upload(pool[i]); } }
  }
  sync(cam) {
    if (cam) { _cam.setFromMatrixPosition(cam.matrixWorld); cam.getWorldDirection(_fwd); }
    for (const b of this.list) b.n = 0;
    let w = 0, cx = 0, cy = 0, cz = 0, nn = 0;
    const S = this.sprites;
    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      let top = s, shown = true; for (; top.parent; top = top.parent) if (!top.visible) shown = false;
      if (top !== this.scene) { s._sb = null; s.layers.set(0); continue; } // (left the scene: out of the batch)
      S[w++] = s;
      if (!shown || !s.visible) continue;
      const e = s.matrixWorld.elements;
      write(s._sb, s); cx += e[12]; cy += e[13]; cz += e[14]; nn++;
    }
    S.length = w;
    for (const b of this.list) {
      upload(b);
      // (sorted among the other transparent objects at the sprites' centre, as the sprites themselves were)
      if (nn) { b.im.position.set(cx / nn, cy / nn, cz / nn); b.im.updateMatrixWorld(true); }
    }
    if (this.emotes.length || this.runs.size) this.syncSorted();
  }
}

const batchesOf = scene => { let B = BATCHES.get(scene); if (!B) BATCHES.set(scene, B = new SpriteBatches(scene)); return B; };
/** Draw the additive glow sprites under `root` (just added to `scene`) through the scene's instanced sprite batches. */
export function adoptSprites(root, scene) {
  if (OFF || !root || !scene?.isScene) return;
  batchesOf(scene).adopt(root);
}
/** Draw a normal-blended sprite (an emote bubble) through the scene's depth-sorted sprite runs (see syncSorted). Only for
 *  a render order no other transparent object shares (emotes: 20). */
export function adoptSortedSprite(sprite, scene) {
  if (OFF || !sprite || !scene?.isScene) return;
  batchesOf(scene).adoptSorted(sprite);
}
