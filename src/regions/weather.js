// Region weather / ambient FX kit (docs/REGIONS.md §3.6). Everything is camera-local and GPU-animated: a field is ONE
// instanced draw whose particles live in a box that follows the camera focus (positions wrap around it, so particles
// stay put in the world while the box moves), animated analytically in the vertex shader (no per-particle CPU work).
// Falling things tumble and land on the terrain (the region's height texture), then fade. LOD: counts scale with the
// quality setting. Only the spray / drip bursts use a small CPU particle layer.
//   const W = world.weather;       // or ctx.fx in recipe.effects(ctx)
//   W.snow({ count, size, fall, gust }); W.leaves({ kind: 'maple', colors, mask: 'canopy' }); W.petals(); W.bambooLeaves()
//   W.fireflies({ count, y: [0.3, 2.4], colors }); W.motes(); W.glints({ on: 'water' | 'snow' }); W.bubbles(); W.plankton()
//   W.shafts(list | { auto }), W.mist(list | { auto }), W.steam(points), W.spray(points), W.drips(points)
// Each returns a handle { mesh, u (uniforms), set(opts), setVisible(b) }; the world updates and frees them.
import * as THREE from 'three';
import { U } from '../gfx/materials.js';
import { ParticleLayer } from '../gfx/particles.js';
import { softDotTexture, smokeTexture, glowTexture } from '../gfx/textures.js';
import { rand, TAU, clamp } from '../core/util.js';

const QMUL = [0.35, 0.65, 1];
const C = h => (h instanceof THREE.Color ? h.clone() : new THREE.Color(h));

// ------------------------------------------------------------------ particle shape atlas (4 x 2 cells, greyscale + alpha)
export const FRAME = { maple: 0, leaf: 1, bamboo: 2, petal: 3, ginkgo: 4, flake: 5, dot: 6, streak: 7 };
let ATLAS = null;
export function fxAtlas() {
  if (ATLAS) return ATLAS;
  const W = 512, H = 256, S = 128, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const cell = (i, fn) => { g.save(); g.translate((i % 4) * S + S / 2, Math.floor(i / 4) * S + S / 2); fn(); g.restore(); };
  const grad = (r, a, b) => { const q = g.createRadialGradient(0, 0, 1, 0, 0, r); q.addColorStop(0, a); q.addColorStop(1, b); return q; };
  // 0 maple: seven slender lobes
  cell(0, () => {
    g.fillStyle = grad(56, '#ffffff', '#c8c8c8');
    for (let k = -3; k <= 3; k++) { g.save(); g.rotate(k * 0.62 - Math.PI / 2); const L = 52 * (1 - Math.abs(k) * 0.12); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(L * 0.4, -L * 0.2, L, 0); g.quadraticCurveTo(L * 0.4, L * 0.2, 0, 0); g.fill(); g.restore(); }
    g.strokeStyle = '#8a8a8a'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 30); g.stroke();
  });
  // 1 round broadleaf with a midrib
  cell(1, () => { g.fillStyle = grad(50, '#ffffff', '#c0c0c0'); g.beginPath(); g.moveTo(0, -50); g.quadraticCurveTo(40, -10, 0, 50); g.quadraticCurveTo(-40, -10, 0, -50); g.fill(); g.strokeStyle = 'rgba(120,120,120,0.7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -44); g.lineTo(0, 46); g.stroke(); });
  // 2 bamboo leaf: long and narrow
  cell(2, () => { g.rotate(0.5); g.fillStyle = grad(58, '#ffffff', '#c8c8c8'); g.beginPath(); g.moveTo(0, -60); g.quadraticCurveTo(13, -5, 0, 60); g.quadraticCurveTo(-13, -5, 0, -60); g.fill(); g.strokeStyle = 'rgba(130,130,130,0.6)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, -54); g.lineTo(0, 56); g.stroke(); });
  // 3 petal: notched teardrop
  cell(3, () => { g.fillStyle = grad(46, '#ffffff', '#dddddd'); g.beginPath(); g.moveTo(0, 46); g.bezierCurveTo(40, 20, 34, -40, 8, -44); g.lineTo(0, -34); g.lineTo(-8, -44); g.bezierCurveTo(-34, -40, -40, 20, 0, 46); g.fill(); });
  // 4 ginkgo fan
  cell(4, () => { g.fillStyle = grad(52, '#ffffff', '#c8c8c8'); g.beginPath(); g.moveTo(0, 30); for (let i = 0; i <= 14; i++) { const t = -1.0 + 2.0 * i / 14, rr = i === 7 ? 36 : 52; g.lineTo(Math.sin(t) * rr, 30 - Math.cos(t) * rr); } g.closePath(); g.fill(); g.strokeStyle = '#909090'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 30); g.lineTo(0, 56); g.stroke(); });
  // 5 snowflake: soft core + six short arms
  cell(5, () => { g.fillStyle = grad(20, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)'); g.beginPath(); g.arc(0, 0, 22, 0, TAU); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 5; g.lineCap = 'round'; for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 40, Math.sin(a) * 40); g.stroke(); } });
  // 6 soft dot
  cell(6, () => { g.fillStyle = grad(60, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)'); g.beginPath(); g.arc(0, 0, 60, 0, TAU); g.fill(); });
  // 7 streak (drip / rain / spray)
  cell(7, () => { const q = g.createLinearGradient(0, -56, 0, 56); q.addColorStop(0, 'rgba(255,255,255,0)'); q.addColorStop(0.7, 'rgba(255,255,255,0.9)'); q.addColorStop(1, 'rgba(255,255,255,1)'); g.fillStyle = q; g.beginPath(); g.ellipse(0, 0, 9, 56, 0, 0, TAU); g.fill(); });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4;
  return (ATLAS = t);
}

// ------------------------------------------------------------------ the field shader
const FIELD_VS = /* glsl */`
#include <common>
#include <fog_pars_vertex>
attribute vec4 aSeed;
attribute vec4 aSeed2;
uniform float uTime;
uniform vec3 uCenter;
uniform vec3 uBox;
uniform vec2 uWindV;
uniform vec2 uWindN;
uniform float uGust;
uniform float uFall;
uniform vec2 uSize;
uniform float uSwirl;
uniform float uRest;
uniform float uSpin;
uniform float uBlink;
uniform vec2 uYRange;
uniform vec4 uFrames;
uniform float uNFrames;
uniform vec3 uCols[4];
uniform float uNCols;
uniform float uAlpha;
uniform sampler2D uHeight;
uniform vec4 uHInfo;          // x origin, y span, z water level (-99 none), w land rule (1 land only, -1 water only, 0 any)
uniform sampler2D uMaskTex;
uniform vec4 uMaskSel;
uniform float uMaskOn;
uniform vec3 uSunDirF;
uniform float uCamFade;
varying vec2 vUv;
varying vec4 vCol;
varying float vLit;
float groundAt(vec2 p) { vec2 t = (p - uHInfo.x) / uHInfo.y; return texture2D(uHeight, clamp(t, 0.002, 0.998)).r; }
vec2 wrapXZ(vec2 p) { vec2 o = uCenter.xz - uBox.xz * 0.5; return o + mod(p - o, uBox.xz); }
float edgeFade(vec2 p) { vec2 d = abs(p - uCenter.xz) / (uBox.xz * 0.5); return 1.0 - smoothstep(0.72, 1.0, max(d.x, d.y)); }
// displacement by the gusts, integrated analytically (landed particles keep their spot): g(t) = uGust * (1 - .5cos(w1 t) - .5cos(w2 t)) / 2
vec2 gustInt(float t) { return uWindN * uGust * 0.5 * (t - 0.5 * sin(0.23 * t) / 0.23 - 0.5 * sin(0.071 * t) / 0.071); }
mat3 axisAngle(vec3 a, float ang) { float s = sin(ang), c = cos(ang), oc = 1.0 - c; return mat3(oc * a.x * a.x + c, oc * a.x * a.y + a.z * s, oc * a.z * a.x - a.y * s, oc * a.x * a.y - a.z * s, oc * a.y * a.y + c, oc * a.y * a.z + a.x * s, oc * a.z * a.x + a.y * s, oc * a.y * a.z - a.x * s, oc * a.z * a.z + c); }
void main() {
  float frame = uFrames.x;
  float fi = floor(fract(aSeed2.w * 7.31) * uNFrames);
  if (fi > 0.5) frame = uFrames.y; if (fi > 1.5) frame = uFrames.z; if (fi > 2.5) frame = uFrames.w;
  vUv = (uv + vec2(mod(frame, 4.0), 1.0 - floor(frame / 4.0))) * vec2(0.25, 0.5);
  float ci = floor(fract(aSeed2.x * 11.7) * uNCols);
  vec3 col = uCols[0]; if (ci > 0.5) col = uCols[1]; if (ci > 1.5) col = uCols[2]; if (ci > 2.5) col = uCols[3];
  float size = mix(uSize.x, uSize.y, fract(aSeed.y * 5.3));
  float alpha = uAlpha;
  vec3 wp; vec3 nrm = vec3(0.0, 1.0, 0.0);
  vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec2 q = position.xy;
  vec3 corner;
#if defined(MODE_FALL)
  float fallDur = uBox.y / uFall * (0.8 + 0.4 * aSeed.w);
  float per = fallDur + uRest;
  float tt = uTime + aSeed.w * 137.0;
  float cyc = floor(tt / per), lt = tt - cyc * per, t0 = tt - lt;
  float tl = min(lt, fallDur);
  vec2 base = (aSeed.xz + fract(vec2(cyc * 0.6180339, cyc * 0.3819660))) * uBox.xz;
  vec2 sw = vec2(sin(tl * 1.3 + aSeed.x * 6.283), cos(tl * 1.07 + aSeed.z * 6.283)) * uSwirl * (0.5 + aSeed2.y);
  vec2 p = wrapXZ(base + uWindV * tl + gustInt(t0 + tl) - gustInt(t0) + sw);
  float hy = uBox.y * (1.0 - tl / fallDur) * (0.7 + 0.3 * aSeed2.z);
  float g = groundAt(p);
  float land = step(fallDur, lt);
  if (uHInfo.z > -90.0 && g < uHInfo.z) g = uHInfo.z;          // things landing on water float on it
  wp = vec3(p.x, g + hy + 0.035, p.y);
  alpha *= smoothstep(0.0, 0.8, lt) * edgeFade(p);
  alpha *= 1.0 - land * smoothstep(0.0, 1.0, (lt - fallDur) / max(uRest, 0.01));
  #ifdef TUMBLE
    vec3 ax = normalize(aSeed2.xyz * 2.0 - 1.0 + vec3(0.0, 0.001, 0.0));
    float ang = tl * uSpin * (0.5 + aSeed2.w) + aSeed.x * 6.283;
    mat3 R = axisAngle(ax, ang);
    float yaw = aSeed.z * 6.283;
    mat3 Rf = mat3(cos(yaw), 0.0, -sin(yaw), 0.0, 1.0, 0.0, sin(yaw), 0.0, cos(yaw));
    R = land > 0.5 ? Rf : R;
    corner = R * vec3(q.x, 0.0, q.y) * size;
    nrm = R * vec3(0.0, 1.0, 0.0);
    vLit = 0.7 + 0.45 * abs(dot(nrm, uSunDirF));
  #else
    alpha *= smoothstep(0.0, 0.35, hy + 0.05) * (1.0 - land);
    corner = (camR * q.x + camU * q.y) * size;
    vLit = 1.0;
  #endif
#elif defined(MODE_BUBBLE)
  vec2 base = aSeed.xz * uBox.xz;
  vec2 p = wrapXZ(base + vec2(sin(uTime * 0.7 + aSeed.w * 9.0), cos(uTime * 0.6 + aSeed.x * 7.0)) * uSwirl);
  float g = groundAt(p), dep = uHInfo.z - g;
  float rise = fract(uTime * uFall / max(dep, 0.2) * (0.6 + 0.8 * aSeed.y) + aSeed.w);
  wp = vec3(p.x + sin(rise * 12.0 + aSeed.x * 6.0) * 0.05, g + rise * max(dep - 0.03, 0.0), p.y);
  alpha *= step(0.12, dep) * smoothstep(0.0, 0.15, rise) * (1.0 - smoothstep(0.85, 1.0, rise)) * edgeFade(p);
  corner = (camR * q.x + camU * q.y) * size * (0.6 + 0.6 * rise);
  vLit = 1.0;
#else
  // MODE_FLOAT (fireflies, motes, plankton) and MODE_GLINT (sparkles on water / snow)
  vec2 base = aSeed.xz * uBox.xz;
  float ph = aSeed.w * 6.283;
  vec3 wob = vec3(sin(uTime * 0.37 * (0.6 + aSeed.y) + ph), sin(uTime * 0.53 + ph * 1.7), cos(uTime * 0.29 * (0.7 + aSeed.x) + ph * 2.3)) * uSwirl;
  vec2 p = wrapXZ(base + wob.xz + uWindV * uTime * 0.15);
  float g = groundAt(p);
  #ifdef MODE_GLINT
    float y = uHInfo.w < -0.5 ? uHInfo.z + 0.03 : g + 0.06;
    float tw = sin(uTime * uBlink * (0.5 + aSeed.y) + ph);
    alpha *= pow(max(tw, 0.0), 12.0);
  #else
    float y = g + mix(uYRange.x, uYRange.y, aSeed.y) + wob.y * 0.35;
    if (uHInfo.z > -90.0 && y < uHInfo.z + 0.15 && uHInfo.w > -0.5) y = max(y, uHInfo.z + mix(uYRange.x, uYRange.y, aSeed.y));
    if (uBlink > 0.0) alpha *= pow(0.5 + 0.5 * sin(uTime * uBlink * (0.6 + aSeed.x) + ph), 3.0);
  #endif
  wp = vec3(p.x, y, p.y);
  alpha *= edgeFade(p) * smoothstep(0.0, 1.5, uTime - aSeed.w * 2.0);
  corner = (camR * q.x + camU * q.y) * size;
  vLit = 1.0;
#endif
  // where the field may live: land / water rule, the density mask
  if (uHInfo.z > -90.0 && uHInfo.w != 0.0) {
    float dep = uHInfo.z - groundAt(wp.xz);
    alpha *= uHInfo.w > 0.0 ? step(dep, 0.04) : step(0.06, dep);
  }
  if (uMaskOn > 0.5) {
    float m = dot(texture2D(uMaskTex, clamp(wp.xz / 112.0, 0.001, 0.999)), uMaskSel);
    alpha *= smoothstep(fract(aSeed2.z * 13.7) - 0.15, fract(aSeed2.z * 13.7) + 0.15, m);
  }
  // fade out right in front of the camera (no big smears over the hero)
  alpha *= smoothstep(uCamFade * 0.5, uCamFade, distance(cameraPosition, wp));
  vCol = vec4(col, alpha);
  if (alpha < 0.003) corner = vec3(0.0);
  wp += corner;
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FIELD_FS = /* glsl */`
#include <common>
#include <fog_pars_fragment>
uniform sampler2D uMap;
varying vec2 vUv;
varying vec4 vCol;
varying float vLit;
void main() {
  vec4 t = texture2D(uMap, vUv);
  vec4 c = vec4(vCol.rgb * t.rgb * vLit, vCol.a * t.a);
  if (c.a < 0.01) discard;
  gl_FragColor = c;
#ifdef USE_FOG
  #include <fog_fragment>
#endif
}`;

// shafts of light: quads billboarded around the sun direction, soft across, fading at both ends, shimmering
const SHAFT_VS = /* glsl */`
#include <common>
attribute vec4 aShaft;   // x, z, width, length
attribute vec2 aSeed;
uniform vec3 uSunDirF;
uniform sampler2D uHeight;
uniform vec4 uHInfo;
uniform float uTime;
varying vec2 vUv;
varying float vFade;
varying float vPh;
void main() {
  vUv = uv; vPh = aSeed.x * 6.283;
  vec2 t = (aShaft.xy - uHInfo.x) / uHInfo.y;
  vec3 foot = vec3(aShaft.x, texture2D(uHeight, clamp(t, 0.002, 0.998)).r - 0.3, aShaft.y);
  vec3 axis = normalize(uSunDirF);
  vec3 vd = normalize(cameraPosition - foot);
  vec3 side = normalize(cross(axis, vd) + vec3(0.0001, 0.0, 0.0));
  float k = position.y + 0.5;
  vec3 wp = foot + axis * k * aShaft.w + side * position.x * aShaft.z * (0.75 + k * 0.6);
  wp.xz += vec2(sin(uTime * 0.21 + vPh), cos(uTime * 0.17 + vPh)) * 0.25 * k;
  float cd = distance(cameraPosition, foot + axis * aShaft.w * 0.4);
  vFade = smoothstep(5.0, 13.0, cd) * (0.55 + 0.45 * sin(uTime * 0.31 + vPh * 3.0) * sin(uTime * 0.13 + vPh));
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const SHAFT_FS = /* glsl */`
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTime;
varying vec2 vUv;
varying float vFade;
varying float vPh;
void main() {
  float across = sin(vUv.x * 3.14159);
  float streak = 0.65 + 0.35 * sin(vUv.x * 19.0 + vPh * 5.0 + sin(uTime * 0.4 + vPh) * 1.5);
  float a = pow(across, 1.6) * streak * smoothstep(0.0, 0.3, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y)) * vFade * uAlpha;
  if (a < 0.002) discard;
  gl_FragColor = vec4(uColor * a, a);
}`;

// soft puffs: mist banks lying low (drifting) and steam columns (rising, growing, fading)
const PUFF_VS = /* glsl */`
#include <common>
#include <fog_pars_vertex>
attribute vec4 aPuff;   // x, y, z, size
attribute vec4 aSeed;
uniform float uTime;
uniform vec2 uWindV;
uniform float uRise;     // steam: rise height (0 = mist)
uniform float uRate;
uniform float uAlpha;
uniform float uCamFade;
uniform float uFlat;
varying vec2 vUv;
varying float vA;
varying float vRot;
void main() {
  vUv = uv;
  vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 p = aPuff.xyz; float s = aPuff.w; float a = uAlpha;
  float ph = aSeed.x * 6.283;
  if (uRise > 0.0) {
    float life = fract(uTime * uRate * (0.75 + 0.5 * aSeed.y) + aSeed.z);
    p += vec3(sin(life * 5.0 + ph) * 0.25, life * uRise, cos(life * 4.0 + ph) * 0.25);
    p.xz += uWindV * life * life * uRise * 0.35;
    s *= mix(0.45, 1.6, life);
    a *= smoothstep(0.0, 0.18, life) * (1.0 - smoothstep(0.45, 1.0, life));
    vRot = ph + life * (aSeed.w - 0.5) * 2.0;
  } else {
    p.xz += vec2(sin(uTime * 0.043 + ph), cos(uTime * 0.037 + ph * 1.3)) * s * 0.18 + uWindV * sin(uTime * 0.02 + ph) * 2.0;
    a *= 0.75 + 0.25 * sin(uTime * 0.11 + ph * 2.0);
    vRot = ph + uTime * 0.01 * (aSeed.w - 0.5);
  }
  a *= smoothstep(uCamFade * 0.6, uCamFade, distance(cameraPosition, p));
  vA = a;
  vec2 q = position.xy;
  vec3 up = mix(camU, vec3(0.0, 1.0, 0.0), 0.3);
  vec3 wp = p + (camR * q.x + up * q.y * uFlat) * s;
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const PUFF_FS = /* glsl */`
#include <common>
#include <fog_pars_fragment>
uniform sampler2D uMap;
uniform vec3 uColor;
varying vec2 vUv;
varying float vA;
varying float vRot;
void main() {
  vec2 d = vUv - 0.5; float c = cos(vRot), s = sin(vRot);
  vec2 r = vec2(d.x * c - d.y * s, d.x * s + d.y * c) + 0.5;
  vec4 t = texture2D(uMap, r);
  float a = t.a * vA * smoothstep(0.5, 0.3, length(d));
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * (0.9 + 0.1 * t.r), a);
#ifdef USE_FOG
  #include <fog_fragment>
#endif
}`;

const quadGeo = () => { const q = new THREE.PlaneGeometry(1, 1); const g = new THREE.InstancedBufferGeometry(); g.index = q.index; g.setAttribute('position', q.attributes.position); g.setAttribute('uv', q.attributes.uv); return g; };

export class Weather {
  /** world: RegionWorld (scene, terrain, heightTex, fxMaskTex, quality, water level) */
  constructor(world) {
    this.world = world; this.scene = world.scene;
    this.q = QMUL[clamp(world.engine?.quality ?? 2, 0, 2)];
    this.fields = []; this.puffs = []; this.bursts = []; this.layer = null;
    this.center = new THREE.Vector3(56, 0, 56);
    this.windV = new THREE.Vector2(); this.windN = new THREE.Vector2(1, 0);
  }
  get hInfo() { const T = this.world.terrain; return new THREE.Vector4(T.hOrigin, T.hSize, this.world.waterLevel ?? -99, 0); }
  // ---- the generic GPU field
  field(o = {}) {
    const mode = o.mode || 'float', n = Math.max(1, Math.round((o.count ?? 400) * this.q));
    const g = quadGeo();
    const s1 = new Float32Array(n * 4), s2 = new Float32Array(n * 4);
    for (let i = 0; i < n * 4; i++) { s1[i] = Math.random(); s2[i] = Math.random(); }
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(s1, 4)); g.setAttribute('aSeed2', new THREE.InstancedBufferAttribute(s2, 4));
    g.instanceCount = n;
    const cols = (o.colors || ['#ffffff']).slice(0, 4).map(C); while (cols.length < 4) cols.push(cols[cols.length - 1].clone());
    const frames = (o.frames || [FRAME.dot]).slice(0, 4); const nf = frames.length; while (frames.length < 4) frames.push(frames[0]);
    const hi = this.hInfo; hi.w = o.land === 'land' ? 1 : o.land === 'water' ? -1 : 0;
    const maskSel = { canopy: [1, 0, 0, 0], shade: [0, 1, 0, 0], wet: [0, 0, 1, 0], custom: [0, 0, 0, 1] }[o.mask] || [0, 0, 0, 0];
    const box = o.box || [40, 10, 36];
    const u = {
      uTime: U.uTime, uCenter: { value: this.center }, uBox: { value: new THREE.Vector3(...box) },
      uWindV: { value: new THREE.Vector2() }, uWindN: { value: this.windN }, uGust: { value: o.gust ?? 0.6 },
      uFall: { value: o.fall ?? 1 }, uSize: { value: new THREE.Vector2(...(o.size || [0.1, 0.2])) }, uSwirl: { value: o.swirl ?? 0.5 },
      uRest: { value: o.rest ?? 0 }, uSpin: { value: o.spin ?? 2.5 }, uBlink: { value: o.blink ?? 0 }, uYRange: { value: new THREE.Vector2(...(o.y || [0.3, 2.5])) },
      uFrames: { value: new THREE.Vector4(...frames) }, uNFrames: { value: nf }, uCols: { value: cols }, uNCols: { value: o.colors?.length ? Math.min(4, o.colors.length) : 1 },
      uAlpha: { value: o.alpha ?? 1 }, uHeight: { value: this.world.heightTex }, uHInfo: { value: hi },
      uMaskTex: { value: this.world.fxMaskTex }, uMaskSel: { value: new THREE.Vector4(...maskSel) }, uMaskOn: { value: o.mask ? 1 : 0 },
      uSunDirF: { value: U.uSunDir.value }, uCamFade: { value: o.camFade ?? 5 }, uMap: { value: o.map || fxAtlas() },
    };
    const additive = o.additive ?? (mode === 'float' || mode === 'glint');
    const defines = { [mode === 'fall' ? 'MODE_FALL' : mode === 'bubble' ? 'MODE_BUBBLE' : mode === 'glint' ? 'MODE_GLINT' : 'MODE_FLOAT']: '' };
    if (o.tumble) defines.TUMBLE = '';
    const mat = new THREE.ShaderMaterial({
      vertexShader: FIELD_VS, fragmentShader: FIELD_FS, defines,
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...u },
      transparent: true, depthWrite: false, fog: !additive, side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false; mesh.renderOrder = o.order ?? (additive ? 13 : 11); mesh.name = 'fx:' + (o.name || mode);
    this.scene.add(mesh);
    const h = { mesh, u: mat.uniforms, windMul: o.wind ?? 1, set: p => { for (const k in p) if (mat.uniforms[k]) mat.uniforms[k].value = p[k]; }, setVisible: b => { mesh.visible = b; } };
    this.fields.push(h);
    return h;
  }
  // ---- presets
  snow(o = {}) { return this.field({ name: 'snow', mode: 'fall', count: 3200, box: [44, 9, 38], fall: 0.9, swirl: 0.8, gust: 1.6, size: [0.05, 0.13], frames: [FRAME.flake, FRAME.dot], colors: ['#ffffff', '#f2f6ff'], alpha: 0.95, camFade: 4, ...o }); }
  leaves(o = {}) {
    const kinds = { maple: [FRAME.maple], ginkgo: [FRAME.ginkgo], leaf: [FRAME.leaf], bamboo: [FRAME.bamboo], petal: [FRAME.petal], mixed: [FRAME.maple, FRAME.ginkgo, FRAME.leaf] };
    return this.field({ name: 'leaves', mode: 'fall', tumble: true, count: 260, box: [40, 8, 36], fall: 0.55, swirl: 1.1, gust: 0.9, spin: 2.2, rest: 6, size: [0.2, 0.32], frames: kinds[o.kind || 'maple'] || kinds.maple, colors: ['#e2482e', '#f47034', '#ffb84e', '#c42e2a'], ...o });
  }
  bambooLeaves(o = {}) { return this.leaves({ kind: 'bamboo', count: 150, colors: ['#b8d86a', '#d8d88a', '#e8cf86', '#9cc860'], size: [0.2, 0.3], fall: 0.45, rest: 5, ...o }); }
  petals(o = {}) { return this.leaves({ kind: 'petal', count: 240, colors: ['#ffc8dc', '#ffe0ec', '#ffb0cc'], size: [0.12, 0.18], fall: 0.4, swirl: 1.4, rest: 4, ...o }); }
  fireflies(o = {}) { return this.field({ name: 'fireflies', mode: 'float', count: 90, box: [40, 4, 36], size: [0.12, 0.2], y: [0.4, 2.4], swirl: 1.4, blink: 1.6, frames: [FRAME.dot], colors: ['#d8ff8a', '#fff0a0'], alpha: 1, land: 'land', ...o }); }
  motes(o = {}) { return this.field({ name: 'motes', mode: 'float', count: 360, box: [36, 5, 32], size: [0.03, 0.06], y: [0.3, 4.5], swirl: 0.9, blink: 0.4, frames: [FRAME.dot], colors: ['#fff6d8', '#ffffff'], alpha: 0.55, ...o }); }
  plankton(o = {}) { return this.field({ name: 'plankton', mode: 'float', count: 220, box: [30, 1, 30], size: [0.05, 0.1], y: [-0.25, -0.05], swirl: 0.6, blink: 1.1, frames: [FRAME.dot], colors: ['#8affe8', '#6ad8ff'], land: 'water', ...o }); }
  glints(o = {}) { return this.field({ name: 'glints', mode: 'glint', count: 420, box: [36, 1, 32], size: [0.1, 0.2], swirl: 0.2, blink: 2.2, frames: [FRAME.flake], colors: ['#ffffff', '#fff6d0'], alpha: 1, land: (o.on || 'water') === 'water' ? 'water' : 'land', ...o }); }
  bubbles(o = {}) { return this.field({ name: 'bubbles', mode: 'bubble', count: 260, box: [32, 1, 30], size: [0.04, 0.08], fall: 0.35, swirl: 0.06, frames: [FRAME.dot], colors: ['#e8fcff'], alpha: 0.7, additive: false, ...o }); }

  /** god rays: [{ x, z, w, len }] (or { auto: n } to pick clearings near the trail) */
  shafts(list, o = {}) {
    if (!Array.isArray(list)) list = this.world.autoSpots?.(list?.auto ?? 16, 'shaft') || [];
    const n = list.length; if (!n) return null;
    const g = quadGeo(), a = new Float32Array(n * 4), s = new Float32Array(n * 2);
    list.forEach((p, i) => { a.set([p.x, p.z, p.w ?? rand(1.6, 3), p.len ?? rand(9, 14)], i * 4); s.set([Math.random(), Math.random()], i * 2); });
    g.setAttribute('aShaft', new THREE.InstancedBufferAttribute(a, 4)); g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(s, 2)); g.instanceCount = n;
    const mat = new THREE.ShaderMaterial({
      vertexShader: SHAFT_VS, fragmentShader: SHAFT_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      uniforms: { uTime: U.uTime, uSunDirF: { value: this.world.sunDir }, uHeight: { value: this.world.heightTex }, uHInfo: { value: this.hInfo }, uColor: { value: C(o.color || '#fff2c8') }, uAlpha: { value: o.alpha ?? 0.16 } },
    });
    const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 14; mesh.name = 'fx:shafts';
    this.scene.add(mesh);
    const h = { mesh, u: mat.uniforms, set: p => { for (const k in p) if (mat.uniforms[k]) mat.uniforms[k].value = p[k]; }, setVisible: b => { mesh.visible = b; } };
    this.fields.push(h);
    return h;
  }
  _puffs(list, o, name) {
    const n = list.length; if (!n) return null;
    const g = quadGeo(), a = new Float32Array(n * 4), s = new Float32Array(n * 4);
    list.forEach((p, i) => { a.set([p.x, p.y, p.z, p.s], i * 4); s.set([Math.random(), Math.random(), p.k ?? Math.random(), Math.random()], i * 4); });
    g.setAttribute('aPuff', new THREE.InstancedBufferAttribute(a, 4)); g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(s, 4)); g.instanceCount = n;
    const mat = new THREE.ShaderMaterial({
      vertexShader: PUFF_VS, fragmentShader: PUFF_FS, transparent: true, depthWrite: false, fog: true,
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: U.uTime, uWindV: { value: new THREE.Vector2() }, uRise: { value: o.rise ?? 0 }, uRate: { value: o.rate ?? 0.25 }, uAlpha: { value: o.alpha ?? 0.3 }, uCamFade: { value: o.camFade ?? 9 }, uFlat: { value: o.flat ?? 0.6 }, uMap: { value: smokeTexture() }, uColor: { value: C(o.color || '#ffffff') } },
    });
    const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = o.order ?? 12; mesh.name = 'fx:' + name;
    this.scene.add(mesh);
    const h = { mesh, u: mat.uniforms, windMul: o.wind ?? (o.rise ? 1 : 0.4), set: p => { for (const k in p) if (mat.uniforms[k]) mat.uniforms[k].value = p[k]; }, setVisible: b => { mesh.visible = b; } };
    this.puffs.push(h);
    return h;
  }
  /** low mist banks: [{ x, z, r, y? }] (or { auto: n }: hollows off the trail) */
  mist(list, o = {}) {
    if (!Array.isArray(list)) list = this.world.autoSpots?.(list?.auto ?? 14, 'mist') || [];
    const H = (x, z) => this.world.heightAt(x, z), pts = [];
    for (const m of list) {
      const k = Math.max(2, Math.round((m.r ?? 6) / 2.2));
      for (let i = 0; i < k; i++) { const a = rand(0, TAU), d = Math.sqrt(Math.random()) * (m.r ?? 6) * 0.7, x = m.x + Math.cos(a) * d, z = m.z + Math.sin(a) * d; pts.push({ x, y: (m.y ?? H(x, z)) + rand(0.5, 1.2), z, s: rand(4.5, 7.5) * (o.scale ?? 1) }); }
    }
    return this._puffs(pts, { alpha: 0.22, flat: 0.45, camFade: 11, ...o }, 'mist');
  }
  /** steam columns: [{ x, z, y?, r? }] */
  steam(list, o = {}) {
    const H = (x, z) => this.world.heightAt(x, z), pts = [], per = Math.max(3, Math.round((o.puffs ?? 9) * this.q));
    for (const c of list) for (let i = 0; i < per; i++) { const a = rand(0, TAU), d = Math.random() * (c.r ?? 0.8); pts.push({ x: c.x + Math.cos(a) * d, y: c.y ?? H(c.x, c.z), z: c.z + Math.sin(a) * d, s: (o.size ?? 1.2) * rand(0.8, 1.2), k: i / per }); }
    return this._puffs(pts, { rise: 3.2, rate: 0.16, alpha: 0.32, flat: 1, camFade: 4, color: '#fbf6f2', ...o }, 'steam');
  }
  // ---- CPU bursts: sea spray at rocks, drips from leaves
  _layer() { if (!this.layer) this.layer = new ParticleLayer(this.scene, softDotTexture(), { additive: false, max: 600, order: 12 }); return this.layer; }
  /** sea spray: [{ x, z, y?, dir? }] bursting every few seconds near the focus */
  spray(points, o = {}) { const b = { kind: 'spray', points: points.map(p => ({ ...p, t: rand(0, 4) })), every: o.every ?? [2.5, 6], color: o.color || '#ffffff', size: o.size ?? 1, range: o.range ?? 30 }; this.bursts.push(b); this._layer(); return b; }
  /** dripping water: [{ x, z, y }] a drop every few seconds with a little splash */
  drips(points, o = {}) { const b = { kind: 'drip', points: points.map(p => ({ ...p, t: rand(0, 3) })), every: o.every ?? [1.5, 4], color: o.color || '#e8f8ff', range: o.range ?? 24 }; this.bursts.push(b); this._layer(); return b; }

  update(dt, t, focus) {
    if (focus) this.center.set(focus.x, focus.y, focus.z);
    const wd = U.uWindDir.value, ws = U.uWindStr.value;
    this.windN.copy(wd);
    for (const f of this.fields) if (f.u.uWindV) f.u.uWindV.value.set(wd.x, wd.y).multiplyScalar(ws * 0.9 * (f.windMul ?? 1));
    for (const p of this.puffs) p.u.uWindV.value.set(wd.x, wd.y).multiplyScalar(ws * (p.windMul ?? 0.4));
    if (this.layer) {
      for (const b of this.bursts) for (const p of b.points) {
        if (focus && (p.x - focus.x) ** 2 + (p.z - focus.z) ** 2 > b.range * b.range) continue;
        p.t -= dt; if (p.t > 0) continue;
        p.t = rand(b.every[0], b.every[1]);
        const y = p.y ?? this.world.heightAt(p.x, p.z);
        if (b.kind === 'spray') {
          const dx = p.dir?.x ?? 0, dz = p.dir?.z ?? 0;
          for (let i = 0; i < 14; i++) this.layer.spawn({ x: p.x + rand(-0.6, 0.6), y: y + 0.1, z: p.z + rand(-0.6, 0.6), vx: dx * rand(0.5, 1.5) + rand(-0.8, 0.8), vy: rand(2.2, 4.2) * b.size, vz: dz * rand(0.5, 1.5) + rand(-0.8, 0.8), grav: 7, drag: 0.6, life: rand(0.7, 1.2), size: rand(0.12, 0.28) * b.size, size1: 0.05, color: b.color, alpha: 0.9, alpha1: 0 });
          for (let i = 0; i < 3; i++) this.layer.spawn({ x: p.x + rand(-0.8, 0.8), y: y + rand(0.2, 0.7), z: p.z + rand(-0.8, 0.8), vy: rand(0.3, 0.8), life: rand(1, 1.6), size: 0.5 * b.size, size1: 1.4 * b.size, color: b.color, alpha: 0.35, alpha1: 0, drag: 1 });
        } else {
          const g = this.world.heightAt(p.x, p.z);
          this.layer.spawn({ x: p.x, y, z: p.z, vy: -0.5, grav: 9, life: Math.sqrt(2 * Math.max(0.2, y - g) / 9) + 0.05, size: 0.07, color: b.color, alpha: 0.9, alpha1: 0.8, stretch: 2.2,
            fn: (q) => { if (q.y <= g + 0.03) { q.y = g + 0.03; q.vy = 0; q.grav = 0; q.fn = null; q.life = q.t + 0.25; q.s1 = 0.3; q.stretch = 0.35; q.a1 = 0; } } });
        }
      }
      this.layer.update(dt, this.world.engine.camera);
    }
  }
  clear() { this.layer?.clear(); }
  dispose() {
    for (const f of [...this.fields, ...this.puffs]) { f.mesh.parent?.remove(f.mesh); f.mesh.geometry.dispose(); f.mesh.material.dispose(); }
    this.layer?.dispose();
    this.fields.length = 0; this.puffs.length = 0; this.bursts.length = 0; this.layer = null;
  }
}
