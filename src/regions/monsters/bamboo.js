// Whispering Bamboo Grove monsters (takenoko, kodama, kamaitachi) — docs/REGIONS.md §2 / §3.4. Owned by the monsters agent.
// Exports MONSTERS (defs in the monsters.js format + stats / material / ai / update / onSpawn / onDeath / damageTaken)
// and BUILD (model builders -> { root, pivot, body, mat, outline }). Sounds live in ./bamboo.sfx.js (pure data).
//
// This file also carries the REGION MONSTER KIT shared by maple.js / tidepool.js / onsen.js (exported below):
//   assemble(key, spec)   model from named parts; each part's merged geometry is built once per key and shared by every
//                         instance (userData.shared: never disposed per monster; dungeon/horde.js draws the parts
//                         instanced, ROADMAP Z-B2). Model = { root, pivot, inner, mat,
//                         body, outline, subs, g: {part groups}, act, actT } — `inner` (and the parts) are ours to animate,
//                         MonsterAnim keeps writing pivot (champion scale, hit flash, death squash).
//   mdef(def)             wraps onSpawn: m.rs (AI state), model.mon, elite outline on every part.
//   tele(G, o)            hill-draped ground telegraphs: circle / lane (capsule) / cone, a vfx record (m.telegraph-able).
//   bolt(m, o) / lob(m,o) projectiles run as combat zones (no Projectile class: our own looks), pooled visuals.
//   patch / hitArea / chill / kite / roll / sfx / act / take / give
// Nothing here allocates per frame in steady state beyond particle spawn records.
import * as THREE from 'three';
import { ell, cone, shell, EDGE_OUT, INK } from '../../dungeon/monsters.js';
import { paint, merge, tube, xf, mergeVertices } from '../../gfx/geom.js';
import { makeToon, makeOutline } from '../../gfx/materials.js';
import { Events } from '../../core/events.js';
import { rand, randInt, clamp, TAU, dist, angleDiff, ease } from '../../core/util.js';

// ================================================================================================= KIT: geometry
export const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const col = h => new THREE.Color(h);
export { ell, cone, shell, paint, merge, tube, xf, INK };
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _dir = new THREE.Vector3();
const _cr = new THREE.Vector3(), _cu = new THREE.Vector3(), _cf = new THREE.Vector3();
const fill = c => (typeof c === 'function' ? c : ((p, n, o) => o.set(c)));

export function lathe(pts, seg, color, { phi0 = 0, phiL = TAU, p = null } = {}) {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg, phi0, phiL);
  if (p) g.translate(...p);
  return paint(g, fill(color));
}
export function cyl(rt, rb, h, color, p = [0, 0, 0], r = [0, 0, 0], seg = 10, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  xf(g, { p, r }); return paint(g, fill(color));
}
/** tube through [[x, y, z, r], …] */
export function tubeC(pts, color, radial = 6, cap = true) {
  return paint(tube(pts.map(([x, y, z, r]) => ({ p: V(x, y, z), r })), radial, cap), fill(color));
}
/** big round cartoon eyes (dark ball + two highlights); brow: 1 = cross, -1 = worried, 0 = none */
export function eyesCute(y, z, sep, s = 1, { color = '#2a1418', brow = 0, seg = 12, yaw = 0.35, hi = '#ffffff' } = {}) {
  const out = [];
  for (const k of [-1, 1]) {
    out.push(ell(0.055 * s, 0.066 * s, 0.03 * s, color, [k * sep, y, z], [0, k * yaw, 0], seg));
    out.push(ell(0.02 * s, 0.022 * s, 0.012 * s, hi, [k * sep - 0.017 * s, y + 0.024 * s, z + 0.024 * s], [0, 0, 0], 8));
    out.push(ell(0.01 * s, 0.01 * s, 0.008 * s, hi, [k * sep + 0.016 * s, y - 0.022 * s, z + 0.022 * s], [0, 0, 0], 6));
    if (brow) { const outY = y + 0.085 * s + brow * 0.012 * s, inY = y + 0.085 * s - brow * 0.02 * s; out.push(tubeC([[k * (sep + 0.055 * s), outY, z - 0.006, 0.012 * s], [k * (sep - 0.045 * s), inY, z + 0.012 * s, 0.012 * s]], INK, 4)); }
  }
  return out;
}
/** crescent-moon blade in the XY plane (tips up, belly toward -y), extruded `t` thick; edge colour on the outer rim */
export function crescent(R, w, t, color, edgeColor) {
  const sh = new THREE.Shape(), n = 14;
  for (let i = 0; i <= n; i++) { const a = Math.PI * (0.08 + 0.84 * i / n); sh.lineTo(Math.cos(a) * R, -Math.sin(a) * R * 0.8 + R * 0.5); }
  for (let i = n; i >= 0; i--) { const a = Math.PI * (0.08 + 0.84 * i / n); const ww = w * Math.sin(Math.PI * i / n); sh.lineTo(Math.cos(a) * (R - ww), -Math.sin(a) * (R * 0.8 - ww) + R * 0.5); }
  const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: true, bevelThickness: t * 0.4, bevelSize: t * 0.35, bevelSegments: 1, curveSegments: 4 });
  g.translate(0, 0, -t / 2); g.deleteAttribute('uv'); g.computeVertexNormals();
  const e = col(edgeColor), b = col(color);
  return paint(g, (p, n, o) => { const r = Math.hypot(p.x / R, (p.y - R * 0.5) / (R * 0.8)); o.copy(r > 0.93 ? e : b); if (r < 0.8) o.multiplyScalar(0.85); });
}
export function cheeks(y, z, sep, s = 1, color = '#ff8aa8') { return [-1, 1].map(k => ell(0.045 * s, 0.024 * s, 0.012 * s, color, [k * sep, y, z], [0, k * 0.5, 0], 10)); }
/** smile / grin arc on a face (w = half width, d = dip) */
export function smile(y, z, w = 0.04, d = 0.018, r = 0.009, color = INK) { return tubeC([[-w, y, z, r], [0, y - d, z + 0.004, r], [w, y, z, r]], color, 4); }
/** a sphere with seams welded, deformed by fn(v: unit dir → Vector3 position) — smooth normals, no crease */
export function blob(seg, rings, fn, color) {
  let g = new THREE.SphereGeometry(1, seg, rings);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).normalize(); const q = fn(v.clone()); p.setXYZ(i, q.x, q.y, q.z); }
  g.computeVertexNormals();
  return paint(g, fill(color));
}

// ================================================================================================= KIT: models
const MASTERS = new Map();
/** mark a cached geometry as shared (Monster.dispose leaves it; the Horde batches it) */
export const shared = g => { g.userData.shared = true; return g; };
/**
 * spec() → { mat?: makeToon opts, outline?: width, parts: [{ name: 'body' | …, geo: [geometries], at?: [x,y,z],
 *   parent?: 'inner' | 'root' | 'pivot' | <part>, outline?, shadow? }] }  (the first part must be 'body'; parents first)
 */
export function assemble(key, spec) {
  let M = MASTERS.get(key);
  if (!M) {
    const s = spec();
    M = { mat: s.mat || {}, ol: s.outline ?? 0.021, parts: s.parts.map(p => ({ name: p.name, at: p.at || null, parent: p.parent || 'inner', ol: p.outline, shadow: p.shadow !== false, geo: shared(merge(p.geo)) })) };
    MASTERS.set(key, M);
  }
  const mo = M.mat;
  const mat = makeToon({ vertexColors: true, objectBrush: true, brush: 0.1, rim: 0.7, term: [-0.02, 0.3], ...mo, fragOut: EDGE_OUT + (mo.fragOut || '') });
  const root = new THREE.Group(), pivot = new THREE.Group(), inner = new THREE.Group();
  root.add(pivot); pivot.add(inner);
  const model = { root, pivot, inner, mat, body: null, outline: null, subs: [], g: { root, pivot, inner }, act: 'idle', actT: 0, key };
  for (const p of M.parts) {
    const geo = p.geo; // (shared by every instance: ROADMAP Z-B1; the Horde draws them instanced)
    const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = p.shadow; mesh.receiveShadow = true;
    const ol = new THREE.Mesh(geo, makeOutline(INK, p.ol ?? M.ol));
    let grp;
    if (p.name === 'body') grp = inner;
    else { grp = new THREE.Group(); if (p.at) grp.position.set(...p.at); model.g[p.parent].add(grp); }
    grp.add(mesh, ol);
    model.g[p.name] = grp;
    if (p.name === 'body') { model.body = mesh; model.outline = ol; } else model.subs.push(ol);
  }
  return model;
}
/** switch the model's action pose (animate() reads model.act / model.actT) */
export function act(m, name) { const M = m.model || m; if (M.act !== name) { M.act = name; M.actT = 0; } }
/** common def glue: region AI state, model back-link, elite contour on every part */
export function mdef(d) {
  const own = d.onSpawn;
  d.onSpawn = m => {
    m.rs = { st: 'idle', t: 0 };
    m.model.mon = m;
    if (m.rank === 'champion' || m.rank === 'unique') for (const o of m.model.subs || []) o.material = m.model.outline.material;
    own?.(m);
  };
  d.move ||= 'custom'; // (MonsterAnim's built-in styles off: the model animates itself)
  return d;
}
/** a per-model idle timer helper: returns true once every [a, b] seconds */
export function every(M, key, dt, a, b) { M[key] = (M[key] ?? rand(a, b)) - dt; if (M[key] > 0) return false; M[key] = rand(a, b); return true; }

// ================================================================================================= KIT: combat helpers
export const roll = m => randInt(m.stats.dmg[0], m.stats.dmg[1]) + (m.stats.dmgFire ? randInt(m.stats.dmgFire[0], m.stats.dmgFire[1]) : 0);
export const sfx = (name, pos) => Events.emit('sfx', name, { pos });
/** is the player (not dead) within r of (x, z)? */
export function playerIn(G, x, z, r) { const P = G.player; return !!P && !G.playerDead && dist(P.pos.x, P.pos.z, x, z) < r + (P.radius || 0.3); }
/** AoE hit centred at (x, z): the player + allies inside r. → hitPlayer's result for the player (0 = missed / blocked) */
export function hitArea(m, x, z, r, raw, el = m.stats.element, knockMul = 1, noInvuln = false) {
  const G = m.G, P = G.player, Cb = m.mode.combat;
  let res = 0;
  const from = V(x, P?.pos.y || 0, z);
  if (playerIn(G, x, z, r) && !(noInvuln && P.invuln)) res = Cb.hitPlayer(raw, { element: el, level: m.level, from, knock: (m.stats.knockback || 0.4) * knockMul, onHit: m.stats.onHit, src: m });
  for (const e of Cb.allies || Cb.entities) if (e.alive && e.team === 'ally' && e !== P && !e.untargetable && e.pos && dist(e.pos.x, e.pos.z, x, z) < r + (e.radius || 0.3)) Cb.hitAlly(e, raw, { element: el, from }); // (allies: combat.js keeps them apart, same order)
  return res;
}
/** chill the player: slowed for `secs` (frost sparkles while it lasts) */
export function chill(m, secs = 2, amt = 0.35) {
  const G = m.G, P = G.player; if (!P || G.playerDead) return;
  if (!(P.slowT > 0.25)) G.ui?.float?.(V(P.pos.x, P.pos.y + 1.7, P.pos.z), 'Chilled!', { kind: 'status', color: '#9fe0ff' });
  P.slowT = Math.max(P.slowT || 0, secs); P.slowAmt = Math.max(P.slowT > secs ? (P.slowAmt || 0) : 0, amt);
  const Z = P._chillZone;
  if (Z && Z.t < Z.life && m.mode.combat.zones.includes(Z)) { Z.life = Math.max(Z.life, Z.t + secs); return; }
  P._chillZone = m.mode.combat.addZone({ life: secs, tick: 0.12, onTick: () => {
    if (G.player !== P) return;
    G.vfx.spark.spawn({ x: P.pos.x + rand(-0.3, 0.3), y: P.pos.y + rand(0.1, 1.1), z: P.pos.z + rand(-0.3, 0.3), vy: rand(0.2, 0.6), life: 0.6, size: rand(0.16, 0.26), size1: 0.02, color: '#c8f0ff', alpha: 1, alpha1: 0, spin: 3 });
  } });
}
/** ranged kiting: hold [near, far] from the target (approach when far / no sight line, back off when crowded, drift sideways) */
export function kite(m, target, d, dt, slow, near, far, strafe = 0.5) {
  const rs = m.rs;
  if (d > far || !m.mode.los(m.pos, target.pos)) { m.chase(target, dt, slow); return true; }
  const dx = (target.pos.x - m.pos.x) / (d || 1), dz = (target.pos.z - m.pos.z) / (d || 1);
  rs.strafeT = (rs.strafeT ?? rand(1.2, 2.8)) - dt;
  if (rs.strafeT <= 0) { rs.strafeT = rand(1.4, 3.2); rs.side = -(rs.side || 1); }
  const side = rs.side || 1;
  let ax = -dz * side * strafe, az = dx * side * strafe;
  if (d < near) { ax -= dx * 1.2; az -= dz * 1.2; }
  const L = Math.hypot(ax, az);
  const f = m.facing;
  if (L > 1e-3) {
    _dir.set(ax / L, 0, az / L);
    const px = m.pos.x, pz = m.pos.z;
    m.move(_dir, dt, (d < near ? 0.9 : 0.45) * slow);
    if (Math.hypot(m.pos.x - px, m.pos.z - pz) < m.speed * dt * 0.15) rs.side = -side; // backed into a wall: other way round
  }
  m.facing = f; m.faceTo(target.pos.x, target.pos.z, dt);
  return L > 1e-3;
}
/** walk along a fixed direction (charges, dashes) → distance actually covered */
export function push(m, dx, dz, spd, dt) {
  const px = m.pos.x, pz = m.pos.z; _dir.set(dx, 0, dz);
  const f = m.facing; m.move(_dir, dt, spd / Math.max(0.1, m.speed)); m.facing = f;
  return Math.hypot(m.pos.x - px, m.pos.z - pz);
}

// ================================================================================================= KIT: telegraphs
// Hill-draped ground warnings in the house style of vfx.telegraph (dark veil + ink contour + hot rim, crawling hatch, a
// front that sweeps out over the wind-up and a rim that pulses faster near the end), as circle / capsule lane / cone.
const TELE_VS = /* glsl */`varying vec2 vM; void main() { vM = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const TELE_FS = /* glsl */`uniform float uK, uT, uShape, uR, uLen, uArc; uniform vec3 uC; varying vec2 vM;
  void main() {
    float e, fd, fm;
    if (uShape < 0.5) { float d = length(vM); e = uR - d; fd = d; fm = uR; }
    else if (uShape < 1.5) { float y = clamp(vM.y, uR, max(uR, uLen - uR)); e = uR - length(vec2(vM.x, vM.y - y)); fd = vM.y; fm = uLen; }
    else { float d = length(vM), a = abs(atan(vM.x, vM.y)); e = min(uR - d, d * sin(clamp(uArc - a, -1.5, 1.5))); fd = d; fm = uR; }
    if (e < 0.0) discard;
    float aa = max(fwidth(e) * 1.3, 0.004), inside = step(fd, uK * fm);
    float ink = 1.0 - smoothstep(0.075, 0.075 + aa, e);
    float rim = smoothstep(0.075, 0.075 + aa, e) * (1.0 - smoothstep(0.14, 0.14 + aa, e));
    float lead = smoothstep(uK * fm - 0.3, uK * fm, fd) * inside;
    float hatch = smoothstep(0.42, 0.5, abs(fract((vM.x - vM.y) * 1.6 + uT * 1.4) - 0.5) * 2.0 - 0.1);
    float urg = 0.72 + 0.28 * sin(uT * (9.0 + 22.0 * uK));
    vec3 hot = mix(uC, vec3(1.0), 0.36), ink3 = vec3(0.13, 0.05, 0.1);
    vec3 c = ink3; float al = 0.24;
    c = mix(c, uC, inside * (0.6 + 0.3 * hatch)); al = mix(al, 0.36 + 0.18 * hatch, inside);
    c = mix(c, hot, lead); al = max(al, lead * 0.82);
    c = mix(c, ink3, ink); al = max(al, ink * 0.72);
    c = mix(c, hot, rim); al = max(al, rim * (0.7 + 0.3 * urg));
    gl_FragColor = vec4(c, al * smoothstep(0.0, aa, e));
  }`;
/**
 * o: { shape: 'circle' | 'lane' | 'cone', x, z, r (radius / lane half-width / cone range), dir (facing angle, lanes & cones),
 *      len (lane length), arc (cone half-angle), time, color } → a vfx record (assign to m.telegraph so a stagger kills it)
 */
export function tele(G, { shape = 'circle', x, z, r = 1, dir = 0, len = 4, arc = 0.6, time = 0.8, color = '#ff5a5a' }) {
  const W = G.world, fx = Math.sin(dir), fz = Math.cos(dir), rx = fz, rz = -fx; // forward / right (right = forward × up)
  let x0, x1, y0, y1, nx, ny;
  if (shape === 'circle') { x0 = -r; x1 = r; y0 = -r; y1 = r; nx = ny = Math.max(4, Math.min(14, Math.ceil(r * 2.4))); }
  else if (shape === 'lane') { x0 = -r; x1 = r; y0 = 0; y1 = len; nx = 2; ny = Math.max(2, Math.ceil(len / 0.7)); }
  else { const s = arc < Math.PI / 2 ? Math.sin(arc) * r : r; x0 = -s; x1 = s; y0 = arc < Math.PI / 2 ? 0 : -r; y1 = r; nx = 8; ny = Math.max(4, Math.ceil(r * 1.6)); }
  const n = (nx + 1) * (ny + 1), pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = [];
  for (let j = 0, k = 0; j <= ny; j++) for (let i = 0; i <= nx; i++, k++) {
    const lx = x0 + (x1 - x0) * i / nx, ly = y0 + (y1 - y0) * j / ny;
    const wx = x + rx * lx + fx * ly, wz = z + rz * lx + fz * ly;
    pos[k * 3] = wx; pos[k * 3 + 1] = (W.heightAt?.(wx, wz) || 0) + 0.075; pos[k * 3 + 2] = wz;
    uv[k * 2] = lx; uv[k * 2 + 1] = ly;
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + nx + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
  const U = { uK: { value: 0 }, uT: { value: 0 }, uShape: { value: shape === 'circle' ? 0 : shape === 'lane' ? 1 : 2 }, uR: { value: r }, uLen: { value: len }, uArc: { value: arc }, uC: { value: col(color) } };
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: TELE_VS, fragmentShader: TELE_FS, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(g, mat); mesh.renderOrder = 9;
  return G.vfx.add(mesh, (dt, t) => { U.uK.value = clamp(t / time); U.uT.value = t; }, time + 0.05);
}

// ================================================================================================= KIT: pools + projectiles
// Pooled look objects live in the current world's scene (hidden when idle; geometry / materials are module-level and
// shared, so a pooled object owns no GPU resources of its own and simply goes away with its scene).
const POOLS = new WeakMap();
export function take(G, key, make) {
  const sc = G.world.scene; let P = POOLS.get(sc); if (!P) POOLS.set(sc, P = new Map());
  let arr = P.get(key); if (!arr) P.set(key, arr = []);
  let o = arr.pop();
  if (!o) { o = make(); o.userData.poolKey = key; o.traverse(c => { c.frustumCulled = false; }); sc.add(o); }
  o.visible = true; return o;
}
export function give(o) { if (!o) return; o.visible = false; const P = o.parent && POOLS.get(o.parent); P?.get(o.userData.poolKey)?.push(o); }
const ENTS = [];
function targetsNear(G, Cb, x, z, r) { // player first, then allies; into a reused array
  ENTS.length = 0; const P = G.player;
  if (P && !G.playerDead && !P.invuln && (P.pos.x - x) ** 2 + (P.pos.z - z) ** 2 < (r + (P.radius || 0.3)) ** 2) ENTS.push(P);
  for (const e of Cb.allies || Cb.entities) if (e.alive && e.team === 'ally' && e !== P && !e.untargetable && e.pos && (e.pos.x - x) ** 2 + (e.pos.z - z) ** 2 < (r + (e.radius || 0.3)) ** 2) ENTS.push(e);
  return ENTS;
}
/** camera right / up for screen-aligned particles (refreshed at most once per frame) */
let _camStamp = -1;
export function camBasis(G) { const t = G.engine.time; if (t !== _camStamp) { _camStamp = t; G.engine.camera.matrixWorld.extractBasis(_cr, _cu, _cf); } return [_cr, _cu]; }
/** screen-space angle of a world direction (for streak / leaf sprites) */
export function screenAngle(G, dx, dy, dz) { const [R, Up] = camBasis(G); return Math.atan2(dx * Up.x + dy * Up.y + dz * Up.z, dx * R.x + dy * R.y + dz * R.z); }

/**
 * Straight shot that follows the ground at height h. o: { look: { start(G, s, o) → { update(dt, s), end(s, hit) } },
 *   from: {x, z}, dir: {x, z} (unit), speed, range, radius, h, homing, target, onHit(entity, s), onEnd(s, hit), color, size }
 * Rolling through it (player invulnerable) lets it pass.
 */
export function bolt(m, o) {
  const G = m.G, W = m.world, Cb = m.mode.combat;
  const s = { x: o.from.x, z: o.from.z, y: 0, h: o.h ?? 0.7, dx: o.dir.x, dz: o.dir.z, vy: 0, speed: o.speed ?? 9, trav: 0, range: o.range ?? 10, r: o.radius ?? 0.3, t: 0, done: false, ended: false, target: o.target || null, homing: o.homing || 0 };
  s.y = (W.heightAt?.(s.x, s.z) || 0) + s.h;
  const vis = o.look.start(G, s, o);
  const end = hit => { if (s.ended) return; s.ended = true; s.done = true; vis.end(s, hit); o.onEnd?.(s, hit); };
  const z = Cb.addZone({ life: s.range / s.speed + 2, update: (dt) => {
    if (s.done) return;
    s.t += dt;
    if (s.homing && s.target && s.target.alive !== false && !G.playerDead) {
      const tx = s.target.pos.x - s.x, tz = s.target.pos.z - s.z, L = Math.hypot(tx, tz) || 1, k = Math.min(1, dt * s.homing);
      s.dx += (tx / L - s.dx) * k; s.dz += (tz / L - s.dz) * k; const n = Math.hypot(s.dx, s.dz) || 1; s.dx /= n; s.dz /= n;
    }
    const step = s.speed * dt, nx = s.x + s.dx * step, nz = s.z + s.dz * step;
    if (W.collision?.solidAt?.(nx, nz, 0.05)) { end(false); z.life = 0; return; }
    s.x = nx; s.z = nz; s.trav += step;
    const ny = (W.heightAt?.(nx, nz) || 0) + s.h; s.vy = (ny - s.y) / Math.max(dt, 1e-4); s.y = ny;
    const hits = targetsNear(G, Cb, s.x, s.z, s.r);
    if (hits.length) { const e = hits[0]; o.onHit?.(e, s); end(true); z.life = 0; return; }
    if (s.trav >= s.range) { end(false); z.life = 0; return; }
    vis.update(dt, s);
  }, dispose: () => end(false) });
  return s;
}
/**
 * Arcing / scripted flight from → to with an optional landing telegraph. o: { look, from: Vector3, to: {x, z}, h (arc
 * height), time, r (landing radius), tele: colour | false, path(s, k) (custom: set s.x/y/z), onLand(s), after (s) → extra
 * seconds the look keeps flying after landing (vis.update gets s.k > 1) }
 */
export function lob(m, o) {
  const G = m.G, W = m.world, Cb = m.mode.combat;
  const tx = o.to.x, tz = o.to.z, ty = W.heightAt?.(tx, tz) || 0;
  const s = { fx: o.from.x, fy: o.from.y, fz: o.from.z, tx, ty, tz, x: o.from.x, y: o.from.y, z: o.from.z, px: o.from.x, py: o.from.y, pz: o.from.z, k: 0, t: 0, time: o.time ?? 0.8, h: o.h ?? 3, r: o.r ?? 0.9, landed: false, ended: false };
  const vis = o.look.start(G, s, o);
  if (o.tele !== false) s.tele = tele(G, { shape: 'circle', x: tx, z: tz, r: s.r, time: s.time, color: o.tele || '#ff6a5a' });
  const after = o.after || 0;
  const end = () => { if (s.ended) return; s.ended = true; vis.end(s, s.landed); };
  const z = Cb.addZone({ life: s.time + after + 0.2, update: (dt) => {
    if (s.ended) return;
    s.t += dt; s.k = s.t / s.time;
    s.px = s.x; s.py = s.y; s.pz = s.z;
    if (o.path) o.path(s, Math.min(1, s.k));
    else { const k = Math.min(1, s.k); s.x = s.fx + (tx - s.fx) * k; s.z = s.fz + (tz - s.fz) * k; s.y = s.fy + (ty - s.fy) * k + Math.sin(k * Math.PI) * s.h; }
    if (!s.landed && s.k >= 1) { s.landed = true; o.onLand?.(s); if (!after) { end(); z.life = 0; return; } }
    if (s.k >= 1 + after / s.time) { end(); z.life = 0; return; }
    vis.update(dt, s);
  }, dispose: end });
  return s;
}
/** ground zone: o: { x, z, r, life, tick, onTick(z), update(dt, z), dispose } (player / ally tests via playerIn / hitArea) */
export function patch(m, o) { return m.mode.combat.addZone({ pos: V(o.x, 0, o.z), radius: o.r, life: o.life, tick: o.tick || 0.5, onTick: o.onTick, update: o.update, dispose: o.dispose }); }

// shared particle-option records (spawn() copies the fields, so one reused object per call site is safe)
export const PO = () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, size: 0.3, size1: 0.3, color: null, alpha: 1, alpha1: 0, drag: 0, grav: 0, spin: 0, rot: 0, stretch: 1, fn: null, fadeIn: 0 });
const _po = PO();
export function puff(layer, x, y, z, o) { Object.assign(_po, PO_DEF, o); _po.x = x; _po.y = y; _po.z = z; return layer.spawn(_po); }
const PO_DEF = { vx: 0, vy: 0, vz: 0, life: 1, size: 0.3, size1: undefined, color: '#ffffff', color1: undefined, alpha: 1, alpha1: 0, drag: 0, grav: 0, spin: 0, rot: undefined, stretch: 1, fn: null, fadeIn: 0, flicker: 0 };

/** leaf-dart look: a spinning leaf sprite on the VFX leaf layer + a soft glow trail */
export const LEAF_LOOK = {
  start(G, s, o) {
    const c = col(o.color || '#8ed65a'), trail = col(o.trail || '#d4ff9a'), size = o.size || 0.42;
    let q = null;
    const fn = (p) => { p.x = s.x; p.y = s.y; p.z = s.z; p.rot = s.rot; };
    s.rot = 0; s.spinPh = rand(0, TAU);
    q = G.vfx.leaf.spawn({ x: s.x, y: s.y, z: s.z, life: 60, size, size1: size, color: c, alpha: 1, alpha1: 1, fn });
    return {
      update(dt, s2) {
        s.spinPh += dt * 14;
        s.rot = screenAngle(G, s.dx, 0, s.dz) + Math.sin(s.spinPh) * 0.35;
        if (q.fn === fn) q.stretch = 0.8 + 0.2 * Math.abs(Math.cos(s.spinPh));
        puff(G.vfx.glow, s.x - s.dx * 0.15, s.y, s.z - s.dz * 0.15, { life: 0.28, size: size * 0.7, size1: 0.05, color: trail, alpha: 0.55, alpha1: 0 });
      },
      end(s2, hit) {
        if (q && q.fn === fn) q.t = q.life;
        for (let i = 0; i < (hit ? 7 : 4); i++) puff(G.vfx.leaf, s.x, s.y, s.z, { vx: rand(-2, 2), vy: rand(0.5, 2.5), vz: rand(-2, 2), life: rand(0.5, 0.9), size: size * 0.55, size1: size * 0.3, color: c, alpha: 1, alpha1: 0, drag: 2, grav: 4, spin: rand(-9, 9) });
        if (hit) G.vfx.flash(V(s.x, s.y, s.z), '#e8ffc0', 0.8, 0.14);
      },
    };
  },
};

// ================================================================================================= TAKENOKO
// Bamboo-shoot sprite: a plump shoot wrapped in pointed husk sheaths that curl out at the tips, a cream belly with the
// face, root-nub toes and a curled green tip. It burrows (a dirt mound with its tip peeking out slides along the ground,
// untargetable), pops up under you with a spin-slash, then stays up and fights until it's time to dig again.
const TK = { SPIN_R: 1.55, POP_R: 1.6, RISE: 0.8, DIG: 0.5, WIND: 0.45, SPIN: 0.4 };
function takenokoSpec(v) {
  const husk = col(v.husk), husk2 = col(v.husk2), tip = col(v.tip), cream = col(v.cream);
  const PROF = [[0.001, 0], [0.2, 0.012], [0.31, 0.07], [0.365, 0.17], [0.37, 0.28], [0.33, 0.42], [0.26, 0.56], [0.18, 0.7], [0.1, 0.83], [0.04, 0.93], [0.001, 0.99]];
  const coreR = y => { for (let i = 1; i < PROF.length; i++) if (y <= PROF[i][1]) { const [r0, y0] = PROF[i - 1], [r1, y1] = PROF[i]; return r0 + (r1 - r0) * (y - y0) / (y1 - y0); } return 0.001; };
  const parts = [];
  parts.push(lathe(PROF, 22, (p, n, o) => { o.copy(cream); if (p.y > 0.5) o.lerp(husk, clamp((p.y - 0.5) * 4)); if (p.y < 0.05) o.multiplyScalar(0.92); }));
  // husk sheaths: lathe strips around the core, pinched into points toward the top and curling outward
  const sheath = (y0, y1, phiC, w, curl, seed) => {
    const pts = []; for (let i = 0; i <= 6; i++) { const t = i / 6, y = y0 + (y1 - y0) * t; pts.push([coreR(y) + 0.018 + t * t * curl, y]); }
    const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 9, phiC - w / 2, w);
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), t = clamp((y - y0) / (y1 - y0)), r = Math.hypot(x, z);
      const a = phiC + angleDiff(phiC, Math.atan2(x, z)) * (1 - 0.94 * Math.pow(t, 1.5));
      P.setXYZ(i, Math.sin(a) * r, y + t * t * 0.03, Math.cos(a) * r);
    }
    g.computeVertexNormals();
    paint(g, (p, n, o) => {
      const t = clamp((p.y - y0) / (y1 - y0)), ang = Math.abs(angleDiff(phiC, Math.atan2(p.x, p.z))) / (w / 2);
      o.copy(husk).lerp(tip, clamp((t - 0.55) * 2.6));
      if (ang > 0.78 && t < 0.8) o.lerp(cream, 0.35); // pale sheath edges
      if (Math.sin(p.y * 90 + seed) * Math.sin(Math.atan2(p.x, p.z) * 23 + seed * 3) > 0.72 && t < 0.7) o.lerp(husk2, 0.7); // hairy speckles
    });
    return shell(g, 0.975, v.inner);
  };
  // front of the lowest row stays open: the belly + face show through
  for (const a of [1.3, 2.35, Math.PI, -2.35, -1.3]) parts.push(...sheath(0.2, 0.6, a, 1.3, 0.05, a));
  for (const a of [0.35, 0.35 + TAU / 4, 0.35 + TAU / 2, 0.35 - TAU / 4]) parts.push(...sheath(0.44, 0.78, a, 1.85, 0.06, a * 3));
  for (const a of [-0.6, -0.6 + TAU / 3, -0.6 - TAU / 3]) parts.push(...sheath(0.62, 0.95, a, 2.3, 0.05, a * 7));
  // curled tip
  parts.push(tubeC([[0, 0.9, 0, 0.05], [0.015, 1.02, -0.01, 0.042], [0.06, 1.1, -0.03, 0.03], [0.12, 1.11, -0.04, 0.02], [0.15, 1.06, -0.04, 0.012]], (p, n, o) => o.copy(tip).lerp(col('#fff6a0'), clamp((p.x - 0.06) * 6) * 0.4), 7));
  if (v.gold) for (const a of [0.9, 2.6, 4.4]) parts.push(ell(0.025, 0.025, 0.025, '#fff6c0', [Math.sin(a) * 0.3, 0.52 + a * 0.03, Math.cos(a) * 0.3], [0, 0, 0], 6));
  // face on the belly
  parts.push(...eyesCute(0.3, 0.333, 0.125, 1.3, { brow: 1 }));
  parts.push(...cheeks(0.215, 0.345, 0.2, 1.1));
  parts.push(smile(0.215, 0.365, 0.035, 0.016));
  // leaf-blade arms + root-nub toes
  for (const k of [-1, 1]) {
    parts.push(ell(0.05, 0.19, 0.025, v.arm, [k * 0.4, 0.3, 0.02], [0.2, 0, k * 1.05], 10));
    parts.push(ell(0.018, 0.12, 0.012, col(v.arm).lerp(col('#ffffff'), 0.35).getStyle(), [k * 0.43, 0.32, 0.035], [0.2, 0, k * 1.05], 6));
  }
  for (const [x, z] of [[-0.15, 0.2], [0.15, 0.2], [-0.24, -0.08], [0.24, -0.08], [0, -0.25]]) parts.push(ell(0.065, 0.04, 0.075, '#ecd6a8', [x, 0.025, z], [0, Math.atan2(x, z), 0], 8));
  // mound (shown while burrowed): lumpy dirt with the tip peeking out, plus pebbles
  const dirt = col(v.dirt || '#8a6440'), dirt2 = col('#6e4c30');
  const mound = [blob(16, 10, q => q.set(q.x * 0.5, Math.max(q.y, -0.2) * 0.2, q.z * 0.5), (p, n, o) => o.copy(dirt).lerp(dirt2, 0.5 + 0.5 * Math.sin(p.x * 23 + p.z * 17)))];
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + 0.3, r = 0.3 + (i % 3) * 0.06; mound.push(ell(0.1, 0.07, 0.09, i % 2 ? '#9a7048' : '#7a5636', [Math.sin(a) * r, 0.07, Math.cos(a) * r], [0, a, 0], 8)); }
  for (let i = 0; i < 4; i++) { const a = i * 1.7; mound.push(ell(0.045, 0.035, 0.04, '#b8b0a4', [Math.sin(a) * 0.46, 0.03, Math.cos(a) * 0.46], [0, a, 0], 6)); }
  mound.push(cone(0.09, 0.18, husk.getStyle(), [0, 0.2, 0], [0, 0, 0], 8), tubeC([[0, 0.25, 0, 0.04], [0.02, 0.33, -0.01, 0.03], [0.07, 0.37, -0.02, 0.02], [0.1, 0.34, -0.02, 0.01]], tip.getStyle(), 6));
  return { parts: [{ name: 'body', geo: parts }, { name: 'mound', geo: mound, parent: 'root' }] };
}
function buildTakenoko(v) {
  const M = assemble('takenoko:' + v.key, () => takenokoSpec(v));
  const I = M.inner, mound = M.g.mound;
  mound.visible = false;
  let spin = 0, hop = 0;
  M.animate = (dt, t, moving) => {
    const a = M.act, k = (M.actT += dt);
    let y = 0, sx = 1, sy = 1, rx = 0, rz = 0, spinV = 0;
    const under = a === 'under' || a === 'rise';
    I.visible = !under; mound.visible = under || (a === 'dig' && k > 0.2) || (a === 'pop' && k < 0.12);
    switch (a) {
      case 'dig': { const p = clamp(k / TK.DIG); y = -ease.inQuad(p) * 1.05 + Math.sin(p * Math.PI) * 0.12; spinV = 16; sy = 1 + p * 0.1; sx = 1 - p * 0.1; mound.scale.setScalar(0.4 + p * 0.6); break; }
      case 'under': mound.scale.set(1 + Math.sin(t * 17) * 0.06, 1 + Math.sin(t * 23) * 0.12, 1 + Math.cos(t * 17) * 0.06); mound.rotation.z = Math.sin(t * 11) * 0.07; mound.position.x = 0; break;
      case 'rise': { const p = clamp(k / TK.RISE); mound.scale.setScalar(1 + p * 0.3 + Math.sin(t * 40) * 0.05 * p); mound.position.x = Math.sin(t * 55) * 0.05 * p; mound.rotation.z = Math.sin(t * 31) * 0.1 * p; break; }
      case 'pop': { const p = clamp(k / 0.42); y = -0.9 * (1 - p) + Math.sin(p * Math.PI) * 0.75; spinV = 26 * (1 - p); sy = 1 + (1 - p) * 0.35 - (p > 0.85 ? (p - 0.85) * 1.6 : 0); sx = 1 / Math.sqrt(sy); break; }
      case 'wind': { const p = clamp(k / TK.WIND); sy = 1 - 0.2 * ease.outCubic(p); sx = 1 + 0.14 * ease.outCubic(p); spin += (-0.9 * p - spin) * Math.min(1, dt * 12); rz = Math.sin(t * 60) * 0.04 * p; break; }
      case 'spin': { const p = clamp(k / TK.SPIN); spinV = 30 * (1 - p * 0.6); sy = 1.08 - 0.08 * p; y = Math.sin(p * Math.PI) * 0.1; break; }
      case 'dizzy': rz = Math.sin(t * 7) * 0.18; rx = Math.cos(t * 7) * 0.1; break;
      default: {
        const mv = moving ? 1 : 0;
        hop = (hop + dt * (moving ? 3.6 : 1.1)) % 1;
        const h = Math.sin(hop * Math.PI);
        y = h * 0.14 * mv; sy = 1 + (moving ? (h - 0.45) * 0.14 : Math.sin(t * 2.4) * 0.025); sx = 1 / Math.sqrt(sy);
        rz = Math.sin(t * 1.7) * 0.05 + (moving ? Math.sin(hop * TAU) * 0.08 : 0); rx = 0.14 * mv;
      }
    }
    if (spinV) spin += dt * spinV; else { const tgt = Math.round(spin / TAU) * TAU; if (a !== 'wind') spin += (tgt - spin) * Math.min(1, dt * 10); }
    I.position.y = y; I.scale.set(sx, sy, sx); I.rotation.set(rx, spin, rz);
  };
  return M;
}
function takenokoAI(m, dt, target, d, slow) {
  const rs = m.rs, G = m.G, Cb = m.mode.combat;
  rs.t += dt; rs.bcd = (rs.bcd ?? 0.4) - dt;
  const go = st => { rs.st = st; rs.t = 0; act(m, st === 'up' ? 'idle' : st); };
  if (rs.st === 'wind' && m.state !== 'windup') go('up'); // staggered out of the wind-up
  switch (rs.st) {
    case 'dig':
      if (rs.t >= TK.DIG) { Cb.remove(m); rs.under = true; go('under'); }
      return false;
    case 'under': {
      m.chase(target, dt, 1.4 * slow);
      if (d < 1.05 + (target.radius || 0.3) || rs.t > 4.5) {
        go('rise'); m.state = 'windup';
        m.telegraph = tele(G, { x: m.pos.x, z: m.pos.z, r: TK.POP_R, time: TK.RISE, color: '#ff6a4a' });
        sfx('takenoko_rumble', m.pos);
      }
      return true;
    }
    case 'rise':
      if (rs.t >= TK.RISE) {
        m.state = 'attack'; rs.under = false;
        if (m.alive && !m.vanished && G.dungeon === m.mode) Cb.add(m);
        go('pop');
        const x = m.pos.x, z = m.pos.z, y = m.pos.y;
        hitArea(m, x, z, TK.POP_R, Math.round(roll(m) * 1.3), 'phys', 2.2);
        G.vfx.dustRing(V(x, y, z), 1.8, 14);
        G.vfx.ring(V(x, y, z), { color: '#ffe0a8', r0: 0.3, r1: TK.POP_R * 1.1, life: 0.35 });
        for (let i = 0; i < 14; i++) { const a = rand(0, TAU), s = rand(1.5, 4); puff(G.vfx.dot, x, y + 0.2, z, { vx: Math.cos(a) * s, vy: rand(3, 6), vz: Math.sin(a) * s, life: rand(0.5, 0.8), size: rand(0.09, 0.16), size1: 0.05, color: i % 3 ? '#8a6440' : '#b89060', alpha: 1, alpha1: 0.8, grav: 14, drag: 0.8 }); }
        for (let i = 0; i < 6; i++) puff(G.vfx.leaf, x, y + 0.5, z, { vx: rand(-2.5, 2.5), vy: rand(2, 4), vz: rand(-2.5, 2.5), life: rand(0.7, 1.1), size: 0.26, size1: 0.14, color: '#b8cc5a', alpha: 1, alpha1: 0, grav: 5, drag: 1.5, spin: rand(-8, 8) });
        if (playerIn(G, x, z, 4)) G.engine.rig.shake(0.3);
        sfx('takenoko_pop', m.pos);
      }
      return false;
    case 'pop':
      if (rs.t >= 0.45) { go('up'); m.state = 'chase'; m.cd = rand(0.5, 0.8); rs.spins = 0; }
      return false;
    case 'wind':
      m.faceTo(target.pos.x, target.pos.z, dt);
      if (rs.t >= TK.WIND) {
        go('spin'); m.state = 'attack'; m.telegraph = null;
        hitArea(m, m.pos.x, m.pos.z, TK.SPIN_R, roll(m), 'phys', 1.2);
        G.vfx.slash(m.pos, m.facing, { color: '#e8ffb0', arc: TAU * 0.95, r: TK.SPIN_R * m.scale * 0.85, width: 0.7, life: 0.3, y: 0.45 });
        sfx('takenoko_spin', m.pos);
      }
      return false;
    case 'spin':
      if (rs.t >= TK.SPIN) { go('up'); m.state = 'chase'; m.cd = rand(1.3, 1.8); rs.spins = (rs.spins || 0) + 1; }
      return false;
    default: { // up: chase + spin-slash; dig when the target wanders off or after a couple of spins
      if (rs.st !== 'up') go('up');
      rs.farT = d > 4.5 ? (rs.farT || 0) + dt : 0;
      if (rs.bcd <= 0 && ((!rs.opened && d > 3) || rs.farT > 1.1 || ((rs.spins || 0) >= 2 && d > 2.2))) {
        rs.opened = true; rs.bcd = rand(6, 8); rs.farT = 0;
        go('dig'); m.state = 'attack';
        G.vfx.dustRing(m.pos, 0.9, 10); sfx('takenoko_dig', m.pos);
        return false;
      }
      rs.opened = true;
      if (d < TK.SPIN_R - 0.2 + (target.radius || 0.3) && m.cd <= 0) {
        go('wind'); m.state = 'windup';
        m.telegraph = tele(G, { x: m.pos.x, z: m.pos.z, r: TK.SPIN_R, time: TK.WIND, color: '#ff5a5a' });
        sfx('takenoko_wind', m.pos);
        return false;
      }
      if (d > 1.05 + (target.radius || 0.3)) { m.chase(target, dt, slow); return true; }
      m.faceTo(target.pos.x, target.pos.z, dt);
      return false;
    }
  }
}
function takenokoUpdate(m, dt) {
  const rs = m.rs, G = m.G;
  if (rs.st === 'under' || rs.st === 'rise') {
    rs.dust = (rs.dust || 0) + dt;
    if (rs.dust > (rs.st === 'rise' ? 0.05 : 0.09)) {
      rs.dust = 0;
      const a = rand(0, TAU);
      puff(G.vfx.smoke, m.pos.x + Math.cos(a) * 0.4, m.pos.y + 0.05, m.pos.z + Math.sin(a) * 0.4, { vx: Math.cos(a) * 0.6, vy: rand(0.2, 0.6), vz: Math.sin(a) * 0.6, life: rand(0.5, 0.8), size: 0.3, size1: 0.7, color: '#c8a880', alpha: 0.5, alpha1: 0, drag: 2 });
      if (rs.st === 'rise') puff(G.vfx.dot, m.pos.x, m.pos.y + 0.1, m.pos.z, { vx: rand(-1.5, 1.5), vy: rand(2, 3.5), vz: rand(-1.5, 1.5), life: 0.5, size: 0.08, size1: 0.04, color: '#8a6440', alpha: 1, alpha1: 0.8, grav: 12 });
    }
    rs.rumble = (rs.rumble || 0) + dt;
    if (rs.st === 'under' && rs.rumble > 0.6) { rs.rumble = 0; if (playerIn(G, m.pos.x, m.pos.z, 14)) sfx('takenoko_burrow', m.pos); }
  }
  if (!m.aggro) act(m, 'idle');
}

// ================================================================================================= KODAMA
// Little white tree spirit: a big lumpy head with three hollow dots for a face, a leaf sprout, a bean body and dangling
// legs. It floats, rattles its head ("karakara"), keeps its distance and flicks volleys of leaf darts.
const KD = { WIND: 0.62 };
function kodamaSpec(v) {
  const skin = col(v.skin), shade = col(v.skin).lerp(col('#a8b8b0'), 0.35);
  const head = [], body = [];
  const bump = q => { const b = 1 + 0.05 * Math.sin(q.x * 5 + 1.1) * Math.cos(q.z * 4) + 0.04 * Math.max(0, q.y) * Math.sin(q.x * 7 + 2); return q.set(q.x * 0.34 * b, q.y * 0.275 * b + 0.025 * q.x, q.z * 0.3 * b); };
  head.push(blob(26, 18, bump, (p, n, o) => { o.copy(skin).lerp(shade, clamp(-n.y * 0.6 + 0.1)); if (v.moss && n.y > 0.45 && Math.sin(p.x * 31) * Math.sin(p.z * 27 + p.y * 9) > -0.35) o.set(v.moss); }));
  const surf = (x, y, z) => bump(V(x, y, z).normalize());
  // hollow-dot face (asymmetric, the kodama way), made cute with highlights + blush
  const eyeC = v.glow ? '#ffd84a' : '#23242c';
  for (const [x, y, s] of [[-0.27, 0.36, 1.1], [0.25, 0.39, 0.97]]) {
    const q = surf(x, y, 0.88).multiplyScalar(0.975), tilt = -Math.atan2(q.y, Math.hypot(q.x, q.z)) * 0.9;
    head.push(ell(0.074 * s, 0.086 * s, 0.035, '#23242c', [q.x, q.y, q.z], [tilt, Math.atan2(q.x, q.z), 0], 14));
    if (v.glow) { const nq = q.clone().normalize(); head.push(ell(0.034 * s, 0.04 * s, 0.02, eyeC, [q.x + nq.x * 0.018, q.y + nq.y * 0.018, q.z + nq.z * 0.018], [tilt, Math.atan2(q.x, q.z), 0], 10)); }
    else head.push(ell(0.024 * s, 0.027 * s, 0.012, '#ffffff', [q.x - 0.02, q.y + 0.03, q.z + 0.03], [0, 0, 0], 8), ell(0.011 * s, 0.011 * s, 0.008, '#ffffff', [q.x + 0.022, q.y - 0.02, q.z + 0.03], [0, 0, 0], 6));
  }
  const mq = surf(0.02, 0.1, 0.95).multiplyScalar(0.975);
  head.push(ell(0.036, 0.042, 0.022, '#23242c', [mq.x, mq.y, mq.z], [-0.2, 0, 0], 10));
  for (const k of [-1, 1]) { const q = surf(k * 0.44, 0.2, 0.85); head.push(ell(0.05, 0.026, 0.012, '#ffa8c0', [q.x, q.y, q.z], [-0.3, Math.atan2(q.x, q.z), 0], 8)); }
  // sprout / mushroom / sakura crown
  const top = surf(0.02, 1, 0.05);
  if (v.crown) {
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, q = surf(Math.sin(a) * 0.5, 0.85, Math.cos(a) * 0.5); head.push(ell(0.06, 0.02, 0.045, i % 2 ? '#ffb8d8' : '#ff9ac4', [q.x, q.y + 0.01, q.z], [0.35 * Math.cos(a), a, -0.35 * Math.sin(a)], 8), ell(0.018, 0.018, 0.018, '#fff0a0', [q.x, q.y + 0.03, q.z], [0, 0, 0], 6)); }
  }
  if (v.moss) {
    head.push(cyl(0.022, 0.028, 0.09, '#fff4e4', [top.x + 0.06, top.y + 0.02, top.z], [0, 0, -0.2], 8), ell(0.07, 0.045, 0.07, '#e8503a', [top.x + 0.07, top.y + 0.08, top.z], [0, 0, -0.2], 12));
    head.push(ell(0.014, 0.01, 0.014, '#fff6ee', [top.x + 0.05, top.y + 0.12, top.z + 0.03], [0, 0, 0], 6), ell(0.012, 0.009, 0.012, '#fff6ee', [top.x + 0.1, top.y + 0.11, top.z - 0.03], [0, 0, 0], 6));
  } else {
    head.push(tubeC([[top.x, top.y - 0.02, top.z, 0.014], [top.x + 0.01, top.y + 0.06, top.z, 0.012], [top.x + 0.02, top.y + 0.1, top.z, 0.01]], '#6a9a3a', 5));
    for (const k of [-1, 1]) head.push(ell(0.07, 0.016, 0.035, v.crown ? '#9ad06a' : '#8acb5a', [top.x + 0.02 + k * 0.06, top.y + 0.11, top.z], [0, 0, k * 0.45], 10));
  }
  // bean body, stubby arms, dangling legs
  body.push(lathe([[0.001, 0.12], [0.07, 0.13], [0.12, 0.18], [0.14, 0.27], [0.125, 0.36], [0.09, 0.43], [0.05, 0.47], [0.001, 0.48]], 14, (p, n, o) => o.copy(skin).lerp(shade, clamp(0.5 - p.y))));
  for (const k of [-1, 1]) {
    body.push(tubeC([[k * 0.1, 0.38, 0.02, 0.032], [k * 0.19, 0.3, 0.05, 0.028], [k * 0.22, 0.22, 0.07, 0.026]], skin.getStyle(), 6), ell(0.036, 0.036, 0.036, skin.getStyle(), [k * 0.225, 0.2, 0.075], [0, 0, 0], 8));
    body.push(tubeC([[k * 0.06, 0.16, 0, 0.03], [k * 0.075, 0.07, 0.02, 0.026], [k * 0.08, 0.0, 0.03, 0.024]], skin.getStyle(), 6), ell(0.034, 0.028, 0.045, skin.getStyle(), [k * 0.08, -0.01, 0.045], [0, 0, 0], 8));
  }
  const glowOut = v.glow ? 'outgoingLight += diffuseColor.rgb * 0.85 * step(0.9, diffuseColor.r) * step(0.6, diffuseColor.g) * step(diffuseColor.b, 0.45);' : '';
  return { mat: { fragOut: glowOut }, parts: [{ name: 'body', geo: body }, { name: 'head', geo: head, at: [0, 0.68, 0] }] };
}
function buildKodama(v) {
  const M = assemble('kodama:' + v.key, () => kodamaSpec(v));
  const I = M.inner, H = M.g.head;
  let rattle = 0, recoil = 0, lean = 0;
  M.animate = (dt, t, moving) => {
    const a = M.act, k = (M.actT += dt);
    if (a === 'wind') rattle = 1;
    else if (M.aggro !== false && every(M, 'rattleT', dt, 2.5, 5.5)) rattle = Math.max(rattle, 0.8);
    if (a === 'shoot' && k < dt * 1.5) recoil = 1;
    rattle = Math.max(0, rattle - dt * (a === 'wind' ? 0 : 1.6)); recoil = Math.max(0, recoil - dt * 4);
    lean += ((moving ? 0.16 : 0) - lean) * Math.min(1, dt * 5);
    I.position.y = 0.34 + Math.sin(t * 2.1) * 0.07 + (a === 'wind' ? -0.04 : 0);
    I.rotation.set(lean - recoil * 0.28, 0, Math.sin(t * 1.3) * 0.06);
    const sq = a === 'wind' ? 1 - 0.07 * clamp(k / KD.WIND) : 1 + recoil * 0.08;
    I.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    H.rotation.set(Math.sin(t * 23) * 0.08 * rattle - recoil * 0.2, Math.sin(t * 29 + 1) * 0.16 * rattle, Math.sin(t * 41) * 0.24 * rattle + Math.sin(t * 1.1) * 0.05);
    H.position.y = 0.68 + Math.abs(Math.sin(t * 41)) * 0.02 * rattle;
    M.rattleNow = rattle;
  };
  return M;
}
function kodamaAI(m, dt, target, d, slow) {
  const rs = m.rs, G = m.G;
  rs.t += dt;
  if (rs.st === 'wind') {
    if (m.state !== 'windup') { rs.st = 'move'; act(m, 'idle'); return false; }
    m.faceTo(target.pos.x, target.pos.z, dt * 1.5);
    if (rs.t >= KD.WIND) {
      rs.st = 'recover'; rs.t = 0; m.state = 'attack'; act(m, 'shoot');
      const n = m.stats.multishot ? 5 : 3, base = Math.atan2(target.pos.x - m.pos.x, target.pos.z - m.pos.z), spread = n > 3 ? 0.17 : 0.21;
      const from = { x: m.pos.x + Math.sin(base) * 0.3, z: m.pos.z + Math.cos(base) * 0.3 };
      const col0 = m.model.variant?.dart || '#8ed65a';
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * spread;
        bolt(m, { look: LEAF_LOOK, from, dir: { x: Math.sin(a), z: Math.cos(a) }, speed: 8.5, range: 11, radius: 0.3, h: 0.85, color: col0, onHit: e => m.dealTo(e, Math.max(1, Math.round(roll(m) * 0.6)), m.stats.element, 0.4) });
      }
      sfx('kodama_shoot', m.pos);
    }
    return false;
  }
  if (rs.st === 'recover') { if (rs.t > 0.4) { rs.st = 'move'; m.state = 'chase'; m.cd = rand(2.2, 3.0); act(m, 'idle'); } return false; }
  rs.st = 'move';
  if (m.cd <= 0 && d < 9.5 && m.mode.los(m.pos, target.pos)) {
    rs.st = 'wind'; rs.t = 0; m.state = 'windup'; act(m, 'wind');
    const G2 = G, h = m.lift(1.0);
    for (let i = 0; i < 10; i++) { const a = rand(0, TAU), r = rand(0.5, 0.9); puff(G2.vfx.leaf, h.x + Math.cos(a) * r, h.y + rand(-0.3, 0.3), h.z + Math.sin(a) * r, { vx: -Math.cos(a) * r * 1.4, vy: 0, vz: -Math.sin(a) * r * 1.4, life: KD.WIND * 0.9, size: 0.22, size1: 0.06, color: '#a8e070', alpha: 0.2, alpha1: 1, spin: rand(-6, 6) }); }
    sfx('kodama_rattle', m.pos);
    return false;
  }
  return kite(m, target, d, dt, slow, 4.6, 8.4, 0.55);
}

// ================================================================================================= KAMAITACHI
// Sickle weasel: a long low weasel with a big fluffy S-tail, a wind scarf and crescent sickle blades on its forepaws. It
// darts around you, rears up (sickles high, lane telegraph) and dashes clean through, leaving a short cutting wind trail.
const KM = { WIND: 0.62, DASH: 15, WIDTH: 0.62, RECOVER: 0.7 };
function kamaitachiSpec(v) {
  const fur = col(v.fur), belly = col(v.belly), tipC = col(v.tail2), dark = col(v.fur).multiplyScalar(0.72);
  const B = [];
  const furP = (p, n, o) => { o.copy(fur); if (n.y < -0.2 || (p.z > 0.2 && n.z > 0.5 && p.y < 0.46)) o.copy(belly); else if (n.y > 0.75) o.lerp(dark, 0.25); };
  B.push(paint(xf(new THREE.SphereGeometry(1, 18, 12), { p: [0, 0.3, -0.02], s: [0.19, 0.165, 0.34] }), furP));
  B.push(paint(xf(new THREE.SphereGeometry(1, 14, 10), { p: [0, 0.4, 0.24], r: [-0.5, 0, 0], s: [0.14, 0.17, 0.13] }), furP));
  // head
  B.push(paint(xf(new THREE.SphereGeometry(1, 18, 14), { p: [0, 0.54, 0.38], s: [0.175, 0.155, 0.16] }), (p, n, o) => { o.copy(fur); if (n.z > 0.55 && p.y < 0.53) o.copy(belly); }));
  B.push(ell(0.085, 0.062, 0.075, belly.getStyle(), [0, 0.5, 0.5], [0.15, 0, 0], 12), ell(0.028, 0.022, 0.02, '#2a1a20', [0, 0.52, 0.572], [0, 0, 0], 8));
  B.push(smile(0.475, 0.563, 0.026, 0.01, 0.007));
  for (const k of [-1, 1]) {
    B.push(ell(0.06, 0.065, 0.03, fur.getStyle(), [k * 0.105, 0.67, 0.35], [0, k * 0.3, k * -0.35], 10), ell(0.035, 0.04, 0.012, '#ffb0c0', [k * 0.105, 0.668, 0.372], [0, k * 0.3, k * -0.35], 8));
  }
  B.push(...eyesCute(0.565, 0.5, 0.075, 0.95, { brow: 1 }));
  B.push(...cheeks(0.51, 0.515, 0.12, 0.8));
  // legs
  for (const [x, z] of [[-0.11, 0.2], [0.11, 0.2], [-0.12, -0.22], [0.12, -0.22]]) B.push(ell(0.055, 0.1, 0.065, fur.getStyle(), [x, 0.1, z], [0, 0, 0], 10), ell(0.05, 0.03, 0.06, belly.getStyle(), [x, 0.02, z + 0.02], [0, 0, 0], 8));
  // forelimbs raised with sickle blades
  const blade = col(v.blade), edge = col('#ffffff');
  for (const k of [-1, 1]) {
    B.push(tubeC([[k * 0.1, 0.38, 0.3, 0.04], [k * 0.15, 0.36, 0.42, 0.034], [k * 0.16, 0.4, 0.5, 0.03]], fur.getStyle(), 7), ell(0.04, 0.035, 0.04, belly.getStyle(), [k * 0.16, 0.41, 0.51], [0, 0, 0], 8));
    const bl = crescent(0.2, 0.075, 0.022, blade, edge);
    bl.rotateZ(k * 1.25); bl.rotateY(k * 0.5); bl.rotateX(-0.5); bl.translate(k * 0.27, 0.5, 0.47);
    B.push(bl, cyl(0.024, 0.024, 0.08, '#8a4a3a', [k * 0.17, 0.43, 0.52], [0.4, 0, k * -0.3], 6));
  }
  // wind scarf
  const sc = col(v.scarf);
  B.push(paint(xf(new THREE.TorusGeometry(0.125, 0.038, 6, 16), { p: [0, 0.44, 0.27], r: [Math.PI / 2 - 0.6, 0, 0] }), (p, n, o) => o.copy(sc).multiplyScalar(0.9 + 0.1 * Math.sin(p.x * 60))));
  B.push(tubeC([[0.1, 0.44, 0.2, 0.038], [0.17, 0.4, 0.1, 0.034], [0.2, 0.36, -0.02, 0.028], [0.21, 0.32, -0.13, 0.016]], sc.getStyle(), 6));
  // fluffy S-tail (its own part: it swishes)
  const T = [];
  const path = [[0, 0, 0, 0.06], [0, 0.03, -0.15, 0.085], [0, 0.1, -0.31, 0.11], [0, 0.2, -0.43, 0.13], [0, 0.31, -0.48, 0.125], [0, 0.4, -0.45, 0.1], [0, 0.45, -0.37, 0.06]];
  const tp = new THREE.CatmullRomCurve3(path.map(q => V(q[0], q[1], q[2]))), N = 16, tpts = [];
  for (let i = 0; i <= N; i++) { const u = i / N, q = tp.getPoint(u), r = 0.055 + Math.sin(Math.min(1, u * 1.15) * Math.PI) * 0.085 + (u > 0.9 ? -0.03 * (u - 0.9) * 10 : 0); tpts.push([q.x, q.y, q.z, Math.max(0.02, r)]); }
  const tl = tubeC(tpts, fur.getStyle(), 12, true), tlp = tl.attributes.position;
  // fluffy: a gentle radial ripple along the tail
  paint(tl, (p, n, o) => { o.copy(fur); if (p.y > 0.3) o.lerp(tipC, clamp((p.y - 0.3) / 0.08)); o.multiplyScalar(0.93 + 0.07 * clamp(n.y + 0.5)); });
  for (let i = 0; i < tlp.count; i++) { const k = 1 + 0.07 * Math.sin(i * 1.7); tlp.setX(i, tlp.getX(i) * k); }
  tl.computeVertexNormals(); T.push(tl);
  if (v.tailBlade) { const tb = crescent(0.17, 0.06, 0.02, blade, edge); tb.rotateY(Math.PI / 2); tb.rotateX(-0.6); tb.translate(0, 0.5, -0.12); T.push(tb); }
  return { parts: [{ name: 'body', geo: B }, { name: 'tail', geo: T, at: [0, 0.34, -0.3] }] };
}
function buildKamaitachi(v) {
  const M = assemble('kamaitachi:' + v.key, () => kamaitachiSpec(v));
  const I = M.inner, T = M.g.tail;
  let run = 0, swish = 0;
  M.animate = (dt, t, moving) => {
    const a = M.act, k = (M.actT += dt);
    run += ((moving ? 1 : 0) - run) * Math.min(1, dt * 8);
    let y = 0, rx = 0, rz = 0, sz = 1, sy = 1;
    let tx = 0, ty = Math.sin(t * 2.2) * 0.35, tz = Math.sin(t * 1.4) * 0.08;
    switch (a) {
      case 'wind': { const p = ease.outCubic(clamp(k / (KM.WIND * 0.6))); rx = -0.5 * p; y = 0.04 * p; sy = 1 + 0.06 * p; rz = Math.sin(t * 70) * 0.03 * p; tx = 0.5 * p + Math.sin(t * 40) * 0.12; ty = Math.sin(t * 30) * 0.25; break; }
      case 'dash': rx = 0.18; y = 0.04; sz = 1.32; sy = 0.86; tx = 1.0; ty = 0; tz = 0; break;
      case 'recover': { const p = clamp(k / KM.RECOVER); rx = 0.12 * (1 - p); y = Math.abs(Math.sin(t * 16)) * 0.03; rz = Math.sin(t * 9) * 0.06; sy = 1 + Math.sin(t * 16) * 0.04; break; }
      case 'nipWind': rx = -0.25; sy = 0.92; break;
      case 'nip': { const p = clamp(k / 0.25); rx = 0.25 * Math.sin(p * Math.PI); sz = 1 + 0.2 * Math.sin(p * Math.PI); break; }
      default: {
        swish += dt * (6 + run * 12);
        y = Math.abs(Math.sin(swish * 1.5)) * 0.06 * run + Math.sin(t * 2.3) * 0.006;
        rz = Math.sin(swish * 1.5) * 0.05 * run; rx = 0.08 * run + Math.sin(t * 1.9) * 0.02;
        tx = 0.35 * run; ty = ty * (1 - run * 0.5);
      }
    }
    I.position.set(0, y, 0); I.rotation.set(rx, 0, rz); I.scale.set(1, sy, sz);
    T.rotation.set(tx, ty, tz);
  };
  return M;
}
function windTrail(m, x0, z0, x1, z1) {
  const G = m.G, len = Math.hypot(x1 - x0, z1 - z0);
  if (len < 0.5) return;
  const dx = (x1 - x0) / len, dz = (z1 - z0) / len, c = col(m.model.variant?.wind || '#d8ffe8');
  const raw = Math.max(1, Math.round(roll(m) * 0.3));
  patch(m, { x: (x0 + x1) / 2, z: (z0 + z1) / 2, r: len / 2, life: 1.5, tick: 0.4,
    update: (dt, z) => {
      if (Math.random() < dt * 30 * Math.min(1, len / 4)) {
        const u = Math.random() * len, px = x0 + dx * u, pz = z0 + dz * u, py = (G.world.heightAt?.(px, pz) || 0) + rand(0.15, 0.8), fade = 1 - z.t / z.life;
        puff(G.vfx.smoke, px, py, pz, { vx: dx * 2 + rand(-0.5, 0.5), vy: rand(0.1, 0.5), vz: dz * 2 + rand(-0.5, 0.5), life: 0.5, size: 0.35, size1: 0.8, color: c, alpha: 0.45 * fade, alpha1: 0, drag: 3, spin: rand(-4, 4) });
        if (Math.random() < 0.5) puff(G.vfx.spark, px, py, pz, { vx: dx * 5, vz: dz * 5, life: 0.3, size: 0.3, size1: 0.05, color: '#ffffff', alpha: 0.9 * fade, alpha1: 0, rot: screenAngle(G, dx, 0, dz), stretch: 2.5 });
      }
    },
    onTick: () => {
      const P = G.player; if (!P || G.playerDead) return;
      const u = clamp((P.pos.x - x0) * dx + (P.pos.z - z0) * dz, 0, len), qx = x0 + dx * u, qz = z0 + dz * u;
      if (dist(P.pos.x, P.pos.z, qx, qz) < 0.55 + (P.radius || 0.3)) { m.mode.combat.hitPlayer(raw, { element: m.stats.element, level: m.level, src: m }); sfx('kamaitachi_nick', P.pos); }
    } });
}
function kamaitachiAI(m, dt, target, d, slow) {
  const rs = m.rs, G = m.G, tr = target.radius || 0.3;
  rs.t += dt; rs.nipCd = (rs.nipCd ?? 0) - dt;
  const go = (st, pose = st) => { rs.st = st; rs.t = 0; act(m, pose); };
  if ((rs.st === 'wind' || rs.st === 'nipWind') && m.state !== 'windup') go('roam', 'idle');
  switch (rs.st) {
    case 'wind':
      m.facing = Math.atan2(rs.dx, rs.dz);
      if (rs.t >= KM.WIND) { go('dash'); m.state = 'attack'; rs.x0 = m.pos.x; rs.z0 = m.pos.z; rs.trav = 0; rs.hit = false; m.telegraph = null; sfx('kamaitachi_dash', m.pos); }
      return false;
    case 'dash': {
      const step = push(m, rs.dx, rs.dz, KM.DASH, dt); rs.trav += step;
      if (!rs.hit && dist(target.pos.x, target.pos.z, m.pos.x, m.pos.z) < KM.WIDTH + tr + 0.1) { rs.hit = true; m.dealTo(target, Math.round(roll(m) * 1.25), m.stats.element, 1.4); G.vfx.slash(target.pos, m.facing, { color: '#e8fff0', arc: 1.4, r: 0.9, life: 0.2, y: 0.6 }); }
      if (Math.random() < 0.7) puff(G.vfx.smoke, m.pos.x, m.pos.y + 0.2, m.pos.z, { vx: -rs.dx, vy: 0.3, vz: -rs.dz, life: 0.4, size: 0.3, size1: 0.6, color: '#e8f8ee', alpha: 0.5, alpha1: 0, drag: 3 });
      if (rs.trav >= rs.len || step < KM.DASH * dt * 0.3 || rs.t > 1.2) {
        windTrail(m, rs.x0, rs.z0, m.pos.x, m.pos.z);
        go('recover'); m.state = 'chase'; m.cd = rand(2.4, 3.2);
      }
      return true;
    }
    case 'recover':
      m.faceTo(target.pos.x, target.pos.z, dt * 0.4);
      if (rs.t >= KM.RECOVER) go('roam', 'idle');
      return false;
    case 'nipWind':
      m.faceTo(target.pos.x, target.pos.z, dt);
      if (rs.t >= 0.3) {
        go('nip'); m.state = 'attack';
        if (dist(target.pos.x, target.pos.z, m.pos.x, m.pos.z) < 1.25 + tr) m.dealTo(target, Math.round(roll(m) * 0.7), m.stats.element, 0.6);
        G.vfx.slash(m.pos, m.facing, { color: '#f0fff4', arc: 1.8, r: 0.9 * m.scale, life: 0.18, y: 0.45 }); sfx('kamaitachi_nip', m.pos);
      }
      return false;
    case 'nip': if (rs.t >= 0.3) { go('roam', 'idle'); m.state = 'chase'; rs.nipCd = rand(1.2, 1.8); } return false;
    default: {
      if (rs.st !== 'roam') go('roam', 'idle');
      const los = m.mode.los(m.pos, target.pos);
      if (m.cd <= 0 && los && d > 2.4 && d < 8.5) {
        rs.dx = (target.pos.x - m.pos.x) / d; rs.dz = (target.pos.z - m.pos.z) / d; rs.len = Math.min(d + 2.8, 9.5);
        m.facing = Math.atan2(rs.dx, rs.dz);
        go('wind'); m.state = 'windup';
        m.telegraph = tele(G, { shape: 'lane', x: m.pos.x, z: m.pos.z, r: KM.WIDTH, dir: m.facing, len: rs.len + 0.4, time: KM.WIND, color: '#ff5a6a' });
        sfx('kamaitachi_wind', m.pos);
        return false;
      }
      if (d < 1.25 + tr && rs.nipCd <= 0) { go('nipWind'); m.state = 'windup'; return false; }
      // dart round the target on a ~4.5 m orbit, switching direction now and then
      if (!los || d > 9) { m.chase(target, dt, slow); return true; }
      rs.flipT = (rs.flipT ?? rand(1.5, 3)) - dt; if (rs.flipT <= 0) { rs.flipT = rand(1.4, 3); rs.side = -(rs.side || 1); }
      const s = rs.side || 1, dx = (target.pos.x - m.pos.x) / d, dz = (target.pos.z - m.pos.z) / d, radial = clamp((d - 4.5) * 0.6, -1, 1);
      let ax = -dz * s + dx * radial, az = dx * s + dz * radial; const L = Math.hypot(ax, az) || 1; ax /= L; az /= L;
      _dir.set(ax, 0, az);
      const px = m.pos.x, pz = m.pos.z;
      m.move(_dir, dt, 0.95 * slow);
      if (Math.hypot(m.pos.x - px, m.pos.z - pz) < m.speed * dt * 0.2) rs.side = -s;
      return true;
    }
  }
}

// ================================================================================================= defs
const hurt = (name, gap = 0.45) => (m, dmg) => { const t = m.G.engine.time || 0; if (t - (m._hurtT || -9) > gap) { m._hurtT = t; sfx(name, m.pos); } return dmg; };

export const MONSTERS = {
  takenoko: mdef({
    name: 'Takenoko', build: 'takenoko', radius: 0.36, vr: 0.42, speed: 2.5, pack: 1.2, material: 'wood',
    attack: { type: 'melee', range: 1.4, cd: 1.6, windup: TK.WIND },
    stats: { name: 'Takenoko', life: 0.95, dmg: 1.1, def: 1.1, speed: 1.0, xp: 1.15, element: 'phys', res: { stink: 20, fire: -20 } },
    variants: [
      { key: 0, husk: '#a8743c', husk2: '#6a4424', tip: '#b8cc5a', cream: '#fff0c8', inner: '#e8d8a8', arm: '#9ac050' },
      { key: 1, name: 'Aotake Shoot', husk: '#86b04a', husk2: '#557a2a', tip: '#dcec7a', cream: '#f8f6d4', inner: '#d8e8a8', arm: '#b8dc6a', dirt: '#7a5a38' },
      { key: 2, name: 'Golden Takenoko', husk: '#e0a830', husk2: '#a8601c', tip: '#ff7a4a', cream: '#fff6d8', inner: '#ffe0a0', arm: '#ffc04a', gold: true },
    ],
    ai: takenokoAI, update: takenokoUpdate,
    onDeath: m => { sfx('takenoko_die', m.pos); for (let i = 0; i < 8; i++) puff(m.G.vfx.leaf, m.pos.x, m.pos.y + 0.6, m.pos.z, { vx: rand(-2, 2), vy: rand(1, 3), vz: rand(-2, 2), life: rand(0.8, 1.3), size: 0.24, size1: 0.12, color: m.model.variant?.tip || '#b8cc5a', alpha: 1, alpha1: 0, grav: 4, drag: 1.5, spin: rand(-8, 8) }); },
    damageTaken: hurt('takenoko_hurt'),
  }),
  kodama: mdef({
    name: 'Kodama', build: 'kodama', radius: 0.32, vr: 0.4, speed: 2.4, pack: 0.9, material: 'petal',
    attack: { type: 'ranged', range: 9, cd: 2.6, windup: KD.WIND, proj: 'leaf' },
    stats: { name: 'Kodama', life: 0.7, dmg: 1.05, def: 0.7, speed: 1.0, xp: 1.15, element: 'phys', ranged: true, res: { holy: 30, stink: 20, fire: -20 } },
    variants: [
      { key: 0, skin: '#f3f6ec' },
      { key: 1, name: 'Moss Kodama', skin: '#e6f0da', moss: '#7ab04a', dart: '#a8d85a' },
      { key: 2, name: 'Elder Kodama', skin: '#f6eedc', crown: true, glow: true, dart: '#ffb8d8' },
    ],
    ai: kodamaAI,
    update: (m, dt) => {
      if (!m.aggro) act(m, 'idle');
      const M = m.model; if (M.rattleNow > 0.75 && !M._rat) { M._rat = true; if (m.rs.st !== 'wind' && playerIn(m.G, m.pos.x, m.pos.z, 12)) sfx('kodama_rattle', m.pos); } else if (M.rattleNow < 0.3) M._rat = false;
    },
    onDeath: m => { sfx('kodama_die', m.pos); m.G.vfx.sparkle(m.lift(0.9), { n: 12, color: '#e8ffd0', r: 0.4, rise: 1.2 }); },
    damageTaken: hurt('kodama_hurt'),
  }),
  kamaitachi: mdef({
    name: 'Kamaitachi', build: 'kamaitachi', radius: 0.34, vr: 0.44, speed: 3.4, pack: 1.0, material: 'bone',
    attack: { type: 'charge', range: 8, cd: 2.8, windup: KM.WIND, dash: KM.DASH },
    stats: { name: 'Kamaitachi', life: 0.8, dmg: 1.15, def: 0.85, speed: 1.15, xp: 1.2, element: 'phys', res: { zap: 20 } },
    variants: [
      { key: 0, fur: '#e0a45c', belly: '#fff4e2', tail2: '#8a5a34', scarf: '#5ab87a', blade: '#d6e2f0' },
      { key: 1, name: 'Yuki Kamaitachi', fur: '#f2f0ec', belly: '#ffffff', tail2: '#2e2834', scarf: '#6aa8e8', blade: '#d0e8ff', wind: '#e0f0ff' },
      { key: 2, name: 'Storm Kamaitachi', fur: '#8c7aa6', belly: '#ece4f6', tail2: '#3a2a4a', scarf: '#e8503a', blade: '#ffd870', tailBlade: true, element: 'zap', wind: '#fff4b0' },
    ],
    ai: kamaitachiAI,
    update: m => { if (!m.aggro) act(m, 'idle'); },
    onDeath: m => sfx('kamaitachi_die', m.pos),
    damageTaken: hurt('kamaitachi_hurt'),
  }),
};
export const BUILD = { takenoko: buildTakenoko, kodama: buildKodama, kamaitachi: buildKamaitachi };
