// Island terrain: heightfield, painted tile layer (paths / plaza / fields), GPU texture mirrors for shaders.
// The island's shape and every feature on it come from the town plan (layout.js) through islandShape.js.
import * as THREE from 'three';
import { Noise, clamp, lerp } from '../core/util.js';
import { makeToon, POOL_GLSL } from '../gfx/materials.js';
import { WORLD, T, LANDMARKS, POND, RIVER, PLATEAU } from './layout.js';
import { islandHeight, riverDist } from './islandShape.js';

export { WORLD, T, riverDist };

// render mesh: 32 m chunks, 2 vertices / m in the town (the plateau and its rim), 1 / m beyond (VILLAGE_PLAN.md §8)
const CHUNK = 32, HI_R = PLATEAU.flat + 6;

export class Terrain {
  constructor(seed = 3) {
    this.noise = new Noise(seed);
    this.N = WORLD; // tiles
    this.RES = 2;   // height samples per tile (gameplay heights; the render mesh is coarser outside the town)
    const S = this.S = WORLD * this.RES + 1;
    this.h = new Float32Array(S * S);
    this.tiles = new Uint8Array(WORLD * WORLD);
    this.wear = new Uint8Array(WORLD * WORLD); // trodden grass 0..255 (details.js: path corners, plaza thresholds)
    const F = LANDMARKS.fountain;
    this.plazaCenter = new THREE.Vector2(F.x, F.z); // centre of the fountain ring in the plaza paving
    this.center = { x: PLATEAU.x, z: PLATEAU.z };
    this.pond = POND;
    this.river = RIVER;
    this.build();
  }
  rawHeight(x, z) { return islandHeight(this.noise, x, z); }
  build() {
    const S = this.S, R = this.RES;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) this.h[j * S + i] = this.rawHeight(i / R, j / R);
    // base tile classification
    for (let z = 0; z < WORLD; z++) for (let x = 0; x < WORLD; x++) {
      const hc = this.heightAt(x + 0.5, z + 0.5);
      let t = T.GRASS;
      if (hc < 0.02) t = T.WATER; else if (hc < 0.45) t = T.SAND; else if (this.slopeAt(x + 0.5, z + 0.5) > 0.55) t = T.ROCK;
      this.tiles[z * WORLD + x] = t;
    }
    this.tileData = new Uint8Array(WORLD * WORLD * 4);
    this.tileTex = new THREE.DataTexture(this.tileData, WORLD, WORLD, THREE.RGBAFormat);
    this.tileTex.magFilter = THREE.LinearFilter; this.tileTex.minFilter = THREE.LinearFilter;
    this.overlayData = new Uint8Array(WORLD * WORLD * 4);
    this.overlayTex = new THREE.DataTexture(this.overlayData, WORLD, WORLD, THREE.RGBAFormat);
    this.overlayTex.magFilter = THREE.NearestFilter; this.overlayTex.minFilter = THREE.NearestFilter;
    // height texture for water depth / shoreline foam
    const HS = WORLD;
    this.hData = new Float32Array(HS * HS);
    for (let z = 0; z < HS; z++) for (let x = 0; x < HS; x++) this.hData[z * HS + x] = this.heightAt(x + 0.5, z + 0.5);
    this.heightTex = new THREE.DataTexture(this.hData, HS, HS, THREE.RedFormat, THREE.FloatType);
    this.heightTex.magFilter = THREE.LinearFilter; this.heightTex.minFilter = THREE.LinearFilter; this.heightTex.needsUpdate = true;
    this.syncTiles();
  }
  heightAt(x, z) {
    const S = this.S, R = this.RES;
    const fx = clamp(x * R, 0, S - 1.001), fz = clamp(z * R, 0, S - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const a = this.h[j * S + i], b = this.h[j * S + i + 1], c = this.h[(j + 1) * S + i], d = this.h[(j + 1) * S + i + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  }
  normalAt(x, z) {
    const e = 0.5;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return new THREE.Vector3(-hx, 2 * e, -hz).normalize();
  }
  // 1 - normal.y, without allocating
  slopeAt(x, z) {
    const hx = this.heightAt(x + 0.5, z) - this.heightAt(x - 0.5, z), hz = this.heightAt(x, z + 0.5) - this.heightAt(x, z - 0.5);
    return 1 - 1 / Math.sqrt(hx * hx + 1 + hz * hz);
  }
  tile(x, z) { x = Math.floor(x); z = Math.floor(z); if (x < 0 || z < 0 || x >= WORLD || z >= WORLD) return T.WATER; return this.tiles[z * WORLD + x]; }
  setTile(x, z, t, sync = true) {
    if (x < 0 || z < 0 || x >= WORLD || z >= WORLD) return;
    this.tiles[z * WORLD + x] = t;
    if (sync) this.syncTiles();
  }
  isWater(x, z) { return this.heightAt(x, z) < 0.05; }
  walkable(x, z) { return this.heightAt(x, z) > -0.25 && this.slopeAt(x, z) < 0.62; }
  syncTiles() {
    const D = this.tileData;
    for (let i = 0; i < WORLD * WORLD; i++) {
      const t = this.tiles[i];
      D[i * 4] = t === T.PATH ? 255 : 0;
      D[i * 4 + 1] = t === T.PLAZA ? 255 : 0;
      D[i * 4 + 2] = t === T.FIELD ? 255 : 0;
      D[i * 4 + 3] = (t === T.GRASS) ? 255 - this.wear[i] * 0.7 : 0; // grass allowed (worn grass: thinner, < 0.55 = bare)
    }
    this.tileTex.needsUpdate = true;
  }
  // chunk (ci, cj) is drawn at 2 vertices / m when it touches the town
  chunkRes(ci, cj) {
    const x0 = ci * CHUNK, z0 = cj * CHUNK, P = PLATEAU;
    const dx = Math.max(x0 - P.x, 0, P.x - x0 - CHUNK), dz = Math.max(z0 - P.z, 0, P.z - z0 - CHUNK);
    return Math.hypot(dx, dz) < HI_R ? 2 : 1;
  }
  // One mesh per 32 m chunk (frustum-culled), sharing the material. Normals come straight from the heightfield so
  // chunks shade seamlessly; where a fine chunk meets a coarse one its in-between edge vertices sit on the coarse
  // chunk's edge (no cracks).
  mesh() {
    const NC = Math.ceil(WORLD / CHUNK);
    const res = []; for (let j = 0; j < NC; j++) for (let i = 0; i < NC; i++) res.push(this.chunkRes(i, j));
    const resAt = (i, j) => (i < 0 || j < 0 || i >= NC || j >= NC ? 2 : res[j * NC + i]);
    const mat = this.material = makeToon({
      brush: 0.16, brushScale: 0.22, rim: 0.0, shadowSat: 0.45,
      uniforms: {
        uTiles: { value: this.tileTex }, uOverlay: { value: this.overlayTex }, uOverlayAmt: { value: 0 }, uOverlayMode: { value: 1 },
        uWorld: { value: WORLD }, uGrid: { value: 0 }, uCursor: { value: new THREE.Vector4(-99, -99, 0, 0) },
        uPlazaC: { value: this.plazaCenter.clone() }, // centre of the fountain ring in the plaza paving
        uCursorCol: { value: new THREE.Vector4(1, 1, 0.85, 0.12) },
      },
      fragPars: TERRAIN_FRAG_PARS + POOL_GLSL,
      fragColor: TERRAIN_FRAG_COLOR,
      fragOut: TERRAIN_FRAG_OUT,
    });
    const group = new THREE.Group(); group.name = 'terrain';
    let tris = 0;
    for (let cj = 0; cj < NC; cj++) for (let ci = 0; ci < NC; ci++) {
      const r = resAt(ci, cj), n = CHUNK * r, x0 = ci * CHUNK, z0 = cj * CHUNK, row = n + 1;
      const pos = new Float32Array(row * row * 3), nor = new Float32Array(row * row * 3), uv = new Float32Array(row * row * 2);
      // edges that border a coarser chunk: [-z, +z, -x, +x]
      const coarse = r === 2 ? [resAt(ci, cj - 1) === 1, resAt(ci, cj + 1) === 1, resAt(ci - 1, cj) === 1, resAt(ci + 1, cj) === 1] : [false, false, false, false];
      for (let b = 0; b <= n; b++) for (let a = 0; a <= n; a++) {
        const x = x0 + a / r, z = z0 + b / r, k = b * row + a;
        let y = this.heightAt(x, z);
        if ((a & 1) && ((b === 0 && coarse[0]) || (b === n && coarse[1]))) y = (this.heightAt(x - 0.5, z) + this.heightAt(x + 0.5, z)) / 2;
        if ((b & 1) && ((a === 0 && coarse[2]) || (a === n && coarse[3]))) y = (this.heightAt(x, z - 0.5) + this.heightAt(x, z + 0.5)) / 2;
        pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
        const hx = this.heightAt(x + 0.5, z) - this.heightAt(x - 0.5, z), hz = this.heightAt(x, z + 0.5) - this.heightAt(x, z - 0.5), il = 1 / Math.sqrt(hx * hx + 1 + hz * hz);
        nor[k * 3] = -hx * il; nor[k * 3 + 1] = il; nor[k * 3 + 2] = -hz * il;
        uv[k * 2] = x / WORLD; uv[k * 2 + 1] = 1 - z / WORLD;
      }
      const idx = new (row * row > 65535 ? Uint32Array : Uint16Array)(n * n * 6);
      let q = 0;
      for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
        const i0 = b * row + a, i1 = i0 + 1, i2 = i0 + row, i3 = i2 + 1;
        idx[q++] = i0; idx[q++] = i2; idx[q++] = i1; idx[q++] = i1; idx[q++] = i2; idx[q++] = i3;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeBoundingSphere(); geo.computeBoundingBox();
      const m = new THREE.Mesh(geo, mat);
      m.receiveShadow = true; m.name = `terrain:${ci},${cj}`;
      group.add(m); tris += n * n * 2;
    }
    group.userData.tris = tris;
    return group;
  }
  // uniform objects the grass shares so it renders the same build overlay as the ground
  overlayUniforms() {
    const u = this.material?.userData?.u; if (!u) return null;
    return { uOverlay: u.uOverlay, uOverlayAmt: u.uOverlayAmt, uOverlayMode: u.uOverlayMode, uGrid: u.uGrid, uCursor: u.uCursor, uCursorCol: u.uCursorCol };
  }
  // big seabed skirt around (and under the edges of) the island so the sea has something under it
  skirt() {
    const g = new THREE.RingGeometry(WORLD * 0.45, WORLD * 3.75, 64, 1);
    g.rotateX(-Math.PI / 2); g.translate(WORLD / 2, -3.2, WORLD / 2);
    const m = new THREE.Mesh(g, makeToon({ color: '#8ea888', rim: 0, brush: 0.05 })); // (≈ the terrain's own underwater tint: no seam where it ends)
    return m;
  }
}

// Build-mode overlay shared by the terrain and the grass blades (the grass material binds the very same uniform
// objects, see Terrain.overlayUniforms()), so zones, coverage, grid and the drag rectangle read on top of the lawn.
//  uOverlay: RGBA per tile (NearestFilter). uOverlayMode 1 = zones (flat fill, stripes, bold borders where the zone
//  changes), 0 = coverage gradient (outline where coverage ends). uCursor = (cx, cz, w, d), uCursorCol = (rgb, fill).
export const OVERLAY_GLSL = /* glsl */`
uniform sampler2D uOverlay;
uniform float uOverlayAmt;
uniform float uOverlayMode;
uniform float uGrid;
uniform vec4 uCursor;
uniform vec4 uCursorCol;
float ovDiff(vec4 a, vec4 b) { return step(0.04, abs(a.r - b.r) + abs(a.g - b.g) + abs(a.b - b.b) + abs(a.a - b.a)); }
vec3 applyBuildOverlay(vec3 col, vec3 wp, float blade) {
  vec2 tuv = wp.xz / uWorld;
  float lum = dot(col, vec3(0.333));
  if (uOverlayAmt > 0.0) {
    vec4 ov = texture2D(uOverlay, tuv);
    if (ov.a > 0.004) {
      float px = 1.0 / uWorld;
      vec2 f = fract(wp.xz);
      vec4 oL = texture2D(uOverlay, tuv - vec2(px, 0.0)), oR = texture2D(uOverlay, tuv + vec2(px, 0.0));
      vec4 oD = texture2D(uOverlay, tuv - vec2(0.0, px)), oU = texture2D(uOverlay, tuv + vec2(0.0, px));
      float zones = step(0.5, uOverlayMode);
      vec4 dif = zones > 0.5 ? vec4(ovDiff(ov, oL), ovDiff(ov, oR), ovDiff(ov, oD), ovDiff(ov, oU))
                             : vec4(step(oL.a, 0.004), step(oR.a, 0.004), step(oD.a, 0.004), step(oU.a, 0.004));
      float e = min(min(mix(1.0, f.x, dif.x), mix(1.0, 1.0 - f.x, dif.y)), min(mix(1.0, f.y, dif.z), mix(1.0, 1.0 - f.y, dif.w)));
      vec3 tint = ov.rgb * (0.62 + 0.5 * lum);
      float a = ov.a;
      if (zones > 0.5) a *= mix(0.78, 1.0, step(0.5, fract((wp.x + wp.z) * 0.7071))); // soft diagonal stripes
      col = mix(col, tint, clamp(a * (1.0 + blade * 0.25), 0.0, 1.0) * uOverlayAmt);
      float w = zones > 0.5 ? 0.15 : 0.1;
      float line = 1.0 - smoothstep(w - 0.05, w, e);
      col = mix(col, ov.rgb * 0.42, line * 0.95 * uOverlayAmt);
      float hi = smoothstep(w - 0.01, w + 0.02, e) * (1.0 - smoothstep(w + 0.05, w + 0.1, e));
      col = mix(col, mix(ov.rgb, vec3(1.0), 0.65), hi * 0.7 * zones * uOverlayAmt);
    }
  }
  if (uGrid > 0.0) {
    vec2 g = abs(fract(wp.xz) - 0.5);
    float line = smoothstep(0.465, 0.5, max(g.x, g.y));
    col = mix(col, vec3(1.0, 0.98, 0.9), line * (0.32 - blade * 0.12) * uGrid);
  }
  if (uCursor.z > 0.0) {
    vec2 q = abs(wp.xz - uCursor.xy) - uCursor.zw * 0.5;
    float sd = max(q.x, q.y);
    float inside = step(sd, 0.0);
    float border = inside * smoothstep(-0.2, -0.04, sd);
    float pulse = 0.8 + 0.2 * sin(uTime * 7.0);
    col = mix(col, uCursorCol.rgb * (0.55 + 0.6 * lum), inside * uCursorCol.a);
    col = mix(col, mix(uCursorCol.rgb, vec3(1.0), 0.45), border * 0.92 * pulse);
    // corner ticks make big rectangles readable at a glance
    vec2 cq = abs(wp.xz - uCursor.xy) - (uCursor.zw * 0.5 - 0.55);
    float corner = inside * step(0.0, cq.x) * step(0.0, cq.y);
    col = mix(col, vec3(1.0), corner * 0.55);
  }
  return col;
}
`;

const TERRAIN_FRAG_PARS = /* glsl */`
uniform sampler2D uTiles;
uniform float uWorld;
uniform vec2 uPlazaC;
${OVERLAY_GLSL}
vec2 vHash2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
// returns (edge distance, cell id hash)
vec2 voronoi(vec2 x) {
  vec2 n = floor(x), f = fract(x);
  float md = 8.0, md2 = 8.0; vec2 id = vec2(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = vHash2(n + g);
    vec2 r = g + o * 0.85 + 0.075 - f;
    float d = dot(r, r);
    if (d < md) { md2 = md; md = d; id = n + g; } else if (d < md2) { md2 = d; }
  }
  return vec2(sqrt(md2) - sqrt(md), fract(sin(dot(id, vec2(7.1, 3.3))) * 91.7));
}
`;

const TERRAIN_FRAG_COLOR = /* glsl */`
{
  vec3 wp = vCWorld;
  vec2 tuv = wp.xz / uWorld;
  vec4 tl = texture2D(uTiles, tuv);
  float h = wp.y;
  float slope = 1.0 - normalize(vCWN).y;
  float n1 = texture2D(uBrush, wp.xz * 0.021).g;
  float n2 = texture2D(uBrush, wp.xz * 0.0071 + 0.31).g;
  float n3 = texture2D(uBrush, wp.xz * 0.09).r;
  vec3 g1 = vec3(0.50, 0.80, 0.30), g2 = vec3(0.33, 0.64, 0.30), g3 = vec3(0.70, 0.84, 0.36), g4 = vec3(0.40, 0.72, 0.42);
  vec3 grass = mix(g2, g1, smoothstep(0.38, 0.62, n1));
  grass = mix(grass, g3, smoothstep(0.52, 0.72, n2) * 0.7);
  grass = mix(grass, g4, smoothstep(0.55, 0.75, 1.0 - n2) * 0.5);
  // trodden earth: worn grass tiles (alpha < 1, see Terrain.wear) and the yards under buildings (alpha 0), patchy
  float wornA = clamp((1.0 - tl.a) * 1.6 - (tl.r + tl.g + tl.b) * 4.0, 0.0, 1.0) * smoothstep(0.6, 0.8, h);
  float wornN = smoothstep(0.3, 0.8, wornA + (n1 - 0.5) * 0.55 + (n3 - 0.5) * 0.4);
  vec3 earth = mix(vec3(0.62, 0.53, 0.40), vec3(0.72, 0.62, 0.46), n3);
  grass = mix(grass, mix(grass * 0.86, earth, 0.7), wornN * 0.9);
  vec3 sand = mix(vec3(0.97, 0.88, 0.68), vec3(0.93, 0.80, 0.62), n3);
  float sandAmt = 1.0 - smoothstep(0.3, 0.75, h + (n1 - 0.5) * 0.5);
  // painted cliff faces: wavy sediment bands (warm sandstone / cool slate), dark seams between them, embedded stones,
  // lichen, and moss drips hanging down from the grassy lip above
  float along = wp.x * 0.83 + wp.z * 0.57;
  float strata = h * 2.6 + sin(along * 0.9) * 0.22 + sin(along * 2.3 + 1.7) * 0.08 + (n1 - 0.5) * 0.35;
  float band = fract(strata), bandId = floor(strata);
  float bh = fract(sin(bandId * 12.9898) * 43758.5453);
  vec3 rockA = vec3(0.78, 0.66, 0.58), rockB = vec3(0.62, 0.58, 0.70), rockC = vec3(0.86, 0.78, 0.66);
  vec3 rock = bh < 0.4 ? rockA : bh < 0.75 ? rockB : rockC;
  rock *= 0.9 + 0.2 * n3;                                                        // brushy value variation
  rock *= mix(0.62, 1.0, smoothstep(0.0, 0.1, band) * smoothstep(1.0, 0.86, band)); // seams between layers
  vec2 cst = voronoi(vec2(along * 1.6, h * 3.2));
  rock = mix(rock, rock * vec3(1.08, 1.04, 1.0), (1.0 - smoothstep(0.0, 0.35, cst.x)) * step(0.72, cst.y) * 0.8); // stones
  rock = mix(rock, vec3(0.62, 0.70, 0.50), smoothstep(0.62, 0.82, n2) * 0.45);  // lichen patches
  float drip = smoothstep(0.55, 0.95, sin(along * 7.0 + n1 * 5.0) * 0.5 + 0.5) * smoothstep(0.8, 0.35, slope);
  rock = mix(rock, vec3(0.42, 0.62, 0.34), drip * 0.7);                           // moss drips under the lip
  rock *= mix(0.78, 1.0, smoothstep(-0.2, 0.6, h));                               // damp, darker foot
  float rockAmt = smoothstep(0.30, 0.5, slope + (n2 - 0.5) * 0.25);
  vec3 col = grass;
  col = mix(col, sand, sandAmt);
  col = mix(col, rock, rockAmt);
  // underwater
  col = mix(col, vec3(0.62, 0.72, 0.58), smoothstep(0.1, -0.4, h));
  // dirt / field
  float fieldAmt = smoothstep(0.3, 0.6, tl.b + (n3 - 0.5) * 0.3);
  vec3 soil = mix(vec3(0.55, 0.36, 0.24), vec3(0.64, 0.44, 0.30), smoothstep(-0.3, 0.3, sin(wp.x * 3.1416 * 2.0)));
  col = mix(col, soil, fieldAmt);
  // cobbled path
  float pe = tl.r + (n3 - 0.5) * 0.45 + (n1 - 0.5) * 0.2;
  float pathAmt = smoothstep(0.38, 0.52, pe);
  vec2 vo = voronoi(wp.xz * 2.2);
  vec3 stone = mix(vec3(0.86, 0.80, 0.72), vec3(0.95, 0.90, 0.80), vo.y);
  stone = mix(stone, vec3(0.80, 0.74, 0.78), step(0.8, vo.y) * 0.6);
  float gap = smoothstep(0.02, 0.12, vo.x);
  vec3 pathCol = mix(vec3(0.56, 0.62, 0.40), stone, gap);
  pathCol = mix(vec3(0.84, 0.72, 0.56), pathCol, smoothstep(0.52, 0.7, pe)); // dusty border
  col = mix(col, pathCol, pathAmt);
  // plaza: big square pavers in running bond (a few rosy / lavender ones, mossy joints in patches), a curb band of
  // small cobbles along the edge (it also marks the thresholds where paths come in), and a ring of radial pavers
  // around the fountain
  float pz = tl.g + (n3 - 0.5) * 0.3;
  float plazaAmt = smoothstep(0.4, 0.55, pz);
  if (plazaAmt > 0.001) {
    vec2 cell = wp.xz * 1.0; vec2 poff = vec2(0.5 * step(0.5, fract(floor(cell.y) * 0.5)), 0.0);
    vec2 fc = fract(cell + poff), pid = floor(cell + poff);
    float pave = smoothstep(0.0, 0.06, fc.x) * smoothstep(1.0, 0.94, fc.x) * smoothstep(0.0, 0.06, fc.y) * smoothstep(1.0, 0.94, fc.y);
    float ph = vHash2(pid).x, ph2 = vHash2(pid + 17.3).y;
    vec3 plaza = mix(vec3(0.90, 0.84, 0.78), vec3(0.98, 0.92, 0.84), ph);
    plaza = mix(plaza, vec3(0.96, 0.84, 0.83), step(0.87, ph2) * 0.75);
    plaza = mix(plaza, vec3(0.86, 0.84, 0.92), step(ph2, 0.09) * 0.75);
    plaza *= 0.97 + 0.06 * n3;
    vec3 joint = mix(vec3(0.70, 0.64, 0.62), vec3(0.52, 0.64, 0.40), smoothstep(0.52, 0.72, n2) * 0.85);
    plaza = mix(joint, plaza, pave);
    // fountain ring: three courses of radial pavers between two dark bands
    vec2 rq = wp.xz - uPlazaC; float rr = length(rq);
    if (rr < 2.62) {
      float ang = atan(rq.y, rq.x) / 6.28318 + 0.5;
      float cr = (rr - 1.1) / 0.45, ci = floor(cr), cf = fract(cr);
      float nseg = floor(6.28318 * (1.1 + (ci + 0.5) * 0.45) / 0.52);
      float sg = ang * nseg + ci * 0.5, sf = fract(sg), arc = 6.28318 * rr / nseg;
      float rj = smoothstep(0.0, 0.07, cf) * smoothstep(1.0, 0.93, cf) * smoothstep(0.0, 0.035, sf * arc) * smoothstep(0.0, 0.035, (1.0 - sf) * arc);
      float rh = vHash2(vec2(floor(sg), ci + 3.0)).x;
      vec3 ringC = mod(ci, 2.0) < 0.5 ? vec3(0.97, 0.88, 0.84) : vec3(0.90, 0.88, 0.95);
      ringC *= 0.94 + 0.1 * rh;
      vec3 ringP = mix(vec3(0.66, 0.60, 0.62), ringC, rj);
      float band = step(2.45, rr) + step(rr, 1.1);
      vec3 bandC = mix(vec3(0.62, 0.58, 0.68), vec3(0.72, 0.68, 0.76), smoothstep(0.3, 0.7, fract(ang * 90.0)) * 0.6);
      ringP = mix(ringP, bandC, band);
      plaza = mix(plaza, ringP, smoothstep(2.62, 2.56, rr));
    }
    // curb band at the edge: small rounded cobbles
    float edgeB = smoothstep(0.86, 0.78, tl.g + (n1 - 0.5) * 0.06);
    if (edgeB > 0.001) {
      vec2 cv = voronoi(wp.xz * 3.6);
      vec3 cob = mix(vec3(0.78, 0.73, 0.74), vec3(0.88, 0.82, 0.80), cv.y) * (0.94 + 0.08 * n3);
      cob = mix(vec3(0.58, 0.56, 0.52), cob, smoothstep(0.03, 0.12, cv.x));
      plaza = mix(plaza, cob, edgeB);
    }
    col = mix(col, plaza, plazaAmt);
  }
  diffuseColor.rgb = col;
}
`;

const TERRAIN_FRAG_OUT = /* glsl */`
  outgoingLight += lightPools(vCWorld) * diffuseColor.rgb;
  outgoingLight = applyBuildOverlay(outgoingLight, vCWorld, 0.0);
`;
