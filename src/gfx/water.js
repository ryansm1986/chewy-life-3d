// Stylised water: depth-tinted, shoreline foam bands, caustics, sun glints. Receives shadows via makeToon.
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
      float wDepth; float wFoam;
      float wn(vec2 p) { return texture2D(uBrush, p).r; }
    `,
    fragColor: /* glsl */`
      {
        vec2 tuv = (vCWorld.xz - uOrigin) / uWorld;
        float th = texture2D(uHeight, clamp(tuv, 0.002, 0.998)).r;
        if (tuv.x < 0.0 || tuv.y < 0.0 || tuv.x > 1.0 || tuv.y > 1.0) th = -3.0;
        wDepth = max(uLevel - th, 0.0);
        float d = smoothstep(0.0, 1.6, wDepth);
        vec3 c = mix(uShallow, uDeep, d);
        c = mix(vec3(0.72, 0.96, 0.9), c, smoothstep(0.0, 0.35, wDepth));
        // drifting painterly ripples
        vec2 flow = uTime * vec2(0.012, 0.02);
        float r1 = wn(vCWorld.xz * 0.08 + flow);
        float r2 = wn(vCWorld.xz * 0.13 - flow * 1.3 + 0.5);
        float rip = r1 * 0.5 + r2 * 0.5;
        c *= 0.92 + rip * 0.16;
        // caustics in the shallows
        float ca = abs(sin(r1 * 18.0 + uTime * 1.2) * sin(r2 * 16.0 - uTime * 0.9));
        c += vec3(0.7, 1.0, 0.95) * smoothstep(0.75, 1.0, ca) * (1.0 - smoothstep(0.1, 1.2, wDepth)) * 0.25;
        // shoreline foam bands creeping in and out
        float band = sin(wDepth * 14.0 - uTime * 1.8 + rip * 5.0);
        float f = smoothstep(0.6, 0.95, band) * (1.0 - smoothstep(0.05, 0.55, wDepth)) * 0.8;
        f += 1.0 - smoothstep(0.02, 0.1 + rip * 0.08, wDepth);
        wFoam = clamp(f, 0.0, 1.0);
        c = mix(c, uFoamCol, wFoam * 0.85);
        diffuseColor.rgb = c;
        diffuseColor.a = mix(0.5, 0.94, smoothstep(0.0, 1.1, wDepth)) + wFoam * 0.4;
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
        outgoingLight = mix(outgoingLight, uSky * (0.6 + 0.4 * (1.0 - uNight)), fres * 0.35 * (1.0 - wFoam));
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
