// Poe's gear (docs/POE.md): the giant folding bone fūma — on her back (`fuma_back`), in her paw for the slash combo,
// thrown (combat/poeSkills.js flies a copy and hides both while it's out) — plus the stealth "ghost" look for Vanish
// and Smoke Bomb.
//
//  - fumaGeo(look): the procedural fūma's geometry for an item look ({ variant, colors: [blades, hub, accent] }), cached
//    per look so every rig, the thrown copy and the traps share it (hero switches rebuild rigs: no geometry leak);
//  - fumaObject(look, mat): a fūma as placed in the game — a holder group (its frame: the fūma flat in X-Y, spin axis +Z,
//    the hub at the origin) carrying either that procedural mesh or the Blender prop `public/models/poe-fuma.glb`
//    (FUMA_MODEL; tinted per item), swapped in place the moment the prop loads; setFumaLook(holder, look) re-dresses one;
//  - dressPoe(rig): mounts `fuma_back` on her back — the baked rig's `fumaMount` (HERO_MODELS.poeToy, from the Blender
//    agent's fuma_mount.json) if it has one, else the rig's `back` → rig.parts.fumaBack;
//  - installPoeGear(Player.prototype): holdFuma / dropFuma / carryFuma / setFumaOut — which of the two shows, the spin in
//    the paw during a slash;
//  - ghost(rig, on, k): Poe half-there: the skin swaps for a soft fresnel silhouette (shared material, allocation-free per frame).
// Sizes are game metres (the kit rigs are scaled by TOY_SCALE before props attach): span 0.585 m = the sheet's 0.45 m × 1.3.
import * as THREE from 'three';
import { makeToon } from '../gfx/materials.js';
import { paint, merge } from '../gfx/geom.js';
import { loadGlb, glbInstance } from '../gfx/glbAssets.js';

const TAU = Math.PI * 2;
const C = h => new THREE.Color(h);
export const FUMA = { span: 0.585, hub: 0.075, arm: 0.21 };
const GEO = new Map();

// ------------------------------------------------------------------ geometry
function sphere(r, p, col, sx = 1, sy = 1, sz = 1, seg = 14) {
  const g = new THREE.SphereGeometry(r, seg, Math.max(8, Math.round(seg * 0.7))); g.scale(sx, sy, sz); g.translate(...p);
  const c = C(col), d = c.clone().multiplyScalar(0.82);
  return paint(g, (pp, n, o) => o.copy(c).lerp(d, Math.max(0, -n.y) * 0.6));
}
function capsuleX(r, x0, x1, col, flat = 0.82) {
  const g = new THREE.CapsuleGeometry(r, x1 - x0, 6, 14); g.rotateZ(Math.PI / 2); g.scale(1, 1, flat); g.translate((x0 + x1) / 2, 0, 0);
  const c = C(col), d = c.clone().multiplyScalar(0.84), l = c.clone().lerp(C('#ffffff'), 0.25);
  return paint(g, (pp, n, o) => { o.copy(c); if (n.y > 0.35) o.lerp(l, (n.y - 0.35) * 0.9); else if (n.y < -0.2) o.lerp(d, -n.y * 0.7); });
}
function torus(R, r, col, rot = [0, 0, 0], p = [0, 0, 0], seg = 32) {
  const g = new THREE.TorusGeometry(R, r, 10, seg); g.rotateX(rot[0]); g.rotateY(rot[1]); g.rotateZ(rot[2]); g.translate(...p);
  const c = C(col), d = c.clone().multiplyScalar(0.78), l = c.clone().lerp(C('#fff6d0'), 0.3);
  return paint(g, (pp, n, o) => { o.copy(c); if (n.y > 0.3) o.lerp(l, n.y * 0.6); else if (n.y < -0.3) o.lerp(d, -n.y * 0.7); });
}
/** one bone arm along +x from the hub rim: a thick shaft and the double knob of a cartoon bone */
function boneArm(cols, v, a) {
  const [blade, , acc] = cols, len = FUMA.arm, x0 = FUMA.hub * 0.75, x1 = x0 + len;
  const parts = [];
  const chunky = v === 'rubber' ? 1.18 : v === 'royal' ? 1.06 : 1;
  parts.push(capsuleX(0.026 * chunky, x0, x1 - 0.03, blade));
  // the bone end: two lobes across the arm, a little flattened
  for (const s of [-1, 1]) parts.push(sphere(0.036 * chunky, [x1, s * 0.027 * chunky, 0], blade, 1, 1, 0.78));
  // a waist of the shaft near the hub: an accent band (the hinge collar of the folding fūma)
  parts.push(torus(0.03 * chunky, 0.0085, acc, [0, Math.PI / 2, 0], [x0 + 0.02, 0, 0], 18));
  if (v === 'bamboo') for (const t of [0.4, 0.7]) parts.push(torus(0.028, 0.0065, C(blade).multiplyScalar(0.72).getStyle(), [0, Math.PI / 2, 0], [x0 + len * t, 0, 0], 16));
  if (v === 'star' || v === 'kitsune') parts.push(sphere(0.016, [x1 + 0.03, 0, 0], acc));
  if (v === 'thunder') parts.push(sphere(0.012, [x0 + len * 0.55, 0, 0.022], acc, 1, 1, 0.6));
  const g = merge(parts);
  // crescent / dragon: the arm sweeps back like a curved blade (bend in the fūma's plane)
  if (v === 'crescent' || v === 'dragon' || v === 'smoke') {
    const P = g.attributes.position, k = v === 'crescent' ? 0.9 : 0.55;
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), u = Math.max(0, (x - x0) / len); P.setY(i, P.getY(i) - k * 0.09 * u * u); }
    g.computeVertexNormals();
  }
  g.rotateZ(a);
  return g;
}
/** the fūma for an item look: four bone arms on the diagonals round a mustard hub ring; origin = the hub, flat in X-Y */
export function fumaGeo(look = {}) {
  const v = look.variant || 'bone', cols = look.colors?.length === 3 ? look.colors : ['#f4ead2', '#d8b040', '#3d6038'];
  const key = `${v}|${cols.join(',')}`;
  let g = GEO.get(key); if (g) return g;
  const [, hub, acc] = cols, parts = [];
  for (let i = 0; i < 4; i++) parts.push(boneArm(cols, v, Math.PI / 4 + i * Math.PI / 2));
  // the hub: a thick ring with six round holes, a darker inner ring and a centre boss
  parts.push(torus(FUMA.hub * 0.78, 0.027, hub, [0, 0, 0], [0, 0, 0], 36));
  parts.push(torus(FUMA.hub * 0.42, 0.012, C(hub).multiplyScalar(0.8).getStyle(), [0, 0, 0], [0, 0, 0], 24));
  const holeC = C(acc).multiplyScalar(0.55).getStyle();
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + TAU / 12, r = FUMA.hub * 0.78; for (const z of [-1, 1]) parts.push(sphere(0.0105, [Math.cos(a) * r, Math.sin(a) * r, z * 0.021], holeC, 1, 1, 0.45, 8)); }
  parts.push(sphere(0.022, [0, 0, 0], C(hub).multiplyScalar(0.9).getStyle(), 1, 1, 1.1, 12));
  if (v === 'royal') for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; parts.push(sphere(0.014, [Math.cos(a) * FUMA.hub * 0.78, Math.sin(a) * FUMA.hub * 0.78, 0.028], acc, 1, 1, 0.5, 10)); }
  g = merge(parts);
  g.computeBoundingSphere();
  GEO.set(key, g);
  return g;
}
export const fumaGeoCount = () => GEO.size;

// ------------------------------------------------------------------ the Blender fūma (public/models/poe-fuma.glb)
// The prop from the Blender agent: pivot at the hub centre, the bone arms in the model's plane, the spin axis Blender +Z
// (= the game's +Y once exported). It is turned into the holder frame (axis +Z) and scaled to the procedural fūma's span
// (so the kit rig's mounts and paw grip stay as tuned); a baked rig with a `fumaMount` shows it at its own size instead
// (`radius`: the prop's tip radius, fuma_mount.json tip_radius_m: dressPoe / holdFuma scale its holders by radius / 0.3).
// `pending: true` would skip the fetch (no 404 while a file is still to land); ?fumaglb=<file> loads another model as a
// stand-in for testing.
export const FUMA_MODEL = { file: 'models/poe-fuma.glb', scale: 1, radius: 0.4 };
export const FUMA_FIT_R = 0.3; // (the radius every holder is fitted to: the procedural fūma's)
const BASE = import.meta.env?.BASE_URL ?? '/';
const GLB = { state: 'idle', tpl: null, fit: 1, tints: new Map(), live: [] };
const qs = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
/** start loading the prop once (a missing or broken file leaves the procedural fūma in place) */
export function loadFumaModel() {
  if (GLB.state !== 'idle') return;
  const force = qs?.get('fumaglb'), file = force && force !== '1' ? `models/${force}` : FUMA_MODEL.file;
  if (FUMA_MODEL.pending && !force) { GLB.state = 'pending'; return; }
  GLB.state = 'loading';
  loadGlb(BASE + file).then(tpl => {
    const t = tpl.clone(true);
    const box = new THREE.Box3().setFromObject(t), half = Math.max(Math.abs(box.min.x), box.max.x, Math.abs(box.min.z), box.max.z) || 1;
    GLB.tpl = t; GLB.fit = (FUMA_FIT_R / half) * (FUMA_MODEL.scale || 1); GLB.state = 'ready';
    for (const w of GLB.live.splice(0)) { const h = w.deref?.() ?? w; if (h?.userData?.fumaHolder) fillFuma(h, h.userData.look); }
  }, err => { GLB.state = 'missing'; console.warn('[poe] the fūma model did not load; the procedural one stays', err?.message || err); });
}
export const fumaModelReady = () => GLB.state === 'ready';
// the prop tinted toward an item's blade colour (its paint is bone-white: the default look keeps it as made)
const BONE_C = C('#f4ead2');
function glbFuma(look) {
  const o = glbInstance(GLB.tpl), cols = look?.colors?.length === 3 ? look.colors : null, key = cols ? cols[0] : 'bone';
  if (cols && key.toLowerCase() !== '#f4ead2') {
    let map = GLB.tints.get(key);
    if (!map) {
      map = new Map(); const c = C(key), tint = new THREE.Color(Math.min(1.4, c.r / BONE_C.r), Math.min(1.4, c.g / BONE_C.g), Math.min(1.4, c.b / BONE_C.b));
      GLB.tpl.traverse(m => { if (m.isMesh) for (const mt of [].concat(m.material)) if (!map.has(mt)) { const x = mt.clone(); x.color?.multiply(tint); map.set(mt, x); } });
      GLB.tints.set(key, map);
    }
    o.traverse(m => { if (m.isMesh) m.material = Array.isArray(m.material) ? m.material.map(x => map.get(x) || x) : map.get(m.material) || m.material; });
  }
  o.rotation.x = Math.PI / 2; o.scale.setScalar(GLB.fit); // (glTF +Y spin axis → the holder's +Z)
  o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = false; } });
  o.userData.kind = 'glb'; o.userData.key = key;
  return o;
}
function fillFuma(h, look = {}) {
  h.userData.look = look;
  const c = h.children[0];
  if (GLB.state === 'ready') {
    const key = look?.colors?.length === 3 ? look.colors[0] : 'bone';
    if (c?.userData.kind === 'glb' && c.userData.key === key) return;
    if (c) h.remove(c);
    h.add(glbFuma(look));
    return;
  }
  const g = fumaGeo(look);
  if (c?.userData.kind === 'proc') { if (c.geometry !== g) c.geometry = g; return; }
  if (c) h.remove(c);
  const m = new THREE.Mesh(g, h.userData.mat || fumaMat()); m.castShadow = true; m.userData.kind = 'proc'; h.add(m);
}
/** a fūma as the game places it (see the header): a holder group; mat = the procedural mesh's material */
export function fumaObject(look = {}, mat = null) {
  if (GLB.state === 'idle') loadFumaModel();
  const h = new THREE.Group(); h.name = 'fuma'; h.userData.fumaHolder = true; h.userData.mat = mat;
  fillFuma(h, look);
  if (GLB.state === 'loading') GLB.live.push(typeof WeakRef !== 'undefined' ? new WeakRef(h) : h); // (upgraded when the prop lands)
  return h;
}
/** shadow on / off for a holder's meshes */
export function fumaShadow(h, on) { h?.traverse?.(m => { if (m.isMesh) m.castShadow = on; }); }

// ------------------------------------------------------------------ the back mount
// The fūma rides flat against her upper back as an X (its arms on the diagonals), the hub between the shoulder blades,
// a little proud of the hood so it never clips the body (the sheet's back view).
const BACK = { pos: [0, 0.15, -0.04], rot: [0.1, 0, 0], scale: 1.1 }; // (high enough that its upper tips peek over her shoulders)
/** a baked rig's holders show the prop at its own size (the holders are fitted to FUMA_FIT_R) */
const bakedK = () => FUMA_MODEL.radius / FUMA_FIT_R;
/** Mount `fuma_back` on a Poe rig (idempotent). look: the equipped fūma's icon look. → the back holder.
 *  The baked rig: parts.fumaMount (heroModels.js, from fuma_mount.json: the hub centre and the prop's orientation, its
 *  spin axis on the group's +Y) — the holder turns −90° about X into it. The kit rig: BACK on parts.back. */
export function dressPoe(rig, look = {}) {
  if (!rig?.parts) return null;
  if (rig.parts.fumaBack) { setFumaLook(rig.parts.fumaBack, look); return rig.parts.fumaBack; }
  const mount = rig.parts.fumaMount, back = mount || rig.parts.back || rig.parts.body; if (!back) return null;
  const m = fumaObject(look, rig.propMat || rig.mat); m.name = 'fuma_back';
  if (mount) { m.rotation.set(-Math.PI / 2, 0, 0); m.scale.setScalar((mount.userData.scale || 1) * bakedK()); }
  else { m.position.set(...BACK.pos); m.rotation.set(...BACK.rot); m.scale.setScalar(BACK.scale); }
  back.add(m); rig.parts.fumaBack = m;
  return m;
}
export function setFumaLook(mesh, look = {}) {
  if (!mesh || mesh.userData.baked) return;
  if (mesh.userData.fumaHolder) { fillFuma(mesh, look); return; }
  if (!mesh.isMesh) return;
  const g = fumaGeo(look); if (mesh.geometry !== g) mesh.geometry = g;
}

// ------------------------------------------------------------------ in the paw (Player mixin)
// Held by the hub in the right paw, the fūma's plane turned to the side so its bones sweep through a slash; during the
// combo it spins in the paw like a buzz-saw. In town (or ~1.6 s after the last swing in a fight) it goes back on her back.
const HAND = { pos: [0, -0.035, 0.07], rot: [0, Math.PI / 2, 0] };
const SPINNING = new Set(['fumaSlash', 'fumaSlash2', 'fumaTwirl', 'fumaCatch']);
const DRAWN = new Set(['fumaSlash', 'fumaSlash2', 'fumaTwirl', 'fumaThrow', 'fumaCatch', 'shadowStepIn', 'shadowStrike']);
const M = {
  /** the fūma for the equipped item: the back one (dressPoe) and the paw one; both share the look's geometry */
  holdFuma(look) {
    const rig = this.rig; look = look?.colors ? look : this.equippedLook?.() || {};
    dressPoe(rig, look);
    if (!this.fumaHand || this.fumaHand.parent !== rig.parts.handR) {
      this.dropFuma(true);
      const m = this.fumaHand = fumaObject(look, rig.propMat || rig.mat); m.name = 'fuma_hand';
      m.position.set(...HAND.pos); m.rotation.set(...HAND.rot);
      if (rig.parts.fumaMount) m.scale.setScalar((rig.parts.fumaMount.userData.scale || 1) * bakedK()); // (the baked rig: as big as on her back)
      rig.parts.handR.add(m);
    } else setFumaLook(this.fumaHand, look);
    this.fumaSpin = this.fumaSpin || 0; this._fumaDrawn = -1;
    // (Chewy's sword / ball and Moka's staff stay parked and hidden)
    if (this.sword) { this.sword.scale.setScalar(0.0001); this.sword.castShadow = false; }
    if (this.ball) { this.ball.scale.setScalar(0.0001); this.ball.castShadow = false; }
    if (this.swordBack) this.swordBack.visible = false;
    this.dropStaff?.();
    this.carryFuma(0);
  },
  dropFuma(keepBack = false) {
    const h = this.fumaHand; if (h) { h.parent?.remove(h); this.fumaHand = null; }
    if (!keepBack && this.rig?.parts?.fumaBack && !this.rig.parts.fumaBack.userData.baked) { /* the back mount goes with the rig */ }
  },
  /** thrown (poeSkills): neither the back nor the paw fūma shows until it's caught */
  setFumaOut(on) { this.fumaOut = !!on; this._fumaDrawn = -1; this.carryFuma(0); },
  /** keep the right fūma visible: on her back, in her paw (drawn for the combo), or neither (thrown); spin it mid-slash */
  carryFuma(dt) {
    const back = this.rig?.parts?.fumaBack, hand = this.fumaHand;
    if (!back && !hand) return;
    const a = this.anim?.action, G = this.G;
    if (a && DRAWN.has(a.name)) this._drawnT = G?.mode === 'dungeon' ? 1.6 : 0.6;
    this._drawnT = Math.max(0, (this._drawnT || 0) - dt);
    const ghost = this._ghost > 0.5;
    const state = this.fumaOut ? 0 : (this._drawnT > 0 && !this.toolOut ? 2 : 1); // 0 thrown, 1 back, 2 paw
    if (state !== this._fumaDrawn) {
      this._fumaDrawn = state;
      if (back) back.visible = state === 1 && !ghost;
      if (hand) { hand.visible = state === 2 && !ghost; fumaShadow(hand, state === 2); }
    }
    if (hand && state === 2) {
      const want = a && SPINNING.has(a.name) ? 16 : 0;
      this.fumaSpin = (this.fumaSpin || 0) + (want - (this.fumaSpin || 0)) * Math.min(1, dt * (want ? 10 : 4));
      hand.rotation.z += this.fumaSpin * dt;
    }
  },
};
export function installPoeGear(proto) { for (const k in M) if (!proto[k]) proto[k] = M[k]; }

// ------------------------------------------------------------------ the stealth ghost (Vanish, Smoke Bomb)
// The skin hides and a soft fresnel silhouette (bright rim, faint fill, a slow shimmer) takes its place: she's clearly
// still there for the player, clearly "invisible" in the fiction. One shared material (compiled once: prewarm()).
let GHOST_MAT = null;
const GHOST_U = { uT: { value: 0 }, uA: { value: 0.6 }, uCol: { value: C('#cfd8ff') } };
export function ghostMat() {
  if (GHOST_MAT) return GHOST_MAT;
  const m = GHOST_MAT = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, fog: false, toneMapped: false });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, GHOST_U);
    const V = `#include <project_vertex>
      #ifdef USE_SKINNING
        vGN = normalize(normalMatrix * objectNormal);
      #else
        vGN = normalize(normalMatrix * normal);
      #endif
      vGV = -mvPosition.xyz; vGY = position.y;`;
    const P = '#include <common>\nvarying vec3 vGN; varying vec3 vGV; varying float vGY; uniform float uT, uA; uniform vec3 uCol;';
    const F = `float rimG = 1.0 - abs(dot(normalize(vGN), normalize(vGV)));
      float shim = 0.5 + 0.5 * sin(vGY * 26.0 - uT * 4.0);
      diffuseColor.rgb = mix(uCol * 0.55, vec3(1.0), rimG * rimG * 0.7);
      diffuseColor.a = uA * (0.12 + 0.95 * rimG * rimG + 0.08 * shim);
      #include <opaque_fragment>`;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', P).replace('#include <project_vertex>', V);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', P).replace('#include <opaque_fragment>', F);
  };
  m.customProgramCacheKey = () => 'poe-ghost';
  return m;
}
export const ghostUniforms = GHOST_U;
/** on: Poe goes see-through (k 0..1 = how see-through: the silhouette's alpha follows 1 - k * 0.5) */
export function ghost(rig, on, k = 1) {
  if (!rig) return;
  if (on && !rig._ghosts) {
    const mat = ghostMat();
    rig._ghosts = rig.meshes.map(mesh => {
      const x = mesh.isSkinnedMesh ? new THREE.SkinnedMesh(mesh.geometry, mat) : new THREE.Mesh(mesh.geometry, mat);
      x.name = (mesh.name || 'skin') + '_ghost'; x.renderOrder = 8; x.castShadow = false; x.receiveShadow = false; x.visible = false; x.frustumCulled = false;
      if (mesh.isSkinnedMesh) { mesh.parent.add(x); x.bind(mesh.skeleton, mesh.bindMatrix); } else mesh.add(x);
      return x;
    });
  }
  if (!rig._ghosts) return;
  if (rig._ghostOn !== on) {
    rig._ghostOn = on;
    for (const m of rig.meshes) m.visible = !on;
    for (const g of rig._ghosts) g.visible = on;
    if (rig.outline) rig.outline.visible = false;
  }
  if (on) GHOST_U.uA.value = 0.62 - 0.22 * Math.min(1, k);
}
export function tickGhost(t) { GHOST_U.uT.value = t; }
/** compile the ghost and the fūma once (behind the boot / a floor load): no hitch on her first Vanish or throw */
export function prewarmPoeGear(renderer, camera, scene) {
  try {
    const g = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), ghostMat()); g.position.set(0, -55, 0); g.frustumCulled = false;
    const f = new THREE.Mesh(fumaGeo(), fumaMat()); f.position.set(0, -55, 0); f.frustumCulled = false;
    scene.add(g, f); renderer.compile(scene, camera);
    requestAnimationFrame(() => requestAnimationFrame(() => { scene.remove(g, f); g.geometry.dispose(); }));
  } catch (e) { /* cosmetic */ }
}
// ------------------------------------------------------------------ the loose fūma (thrown, planted traps): one shared toon material
let FUMA_MAT = null;
export function fumaMat() { return FUMA_MAT || (FUMA_MAT = makeToon({ vertexColors: true, objectBrush: true, brush: 0.025, rim: 0.6, term: [-0.02, 0.28], shadowSat: 0.4 })); }
