// The Town Portal's look (docs/ZONES.md §4.2; ROADMAP Z-H2): a round stone moon gate on a low plinth, a shimenawa rope
// with paper shide and a little bell across its top, and in the ring a soft swirl in the colours of where it leads (the
// floor you left, seen from Blossom Hollow; Blossom Hollow's sakura and sky, seen from the floor). The swirl is a normal
// alpha-blended disc with no additive glare and colours kept under the bloom's knee, so it never washes the screen out;
// a faint ground glow and a few motes drift up from it. open(k) 0…1 grows it (the cast); dispose() frees its geometry.
//   const P = portalModel({ colors: ['#7fb35a', '#ffc88a', '#fff0d0'] }); scene.add(P.group); P.update(dt, t, vfx)
import * as THREE from 'three';
import { makeToon, makeOutline } from '../gfx/materials.js';
import { paint, merge, tube } from '../gfx/geom.js';
import { glowTexture } from '../gfx/textures.js';

const TAU = Math.PI * 2;
let FRAME = null; // (the stone ring, plinth, rope and shide: built once, shared, never disposed per portal)
function frameGeometry() {
  if (FRAME) return FRAME;
  const stoneHi = new THREE.Color('#c2b6a6'), stoneLo = new THREE.Color('#7a6f64'), moss = new THREE.Color('#7f9a55');
  const nz = (x, y, z) => Math.sin(x * 9.1 + z * 4.3) * Math.cos(y * 7.7 - x * 3.1) * 0.5 + Math.sin(x * 23 + y * 17 + z * 13) * 0.2;
  const stonePaint = mossy => (p, n, o) => { const k = Math.max(0, Math.min(1, 0.5 + n.y * 0.3 + nz(p.x, p.y, p.z) * 0.25)); o.copy(stoneLo).lerp(stoneHi, k); if (mossy && n.y > 0.35 && nz(p.x * 2, p.y, p.z * 2) > 0.05) o.lerp(moss, 0.55); };
  // the ring: a torus standing up (r 1.08, a chunky 0.19 tube), its foot set into the plinth
  const ring = new THREE.TorusGeometry(1.08, 0.19, 12, 48); ring.translate(0, 1.22, 0); paint(ring, stonePaint(true));
  // the plinth: a low rounded slab and a step
  const slab = new THREE.CylinderGeometry(1.0, 1.12, 0.22, 28, 1); slab.scale(1, 1, 0.55); slab.translate(0, 0.11, 0); paint(slab, stonePaint(false));
  const step = new THREE.CylinderGeometry(0.62, 0.7, 0.12, 24, 1); step.scale(1, 1, 0.6); step.translate(0, 0.27, 0); paint(step, stonePaint(true));
  // the rope across the ring's top (a sagging shimenawa) and its paper shide
  const rope = tube(Array.from({ length: 11 }, (_, i) => { const u = i / 10 - 0.5; return { p: new THREE.Vector3(u * 1.5, 2.16 - 0.16 * (1 - (2 * u) ** 2), 0.12), r: 0.055 + 0.02 * (1 - Math.abs(2 * u)) }; }), 7);
  paint(rope, (p, n, o) => o.set('#d8c08a').lerp(new THREE.Color('#a8885a'), 0.5 + 0.5 * Math.sin(p.x * 30 + p.y * 12)));
  const shide = [];
  for (const x of [-0.45, 0, 0.45]) {
    const g = new THREE.BufferGeometry(), y0 = 2.05 - 0.16 * (1 - (2 * x / 1.5) ** 2) - 0.02, w = 0.07, zz = 0.14;
    const v = [x - w, y0, zz, x + w, y0, zz, x + w * 0.4, y0 - 0.14, zz, x + w * 1.2, y0 - 0.14, zz, x - w * 0.6, y0 - 0.28, zz, x + w * 0.6, y0 - 0.28, zz];
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 3, 5, 4]); g.computeVertexNormals();
    paint(g, (p, n, o) => o.set('#fffaf0')); shide.push(g);
  }
  const bell = new THREE.SphereGeometry(0.075, 12, 8); bell.translate(0, 1.84, 0.16); paint(bell, (p, n, o) => o.set('#e8b84a').lerp(new THREE.Color('#fff0b0'), Math.max(0, n.y)));
  FRAME = { stone: merge([ring, slab, step]), cloth: merge([rope, ...shide, bell]) };
  for (const g of Object.values(FRAME)) g.userData.shared = true;
  return FRAME;
}
const VERT = 'varying vec2 vU; void main() { vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
// the swirl: a vortex of light. A deep blue-lavender at the rim brightens toward a pale heart (the tunnel's depth); the
// place's first colour turns inward over it in three soft arms, a finer second swirl and a few star specks drift in along
// them, and a pale rim edges the ring. Every colour stays under ~0.9 so the bloom never flares it; alpha fades at the edge.
const FRAG = /* glsl */`uniform float uT, uOpen; uniform vec3 uA, uB, uC; varying vec2 vU;
  float hash(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec2 p = vU * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard;
    float a = atan(p.y, p.x), tw = r * 7.0 - uT * 1.5;
    float s1 = 0.5 + 0.5 * sin(a * 3.0 + tw), s2 = 0.5 + 0.5 * sin(a * 5.0 - r * 11.0 + uT * 2.3);
    vec3 lav = vec3(0.70, 0.60, 0.95), deep = mix(uB, lav, 0.35) * 0.74;
    float g = smoothstep(0.98, 0.0, r);
    vec3 col = mix(deep, mix(uB, uC, 0.55), g * 0.85);
    col = mix(col, uA, smoothstep(0.38, 0.92, s1) * (0.3 + 0.4 * smoothstep(0.1, 0.75, r)));
    col = mix(col, uC, s2 * 0.16 * (1.0 - r));
    float heart = smoothstep(0.4, 0.0, r); col = mix(col, uC, heart * 0.5);
    vec2 q = vec2(a / 6.2832 * 3.0 + uT * 0.04, log(r + 0.06) * 1.3 + uT * 0.35) * 7.0;
    vec2 cell = floor(q), f = fract(q) - 0.5; float h = hash(cell);
    float star = smoothstep(0.2, 0.03, length(f + (vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5) * 0.5)) * step(0.78, h);
    col = mix(col, vec3(1.0, 0.97, 0.99), star * (0.6 + 0.4 * sin(uT * 4.0 + h * 40.0)) * smoothstep(0.98, 0.35, r) * 0.85);
    float rim = smoothstep(0.82, 0.95, r) * smoothstep(1.0, 0.95, r); col = mix(col, vec3(1.0, 0.97, 0.93), rim * 0.4);
    float open = clamp(uOpen, 0.0, 1.0), grow = smoothstep(open * 1.02, open * 1.02 - 0.12, r);
    gl_FragColor = vec4(min(col * 0.92, vec3(0.92)), (0.86 + 0.1 * heart) * grow * smoothstep(0.0, 0.2, open));
  }`;

/** a Town Portal → { group, open(k), setColors(colors), update(dt, t, vfx), dispose() } (colors: [a, b, c] hex: the two
 *  swirl bands and the heart; size: the gate's scale, 1 = a 2.5 m ring, the game's 0.78 a ring the heroes step through) */
export function portalModel({ colors = ['#ff9ec0', '#8fd0ff', '#fff4e8'], frame = true, light = null, size = 0.78 } = {}) {
  const group = new THREE.Group(); group.name = 'townPortal';
  const root = new THREE.Group(); root.scale.setScalar(size); group.add(root); // (the group's own scale stays free for the cast's grow)
  const F = frameGeometry();
  const parts = [];
  if (frame) {
    const sm = makeToon({ vertexColors: true, rim: 0.22, brush: 0.25 }), cm = makeToon({ vertexColors: true, rim: 0.2 });
    const stone = new THREE.Mesh(F.stone, sm), cloth = new THREE.Mesh(F.cloth, cm);
    stone.castShadow = true; cloth.castShadow = true; stone.receiveShadow = true;
    stone.add(new THREE.Mesh(F.stone, makeOutline('#3a2a30', 0.022)));
    root.add(stone, cloth); parts.push(sm, cm);
  }
  const C = c => new THREE.Color(c);
  const U = { uT: { value: 0 }, uOpen: { value: 1 }, uA: { value: C(colors[0]) }, uB: { value: C(colors[1]) }, uC: { value: C(colors[2] || colors[1]) } };
  const dm = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.93, 48), dm); disc.position.y = 1.22; disc.renderOrder = 2;
  const GLOW = 0.16; // (a faint pool of the swirl's light on the ground in front of the gate, never a tinted floor)
  const gm = new THREE.MeshBasicMaterial({ map: glowTexture(), color: C(colors[1]), transparent: true, opacity: GLOW, depthWrite: false, toneMapped: false });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), gm); glow.rotation.x = -Math.PI / 2; glow.position.set(0, 0.04, 0.35); glow.renderOrder = 1;
  root.add(disc, glow); parts.push(dm, gm);
  let open = 1, moteT = 0;
  const api = {
    group, disc, light,
    /** how far open (0 closed … 1 open): the swirl grows from its heart */
    open(k) { open = Math.max(0, Math.min(1, k)); U.uOpen.value = open; gm.opacity = GLOW * open; disc.visible = glow.visible = open > 0.001; },
    get openness() { return open; },
    setColors(cs) { U.uA.value.set(cs[0]); U.uB.value.set(cs[1]); U.uC.value.set(cs[2] || cs[1]); gm.color.set(cs[1]); },
    /** every frame: the swirl turns; motes rise off it now and then (a few, small, never a burst) */
    update(dt, t, vfx, rate = 1) {
      U.uT.value = t;
      if (!vfx || open < 0.2) return;
      moteT -= dt * rate;
      if (moteT > 0) return;
      moteT = 0.12 + Math.random() * 0.16;
      const wp = new THREE.Vector3(); disc.getWorldPosition(wp);
      const a = Math.random() * TAU, rr = (0.25 + Math.random() * 0.65 * open) * size * group.scale.x, q = group.rotation.y;
      const lx = Math.cos(a) * rr, ly = Math.sin(a) * rr;
      vfx.spark?.spawn?.({ x: wp.x + Math.cos(q) * lx, y: wp.y + ly, z: wp.z - Math.sin(q) * lx, vy: 0.5 + Math.random() * 0.4, life: 1.1, size: 0.11, color: Math.random() < 0.5 ? colors[0] : colors[2] || colors[1], alpha: 0.8, alpha1: 0 });
    },
    dispose() { group.parent?.remove(group); disc.geometry.dispose(); glow.geometry.dispose(); for (const m of parts) m.dispose?.(); },
  };
  api.open(1);
  return api;
}
