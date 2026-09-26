// Painterly toon material factory. Every lit surface in the game goes through makeToon() so the
// whole world shares one hand-painted look: soft terminator, cool coloured shadows, brush-stroke
// value noise, sun-side rim light, drifting cloud shadows and GPU wind.
import * as THREE from 'three';
import { brushTexture } from './textures.js';

// ------------------------------------------------------------------ shared uniforms
export const U = {
  uTime: { value: 0 },
  uWindDir: { value: new THREE.Vector2(0.8, 0.6).normalize() },
  uWindStr: { value: 1 },
  uBenders: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, -999, 0, 0)) },
  uBrush: { value: null },
  uRimColor: { value: new THREE.Color('#ffe6b8') },
  uCloudShadow: { value: 0.28 },
  uCloudOffset: { value: new THREE.Vector2() },
  uShadowTint: { value: new THREE.Color('#6a5acd') },
  uNight: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
  uSkyHor: { value: new THREE.Color('#d8f0ff') },
  uOccl: { value: new THREE.Vector4(-9999, -9999, 1, 0) }, // player screen px (x,y), radius px, view depth
  // painted light pools: the nearest lamps as (x, y, z, radius) + premultiplied colour; radius 0 ends the list
  uPoolPos: { value: Array.from({ length: 32 }, () => new THREE.Vector4()) },
  uPoolCol: { value: Array.from({ length: 32 }, () => new THREE.Vector3()) },
};
export function initSharedUniforms() { U.uBrush.value = brushTexture(); }

// Warm pools of lamp light on the ground and grass for every lamp in range, not just the 8 real point lights
// (see LightPool.update). Add to outgoingLight, multiplied by the surface colour.
export const POOL_GLSL = /* glsl */`
uniform vec4 uPoolPos[32];
uniform vec3 uPoolCol[32];
vec3 lightPools(vec3 wp) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 32; i++) {
    vec4 L = uPoolPos[i];
    if (L.w <= 0.0) break;
    vec2 d = wp.xz - L.xz;
    float f = clamp(1.0 - dot(d, d) / (L.w * L.w), 0.0, 1.0);
    acc += uPoolCol[i] * f * f;
  }
  return acc;
}
`;

// gradient kept linear filtered for a soft painted terminator
const WIND_GLSL = /* glsl */`
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStr;
uniform vec4 uBenders[8];
uniform float uWindAmt;

vec3 windOffset(vec3 wp, vec3 local, vec3 origin, int mode, vec2 uvv) {
  vec3 wd = vec3(uWindDir.x, 0.0, uWindDir.y);
  vec3 off = vec3(0.0);
  if (mode == 1) { // grass: local.y normalised 0..1 height
    float h = clamp(local.y, 0.0, 1.0);
    float h2 = h * h;
    float roll = sin(dot(origin.xz, uWindDir) * 0.28 - uTime * 1.7) * 0.5 + 0.5;
    roll = roll * roll * (3.0 - 2.0 * roll);
    float gust = sin(dot(origin.xz, vec2(0.071, 0.113)) + uTime * 0.53) * 0.5 + 0.5;
    float flutter = sin(uTime * 6.3 + origin.x * 3.7 + origin.z * 2.9) * 0.07;
    float bend = (0.12 + roll * 0.55 + gust * 0.25) * uWindStr + flutter;
    off = wd * bend * h2;
    for (int i = 0; i < 8; i++) {
      vec4 b = uBenders[i];
      vec2 d = origin.xz - b.xz;
      float dl = length(d);
      float f = (1.0 - smoothstep(b.w * 0.25, b.w, dl)) * step(0.001, b.w) * step(abs(origin.y - b.y), 1.5);
      off.xz += (d / max(dl, 0.001)) * f * 0.5 * h;
      off.y -= f * 0.28 * h;
    }
    off.y -= length(off.xz) * 0.35 * h;
  } else if (mode == 2 || mode == 3) { // tree trunk (2) / foliage (3)
    float h = max(local.y, 0.0);
    float ph = uTime * 1.05 + dot(origin.xz, vec2(0.37, 0.21));
    float gust = sin(dot(origin.xz, uWindDir) * 0.12 - uTime * 0.9) * 0.5 + 0.5;
    float sway = sin(ph) * 0.55 + sin(ph * 2.13 + 1.3) * 0.25;
    off = wd * (gust * 0.6 + sway * 0.4) * 0.012 * h * h * uWindStr;
    off += cross(wd, vec3(0.0, 1.0, 0.0)) * sin(ph * 0.77) * 0.006 * h * h * uWindStr;
    if (mode == 3) {
      float fl = uTime * 4.2 + wp.x * 2.3 + wp.y * 3.1 + wp.z * 1.7;
      off += vec3(sin(fl), sin(fl * 1.3 + 1.0) * 0.6, cos(fl * 0.9)) * 0.035 * (0.5 + gust) * uWindStr;
    }
  } else if (mode == 4) { // cloth: uv.y = 1 at top (attached)
    float hang = 1.0 - uvv.y;
    float ph = uTime * 3.1 + uvv.x * 5.0 + origin.x;
    off = wd * (sin(ph) * 0.5 + 0.6) * 0.18 * hang * hang * uWindStr;
    off.y += sin(ph * 1.7) * 0.02 * hang;
  } else if (mode == 5) { // tall reeds / bamboo / susuki: local.y in world units
    float h = max(local.y, 0.0);
    float roll = sin(dot(origin.xz, uWindDir) * 0.3 - uTime * 1.4) * 0.5 + 0.5;
    float ph = uTime * 2.2 + origin.x * 1.3 + origin.z * 0.9;
    off = wd * (roll * 0.7 + sin(ph) * 0.15 + 0.15) * 0.045 * h * h * uWindStr;
    off.y -= length(off.xz) * 0.25;
  }
  return off * uWindAmt;
}
`;

const PAINT_GLSL = /* glsl */`
uniform float uTime;
uniform sampler2D uBrush;
uniform float uBrushAmt;
uniform float uBrushScale;
uniform vec3 uRimColor;
uniform float uRimStr;
uniform vec2 uTerm;
uniform float uShadowSat;
uniform float uCloudShadow;
uniform vec2 uCloudOffset;
uniform float uNight;
uniform vec4 uOccl;
uniform float uOcclOn;
varying vec3 vCWorld;
varying vec3 vCObj;
varying vec3 vCWN;

float bayer4(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  int i = int(q.x) + int(q.y) * 4;
  float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return (m[i] + 0.5) / 16.0;
}
void occlusionFade(float fragDepth) {
  if (uOcclOn < 0.5) return;
  vec2 d = gl_FragCoord.xy - uOccl.xy;
  float r = length(d * vec2(1.0, 1.15)) / uOccl.z;
  if (r > 1.0) return;
  // clean circular cutaway (fully open inside) with a thin dithered rim, only for surfaces in front of Chewy
  float front = smoothstep(0.8, 2.0, uOccl.w - fragDepth);
  float k = smoothstep(1.0, 0.93, r) * front;
  if (k > 0.97 || bayer4(gl_FragCoord.xy) < k) discard;
}
float cloudShadowAt(vec3 p) {
  vec2 q = p.xz * 0.012 + uCloudOffset;
  float n = texture2D(uBrush, q).g * 0.6 + texture2D(uBrush, q * 2.3 + 0.37).g * 0.4;
  return smoothstep(0.47, 0.6, n);
}
vec3 brushSample(vec3 p, vec3 n) {
  vec3 w = abs(n); w = pow(w, vec3(4.0)); w /= (w.x + w.y + w.z + 1e-4);
  vec3 a = texture2D(uBrush, p.zy * uBrushScale).rgb;
  vec3 b = texture2D(uBrush, p.xz * uBrushScale).rgb;
  vec3 c = texture2D(uBrush, p.xy * uBrushScale).rgb;
  return a * w.x + b * w.y + c * w.z;
}
`;

// Soft toon light response + cool shadows
const TOON_LIGHT = /* glsl */`
varying vec3 vViewPosition;
struct ToonMaterial { vec3 diffuseColor; };
float cCloud = 1.0;
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
  float dotNL = dot( geometryNormal, directLight.direction );
  float band = smoothstep( uTerm.x, uTerm.y, dotNL );
  float soft = clamp( dotNL * 0.5 + 0.5, 0.0, 1.0 );
  vec3 irradiance = directLight.color * mix( band, soft, 0.25 );
  reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
  reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct RE_Direct_Toon
#define RE_IndirectDiffuse RE_IndirectDiffuse_Toon
`;

const WIND_MODES = { grass: 1, tree: 2, leaf: 3, cloth: 4, reed: 5 };

function injectVertex(shader, o) {
  const mode = o.wind ? WIND_MODES[o.wind] : 0;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${WIND_GLSL}\nvarying vec3 vCWorld;\nvarying vec3 vCObj;\nvarying vec3 vCWN;\n${o.vertexPars || ''}`)
    .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${o.fixedNormal ? `objectNormal = vec3(${o.fixedNormal.join(',')});` : ''}`)
    .replace('#include <project_vertex>', /* glsl */`
      vec4 mvPosition = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
        vec3 cOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      #else
        vec3 cOrigin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      #endif
      vec4 cWorld = modelMatrix * mvPosition;
      vCObj = transformed;
      ${mode ? `cWorld.xyz += windOffset(cWorld.xyz, transformed, cOrigin, ${mode}, uv);` : ''}
      ${o.vertexWorld || ''}
      vCWorld = cWorld.xyz;
      mvPosition = viewMatrix * cWorld;
      gl_Position = projectionMatrix * mvPosition;
    `)
    .replace('#include <worldpos_vertex>', 'vec4 worldPosition = cWorld;')
    .replace('#include <normal_vertex>', `#include <normal_vertex>\n vCWN = normalize( (modelMatrix * vec4(objectNormal, 0.0)).xyz );\n #ifdef USE_INSTANCING\n vCWN = normalize( (modelMatrix * instanceMatrix * vec4(objectNormal, 0.0)).xyz );\n #endif`);
}

function injectDepthVertex(shader, o) {
  const mode = o.wind ? WIND_MODES[o.wind] : 0;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${WIND_GLSL}\n${o.vertexPars || ''}`)
    .replace('#include <project_vertex>', /* glsl */`
      vec4 mvPosition = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
        vec3 cOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      #else
        vec3 cOrigin = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      #endif
      vec4 cWorld = modelMatrix * mvPosition;
      ${mode ? `cWorld.xyz += windOffset(cWorld.xyz, transformed, cOrigin, ${mode}, uv);` : ''}
      ${o.vertexWorld || ''}
      mvPosition = viewMatrix * cWorld;
      gl_Position = projectionMatrix * mvPosition;
    `)
    .replace('#include <worldpos_vertex>', 'vec4 worldPosition = cWorld;');
}

// Program cache keys derive from everything that changes generated GLSL, so materials with identical
// shader code share one compiled program (uniform values stay per-material).
function hashStr(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
function shaderKey(prefix, o) {
  return prefix + hashStr(JSON.stringify([o.wind || '', o.fixedNormal || '', !!o.noFlip, !!o.objectBrush, o.vertexPars || '', o.vertexWorld || '', o.fragPars || '', o.fragColor || '', o.fragNormal || '', o.fragOut || '', Object.keys(o.uniforms || {}).sort().join(',')]));
}
/**
 * makeToon(opts)
 *  color, map, alphaMap, vertexColors, emissive, emissiveIntensity, transparent, opacity, alphaTest, side
 *  brush (0..0.5 amount), brushScale, objectBrush (bool: brush in object space, for moving actors)
 *  rim (strength), term [a,b] terminator, shadowSat
 *  wind: 'grass'|'tree'|'leaf'|'cloth'|'reed', windAmt
 *  fixedNormal [x,y,z]
 *  uniforms {}, vertexPars, vertexWorld (glsl operating on cWorld), fragPars, fragColor (after color_fragment),
 *  fragNormal (after normal_fragment_maps; may perturb the view-space `normal`),
 *  fragOut (after outgoingLight computed; may modify outgoingLight)
 *  castShadow depth material is attached as mat.userData.depthMat when wind/alpha is used
 */
export function makeToon(o = {}) {
  const mat = new THREE.MeshToonMaterial({
    color: o.color ?? '#ffffff',
    map: o.map || null,
    alphaMap: o.alphaMap || null,
    vertexColors: !!o.vertexColors,
    emissive: o.emissive ?? '#000000',
    emissiveIntensity: o.emissiveIntensity ?? 1,
    transparent: !!o.transparent,
    opacity: o.opacity ?? 1,
    alphaTest: o.alphaTest ?? 0,
    side: o.side ?? THREE.FrontSide,
    fog: o.fog ?? true,
  });
  if (o.depthWrite === false) mat.depthWrite = false;
  const local = {
    uBrushAmt: { value: o.brush ?? 0.14 },
    uBrushScale: { value: o.brushScale ?? 0.35 },
    uRimStr: { value: o.rim ?? 0.35 },
    uTerm: { value: new THREE.Vector2(...(o.term || [-0.08, 0.32])) },
    uShadowSat: { value: o.shadowSat ?? 0.35 },
    uWindAmt: { value: o.windAmt ?? 1 },
    uOcclOn: { value: o.occluder ? 1 : 0 },
    ...(o.uniforms || {}),
  };
  mat.userData.u = local;
  if (o.noShadowCast) mat.userData.noCast = true;
  const key = shaderKey('toon', o);
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, U, local);
    injectVertex(shader, o);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${PAINT_GLSL}\n${o.fragPars || ''}`)
      .replace('#include <lights_toon_pars_fragment>', TOON_LIGHT)
      .replace('#include <normal_fragment_begin>', o.noFlip ? '#include <normal_fragment_begin>\n normal = normalize(vNormal); nonPerturbedNormal = normal;' : '#include <normal_fragment_begin>')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n occlusionFade(vViewPosition.z);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${o.fragNormal || ''}`)
      .replace('#include <color_fragment>', /* glsl */`
        #include <color_fragment>
        ${o.fragColor || ''}
        {
          vec3 bp = ${o.objectBrush ? 'vCObj * 2.0' : 'vCWorld'};
          vec3 bs = brushSample(bp, normalize(vCWN));
          float v = (bs.r - 0.5) * 1.3 + (bs.b - 0.5) * 0.9;
          diffuseColor.rgb *= 1.0 + v * uBrushAmt;
          // low-frequency painted hue drift: warmer / cooler patches
          float hb = bs.g - 0.5;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.06, 1.0, 0.9), clamp(hb * 2.0 * uBrushAmt * 3.0, 0.0, 1.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.92, 0.98, 1.08), clamp(-hb * 2.0 * uBrushAmt * 3.0, 0.0, 1.0));
        }
      `)
      .replace('#include <lights_fragment_begin>', `cCloud = 1.0 - cloudShadowAt(vCWorld) * uCloudShadow;\n#include <lights_fragment_begin>`)
      .replace('#include <opaque_fragment>', /* glsl */`
        {
          float dL = dot(reflectedLight.directDiffuse, vec3(0.333));
          float tL = dot(reflectedLight.directDiffuse + reflectedLight.indirectDiffuse, vec3(0.333)) + 1e-4;
          float litAmt = clamp(dL / tL, 0.0, 1.0);
          // hand-painted shadows: more saturated
          float lum = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
          outgoingLight = max(mix(vec3(lum), outgoingLight, 1.0 + uShadowSat * (1.0 - litAmt)), 0.0);
          vec3 Vd = normalize(vViewPosition);
          float ndv = clamp(dot(normal, Vd), 0.0, 1.0);
          float rim = smoothstep(0.35, 1.0, 1.0 - ndv);
          outgoingLight += uRimColor * rim * rim * uRimStr * (0.25 + 0.75 * litAmt) * (1.0 - uNight * 0.6) * diffuseColor.rgb * 1.6;
          ${o.fragOut || ''}
        }
        #include <opaque_fragment>
      `);
    // cloud shadow dims the sun (directional light 0) only
    shader.fragmentShader = shader.fragmentShader.replace(
      'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;',
      'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;\n directLight.color *= (UNROLLED_LOOP_INDEX == 0) ? cCloud : 1.0;'
    );
    mat.userData.shader = shader;
  };
  if (o.wind || o.alphaTest || o.vertexWorld) mat.userData.depthMat = makeDepth(o);
  return mat;
}

export function makeDepth(o) {
  const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: o.map || null, alphaMap: o.alphaMap || null, alphaTest: o.alphaTest || 0, side: o.side ?? THREE.FrontSide });
  const local = { uWindAmt: { value: o.windAmt ?? 1 }, ...(o.uniforms || {}) };
  const key = shaderKey('depth', o);
  dm.customProgramCacheKey = () => key;
  dm.onBeforeCompile = shader => { Object.assign(shader.uniforms, U, local); injectDepthVertex(shader, o); };
  return dm;
}

// Apply the depth material (for wind/alpha shadows) to a mesh
export function applyDepth(mesh) {
  const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (m?.userData?.depthMat) mesh.customDepthMaterial = m.userData.depthMat;
  return mesh;
}

// Unlit additive/alpha material for glows, VFX and particles
export function makeGlow({ map, color = '#ffffff', opacity = 1, additive = true, depthTest = true, side = THREE.DoubleSide } = {}) {
  return new THREE.MeshBasicMaterial({
    map, color, transparent: true, opacity, depthWrite: false, depthTest, side,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false, toneMapped: false,
  });
}

// Inverted-hull outline material (for characters / props that need a cartoon contour)
export function makeOutline(color = '#3a2230', width = 0.02) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, fog: true });
  const w = { value: width };
  m.userData.width = w;
  m.customProgramCacheKey = () => 'outline';
  m.onBeforeCompile = s => {
    s.uniforms.uOutW = w;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uOutW;')
      .replace('#include <begin_vertex>', 'vec3 transformed = position + normalize(normal) * uOutW;');
  };
  return m;
}
