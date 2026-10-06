// Shiokaze Tidepools monsters (kappa, heikegani, kurage) — docs/REGIONS.md §2 / §3.4. Owned by the monsters agent.
// Exports MONSTERS (defs in the monsters.js format + stats / material / ai / update / onSpawn / onDeath / damageTaken)
// and BUILD (model builders -> { root, pivot, body, mat, outline }). Sounds live in ./tidepool.sfx.js (pure data).
//
// Built on the region monster kit in ./bamboo.js (assemble / mdef / tele / hitArea / push / puff ...). On top of it:
//   vhook   a GPU vertex hook shared by a model's toon material and its ink hulls, so parts deformed in the vertex
//           shader keep their outline: kappa dish water (level = life), crab legs (stepping), jelly tentacles (sway).
//           Part channels ride on the uv attribute (stamped at build; every other part is stamped 0, 0).
//   kurage  a translucent lantern bell (its own material, depth-writing so its ink hull only shows round the rim)
//           over an opaque body with a glowing core (bloom); glow and pulse rings are pooled particles, no lights.
// Nothing here allocates per frame in steady state beyond pooled particle records.
import * as THREE from 'three';
import { makeToon, makeOutline } from '../../gfx/materials.js';
import { rand, clamp, TAU, dist, angleDiff, ease } from '../../core/util.js';
import { V, col, ell, paint, xf, INK, lathe, cyl, tubeC, eyesCute, cheeks, smile, blob, assemble, act, mdef, every, tele, roll, sfx, playerIn, hitArea, push, puff, screenAngle, shared } from './bamboo.js';

const _v = new THREE.Vector3(), _dir = new THREE.Vector3(), _q = new THREE.Vector3();
const HINT = { crab: false };
const TELE_C = { grab: '#ff4a64', splash: '#ff8a3a', slam: '#ff3a3a', dash: '#ff6a2a', zap: '#ffd83a' };

// ================================================================================================= helpers
/** stamp a constant uv on a part (vertex-hook channels) */
function uvs(g, u, v) {
  const n = g.attributes.position.count, a = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { a[i * 2] = u; a[i * 2 + 1] = v; }
  g.setAttribute('uv', new THREE.BufferAttribute(a, 2)); g.userData.uvs = true; return g;
}
/** per-vertex uv from the vertex position: fn(p) → [u, v] */
function uvf(g, fn) {
  const P = g.attributes.position, n = P.count, a = new Float32Array(n * 2), p = new THREE.Vector3();
  for (let i = 0; i < n; i++) { p.fromBufferAttribute(P, i); const [u, v] = fn(p); a[i * 2] = u; a[i * 2 + 1] = v; }
  g.setAttribute('uv', new THREE.BufferAttribute(a, 2)); g.userData.uvs = true; return g;
}
/** every part not stamped yet gets uv (0, 0): no hook channel */
const stamp = list => { for (const g of list) if (!g.userData.uvs) uvs(g, 0, 0); return list; };
/** CatmullRom resample of [[x, y, z, r]…] into n + 1 tube points */
function smooth(ctrl, n) {
  const c = new THREE.CatmullRomCurve3(ctrl.map(q => V(q[0], q[1], q[2]))), out = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, p = c.getPoint(u), f = u * (ctrl.length - 1), j = Math.min(ctrl.length - 2, Math.floor(f));
    out.push([p.x, p.y, p.z, ctrl[j][3] + (ctrl[j + 1][3] - ctrl[j][3]) * (f - j)]);
  }
  return out;
}
/** an ellipsoid tuft with its base at `base`, pointing along `dir` */
function tuft(base, dir, len, rad, color, seg = 8) {
  const g = new THREE.SphereGeometry(1, seg, Math.max(4, Math.round(seg * 0.7)));
  g.scale(rad, len / 2, rad * 0.85); g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), V(...dir).normalize()));
  g.translate(...base);
  return paint(g, (p, n, o) => o.set(color));
}
/**
 * GPU part deformation shared by a toon material and its ink hulls: `pars` declares the per-instance uniforms `U`,
 * `body` edits object-space `transformed` (uv = the part channels), `ol` runs first on the hulls only, `nrm` edits
 * `objectNormal` (toon only). Rigid parts (kappa head / arms, crab claws) turn here instead of being their own meshes:
 * one mesh + one hull (+ one shadow) per monster instead of a pair per part.
 */
function vhook(mat, key, U, pars, body, ol = '', nrm = '') {
  if (!mat || mat.userData.vh) return mat;
  mat.userData.vh = key; mat.userData.vhU = U; // (vhU: per-instance values the Horde's instanced batches read, dungeon/horde.js)
  const hull = mat.side === THREE.BackSide && !mat.isMeshToonMaterial;
  const prev = mat.onBeforeCompile, pk = mat.customProgramCacheKey;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + pars);
    if (hull) sh.vertexShader = sh.vertexShader.replace('vec3 transformed = position + normalize(normal) * uOutW;', `vec3 transformed = position + normalize(normal) * uOutW;\n${ol}\n${body}`);
    else sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${nrm}`).replace('#include <begin_vertex>', `#include <begin_vertex>\n${body}`);
  };
  mat.customProgramCacheKey = () => (pk ? pk.call(mat) : '') + '|vh:' + key + (hull ? ':o' : '');
  mat.needsUpdate = true;
  return mat;
}
function hookModel(M, H) {
  M.hook = H;
  vhook(M.mat, H.key, H.U, H.pars, H.body, '', H.nrm || '');
  vhook(M.outline.material, H.key, H.U, H.pars, H.body, H.ol);
  for (const o of M.subs) vhook(o.material, H.key, H.U, H.pars, H.body, H.ol);
}
/** champions / uniques get a fresh coloured hull from Monster: hook it too (shared with the sub parts by mdef) */
function rehook(m) { const M = m.model, H = M.hook; if (H) vhook(M.outline.material, H.key, H.U, H.pars, H.body, H.ol); }
/** a per-instance uniform on a toon material built from a shared spec (assemble shares the spec's uniform objects) */
function ownU(mat, name, value) { const u = { value }; mat.userData.u[name] = u; (mat.userData.instU ||= []).push(name); return u; }

/** is entity e inside the cone (apex at m, facing, range r, half-angle arc)? */
function inCone(m, e, r, arc) {
  const dx = e.pos.x - m.pos.x, dz = e.pos.z - m.pos.z, d = Math.hypot(dx, dz), er = e.radius || 0.3;
  if (d > r + er) return false;
  if (d < 0.5) return true;
  return Math.abs(angleDiff(m.facing, Math.atan2(dx, dz))) < arc + Math.atan2(er, d);
}
/** status float over the hero, rate-limited per key */
function status(G, text, color, key, gap = 0.9) {
  const P = G.player, t = G.engine?.time || 0; if (!P || G.playerDead) return;
  if (t - (P[key] || -9) < gap) return; P[key] = t;
  G.ui?.float?.(V(P.pos.x, P.pos.y + 1.7, P.pos.z), text, { kind: 'status', color });
}
/** drenched: slowed for `secs`, water dripping off the hero while it lasts */
function soak(m, secs = 2, amt = 0.3) {
  const G = m.G, P = G.player; if (!P || G.playerDead) return;
  status(G, 'Soaked!', '#8ae8ff', '_soakT');
  P.slowT = Math.max(P.slowT || 0, secs); P.slowAmt = Math.max(P.slowT > secs ? (P.slowAmt || 0) : 0, amt);
  const Z = P._soakZone;
  if (Z && Z.t < Z.life && m.mode.combat.zones.includes(Z)) { Z.life = Math.max(Z.life, Z.t + secs); return; }
  P._soakZone = m.mode.combat.addZone({ life: secs, tick: 0.09, onTick: () => {
    if (G.player !== P) return;
    puff(G.vfx.dot, P.pos.x + rand(-0.28, 0.28), P.pos.y + rand(0.5, 1.2), P.pos.z + rand(-0.28, 0.28), { vy: -0.5, life: 0.45, size: 0.09, size1: 0.05, color: '#8ae4ff', alpha: 0.95, alpha1: 0.5, grav: 9 });
  } });
}
/** water droplets flung along (dx, dz) from (x, y, z) */
function droplets(G, x, y, z, dx, dz, n, spread, speed, color = '#7ee2ff', up = 1) {
  for (let i = 0; i < n; i++) {
    const a = Math.atan2(dx, dz) + rand(-spread, spread), s = rand(0.45, 1) * speed;
    puff(G.vfx.dot, x, y, z, { vx: Math.sin(a) * s, vy: rand(1.5, 4.2) * up, vz: Math.cos(a) * s, life: rand(0.45, 0.8), size: rand(0.08, 0.15), size1: 0.05, color: i % 4 ? color : '#ffffff', alpha: 1, alpha1: 0.7, grav: 11, drag: 0.6 });
  }
}
/** GLSL: rotate v by Euler (r.x about x, r.y about z) in three.js XYZ order (the z turn applies first) */
const KROT = 'vec3 kRot(vec3 p, vec2 r) { float cz = cos(r.y), sz = sin(r.y); p = vec3(p.x * cz - p.y * sz, p.x * sz + p.y * cz, p.z); float cx = cos(r.x), sx = sin(r.x); return vec3(p.x, p.y * cx - p.z * sx, p.y * sx + p.z * cx); }';
const hurtSfx = (m, name, gap = 0.45) => { const t = m.G.engine?.time || 0; if (t - (m._hurtT || -9) > gap) { m._hurtT = t; sfx(name, m.pos); } };

// ================================================================================================= KAPPA
// A chubby river imp: frog-green skin, a duck beak, a turtle shell on its back and the famous dish on its head, ringed
// by a mop of hair. The water in the dish is its strength: it drains as the kappa is hurt (vertex hook), and when it
// gets low the kappa runs to the nearest water to refill it and heal. It fights with a lunging grab (holds you, then
// splashes you off) and a head-flick splash that soaks you.
const KP = { GRAB_WIND: 0.5, LUNGE: 0.28, LUNGE_SPD: 11, HOLD: 0.85, SPL_WIND: 0.55, SPL_R: 2.7, SPL_ARC: 0.6, LANE_W: 0.5, HEAL_T: 2.8, DISH_Y: 0.36 };
const KP_HEAD = [0, 0.56, 0.02], KP_ARMS = [0, 0.445, 0.02];
const KAPPA_HOOK = {
  pars: 'uniform float uWater; uniform vec2 uHead; uniform vec2 uArm;' + KROT,
  // head (uv.y 4) turns about the neck; its dish water (uv.y 3) also shrinks toward the dish centre and sinks as the
  // level (life) drops; the arms (uv.y 5) swing about the shoulders
  body: `{ vec3 HP = vec3(${KP_HEAD.join(', ')}), AP = vec3(${KP_ARMS.join(', ')});
      if (uv.y > 2.5 && uv.y < 4.5) { vec3 p = transformed - HP; if (uv.y < 3.5) { p.xz *= uWater; p.y -= (1.0 - uWater) * 0.022; } transformed = kRot(p, uHead) + HP; }
      else if (uv.y > 4.5) transformed = kRot(transformed - AP, uArm) + AP; }`,
  nrm: 'if (uv.y > 2.5 && uv.y < 4.5) objectNormal = kRot(objectNormal, uHead); else if (uv.y > 4.5) objectNormal = kRot(objectNormal, uArm);',
  ol: 'if (uv.y > 2.5 && uv.y < 3.5) transformed = position;',
};
function kappaSpec(v) {
  const skin = col(v.skin), skinD = col(v.skin).multiplyScalar(0.78), belly = col(v.belly), shellC = col(v.shell), scute = col(v.scute), rim = col(v.rim);
  const B = [], H = [], A = [];
  const skinP = (p, n, o) => { o.copy(skin); if (n.y < -0.35) o.lerp(skinD, 0.45); };
  // torso + belly plastron (cream, three scute grooves)
  B.push(paint(xf(new THREE.SphereGeometry(1, 16, 11), { p: [0, 0.32, 0], s: [0.2, 0.205, 0.18] }), skinP));
  B.push(paint(xf(new THREE.SphereGeometry(1, 14, 10), { p: [0, 0.305, 0.092], s: [0.145, 0.158, 0.1] }), (p, n, o) => { o.copy(belly); if (Math.abs(Math.sin((p.y - 0.3) * 30)) < 0.16 && n.z > 0.4) o.multiplyScalar(0.84); }));
  // turtle shell: a dome on the back with Voronoi scutes (lighter centres, dark seams) and a cream rim
  const SC = [0, 0.37, -0.085], SR = [0.205, 0.25, 0.175];
  const seeds = [[0, 0, 1]];
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + 0.63, t = 0.9; seeds.push([Math.sin(t) * Math.sin(a), Math.sin(t) * Math.cos(a), Math.cos(t)]); }
  for (let i = 0; i < 10; i++) { const a = i / 10 * TAU, t = 1.42; seeds.push([Math.sin(t) * Math.sin(a), Math.sin(t) * Math.cos(a), Math.cos(t)]); }
  const dome = new THREE.SphereGeometry(1, 22, 12, 0, TAU, 0, Math.PI / 2);
  dome.rotateX(-Math.PI / 2); dome.scale(SR[0], SR[1], SR[2]); dome.translate(...SC);
  B.push(paint(dome, (p, n, o) => {
    _q.set((p.x - SC[0]) / SR[0], (p.y - SC[1]) / SR[1], -(p.z - SC[2]) / SR[2]).normalize();
    let d1 = 9, d2 = 9;
    for (const s of seeds) { const d = 1 - (_q.x * s[0] + _q.y * s[1] + _q.z * s[2]); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
    o.copy(shellC).lerp(scute, clamp(0.75 - (d1) * 5) * 0.8);
    if (d2 - d1 < 0.03) o.copy(shellC).multiplyScalar(0.58);
    if (_q.z < 0.14) o.copy(rim);
  }));
  B.push(paint(xf(new THREE.TorusGeometry(1, 0.1, 5, 26), { p: [SC[0], SC[1], SC[2] + 0.005], s: [SR[0] * 1.04, SR[1] * 1.03, 0.3] }), (p, n, o) => o.copy(rim).multiplyScalar(0.92 + 0.08 * Math.sin(Math.atan2(p.y - SC[1], p.x) * 14))));
  if (v.star) { // a little starfish hitching a ride on the shell
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; B.push(tuft([0.06, 0.47, -0.25], [Math.sin(a), Math.cos(a), -0.4], 0.1, 0.03, '#ff8a4a', 6)); }
    B.push(ell(0.038, 0.038, 0.022, '#ffa25a', [0.06, 0.47, -0.258], [0, 0, 0], 8));
  }
  // stubby legs + webbed paddle feet
  for (const k of [-1, 1]) {
    B.push(tubeC([[k * 0.09, 0.2, 0, 0.052], [k * 0.1, 0.11, 0.012, 0.047], [k * 0.105, 0.05, 0.025, 0.043]], skin.getStyle(), 6));
    B.push(ell(0.08, 0.028, 0.1, v.web, [k * 0.11, 0.026, 0.06], [0, k * 0.25, 0], 10));
    for (const t of [-1, 0, 1]) { const a = k * 0.25 + t * 0.5; B.push(ell(0.026, 0.022, 0.03, skin.getStyle(), [k * 0.11 + Math.sin(a) * 0.095, 0.03, 0.06 + Math.cos(a) * 0.095], [0, a, 0], 5)); }
  }
  // ---- head (its own part: tilts back to splash) — big and round, Pokopia proportions
  const HC = [0, 0.16, 0.0], HR = [0.27, 0.235, 0.245];
  H.push(paint(xf(new THREE.SphereGeometry(1, 20, 14), { p: HC, s: HR }), (p, n, o) => { o.copy(skin); if (n.y < -0.4) o.lerp(skinD, 0.35); }));
  // duck bill (upper + lower)
  const bk = col(v.beak), bkD = col(v.beak).multiplyScalar(0.8);
  H.push(paint(xf(new THREE.SphereGeometry(1, 16, 10), { p: [0, 0.1, 0.228], r: [0.1, 0, 0], s: [0.125, 0.047, 0.11] }), (p, n, o) => { o.copy(bk); if (n.y < -0.2) o.copy(bkD); else if (n.y > 0.7) o.lerp(col('#ffffff'), 0.18); }));
  H.push(paint(xf(new THREE.SphereGeometry(1, 12, 8), { p: [0, 0.058, 0.216], r: [0.18, 0, 0], s: [0.095, 0.032, 0.085] }), (p, n, o) => o.copy(bkD)));
  H.push(...eyesCute(0.225, 0.222, 0.102, 1.4, { brow: v.brow ?? 1, seg: 10 }));
  H.push(...cheeks(0.125, 0.19, 0.178, 1.1, '#ff9ab0'));
  // the dish (sara) on top, its water (hook channel 3) and a glint
  H.push(lathe([[0.001, 0.0], [0.1, 0.0], [0.14, 0.012], [0.157, 0.036], [0.152, 0.052], [0.138, 0.047], [0.124, 0.029], [0.001, 0.025]], 22, (p, n, o) => o.set(p.y > 0.02 && Math.hypot(p.x, p.z) < 0.135 && n.y > 0.3 ? '#dcecee' : v.dish), { p: [0, KP.DISH_Y, 0] }));
  H.push(uvs(paint(xf(new THREE.CylinderGeometry(0.128, 0.126, 0.014, 20), { p: [0, KP.DISH_Y + 0.036, 0] }), (p, n, o) => { o.set(v.water); if (Math.hypot(p.x, p.z) > 0.1) o.lerp(col('#ffffff'), 0.3); }), 0, 3));
  H.push(uvs(ell(0.042, 0.005, 0.024, '#ffffff', [-0.045, KP.DISH_Y + 0.044, -0.03], [0, 0.5, 0], 8), 0, 3));
  // okappa hair: a mop of tufts round the dish (the forehead left clear)
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * TAU + 0.22; if (Math.cos(a) > 0.72) continue;
    const s = Math.sin(a), c = Math.cos(a), lng = 0.13 + 0.03 * ((i * 7) % 3) / 2;
    H.push(tuft([s * 0.165, KP.DISH_Y + 0.015, c * 0.165], [s, -0.5 - 0.12 * (i % 2), c], lng, 0.05, i % 2 ? v.hair : col(v.hair).multiplyScalar(0.84).getStyle(), 6));
  }
  // ---- arms (one part: they reach forward together to grab)
  const handC = v.web;
  for (const k of [-1, 1]) {
    A.push(tubeC([[k * 0.155, 0.0, 0.0, 0.046], [k * 0.215, -0.07, 0.035, 0.041], [k * 0.245, -0.135, 0.07, 0.037]], skin.getStyle(), 6));
    A.push(ell(0.056, 0.05, 0.05, skin.getStyle(), [k * 0.252, -0.168, 0.085], [0, 0, 0], 9));
    A.push(ell(0.052, 0.012, 0.038, handC, [k * 0.252, -0.206, 0.105], [0.3, 0, 0], 8)); // webbing
    for (const t of [-1, 0, 1]) A.push(ell(0.017, 0.036, 0.017, skin.getStyle(), [k * 0.252 + t * 0.03, -0.212, 0.1 + (1 - Math.abs(t)) * 0.012], [0.35, 0, -t * 0.25], 5));
  }
  if (v.cucumber) { // a prized cucumber in the right hand
    const cg = lathe([[0.001, -0.17], [0.022, -0.16], [0.036, -0.12], [0.04, -0.02], [0.038, 0.1], [0.028, 0.15], [0.001, 0.165]], 10, (p, n, o) => { o.set('#3e8a2a'); if (Math.sin(Math.atan2(p.x, p.z) * 5) > 0.55) o.set('#6ab83a'); if (Math.sin(p.y * 80) * Math.sin(Math.atan2(p.x, p.z) * 7) > 0.8) o.set('#b8e070'); });
    cg.rotateX(1.15); cg.rotateZ(-0.35); cg.translate(0.28, -0.17, 0.16);
    A.push(cg, ell(0.02, 0.02, 0.02, '#f8e070', [0.335, -0.08, 0.3], [0, 0, 0], 6));
  }
  for (const g of H) { g.translate(...KP_HEAD); if (!g.userData.uvs) uvs(g, 0, 4); }
  for (const g of A) { g.translate(...KP_ARMS); uvs(g, 0, 5); }
  return { parts: [{ name: 'body', geo: stamp([...B, ...H, ...A]) }] };
}
function buildKappa(v) {
  const M = assemble('kappa:' + v.key, () => kappaSpec(v));
  const I = M.inner, uW = { value: 1 }, uH = { value: new THREE.Vector2() }, uA = { value: new THREE.Vector2() };
  hookModel(M, { key: 'kappa', U: { uWater: uW, uHead: uH, uArm: uA }, ...KAPPA_HOOK });
  let wad = 0, lvl = 1, flick = 0, look = 0;
  M.dip = 0;
  M.animate = (dt, t, moving) => {
    const a = M.act, k = (M.actT += dt), mv = moving ? 1 : 0, mon = M.mon;
    // dish water: a kappa's strength (life), minus what a splash just spilled
    const lf = mon ? clamp(mon.life / mon.lifeMax) : 1;
    M.dip = Math.max(0, M.dip - dt * 0.35);
    lvl += (clamp(0.22 + 0.78 * lf - M.dip, 0.12, 1) - lvl) * Math.min(1, dt * 4);
    uW.value = lvl + Math.sin(t * 5.3) * 0.015;
    let y = 0, rx = 0, rz = 0, sy = 1, hx = 0, hz = 0, ax = -0.15, az = 0;
    switch (a) {
      case 'wind': { const p = ease.outCubic(clamp(k / KP.GRAB_WIND)); sy = 1 - 0.12 * p; rx = -0.22 * p; ax = 0.9 * p; hx = 0.12 * p; rz = Math.sin(t * 55) * 0.035 * p; y = -0.02 * p; break; }
      case 'lunge': { const p = clamp(k / KP.LUNGE); rx = 0.55; y = Math.sin(p * Math.PI) * 0.12; sy = 1.06; ax = -1.55; hx = -0.2; break; }
      case 'hold': rx = 0.32; ax = -1.45 + Math.sin(t * 26) * 0.12; rz = Math.sin(t * 31) * 0.08; hx = -0.15; hz = Math.sin(t * 17) * 0.15; y = 0.04 + Math.abs(Math.sin(t * 18)) * 0.03; break;
      case 'stumble': { const p = clamp(k / 0.7); const fl = p < 0.35 ? ease.outCubic(p / 0.35) : 1 - ease.inOutQuad((p - 0.35) / 0.65); rx = 1.15 * fl; y = -0.12 * fl; ax = -2.2 * fl; hx = 0.2 * fl; break; }
      case 'splashWind': { const p = ease.outCubic(clamp(k / KP.SPL_WIND)); hx = -0.75 * p; rx = -0.16 * p; ax = -0.5 * p; az = 0.4 * p; sy = 1 - 0.06 * p; rz = Math.sin(t * 48) * 0.03 * p; break; }
      case 'splash': { const p = clamp(k / 0.5); flick = p < 0.18 ? ease.outCubic(p / 0.18) : 1 - ease.inOutQuad((p - 0.18) / 0.82); hx = 0.85 * flick; rx = 0.32 * flick; ax = 0.6 * flick; break; }
      case 'flee': wad += dt * 15; y = Math.abs(Math.sin(wad)) * 0.07; rz = Math.sin(wad) * 0.14; rx = 0.28; ax = -2.5 + Math.sin(t * 22) * 0.35; az = Math.sin(t * 22) * 0.25; hz = Math.sin(t * 11) * 0.12; break;
      case 'heal': y = -0.1 + Math.sin(t * 3.1) * 0.025; rz = Math.sin(t * 2.2) * 0.1; hx = -0.18 + Math.sin(t * 1.7) * 0.06; hz = Math.sin(t * 2.2) * -0.08; ax = -0.35 + Math.sin(t * 6) * 0.35; az = Math.sin(t * 6 + 1) * 0.2; break;
      default: {
        wad += dt * (moving ? 10 : 0);
        y = Math.abs(Math.sin(wad)) * 0.06 * mv + Math.sin(t * 2.3) * 0.006;
        rz = Math.sin(wad) * 0.13 * mv + Math.sin(t * 1.3) * 0.03;
        rx = 0.1 * mv; sy = 1 + Math.sin(t * 2.3) * 0.02 * (1 - mv);
        ax = -0.15 + Math.sin(wad * 2) * 0.22 * mv + Math.sin(t * 1.9) * 0.05; az = Math.abs(Math.sin(wad)) * 0.15 * mv;
        if (!moving && every(M, 'lookT', dt, 2.5, 5)) look = 1; // idle: peeks at its dish water
        look = Math.max(0, look - dt * 0.9);
        hx = Math.sin(t * 1.6) * 0.04 - Math.sin(look * Math.PI) * 0.22; hz = -rz * 0.6 + Math.sin(look * Math.PI * 2) * 0.12;
      }
    }
    I.position.y = y; I.rotation.set(rx, 0, rz); I.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    uH.value.set(hx, hz); uA.value.set(ax, az);
  };
  return M;
}
/** the nearest wading water (walkable, 5+ cm deep), preferring spots away from the hero → rs.wx / rs.wz */
function findWater(m, rs) {
  const W = m.world, P = m.G.player; if (!W.waterAt) return false;
  const x0 = m.pos.x, z0 = m.pos.z;
  for (let r = 1.5; r <= 22; r += 1.5) {
    const n = Math.max(10, Math.round(r * 2.6)), a0 = rand(0, TAU);
    let best = -1;
    for (let i = 0; i < n; i++) {
      const a = a0 + i / n * TAU, x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r, w = W.waterAt(x, z);
      if (w < 0.05 || !W.walkable(x, z) || W.collision?.solidAt?.(x, z, 0.3)) continue;
      const sc = Math.min(w, 0.22) * 12 + (P ? dist(x, z, P.pos.x, P.pos.z) * 0.1 : 0); // (wading depth first: it sits in the water)
      if (sc > best) { best = sc; rs.wx = x; rs.wz = z; }
    }
    if (best >= 0) return true;
  }
  return false;
}
function kappaAI(m, dt, target, d, slow) {
  const rs = m.rs, G = m.G, P = G.player, tr = target.radius || 0.3, M = m.model;
  rs.t += dt; rs.healCd = (rs.healCd ?? 2) - dt;
  const go = (st, pose = st) => { rs.st = st; rs.t = 0; act(m, pose === 'move' ? 'idle' : pose); };
  if ((rs.st === 'wind' || rs.st === 'splashWind') && m.state !== 'windup') go('move');
  if (rs.interrupt) { // (damageTaken: a big hit breaks a hold or a bath)
    rs.interrupt = false;
    if (rs.st === 'hold') { go('stumble'); m.state = 'chase'; m.cd = rand(1.4, 2); }
    else if (rs.st === 'heal') { go('move'); m.state = 'chase'; rs.healCd = 7; m.emote('anger', 1.1); }
  }
  // low on water: run to the nearest pool / shallows and refill the dish
  if (rs.st === 'move' && m.life < m.lifeMax * 0.45 && rs.healCd <= 0 && (rs.heals ?? 2) > 0) {
    if (findWater(m, rs)) { go('flee'); m.state = 'chase'; rs.fx = m.pos.x; rs.fz = m.pos.z; rs.stall = 0; m.emote('sweat', 1.3); sfx('kappa_flee', m.pos); }
    else rs.healCd = 4;
  }
  switch (rs.st) {
    case 'wind':
      m.faceTo(target.pos.x, target.pos.z, dt * 0.6);
      if (rs.t >= KP.GRAB_WIND) { go('lunge'); m.state = 'attack'; m.telegraph = null; rs.dx = Math.sin(m.facing); rs.dz = Math.cos(m.facing); rs.trav = 0; sfx('kappa_lunge', m.pos); }
      return false;
    case 'lunge': {
      rs.trav += push(m, rs.dx, rs.dz, KP.LUNGE_SPD, dt);
      if (Math.random() < 0.6) puff(G.vfx.smoke, m.pos.x, m.pos.y + 0.1, m.pos.z, { vx: -rs.dx, vy: 0.3, vz: -rs.dz, life: 0.35, size: 0.25, size1: 0.5, color: '#f4ead4', alpha: 0.5, drag: 3 });
      if (dist(target.pos.x, target.pos.z, m.pos.x, m.pos.z) < 0.62 + tr) {
        if (target === P && !P.invuln && !G.playerDead) { // got you!
          go('hold'); m.state = 'attack'; rs.hx = rs.dx; rs.hz = rs.dz;
          m.mode.combat.hitPlayer(Math.max(1, Math.round(roll(m) * 0.55)), { element: 'phys', level: m.level, from: m.pos, src: m });
          status(G, 'Grabbed!', '#a8ff8a', '_grabT', 0.5);
          droplets(G, m.pos.x, m.pos.y + 0.6, m.pos.z, rs.dx, rs.dz, 6, 1.2, 2);
          sfx('kappa_grab', m.pos);
        } else if (target !== P) { m.dealTo(target, roll(m), 'phys', 0.8); go('recover'); m.state = 'chase'; m.cd = rand(2.2, 3); }
        return true;
      }
      if (rs.t >= KP.LUNGE) { go('stumble'); m.state = 'chase'; m.cd = rand(2, 2.8); sfx('kappa_flop', m.pos); G.vfx.dust(m.pos, { n: 4, color: '#f0e4c8' }); }
      return true;
    }
    case 'hold': { // clinging to the hero, who can barely move; a roll shakes it off
      if (!P || G.playerDead || P.invuln) { go('stumble'); m.state = 'chase'; m.cd = rand(1.6, 2.2); return false; }
      m.pos.x = P.pos.x - rs.hx * 0.55; m.pos.z = P.pos.z - rs.hz * 0.55;
      m.facing = Math.atan2(rs.hx, rs.hz);
      P.slowT = Math.max(P.slowT || 0, 0.12); P.slowAmt = Math.max(P.slowAmt || 0, 0.85);
      if (Math.random() < dt * 14) puff(G.vfx.dot, P.pos.x + rand(-0.3, 0.3), P.pos.y + rand(0.3, 1), P.pos.z + rand(-0.3, 0.3), { vy: rand(0.5, 1.5), life: 0.4, size: 0.1, size1: 0.05, color: '#8ae4ff', alpha: 1, alpha1: 0.4, grav: 8 });
      if (rs.t >= KP.HOLD) { // splash off
        go('recover', 'splash'); m.state = 'chase'; m.cd = rand(2.4, 3.2); M.dip = 0.25;
        m.mode.combat.hitPlayer(Math.round(roll(m) * 0.85), { element: 'frost', level: m.level, from: m.pos, knock: 0.9, src: m });
        soak(m, 1.8, 0.3);
        droplets(G, P.pos.x, P.pos.y + 0.9, P.pos.z, rs.hx, rs.hz, 16, 1.4, 3.4);
        G.vfx.ring(P.pos, { color: '#9aeaff', r0: 0.3, r1: 1.4, life: 0.35 });
        sfx('kappa_splash', m.pos);
        push(m, -rs.hx, -rs.hz, 6, 0.08);
      }
      return false;
    }
    case 'stumble': if (rs.t >= 0.75) go('move'); return false;
    case 'recover': if (rs.t >= 0.5) go('move'); return false;
    case 'splashWind':
      m.faceTo(target.pos.x, target.pos.z, dt * 0.8);
      if (rs.t >= KP.SPL_WIND) {
        go('splash'); m.state = 'attack'; m.telegraph = null; M.dip = 0.35;
        const fx = Math.sin(m.facing), fz = Math.cos(m.facing), raw = Math.round(roll(m) * 0.9);
        if (P && !G.playerDead && inCone(m, P, KP.SPL_R, KP.SPL_ARC) && !P.invuln) { m.mode.combat.hitPlayer(raw, { element: 'frost', level: m.level, from: m.pos, knock: 0.6, src: m }); soak(m, 2.2, 0.32); }
        for (const e of m.mode.combat.allies || m.mode.combat.entities) if (e.alive && e.team === 'ally' && e !== P && !e.untargetable && e.pos && inCone(m, e, KP.SPL_R, KP.SPL_ARC)) m.mode.combat.hitAlly(e, raw, { element: 'frost', from: m.pos });
        const hx = m.pos.x + fx * 0.25, hy = m.pos.y + 0.95, hz = m.pos.z + fz * 0.25;
        droplets(G, hx, hy, hz, fx, fz, 30, KP.SPL_ARC, 7, '#7ee2ff', 0.45);
        for (let i = 0; i < 7; i++) { const a = m.facing + rand(-KP.SPL_ARC, KP.SPL_ARC), r = rand(0.8, KP.SPL_R); puff(G.vfx.smoke, m.pos.x + Math.sin(a) * r, m.pos.y + 0.3, m.pos.z + Math.cos(a) * r, { vx: Math.sin(a) * 1.2, vy: rand(0.3, 0.9), vz: Math.cos(a) * 1.2, life: rand(0.5, 0.8), size: 0.45, size1: 1.0, color: '#d8f6ff', alpha: 0.55, alpha1: 0, drag: 2.5 }); }
        for (let i = 0; i < 5; i++) { const a = m.facing + rand(-KP.SPL_ARC, KP.SPL_ARC), r = rand(1, KP.SPL_R); puff(G.vfx.spark, m.pos.x + Math.sin(a) * r, m.pos.y + rand(0.3, 1), m.pos.z + Math.cos(a) * r, { life: 0.35, size: 0.3, size1: 0.02, color: '#e8fcff', alpha: 1, alpha1: 0 }); }
        sfx('kappa_splash', m.pos);
      }
      return false;
    case 'splash': if (rs.t >= 0.55) { go('move'); m.state = 'chase'; m.cd = rand(1.8, 2.5); } return false;
    case 'flee': { // run for the water (a stall or a long run gives up)
      const dx = rs.wx - m.pos.x, dz = rs.wz - m.pos.z, L = Math.hypot(dx, dz);
      if (L < 0.3 || (L < 1.2 && m.world.waterAt?.(m.pos.x, m.pos.z) > 0.1)) {
        go('heal'); m.state = 'chase'; rs.healAcc = 0; rs.healHits = 0;
        G.vfx.ring(m.pos, { color: '#8af0ff', r0: 0.3, r1: 1.3, life: 0.5 });
        droplets(G, m.pos.x, m.pos.y + 0.2, m.pos.z, 0, 1, 12, Math.PI, 2.2);
        m.emote('note', 1.4); sfx('kappa_heal', m.pos);
        return false;
      }
      _dir.set(dx / L, 0, dz / L);
      m.move(_dir, dt, 1.35 * slow);
      rs.stall = dist(m.pos.x, m.pos.z, rs.fx, rs.fz) < 0.25 ? rs.stall + dt : 0;
      if (rs.stall > 0) { if (rs.stall > 0.9) { go('move'); rs.healCd = 5; } } else { rs.fx = m.pos.x; rs.fz = m.pos.z; }
      if (rs.t > 9) { go('move'); rs.healCd = 5; }
      return true;
    }
    case 'heal': { // bath time: refills the dish (heals) in ticks; hits shorten it, a big one breaks it
      rs.healAcc += dt;
      if (rs.healAcc >= 0.4) {
        rs.healAcc -= 0.4;
        const n = Math.round(m.lifeMax * 0.055); m.heal(n);
        G.ui?.float?.(V(m.pos.x, m.pos.y + 1.2, m.pos.z), `+${n}`, { kind: 'heal', color: '#7ff0c8' });
        const hp = V(m.pos.x, m.pos.y + 0.35, m.pos.z);
        G.vfx.sparkle(hp, { n: 5, color: rs.healAcc > 0.2 ? '#8affc8' : '#9af0ff', r: 0.35, rise: 1.4, size: 0.24 });
        G.vfx.ring(m.pos, { color: '#8af0ff', r0: 0.2, r1: 1.0, life: 0.45, opacity: 0.6 });
      }
      if (Math.random() < dt * 10) puff(G.vfx.dot, m.pos.x + rand(-0.35, 0.35), m.pos.y + 0.05, m.pos.z + rand(-0.35, 0.35), { vy: rand(0.4, 0.9), life: rand(0.5, 0.8), size: rand(0.06, 0.11), size1: 0.12, color: '#d8fbff', alpha: 0.9, alpha1: 0 });
      if (rs.t >= KP.HEAL_T - rs.healHits * 0.6 || m.life >= m.lifeMax) {
        rs.heals = (rs.heals ?? 2) - 1; rs.healCd = 10; go('move'); m.cd = Math.min(m.cd, 0.4);
        G.vfx.sparkle(m.lift(0.8), { n: 10, color: '#c8fff0', r: 0.4, rise: 1.2 });
      }
      m.faceTo(target.pos.x, target.pos.z, dt * 0.4);
      return false;
    }
    default: {
      if (rs.st !== 'move') go('move');
      const los = m.mode.los(m.pos, target.pos);
      if (m.cd <= 0 && los && d < 3.2 + tr) {
        // mostly alternates: a lunging grab down a lane (always, from out of splash range), a head-flick splash cone
        const grab = d > KP.SPL_R - 0.3 + tr || Math.random() < (rs.last === 'grab' ? 0.3 : 0.72);
        if (grab) {
          rs.last = 'grab'; go('wind'); m.state = 'windup'; m.faceTo(target.pos.x, target.pos.z, 1);
          m.telegraph = tele(G, { shape: 'lane', x: m.pos.x, z: m.pos.z, r: KP.LANE_W, dir: m.facing, len: Math.min(3.4, d + 0.9), time: KP.GRAB_WIND, color: TELE_C.grab });
          sfx('kappa_wind', m.pos);
          return false;
        }
        {
          rs.last = 'splash'; go('splashWind'); m.state = 'windup'; m.faceTo(target.pos.x, target.pos.z, 1);
          m.telegraph = tele(G, { shape: 'cone', x: m.pos.x, z: m.pos.z, r: KP.SPL_R, dir: m.facing, arc: KP.SPL_ARC, time: KP.SPL_WIND, color: TELE_C.splash });
          sfx('kappa_splash_wind', m.pos);
          return false;
        }
      }
      // spacing: hangs about 1.5–2.1 m off (room for a lunge), hopping back when crowded between attacks
      if (d > 2.1 + tr || !los) { m.chase(target, dt, slow); return true; }
      if (d < 1.15 + tr && m.cd > 0.3) { _dir.set(m.pos.x - target.pos.x, 0, m.pos.z - target.pos.z).normalize(); const f = m.facing; m.move(_dir, dt, 0.6 * slow); m.facing = f; m.faceTo(target.pos.x, target.pos.z, dt); return true; }
      m.faceTo(target.pos.x, target.pos.z, dt);
      return false;
    }
  }
}
function kappaDamage(m, dmg) {
  hurtSfx(m, 'kappa_hurt');
  const rs = m.rs;
  if (rs?.st === 'heal') { rs.healHits = (rs.healHits || 0) + 1; if (dmg > m.lifeMax * 0.12 || rs.healHits >= 3) rs.interrupt = true; }
  else if (rs?.st === 'hold' && dmg > m.lifeMax * 0.12) rs.interrupt = true;
  return dmg;
}

// ================================================================================================= HEIKE-GANI
// A samurai crab: a broad, low carapace wearing a stern samurai face (brows, eyes, moustache, frown) under a golden
// kuwagata helmet crest, cute stalk eyes at the front, eight spindly legs (stepping on the GPU) and two big
// armoured claws held up in front as a shield. Hits from the front clank off the claws (sparks, ~12% gets through):
// strike it from the side or behind (a back hit bites harder). It scuttles in sideways zig-zags keeping its guard
// toward you, turns slowly, dashes sideways at you when you flank it (lane), and raises both claws for a slam (circle)
// that leaves them stuck in the sand — guard down — for a moment.
const HG = { SLAM_WIND: 0.78, SLAM_R: 1.35, SLAM_AT: 1.15, STUCK: 1.25, DASH_WIND: 0.5, DASH_SPD: 11.5, DASH_W: 0.72, TURN: 1.9, GUARD: 1.05, CY: 0.4 };
const HG_CLAW = [0, HG.CY, 0.24];
const CRAB_HOOK = {
  pars: 'uniform float uWalk; uniform float uStride; uniform float uIdle; uniform vec2 uClaw;' + KROT,
  // legs: uv.x = step phase, uv.y = 0 at the hip … 1 at the tip. Lift + reach while walking, a lazy tap while idle.
  // claws (uv.y 5): both pitch together about the shoulders
  body: `if (uv.y > 4.5) { vec3 CP = vec3(${HG_CLAW.join(', ')}); transformed = kRot(transformed - CP, uClaw) + CP; }
    else if (uv.y > 0.001) {
      float ph = uWalk + uv.x, up = max(0.0, sin(ph));
      float sx = transformed.x > 0.0 ? 1.0 : -1.0;
      transformed.y += (up * 0.12 * uStride + max(0.0, sin(uIdle + uv.x * 2.3)) * 0.018 * (1.0 - uStride)) * uv.y;
      transformed.x += cos(ph) * sx * 0.045 * uStride * uv.y;
      transformed.z += sin(ph + 1.3) * 0.035 * uStride * uv.y;
    }`,
  nrm: 'if (uv.y > 4.5) objectNormal = kRot(objectNormal, uClaw);',
  ol: '',
};
function heikeganiSpec(v) {
  const CY = HG.CY, sh = col(v.shell), shD = col(v.shell).multiplyScalar(0.6), shL = col(v.shell).lerp(col('#fff0d8'), 0.3), belly = col(v.belly);
  const B = [], C = [];
  // shape knobs (a variant may set them; the village captain Brineclaw does: wide round shell, a lip, 3 stubby legs a side, big claws)
  const SW = v.shellW ?? 0.5, SD = v.shellD ?? 0.38, DOME = v.dome ?? 0.2, NL = v.legs ?? 4, LK = v.legK ?? 1, LL = v.legL ?? 1, CK = v.clawK ?? 1, ST = v.stalk ?? 1;
  const W = z => SW * (1 + 0.1 * z / SD), top = (x, z) => CY + DOME * Math.sqrt(Math.max(0, 1 - (x / W(z)) ** 2 - (z / SD) ** 2));
  // carapace: a broad low shield, wider at the front, with a lumpy rim
  B.push(blob(28, 16, q => { const b = 1 + 0.035 * Math.sin(q.x * 11) * Math.sin(q.z * 9); return q.set(q.x * SW * (1 + 0.1 * q.z) * b, q.y * (q.y > 0 ? DOME : 0.12) + CY, q.z * SD * b); },
    (p, n, o) => { o.copy(sh); if (n.y < 0.25) o.lerp(shD, clamp((0.25 - n.y) * 1.6)); else o.lerp(shL, clamp((n.y - 0.8) * 3) * 0.45); if (n.y < -0.5) o.copy(belly); }));
  // rim spikes along the sides (or, with v.lip, a rolled rim all round the shell)
  if (v.lip) { const pts = []; for (let i = 0; i <= 40; i++) { const a = i / 40 * TAU, z = Math.sin(a) * SD * 0.99; pts.push([Math.cos(a) * W(z) * 0.99, CY + 0.005, z, 0.034]); } B.push(tubeC(pts, (p, n, o) => o.copy(shD).lerp(sh, clamp(n.y + 0.4) * 0.6), 6)); }
  else for (const k of [-1, 1]) for (let i = 0; i < 4; i++) { const z = 0.2 - i * 0.13, x = W(z) * Math.sqrt(1 - (z / 0.4) ** 2) * k; B.push(tuft([x * 0.97, CY + 0.02, z], [k, 0.25, 0.3], 0.09, 0.03, v.shell, 6)); }
  // ---- the samurai face on the shell (forehead toward the back, chin toward the claws)
  const F = v.face, eyeW = v.eyeW;
  const on = (x, z, lift = 0) => [x, top(x, z) + lift, z];
  for (const k of [-1, 1]) {
    // heavy angry brows, inner ends dipping toward the eyes
    B.push(tubeC([[...on(k * 0.045, -0.075, 0.012), 0.03], [...on(k * 0.15, -0.14, 0.02), 0.034], [...on(k * 0.27, -0.19, 0.008), 0.02]], F, 6));
    // eyes: slanted whites, pupils glaring toward the middle
    const ex = k * 0.15, ez = -0.03;
    B.push(ell(0.085, 0.022, 0.048, eyeW, on(ex, ez, -0.004), [0, -k * 0.38, 0], 10));
    B.push(ell(0.036, 0.02, 0.034, F, on(ex - k * 0.03, ez + 0.012, 0.006), [0, 0, 0], 8));
    B.push(ell(0.012, 0.008, 0.012, '#ffffff', on(ex - k * 0.04, ez + 0.0, 0.02), [0, 0, 0], 6));
    // cheekbones + the big curly moustache
    B.push(ell(0.07, 0.03, 0.05, col(v.shell).multiplyScalar(0.8).getStyle(), on(k * 0.3, 0.07, -0.012), [0, k * 0.4, 0], 8));
    B.push(tubeC(smooth([[...on(k * 0.02, 0.11, 0.012), 0.022], [...on(k * 0.1, 0.125, 0.016), 0.026], [...on(k * 0.19, 0.105, 0.012), 0.02], [...on(k * 0.235, 0.05, 0.01), 0.012], [...on(k * 0.2, 0.02, 0.012), 0.007]], 10), F, 6));
  }
  B.push(ell(0.05, 0.035, 0.06, col(v.shell).multiplyScalar(0.85).getStyle(), on(0, 0.055, -0.005), [0, 0, 0], 10)); // nose
  B.push(tubeC(smooth([[...on(-0.12, 0.225, 0.004), 0.018], [...on(-0.05, 0.19, 0.012), 0.022], [...on(0.05, 0.19, 0.012), 0.022], [...on(0.12, 0.225, 0.004), 0.018]], 8), F, 6)); // frown
  // ---- kuwagata crest: two golden horns sweeping up from the back of the shell + the clan mon
  const gold = col(v.crest), goldD = col(v.crest).multiplyScalar(0.72);
  for (const k of [-1, 1]) {
    const hp = smooth([[k * 0.05, top(0.05, -0.27) - 0.01, -0.27, 0.036], [k * 0.12, top(0.1, -0.3) + 0.1, -0.33, 0.034], [k * 0.22, top(0.1, -0.3) + 0.26, -0.38, 0.028], [k * 0.3, top(0.1, -0.3) + 0.4, -0.37, 0.018], [k * 0.33, top(0.1, -0.3) + 0.47, -0.33, 0.006]], 12);
    B.push(tubeC(hp, (p, n, o) => o.copy(gold).lerp(goldD, clamp(-n.z * 0.6)), 6));
  }
  B.push(cyl(0.075, 0.08, 0.035, v.crest, on(0, -0.27, 0.0), [-0.5, 0, 0], 14), ell(0.035, 0.012, 0.035, v.mon, on(0, -0.262, 0.03), [-0.5, 0, 0], 10));
  // ---- stalk eyes at the front (the crab's own, cute and cross)
  for (const k of [-1, 1]) {
    const sz0 = SD * 0.79, sy = (ST - 1) * 0.12; // (longer stalks lift the eyes clear of a bigger dome)
    B.push(tubeC([[k * 0.08, CY + 0.06, sz0, 0.022], [k * 0.1, CY + 0.15 + sy, sz0 + 0.03, 0.018]], v.leg, 5));
    B.push(ell(0.048, 0.05, 0.046, '#fffaf2', [k * 0.1, CY + 0.19 + sy, sz0 + 0.035], [0, 0, 0], 10));
    B.push(ell(0.026, 0.03, 0.02, '#1e1418', [k * 0.1 - k * 0.006, CY + 0.188 + sy, sz0 + 0.072], [0, 0, 0], 8), ell(0.009, 0.009, 0.006, '#ffffff', [k * 0.1 - k * 0.018, CY + 0.2 + sy, sz0 + 0.09], [0, 0, 0], 6));
    B.push(tubeC([[k * 0.155, CY + 0.25 + sy, sz0 + 0.03, 0.012], [k * 0.05, CY + 0.228 + sy, sz0 + 0.06, 0.012]], INK, 4)); // cross little brows
  }
  // ---- 8 legs, short and chunky, fanned fore and aft (GPU stepping: uv.x = phase alternating by leg + side, uv.y =
  // weight toward the tip)
  const legC = col(v.leg), legJ = col(v.leg).lerp(col('#fff2dc'), 0.35), tipC = col(v.leg).multiplyScalar(0.42);
  const LX = 0.34 * SW / 0.5;
  for (const k of [-1, 1]) for (let i = 0; i < NL; i++) {
    const u = NL > 1 ? i / (NL - 1) : 0.5, fan = 0.62 - u * 1.32, z = 0.13 - u * 0.3, ph = ((i + (k > 0 ? 1 : 0)) % 2) * Math.PI + i * 0.35;
    const out = (r, y) => [k * (LX + r * LL * Math.cos(fan)), y, z + r * LL * Math.sin(fan)];
    const pts = smooth([[...out(0, CY - 0.05), 0.058 * LK], [...out(0.17, CY + 0.07), 0.05 * LK], [...out(0.28, CY + 0.03), 0.042 * LK], [...out(0.37, 0.03), 0.014 * LK + 0.016 * (LK - 1)]], 6);
    const g = tubeC(pts, (p, n, o) => { const r = Math.hypot(Math.abs(p.x) - LX, p.z - z) / LL; o.copy(legC); if (Math.abs(r - 0.17) < 0.022 * LK || Math.abs(r - 0.28) < 0.018 * LK) o.copy(legJ); if (r > 0.31) o.lerp(tipC, clamp((r - 0.31) / 0.06)); }, 5);
    B.push(uvf(g, p => [ph, clamp((Math.hypot(Math.abs(p.x) - LX, p.z - z) / LL - 0.03) / 0.34) ** 1.2]));
  }
  // ---- claws (one part: raised in front as a shield, up for the slam), lacquered like samurai gauntlets
  const cl = col(v.claw), clD = col(v.claw).multiplyScalar(0.62), trim = col(v.trim), tip = col(v.tip);
  for (const k of [-1, 1]) {
    C.push(tubeC(smooth([[k * 0.22, -0.07, -0.12, 0.062], [k * 0.35, 0.0, 0.0, 0.058], [k * 0.33, 0.08, 0.12, 0.054]], 5), v.leg, 6));
    const PX = k * 0.25, PY = 0.14, PZ = 0.26, ry = -k * 0.42;
    const palm = new THREE.SphereGeometry(1, 14, 10); palm.scale(0.155, 0.135, 0.185); palm.rotateY(ry); palm.translate(PX, PY, PZ);
    C.push(paint(palm, (p, n, o) => {
      o.copy(cl); if (n.y < -0.3) o.lerp(clD, 0.6); else if (n.y > 0.75) o.lerp(col('#ffffff'), 0.14);
      const u = (p.z - PZ) * Math.cos(ry) - (p.x - PX) * Math.sin(ry); if (Math.abs(u + 0.03) < 0.022 && n.y > -0.2) o.copy(trim); // gold cuff band
    }));
    for (let j = 0; j < 3; j++) C.push(ell(0.019, 0.019, 0.019, v.trim, [PX + k * (0.05 - j * 0.045), PY + 0.128, PZ - 0.05 + j * 0.045], [0, 0, 0], 6)); // gold studs
    const finger = (base, dir, len, r0) => { const d = V(...dir).normalize(); return tubeC(smooth([[...base, r0], [base[0] + d.x * len * 0.5, base[1] + d.y * len * 0.5 + 0.025, base[2] + d.z * len * 0.5, r0 * 0.82], [base[0] + d.x * len, base[1] + d.y * len, base[2] + d.z * len, r0 * 0.22]], 5), (p, n, o) => { const t = clamp(Math.hypot(p.x - base[0], p.y - base[1], p.z - base[2]) / len); o.copy(cl).lerp(tip, clamp((t - 0.55) * 2.5)); }, 6); };
    C.push(finger([k * 0.19, 0.1, 0.4], [-k * 0.6, -0.08, 0.8], 0.27, 0.062));   // fixed finger
    C.push(finger([k * 0.27, 0.21, 0.39], [-k * 0.52, 0.16, 0.84], 0.25, 0.055));  // dactyl (a gap between: a proper pincer)
  }
  if (CK !== 1) for (const g of C) { g.translate(0, 0.05, 0.1); g.scale(CK, CK, CK); g.translate(0, -0.05, -0.1 + (SD - 0.38) * 0.6); } // (bigger claws, grown out from the shoulders)
  for (const g of C) { g.translate(...HG_CLAW); uvs(g, 0, 5); }
  return { parts: [{ name: 'body', geo: stamp([...B, ...C]) }] };
}
function buildHeikegani(v) {
  const M = assemble('heikegani:' + v.key, () => heikeganiSpec(v));
  const I = M.inner;
  const U = { uWalk: { value: 0 }, uStride: { value: 0 }, uIdle: { value: rand(0, 9) }, uClaw: { value: new THREE.Vector2() } };
  hookModel(M, { key: 'crab', U, ...CRAB_HOOK });
  M.clank = 0; M.gait = 1; M.side = 0;
  let stride = 0;
  M.animate = (dt, t, moving) => {
    const a = M.act, k = (M.actT += dt);
    const run = a === 'dash' ? 1 : moving ? 1 : a === 'dashWind' ? 0.5 : 0;
    stride += (run - stride) * Math.min(1, dt * 10);
    U.uStride.value = stride; U.uWalk.value += dt * (a === 'dash' ? 26 : a === 'dashWind' ? 30 : 12 * M.gait) * (run > 0 ? 1 : 0.2); U.uIdle.value += dt * 3.1;
    M.clank = Math.max(0, M.clank - dt * 5);
    let y = Math.abs(Math.sin(U.uWalk.value)) * 0.02 * stride, rx = 0, rz = Math.sin(U.uWalk.value) * 0.035 * stride, sy = 1, cx = -0.2 + Math.sin(t * 1.7) * 0.04, cz = 0;
    switch (a) {
      case 'slamWind': { const p = ease.outCubic(clamp(k / (HG.SLAM_WIND * 0.7))); cx = -0.2 - 1.25 * p + Math.sin(t * 40) * 0.03 * p; rx = -0.2 * p; sy = 1 - 0.08 * p; y = 0.03 * p; break; }
      case 'slam': { const p = clamp(k / 0.1); cx = -1.45 + 2.05 * ease.inQuad(p); rx = 0.16 * p; y = -0.03 * p; sy = 1 - 0.05 * p; break; }
      case 'stuck': cx = 0.6 + Math.sin(t * 19) * 0.05; cz = Math.sin(t * 13) * 0.07; rx = 0.14; rz = Math.sin(t * 9) * 0.05; y = -0.03; break;
      case 'dashWind': { const p = ease.outCubic(clamp(k / HG.DASH_WIND)); sy = 1 - 0.1 * p; y = -0.02 * p; rz = -M.side * 0.16 * p + Math.sin(t * 50) * 0.02 * p; cx = -0.35 * p - 0.2; break; }
      case 'dash': rz = M.side * 0.12; y = 0.03; cx = -0.45; break;
      case 'recover': { const p = clamp(k / 0.45); rz = M.side * 0.12 * (1 - p); break; }
      default: if (every(M, 'snapT', dt, 2.2, 4.5)) M.snap = 1; M.snap = Math.max(0, (M.snap || 0) - dt * 3); cx -= Math.sin((M.snap || 0) * Math.PI) * 0.25;
    }
    cx += M.clank * 0.35;
    I.position.y = y; I.rotation.set(rx, 0, rz); I.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    U.uClaw.value.set(cx, cz);
  };
  return M;
}
/** turn toward (x, z) at no more than `rate` rad/s → the remaining angle */
function turnTo(m, x, z, rate, dt) { const d = angleDiff(m.facing, Math.atan2(x - m.pos.x, z - m.pos.z)); m.facing += clamp(d, -rate * dt, rate * dt); return d - clamp(d, -rate * dt, rate * dt); }
function heikeganiAI(m, dt, target, d, slow) {
  const rs = m.rs, G = m.G, tr = target.radius || 0.3, M = m.model;
  rs.t += dt; rs.dashCd = (rs.dashCd ?? 1.5) - dt;
  const go = (st, pose = st) => { rs.st = st; rs.t = 0; act(m, pose === 'move' ? 'idle' : pose); };
  if ((rs.st === 'slamWind' || rs.st === 'dashWind') && m.state !== 'windup') go('move');
  const tx = target.pos.x, tz = target.pos.z;
  switch (rs.st) {
    case 'slamWind':
      turnTo(m, tx, tz, 0.7, dt);
      if (rs.t >= HG.SLAM_WIND) {
        go('slam'); m.state = 'attack'; m.telegraph = null;
        const x = rs.sx, z = rs.sz;
        hitArea(m, x, z, HG.SLAM_R, Math.round(roll(m) * 1.4), 'phys', 1.9);
        _v.set(x, m.world.heightAt?.(x, z) ?? m.pos.y, z);
        G.vfx.ring(_v, { color: '#fff0d0', r0: 0.3, r1: HG.SLAM_R * 1.2, life: 0.35 });
        G.vfx.dustRing(_v, 1.6, 16);
        for (let i = 0; i < 14; i++) { const a = rand(0, TAU), s = rand(1.5, 3.8); puff(G.vfx.dot, x, _v.y + 0.15, z, { vx: Math.cos(a) * s, vy: rand(2.5, 5.5), vz: Math.sin(a) * s, life: rand(0.5, 0.8), size: rand(0.08, 0.14), size1: 0.05, color: i % 3 ? '#e8d4a8' : '#c8b088', alpha: 1, alpha1: 0.8, grav: 14, drag: 0.8 }); }
        if ((m.world.waterAt?.(x, z) || 0) > 0.04) droplets(G, x, _v.y + 0.1, z, 0, 1, 18, Math.PI, 3);
        if (playerIn(G, x, z, 5)) G.engine.rig.shake(0.35);
        sfx('heikegani_slam', m.pos);
      }
      return false;
    case 'slam': if (rs.t >= 0.12) { go('stuck'); m.emote('sweat', HG.STUCK); } return false;
    case 'stuck': // claws in the sand: guard down
      if (Math.random() < dt * 6) puff(G.vfx.smoke, rs.sx + rand(-0.4, 0.4), m.pos.y + 0.1, rs.sz + rand(-0.4, 0.4), { vy: rand(0.2, 0.6), life: 0.6, size: 0.3, size1: 0.6, color: '#efe2c4', alpha: 0.5, drag: 2 });
      if (rs.t >= HG.STUCK) { go('move'); m.state = 'chase'; m.cd = rand(1.6, 2.4); sfx('heikegani_unstick', m.pos); }
      return false;
    case 'dashWind': // (swings side-on first when it charges from in front: its flank is open for a moment)
      m.facing += clamp(angleDiff(m.facing, rs.face), -9 * dt, 9 * dt);
      if (rs.t >= HG.DASH_WIND) { go('dash'); m.state = 'attack'; m.telegraph = null; rs.trav = 0; rs.hit = false; sfx('heikegani_dash', m.pos); }
      return false;
    case 'dash': {
      const step = push(m, rs.dx, rs.dz, HG.DASH_SPD, dt); rs.trav += step;
      if (!rs.hit && dist(tx, tz, m.pos.x, m.pos.z) < HG.DASH_W + tr + 0.15) {
        rs.hit = true; m.dealTo(target, Math.round(roll(m) * 1.15), 'phys', 1.6);
        _v.set(tx, target.pos.y, tz); G.vfx.slash(_v, Math.atan2(rs.dx, rs.dz), { color: '#fff0e0', arc: 1.5, r: 0.9, life: 0.2, y: 0.5 });
      }
      if (Math.random() < 0.8) puff(G.vfx.smoke, m.pos.x - rs.dx * 0.4, m.pos.y + 0.12, m.pos.z - rs.dz * 0.4, { vx: -rs.dx * 1.5, vy: 0.4, vz: -rs.dz * 1.5, life: 0.4, size: 0.3, size1: 0.7, color: '#f2e6cc', alpha: 0.55, drag: 3 });
      if (rs.trav >= rs.len || step < HG.DASH_SPD * dt * 0.3 || rs.t > 0.8) { go('recover'); m.state = 'chase'; m.cd = Math.max(m.cd, rand(0.8, 1.3)); rs.dashCd = rand(3, 4.5); }
      return true;
    }
    case 'recover': turnTo(m, tx, tz, HG.TURN * 0.5, dt); if (rs.t >= 0.45) go('move'); return false;
    default: {
      if (rs.st !== 'move') go('move');
      const rem = turnTo(m, tx, tz, HG.TURN * slow, dt), rel = angleDiff(m.facing, Math.atan2(tx - m.pos.x, tz - m.pos.z)), ar = Math.abs(rel);
      const los = m.mode.los(m.pos, target.pos);
      // a crab charges sideways: flanked (you at its side), it dashes straight across at you; from mid range in front
      // it swings side-on during the wind-up and charges down the lane at you
      const flank = ar > 0.95 && ar < 2.25 && d < 5.2 && d > 1.0, mid = ar < 0.95 && d > 2.6 && d < 5.6 && m.cd <= 0 && Math.random() < dt * 1.6;
      if (rs.dashCd <= 0 && los && (flank || mid)) {
        const side = flank ? (rel > 0 ? 1 : -1) : (Math.random() < 0.5 ? 1 : -1);
        if (flank) { const f = m.facing; rs.dx = Math.cos(f) * side; rs.dz = -Math.sin(f) * side; rs.len = clamp(d * Math.abs(Math.sin(rel)) + 1.6, 2.6, 5.2); rs.face = f; }
        else { rs.dx = (tx - m.pos.x) / d; rs.dz = (tz - m.pos.z) / d; rs.len = Math.min(d + 1.4, 6); rs.face = Math.atan2(-rs.dz * side, rs.dx * side); m.cd = Math.max(m.cd, 0.6); }
        M.side = side;
        go('dashWind'); m.state = 'windup';
        m.telegraph = tele(G, { shape: 'lane', x: m.pos.x, z: m.pos.z, r: HG.DASH_W, dir: Math.atan2(rs.dx, rs.dz), len: rs.len + 0.5, time: HG.DASH_WIND, color: TELE_C.dash });
        sfx('heikegani_dash_wind', m.pos);
        return false;
      }
      // in front and close: both claws up, slam
      if (m.cd <= 0 && los && d < HG.SLAM_AT + HG.SLAM_R * 0.75 + tr && ar < 0.6) {
        rs.sx = m.pos.x + Math.sin(m.facing) * HG.SLAM_AT * m.scale; rs.sz = m.pos.z + Math.cos(m.facing) * HG.SLAM_AT * m.scale;
        go('slamWind'); m.state = 'windup';
        m.telegraph = tele(G, { x: rs.sx, z: rs.sz, r: HG.SLAM_R, time: HG.SLAM_WIND, color: TELE_C.slam });
        sfx('heikegani_slam_wind', m.pos);
        return false;
      }
      // approach in sideways zig-zags, guard toward the target
      if (d > 1.5 + tr || !los) {
        rs.zigT = (rs.zigT ?? rand(0.8, 1.4)) - dt; if (rs.zigT <= 0) { rs.zigT = rand(0.9, 1.5); rs.zig = -(rs.zig || 1); }
        const f = m.facing;
        if (!los) m.chase(target, dt, slow * 0.9);
        else { const a = Math.atan2(tx - m.pos.x, tz - m.pos.z) + (rs.zig || 1) * 0.95; _dir.set(Math.sin(a), 0, Math.cos(a)); m.move(_dir, dt, slow); }
        m.facing = f; turnTo(m, tx, tz, HG.TURN * slow, 0);
        M.gait = 1;
        return true;
      }
      M.gait = rem !== 0 ? 0.6 : 1;
      return rem !== 0; // shuffling round to face you
    }
  }
}
/**
 * The claw shield: a frontal hit clanks off. It returns 0 (so none of the flesh-hit flash / sparks / sound / knockback /
 * stun play) and applies its own ~12% chip with metal sparks and a steel-grey number instead. Back hits bite harder.
 */
function heikeganiDamage(m, dmg, { from } = {}) {
  const G = m.G, rs = m.rs;
  if (!from || !rs) { hurtSfx(m, 'heikegani_hurt'); return dmg; } // (burn / poison ticks, thorns)
  const dx = from.x - m.pos.x, dz = from.z - m.pos.z;
  if (dx * dx + dz * dz < 0.06) { hurtSfx(m, 'heikegani_hurt'); return dmg; } // blasts right on top of it
  const rel = Math.abs(angleDiff(m.facing, Math.atan2(dx, dz)));
  const open = rs.st === 'slamWind' || rs.st === 'slam' || rs.st === 'stuck' || m.status.stun > 0 || m.status.freeze > 0;
  if (!open && rel < HG.GUARD) {
    const t = G.engine?.time || 0, fx = Math.sin(m.facing), fz = Math.cos(m.facing), s = m.scale;
    m.model.clank = 1;
    if (t - (m._clankT || -9) > 0.1) {
      m._clankT = t;
      _v.set(m.pos.x + fx * 0.62 * s, m.pos.y + 0.6 * s, m.pos.z + fz * 0.62 * s);
      G.vfx.sparks(_v, { n: 9, color: '#fff2b0', speed: 5.5, size: 0.3, up: 2 });
      G.vfx.flash(_v, '#fff4d0', 0.7, 0.1);
      sfx('heikegani_clank', m.pos);
    }
    if (t - (m._clankF || -9) > 0.5) { m._clankF = t; G.ui?.float?.(V(m.pos.x, m.pos.y + 1.45 * s, m.pos.z), 'Clank!', { kind: 'block', color: '#cfe4ff' }); }
    if (!HINT.crab && G.ui?.toast) { HINT.crab = true; G.ui.toast('Its claws guard the front: hit a Heike-gani from the side or behind!', { color: '#ffb08a', icon: 'oni' }); }
    const chip = Math.max(1, Math.round(dmg * 0.12));
    m.life -= chip;
    G.ui?.float?.(V(m.pos.x, m.pos.y + (m.height || 1) + 0.2, m.pos.z), `${chip}`, { kind: 'dmg', color: '#b4c4dc', ref: m.lifeMax * 0.05 });
    if (!m.aggro) m.alert();
    if (m.life <= 0) m.die();
    return 0;
  }
  hurtSfx(m, 'heikegani_hurt');
  if (rel > 2.3) { // a strike on the unguarded back
    const t = G.engine?.time || 0;
    if (t - (m._backT || -9) > 1.2) { m._backT = t; G.ui?.float?.(V(m.pos.x, m.pos.y + 1.3, m.pos.z), 'Weak spot!', { kind: 'status', color: '#ffe07a' }); }
    return dmg * 1.25;
  }
  return dmg;
}

// ================================================================================================= KURAGE
// A lantern jellyfish: a translucent, softly glowing bell ribbed like a paper chōchin (lacquer cap with a little loop,
// lacquer rim band, a frill of pastel lobes), a glowing lantern-flame core inside, a sleepy cute face, four frilly oral
// arms and trailing tentacles with glowing tips (GPU sway, drag and pulse). It floats and bobs, drifts in close, and
// charges up (core flares, sparks crackle, circle telegraph) to send out expanding zap rings (1, 2 or a big one).
const KU = { WIND: 0.9, EXP: 0.42, HOVER: 2.1, FLOAT: 0.95 };
const JELLY_HOOK = {
  pars: 'uniform float uSw; uniform float uDrag; uniform float uPulse;',
  // uv.y: sway weight (0 … 1), + 2 on parts drawn without an ink hull (core, tentacles)
  body: `{ float noOl = step(1.5, uv.y), w = uv.y - 2.0 * noOl;
      if (w > 0.001) {
        float dy = max(0.0, -transformed.y), ph = uSw * 2.1 - dy * 3.6 + atan(transformed.x, transformed.z) * 2.0;
        transformed.xz *= 1.0 + uPulse * 0.22 * w;
        transformed.x += (sin(ph) * 0.07 + sin(ph * 0.53 + 1.7) * 0.03) * w;
        transformed.z += cos(ph * 0.87) * 0.06 * w - uDrag * w * w * 0.32;
        transformed.y += uPulse * w * 0.1 + uDrag * w * w * 0.12;
      } }`,
  ol: 'if (uv.y > 1.5) transformed = position;',
};
function kurageSpec(v) {
  const B = [], noOl = 2;
  // lantern-flame core (inside the bell, seen through it): glows, no hull
  B.push(uvs(lathe([[0.001, 0.04], [0.07, 0.06], [0.115, 0.13], [0.118, 0.2], [0.085, 0.27], [0.04, 0.32], [0.001, 0.345]], 14, (p, n, o) => o.set(v.core).lerp(col('#ffffff'), clamp((p.y - 0.12) * 3) * 0.5)), 1.35, noOl));
  // lacquer cap + loop on top, lacquer rim band
  B.push(cyl(0.07, 0.1, 0.05, v.cap, [0, 0.415, 0], [0, 0, 0], 14), ell(0.07, 0.02, 0.07, v.cap, [0, 0.44, 0], [0, 0, 0], 12));
  B.push(paint(xf(new THREE.TorusGeometry(0.042, 0.012, 5, 12), { p: [0, 0.49, 0] }), (p, n, o) => o.set(v.cap)));
  B.push(paint(xf(new THREE.TorusGeometry(0.418, 0.022, 5, 30), { p: [0, 0.012, 0], r: [Math.PI / 2, 0, 0] }), (p, n, o) => o.set(v.cap)));
  // pastel frill lobes under the rim (a little sway, a little glow)
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU + 0.26;
    B.push(uvs(ell(0.075, 0.055, 0.028, i % 2 ? v.frill : col(v.frill).lerp(col('#ffffff'), 0.25).getStyle(), [Math.sin(a) * 0.4, -0.035, Math.cos(a) * 0.4], [0.35, a, 0], 8), 0.3, 0.15));
  }
  // face on the front of the bell
  B.push(...eyesCute(0.215, 0.35, 0.1, 1.15, { brow: v.brow ?? 0, seg: 10 }));
  B.push(...cheeks(0.145, 0.355, 0.2, 1.0, '#ff8ab0'));
  B.push(smile(0.15, 0.4, 0.03, 0.014, 0.008));
  // four frilly oral arms (inked, sway)
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * TAU + Math.PI / 4, ctrl = [];
    for (let j = 0; j <= 5; j++) { const t = j / 5, sw = Math.sin(t * 5 + i) * 0.06; ctrl.push([Math.sin(a) * (0.07 + t * 0.08) + Math.cos(a) * sw, 0.04 - t * 0.6, Math.cos(a) * (0.07 + t * 0.08) - Math.sin(a) * sw, 0.05 - t * 0.032]); }
    const pts = smooth(ctrl, 16).map(([x, y, z, r], j) => [x, y, z, r * (1 + 0.38 * Math.sin(j * 2.1))]);
    const g = tubeC(pts, (p, n, o) => o.set(v.arm).lerp(col('#ffffff'), 0.2 * (0.5 + 0.5 * Math.sin(p.y * 40))), 6);
    B.push(uvf(g, p => [0.25, clamp(-p.y / 0.6) * 0.85]));
  }
  // trailing tentacles from the rim: no hull (thin light strands), glowing tips
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * TAU + 0.1, r0 = 0.36, len = 0.72 + 0.14 * ((i * 3) % 4) / 3, ctrl = [];
    for (let j = 0; j <= 4; j++) { const t = j / 4; ctrl.push([Math.sin(a) * (r0 + t * 0.06) + Math.cos(a) * Math.sin(t * 4 + i) * 0.05, -0.03 - t * len, Math.cos(a) * (r0 + t * 0.06) - Math.sin(a) * Math.sin(t * 4 + i) * 0.05, 0.02 - t * 0.013]); }
    const g = tubeC(smooth(ctrl, 12), (p, n, o) => o.set(v.tent).lerp(col(v.core), clamp((-p.y - len * 0.6) / (len * 0.4))), 4);
    B.push(uvf(g, p => { const t = clamp(-p.y / (len + 0.03)); return [clamp((t - 0.6) * 2.5) * 1.2, noOl + t]; }));
  }
  return {
    mat: { vertexPars: 'varying vec2 vKu;', vertexWorld: 'vKu = uv;', fragPars: 'varying vec2 vKu; uniform float uGlowK;', fragOut: 'outgoingLight += diffuseColor.rgb * vKu.x * uGlowK;', uniforms: { uGlowK: { value: 1 } } },
    parts: [{ name: 'body', geo: stamp(B) }],
  };
}
const BELLS = new Map();
function bellGeo(v) {
  let g = BELLS.get(v.key);
  if (!g) {
    const bell = col(v.bell), rib = col(v.bell).lerp(col(v.core), 0.45), seam = col(v.bell).multiplyScalar(0.82);
    g = lathe([[0.001, 0.075], [0.14, 0.065], [0.27, 0.035], [0.36, 0.0], [0.415, 0.004], [0.435, 0.05], [0.428, 0.12], [0.398, 0.2], [0.345, 0.28], [0.265, 0.345], [0.155, 0.39], [0.001, 0.405]], 30, (p, n, o) => {
      o.copy(bell);
      if (n.y < -0.2) { o.lerp(col(v.core), 0.3); return; } // the inside of the bell (seen at the rim): warm
      const band = Math.abs(((p.y * 14) % 1 + 1) % 1 - 0.5); if (band > 0.42 && p.y > 0.06) o.copy(rib); // paper-lantern ribs
      if (Math.abs(Math.sin(Math.atan2(p.x, p.z) * 4)) < 0.08 && p.y > 0.08) o.copy(seam);
    });
    BELLS.set(v.key, shared(g));
  }
  return g; // (shared: ROADMAP Z-B1)
}
function buildKurage(v) {
  const M = assemble('kurage:' + v.key, () => kurageSpec(v));
  const I = M.inner;
  M.body.castShadow = false; // (the bell casts the jelly's shadow: one shadow draw)
  const U = { uSw: { value: rand(0, 9) }, uDrag: { value: 0 }, uPulse: { value: 0 } };
  hookModel(M, { key: 'jelly', U, ...JELLY_HOOK });
  const uGlow = ownU(M.mat, 'uGlowK', 1);
  // the translucent bell: depth-writing (one clean layer), then its ink hull, which then only shows round the rim
  const uBell = { value: 0.3 };
  const bellMat = makeToon({ vertexColors: true, transparent: true, rim: 0.9, brush: 0.04, term: [-0.35, 0.45], shadowSat: 0.15, uniforms: { uBellK: uBell },
    fragPars: 'uniform float uBellK;',
    fragOut: `{ float fr = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
      outgoingLight += diffuseColor.rgb * (uBellK + fr * fr * 0.45);
      diffuseColor.a = clamp(0.34 + fr * fr * 0.62 + uBellK * 0.12, 0.0, 0.95); }` });
  bellMat.userData.instU = ['uBellK']; // (a per-jelly uniform: instanced as an attribute, dungeon/horde.js)
  const geo = bellGeo(v);
  const bell = new THREE.Mesh(geo, bellMat); bell.renderOrder = 10; bell.castShadow = true;
  const hullMat = makeOutline(INK, 0.021); hullMat.transparent = true;
  const hull = new THREE.Mesh(geo, hullMat); hull.renderOrder = 10.5;
  I.add(bell, hull);
  M.bell = bell; M.bellHull = hull; M.bellMat = bellMat;
  M.charge = 0; M.zapK = 0;
  let ph = rand(0, 6), drag = 0;
  M.animate = (dt, t, moving) => {
    const a = M.act, k = (M.actT += dt);
    const wind = a === 'zapWind' ? clamp(k / KU.WIND) : 0;
    M.charge += ((a === 'zapWind' ? 1 : 0) - M.charge) * Math.min(1, dt * (a === 'zapWind' ? 3 : 2));
    if (a === 'zap' && k < dt * 1.5) M.zapK = 1;
    M.zapK = Math.max(0, M.zapK - dt * 2.5);
    ph += dt * (2.3 + wind * 6);
    const s = Math.pow(Math.max(0, Math.sin(ph)), 2);             // bell contraction
    drag += ((moving ? 1 : 0) - drag) * Math.min(1, dt * 3);
    U.uSw.value += dt * (1 + wind); U.uDrag.value = drag; U.uPulse.value = s * (1 - M.zapK) - M.zapK * 0.6;
    uGlow.value = 1 + M.charge * 1.6 + M.zapK * 2 + s * 0.15;
    uBell.value = 0.26 + M.charge * 0.5 + M.zapK * 0.7 + s * 0.06;
    bellMat.emissive.copy(M.mat.emissive);
    const fl = M.zapK;
    I.position.y = KU.FLOAT + Math.sin(t * 1.3) * 0.07 + s * 0.05 + wind * 0.18 + Math.sin(t * 60) * 0.01 * wind;
    I.rotation.set(0.16 * drag + Math.sin(t * 0.9) * 0.05, 0, Math.sin(t * 1.1) * 0.06 + Math.sin(t * 37) * 0.03 * wind);
    const sq = 1 - 0.09 * s + fl * 0.14 - wind * 0.05;
    I.scale.set(sq, 1 + 0.07 * s - fl * 0.08 + wind * 0.04, sq);
  };
  return M;
}
/** one expanding zap ring from (x, z): pooled spark / glow particles riding the front, hits once as it passes */
function zapRing(m, x, z, R, color) {
  const G = m.G, W = m.world, Cb = m.mode.combat, P = G.player, raw = Math.round(roll(m) * 1.0), n = Math.round(R * 11);
  const y0 = W.heightAt?.(x, z) ?? m.pos.y, hitA = [];
  let r = 0.3;
  const fn = (q) => {
    const rr = r + q.dr;
    q.x = x + Math.cos(q.ang) * rr; q.z = z + Math.sin(q.ang) * rr;
    q.y = (W.heightAt?.(q.x, q.z) ?? y0) + q.h;
  };
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU;
    // arcs: sparks stretched along the ring's tangent, flickering (a crackling line, not a ring of stars)
    const q = G.vfx.spark.spawn({ x, y: y0, z, life: KU.EXP + 0.1, size: rand(0.26, 0.36), size1: 0.14, color: i % 3 ? color : '#ffffff', alpha: 1, alpha1: 0.15, rot: screenAngle(G, -Math.sin(a), 0, Math.cos(a)) + rand(-0.35, 0.35), stretch: rand(2.2, 3.2), flicker: 40, fn });
    q.ang = a; q.dr = rand(-0.12, 0.12); q.h = rand(0.14, 0.36);
    if (i % 3 === 0) { const g = G.vfx.glow.spawn({ x, y: y0, z, life: KU.EXP + 0.06, size: 0.5, size1: 0.3, color, alpha: 0.28, alpha1: 0, fn }); g.ang = a + 0.1; g.dr = 0; g.h = 0.25; }
  }
  Cb.addZone({ life: KU.EXP + 0.05, update: (dt, zz) => {
    r = 0.3 + (R - 0.3) * ease.outCubic(clamp(zz.t / KU.EXP));
    if (Math.random() < 0.6) { const a = rand(0, TAU); puff(G.vfx.spark, x + Math.cos(a) * r, y0 + 0.3, z + Math.sin(a) * r, { vx: Math.cos(a) * 3, vz: Math.sin(a) * 3, life: 0.16, size: 0.32, size1: 0.08, color: '#ffffff', alpha: 1, alpha1: 0, rot: screenAngle(G, Math.cos(a), 0, Math.sin(a)), stretch: 3 }); }
    if (P && !G.playerDead && !hitA.includes(P)) {
      const dp = dist(P.pos.x, P.pos.z, x, z);
      if (dp < r + (P.radius || 0.3) && dp < R + 0.3) {
        hitA.push(P);
        if (!P.invuln && Cb.hitPlayer(raw, { element: 'zap', level: m.level, from: m.pos, knock: 0.5, src: m })) {
          status(G, 'Zapped!', '#fff27a', '_zapT', 0.6);
          P.slowT = Math.max(P.slowT || 0, 0.55); P.slowAmt = Math.max(P.slowT > 0.55 ? (P.slowAmt || 0) : 0, 0.4);
          G.vfx.sparks(V(P.pos.x, P.pos.y + 0.7, P.pos.z), { n: 10, color: '#fff27a', speed: 6, size: 0.3 });
          if (!m.rs._arcT || (G.engine?.time || 0) - m.rs._arcT > 0.3) { m.rs._arcT = G.engine?.time || 0; G.vfx.lightning(V(m.pos.x, m.pos.y + KU.FLOAT + 0.2, m.pos.z), V(P.pos.x, P.pos.y + 0.8, P.pos.z), { color: '#fff4a0', width: 0.05, life: 0.18, jag: 0.35 }); }
        }
      }
    }
    for (const e of Cb.allies || Cb.entities) { // (the allies set: same entities, same order, without walking the crowd)
      if (!e.alive || e.team !== 'ally' || e === P || e.untargetable || !e.pos || hitA.includes(e)) continue;
      if (dist(e.pos.x, e.pos.z, x, z) < r + (e.radius || 0.3)) { hitA.push(e); Cb.hitAlly(e, raw, { element: 'zap', from: m.pos }); }
    }
  } });
  _v.set(x, y0, z);
  G.vfx.ring(_v, { color, r0: 0.3, r1: R, life: KU.EXP + 0.08, opacity: 0.32 });
  G.vfx.flash(V(m.pos.x, m.pos.y + KU.FLOAT + 0.25, m.pos.z), color, 1.0, 0.16);
}
function kurageAI(m, dt, target, d, slow) {
  const rs = m.rs, G = m.G, tr = target.radius || 0.3, M = m.model, v = M.variant || {};
  rs.t += dt;
  const go = (st, pose = st) => { rs.st = st; rs.t = 0; act(m, pose === 'move' ? 'idle' : pose); };
  if (rs.st === 'zapWind' && m.state !== 'windup') { for (const t of rs.teles || []) t.t = 999; if (rs.teles) rs.teles.length = 0; go('move'); } // staggered
  const rings = v.rings || [3.0];
  switch (rs.st) {
    case 'zapWind': {
      m.faceTo(target.pos.x, target.pos.z, dt * 0.5);
      if (Math.random() < dt * (10 + rs.t * 30)) { // crackle round the bell
        const a = rand(0, TAU), r = rand(0.35, 0.6), y = m.pos.y + KU.FLOAT + rand(-0.2, 0.45);
        puff(G.vfx.spark, m.pos.x + Math.cos(a) * r, y, m.pos.z + Math.sin(a) * r, { vx: -Math.cos(a) * 1.5, vy: rand(-0.5, 0.5), vz: -Math.sin(a) * 1.5, life: 0.22, size: rand(0.25, 0.4), size1: 0.05, color: Math.random() < 0.5 ? '#ffffff' : v.pulse, alpha: 1, alpha1: 0, rot: rand(0, TAU), stretch: 2.4 });
      }
      if (rs.t >= KU.WIND) {
        go('zap'); m.state = 'attack'; m.telegraph = null; rs.ringI = 1; rs.ringT = 0; if (rs.teles) rs.teles.length = 0; // (the outer warnings run out on their own)
        zapRing(m, rs.cx, rs.cz, rings[0], v.pulse); sfx('kurage_zap', m.pos);
      }
      return false;
    }
    case 'zap':
      rs.ringT += dt;
      if (rs.ringI < rings.length && rs.ringT >= 0.45) { rs.ringT = 0; zapRing(m, rs.cx, rs.cz, rings[rs.ringI++], v.pulse); act(m, 'idle'); act(m, 'zap'); sfx('kurage_zap', m.pos); }
      if (rs.ringI >= rings.length && rs.ringT >= 0.55) { go('move'); m.state = 'chase'; m.cd = rand(2.6, 3.4); }
      return false;
    default: {
      if (rs.st !== 'move') go('move');
      const los = m.mode.los(m.pos, target.pos);
      if (m.cd <= 0 && los && d < rings[rings.length - 1] * 0.8 + tr) { // (the outermost ring reaches you)
        rs.cx = m.pos.x; rs.cz = m.pos.z;
        go('zapWind'); m.state = 'windup';
        const gap = 0.45;
        rings.forEach((rr, i) => { const tt = tele(G, { x: rs.cx, z: rs.cz, r: rr, time: KU.WIND + i * gap, color: TELE_C.zap }); if (i === 0) m.telegraph = tt; else (rs.teles ||= []).push(tt); });
        sfx('kurage_charge', m.pos);
        return false;
      }
      if (d > KU.HOVER + 0.4 || !los) { m.chase(target, dt, slow); return true; }
      // hover close, drifting round the target (and backing off if crowded)
      rs.orbT = (rs.orbT ?? rand(1.5, 3)) - dt; if (rs.orbT <= 0) { rs.orbT = rand(1.8, 3.2); rs.orb = -(rs.orb || 1); }
      const dx = (target.pos.x - m.pos.x) / (d || 1), dz = (target.pos.z - m.pos.z) / (d || 1), o = rs.orb || 1, rad = d < KU.HOVER - 0.7 ? -0.8 : 0;
      _dir.set(-dz * o + dx * rad, 0, dx * o + dz * rad).normalize();
      const f = m.facing; m.move(_dir, dt, 0.35 * slow); m.facing = f; m.faceTo(target.pos.x, target.pos.z, dt);
      return true;
    }
  }
}
function kurageUpdate(m, dt) {
  const G = m.G, M = m.model;
  if (!m.aggro) act(m, 'idle');
  // drifting glow motes (only near the hero)
  const P = G.player;
  if (P && (m.pos.x - P.pos.x) ** 2 + (m.pos.z - P.pos.z) ** 2 < 600 && Math.random() < dt * 2.2) {
    const a = rand(0, TAU), r = rand(0.1, 0.4);
    puff(G.vfx.glow, m.pos.x + Math.cos(a) * r, m.pos.y + M.inner.position.y * m.scale + rand(-0.1, 0.3), m.pos.z + Math.sin(a) * r, { vx: rand(-0.1, 0.1), vy: rand(0.2, 0.5), vz: rand(-0.1, 0.1), life: rand(1, 1.6), size: rand(0.14, 0.24), size1: 0.04, color: M.variant?.pulse || '#ffd870', alpha: 0.7, alpha1: 0, fadeIn: 0.2 });
  }
}

// ================================================================================================= defs
const elite = m => m.rank === 'champion' || m.rank === 'unique';
export const MONSTERS = {
  kappa: mdef({
    name: 'Kappa', build: 'kappa', scale: 1.12, radius: 0.36, vr: 0.46, speed: 2.6, pack: 1.0, material: 'stone',
    attack: { type: 'melee', range: 1.4, cd: 2.2, windup: KP.GRAB_WIND },
    stats: { name: 'Kappa', life: 0.95, dmg: 1.1, def: 0.95, speed: 1.05, xp: 1.2, element: 'phys', res: { frost: 30, fire: 15, zap: -25 } },
    variants: [
      { key: 0, skin: '#6ec452', belly: '#f6e6a0', shell: '#4e7a3c', scute: '#94b858', rim: '#e6d69c', beak: '#ffc53a', web: '#a8d86a', hair: '#2e5a3a', dish: '#f6f1e2', water: '#5fe0ee' },
      { key: 1, name: 'Umi Kappa', skin: '#5ab8c4', belly: '#f0f4e0', shell: '#35598a', scute: '#6c9cc8', rim: '#ece2c8', beak: '#ffb14a', web: '#8ad8e0', hair: '#1f3f66', dish: '#fff8ee', water: '#a8f4ff', star: true },
      { key: 2, name: 'Kyuri Kappa', skin: '#a2cc48', belly: '#fff0b8', shell: '#7a6434', scute: '#bca060', rim: '#f2e2aa', beak: '#ffd24a', web: '#c8e070', hair: '#5a4428', dish: '#f6f1e2', water: '#62e6d8', cucumber: true },
    ],
    ai: kappaAI,
    update: m => { if (!m.aggro) act(m, 'idle'); },
    onSpawn: m => { m.height = 1.0 * m.scale; if (elite(m)) rehook(m); },
    onDeath: m => { sfx('kappa_die', m.pos); droplets(m.G, m.pos.x, m.pos.y + 0.9, m.pos.z, 0, 1, 18, Math.PI, 3); },
    damageTaken: kappaDamage,
  }),
  heikegani: mdef({
    name: 'Heike-gani', build: 'heikegani', radius: 0.52, vr: 0.62, speed: 2.1, pack: 0.7, material: 'bone',
    attack: { type: 'slam', range: 2, radius: HG.SLAM_R, cd: 2.6, windup: HG.SLAM_WIND },
    stats: { name: 'Heike-gani', life: 1.35, dmg: 1.25, def: 1.5, speed: 0.95, xp: 1.4, element: 'phys', res: { frost: 25, stink: 20, zap: -20 } },
    variants: [
      { key: 0, shell: '#c4473a', belly: '#f2d6b0', leg: '#b2402f', claw: '#d44a3a', tip: '#3a1c1c', trim: '#ffd257', face: '#2a1418', eyeW: '#fff6e6', crest: '#ffc83a', mon: '#e8403a' },
      { key: 1, name: 'Genji-gani', shell: '#aebfd6', belly: '#f4f0e8', leg: '#8c9cb8', claw: '#c4d2e6', tip: '#232a4a', trim: '#e8f0ff', face: '#232a5a', eyeW: '#ffffff', crest: '#e2e8f2', mon: '#3a5ab8' },
      { key: 2, name: 'Shogun-gani', shell: '#3e3548', belly: '#8a7a8a', leg: '#4a3c54', claw: '#352c40', tip: '#ff5a3a', trim: '#ffcf4a', face: '#ffcf4a', eyeW: '#fff0c0', crest: '#ff5a3a', mon: '#ffcf4a' },
    ],
    ai: heikeganiAI,
    update: m => { if (!m.aggro) act(m, 'idle'); },
    onSpawn: m => { m.height = 0.85 * m.scale; if (elite(m)) rehook(m); },
    onDeath: m => { sfx('heikegani_die', m.pos); m.G.vfx.sparks(m.lift(0.5), { n: 12, color: '#fff0c0', speed: 4, size: 0.3 }); m.G.vfx.dustRing(m.pos, 1.2, 12); },
    damageTaken: heikeganiDamage,
  }),
  kurage: mdef({
    name: 'Kurage', build: 'kurage', radius: 0.36, vr: 0.46, speed: 1.9, pack: 0.9, material: 'lantern',
    attack: { type: 'aoe', range: 2.6, radius: 3, cd: 3, windup: KU.WIND },
    stats: { name: 'Kurage', life: 0.75, dmg: 1.15, def: 0.65, speed: 1.0, xp: 1.2, element: 'zap', res: { zap: 60, frost: 20, fire: -15 } },
    variants: [
      { key: 0, name: 'Chōchin Kurage', bell: '#ffbf78', core: '#fff0a0', frill: '#ff9a68', arm: '#ffd4b4', tent: '#ffe6cc', cap: '#4a2630', pulse: '#ffd84a', rings: [3.0] },
      { key: 1, name: 'Ao Kurage', bell: '#86d0ff', core: '#e6fcff', frill: '#6aaeff', arm: '#cdeeff', tent: '#e8f8ff', cap: '#233a5e', pulse: '#8ae8ff', rings: [2.5, 3.5] },
      { key: 2, name: 'Sakura Kurage', bell: '#ffa6d2', core: '#fff2fa', frill: '#ff78b6', arm: '#ffd2ea', tent: '#ffe8f6', cap: '#5a2448', pulse: '#ffa0e0', rings: [3.9] },
    ],
    ai: kurageAI, update: kurageUpdate,
    onSpawn: m => { m.height = 1.55 * m.scale; if (elite(m)) { rehook(m); m.model.bellHull.material.color.set(m.eliteColor); } },
    onDeath: m => { sfx('kurage_die', m.pos); const p = m.lift(KU.FLOAT + 0.2); m.G.vfx.sparkle(p, { n: 16, color: m.model.variant?.pulse || '#ffe070', r: 0.5, rise: 1.4, size: 0.32 }); m.G.vfx.ring(m.pos, { color: m.model.variant?.pulse || '#ffe070', r0: 0.3, r1: 1.6, life: 0.4 }); },
    damageTaken: (m, dmg) => { hurtSfx(m, 'kurage_hurt'); return dmg; },
  }),
};
export const BUILD = { kappa: buildKappa, heikegani: buildHeikegani, kurage: buildKurage };
