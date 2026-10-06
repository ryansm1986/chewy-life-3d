// Poe's little props and her smoke copies (docs/POE.md §3): kunai, tiny bone shuriken, the chew-toy substitution log,
// bone caltrops, the paper exploding tag — module-level cached geometry in the fūma's toon look (poeGear.js fumaMat,
// vertex colours) — and the shadow-clone rig copies: a cheap clone of her rig (shared geometry, its own bones) in an
// ink-smoke fresnel material that mirrors her pose every frame (Shadow Clone) or holds one frame (Afterimage Dash).
import * as THREE from 'three';
import { cloneSkinnedSafe as cloneSkinned } from './safeClone.js'; // (SkeletonUtils.clone minus the userData JSON of her ear tips and fūma holders)
import { paint, merge } from '../gfx/geom.js';
import { fumaMat, ghostMat } from './poeGear.js';

const C = h => new THREE.Color(h);
const TAU = Math.PI * 2;
const GEO = {};
function shade(g, col, dark = 0.8, lift = 0.2) {
  const c = C(col), d = c.clone().multiplyScalar(dark), l = c.clone().lerp(C('#ffffff'), lift);
  return paint(g, (p, n, o) => { o.copy(c); if (n.y > 0.3) o.lerp(l, n.y * 0.8); else if (n.y < -0.25) o.lerp(d, -n.y * 0.8); });
}
const sph = (r, p, col, s = [1, 1, 1], seg = 10) => { const g = new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.7))); g.scale(...s); g.translate(...p); return shade(g, col); };

/** a kunai along +z (tip forward): a leaf blade, a cream-wrapped grip, a mustard ring pommel (~0.34 m) */
export function kunaiGeo() {
  if (GEO.kunai) return GEO.kunai;
  const blade = new THREE.ConeGeometry(0.05, 0.19, 4, 1); blade.rotateX(Math.PI / 2); blade.rotateZ(Math.PI / 4); blade.scale(1, 0.32, 1); blade.translate(0, 0, 0.105);
  const base = new THREE.ConeGeometry(0.05, 0.05, 4, 1); base.rotateX(-Math.PI / 2); base.rotateZ(Math.PI / 4); base.scale(1, 0.32, 1); base.translate(0, 0, -0.01);
  const grip = new THREE.CylinderGeometry(0.014, 0.016, 0.12, 8); grip.rotateX(Math.PI / 2); grip.translate(0, 0, -0.095);
  const ring = new THREE.TorusGeometry(0.026, 0.008, 6, 14); ring.translate(0, 0, -0.18);
  const wrap = [];
  for (let i = 0; i < 3; i++) { const w = new THREE.TorusGeometry(0.017, 0.005, 5, 10); w.translate(0, 0, -0.06 - i * 0.033); wrap.push(shade(w, '#f4ead2', 0.85, 0.1)); }
  GEO.kunai = merge([shade(blade, '#dfe6f0', 0.62, 0.45), shade(base, '#b8c2d0', 0.6, 0.3), shade(grip, '#3d6038', 0.7, 0.15), shade(ring, '#d8b040', 0.7, 0.3), ...wrap]);
  GEO.kunai.computeBoundingSphere();
  return GEO.kunai;
}
/** a tiny four-armed bone shuriken, flat in X-Z (Shuriken Rain, Thousand Star Flurry, the Bone Shrapnel) */
export function starGeo() {
  if (GEO.star) return GEO.star;
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const a = TAU / 8 + (i * TAU) / 4, ca = Math.cos(a), sa = Math.sin(a);
    const arm = new THREE.CapsuleGeometry(0.018, 0.1, 3, 8); arm.rotateZ(Math.PI / 2); arm.scale(1, 0.7, 1); arm.rotateY(-a); arm.translate(ca * 0.07, 0, sa * 0.07);
    parts.push(shade(arm, '#f6ecd2', 0.75, 0.2));
    for (const s of [-1, 1]) parts.push(sph(0.024, [ca * 0.13 - sa * s * 0.018, 0, sa * 0.13 + ca * s * 0.018], '#f6ecd2', [1, 0.7, 1], 8));
  }
  parts.push(sph(0.03, [0, 0, 0], '#d8b040', [1, 0.6, 1], 10));
  GEO.star = merge(parts); GEO.star.computeBoundingSphere();
  return GEO.star;
}
/** the substitution log: a short chew-toy log (tan bark with darker rings, cut ends, a leaf sprig and a squeaker) along x */
export function logGeo() {
  if (GEO.log) return GEO.log;
  const body = new THREE.CylinderGeometry(0.17, 0.18, 0.62, 14, 3); body.rotateZ(Math.PI / 2);
  const bark = C('#b07a4a'), ring = C('#8a5a34'), cut = C('#f0d8a8');
  paint(body, (p, n, o) => { o.copy(bark); const b = Math.sin(p.x * 34) * 0.5 + 0.5; if (b > 0.82) o.lerp(ring, 0.6); if (n.y > 0.3) o.lerp(C('#d8a874'), n.y * 0.5); if (Math.abs(n.x) > 0.7) { o.copy(cut); const rr = Math.hypot(p.y, p.z); if (Math.sin(rr * 70) > 0.6) o.lerp(ring, 0.5); } });
  const knot = sph(0.05, [0.08, 0.15, 0.06], '#8a5a34', [1, 0.5, 1], 8);
  const stem = new THREE.CylinderGeometry(0.008, 0.01, 0.12, 5); stem.rotateZ(-0.5); stem.translate(-0.1, 0.22, 0); shade(stem, '#5a8a4a');
  const leaf = sph(0.05, [-0.06, 0.29, 0], '#8fd068', [1.4, 0.35, 0.8], 8);
  const squeak = sph(0.045, [0.18, 0.11, -0.1], '#ff8fb0', [1, 0.8, 1], 10);
  GEO.log = merge([body, knot, stem, leaf, squeak]); GEO.log.computeBoundingSphere();
  return GEO.log;
}
/** a bone caltrop: four stubby spikes on a tetrahedron (one always points up) */
export function caltropGeo() {
  if (GEO.caltrop) return GEO.caltrop;
  const dirs = [[0, 1, 0], [0.94, -0.33, 0], [-0.47, -0.33, 0.82], [-0.47, -0.33, -0.82]], parts = [];
  for (const [x, y, z] of dirs) {
    const s = new THREE.ConeGeometry(0.022, 0.07, 6); s.translate(0, 0.035, 0);
    s.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x, y, z).normalize()));
    parts.push(shade(s, '#f6ecd2', 0.72, 0.2));
  }
  parts.push(sph(0.022, [0, 0, 0], '#e8d8b0', [1, 1, 1], 8));
  GEO.caltrop = merge(parts); GEO.caltrop.translate(0, 0.024, 0); GEO.caltrop.computeBoundingSphere();
  return GEO.caltrop;
}
/** one shared material for every prop (the fūma's toon) */
export const propMat = () => fumaMat();

// ------------------------------------------------------------------ the smoke copies
let DEPTH = null;
const depthMat = () => DEPTH || (DEPTH = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true }));
// An ink-smoke body: deep violet-black fill, a soft lilac fresnel rim, and slow bands drifting up it like smoke.
// One material per copy (so each fades on its own); they share one program (customProgramCacheKey).
function cloneMat(col = '#3a2c52', rim = '#d8ccff') {
  const m = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, fog: false, toneMapped: false });
  const U = m.userData.U = { uT: { value: 0 }, uA: { value: 0.85 }, uCol: { value: C(col) }, uRim: { value: C(rim) } };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    const P = '#include <common>\nvarying vec3 vCN; varying vec3 vCV; varying float vCY; uniform float uT, uA; uniform vec3 uCol, uRim;';
    const V = `#include <project_vertex>
      #ifdef USE_SKINNING
        vCN = normalize(normalMatrix * objectNormal);
      #else
        vCN = normalize(normalMatrix * normal);
      #endif
      vCV = -mvPosition.xyz; vCY = (modelMatrix * vec4(transformed, 1.0)).y;`;
    const F = `float rimC = 1.0 - abs(dot(normalize(vCN), normalize(vCV)));
      float band = 0.5 + 0.5 * sin(vCY * 9.0 - uT * 2.2 + sin(vCY * 4.0 + uT) * 1.5);
      outgoingLight = mix(uCol * (0.9 + 0.18 * band), uRim, smoothstep(0.5, 1.0, rimC) * 0.7); // (basic material: the colour goes out through outgoingLight)
      diffuseColor.a = uA * (0.82 + 0.18 * rimC) * (0.94 + 0.06 * band);
      #include <opaque_fragment>`;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', P).replace('#include <project_vertex>', V);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', P).replace('#include <opaque_fragment>', F);
  };
  m.customProgramCacheKey = () => 'poe-clone';
  return m;
}
/**
 * A smoke copy of a hero rig: { root, pairs, mat, set(alpha), mirror(rig), snap(rig), dispose() }. The copy shares the
 * rig's geometry (no GPU upload); `mirror` copies every node's transform from the live rig (bones and props), so the copy
 * strikes when she strikes. Outline shells and helper meshes (ghost shells, x-ray) are left hidden.
 */
export function smokeCopy(rig, { col, rim } = {}) {
  const root = cloneSkinned(rig.root);
  const a = [], b = []; rig.root.traverse(o => a.push(o)); root.traverse(o => b.push(o));
  const pairs = []; for (let i = 1; i < Math.min(a.length, b.length); i++) pairs.push(a[i], b[i]);
  const mat = cloneMat(col, rim), keep = new Set([rig.mat, rig.propMat, fumaMat()].filter(Boolean)), depthTwins = [];
  root.traverse(o => {
    if (o.isSprite || o.isPoints || o.isLine) { o.visible = false; return; }
    if (!o.isMesh) return;
    const body = keep.has(o.material) || (o.isSkinnedMesh && !/outline|ghost|xray/i.test(o.name));
    if (!body || /outline|ghost|xray|shadow/i.test(o.name)) { o.visible = false; o.userData.off = true; return; }
    o.material = mat; o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; o.renderOrder = 7;
    if (!/^fuma/.test(o.name)) o.visible = true; // (even if she was mid-Vanish when it was copied)
    depthTwins.push(o);
  });
  // a depth-only twin drawn first, so the see-through copy shows only its outer surface (not every part inside it)
  for (const o of depthTwins) {
    const d = o.isSkinnedMesh ? new THREE.SkinnedMesh(o.geometry, depthMat()) : new THREE.Mesh(o.geometry, depthMat());
    d.name = 'copy_depth'; d.frustumCulled = false; d.renderOrder = 6; d.castShadow = false; d.receiveShadow = false;
    if (o.isSkinnedMesh) { o.parent.add(d); d.position.copy(o.position); d.quaternion.copy(o.quaternion); d.scale.copy(o.scale); d.bind(o.skeleton, o.bindMatrix); } else o.add(d);
  }
  const C2 = {
    root, pairs, mat,
    set(alpha) { mat.userData.U.uA.value = alpha; },
    tick(t) { mat.userData.U.uT.value = t; },
    /** copy the live rig's pose (bones, props, the fūma's spin); the copy's own root is placed by the caller */
    mirror() {
      for (let i = 0; i < pairs.length; i += 2) {
        const s = pairs[i], d = pairs[i + 1];
        d.position.copy(s.position); d.quaternion.copy(s.quaternion); d.scale.copy(s.scale);
        if (!d.userData.off && /^fuma_/.test(s.name)) d.visible = s.visible; // (her fūma holders show as hers do)
      }
      root.scale.copy(rig.root.scale);
    },
    dispose() { root.parent?.remove(root); mat.dispose(); root.traverse(o => { if (o.isSkinnedMesh) o.skeleton?.dispose(); }); },
  };
  C2.mirror();
  return C2;
}
/** compile the smoke-copy materials (skinned and plain, the colour pass and the depth pass) and her skinned ghost behind a
 *  floor load: the first Shadow Clone / Afterimage Dash / Smoke Bomb used to hitch 100+ ms on new programs */
let KEEP = null;
export function prewarmCopies(renderer, camera, scene) {
  try {
    const g = new THREE.BoxGeometry(0.1, 0.1, 0.1), n = g.attributes.position.count;
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4), 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n * 4).map((v, i) => (i % 4 ? 0 : 1)), 4));
    const bone = new THREE.Bone(), sk = new THREE.Skeleton([bone]), mat = KEEP || (KEEP = cloneMat()), list = []; // (KEEP is never disposed: while it lives, three keeps the copies' program — disposing the last copy used to free it, and the next Shadow Clone recompiled for 200 ms)
    for (const m of [mat, depthMat(), ghostMat()]) { // (and her own Vanish / Smoke Bomb ghost, skinned)
      const s = new THREE.SkinnedMesh(g, m); s.add(bone); s.bind(sk); const p = new THREE.Mesh(g, m);
      for (const o of [s, p]) { o.position.set(0, -60, 0); o.frustumCulled = false; scene.add(o); list.push(o); }
    }
    renderer.compile(scene, camera);
    requestAnimationFrame(() => requestAnimationFrame(() => { for (const o of list) scene.remove(o); g.dispose(); sk.dispose(); }));
  } catch (e) { /* cosmetic */ }
}
