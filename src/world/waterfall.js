// The waterfall off the northern cliffs (ROADMAP WB-1, the owner's pick: the "chunky toy diorama" mockup,
// tools/blender/work/codex/falls-bridge-style/concepts/option-C-falls.png): four glossy aqua curtains stepping down
// the ledges (vertical ribbon lobes, smooth glassy water over each lip, a scalloped hem), still water on each shelf,
// bubbly foam balls at every impact and a broken collar of them in the pool, ripple rings spreading from the foot,
// spray and mist, koi in the pool. The rocks, the moss and the plants are fallsGarden.js.
import * as THREE from 'three';
import { U, makeToon } from '../gfx/materials.js';
import { rand, mulberry32, TAU } from '../core/util.js';
import { buildFallsGarden } from './fallsGarden.js';
import { FALLS } from './layout.js';
import { Koi } from './koi.js';

const LOBES = 4.0; // ribbon lobes across a curtain
// the water is unlit (ShaderMaterial): it takes the horizon's tint and dims as the sky does, like the toon-lit rocks
const LIT = /* glsl */`
uniform vec3 uSkyHor;
vec3 lit(vec3 c) {
  float L = dot(uSkyHor, vec3(0.3, 0.59, 0.11));
  vec3 t = mix(vec3(1.0), uSkyHor / max(L, 0.15), 0.35);
  return c * t * mix(1.0, 0.6, clamp((0.85 - L) * 1.8, 0.0, 1.0)) * mix(1.0, 0.42, uNight);
}`;
const CURTAIN_VS = /* glsl */`
varying vec2 vUv; varying vec3 vW; varying vec3 vN;
void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
const CURTAIN_FS = /* glsl */`
uniform float uTime; uniform sampler2D uBrush; uniform float uNight; uniform vec3 uSunDir; uniform float uSeed;
varying vec2 vUv; varying vec3 vW; varying vec3 vN;
${LIT}
void main() {
  float u = vUv.x, v = vUv.y; // v: 0 at the lip, 1 at the hem
  float edge = smoothstep(0.0, 0.07, u) * smoothstep(1.0, 0.93, u);
  float lobe = 0.5 + 0.5 * cos((u - 0.5) * 6.2831 * ${LOBES.toFixed(1)});
  float n = texture2D(uBrush, vec2(u * 1.4 + uSeed, v * 0.4 - uTime * 0.8)).r;
  float n2 = texture2D(uBrush, vec2(u * 2.6 - uSeed, v * 0.8 - uTime * 1.4)).g;
  // the body: deep lagoon in the grooves, candy aqua on the lobes, scrolling pale streaks
  vec3 deep = vec3(0.16, 0.66, 0.84), aqua = vec3(0.36, 0.85, 0.93), pale = vec3(0.82, 0.97, 0.98);
  vec3 c = mix(deep, aqua, smoothstep(-0.6, 0.7, lobe)); // (soft grooves: the ribbons roll into each other)
  float streak = smoothstep(0.5, 0.85, n * 0.65 + n2 * 0.35 + lobe * 0.2);
  c = mix(c, pale, streak * 0.5);
  // gloss: a bright band down each lobe's crown, strongest up top
  c += vec3(0.35) * smoothstep(0.88, 1.0, lobe) * (1.0 - v * 0.6);
  // sun-side brightening (the toon ramp's warm key)
  c *= 0.9 + 0.2 * clamp(dot(normalize(vN), uSunDir), 0.0, 1.0);
  // the lip: smooth glassy water rolling over (a pale aqua sheen, not foam); the white boil only at the hem, where it lands
  float crown = smoothstep(0.14, 0.0, v);
  float boil = smoothstep(0.78, 1.0, v + (n2 - 0.5) * 0.18);
  c = mix(c, vec3(0.62, 0.93, 0.97), crown * 0.45);
  c = mix(c, vec3(0.97, 0.99, 0.96), boil * 0.92);
  gl_FragColor = vec4(lit(c), edge * mix(0.8, 0.97, max(streak, boil))); // (glassy in the grooves)
}`;
// still water on a shelf: lagoon blue flowing toward the lip (+z), brightening to foam at the lip
const SHELF_FS = /* glsl */`
uniform float uTime; uniform sampler2D uBrush; uniform float uNight;
varying vec2 vUv; varying vec3 vW; varying vec3 vN;
${LIT}
void main() {
  float u = vUv.x, v = vUv.y; // v: 0 at the back, 1 at the lip
  float edge = smoothstep(0.0, 0.12, u) * smoothstep(1.0, 0.88, u) * smoothstep(0.0, 0.2, v);
  float n = texture2D(uBrush, vec2(u * 1.6, v * 0.8 - uTime * 0.5)).r;
  vec3 c = mix(vec3(0.07, 0.6, 0.8), vec3(0.26, 0.8, 0.88), v * 0.7 + n * 0.3);
  c = mix(c, vec3(0.97, 0.99, 0.96), smoothstep(0.62, 0.78, n) * 0.5 + smoothstep(0.82, 1.0, v) * 0.75);
  gl_FragColor = vec4(lit(c), edge * 0.94);
}`;
// ripple rings spreading from the foot (and the white sheen of foam on the water round it)
const RIPPLE_FS = /* glsl */`
uniform float uTime; uniform float uNight; uniform sampler2D uBrush;
varying vec2 vUv; varying vec3 vW; varying vec3 vN;
${LIT}
void main() {
  vec2 q = (vUv - 0.5) * 2.0; q.y *= 1.25;
  float d = length(q);
  float n = texture2D(uBrush, vW.xz * 0.12).r;
  float ph = d * 4.2 - uTime * 0.55 + (n - 0.5) * 0.5;
  float broken = smoothstep(0.35, 0.65, texture2D(uBrush, vW.xz * 0.21 + vec2(uTime * 0.02, 0.0)).g); // (rings come and go in pieces)
  float ring = smoothstep(0.88, 0.97, fract(ph)) * smoothstep(0.9, 0.3, d) * smoothstep(0.12, 0.3, d) * broken;
  float sheen = smoothstep(0.45, 0.1, d) * (0.3 + 0.25 * n);
  float a = max(ring * 0.38, sheen);
  gl_FragColor = vec4(lit(vec3(0.97, 0.99, 0.96)), a);
}`;

export class Waterfall {
  constructor(world, vfx) {
    this.world = world; this.vfx = vfx;
    const S = FALLS.steps, X = FALLS.x;
    this.garden = buildFallsGarden(world);
    const base = { uTime: U.uTime, uBrush: U.uBrush, uNight: U.uNight, uSunDir: U.uSunDir, uSkyHor: U.uSkyHor };
    const mat = (fs, extra = {}) => new THREE.ShaderMaterial({ vertexShader: CURTAIN_VS, fragmentShader: fs, transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { ...base, ...extra } });
    this.mats = [];
    this.group = new THREE.Group(); this.group.name = 'waterfall'; world.scene.add(this.group);
    // ---- the curtains: each leaves its lip, arcs out and falls to the next shelf (or the pool)
    this.impacts = [];
    S.forEach((s, i) => {
      const X = s.x, yb = i < S.length - 1 ? S[i + 1].y + 0.02 : -0.05, drop = s.y - yb, throw_ = 0.62 * Math.sqrt(drop / 1.65);
      const m = mat(CURTAIN_FS, { uSeed: { value: i * 0.37 } }); this.mats.push(m);
      const mesh = new THREE.Mesh(curtainGeo(X, s.z, s.y, yb, s.w, throw_), m); mesh.renderOrder = 3; mesh.name = 'curtain' + i; this.group.add(mesh);
      this.impacts.push({ x: i < S.length - 1 ? S[i + 1].x : X, y: yb, z: s.z + throw_ + 0.05, w: s.w * 1.08 });
      // the shelf's still water behind the lip (the top one is the stream between the shoulder boulders)
      const back = i === 0 ? 2.4 : 1.25;
      const sm = mat(SHELF_FS); this.mats.push(sm);
      const shelf = new THREE.Mesh(shelfGeo(X, s.z - back, s.z + 0.02, s.y + 0.015, s.w + 0.3), sm); shelf.renderOrder = 2; this.group.add(shelf);
    });
    // ---- ripples round the foot
    const rm = mat(RIPPLE_FS); this.mats.push(rm);
    const rip = new THREE.Mesh(new THREE.PlaneGeometry(9, 9).rotateX(-PI2), rm);
    rip.position.set(X, 0.03, FALLS.foot.z + 1.6); rip.renderOrder = 3; this.group.add(rip); // (after the water: it lies on it)
    // ---- foam balls only where the water lands: a cluster on each shelf below a curtain, a broken collar in the pool
    this.foam = foamBalls(this.group, S, this.impacts);
    // ---- koi in the pool
    this.koi = new Koi(world.scene, [
      { x: 99.6, z: 33.6, rx: 2.4, rz: 2.0, speed: 0.22, phase: 0, s: 1.4 }, { x: 99.6, z: 33.6, rx: 2.4, rz: 2.0, speed: 0.22, phase: 2.2, s: 1.3 },
      { x: 98.4, z: 37.4, rx: 1.3, rz: 1.8, speed: -0.3, phase: 1, s: 1.15 }, { x: 101.2, z: 36.2, rx: 1.6, rz: 1.2, speed: 0.28, phase: 4, s: 1.45 },
    ]);
    this.top = S[0].y; this.base = new THREE.Vector3(X, -0.1, FALLS.foot.z);
    this.acc = 0;
  }
  update(dt, t, day) {
    const vfx = this.vfx;
    this.acc += dt * 30;
    while (this.acc > 1) {
      this.acc--;
      const im = this.impacts[Math.random() < 0.5 ? this.impacts.length - 1 : Math.floor(Math.random() * (this.impacts.length - 1))], x = im.x + rand(-im.w / 2, im.w / 2), z = im.z + rand(-0.2, 0.4);
      if (Math.random() < 0.4) vfx.smoke.spawn({ x, y: im.y + 0.1, z, vx: rand(-0.5, 0.5), vy: rand(0.5, 1.2), vz: rand(0.2, 1.0), life: rand(1, 1.8), size: rand(0.45, 0.8), size1: rand(1.2, 2.0), color: '#ffffff', alpha: 0.32, alpha1: 0, drag: 1.2, spin: rand(-1, 1) });
      else vfx.dot.spawn({ x, y: im.y + 0.1, z, vx: rand(-1.4, 1.4), vy: rand(1.4, 2.8), vz: rand(-0.2, 1.8), life: rand(0.4, 0.75), size: rand(0.07, 0.14), color: '#f4fcff', alpha: 0.95, alpha1: 0, grav: 9 });
    }
  }
}
const PI2 = Math.PI / 2;

// a curtain: rows from the lip (v 0) down to the hem (v 1); it leaves the lip moving out (+z) and falls (z grows with
// the square root of the drop), bulges a touch at its middle, and its lobes ripple the surface and scallop the hem
function curtainGeo(x, z0, yTop, yBot, w, throw_) {
  const NY = 16, NX = 20, pos = [], uv = [], idx = [];
  for (let i = 0; i <= NY; i++) {
    const t = i / NY, y = yTop - (yTop - yBot) * t, dz = throw_ * Math.sqrt(t) + 0.04;
    for (let j = 0; j <= NX; j++) {
      const u = j / NX, lobe = Math.cos((u - 0.5) * TAU * LOBES), ww = w * (1 + t * 0.1);
      const hem = t > 0.95 ? lobe * 0.07 : 0;
      pos.push(x + (u - 0.5) * ww, y - hem, z0 + dz + lobe * 0.035 + Math.sin(u * Math.PI) * 0.1 * (0.4 + t));
      uv.push(u, t);
    }
  }
  for (let i = 0; i < NY; i++) for (let j = 0; j < NX; j++) { const a = i * (NX + 1) + j, b = a + NX + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function shelfGeo(x, zBack, zLip, y, w) {
  const g = new THREE.PlaneGeometry(w, zLip - zBack, 6, 4); g.rotateX(-PI2); g.translate(x, y, (zBack + zLip) / 2);
  // uv.y: 0 at the back, 1 at the lip (PlaneGeometry's v runs the other way after the turn)
  const uvA = g.attributes.uv; for (let i = 0; i < uvA.count; i++) uvA.setY(i, 1 - uvA.getY(i));
  return g;
}

// bubbly foam: instanced squashed spheres that breathe and bob in the vertex shader (one draw call)
function foamBalls(group, S, impacts) {
  const rnd = mulberry32(2727), balls = [];
  const add = (x, y, z, r) => balls.push([x, y, z, r, rnd() * TAU]);
  impacts.forEach((im, i) => {
    const n = i === impacts.length - 1 ? 0 : 14;
    for (let k = 0; k < n; k++) add(im.x + (rnd() - 0.5) * im.w, im.y + 0.04, im.z + (rnd() - 0.3) * 0.35, 0.09 + rnd() * 0.1);
  });
  // the pool's collar: a broken arc of big balls round the foot, with smaller ones between, open toward the pool
  const foot = impacts[impacts.length - 1];
  for (let k = 0; k < 30; k++) {
    const a = -0.2 + (k / 29) * (Math.PI + 0.4), rr = 1.25 + rnd() * 0.45;
    if (rnd() < 0.18) continue; // (gaps)
    add(foot.x + Math.cos(a) * rr * 1.25, 0.0, foot.z + 0.3 + Math.sin(a) * rr * 0.55, 0.1 + rnd() * rnd() * 0.24);
  }
  for (let k = 0; k < 22; k++) add(foot.x + (rnd() - 0.5) * foot.w * 1.05, 0.03, foot.z + rnd() * 0.5, 0.12 + rnd() * 0.16);
  const sph = new THREE.IcosahedronGeometry(1, 2);
  const ig = new THREE.InstancedBufferGeometry(); ig.index = sph.index; ig.setAttribute('position', sph.attributes.position); ig.setAttribute('normal', sph.attributes.normal);
  ig.instanceCount = balls.length;
  ig.setAttribute('aFoam', new THREE.InstancedBufferAttribute(new Float32Array(balls.flatMap(b => b.slice(0, 4))), 4));
  ig.setAttribute('aPh', new THREE.InstancedBufferAttribute(new Float32Array(balls.map(b => b[4])), 1));
  const m = makeToon({
    color: '#f4faf6', emissive: '#cdeff6', emissiveIntensity: 0.12, brush: 0.04, rim: 0.5, term: [-0.3, 0.5], shadowSat: 0.1,
    vertexPars: 'attribute vec4 aFoam; attribute float aPh;',
    vertexWorld: /* glsl */`{
      float br = 0.86 + 0.16 * sin(uTime * 3.1 + aPh) + 0.06 * sin(uTime * 7.3 + aPh * 2.0);
      cWorld.xyz = aFoam.xyz + transformed * aFoam.w * br * vec3(1.0, 0.62, 1.0) + vec3(0.0, 0.025 * sin(uTime * 4.0 + aPh * 1.7), 0.0);
    }`,
  });
  const mesh = new THREE.Mesh(ig, m); mesh.frustumCulled = false; mesh.renderOrder = 4; mesh.castShadow = false;
  group.add(mesh);
  return { mesh, n: balls.length };
}
