// The Tide Caves' gate look (regions/dungeonGate.js; docs/ZONES.md §8.2; format: ./bamboo.js): a sea-cave mouth in a
// banded sea cliff at the end of the shore (the tidepools' own grotto arch, its throat glowing with plankton), a
// driftwood rope gate before it hung with glass floats, two shore lanterns, a glowing tide pool at its foot with
// anemones and urchins, barnacled boulders, kelp and starfish round the rocks.
import * as THREE from 'three';
import * as TA from '../assets/tidepoolAssets.js';
import { blobDisc } from '../assets/tidepoolKit.js';
import { U } from '../../gfx/materials.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const cache = new Map();
const cached = (k, fn) => { if (!cache.has(k)) cache.set(k, fn()); return cache.get(k); };
/** the gate Placers' batches want one attribute layout: non-indexed position / normal / uv / color (cached per geometry) */
const _norm = new WeakMap();
function norm(geo) {
  let g = _norm.get(geo); if (g) return g;
  g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.color) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  _norm.set(geo, g); return g;
}
/** a tidepool asset's buckets into a gate Placer (the bamboo Placer's keys: rock / d:reed / d:body / d:glow / d:stone) */
function put(PL, out, x, y, z, rot = 0, s = 1, o = {}) {
  const key = { rock: 'rock', reed: 'd:reed', body: 'd:body', stone: 'd:stone', cloth: 'd:cloth', glow: 'd:glow', hot: 'd:body', grass: 'd:grass' }; // (the throat: deep teal rock, not a lamp)
  for (const k in key) if (out[k]?.isBufferGeometry) PL.put(key[k], norm(out[k]), x, y, z, { rot, s, ...o });
}
// a little tide pool's glowing water (a blob disc: uv.x 0 centre .. 1 rim): teal shallows, a deep middle, ripples
function poolMat() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime }, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    vertexShader: 'varying vec2 vU; varying vec3 vW; void main() { vU = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: /* glsl */`uniform float uTime; varying vec2 vU; varying vec3 vW;
      void main() {
        float r = clamp(vU.x, 0.0, 1.0);
        vec3 c = mix(vec3(0.05, 0.36, 0.46), vec3(0.32, 0.86, 0.82), smoothstep(0.2, 0.95, r));
        float rip = sin(vW.x * 5.0 + uTime * 1.3 + sin(vW.z * 4.0 + uTime) * 1.5) * sin(vW.z * 5.5 - uTime * 1.1);
        c += vec3(0.6, 1.0, 0.95) * smoothstep(0.7, 1.0, rip) * 0.18;
        float foam = smoothstep(0.84, 0.98, r + rip * 0.02);
        c = mix(c, vec3(0.92, 1.0, 0.98), foam * 0.7);
        gl_FragColor = vec4(c, mix(0.8, 0.95, foam) * smoothstep(1.0, 0.94, r));
      }`,
  });
}

export const TIDEPOOL_GATE = {
  seal: '#8ff4ff',
  lanternI: 2.0, // (dungeonGate's lantern lights when it opens: soft, the full 4.5 paints a pink pool on the bright sand)
  glb: { url: null, scale: 1, yaw: 0, y: 0 },
  build({ main, dress, lp, gx, gz, yaw, rim, W }) {
    // the cliff: the grotto arch (open toward local +z, ~9 m wide), its throat glowing teal, sunk a little into the sand
    const arch = cached('arch', () => TA.grottoMouth(11));
    put(main, arch, gx, rim - 0.3, gz, yaw);
    // more cliff behind and beside, so the arch reads as a mouth in the rock, not a ring
    const rocks = [[-5.6, -1.6, 1.0, 2], [5.4, -1.8, 0.95, 3], [-2.2, -4.2, 1.25, 4], [2.6, -4.4, 1.2, 5], [0, -5.6, 1.4, 6]];
    for (const [lx, lz, s, v] of rocks) { const [x, z] = lp(lx, lz); put(main, cached('st' + v, () => TA.seaStack(60 + v, 4.2, 1.6)), x, Math.min(rim, W.heightAt(x, z)) - 0.4, z, v * 1.3, s); }
    // the driftwood rope gate before the mouth: two posts, a sagging shimenawa, glass floats in their nets
    { const [x, z] = lp(0, 2.2); dress.piece(TA.arenaGate(8), x, z, yaw, { y: rim }); for (const e of [-1, 1]) { const [px, pz] = lp(e * 1.65, 2.2); W.collision.addCircle(px, pz, 0.3); } }
    // two shore lanterns (lit when the seal breaks)
    const lanterns = [];
    for (const e of [-1, 1]) { const [x, z] = lp(e * 2.55, 3.3); dress.piece(cached('lamp', () => TA.shoreLamp(1)), x, z, yaw - e * 0.5, { y: W.heightAt(x, z), lights: false }); W.collision.addCircle(x, z, 0.28); lanterns.push(V(x, W.heightAt(x, z) + 1.45, z)); }
    // a faint plankton glow deep in the throat
    { const [x, z] = lp(0, -0.9); W.lightPool?.addSource({ pos: V(x, rim + 1.2, z), color: new THREE.Color('#6ff0e8'), intensity: 2.2, radius: 4, flicker: 0.2 }); }
    // barnacled boulders and kelp round the foot of the cliff, starfish stuck on the rock, shells on the sand
    for (const [lx, lz, s, v] of [[-3.9, 0.6, 0.85, 0], [4.1, 0.4, 0.75, 1], [-2.6, 1.3, 0.5, 2], [3.0, 1.5, 0.45, 3], [-4.8, -0.4, 1.0, 1], [5.0, -0.6, 0.9, 0]]) { const [x, z] = lp(lx, lz); put(dress, cached('b' + v, () => TA.boulder(70 + v, 0.7, 0.6)), x, W.heightAt(x, z) - 0.12 * s, z, v * 2.1, s); }
    for (const [lx, lz, v] of [[-3.4, 1.2, 0], [3.6, 1.1, 1], [-1.9, 0.9, 2], [2.1, 0.8, 0], [-4.4, 1.0, 1], [4.6, 0.9, 2]]) { const [x, z] = lp(lx, lz); put(dress, cached('k' + v, () => TA.kelp(v, 0.7)), x, W.heightAt(x, z) - 0.02, z, lx, 1.2); }
    for (const [lx, ly, lz, v] of [[-2.9, 1.3, 0.9, 5], [2.7, 1.8, 0.8, 6], [-1.6, 3.4, 0.9, 7]]) { const [x, z] = lp(lx, lz); put(dress, { body: cached('sf' + v, () => TA.starfish(v).body) }, x, rim + ly, z, lx, 1.6, { tiltX: 1.2 }); }
    for (const [lx, lz, v] of [[0.8, 3.4, 1], [-1.2, 3.8, 2], [2.4, 3.0, 3], [-2.8, 2.9, 4]]) { const [x, z] = lp(lx, lz); put(dress, { body: cached('sh' + v, () => TA.shell(v, ['scallop', 'spiral', 'cowrie', 'scallop'][v % 4]).body) }, x, W.heightAt(x, z) + 0.01, z, lz * 3, 1.5); }
    // the tide pool at its foot, to one side of the way in: barnacled rim stones, glowing water, anemones and urchins
    { const [px, pz] = lp(-2.5, 3.3), py = W.heightAt(px, pz);
      const rimG = cached('rim', () => TA.poolRim(23, 1.05, { gap: -1 }));
      put(dress, { rock: rimG.rock }, px, py - 0.05, pz, yaw);
      const disc = blobDisc(1.0, { seed: 5, segs: 24, rings: 4, wob: 0.14 });
      const water = new THREE.Mesh(disc, poolMat()); water.position.set(px, py + 0.05, pz); water.renderOrder = 3; W.scene.add(water);
      W.disposers.push(() => { water.removeFromParent(); disc.dispose(); water.material.dispose(); });
      for (const [ox, oz, v] of [[-0.4, 0.2, 1], [0.35, -0.3, 2], [0.1, 0.45, 3], [-0.2, -0.5, 4]]) put(dress, { reed: cached('an' + v, () => TA.anemone(v).reed) }, px + ox, py - 0.08, pz + oz, ox * 9, 1.4);
      for (const [ox, oz, v] of [[0.5, 0.25, 1], [-0.55, -0.1, 2]]) put(dress, { body: cached('ur' + v, () => TA.urchin(v).body) }, px + ox, py - 0.06, pz + oz, oz * 7, 1.3);
      W.collision.addCircle(px, pz, 0.9);
      W.lightPool?.addSource({ pos: V(px, py + 0.9, pz), color: new THREE.Color('#6ff0e8'), intensity: 2.4, radius: 4.5, flicker: 0.15 }); }
    // colliders (gate-local): the arch's legs and flanks, the throat, the cliff behind
    return { lanterns, colliders: [[-3.4, 0, 1.7], [3.4, 0, 1.7], [-5.2, -1.0, 1.9], [5.2, -1.1, 1.8], [0, -1.6, 1.6], [0, -4.6, 3.2], [-2.4, -3.8, 2.0], [2.6, -3.9, 2.0]], mouth: { lz: 0.4, w: 2.8, h: 2.6 } };
  },
};
