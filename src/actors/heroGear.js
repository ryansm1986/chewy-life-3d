// Hero gear: Moka's staffs. makeStaff(look) builds one merged, vertex-coloured toon mesh (shaft + head) plus a
// glowing orb that blooms softly (emissive above the bloom threshold + an additive halo). `look` is the item's icon
// ({ variant, colors: [shaft, glow, accent] }, see rpg/items.js), so every staff base looks different:
//   drift  driftwood crook cradling the orb, blue ribbon bow, a rubber-duck charm (Moka's starter staff)
//   duck   honey-wood staff with a wrapped grip, the orb in a carved cup, a rubber duck perched on the rim
//   star   slim indigo staff with gold rings, a five-point star frame round the orb, a dangling star
//   moon   navy staff with a silver spiral, a crescent moon cradling the orb, a star charm on a thread
//   coral  knobbly coral staff whose branches curl up into a cage round a sea-pearl orb, a scallop shell
//   sun    lighthouse-striped staff, the orb in a sun of rays with a red lantern ring and cap
// Staff space: +Y up the shaft from the grip (origin, where the paw closes), +Z forward; the foot is at y = -0.34.
// Attach to rig.parts.handR with STAFF_GRIP (a relaxed grip for the baked Moka's paw: the staff stands upright at
// her side in the rest pose, its foot just off the ground).
import * as THREE from 'three';
import { makeToon } from '../gfx/materials.js';
import { tube, paint, merge, xf } from '../gfx/geom.js';
import { glowTexture } from '../gfx/textures.js';

export const STAFF_GRIP = { position: [-0.007, -0.022, 0.034], rotation: [0.06, 0, 0.05] };
export const STAFF_VARIANTS = ['drift', 'duck', 'star', 'moon', 'coral', 'sun'];
const DEFAULT_COLORS = {
  drift: ['#b89a74', '#5ce0d0', '#4a8adf'], duck: ['#c98f5e', '#ffe070', '#ff9a3a'], star: ['#5a4a8a', '#fff0a0', '#b89aff'],
  moon: ['#3a3a6a', '#dfe8ff', '#8fb8ff'], coral: ['#ff9a8a', '#8fe8ff', '#ffd0e0'], sun: ['#f4f0e8', '#ffd84a', '#e8503a'],
};
const FOOT = -0.34;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const C = h => new THREE.Color(h);
const GOLD = '#f4c04a', DUCK = '#ffd23a', BEAK = '#ff8a26', INK = '#2a1a18';

// ------------------------------------------------------------------ small builders (all return painted geometry)
const col = (g, hex) => paint(g, (p, n, o) => o.set(hex));
const shade = (g, hex, fn) => { const c = C(hex); return paint(g, (p, n, o) => { o.copy(c); fn?.(p, n, o); }); };
const sphere = (r, hex, p = [0, 0, 0], s = [1, 1, 1], seg = [14, 10]) => col(xf(new THREE.SphereGeometry(r, seg[0], seg[1]), { p, s }), hex);
const ring = (R, r, hex, p, rot = [Math.PI / 2, 0, 0], seg = [8, 20]) => col(xf(new THREE.TorusGeometry(R, r, seg[0], seg[1]), { p, r: rot }), hex);
const cyl = (r0, r1, h, hex, p, rot = [0, 0, 0], seg = 12) => col(xf(new THREE.CylinderGeometry(r1, r0, h, seg, 1), { p, r: rot }), hex);
const cone = (r, h, hex, p, rot = [0, 0, 0], seg = 10) => col(xf(new THREE.ConeGeometry(r, h, seg), { p, r: rot }), hex);
const path = (pts, radii, radial = 8, cap = true) => tube(pts.map((p, i) => ({ p: Array.isArray(p) ? V3(...p) : p, r: radii[i] ?? radii })), radial, cap);

/** a shaft from the foot to `top`, with a gentle wobble; `r(t)` gives the radius along it (t 0 foot .. 1 top) */
function shaft(top, r, hex, { wobble = 0.004, segs = 18, radial = 9, knots = 0, grain = 0 } = {}) {
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, y = FOOT + (top - FOOT) * t;
    pts.push({ p: V3(wobble * Math.sin(y * 7 + 0.5), y, wobble * 0.7 * Math.sin(y * 5 + 1.3)), r: r(t) });
  }
  const g = tube(pts, radial, false);
  const c0 = C(hex), dark = c0.clone().multiplyScalar(0.72);
  shade(g, hex, (p, n, o) => { if (grain) o.lerp(dark, grain * (0.5 + 0.5 * Math.sin(p.y * 90 + 4 * Math.sin(p.x * 300)))); });
  const out = [g];
  for (let k = 0; k < knots; k++) {
    const y = FOOT + 0.2 + k * 0.27, a = k * 2.3;
    out.push(sphere(r(0.5) * 0.62, dark.getStyle(), [Math.cos(a) * r(0.5) * 0.8, y, Math.sin(a) * r(0.5) * 0.8], [1, 1.3, 1]));
  }
  out.push(sphere(r(0) * 1.15, C(hex).multiplyScalar(0.55).getStyle(), [0, FOOT + 0.006, 0], [1, 0.7, 1])); // foot cap
  return out;
}

/** a little rubber duck, body centre p, facing +z, scale s */
function rubberDuck(p, s = 1, yaw = 0) {
  const parts = [
    sphere(0.02, DUCK, [0, 0, 0], [1, 0.72, 1.25]),
    sphere(0.013, DUCK, [0, 0.019, 0.013]),
    sphere(0.007, BEAK, [0, 0.016, 0.027], [1.1, 0.5, 1.2]),
    sphere(0.0022, INK, [0.0072, 0.022, 0.022]), sphere(0.0022, INK, [-0.0072, 0.022, 0.022]),
    cone(0.008, 0.014, DUCK, [0, 0.008, -0.022], [-1.1, 0, 0], 8),
  ];
  return parts.map(g => xf(g, { p: [0, 0, 0], s: [s, s, s] })).map(g => xf(g, { p, r: [0, yaw, 0] }));
}

/** a 5-point star as a thick flat plate (faces +z) */
function starPlate(R, depth, hex, p, rot = [0, 0, 0], inner = 0.45) {
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? R * inner : R;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    i ? sh.lineTo(x, y) : sh.moveTo(x, y);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: depth * 0.5, bevelSize: R * 0.12, bevelSegments: 2, curveSegments: 1 });
  g.translate(0, 0, -depth / 2); g.computeVertexNormals();
  return col(xf(g, { p, r: rot }), hex);
}

/** a ribbon bow round the shaft at height y, tails hanging down the front */
function bow(y, r, hex) {
  const c = C(hex), d = c.clone().multiplyScalar(0.8).getStyle();
  const out = [ring(r + 0.004, 0.0055, hex, [0, y, 0], [Math.PI / 2, 0, 0], [6, 16]), sphere(0.009, d, [0, y, r + 0.008])];
  for (const s of [1, -1]) {
    out.push(col(xf(new THREE.TorusGeometry(0.016, 0.0055, 6, 12), { p: [s * 0.019, y + 0.006, r + 0.006], r: [0, s * 0.5, s * 0.35], s: [1, 0.72, 1] }), hex));
    out.push(path([[s * 0.004, y - 0.004, r + 0.01], [s * 0.012, y - 0.04, r + 0.014], [s * 0.02, y - 0.075, r + 0.01]], [0.0065, 0.0072, 0.0075], 6, true)
      .scale(1, 1, 0.45).translate(0, 0, (r + 0.012) * 0.55));
  }
  return out.map(g => (g.attributes.color ? g : col(g, hex)));
}

// ------------------------------------------------------------------ the six designs: { body: [geos], orb: [x,y,z], r }
const DESIGNS = {
  drift([wood, glow, ribbon]) {
    const O = V3(0, 0.79, 0.04), R = 0.066;
    const out = shaft(0.72, t => 0.0155 + 0.0022 * Math.sin(t * 31) + 0.0014 * Math.sin(t * 71 + 1) + 0.003 * Math.max(0, t - 0.85) / 0.15, wood, { knots: 3, grain: 0.35 });
    const arc = [];
    for (let i = 0; i <= 26; i++) {           // the crook: up the back, over the top, down the front, curling in
      const a = -2.55 + (5.15 * i) / 26, k = 1 - 0.2 * THREE.MathUtils.smoothstep(a, 1.8, 2.6);
      arc.push({ p: V3(0, O.y + R * Math.cos(a) * k, O.z + R * Math.sin(a) * k), r: 0.019 - 0.009 * THREE.MathUtils.smoothstep(a, -2.0, 2.6) });
    }
    out.push(shade(tube(arc, 9, true), wood, (p, n, o) => o.lerp(C('#efe2c8'), 0.3)));
    out.push(path([[0, 0.73, 0.012], [0.014, 0.77, 0.035], [0.02, 0.785, 0.05]], [0.008, 0.005, 0.0028], 6).applyMatrix4(new THREE.Matrix4()));
    out[out.length - 1] = col(out[out.length - 1], wood);
    out.push(...bow(0.655, 0.017, ribbon));
    out.push(path([[0, 0.648, 0.03], [0.004, 0.61, 0.036], [0.006, 0.585, 0.038]], [0.0014, 0.0014, 0.0014], 4, false));
    out[out.length - 1] = col(out[out.length - 1], ribbon);
    out.push(...rubberDuck([0.006, 0.565, 0.04], 0.95, 0.3));
    return { body: out, orb: O, r: 0.044 };
  },
  duck([wood, glow, accent]) {
    const top = 0.7, O = V3(0, 0.77, 0);
    const out = shaft(top, t => 0.0145 + 0.004 * t, wood, { wobble: 0.001, grain: 0.18 });
    for (let i = 0; i < 7; i++) out.push(ring(0.0165, 0.0042, i % 2 ? accent : C(wood).multiplyScalar(0.6).getStyle(), [0, -0.04 + i * 0.016, 0], [Math.PI / 2, 0, 0], [6, 14])); // wrapped grip
    const cup = new THREE.LatheGeometry([[0.016, 0], [0.024, 0.02], [0.042, 0.05], [0.052, 0.075], [0.049, 0.082], [0.036, 0.062]].map(([x, y]) => new THREE.Vector2(x, y)), 16);
    out.push(shade(xf(cup, { p: [0, top - 0.005, 0] }), wood, (p, n, o) => { if (p.y > top + 0.066) o.set(accent); }));
    out.push(ring(0.047, 0.006, accent, [0, top + 0.05, 0], [Math.PI / 2, 0, 0], [6, 20]));
    out.push(...rubberDuck([0, top + 0.09, 0.05], 1.25, 0));
    return { body: out, orb: O, r: 0.045 };
  },
  star([shaftC, glow, accent]) {
    const top = 0.7, O = V3(0, 0.815, 0);
    const out = shaft(top, t => 0.0125 + 0.003 * t, shaftC, { wobble: 0.0006 });
    for (const y of [-0.02, 0.2, 0.45, top - 0.01]) out.push(ring(0.0165, 0.005, GOLD, [0, y, 0], [Math.PI / 2, 0, 0], [6, 14]));
    out.push(cone(0.022, 0.05, GOLD, [0, top + 0.02, 0], [Math.PI, 0, 0], 12));
    // star frame: a tube along the star's outline, round the orb
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? 0.058 : 0.118;
      pts.push({ p: V3(Math.cos(a) * rr, O.y + Math.sin(a) * rr, 0), r: 0.0085 });
    }
    out.push(col(tube(pts, 7, false), accent));
    for (let i = 0; i < 5; i++) { const a = Math.PI / 2 + (i * 2 * Math.PI) / 5; out.push(sphere(0.012, GOLD, [Math.cos(a) * 0.118, O.y + Math.sin(a) * 0.118, 0])); }
    const ay = Math.PI / 2 + (3 * 2 * Math.PI) / 5;  // a little star dangles from the lower-left point
    const hx = Math.cos(ay) * 0.118, hy = O.y + Math.sin(ay) * 0.118;
    out.push(col(path([[hx, hy, 0], [hx - 0.004, hy - 0.05, 0.004]], [0.0012, 0.0012], 4, false), GOLD));
    out.push(starPlate(0.02, 0.006, GOLD, [hx - 0.004, hy - 0.066, 0.004]));
    return { body: out, orb: O, r: 0.04 };
  },
  moon([shaftC, glow, accent]) {
    const top = 0.7, O = V3(0, 0.8, 0.012);
    const silver = C(accent).lerp(C('#ffffff'), 0.45).getStyle();
    const out = shaft(top, t => 0.0135 + 0.0025 * t, shaftC, { wobble: 0.0008 });
    const sp = [];  // silver spiral wrap
    for (let i = 0; i <= 60; i++) { const t = i / 60, y = -0.06 + t * 0.62, a = t * Math.PI * 2 * 7; sp.push({ p: V3(Math.cos(a) * 0.0165, y, Math.sin(a) * 0.0165), r: 0.0032 }); }
    out.push(col(tube(sp, 5, false), silver));
    out.push(ring(0.019, 0.006, silver, [0, top, 0], [Math.PI / 2, 0, 0], [6, 14]));
    // crescent: an arc open at the top, thickest at its bottom, horns curling up round the orb
    const arc = [];
    for (let i = 0; i <= 24; i++) {
      const a = -Math.PI / 2 - 2.35 + (4.7 * i) / 24, w = Math.cos((a + Math.PI / 2) / 2.6);
      arc.push({ p: V3(Math.cos(a) * 0.072, O.y + Math.sin(a) * 0.072 + 0.004, -0.004), r: 0.004 + 0.02 * Math.max(0, w) });
    }
    out.push(shade(tube(arc, 10, true), silver, (p, n, o) => o.lerp(C('#ffffff'), 0.25 * Math.max(0, n.z))));
    out.push(col(path([[0.0, O.y - 0.075, 0], [0, top + 0.012, 0]], [0.011, 0.013], 8, false), silver));
    const tx = Math.cos(-Math.PI / 2 + 2.35) * 0.072, ty = O.y + Math.sin(-Math.PI / 2 + 2.35) * 0.072;
    out.push(col(path([[tx, ty, 0], [tx + 0.006, ty - 0.055, 0.006]], [0.0012, 0.0012], 4, false), silver));
    out.push(starPlate(0.018, 0.006, GOLD, [tx + 0.006, ty - 0.07, 0.006]));
    return { body: out, orb: O, r: 0.043 };
  },
  coral([coralC, glow, accent]) {
    const top = 0.66, O = V3(0, 0.77, 0);
    const out = shaft(top, t => 0.015 + 0.003 * Math.sin(t * 23) + 0.004 * t, coralC, { wobble: 0.006 });
    const nub = C(coralC).lerp(C('#ffffff'), 0.25).getStyle();
    for (let k = 0; k < 5; k++) {  // little branch nubs up the shaft
      const y = -0.1 + k * 0.15, a = k * 2.4, d = V3(Math.cos(a), 0.9, Math.sin(a)).normalize();
      out.push(col(path([V3(0, y, 0), V3(d.x * 0.03, y + 0.03, d.z * 0.03), V3(d.x * 0.045, y + 0.06, d.z * 0.045)], [0.009, 0.007, 0.006], 6), coralC));
      out.push(sphere(0.0075, nub, [d.x * 0.045, y + 0.062, d.z * 0.045]));
    }
    for (let k = 0; k < 4; k++) {  // the cage: branches curling up and in round the orb
      const a = (k / 4) * Math.PI * 2 + 0.4, ca = Math.cos(a), sa = Math.sin(a);
      const pts = [], rad = [];
      for (let i = 0; i <= 10; i++) { // up and out, then curling in over the orb
        const t = i / 10, ang = -0.2 + t * 2.5, rr = 0.012 + 0.052 * Math.sin(Math.min(ang, 2.2) * 0.9 + 0.5) * Math.min(1, t * 3);
        pts.push(V3(ca * rr, top - 0.02 + (O.y + 0.068 - top + 0.02) * (1 - (1 - t) * (1 - t)), sa * rr)); rad.push(0.012 - 0.006 * t);
      }
      pts[pts.length - 1] = V3(ca * 0.024, O.y + 0.068, sa * 0.024);
      out.push(col(path(pts, rad, 8), coralC));
      out.push(sphere(0.009, nub, [ca * 0.024, O.y + 0.07, sa * 0.024]));
    }
    // a scallop shell on the shaft (fan of ribs)
    const shell = new THREE.CircleGeometry(0.026, 14, 0, Math.PI); // a fan, ribbed and cupped, hinge down
    const sp = shell.attributes.position;
    for (let i = 0; i < sp.count; i++) { const x = sp.getX(i), y = sp.getY(i), a = Math.atan2(y, x), r = Math.hypot(x, y); sp.setZ(i, 0.004 * Math.cos(a * 14) * (r / 0.026) + 0.006 * (1 - (r / 0.026) ** 2)); }
    shell.computeVertexNormals();
    out.push(shade(xf(shell, { p: [0, 0.47, 0.019] }), accent, (p, n, o) => o.multiplyScalar(0.86 + 0.14 * Math.cos(Math.atan2(p.y - 0.47, p.x) * 14))));
    out.push(sphere(0.007, accent, [0, 0.468, 0.017], [1.4, 0.7, 1]));
    out.push(sphere(0.0055, '#ffffff', [0.016, 0.5, 0.026]));
    return { body: out, orb: O, r: 0.043 };
  },
  sun([shaftC, glow, accent]) {
    const top = 0.69, O = V3(0, 0.8, 0);
    const out = shaft(top, t => 0.015 + 0.002 * t, shaftC, { wobble: 0.0006, segs: 60 });
    const g = out[0];  // lighthouse stripes: repaint the shaft in bands
    const rings = []; // lighthouse stripes: thin painted bands on a finely segmented shaft, with a lip at each edge
    paint(g, (p, n, o) => o.set(Math.floor((p.y + 0.4) / 0.09) % 2 ? accent : shaftC));
    for (let y = -0.4 + 0.09; y < top; y += 0.09) rings.push(ring(0.0168, 0.0016, C(shaftC).multiplyScalar(0.92).getStyle(), [0, y, 0], [Math.PI / 2, 0, 0], [4, 16]));
    out.push(...rings);
    out.push(cyl(0.024, 0.02, 0.03, accent, [0, top + 0.005, 0], [0, 0, 0], 14));       // gallery
    out.push(ring(0.058, 0.0075, accent, [0, O.y, 0], [0, 0, 0], [8, 28]));             // lantern ring (faces forward)
    for (let i = 0; i < 12; i++) {                                                        // sun rays
      const a = (i / 12) * Math.PI * 2, long = i % 2 ? 0.03 : 0.045, rr = 0.066 + long / 2;
      out.push(cone(0.011, long, i % 2 ? GOLD : glow, [Math.cos(a) * rr, O.y + Math.sin(a) * rr, 0], [0, 0, a - Math.PI / 2], 6));
    }
    out.push(col(path([[0, top + 0.02, 0], [0, O.y - 0.066, 0]], [0.009, 0.009], 7, false), accent));
    out.push(cone(0.03, 0.04, accent, [0, O.y + 0.1, 0], [0, 0, 0], 12));
    out.push(sphere(0.009, GOLD, [0, O.y + 0.125, 0]));
    return { body: out, orb: O, r: 0.042 };
  },
};

// ------------------------------------------------------------------ public API
/**
 * Build a staff. look = { variant, colors: [shaft, glow, accent] } (an item's icon; defaults fill the gaps).
 * Returns a Group: children 'staffBody' (merged toon mesh), 'orb' (emissive sphere), 'halo' (additive sprite).
 */
export function makeStaff(look = {}) {
  const variant = DESIGNS[look.variant] ? look.variant : 'drift';
  const colors = [0, 1, 2].map(i => look.colors?.[i] || DEFAULT_COLORS[variant][i]);
  const D = DESIGNS[variant](colors);
  const group = new THREE.Group(); group.name = `staff:${variant}`;
  const bodyGeo = merge(D.body);
  const bodyMat = makeToon({ vertexColors: true, objectBrush: true, brush: 0.03, rim: 0.6, term: [-0.02, 0.28], shadowSat: 0.4 });
  const body = new THREE.Mesh(bodyGeo, bodyMat); body.name = 'staffBody'; body.castShadow = true;
  group.add(body);
  const glow = C(colors[1]);
  // the orb: pale core toward the viewer-facing top, the item's glow colour at the rim, emissive enough to bloom
  const orbGeo = paint(new THREE.SphereGeometry(D.r, 20, 14), (p, n, o) => o.copy(glow).lerp(C('#ffffff'), 0.45 * Math.max(0, n.y * 0.6 + n.z * 0.5)));
  const orbMat = makeToon({ vertexColors: true, color: '#ffffff', emissive: glow, emissiveIntensity: 1.15, rim: 0.8, brush: 0, term: [-0.3, 0.2] });
  const orb = new THREE.Mesh(orbGeo, orbMat); orb.name = 'orb'; orb.position.copy(D.orb); orb.castShadow = false;
  group.add(orb);
  const haloMat = new THREE.SpriteMaterial({ map: glowTexture(), color: glow, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const halo = new THREE.Sprite(haloMat); halo.name = 'halo'; halo.position.copy(D.orb); halo.scale.setScalar(D.r * 6.5);
  group.add(halo);
  group.userData.staff = { variant, r: D.r, oy: D.orb.y, glowK: 1, t: Math.random() * 10 };
  group.userData.orb = orb;                        // the player's staff convention: the glow mesh ...
  group.userData.dispose = () => dispose(group);   // ... and a disposer (staffs are never cloned)
  return group;
}

/** Put a staff in a paw with the relaxed grip (returns the staff). */
export function attachStaff(staff, hand, grip = STAFF_GRIP) {
  hand.add(staff);
  staff.position.set(...grip.position); staff.rotation.set(...grip.rotation);
  return staff;
}

/** Per frame: a slow breathing glow and a hair of bob in the cradle. */
export function tickStaff(staff, dt) {
  const S = staff?.userData.staff; if (!S) return;
  S.t += dt;
  const orb = staff.children[1], halo = staff.children[2];
  const pulse = 1 + 0.12 * Math.sin(S.t * 2.4) + 0.05 * Math.sin(S.t * 5.3);
  orb.material.emissiveIntensity = 1.15 * pulse * S.glowK;
  halo.material.opacity = Math.min(1, 0.42 * pulse * S.glowK);
  halo.scale.setScalar(S.r * 6.5 * (0.95 + 0.05 * pulse) * (0.8 + 0.2 * S.glowK));
  orb.position.y = halo.position.y = S.oy + 0.003 * Math.sin(S.t * 1.7);
}

/** Brighten the orb (k = 1 idle, ~2.5 while casting); decay it back yourself or call each frame. */
export function setStaffGlow(staff, k = 1) { const S = staff?.userData.staff; if (S) S.glowK = k; }

/** World position of the orb (spell origin). */
export function staffTip(staff, out = new THREE.Vector3()) { return staff.children[1].getWorldPosition(out); }

export function dispose(staff) {
  if (!staff) return;
  staff.parent?.remove(staff);
  staff.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
}
export { dispose as disposeStaff };
