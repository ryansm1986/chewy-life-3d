// Umibōzu's effects (docs/REGIONS.md, Shiokaze Tidepools boss). Everything is built once per fight (BossRuntime
// pools, prewarmed behind the region's iris), lives in the region scene and is freed with it. Per-frame paths write
// into preallocated buffers only.
//   arms(B, mat)            two rubber-hose arms (instanced sphere chains) + mitten hands
//   waveRing(B)             expanding half-ring wave crest that follows the terrain, with a gap you can walk through
//   inkBlob / inkPuddle     lobbed ink blobs and the slick they leave
//   flood(B)                the phase-2 tide: a shallow sheet over the arena rim + surge telegraph / crash
//   seaPool(B)              stand-in sea behind him when the world has no water there (flat placeholder worlds)
//   foamRing / bodySheet    the churn at his waterline and the water sheeting off his body
import * as THREE from 'three';
import { makeToon, makeOutline } from '../../gfx/materials.js';
import { paint, merge } from '../../gfx/geom.js';
import { ell } from '../../dungeon/monsters.js';
import { splatTexture } from './kitB.js';
import { clamp, TAU } from '../../core/util.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const OPT = { transparent: true, depthWrite: false, toneMapped: false };
const VS_UV = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const VS_UVW = 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';

export const UMI = { body: '#236b7b', deep: '#15475a', belly: '#3894a3', sheen: '#62bcc6', palm: '#4aa6b0', ink: '#2a2356', inkRim: '#7a6ad0' };

// ================================================================== arms + hands
const NA = 16; // spheres per arm
function handGeo(thumbSide) {
  const P = [];
  P.push(ell(0.92, 0.36, 0.86, UMI.body, [0, 0, 0.92], [0, 0, 0], 22)); // palm
  for (const [x, yaw] of [[-0.52, -0.16], [0, 0], [0.52, 0.16]]) P.push(ell(0.3, 0.27, 0.56, UMI.body, [x * 1.02, -0.02, 1.62 + (x ? -0.08 : 0)], [0, yaw, 0], 14));
  P.push(ell(0.3, 0.26, 0.5, UMI.body, [thumbSide * 0.92, -0.02, 0.9], [0, thumbSide * 0.9, 0], 14)); // thumb
  P.push(ell(0.56, 0.5, 0.5, UMI.body, [0, 0.02, 0.2], [0, 0, 0], 16)); // wrist
  const g = merge(P);
  const D = new THREE.Color(UMI.body), L = new THREE.Color(UMI.palm), S = new THREE.Color(UMI.sheen);
  return paint(g, (p, n, o) => { o.copy(D); if (n.y < -0.25) o.lerp(L, clamp(-n.y)); if (n.y > 0.6) o.lerp(S, (n.y - 0.6) * 0.5); });
}
/** both arms. hand state: { pos (wrist), yaw, pitch, sq } — the brain moves them; update() rebuilds the chains */
export function arms(B, mat) {
  const sph = paint(new THREE.SphereGeometry(1, 16, 12), (p, n, o) => o.set(UMI.body).lerp(new THREE.Color(UMI.sheen), clamp(n.y * 0.35)));
  const olMat = makeOutline('#2a1622', 0.1);
  const chain = new THREE.InstancedMesh(sph, mat, NA * 2), chainOl = new THREE.InstancedMesh(sph, olMat, NA * 2);
  chain.castShadow = true; chain.receiveShadow = true; chain.frustumCulled = chainOl.frustumCulled = false;
  const hands = [1, -1].map(side => { // side +1 = his left (+x in his frame), -1 = his right
    const g = handGeo(-side);
    const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true;
    const ol = new THREE.Mesh(g, makeOutline('#2a1622', 0.06)); m.add(ol);
    m.frustumCulled = ol.frustumCulled = false;
    return { mesh: m, side, pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, sq: 0, shoulder: new THREE.Vector3(), sag: 1.4, lift: 0 };
  });
  B.scene.add(chain, chainOl, hands[0].mesh, hands[1].mesh);
  const A = {
    hands, chain, chainOl,
    set visible(v) { chain.visible = chainOl.visible = v; for (const h of hands) h.mesh.visible = v; },
    update(t) {
      for (let a = 0; a < 2; a++) {
        const h = hands[a], S0 = h.shoulder, W = h.pos;
        // control point: the mid point sagging (resting: the elbow under water) or arching (raised for a slam)
        _c.addVectors(S0, W).multiplyScalar(0.5); _c.y += h.lift - h.sag;
        for (let j = 0; j < NA; j++) {
          const u = j / (NA - 1), iu = 1 - u;
          _p.set(iu * iu * S0.x + 2 * iu * u * _c.x + u * u * W.x, iu * iu * S0.y + 2 * iu * u * _c.y + u * u * W.y, iu * iu * S0.z + 2 * iu * u * _c.z + u * u * W.z);
          const r = (0.68 - 0.24 * u) * (1 + 0.04 * Math.sin(t * 3 + j * 0.9 + a));
          _m.compose(_p, _q.identity(), _s.setScalar(r));
          chain.setMatrixAt(a * NA + j, _m); chainOl.setMatrixAt(a * NA + j, _m);
        }
        const m = h.mesh; m.position.copy(W);
        m.rotation.set(h.pitch, h.yaw, h.roll, 'YXZ');
        const sq = h.sq; m.scale.set(1 + sq * 0.12, 1 - sq * 0.3, 1 + sq * 0.12);
      }
      chain.instanceMatrix.needsUpdate = true; chainOl.instanceMatrix.needsUpdate = true;
    },
  };
  return A;
}

// ================================================================== the wave ring
// CPU-updated strip: SEG angle steps over the landward arc x PROF cross-section points. Each angle samples the terrain
// once, so the crest rides over dunes and rocks. aV = across the section (0 back foot, 0.5 crest, 1 front foot),
// aS = along the arc (0..1), aK = local crest strength (0 in the gap).
const SEG = 72, PROF = [[-0.95, 0], [-0.5, 0.55], [-0.14, 0.93], [0.14, 1.0], [0.38, 0.78], [0.62, 0.3], [0.86, 0]];
const NP = PROF.length;
const FS_WAVE = /* glsl */`uniform float uT, uA; varying float vV, vS, vK;
  void main() {
    float crest = 1.0 - abs(vV - 0.5) * 2.0;
    vec3 deep = vec3(0.06, 0.4, 0.52), mid = vec3(0.22, 0.74, 0.8), lite = vec3(0.55, 0.93, 0.92);
    vec3 c = mix(deep, mid, smoothstep(0.0, 0.75, crest));
    c = mix(c, lite, step(0.5, vV) * smoothstep(0.3, 0.9, crest) * 0.55); // the lit landward face
    float n = (sin(vS * 150.0 + uT * 3.1) * 0.5 + 0.5) * (sin(vS * 71.0 - uT * 2.3 + vV * 9.0) * 0.5 + 0.5);
    float foam = smoothstep(0.7, 0.88, crest + n * 0.2);
    foam = max(foam, smoothstep(0.86, 1.0, vV) * 0.8 * (0.5 + 0.5 * n));      // the frothy front foot
    c = mix(c, vec3(0.97, 1.0, 1.0), foam);
    float foot = smoothstep(0.0, 0.16, min(vV, 1.0 - vV) + 0.02);
    float ends = smoothstep(0.0, 0.05, min(vS, 1.0 - vS));
    gl_FragColor = vec4(c, uA * foot * ends * smoothstep(0.04, 0.3, vK));
  }`;
const VS_WAVE = /* glsl */`attribute float aV, aS, aK; varying float vV, vS, vK;
  void main() { vV = aV; vS = aS; vK = aK; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
export function waveRingMesh(B) {
  const g = new THREE.BufferGeometry(), n = (SEG + 1) * NP;
  const pos = new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const aK = new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage);
  const aV = new Float32Array(n), aS = new Float32Array(n), idx = [];
  for (let i = 0; i <= SEG; i++) for (let j = 0; j < NP; j++) { aV[i * NP + j] = j / (NP - 1); aS[i * NP + j] = i / SEG; }
  for (let i = 0; i < SEG; i++) for (let j = 0; j < NP - 1; j++) { const a = i * NP + j, b = a + NP; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  g.setAttribute('position', pos); g.setAttribute('aK', aK); g.setAttribute('aV', new THREE.BufferAttribute(aV, 1)); g.setAttribute('aS', new THREE.BufferAttribute(aS, 1));
  g.setIndex(idx); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  const mat = new THREE.ShaderMaterial({ vertexShader: VS_WAVE, fragmentShader: FS_WAVE, uniforms: { uT: B.uT, uA: { value: 1 } }, ...OPT, side: THREE.DoubleSide });
  const m = new THREE.Mesh(g, mat); m.renderOrder = 10; m.visible = false;
  return m;
}
/** lay the ring out: centre (cx, cz), radius R, crest height H (m), arc centred on angle a0 (±half), gap at angle ga (half-width gw) */
export function layoutWave(m, W, cx, cz, R, H, a0, half, ga, gw, kOut) {
  const P = m.geometry.attributes.position.array, K = m.geometry.attributes.aK.array;
  for (let i = 0; i <= SEG; i++) {
    const a = a0 - half + (i / SEG) * half * 2, ca = Math.cos(a), sa = Math.sin(a);
    let d = Math.abs(a - ga); d = Math.min(d, TAU - d);
    const k = gw > 0 ? smooth(gw, gw + 0.12, d) : 1;
    if (kOut) kOut[i] = k;
    const gh = W.heightAt(cx + ca * R, cz + sa * R);
    for (let j = 0; j < NP; j++) {
      const [dx, hy] = PROF[j], r = R + dx * (0.8 + H * 0.35), o = (i * NP + j) * 3;
      P[o] = cx + ca * r; P[o + 1] = gh + 0.03 + hy * H * k; P[o + 2] = cz + sa * r;
      K[i * NP + j] = k * clamp(H / 0.25);
    }
  }
  m.geometry.attributes.position.needsUpdate = true; m.geometry.attributes.aK.needsUpdate = true;
}
function smooth(a, b, x) { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); }

// ================================================================== ink
export function inkBlobMesh() {
  const g = paint(new THREE.SphereGeometry(0.5, 16, 12), (p, n, o) => o.set(UMI.ink).lerp(new THREE.Color('#5a4aa0'), clamp(n.y * 0.5 + 0.1)));
  const m = new THREE.Mesh(g, makeToon({ vertexColors: true, rim: 0.9, brush: 0.04, fragOut: 'outgoingLight += vec3(0.5, 0.45, 0.9) * pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.5) * 0.5;' }));
  m.add(new THREE.Mesh(g, makeOutline('#1a1030', 0.04)));
  m.castShadow = true; m.visible = false;
  return m;
}
const FS_PUDDLE = /* glsl */`uniform sampler2D uMap; uniform float uA, uT, uSeed; uniform vec3 uCol, uRim; varying vec2 vUv;
  void main() {
    vec2 q = vUv - 0.5;
    float a = texture2D(uMap, vUv).a;
    float inner = texture2D(uMap, q / 0.84 + 0.5).a;
    float rim = clamp(a - inner, 0.0, 1.0);
    vec3 c = mix(uCol, uRim, rim * 0.85);
    float wob = sin(uT * 2.0 + uSeed) * 0.02;
    float hl = smoothstep(0.1, 0.0, length(q - vec2(-0.1 + wob, 0.1))) * 0.55 + smoothstep(0.035, 0.0, length(q - vec2(0.06, -0.05 - wob))) * 0.4;
    c += hl * vec3(0.55, 0.5, 0.95);
    gl_FragColor = vec4(c, a * uA * 0.94);
  }`;
export function inkPuddleMesh() {
  const g = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({ vertexShader: VS_UV, fragmentShader: FS_PUDDLE, ...OPT, polygonOffset: true, polygonOffsetFactor: -2,
    uniforms: { uMap: { value: splatTexture() }, uA: { value: 0 }, uT: { value: 0 }, uSeed: { value: 0 }, uCol: { value: new THREE.Color(UMI.ink) }, uRim: { value: new THREE.Color(UMI.inkRim) } } });
  const m = new THREE.Mesh(g, mat); m.renderOrder = 8; m.visible = false;
  return m;
}

// ================================================================== flood (phase 2) + stand-in sea
// A plane along the shore: local x across (W m), local z from 4 m seaward (uv.y 0) to D m inland (uv.y = 1).
const FS_FLOOD = /* glsl */`uniform float uT, uA, uEdge, uSurge, uWarn, uLen; varying vec2 vUv; varying vec3 vW;
  void main() {
    float y = vUv.y; if (y > uEdge) discard;
    float toEdge = (uEdge - y) * uLen;
    vec3 deep = vec3(0.14, 0.58, 0.68), shallow = vec3(0.46, 0.87, 0.85);
    vec3 c = mix(deep, shallow, smoothstep(0.0, 0.9, y));
    float r1 = sin(vW.x * 1.3 + uT * 1.6 + sin(vW.z * 0.9) * 1.5) * 0.5 + 0.5, r2 = sin(vW.z * 1.7 - uT * 1.2 + sin(vW.x * 0.7 + uT) * 1.2) * 0.5 + 0.5;
    c += vec3(0.8, 1.0, 0.95) * smoothstep(0.8, 1.0, r1 * r2) * 0.3;
    float foam = 1.0 - smoothstep(0.0, 0.7 + 0.5 * r1, toEdge);
    foam += smoothstep(0.8, 1.0, sin(toEdge * 2.6 - uT * 6.0 + r2 * 2.0)) * uSurge * (1.0 - smoothstep(0.0, 6.0, toEdge));
    foam = clamp(foam, 0.0, 1.0);
    c = mix(c, vec3(1.0), foam * 0.9);
    // surge warning: the telegraph's crawling hatch + a pulsing hot rim along the inland edge
    vec2 q = vW.xz;
    float hatch = smoothstep(0.42, 0.5, abs(fract((q.x - q.y) * 0.55 + uT * 1.4) - 0.5) * 2.0 - 0.1);
    float urg = 0.7 + 0.3 * sin(uT * 18.0);
    c = mix(c, vec3(1.0, 0.95, 0.9), uWarn * hatch * 0.35 * smoothstep(0.15, 0.4, y));
    c = mix(c, vec3(1.0, 0.42, 0.5), uWarn * (1.0 - smoothstep(0.0, 0.5, toEdge)) * urg);
    float side = smoothstep(0.0, 0.06, min(vUv.x, 1.0 - vUv.x));
    gl_FragColor = vec4(c, uA * (0.6 + 0.35 * foam + uWarn * 0.1) * side * smoothstep(0.0, 0.12, y));
  }`;
export function floodMesh(W, D) {
  const mat = new THREE.ShaderMaterial({ vertexShader: VS_UVW, fragmentShader: FS_FLOOD, ...OPT, polygonOffset: true, polygonOffsetFactor: -1,
    uniforms: { uT: { value: 0 }, uA: { value: 0 }, uEdge: { value: 0 }, uSurge: { value: 0 }, uWarn: { value: 0 }, uLen: { value: D + 4 } } });
  const m = new THREE.Mesh(stripGeo(W, -4, D), mat); m.renderOrder = 7; m.visible = false;
  return m;
}
/** an up-facing quad: local x in [-W/2, W/2], z from z0 (uv.y 0) to z1 (uv.y 1) */
function stripGeo(W, z0, z1) {
  const g = new THREE.BufferGeometry(), x0 = -W / 2, x1 = W / 2;
  g.setAttribute('position', new THREE.Float32BufferAttribute([x0, 0, z0, x1, 0, z0, x0, 0, z1, x1, 0, z1], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setIndex([0, 2, 1, 1, 2, 3]);
  return g;
}
const FS_SEA = /* glsl */`uniform float uT; varying vec2 vUv; varying vec3 vW;
  void main() {
    float y = vUv.y; // 0 at the shore → 1 far out
    vec3 c = mix(vec3(0.42, 0.86, 0.84), vec3(0.1, 0.46, 0.64), smoothstep(0.0, 0.5, y));
    float r1 = sin(vW.x * 0.9 + uT * 1.1 + sin(vW.z * 0.6) * 1.8) * 0.5 + 0.5, r2 = sin(vW.z * 1.1 - uT * 0.8 + sin(vW.x * 0.5 + uT * 0.7) * 1.4) * 0.5 + 0.5;
    c += vec3(0.7, 1.0, 0.95) * smoothstep(0.84, 1.0, r1 * r2) * 0.28 * (1.0 - y);
    c *= 0.94 + 0.1 * r2;
    float band = sin(y * 90.0 - uT * 1.8 + r1 * 3.0);
    float foam = smoothstep(0.75, 1.0, band) * (1.0 - smoothstep(0.0, 0.1, y)) * 0.8 + (1.0 - smoothstep(0.0, 0.012 + r1 * 0.01, y));
    c = mix(c, vec3(1.0), clamp(foam, 0.0, 1.0) * 0.9);
    float side = smoothstep(0.0, 0.1, min(vUv.x, 1.0 - vUv.x));
    gl_FragColor = vec4(c, (0.82 + 0.15 * foam) * side);
  }`;
/** stand-in sea for worlds without water behind the arena: W wide, D deep, shoreline at local z = 0, sea toward local +z */
export function seaPoolMesh(W, D) {
  const mat = new THREE.ShaderMaterial({ vertexShader: VS_UVW, fragmentShader: FS_SEA, uniforms: { uT: { value: 0 } }, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1 });
  const m = new THREE.Mesh(stripGeo(W, 0, D), mat); m.renderOrder = 2;
  return m;
}

// ================================================================== his waterline churn + the water sheeting off him
const FS_FOAM = /* glsl */`uniform float uT, uA; varying vec2 vUv;
  void main() {
    vec2 q = vUv - 0.5; float r = length(q) * 2.0, a = atan(q.y, q.x);
    float n = sin(a * 13.0 + uT * 1.7 + sin(a * 5.0 - uT) * 1.4) * 0.5 + 0.5;
    float n2 = sin(a * 29.0 - uT * 2.3 + r * 9.0) * 0.5 + 0.5;
    float band = smoothstep(0.52, 0.6, r) * (1.0 - smoothstep(0.62 + n * 0.22, 0.95, r));
    float rings = smoothstep(0.8, 1.0, sin(r * 26.0 - uT * 2.6 + n * 3.0)) * (1.0 - smoothstep(0.6, 1.0, r)) * step(0.55, r);
    float f = clamp(band * (0.55 + 0.45 * n2) + rings * 0.5, 0.0, 1.0);
    gl_FragColor = vec4(mix(vec3(0.72, 0.95, 0.95), vec3(1.0), f), f * uA);
  }`;
export function foamRingMesh() {
  const g = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({ vertexShader: VS_UV, fragmentShader: FS_FOAM, uniforms: { uT: { value: 0 }, uA: { value: 1 } }, ...OPT });
  const m = new THREE.Mesh(g, mat); m.renderOrder = 3;
  return m;
}
const VS_SHEET = /* glsl */`varying vec3 vN, vV, vO;
  void main() { vO = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
const FS_SHEET = /* glsl */`uniform float uT, uA; varying vec3 vN, vV, vO;
  void main() {
    float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
    float ang = atan(vO.x, vO.z);
    float s = sin(ang * 21.0 + sin(ang * 6.0) * 2.0) * 0.5 + 0.5;
    float flow = fract(vO.y * 2.4 + uT * 1.1 + s * 0.7);
    float streak = smoothstep(0.5, 0.95, s) * smoothstep(0.0, 0.25, flow) * (1.0 - smoothstep(0.45, 1.0, flow));
    float a = uA * (streak * 0.7 + fres * 0.28 + 0.05) * smoothstep(-0.02, 0.2, vO.y);
    gl_FragColor = vec4(mix(vec3(0.6, 0.93, 0.96), vec3(1.0), streak * 0.7), a);
  }`;
export function sheetMesh(geo) {
  const mat = new THREE.ShaderMaterial({ vertexShader: VS_SHEET, fragmentShader: FS_SHEET, uniforms: { uT: { value: 0 }, uA: { value: 0 } }, ...OPT });
  const m = new THREE.Mesh(geo, mat); m.renderOrder = 6; m.scale.setScalar(1.012);
  return m;
}
export { _a as _tmpA, _b as _tmpB };
