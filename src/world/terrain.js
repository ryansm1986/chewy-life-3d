// Island terrain: heightfield, painted tile layer (paths / plaza / fields), GPU texture mirrors for shaders.
import * as THREE from 'three';
import { Noise, clamp, smoothstep, lerp } from '../core/util.js';
import { makeToon, POOL_GLSL } from '../gfx/materials.js';

export const WORLD = 112;
export const T = { GRASS: 0, PATH: 1, PLAZA: 2, FIELD: 3, SAND: 4, ROCK: 5, WATER: 6 };

// river control points (x,z) from the waterfall pool down to the sea
const RIVER = [[50, 14], [49, 22], [45, 30], [38, 38], [33, 47], [32, 56], [34, 66], [31, 76], [26, 86], [22, 96], [18, 112]];
const POND = { x: 71, z: 73, r: 5.2 };

function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, wx = px - ax, wz = pz - az;
  const t = clamp((wx * vx + wz * vz) / (vx * vx + vz * vz));
  const dx = px - (ax + vx * t), dz = pz - (az + vz * t);
  return { d: Math.sqrt(dx * dx + dz * dz), t };
}
export function riverDist(x, z) {
  let best = 1e9;
  for (let i = 0; i < RIVER.length - 1; i++) {
    const [ax, az] = RIVER[i], [bx, bz] = RIVER[i + 1];
    const r = segDist(x, z, ax, az, bx, bz);
    if (r.d < best) best = r.d;
  }
  return best;
}

export class Terrain {
  constructor(seed = 3) {
    this.noise = new Noise(seed);
    this.N = WORLD; // tiles
    this.RES = 2;   // height samples per tile
    const S = this.S = WORLD * this.RES + 1;
    this.h = new Float32Array(S * S);
    this.tiles = new Uint8Array(WORLD * WORLD);
    this.plazaCenter = new THREE.Vector2(56, 60);
    this.center = { x: 56, z: 60 };
    this.pond = POND;
    this.river = RIVER;
    this.build();
  }
  rawHeight(x, z) {
    const n = this.noise;
    const cx = 56, cz = 58;
    const dx = (x - cx) / 50, dz = (z - cz) / 50;
    const edge = Math.sqrt(dx * dx + dz * dz) + n.fbm(x * 0.03, z * 0.03, 3) * 0.12;
    // island falloff to seabed
    let h = 1.0 - smoothstep(0.78, 1.0, edge) * 2.8;
    // gentle rolling ground
    h += n.fbm(x * 0.05 + 11, z * 0.05, 3) * 0.35;
    // village plateau flattening
    const vd = Math.hypot(x - 56, z - 60);
    const flat = 1 - smoothstep(20, 30, vd);
    h = lerp(h, 1.0 + n.fbm(x * 0.08, z * 0.08, 2) * 0.05, flat);
    // northern mountains / cliff wall
    const north = smoothstep(27, 12, z + n.fbm(x * 0.07, 5, 2) * 4);
    let mnt = 2.4 + (26 - z) * 0.32 + n.fbm(x * 0.05, z * 0.05 + 3, 4) * 2.2 + Math.max(0, n.n2(x * 0.08, z * 0.08)) * 1.5;
    const st = 2.2, fr = mnt / st - Math.floor(mnt / st);
    mnt = Math.floor(mnt / st) * st + smoothstep(0.7, 1.0, fr) * st; // painted terraces / cliffs
    h = lerp(h, Math.max(h, mnt), north);
    // east shrine hill (plateau with soft rim)
    const hd = Math.hypot((x - 88) * 0.9, z - 42);
    const hill = smoothstep(13, 7, hd);
    h = lerp(h, 3.4 + n.fbm(x * 0.2, z * 0.2) * 0.08, hill);
    // west bamboo rise
    const wd = Math.hypot(x - 18, z - 52);
    h += smoothstep(16, 4, wd) * 0.9;
    // river channel
    const rd = riverDist(x, z);
    const riverW = 2.4 + smoothstep(20, 100, z) * 1.2;
    const bank = smoothstep(riverW + 3.0, riverW - 0.2, rd);
    h = lerp(h, -0.9 - (1 - rd / (riverW + 3)) * 0.3, bank * (z > 12 ? 1 : 0));
    // waterfall basin at the foot of the cliff
    const wb = Math.hypot(x - 50, z - 16);
    h = lerp(h, -1.0, smoothstep(6, 3.5, wb));
    // koi pond
    const pd = Math.hypot(x - POND.x, z - POND.z) + n.n2(x * 0.3, z * 0.3) * 0.5;
    h = lerp(h, -0.7, smoothstep(POND.r + 2.2, POND.r - 1.2, pd));
    return h;
  }
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
  slopeAt(x, z) { return 1 - this.normalAt(x, z).y; }
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
      D[i * 4 + 3] = (t === T.GRASS) ? 255 : 0; // grass allowed
    }
    this.tileTex.needsUpdate = true;
  }
  mesh() {
    const S = this.S, size = WORLD;
    const geo = new THREE.PlaneGeometry(size, size, S - 1, S - 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate(size / 2, 0, size / 2);
    const pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k);
      pos.setY(k, this.heightAt(x, z));
    }
    geo.computeVertexNormals();
    const mat = makeToon({
      brush: 0.16, brushScale: 0.22, rim: 0.0, shadowSat: 0.45,
      uniforms: {
        uTiles: { value: this.tileTex }, uOverlay: { value: this.overlayTex }, uOverlayAmt: { value: 0 }, uOverlayMode: { value: 1 },
        uWorld: { value: WORLD }, uGrid: { value: 0 }, uCursor: { value: new THREE.Vector4(-99, -99, 0, 0) },
        uCursorCol: { value: new THREE.Vector4(1, 1, 0.85, 0.12) },
      },
      fragPars: TERRAIN_FRAG_PARS + POOL_GLSL,
      fragColor: TERRAIN_FRAG_COLOR,
      fragOut: TERRAIN_FRAG_OUT,
    });
    this.material = mat;
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    m.name = 'terrain';
    return m;
  }
  // uniform objects the grass shares so it renders the same build overlay as the ground
  overlayUniforms() {
    const u = this.material?.userData?.u; if (!u) return null;
    return { uOverlay: u.uOverlay, uOverlayAmt: u.uOverlayAmt, uOverlayMode: u.uOverlayMode, uGrid: u.uGrid, uCursor: u.uCursor, uCursorCol: u.uCursorCol };
  }
  // big seabed skirt around the island so the sea has something under it
  skirt() {
    const g = new THREE.RingGeometry(WORLD * 0.72, 420, 64, 1);
    g.rotateX(-Math.PI / 2); g.translate(WORLD / 2, -3.2, WORLD / 2);
    const m = new THREE.Mesh(g, makeToon({ color: '#3c8fa0', rim: 0, brush: 0.05 }));
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
  // plaza: big square pavers
  float pz = tl.g + (n3 - 0.5) * 0.3;
  float plazaAmt = smoothstep(0.4, 0.55, pz);
  vec2 cell = wp.xz * 1.0; vec2 fc = fract(cell + vec2(0.5 * step(0.5, fract(floor(cell.y) * 0.5)), 0.0));
  float pave = smoothstep(0.0, 0.06, fc.x) * smoothstep(1.0, 0.94, fc.x) * smoothstep(0.0, 0.06, fc.y) * smoothstep(1.0, 0.94, fc.y);
  float ph = vHash2(floor(cell + vec2(0.5 * step(0.5, fract(floor(cell.y) * 0.5)), 0.0))).x;
  vec3 plaza = mix(vec3(0.90, 0.84, 0.78), vec3(0.98, 0.92, 0.84), ph);
  plaza = mix(vec3(0.70, 0.64, 0.62), plaza, pave);
  col = mix(col, plaza, plazaAmt);
  diffuseColor.rgb = col;
}
`;

const TERRAIN_FRAG_OUT = /* glsl */`
  outgoingLight += lightPools(vCWorld) * diffuseColor.rgb;
  outgoingLight = applyBuildOverlay(outgoingLight, vCWorld, 0.0);
`;
