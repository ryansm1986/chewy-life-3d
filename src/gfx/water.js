// Stylised water: clear in the shallows (the bed shows), a three-stop depth ramp, a moving caustic net on the bed,
// soft ripple highlights, a lapping shoreline, sun glints. Receives shadows via makeToon.
import * as THREE from 'three';
import { makeToon, U } from './materials.js';

export function makeWater({ heightTex, worldSize, size = 420, level = 0, center = [56, 56], deep = '#2a86c0', shallow = '#63d8d4', foam = '#ffffff', origin = [0, 0] }) {
  const geo = new THREE.PlaneGeometry(size, size, 1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(center[0], level, center[1]);
  const mat = makeToon({
    transparent: true, rim: 0, brush: 0.05, shadowSat: 0.2, term: [-1.0, -0.5],
    uniforms: {
      uHeight: { value: heightTex }, uWorld: { value: worldSize }, uLevel: { value: level }, uOrigin: { value: new THREE.Vector2(...origin) }, // (origin: where the height texture starts; regions)
      uDeep: { value: new THREE.Color(deep) }, uShallow: { value: new THREE.Color(shallow) }, uFoamCol: { value: new THREE.Color(foam) },
      uSunDir: U.uSunDir,
      uSky: U.uSkyHor,
    },
    fragPars: /* glsl */`
      uniform sampler2D uHeight; uniform float uWorld; uniform float uLevel; uniform vec2 uOrigin;
      uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uFoamCol; uniform vec3 uSunDir; uniform vec3 uSky;
      float wDepth; float wFoam; float wSheen;
      float wn(vec2 p) { return texture2D(uBrush, p).r; }
      vec2 wHash(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
      // animated cellular caustics: how close to a cell's edge (F2 - F1), the cell centres circling slowly
      float wCell(vec2 p, float t) {
        vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 g = vec2(float(x), float(y)), o = wHash(i + g);
          o = 0.5 + 0.4 * sin(t + 6.2831 * o);
          float d = length(g + o - f);
          if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
        }
        return d2 - d1;
      }
    `,
    fragColor: /* glsl */`
      {
        vec2 tuv = (vCWorld.xz - uOrigin) / uWorld;
        float th = texture2D(uHeight, clamp(tuv, 0.002, 0.998)).r;
        if (tuv.x < 0.0 || tuv.y < 0.0 || tuv.x > 1.0 || tuv.y > 1.0) th = -3.0;
        wDepth = max(uLevel - th, 0.0);
        vec2 q = vCWorld.xz;
        vec2 flow = uTime * vec2(0.012, 0.02);
        float r1 = wn(q * 0.08 + flow);
        float r2 = wn(q * 0.13 - flow * 1.3 + 0.5);
        float rip = r1 * 0.5 + r2 * 0.5;
        // colour by depth, three stops: a pale green-aqua rim, the shallow turquoise, the deep blue
        vec3 rim = mix(uShallow, vec3(0.55, 0.93, 0.82), 0.4);
        vec3 c = mix(rim, uShallow, smoothstep(0.0, 0.45, wDepth));
        c = mix(c, mix(uShallow, uDeep, 0.55), smoothstep(0.35, 1.1, wDepth));
        c = mix(c, uDeep, smoothstep(1.0, 2.6, wDepth));
        c *= 0.95 + rip * 0.1;
        // broad flowing waves: lighter crests and darker troughs, bent by slow noise so they never read as stripes
        float wv = sin(dot(q, vec2(0.6, 0.8)) * 1.05 + (wn(q * 0.045 + flow * 0.6) - 0.5) * 7.5 - uTime * 0.75);
        float wv2 = sin(dot(q, vec2(-0.75, 0.66)) * 0.8 + (wn(q * 0.06 - flow * 0.4 + 0.2) - 0.5) * 6.0 - uTime * 0.55);
        float crest = smoothstep(0.4, 0.95, wv * 0.6 + wv2 * 0.4), trough = smoothstep(-0.35, -0.95, wv * 0.6 + wv2 * 0.4);
        c = c * (1.0 - trough * 0.16) + vec3(0.5, 0.95, 1.0) * crest * 0.16;
        // caustics: a moving net of light on the bed, crisp in the shallows, fading with depth (two drifting layers)
        float shallow = 1.0 - smoothstep(0.05, 1.7, wDepth);
        if (shallow > 0.01) {
          vec2 wq = q * 0.95 + (vec2(r1, r2) - 0.5) * 1.4;
          float n1 = wCell(wq, uTime * 0.55), n2 = wCell(wq * 1.37 + 3.1, -uTime * 0.42);
          float net = (1.0 - smoothstep(0.0, 0.13, n1)) * 0.6 + (1.0 - smoothstep(0.0, 0.05, n1)) * 0.35 + (1.0 - smoothstep(0.0, 0.07, n2)) * 0.35;
          c += vec3(0.7, 1.0, 0.94) * clamp(net, 0.0, 1.0) * shallow * (0.2 + 0.16 * shallow);
        }
        // soft white ripple highlights on the surface: broken wavy lines drifting with the water
        vec2 sq = vec2(dot(q, vec2(0.8, -0.6)) * 0.62, dot(q, vec2(0.6, 0.8)) * 0.26) + (vec2(r2, r1) - 0.5) * 1.6; // (stretched across the waves: long arcs)
        float s1 = wCell(sq, uTime * 0.3);
        float lines = (1.0 - smoothstep(0.0, 0.06, s1)) * smoothstep(0.45, 0.72, wn(q * 0.05 - flow * 0.7)) * (0.55 + 0.45 * crest);
        wSheen = lines * (0.38 + 0.32 * smoothstep(0.2, 1.5, wDepth));
        // the shoreline: one bright lapping line at the water's edge and a faint band just off it
        float band = sin(wDepth * 11.0 - uTime * 1.6 + rip * 5.0);
        float f = smoothstep(0.7, 0.97, band) * (1.0 - smoothstep(0.04, 0.32, wDepth)) * 0.45;
        f += 1.0 - smoothstep(0.015, 0.07 + rip * 0.06, wDepth);
        wFoam = clamp(f, 0.0, 1.0);
        c = mix(c, vec3(0.97, 1.0, 0.98), wSheen * (1.0 - wFoam));
        c = mix(c, uFoamCol, wFoam * 0.85);
        // a little extra saturation (the scene's grade softens it again)
        c = max(mix(vec3(dot(c, vec3(0.3, 0.59, 0.11))), c, 1.22), 0.0);
        diffuseColor.rgb = c;
        // clear in the shallows (the bed shows through), more body as it deepens
        diffuseColor.a = mix(0.42, 0.94, smoothstep(0.0, 1.3, wDepth)) + wFoam * 0.5 + wSheen * 0.3;
        diffuseColor.a = clamp(diffuseColor.a, 0.0, 1.0);
      }
    `,
    fragOut: /* glsl */`
      {
        vec3 V = normalize(cameraPosition - vCWorld);
        float r1 = wn(vCWorld.xz * 0.21 + uTime * vec2(0.03, 0.05));
        float r2 = wn(vCWorld.xz * 0.27 - uTime * vec2(0.04, 0.02) + 0.3);
        vec3 N = normalize(vec3((r1 - 0.5) * 0.9, 1.0, (r2 - 0.5) * 0.9));
        vec3 R = reflect(-V, N);
        float fres = pow(1.0 - clamp(dot(V, N), 0.0, 1.0), 3.0);
        outgoingLight = mix(outgoingLight, uSky * (0.6 + 0.4 * (1.0 - uNight)), fres * 0.3 * (1.0 - wFoam) * smoothstep(0.1, 1.0, wDepth));
        float spec = pow(max(dot(R, normalize(uSunDir)), 0.0), 180.0);
        float glint = step(0.62, r1 * r2 * 2.2) * spec;
        outgoingLight += vec3(1.0, 0.95, 0.85) * (spec * 0.9 + glint * 4.0) * (1.0 - uNight * 0.7) * cCloud;
      }
    `,
  });
  mat.depthWrite = false;
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  m.renderOrder = 2;
  m.name = 'water';
  return m;
}
