// Chewy the samurai's props (docs/HEROES.md §8): the War Banner Howl nobori, the spirit pups' tiny kabuto, the Onigiri
// Toss rice ball, and the spectral material of Sakura Storm's bone blades and Moonlit Blades' moon blades. Geometries
// and materials are built once and shared (meshes are cheap wrappers); the outfit colours come from samuraiPalette.js.
import * as THREE from 'three';
import { makeToon } from './materials.js';
import { paint, merge, xf } from './geom.js';
import { SAMURAI } from './samuraiPalette.js';
import { katanaGeo } from '../actors/charKit.js';
import { TAU } from '../core/util.js';

const C = h => new THREE.Color(h);
const solid = (g, hex) => { const c = C(hex); return paint(g, (p, n, o) => o.copy(c)); };
const M = {};

// ------------------------------------------------------------------ the spectral blades
// a ghostly bone blade: bone-white through the middle, a cool moonlit rim (fresnel), see-through: normal blend, so a
// ring of them never adds up to a white-out
const VS_GHOST = /* glsl */`
varying vec3 vN; varying vec3 vV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const FS_GHOST = /* glsl */`
uniform vec3 uCore, uRim; uniform float uA; varying vec3 vN; varying vec3 vV;
void main() {
  float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6);
  gl_FragColor = vec4(mix(uCore, uRim, rim), uA * (0.5 + 0.5 * rim));
}`;
/** a spectral material (one per look; uA fades it) */
export function spectralMaterial(core = '#fff6e6', rim = '#c8d8ff', a = 0.7) {
  return new THREE.ShaderMaterial({ vertexShader: VS_GHOST, fragmentShader: FS_GHOST, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false,
    uniforms: { uCore: { value: C(core) }, uRim: { value: C(rim) }, uA: { value: a } } });
}
/** Sakura Storm's blades: bone-white with a sakura-pink rim (shared: its alpha stays put) */
export function stormBladeMaterial() { return M.storm || (M.storm = spectralMaterial('#fff6ec', '#ffb8d0', 0.72)); }
/** the blade alone (no hilt), for the spectral blades: charKit.js katanaGeo's blade, centred on its middle. look: the
 *  katana look (default the game's: Sakura Storm's bone blades); Moonlit Blades pass 'classic', a pointed blade of
 *  moonlight that still falls point-first (the bone blade has a knob pair at each end, so either way a knob would land) */
export function spectralBladeGeo(look = null) {
  const key = `sbg|${look ?? ''}`;
  if (M[key]) return M[key];
  const g = katanaGeo(look == null ? {} : { variant: look }); g.computeBoundingBox();
  g.translate(0, -(g.boundingBox.max.y + 0.06) / 2, 0); // (the hilt's still there, but small and spectral too: a whole ghost katana)
  return (M[key] = g);
}

// ------------------------------------------------------------------ the kabuto (the spirit pups' tiny helmets)
/** a toy kabuto: a lacquered dome, a flared neck guard, turned-back side flaps, a gold crescent crest with a paw mon.
 *  Origin at the crown's base, facing +Z; about 0.3 m across (scale it to the head). */
export function kabutoGeo() {
  if (M.kab) return M.kab;
  const L = SAMURAI.lacquer, Gd = SAMURAI.gold, parts = [];
  const dome = new THREE.SphereGeometry(0.13, 18, 10, 0, TAU, 0, Math.PI / 2); dome.scale(1, 0.92, 1.05);
  parts.push(paint(dome, (p, n, o) => { o.set(L); if (Math.abs(p.x) < 0.012) o.set(Gd); })); // (a gold ridge down the middle)
  // the shikoro: a flared, stepped neck guard round the back and sides
  for (let i = 0; i < 2; i++) {
    const r0 = 0.135 + i * 0.03, r1 = 0.165 + i * 0.03, y = -0.012 - i * 0.03;
    const g = new THREE.CylinderGeometry(r0, r1, 0.03, 20, 1, true, Math.PI * 0.62, Math.PI * 1.76); g.translate(0, y, 0);
    parts.push(solid(g, i ? '#2e2a34' : L));
  }
  parts.push(solid(new THREE.TorusGeometry(0.132, 0.012, 6, 24), Gd).rotateX(Math.PI / 2)); // (the gold rim)
  // fukigaeshi: the side flaps, turned back
  for (const s of [-1, 1]) parts.push(solid(xf(new THREE.BoxGeometry(0.05, 0.06, 0.012), { p: [s * 0.13, 0.0, 0.07], r: [0, s * 0.9, 0] }), L));
  // the maedate: a gold crescent with the paw mon at its foot
  const cres = new THREE.TorusGeometry(0.09, 0.016, 6, 20, Math.PI * 0.95); cres.rotateZ(Math.PI * 0.025);
  parts.push(solid(xf(cres, { p: [0, 0.06, 0.13], r: [0, 0, 0] }), Gd));
  parts.push(solid(xf(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 14), { p: [0, 0.055, 0.135], r: [Math.PI / 2, 0, 0] }), SAMURAI.crest));
  return (M.kab = merge(parts));
}
export function kabutoMaterial() { return M.kabM || (M.kabM = makeToon({ vertexColors: true, rim: 0.7, brush: 0.02, emissive: '#2a2030', emissiveIntensity: 0.6 })); }

// ------------------------------------------------------------------ the onigiri
/** a rice ball: a soft white triangle with a nori band, ~0.3 m (the Onigiri Toss projectile) */
export function onigiriGeo() {
  if (M.oni) return M.oni;
  const s = new THREE.Shape(), R = 0.13, rr = 0.05;
  const pts = [0, 1, 2].map(i => { const a = Math.PI / 2 + i * TAU / 3; return [Math.cos(a) * R, Math.sin(a) * R]; });
  pts.forEach(([x, y], i) => { const [px, py] = pts[(i + 2) % 3], [nx, ny] = pts[(i + 1) % 3]; const a = [x + (px - x) * rr / R, y + (py - y) * rr / R], b = [x + (nx - x) * rr / R, y + (ny - y) * rr / R]; i ? s.lineTo(a[0], a[1]) : s.moveTo(a[0], a[1]); s.quadraticCurveTo(x, y, b[0], b[1]); });
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 4, curveSegments: 6 });
  g.translate(0, 0, -0.035);
  const nori = C('#24302a'), rice = C('#fffaf0'), shade = C('#f0ead8');
  paint(g, (p, n, o) => { if (p.y < -0.025 && Math.abs(p.x) < 0.055) o.copy(nori); else o.copy(n.z > 0.4 ? rice : shade); });
  return (M.oni = g);
}
export function onigiriMaterial() { return M.oniM || (M.oniM = makeToon({ vertexColors: true, rim: 0.6, brush: 0.04, emissive: '#fff4d8', emissiveIntensity: 0.25 })); }

// ------------------------------------------------------------------ the nobori (War Banner Howl)
function bannerTex() {
  if (M.btex) return M.btex;
  const c = document.createElement('canvas'); c.width = 128; c.height = 320; const g = c.getContext('2d');
  g.fillStyle = SAMURAI.banner; g.fillRect(0, 0, 128, 320);
  g.fillStyle = SAMURAI.bannerTrim; g.fillRect(0, 0, 128, 26); g.fillRect(0, 300, 128, 20);
  // the loops (chichi) along the pole side
  g.fillStyle = SAMURAI.bannerTrim; for (let y = 40; y < 300; y += 36) g.fillRect(0, y, 10, 14);
  // the mon: a gold ring and the paw print
  const cx = 66, cy = 120, R = 40;
  g.strokeStyle = SAMURAI.crest; g.lineWidth = 7; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
  g.fillStyle = SAMURAI.crest;
  g.beginPath(); g.ellipse(cx, cy + 9, 15, 12, 0, 0, TAU); g.fill();
  for (const [dx, dy] of [[-18, -6], [-7, -18], [7, -18], [18, -6]]) { g.beginPath(); g.ellipse(cx + dx, cy + dy, 6, 7.5, 0, 0, TAU); g.fill(); }
  // three gold dashes below (a little calligraphy flourish) and a thin gold border
  for (let i = 0; i < 3; i++) g.fillRect(56, 190 + i * 28, 20, 9);
  g.strokeStyle = SAMURAI.bannerTrim; g.lineWidth = 3; g.strokeRect(14, 30, 110, 266);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (M.btex = t);
}
/** a nobori: a lacquered pole with a gold finial and a crossbar, the black cloth with the gold paw mon hanging from it
 *  (about 2.1 m tall; origin at the foot of the pole, the cloth on its +X side). flutter(t) waves the cloth. */
export function bannerMesh() {
  const grp = new THREE.Group();
  const pole = M.bpole || (M.bpole = merge([
    solid(xf(new THREE.CylinderGeometry(0.022, 0.026, 2.1, 10), { p: [0, 1.05, 0] }), SAMURAI.lacquer),
    solid(xf(new THREE.SphereGeometry(0.045, 12, 8), { p: [0, 2.13, 0] }), SAMURAI.gold),
    solid(xf(new THREE.CylinderGeometry(0.016, 0.016, 0.58, 8), { p: [0.27, 1.98, 0], r: [0, 0, Math.PI / 2] }), SAMURAI.lacquer),
    solid(xf(new THREE.SphereGeometry(0.024, 10, 6), { p: [0.56, 1.98, 0] }), SAMURAI.gold),
    solid(xf(new THREE.CylinderGeometry(0.05, 0.065, 0.06, 12), { p: [0, 0.03, 0] }), SAMURAI.gold),
  ]));
  M.bpoleM ||= makeToon({ vertexColors: true, rim: 0.5, brush: 0.02 });
  grp.add(new THREE.Mesh(pole, M.bpoleM));
  const W = 0.52, H = 1.36, cg = new THREE.PlaneGeometry(W, H, 6, 10); cg.translate(W / 2 + 0.03, 1.96 - H / 2, 0);
  M.bclothM ||= makeToon({ map: bannerTex(), side: THREE.DoubleSide, rim: 0.3, brush: 0.03 });
  const cloth = new THREE.Mesh(cg, M.bclothM); grp.add(cloth);
  const base = Float32Array.from(cg.attributes.position.array);
  grp.userData.flutter = (t, k = 1) => { // (no allocation: the cloth's own positions, rippled away from the pole)
    const P = cg.attributes.position, a = P.array;
    for (let i = 0; i < P.count; i++) { const x = base[i * 3], y = base[i * 3 + 1], u = (x - 0.03) / W; a[i * 3 + 2] = Math.sin(t * 5 + x * 7 - y * 2) * 0.06 * u * k + Math.sin(t * 2.3 + y * 3) * 0.025 * u * k; }
    P.needsUpdate = true;
  };
  grp.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  return grp;
}
