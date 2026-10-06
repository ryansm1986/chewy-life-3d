// Boss: Umibōzu (海坊主), the sleepy sea-monk of the Shiokaze Tidepools (docs/REGIONS.md §2 / §3.4). Bosses B.
// A huge, round, dark-teal sea spirit seen from the chest up at the arena's sea edge: big glowing eyes, a gentle smile,
// pearl prayer beads, kelp on his head. He stays anchored in the surf and slides along the shore, so the fight is
// about his reach:
//   TIDAL SLAM  a rubber-hose arm arcs over the beach and a giant mitten slams a telegraphed circle (splash ring)
//   WAVE RINGS  he slaps the sea: a half-ring crest rolls up the beach (roll through it, take the gap, or outrun it)
//   INK RAIN    cheeks puffed, he spits ink blobs that land in telegraphed circles and leave slowing slicks
//   summons     kurage / kappa from the surf at 72% and 36%
//   PHASE 2     below 50% the tide rises: the arena rim floods (wading slows you) and surges crash over it; every
//               attack speeds up, slams come in pairs, rings in twos, more ink.
//   IN HIS COVE (the Tide Caves' round sea-cave arena, r ≥ 15 m: docs/ZONES.md §8.2) the kit gives the ring a sea on
//               the far side (layout.arenaSea + world.waterAt: the shore 6.5 m out from the centre); he rises from it,
//               slides a shorter way along the shore, his wave crests and the flood die against the rock round the
//               ring, he wakes when the hero steps into the ring (the seal), and the surf brings three waves of friends
//               (72 / 46 / 20%) for a hero fresh from two dense floors. His identity, intro, music and victory are as
//               outdoors.
// Model: a unit-size body (def.scale = S) built from the monster kit; hands + arms are world-space objects owned by
// the fight (fx_umibozu.js). Sounds: ./umibozu.sfx.js.
import * as THREE from 'three';
import { ell, cone, finish, LUM_CAP } from '../../dungeon/monsters.js';
import { paint, merge, tube } from '../../gfx/geom.js';
import { makeToon } from '../../gfx/materials.js';
import { spellFx, PAL, F } from '../../gfx/spellFx.js';
import { TAU, clamp, rand, ease, dampAngle, angleDiff } from '../../core/util.js';
import { BossRuntime, V, C, hitCircle, roll, sfx, pickId, summonAt, playerIn } from './kitB.js';
import { UMI, arms, waveRingMesh, layoutWave, inkBlobMesh, inkPuddleMesh, floodMesh, seaPoolMesh, foamRingMesh, sheetMesh } from './fx_umibozu.js';

const S = 4.4;              // model scale (unit body → ~5.2 m above the water)
const SUB = 1.04 * S;       // how far he sinks while waiting (his crown and kelp stay above the surface)
const BACK = 3.1;           // his centre sits this far out from the shoreline
const LAT = 7;              // how far he slides along the shore either way
const FW = 34, FD = 6.5, FX = 3; // flood band: width along the shore, depth inland, extra reach of a surge
const COL = { slam: '#ff2a48', ink: '#c86aff' };
// the arena retune (a round sea-cave cove of r ≥ 15 m instead of the 11 m outdoor beach): the slide along the shore, the
// summon thresholds and the waves of friends (each row: [id, fallback, count] …)
const ARENA_TUNE = { lat: 5.5, summonAt: [0.72, 0.46, 0.2], waves: [[['kurage', 'wisp', 3]], [['kappa', 'mochi', 2], ['heikegani', 'kappa', 1]], [['kurage', 'wisp', 2], ['kappa', 'mochi', 1], ['sazaeOni', 'heikegani', 1]]] };
const inHollow = B => (B.arena?.r || 0) >= 15;
const _v = V(), _w = V(), _x = V(), _y = V();
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// ================================================================== model
const KEY = [[0.001, -0.62], [0.68, -0.62], [0.77, -0.36], [0.8, -0.08], [0.79, 0.12], [0.73, 0.27], [0.63, 0.38], [0.56, 0.47], [0.545, 0.56], [0.56, 0.68], [0.55, 0.8], [0.5, 0.94], [0.4, 1.06], [0.24, 1.15], [0.001, 1.19]];
const ZS = 0.86, lean = y => Math.max(0, y - 0.45) * 0.12;
function rAt(y) { for (let i = 1; i < KEY.length; i++) if (y <= KEY[i][1]) { const [r0, y0] = KEY[i - 1], [r1, y1] = KEY[i]; return r0 + (r1 - r0) * (y - y0) / (y1 - y0 || 1); } return 0; }
/** the body surface's front z at (x, y) (unit model) */
const surfZ = (x, y) => Math.sqrt(Math.max(0, rAt(y) ** 2 - x * x)) * ZS + lean(y);
function onSurface(g, x, y, out = 0) { g.translate(x, y, surfZ(x, y) + out); return g; }
function boost(g, thr, k) { const c = g.attributes.color.array; for (let i = 0; i < c.length; i += 3) if (c[i] > thr && c[i + 1] > thr) { c[i] *= k; c[i + 1] *= k; c[i + 2] *= k; } return g; }
function orientTo(g, n) { g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), n.clone().normalize())); return g; }

function bodyGeo() {
  const prof = new THREE.SplineCurve(KEY.map(([r, y]) => new THREE.Vector2(r, y))).getPoints(64);
  prof[0].set(0.001, -0.62); prof[prof.length - 1].set(0.001, 1.19);
  const g = new THREE.LatheGeometry(prof, 72);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, p.getZ(i) * ZS + lean(y)); }
  g.computeVertexNormals();
  const cB = C(UMI.body), cD = C(UMI.deep), cL = C(UMI.belly), cS = C(UMI.sheen);
  return paint(g, (q, n, o) => {
    o.copy(cB);
    const fr = smooth(-0.1, 0.7, n.z);
    o.lerp(cL, fr * (q.y < 0.5 ? 0.55 * smooth(-0.3, 0.25, q.y) : 0.32 * smooth(1.02, 0.84, q.y)));
    o.lerp(cD, smooth(0.0, -0.85, n.z) * 0.5);
    o.lerp(cS, smooth(0.95, 1.18, q.y) * 0.4);
    o.lerp(cD, smooth(0.14, -0.12, q.y) * 0.55); // wet, darker at the waterline
  });
}
function buildUmibozu() {
  const body = bodyGeo();
  const parts = [body];
  // shoulder masses the arms grow out of
  for (const s of [-1, 1]) parts.push(ell(0.27, 0.33, 0.27, UMI.body, [s * 0.73, 0.02, 0.12], [0.1, 0, s * 0.4], 20));
  // soft brows, blush, the little forehead pearl (a monk's byakugō), a gentle smile with dimples
  for (const s of [-1, 1]) {
    const pts = [[s * 0.08, 0.955], [s * 0.19, 0.985], [s * 0.3, 0.955]].map(([x, y]) => ({ p: V(x, y, surfZ(x, y) + 0.012), r: 0.028 }));
    parts.push(paint(tube(pts, 6, true), (q, n, o) => o.set(UMI.deep)));
    parts.push(onSurface(ell(0.075, 0.042, 0.022, '#ff8f8a', [0, 0, 0], [0, s * 0.55, 0], 12), s * 0.33, 0.655, -0.004));
    parts.push(onSurface(ell(0.012, 0.012, 0.01, '#10262e', [0, 0, 0], [0, 0, 0], 6), s * 0.165, 0.605, 0.004));
  }
  parts.push(onSurface(ell(0.034, 0.034, 0.02, '#fff2e0', [0, 0, 0], [0, 0, 0], 10), 0, 1.02, 0.004));
  // pearl prayer beads (juzu) draped around the shoulders, with a golden mother bead and a violet tassel
  const NB = 19;
  for (let i = 0; i < NB; i++) {
    const a = (i / NB) * TAU, sx = Math.sin(a), cz = Math.cos(a), y = 0.37 - 0.075 * (cz * 0.5 + 0.5);
    const r = rAt(y) + 0.03;
    parts.push(ell(0.056, 0.056, 0.056, i % 3 === 1 ? '#ffc9d6' : '#fff3e6', [sx * r, y, cz * r * ZS + lean(y) + 0.02], [0, 0, 0], 10));
  }
  const fy = 0.28, fz = rAt(fy) * ZS + 0.07;
  parts.push(ell(0.085, 0.085, 0.07, '#ffe39a', [0, fy, fz], [0, 0, 0], 12));
  parts.push(cone(0.05, 0.15, '#9a5ad8', [0, fy - 0.12, fz + 0.01], [Math.PI, 0, 0], 8), ell(0.03, 0.02, 0.03, '#ffd26a', [0, fy - 0.055, fz + 0.01], [0, 0, 0], 8));
  // kelp draped over his crown, down the left side of his head
  const kp = [[0.0, 1.2, -0.04], [0.14, 1.16, 0.05], [0.29, 1.08, 0.12], [0.42, 0.97, 0.15], [0.5, 0.83, 0.13], [0.5, 0.7, 0.1], [0.46, 0.6, 0.12]];
  parts.push(paint(tube(kp.map(([x, y, z], i) => ({ p: V(x, y, z + 0.02), r: 0.042 - i * 0.004 })), 7, true), (q, n, o) => o.set('#3f9a4e').lerp(C('#8ad45e'), clamp((1.2 - q.y) * 1.3))));
  for (const [x, y, z, ry] of [[0.05, 1.19, -0.02, 0.6], [0.36, 1.03, 0.16, -0.4]]) parts.push(ell(0.1, 0.02, 0.05, '#6cc05a', [x, y + 0.01, z], [0.4, ry, 0.3], 10));
  // a starfish on his left shoulder, barnacles on the right
  { const n = V(0.62, 0.62, 0.45).normalize(), at = V(0.66, 0.27, 0.22), star = [];
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; star.push(ell(0.09, 0.022, 0.034, '#ff8a5a', [Math.sin(a) * 0.07, 0, Math.cos(a) * 0.07], [0, a, 0], 10)); }
    star.push(ell(0.045, 0.028, 0.045, '#ffa070', [0, 0.005, 0], [0, 0, 0], 10));
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; star.push(ell(0.012, 0.01, 0.012, '#ffe0b0', [Math.sin(a) * 0.08, 0.02, Math.cos(a) * 0.08], [0, 0, 0], 6)); }
    const g = orientTo(merge(star), n); g.translate(at.x, at.y, at.z); parts.push(g); }
  for (const [x, y, z, r] of [[-0.62, 0.3, 0.2, 0.04], [-0.7, 0.24, 0.1, 0.034], [-0.57, 0.36, 0.08, 0.03], [-0.72, 0.18, 0.22, 0.028], [-0.66, 0.33, -0.04, 0.036]]) {
    const n = V(x * 1.2, 0.7, z * 1.4).normalize();
    const g = orientTo(merge([cone(r, r * 1.1, '#efe4cc', [0, r * 0.5, 0], [0, 0, 0], 8), ell(r * 0.45, r * 0.25, r * 0.45, '#8a7a6a', [0, r * 1.02, 0], [0, 0, 0], 6)]), n); g.translate(x, y, z); parts.push(g);
  }
  const M = finish(parts, { mat: { fragOut: LUM_CAP } });
  // regroup: everything that rises / sinks lives under `lift`; the waterline churn stays at the surface (`wl`)
  const lift = new THREE.Group(), wl = new THREE.Group();
  M.pivot.remove(M.body, M.outline); lift.add(M.body, M.outline); M.pivot.add(lift, wl);
  // glowing eyes (unlit, a little over 1 so the bloom gives them a soft glow) with pupils that follow Chewy
  const eyeMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const eyes = [], pupils = [];
  for (const s of [-1, 1]) {
    const x = s * 0.2, y = 0.79, z = surfZ(x, y) - 0.025;
    const white = paint(new THREE.SphereGeometry(1, 20, 14).scale(0.128, 0.152, 0.07), (q, n, o) => o.setRGB(1.02, 1.12, 1.0).lerp(C('#bfeee0'), clamp(-n.y * 0.6)));
    const e = new THREE.Mesh(white, eyeMat); e.position.set(x, y, z); e.rotation.y = s * 0.34;
    const pg = merge([ell(0.066, 0.086, 0.03, '#0c1d26', [0, 0, 0], [0, 0, 0], 14), ell(0.024, 0.024, 0.012, '#ffffff', [-0.022, 0.03, 0.026], [0, 0, 0], 8), ell(0.011, 0.011, 0.01, '#ffffff', [0.02, -0.028, 0.026], [0, 0, 0], 6)]);
    boost(pg, 0.9, 1.3); // (the highlights glow a touch)
    const pu = new THREE.Mesh(pg, eyeMat); pu.position.set(0, -0.02, 0.052); e.add(pu);
    lift.add(e); eyes.push(e); pupils.push(pu);
  }
  // mouth: the resting smile, an open "O" for roars / spits, and cheeks that puff up for the ink
  const mouth = new THREE.Group(); mouth.position.set(0, 0.6, surfZ(0, 0.6)); lift.add(mouth);
  const smile = paint(tube([[-0.15, 0.03], [-0.08, 0.002], [0, -0.008], [0.08, 0.002], [0.15, 0.03]].map(([x, y]) => ({ p: V(x, y, surfZ(x, 0.6 + y) - surfZ(0, 0.6) + 0.008), r: 0.017 })), 6, true), (q, n, o) => o.set('#0e2630'));
  const smileM = new THREE.Mesh(smile, M.mat); mouth.add(smileM);
  const openG = merge([ell(0.1, 0.085, 0.04, '#2a0f1e', [0, -0.02, 0], [0, 0, 0], 16), ell(0.06, 0.03, 0.02, '#ff7a98', [0, -0.065, 0.02], [0, 0, 0], 10)]);
  const openM = new THREE.Mesh(openG, M.mat); openM.scale.setScalar(0.001); mouth.add(openM);
  const cheekG = merge([-1, 1].map(s => ell(0.12, 0.1, 0.07, UMI.belly, [s * 0.25, 0.02, -0.03], [0, s * 0.5, 0], 14)));
  const cheekM = new THREE.Mesh(cheekG, M.mat); cheekM.scale.setScalar(0.001); mouth.add(cheekM);
  // the water sheeting off him (a thin transparent shell of the body lathe) and the churn at his waterline
  const sheet = sheetMesh(body); sheet.visible = false; lift.add(sheet);
  const foam = foamRingMesh(); foam.scale.setScalar(1.35); wl.add(foam);
  return { ...M, lift, wl, eyes, pupils, mouth: { smile: smileM, open: openM, cheeks: cheekM }, sheet, foam, eyeMat };
}
export const BUILD = { umibozu: () => buildUmibozu() };

// ================================================================== placement
function findShore(m) {
  const W = m.world, mode = m.mode, L = mode.layout, B = m.B;
  const A = L.arena || { x: m.pos.x, z: m.pos.z, r: 11 };
  let sd = W.shoreDir?.(A.x, A.z, A.r + 14) || null;
  const rec = L.arenaSea || mode.region?.layout?.arenaSea;
  if (!sd && rec) sd = { x: rec[0], z: rec[1] };
  if (!sd) sd = { x: A.x - 56, z: A.z - 56 }; // (the map edge the arena is nearest to)
  const l = Math.hypot(sd.x, sd.z) || 1; sd = { x: sd.x / l, z: sd.z / l };
  let e = -1;
  for (let k = 2; k <= A.r + 14; k += 0.5) if (!W.walkable(A.x + sd.x * k, A.z + sd.z * k)) { e = k; break; }
  const wet = k => typeof W.waterAt === 'function' && W.waterAt(A.x + sd.x * k, A.z + sd.z * k) > 0.45;
  B.hasSea = e > 0 && (wet(e + 2) || wet(e + 3.5) || wet(e + 5));
  if (!B.hasSea) e = Math.min(e > 0 ? e : 99, A.r * 0.92);
  B.arena = A; B.s = V(sd.x, 0, sd.z); B.tan = V(-sd.z, 0, sd.x); B.shoreK = e;
  B.E = V(A.x + sd.x * e, 0, A.z + sd.z * e); B.E.y = W.heightAt(B.E.x, B.E.z);
  const wl = W.waterLevel ?? W.terrain?.water?.level;
  B.waterY = B.hasSea ? (wl ?? B.E.y) : B.E.y + 0.06;
  B.land = Math.atan2(-sd.x, -sd.z); // the yaw that faces the beach
  B.u = 0; B.uGoal = 0;
}
/** his centre for lateral offset u (world xz), into `out` */
function anchorAt(B, u, out) { return out.set(B.E.x + B.s.x * BACK + B.tan.x * u, out.y, B.E.z + B.s.z * BACK + B.tan.z * u); }
/** no sea behind the arena (flat placeholder worlds): paint one, and make it solid ground for nobody */
function fakeSea(m) {
  const B = m.B, W = m.world, L = m.mode.layout;
  const sea = B.sea = seaPoolMesh(64, 44);
  sea.position.set(B.E.x + B.s.x * 0.2, B.E.y + 0.05, B.E.z + B.s.z * 0.2); sea.rotation.y = Math.atan2(B.s.x, B.s.z);
  B.scene.add(sea);
  const cell = L.CELL || 2;
  const ring = inHollow(B) ? B.arena : null; // (in a dungeon cove only the ring's own cells: never the corridors behind it)
  if (L.grid && L.W) for (let cy = 0; cy < L.H; cy++) for (let cx = 0; cx < L.W; cx++) {
    const x = (cx + 0.5) * cell, z = (cy + 0.5) * cell, dx = x - B.E.x, dz = z - B.E.z;
    if (ring && Math.hypot(x - ring.x, z - ring.z) > ring.r + 1) continue;
    if (dx * B.s.x + dz * B.s.z > -0.4 && Math.abs(dx * B.tan.x + dz * B.tan.z) < 34) L.grid[cy * L.W + cx] = 0;
  }
  // worlds whose walkable() ignores the grid: a fence of colliders along the waterline
  if (W.walkable(B.E.x + B.s.x * 2, B.E.z + B.s.z * 2) && W.collision?.addCircle) for (let u = -30; u <= 30; u += 1.4) W.collision.addCircle(B.E.x + B.s.x * 1.2 + B.tan.x * u, B.E.z + B.s.z * 1.2 + B.tan.z * u, 1.0);
}

// ================================================================== spawn: set the stage
function onSpawn(m) {
  const B = m.B = new BossRuntime(m), G = m.G, mdl = m.model;
  findShore(m);
  anchorAt(B, 0, m.pos); m.pos.y = m.world.heightAt(m.pos.x, m.pos.z);
  m.facing = B.land;
  m.height = 5.3 + Math.max(0, B.waterY - m.pos.y); // (damage numbers / emotes float over his crown)
  m.shadow.visible = false;
  if (!B.hasSea) fakeSea(m);
  // body material + arms/hands (world objects sharing the body's toon material and its hit flash)
  B.arms = arms(B, mdl.mat);
  B.pv = { position: { y: 0 }, scale: { y: 1 } }; // framing proxy (see bossProfile)
  B.liftW = -SUB; B.lastLife = m.life; B.state = 'sub'; B.phase = 1; B.sheet = 0; B.blinkT = 2; B.voiceT = 6; B.busy = 0; B.restT = 0; B.last = []; B.summoned = 0;
  B.eyeLight = m.world.lightPool.addSource({ pos: V(), color: C('#8ff4ff'), intensity: 0, radius: 9, priority: 5 });
  // measure his silhouette for the boss framing fully risen, then sink him (the framing follows the rise live)
  m.sync(); mdl.pivot.scale.setScalar(S);
  pose(m, 0);
  mdl.root.updateMatrixWorld(true);
  const prof = m.mode.bossProfile?.(m);
  if (prof) { prof.pv = B.pv; prof.py = 0; prof.ps = 1; B.y0 = m.pos.y; }
  pose(m, 0);
  B.pv.position.y = -SUB;
  placeHands(m, 0, 0, true); B.arms.visible = false;
  // prewarm the fight's objects behind the iris
  B.pool('wave', () => waveRingMesh(B)).warm(2);
  B.pool('blob', () => inkBlobMesh()).warm(6);
  B.pool('puddle', () => inkPuddleMesh()).warm(6);
  B.flood = floodMesh(FW, FD + FX); B.scene.add(B.flood); B.flood.frustumCulled = false; B.warmUp(B.flood);
  const sp = spellFx(G);
  G.vfx.undamped(() => { const p = V(0, -80, 0); sp.splash(p, { r: 1, big: true }); sp.shock(p, { r: 1 }); sp.droplets(p, { n: 2 }); sp.mist(p, { n: 1 }); });
}
/** lift / waterline offsets for the current rise (world m, relative to his risen height) */
function pose(m, off) {
  const B = m.B, mdl = m.model, gy = m.world.heightAt(m.pos.x, m.pos.z);
  mdl.lift.position.y = (B.waterY - gy + off) / S;
  mdl.wl.position.y = (B.waterY - gy) / S + 0.002;
  B.pv.position.y = off + (B.y0 != null ? B.y0 - gy : 0);
}
/** shoulder / rest points in world space for his current anchor, facing and rise */
function shoulder(m, side, out) {
  const B = m.B, f = m.facing, c = Math.cos(f), s = Math.sin(f), lx = side * 0.8 * S, lz = 0.16 * S;
  return out.set(m.pos.x + lx * c + lz * s, B.waterY + B.liftW + 0.1 * S, m.pos.z - lx * s + lz * c);
}
function restPoint(m, side, out, t = 0) {
  const B = m.B, f = m.facing, c = Math.cos(f), s = Math.sin(f), lx = side * 2.7, lz = 2.3;
  return out.set(m.pos.x + lx * c + lz * s, B.waterY + 0.16 + Math.sin(t * 1.4 + side) * 0.07 + Math.min(0, B.liftW) * 0.9, m.pos.z - lx * s + lz * c);
}
function placeHands(m, dt, t = 0, snap = false) {
  const B = m.B, k = snap ? 1 : 1 - Math.exp(-5 * dt);
  for (const h of B.arms.hands) {
    shoulder(m, h.side, h.shoulder);
    if (h.busy) continue;
    restPoint(m, h.side, _v, t);
    h.pos.lerp(_v, k); h.yaw = snap ? m.facing + h.side * 0.35 : dampAngle(h.yaw, m.facing + h.side * 0.35, 6, dt);
    h.pitch += (0 - h.pitch) * k; h.lift += (0 - h.lift) * k; h.sag += (1.5 - h.sag) * k;
    h.sq = Math.max(0, h.sq - dt * 3);
  }
}

// ================================================================== per frame
function update(m, dt) {
  const B = m.B; if (!B || B.dead) return;
  const G = m.G, P = G.player, mdl = m.model;
  m.anim.lunge = 0; m.anim.wind = 0; // (his own roar / squash; the kit's pivot tilt would swing 5 m of body)
  B.update(dt);
  const t = B.t;
  if (m.life < B.lastLife - m.lifeMax * 0.004) B.flinch = 1;
  B.lastLife = m.life;
  const act = B.canAct; B.canAct = false;
  // wake up when Chewy steps onto his beach (the Burrow's line-of-sight aggro can't see out of the sea)
  // (in the cove the arena trigger wakes him as the seal closes: dungeon/zoneRun.js; here the same line, as a backstop)
  if (!m.aggro && P && !G.playerDead && Math.hypot(P.pos.x - B.arena.x, P.pos.z - B.arena.z) < B.arena.r + (inHollow(B) ? -2.2 : 1.5)) m.alert();
  if (m.aggro && B.state === 'sub') startRise(m);
  // slide along the shore after Chewy, turn to face him (never away from the beach)
  if (m.aggro && P) {
    _v.set(P.pos.x - B.E.x, 0, P.pos.z - B.E.z);
    const lat = inHollow(B) ? ARENA_TUNE.lat : LAT;
    B.uGoal = clamp(_v.x * B.tan.x + _v.z * B.tan.z, -lat, lat);
    const sp = (B.phase > 1 ? 1.9 : 1.4) * (B.busy ? 0.45 : 1) * (m.status.slow?.t > 0 ? 1 - m.status.slow.amt * 0.5 : 1);
    const du = B.uGoal - B.u; B.u += Math.sign(du) * Math.min(Math.abs(du), sp * dt);
    const want = Math.atan2(P.pos.x - m.pos.x, P.pos.z - m.pos.z), rel = clamp(angleDiff(B.land, want), -0.85, 0.85);
    m.facing = dampAngle(m.facing, B.land + rel, B.busy ? 1.5 : 3, dt);
    if (Math.abs(du) > 0.3 && Math.random() < dt * 12) wake(m);
  }
  anchorAt(B, B.u, m.pos); m.pos.y = m.world.heightAt(m.pos.x, m.pos.z); // (also undoes any shove: fear, collision)
  // rise / idle motion
  const bob = Math.sin(t * 0.9) * 0.1 + Math.sin(t * 2.1) * 0.03;
  const tideDip = B.dip || 0;
  B.liftW = B.state === 'sub' ? -SUB + Math.sin(t * 0.8) * 0.06 : (B.riseOff ?? 0) + bob - tideDip;
  pose(m, B.liftW);
  mdl.lift.rotation.z = Math.sin(t * 0.55) * 0.02; mdl.lift.rotation.x = Math.sin(t * 0.7 + 1) * 0.012 + (B.flinch || 0) * 0.05;
  B.flinch = Math.max(0, (B.flinch || 0) - dt * 4);
  mdl.lift.scale.set(1 + (B.puff || 0) * 0.03, 1 + Math.sin(t * 1.3) * 0.008, 1);
  // blink, pupils on Chewy, mouth / cheeks
  B.blinkT -= dt; if (B.blinkT < 0) B.blinkT = rand(2.4, 5.2);
  const bl = B.blinkT < 0.13 ? 1 - Math.abs(B.blinkT - 0.065) / 0.065 : 0, sleepy = B.state === 'rest' ? 0.22 : 0;
  for (let i = 0; i < 2; i++) mdl.eyes[i].scale.y = Math.max(0.08, 1 - Math.max(bl, sleepy));
  if (P) { const lx = clamp(angleDiff(m.facing, Math.atan2(P.pos.x - m.pos.x, P.pos.z - m.pos.z)) * 0.05, -0.03, 0.03); for (const pu of mdl.pupils) { pu.position.x += (-lx - pu.position.x) * Math.min(1, dt * 6); pu.position.y += (-0.035 - pu.position.y) * Math.min(1, dt * 6); } }
  const mo = B.mouthO || 0, ch = B.puff || 0;
  mdl.mouth.open.scale.setScalar(Math.max(0.001, mo)); mdl.mouth.smile.visible = mo < 0.3 && ch < 0.3; mdl.mouth.cheeks.scale.setScalar(Math.max(0.001, ch));
  // water sheeting off him, drips, churn
  B.sheet = Math.max(0, B.sheet - dt * 0.22);
  mdl.sheet.visible = B.sheet > 0.02; mdl.sheet.material.uniforms.uA.value = B.sheet; mdl.sheet.material.uniforms.uT.value = t;
  mdl.foam.material.uniforms.uT.value = t; mdl.foam.material.uniforms.uA.value = B.state === 'sub' ? 0.45 : 0.9;
  mdl.foam.scale.setScalar(B.state === 'sub' ? 0.55 : 1.35);
  if (B.sea) B.sea.material.uniforms.uT.value = t;
  drips(m, dt);
  // eye glow light on the beach in front of him
  const f = m.facing; B.eyeLight.pos.set(m.pos.x + Math.sin(f) * 3.2, B.waterY + B.liftW + 3.4, m.pos.z + Math.cos(f) * 3.2);
  B.eyeLight.intensity += ((B.state === 'sub' ? 0 : B.state === 'rest' ? 2 : 3.2) - B.eyeLight.intensity) * Math.min(1, dt * 3);
  // hands at rest follow him; the arms are rebuilt every frame
  placeHands(m, dt, t);
  B.arms.update(t);
  if (B.flood.visible) floodUpdate(m, dt);
  // the brain
  if (m.aggro && B.state !== 'sub' && B.state !== 'rise') {
    const frac = m.life / m.lifeMax;
    if (B.phase === 1 && frac < 0.5 && !B.busy) startTide(m);
    else if (!B.busy && B.state !== 'tide' && B.summoned < sumAt(B).length && frac < sumAt(B)[B.summoned]) callFriends(m);
    else if (act) think(m, dt);
    B.voiceT -= dt; if (B.voiceT < 0 && !B.busy) { B.voiceT = rand(7, 11); sfx('umi_voice', m.pos, { vol: 0.7 }); }
  }
}
const sumAt = B => (inHollow(B) ? ARENA_TUNE.summonAt : [0.72, 0.36]);
function ai(m) { m.B.canAct = true; return false; } // (stunned / feared: the brain waits, running attacks still resolve)

function startRise(m) {
  const B = m.B, G = m.G, sp = spellFx(G);
  B.state = 'rise'; B.riseOff = -SUB; B.arms.visible = true;
  sfx('umi_rise', m.pos);
  G.vfx.undamped(() => {
    for (let i = 0; i < 5; i++) { const a = B.land + (i / 4 - 0.5) * 2.4; sp.splash(_v.set(m.pos.x + Math.sin(a) * 3.4, B.waterY, m.pos.z + Math.cos(a) * 3.4), { r: 2.2, big: true }); }
    sp.mist(_v.set(m.pos.x, B.waterY + 1, m.pos.z), { n: 16, r: 3, size: 1.6, alpha: 0.5 });
  });
  G.engine.rig.shake(0.7);
  B.run((dt, t) => {
    const k = clamp(t / 1.5);
    B.riseOff = -SUB * (1 - ease.outBack(k, 1.2));
    B.sheet = Math.max(B.sheet, 1);
    if (Math.random() < dt * 60 * (1 - k)) sp.droplets(_v.set(m.pos.x + rand(-3, 3), B.waterY + 0.2, m.pos.z + rand(-3, 3)), { n: 3, speed: 3, up: 7, size: 0.24 });
    if (k < 1) return true;
    B.riseOff = 0; B.state = 'idle'; B.restT = 0.9; B.mouthO = 0;
    sfx('umi_voice', m.pos);
    B.run((dt2, t2) => { B.mouthO = Math.sin(clamp(t2 / 0.9) * Math.PI) * 0.9; return t2 < 0.9; });
    return false;
  });
}
function wake(m) {
  const B = m.B, sp = spellFx(m.G), side = Math.random() < 0.5 ? -1 : 1;
  sp.pn.spawn({ frame: F.FOAM, x: m.pos.x + B.tan.x * side * 3.4 + rand(-0.5, 0.5), y: B.waterY + 0.1, z: m.pos.z + B.tan.z * side * 3.4 + rand(-0.5, 0.5), vy: 0.3, life: rand(0.6, 1), size: rand(0.4, 0.8), size1: 1.2, color: PAL.foam, alpha: 0.8, alpha1: 0 });
}
function drips(m, dt) {
  const B = m.B, sp = spellFx(m.G), f = m.facing, c = Math.cos(f), s = Math.sin(f);
  const rate = B.state === 'sub' ? 4 : 5 + B.sheet * 40;
  B.dripAcc = (B.dripAcc || 0) + rate * dt;
  while (B.dripAcc > 1) {
    B.dripAcc -= 1;
    if (B.state === 'sub') { sp.pn.spawn({ frame: F.BUBBLE, x: m.pos.x + rand(-2, 2), y: B.waterY + 0.05, z: m.pos.z + rand(-2, 2), vy: 0.6, life: 0.7, size: rand(0.18, 0.34), size1: 0.3, color: PAL.foam, alpha: 0.9, alpha1: 0 }); continue; }
    const lx = rand(-0.62, 0.62) * S, ly = rand(0.15, 0.95) * S, lz = surfZ(lx / S, ly / S) * S * 0.98;
    sp.pn.spawn({ frame: F.DROP, x: m.pos.x + lx * c + lz * s, y: B.waterY + B.liftW + ly, z: m.pos.z - lx * s + lz * c, vx: s * 0.4, vy: -0.5, vz: c * 0.4, life: 0.9, size: rand(0.14, 0.24), size1: 0.12, color: Math.random() < 0.5 ? PAL.aqua : PAL.foam, alpha: 0.95, alpha1: 0.4, grav: 9 });
  }
}

// ================================================================== the brain
const pace = m => (m.B.phase > 1 ? 0.74 : 1) * (m.status.slow?.t > 0 ? 1 + m.status.slow.amt * 0.4 : 1);
function think(m, dt) {
  const B = m.B, P = m.pickTarget?.() || m.G.player;
  if (B.busy || !P) return;
  B.restT -= dt; if (B.restT > 0) return;
  if (B.state === 'rest') B.state = 'idle';
  const d = Math.hypot(P.pos.x - m.pos.x, P.pos.z - m.pos.z);
  const opts = [];
  if (d < 15) opts.push(['slam', d < 10 ? 3.2 : 2]);
  opts.push(['wave', d < 11 ? 2.4 : 1.2]);
  opts.push(['ink', d > 8 ? 3 : 1.4]);
  let tot = 0; for (const o of opts) { if (B.last[0] === o[0]) o[1] *= B.last[1] === o[0] ? 0.1 : 0.45; tot += o[1]; }
  let r = Math.random() * tot, pick = opts[0][0];
  for (const o of opts) { r -= o[1]; if (r <= 0) { pick = o[0]; break; } }
  B.last.unshift(pick); B.last.length = 2;
  if (pick === 'slam') doSlam(m, P); else if (pick === 'wave') doWaves(m); else doInk(m, P);
}
/** an attack finished: a breather (sweat drop + his sleepy eyes = "hit me now") */
function rest(m, sec) {
  const B = m.B; B.busy = 0; B.state = 'rest'; B.restT = sec * pace(m);
  if (B.restT > 0.9) m.emote('sweat', B.restT);
}

// ---------------------------------------------------------------- TIDAL SLAM
function doSlam(m, P) {
  const B = m.B, two = B.phase > 1;
  const hands = B.arms.hands;
  // the hand on Chewy's side goes first
  const rel = angleDiff(m.facing, Math.atan2(P.pos.x - m.pos.x, P.pos.z - m.pos.z)), first = rel > 0 ? hands[0] : hands[1];
  B.busy = 1; B.state = 'slam';
  slam(m, first, P.pos, () => { if (!two) rest(m, 1.25); });
  if (two) B.after(0.55, () => { if (!B.dead) slam(m, first === hands[0] ? hands[1] : hands[0], m.G.player.pos, () => rest(m, 1.1)); });
}
function slam(m, h, at, done) {
  const B = m.B, G = m.G, W = m.world, sp = spellFx(G);
  const wind = (B.phase > 1 ? 0.85 : 1.15) * (m.status.slow?.t > 0 ? 1.15 : 1), hold = B.phase > 1 ? 0.5 : 0.75, R = B.phase > 1 ? 3.2 : 3.0;
  // aim: clamp to his reach, keep it on the beach
  const T = V(at.x, 0, at.z);
  _v.set(T.x - m.pos.x, 0, T.z - m.pos.z); const dl = _v.length(); if (dl > 14) T.set(m.pos.x + _v.x / dl * 14, 0, m.pos.z + _v.z / dl * 14);
  T.y = W.heightAt(T.x, T.z);
  const dir = V(T.x - m.pos.x, 0, T.z - m.pos.z).normalize(), yaw = Math.atan2(dir.x, dir.z);
  const wrist = V(T.x - dir.x * 0.95, T.y + 0.28, T.z - dir.z * 0.95), hover = V(wrist.x - dir.x * 0.6, T.y + 5.2, wrist.z - dir.z * 0.6), start = h.pos.clone();
  G.vfx.telegraph(T, R, wind + 0.12, COL.slam); m.mode.bossTelegraph?.(wind + 0.2);
  m.mode.bossEngaged?.(m);
  sfx('umi_raise', m.pos);
  h.busy = true; let hit = false;
  B.run((dt, t) => {
    if (t < wind) { // rise and hover over the circle, trembling
      const k = t / wind, e = ease.outCubic(Math.min(1, k / 0.6));
      h.pos.lerpVectors(start, hover, e); h.pos.y += Math.sin(t * 26) * 0.06 * k;
      h.yaw = dampAngle(h.yaw, yaw, 10, dt); h.pitch = -0.5 * e; h.lift = 3.5 * e; h.sag = 1.5 * (1 - e);
      return true;
    }
    const s = t - wind;
    if (s < 0.13) { const k = s / 0.13; h.pos.lerpVectors(hover, wrist, k * k); h.pitch = -0.5 * (1 - k); return true; }
    if (!hit) {
      hit = true; h.sq = 1; h.pitch = 0;
      G.vfx.undamped(() => { sp.splash(T, { r: R * 0.8, big: true }); sp.shock(T, { r: R * 1.25, a: '#bff8ff', b: '#ffffff', w: 0.2 }); });
      G.vfx.dustRing(T, R * 0.9, 20);
      for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; sp.droplets(_v.set(T.x + Math.cos(a) * R * 0.7, T.y + 0.1, T.z + Math.sin(a) * R * 0.7), { n: 2, speed: 3, up: 5, size: 0.2 }); }
      G.engine.rig.shake(0.75);
      sfx('umi_slam', T);
      hitCircle(m, T.x, T.z, R, roll(m, 1.3), { element: 'phys', knock: 1.3 });
    }
    if (s < 0.13 + hold) { h.sq = Math.max(0, h.sq - dt * 3); if (Math.random() < dt * 20) sp.pn.spawn({ frame: F.DROP, x: h.pos.x + rand(-1, 1), y: h.pos.y + 0.5, z: h.pos.z + rand(-1, 1), vy: -0.5, life: 0.5, size: 0.18, size1: 0.1, color: PAL.aqua, alpha: 0.9, alpha1: 0.3, grav: 9 }); return true; }
    const r = (s - 0.13 - hold) / 0.55;
    if (r < 1) { restPoint(m, h.side, _w, B.t); h.pos.lerpVectors(wrist, _w, ease.inOutQuad(r)); h.pos.y += Math.sin(r * Math.PI) * 1.6; h.lift = 3.5 * (1 - r) * 0.5; h.sag = 1.5 * r; return true; }
    h.busy = false; done?.();
    return false;
  }, () => { h.busy = false; });
}

// ---------------------------------------------------------------- WAVE RINGS
function doWaves(m) {
  const B = m.B, G = m.G, sp = spellFx(G), two = B.phase > 1, wind = 0.95 * pace(m);
  B.busy = 1; B.state = 'wave';
  const hands = B.arms.hands, starts = hands.map(h => h.pos.clone());
  for (const h of hands) h.busy = true;
  sfx('umi_raise', m.pos, { pitch: 0.9 });
  m.mode.bossTelegraph?.(wind + 0.3); m.mode.bossEngaged?.(m);
  // a foamy arc flashes on the beach at his feet: "here it comes"
  G.vfx.undamped(() => sp.ripple(_v.set(B.E.x + B.tan.x * B.u, B.E.y, B.E.z + B.tan.z * B.u), { r: 4.5, life: wind, color: PAL.foam, alpha: 0.8 }));
  let slapped = false;
  B.run((dt, t) => {
    const f = m.facing, c = Math.cos(f), s = Math.sin(f);
    for (let i = 0; i < 2; i++) {
      const h = hands[i], side = h.side;
      if (t < wind) { // both hands up beside his head
        const e = ease.outCubic(Math.min(1, t / (wind * 0.7)));
        _v.set(m.pos.x + side * 3.4 * c + 1.4 * s, B.waterY + 4.8, m.pos.z - side * 3.4 * s + 1.4 * c);
        h.pos.lerpVectors(starts[i], _v, e); h.pos.y += Math.sin(t * 24 + i) * 0.05; h.pitch = -1.1 * e; h.yaw = dampAngle(h.yaw, f + side * 0.2, 8, dt); h.lift = 1.2 * e; h.sag = 0.4;
      } else if (t < wind + 0.12) { // slap!
        const k = (t - wind) / 0.12;
        _v.set(m.pos.x + side * 3.4 * c + 1.4 * s, B.waterY + 4.8, m.pos.z - side * 3.4 * s + 1.4 * c);
        _w.set(m.pos.x + side * 2.3 * c + 3.0 * s, B.waterY + 0.1, m.pos.z - side * 2.3 * s + 3.0 * c);
        h.pos.lerpVectors(_v, _w, k * k); h.pitch = -1.1 * (1 - k);
      } else { h.sq = Math.max(0, h.sq - dt * 3); }
    }
    if (t >= wind + 0.12 && !slapped) {
      slapped = true;
      for (const h of hands) { h.sq = 1; G.vfx.undamped(() => sp.splash(h.pos, { r: 2.2, big: true })); }
      G.engine.rig.shake(0.5); sfx('umi_slam', m.pos, { pitch: 1.15, vol: 0.8 });
      const gap = pickGap(m);
      ring(m, gap, 0);
      if (two) B.after(1.1, () => { if (!B.dead) ring(m, pickGap(m, gap), 1); });
    }
    if (t < wind + 0.12 + 0.45) return true;
    for (const h of hands) h.busy = false;
    rest(m, two ? 1.6 : 1.1);
    return false;
  }, () => { for (const h of hands) h.busy = false; });
}
/** the gap: somewhere across the arc, never right where Chewy stands (he has to move for it), away from `avoid` */
function pickGap(m, avoid) {
  const B = m.B, P = m.G.player, a0 = Math.atan2(-B.s.z, -B.s.x), pa = P ? Math.atan2(P.pos.z - m.pos.z, P.pos.x - m.pos.x) : a0;
  for (let i = 0; i < 20; i++) {
    const g = a0 + rand(-1.25, 1.25);
    if (Math.abs(angleDiff(g, pa)) < 0.4) continue;
    if (avoid != null && Math.abs(angleDiff(g, avoid)) < 0.7) continue;
    return g;
  }
  return a0 + 1.2;
}
function crestAt(e, cx, cz, R, a0, half, kbuf) {
  const dx = e.pos.x - cx, dz = e.pos.z - cz, d = Math.hypot(dx, dz);
  if (Math.abs(d - R) > 0.75) return false;
  const a = Math.atan2(dz, dx); if (Math.abs(angleDiff(a0, a)) > half) return false;
  const i = Math.round((angleDiff(a0 - half, a) / (half * 2)) * 72); return kbuf[clamp(i, 0, 72)] > 0.5;
}
function ring(m, gapA, n) {
  const B = m.B, G = m.G, W = m.world, sp = spellFx(G), pool = B.pool('wave', () => waveRingMesh(B)), mesh = pool.take();
  const cx = m.pos.x, cz = m.pos.z, a0 = Math.atan2(-B.s.z, -B.s.x), half = 1.85, R0 = BACK + 0.2, Rmax = 20;
  const speed = B.phase > 1 ? 6.3 : 5.3, H0 = 1.15, gw = B.phase > 1 ? 0.2 : 0.27, raw = roll(m, 0.9), key = n ? 'umiWave1' : 'umiWave0';
  const kbuf = mesh.userData.k ||= new Float32Array(73), from = V(cx, 0, cz), hitA = new Set(), C = m.mode.combat;
  let R = R0, hitP = false;
  sfx('umi_wave', from.set(cx, B.waterY, cz));
  B.run((dt, t) => {
    R += speed * dt;
    const H = H0 * Math.pow(clamp(1 - (R - R0) / (Rmax - R0 - 5)), 0.55) * Math.min(1, t / 0.2) + 0.06;
    layoutWave(mesh, W, cx, cz, R, H, a0, half, gapA, gw, kbuf, inHollow(B) ? B.arena : null);
    mesh.material.uniforms.uA.value = clamp((Rmax - R) / 3);
    // crest contact: only while it still stands tall (past ~13 m it's a harmless wash). A roll's i-frames carry you
    // through; a block still counts as the wave passing.
    if (H > 0.32) {
      const P = G.player;
      if (!hitP && P && !G.playerDead && crestAt(P, cx, cz, R, a0, half, kbuf)) { const r = C.hitPlayer(raw, { element: 'frost', level: m.level, from, knock: 1.5, src: m }); if (r || !P.invuln) hitP = true; }
      for (const e of C.entities) if (e.alive && e.team === 'ally' && e !== P && e.pos && !hitA.has(e) && crestAt(e, cx, cz, R, a0, half, kbuf)) { hitA.add(e); C.hitAlly(e, Math.round(raw * 0.8), { element: 'frost' }); }
    }
    // spray off the crest and a foam wash left on the sand
    const nS = sp.emit(key, 70 * clamp(H), dt);
    for (let i = 0; i < nS; i++) {
      let a = a0 + rand(-half, half); if (Math.abs(angleDiff(a, gapA)) < gw + 0.05) a += gw * 2.4;
      const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R, gy = W.heightAt(x, z);
      if (i % 3) sp.pn.spawn({ frame: F.DROP, x, y: gy + H * 0.9, z, vx: Math.cos(a) * 2.5, vy: rand(1, 3), vz: Math.sin(a) * 2.5, life: 0.45, size: rand(0.14, 0.22), size1: 0.08, color: PAL.foam, alpha: 1, alpha1: 0.3, grav: 9 });
      else sp.pn.spawn({ frame: F.FOAM, x: x - Math.cos(a) * 0.9, y: gy + 0.06, z: z - Math.sin(a) * 0.9, life: rand(0.5, 0.8), size: rand(0.3, 0.5), size1: 0.6, color: PAL.foam, alpha: 0.5, alpha1: 0 });
    }
    return R < Rmax;
  }, () => pool.give(mesh));
}

// ---------------------------------------------------------------- INK RAIN
function doInk(m, P) {
  const B = m.B, G = m.G, W = m.world, sp = spellFx(G), n = B.phase > 1 ? 6 : 4, wind = 0.85 * pace(m);
  B.busy = 1; B.state = 'ink';
  m.mode.bossEngaged?.(m);
  sfx('umi_puff', m.pos);
  let spat = false;
  B.run((dt, t) => {
    if (t < wind) { B.puff = ease.outBack(Math.min(1, t / (wind * 0.8))); B.mouthO = 0; return true; }
    if (!spat) {
      spat = true; B.puff = 0; sfx('umi_ink', m.pos);
      // landing spots: one right on Chewy, the rest around him (kept apart, on the beach)
      const spots = [V(P.pos.x, 0, P.pos.z)];
      for (let k = 0; k < 60 && spots.length < n; k++) {
        const a = rand(0, TAU), r = rand(2.2, 5.2), x = P.pos.x + Math.cos(a) * r, z = P.pos.z + Math.sin(a) * r;
        if (!W.walkable(x, z) || spots.some(q => (q.x - x) ** 2 + (q.z - z) ** 2 < 4.4)) continue;
        spots.push(V(x, 0, z));
      }
      const f = m.facing, mouth = V(m.pos.x + Math.sin(f) * 0.55 * S, B.waterY + B.liftW + 0.6 * S, m.pos.z + Math.cos(f) * 0.55 * S);
      spots.forEach((T, i) => { T.y = W.heightAt(T.x, T.z); blob(m, mouth, T, 1.05 + i * 0.13); });
      G.vfx.undamped(() => sp.sparkBurst(mouth, { n: 10, color: C('#8a7ad8'), speed: 3, size: 0.4, layer: 'n' }));
    }
    const s = t - wind;
    B.mouthO = s < 0.5 ? Math.sin(s / 0.5 * Math.PI) : 0;
    if (s < 0.6) return true;
    rest(m, 1.2);
    return false;
  }, () => { B.puff = 0; B.mouthO = 0; });
}
function blob(m, from, T, time) {
  const B = m.B, G = m.G, sp = spellFx(G), pool = B.pool('blob', () => inkBlobMesh()), o = pool.take(), R = 1.75;
  G.vfx.telegraph(T, R, time, COL.ink);
  const x0 = from.x, y0 = from.y, z0 = from.z, apex = Math.max(y0, T.y) + 4 + Math.random() * 1.5;
  let landed = false;
  B.run((dt, t) => {
    const k = Math.min(1, t / time), x = x0 + (T.x - x0) * k, z = z0 + (T.z - z0) * k;
    const y = (1 - k) * (1 - k) * y0 + 2 * (1 - k) * k * apex + k * k * T.y;
    o.position.set(x, y + 0.3, z); o.rotation.set(t * 5, t * 3, 0);
    const vy = 2 * (1 - k) * (apex - y0) + 2 * k * (T.y - apex);
    o.scale.set(0.85, 0.85 + clamp(Math.abs(vy) / time * 0.02, 0, 0.35), 0.85);
    if (Math.random() < dt * 30) m.G.vfx.dot.spawn({ x, y: y + 0.3, z, vx: rand(-0.3, 0.3), vy: rand(-0.5, 0.2), vz: rand(-0.3, 0.3), life: 0.4, size: rand(0.12, 0.2), size1: 0.05, color: '#3a2c70', alpha: 0.9, alpha1: 0, grav: 4 });
    if (k < 1) return true;
    if (!landed) { landed = true; splat(m, T, R); }
    return false;
  }, () => pool.give(o));
}
function splat(m, T, R) {
  const B = m.B, G = m.G, sp = spellFx(G), pool = B.pool('puddle', () => inkPuddleMesh()), pd = pool.take(), U = pd.material.uniforms;
  sfx('umi_splat', T);
  hitCircle(m, T.x, T.z, R, roll(m, 0.6), { element: 'phys', knock: 0.5 });
  for (let i = 0; i < 16; i++) { const a = rand(0, TAU), v = rand(2, 5); G.vfx.dot.spawn({ x: T.x, y: T.y + 0.3, z: T.z, vx: Math.cos(a) * v, vy: rand(2, 5), vz: Math.sin(a) * v, life: rand(0.4, 0.7), size: rand(0.16, 0.3), size1: 0.08, color: i % 3 ? '#2e2560' : '#6a5ab8', alpha: 1, alpha1: 0.6, grav: 14, drag: 1 }); }
  G.vfx.undamped(() => sp.ripple(T, { r: R * 1.2, life: 0.5, color: C('#8a7ad8'), alpha: 0.7 }));
  const life = B.phase > 1 ? 6.5 : 5.5, raw = roll(m, 0.12);
  pd.position.set(T.x, T.y + 0.05, T.z); pd.rotation.y = rand(0, TAU); U.uSeed.value = rand(0, 10);
  let tick = 0;
  B.run((dt, t) => {
    const sIn = Math.min(1, t / 0.14); pd.scale.setScalar(R * (0.35 + 0.65 * ease.outBack(sIn)));
    U.uA.value = t > life - 0.8 ? Math.max(0, (life - t) / 0.8) : 1; U.uT.value = t;
    // the slick: slows and stings
    if (t < life - 0.5 && playerIn(G, T.x, T.z, R * 0.85)) {
      const P = G.player; if (!(P.slowT > 0.25) || (P.slowAmt || 0) < 0.45) P.slowAmt = 0.45; P.slowT = Math.max(P.slowT || 0, 0.25);
      tick -= dt; if (tick <= 0) { tick = 0.5; m.mode.combat.hitPlayer(raw, { element: 'phys', level: m.level, src: m }); }
    } else tick = Math.min(tick, 0.15);
    if (Math.random() < dt * 2) G.vfx.dot.spawn({ x: T.x + rand(-R, R) * 0.6, y: T.y + 0.08, z: T.z + rand(-R, R) * 0.6, vy: 0.4, life: 0.5, size: 0.18, size1: 0.3, color: '#5a4aa8', alpha: 0.7, alpha1: 0 });
    return t < life;
  }, () => pool.give(pd));
}

// ---------------------------------------------------------------- summons
function callFriends(m) {
  const B = m.B, G = m.G, sp = spellFx(G);
  B.summoned++;
  const cx = B.E.x - B.s.x * 3.5 + B.tan.x * B.u, cz = B.E.z - B.s.z * 3.5 + B.tan.z * B.u;
  const jelly = pickId(['kurage'], 'wisp'), kappa = pickId(['kappa'], 'mochi');
  let adds;
  if (inHollow(B)) { // the cove: three waves out of the surf, the last one bringing a turban-shell oni
    adds = [];
    for (const [id, fb, n] of ARENA_TUNE.waves[B.summoned - 1] || ARENA_TUNE.waves[0]) adds.push(...summonAt(m, pickId([id], fb), n, cx, cz, 1.5, 5.5));
  } else adds = B.summoned === 1 ? summonAt(m, jelly, 3, cx, cz, 1.5, 5.5) : [...summonAt(m, kappa, 2, cx, cz, 1.5, 5), ...summonAt(m, jelly, 1, cx, cz, 2, 5)];
  for (const a of adds) G.vfx.undamped(() => sp.splash(a.pos, { r: 1.2 }));
  sfx('umi_call', m.pos);
  G.ui?.toast?.(B.summoned === 1 ? 'Umibōzu calls his jelly friends from the surf!' : B.summoned === 2 ? 'The kappa come surfing in!' : 'The whole tide pool wakes up!', { color: '#7fe6ff', icon: 'oni' });
  m.emote('!', 1.4);
  B.busy = 1; B.state = 'call'; B.mouthO = 0;
  B.run((dt, t) => { B.mouthO = Math.sin(clamp(t / 0.8) * Math.PI) * 0.8; if (t < 0.9) return true; rest(m, 0.8); return false; });
}

// ---------------------------------------------------------------- PHASE 2: the tide rises
function startTide(m) {
  const B = m.B, G = m.G, sp = spellFx(G), fl = B.flood, U = fl.material.uniforms;
  B.phase = 2; m.enraged = true; B.busy = 1; B.state = 'tide';
  fl.visible = true; fl.position.set(B.E.x, B.E.y - 0.2, B.E.z); fl.rotation.y = Math.atan2(-B.s.x, -B.s.z);
  if (inHollow(B)) { U.uClip.value.set(B.arena.x, B.arena.z, B.arena.r - 0.3, 1); U.uTone.value.set(0.42, 0.78); } // (the flood laps at the cove's rock, dark as the cave)
  fl.renderOrder = 7;
  B.floodK = 0; B.surgeT = 5; B.surgeK = 0; B.warnK = 0;
  sfx('umi_tide', m.pos); G.engine.rig.shake(0.6); G.engine.post.pulse('#bff4ff', 0.18);
  G.ui?.toast?.('The tide is rising!', { color: '#7fe6ff', icon: 'oni' });
  m.emote('anger', 1.6);
  B.run((dt, t) => {
    const k = clamp(t / 2.6);
    B.floodK = ease.inOutQuad(k);
    B.dip = Math.sin(clamp(t / 3) * Math.PI) * 1.4; // he sinks to his chin, then surges back up
    B.sheet = Math.max(B.sheet, 0.5 * k);
    if (Math.random() < dt * 14) sp.droplets(_v.set(B.E.x + B.tan.x * rand(-FW / 2, FW / 2), B.E.y + 0.3, B.E.z + B.tan.z * rand(-FW / 2, FW / 2)), { n: 3, speed: 2, up: 3, size: 0.18 });
    if (t < 3) return true;
    B.dip = 0; B.sheet = 1;
    G.vfx.undamped(() => { for (let i = 0; i < 3; i++) sp.splash(_v.set(m.pos.x + B.tan.x * (i - 1) * 3, B.waterY, m.pos.z + B.tan.z * (i - 1) * 3), { r: 2.4, big: true }); });
    sfx('umi_voice', m.pos, { pitch: 0.9 });
    rest(m, 0.6);
    return false;
  }, () => { B.dip = 0; });
}
function floodUpdate(m, dt) {
  const B = m.B, G = m.G, sp = spellFx(G), fl = B.flood, U = fl.material.uniforms, P = G.player;
  U.uT.value = B.t;
  const base = (4 + FD) / (4 + FD + FX);
  // surges: telegraph (hatch + hot rim racing inland), then the crash reaches FX m further up the beach
  if (B.phase > 1 && B.state !== 'tide' && !B.dead) {
    B.surgeT -= dt;
    if (B.surgeT < 1.3 && !B.warned) { B.warned = true; sfx('umi_surge_warn', B.E); m.mode.bossTelegraph?.(1.3); }
    if (B.surgeT <= 0) { B.surgeT = rand(6.5, 8); B.warned = false; surge(m); }
  }
  const warn = B.warned ? clamp((1.3 - B.surgeT) / 1.3) : 0;
  B.surgeK = Math.max(0, B.surgeK - dt * 1.1);
  U.uA.value = B.floodK * 0.92; U.uWarn.value = warn;
  U.uSurge.value = Math.max(warn, B.surgeK);
  U.uEdge.value = (0.35 + (base - 0.35) * B.floodK) + (1 - base) * Math.sin(Math.min(1, B.surgeK) * Math.PI * 0.5) * (B.surgeK > 0 ? 1 : 0);
  fl.position.y = B.E.y - 0.2 + 0.55 * B.floodK + 0.12 * B.surgeK;
  // wading slows
  if (P && !G.playerDead && B.floodK > 0.5) {
    _v.set(P.pos.x - B.E.x, 0, P.pos.z - B.E.z);
    const inl = -(_v.x * B.s.x + _v.z * B.s.z), lat = Math.abs(_v.x * B.tan.x + _v.z * B.tan.z);
    if (inl < FD * B.floodK && lat < FW / 2 && P.pos.y < fl.position.y + 0.3) { if (!(P.slowT > 0.2)) { P.slowT = 0.15; P.slowAmt = 0.22; } if (Math.random() < dt * 6 && P.anim?.speed > 0.5) sp.droplets(_w.set(P.pos.x, P.pos.y + 0.1, P.pos.z), { n: 2, speed: 1.5, up: 2.5, size: 0.13 }); }
  }
}
function surge(m) {
  const B = m.B, G = m.G, sp = spellFx(G), P = G.player;
  B.surgeK = 1;
  sfx('umi_surge', B.E); G.engine.rig.shake(0.45);
  const reach = FD + FX;
  for (let i = 0; i < 12; i++) { const u = (i / 11 - 0.5) * FW * 0.9; sp.droplets(_v.set(B.E.x + B.tan.x * u - B.s.x * reach * 0.8, B.E.y + 0.3, B.E.z + B.tan.z * u - B.s.z * reach * 0.8), { n: 4, speed: 3, up: 5, size: 0.22 }); if (i % 3 === 0) sp.mist(_v, { n: 3, r: 1, size: 1 }); }
  const raw = roll(m, 0.8), hitE = (e) => {
    _v.set(e.pos.x - B.E.x, 0, e.pos.z - B.E.z);
    const inl = -(_v.x * B.s.x + _v.z * B.s.z), lat = Math.abs(_v.x * B.tan.x + _v.z * B.tan.z);
    return inl > -1 && inl < reach && lat < FW / 2;
  };
  if (P && !G.playerDead && hitE(P)) m.mode.combat.hitPlayer(raw, { element: 'frost', level: m.level, from: _w.set(P.pos.x + B.s.x * 3, 0, P.pos.z + B.s.z * 3), knock: 1.8, src: m });
  for (const e of m.mode.combat.entities) if (e.alive && e.team === 'ally' && e !== P && e.pos && hitE(e)) m.mode.combat.hitAlly(e, Math.round(raw * 0.8), { element: 'frost' });
}

// ================================================================== the end
function onDeath(m) {
  const B = m.B; if (!B || B.dead) return;
  B.dead = true; B.clear();
  const G = m.G, mdl = m.model, sp = spellFx(G);
  if (B.eyeLight) m.world.lightPool.removeSource(B.eyeLight);
  sfx('umi_defeat', m.pos);
  // he sinks back into the sea with a sleepy smile: his body leaves the monster rig (which is disposed right after) and
  // plays out as a VFX (freed when it ends); the arms slide under, the flood drains
  const lift = mdl.lift; lift.updateMatrixWorld(true);
  const grp = new THREE.Group(); lift.matrixWorld.decompose(grp.position, grp.quaternion, grp.scale);
  lift.parent.remove(lift); lift.position.set(0, 0, 0); lift.rotation.set(0, 0, 0); lift.scale.set(1, 1, 1); grp.add(lift);
  for (const e of mdl.eyes) e.scale.y = 0.2;
  mdl.mouth.open.scale.setScalar(0.001); mdl.mouth.cheeks.scale.setScalar(0.001); mdl.mouth.smile.visible = true;
  const A = B.arms, fl = B.flood, y0 = grp.position.y, hs = A.hands.map(h => h.pos.clone());
  const ax = m.pos.x, az = m.pos.z;
  G.vfx.add(grp, (dt, t) => {
    const k = clamp(t / 2.6);
    grp.position.y = y0 - ease.inQuad(k) * SUB * 1.05;
    grp.rotation.z = Math.sin(t * 2) * 0.03 * (1 - k);
    A.hands.forEach((h, i) => { h.pos.copy(hs[i]); h.pos.y -= ease.inQuad(k) * 4; h.shoulder.y -= dt * 2; });
    A.update(t);
    if (fl.visible) { const U = fl.material.uniforms; U.uA.value *= Math.exp(-dt * 1.4); U.uWarn.value = 0; if (U.uA.value < 0.02) fl.visible = false; }
    if (Math.random() < dt * 30) sp.pn.spawn({ frame: F.BUBBLE, x: ax + rand(-3, 3), y: B.waterY + 0.05, z: az + rand(-3, 3), vy: 0.8, life: 0.8, size: rand(0.2, 0.45), size1: 0.35, color: PAL.foam, alpha: 0.9, alpha1: 0 });
    if (t > 2.8) { A.visible = false; fl.visible = false; return false; }
    return true;
  }, 3);
  G.vfx.undamped(() => { sp.splash(_v.set(ax, B.waterY, az), { r: 3, big: true }); sp.mist(_v.set(ax, B.waterY + 1.5, az), { n: 14, r: 3, size: 1.5, alpha: 0.45 }); });
  // the victory / loot / portal land on the beach in front of him, not in the surf
  const bx = B.E.x - B.s.x * 1.5 + B.tan.x * B.u, bz = B.E.z - B.s.z * 1.5 + B.tan.z * B.u;
  m.pos.set(bx, m.world.heightAt(bx, bz), bz);
}

// ================================================================== definition
export const MONSTERS = {
  umibozu: {
    adds: ['kurage', 'kappa', 'heikegani', 'sazaeOni'], // (his waves from the surf: dungeon/zoneRun.js warms them with the floor)
    name: 'Umibōzu', build: 'umibozu', boss: true, scale: S, radius: 3.2, vr: 3.3, speed: 1.5, life: 0.8, dmg: 1, move: 'none', element: 'frost',
    subtitle: 'The sea itself has come to say hello.',
    stats: { name: 'Umibōzu', life: 1.0, dmg: 1.0, def: 1.1, speed: 1, xp: 1.5, element: 'frost', res: { frost: 50, fire: 20, zap: -20 } },
    material: 'stone',
    attack: { type: 'slam', range: 14, radius: 3, cd: 3, windup: 1.15 }, // (read by generic code paths only; the fight is scripted above)
    variants: [{}],
    ai, update, onSpawn, onDeath,
    // test hooks (tools/qa/zone-boss-shots.mjs, src/tests/regionBosses.js): force a move right now
    debug: {
      slam: m => { const B = m.B; if (!B || B.busy || B.state === 'sub') return; doSlam(m, m.G.player); },
      wave: m => { const B = m.B; if (!B || B.busy || B.state === 'sub') return; doWaves(m); },
      ink: m => { const B = m.B; if (!B || B.busy || B.state === 'sub') return; doInk(m, m.G.player); },
      summon: m => { const B = m.B; if (!B || B.busy || B.state === 'sub') return; callFriends(m); },
      phase2: m => { const B = m.B; if (!B || B.phase > 1 || B.state === 'sub') return; m.life = Math.min(m.life, m.lifeMax * 0.49); B.busy = 0; startTide(m); },
      state: m => ({ st: m.B?.state, phase: m.B?.phase, summoned: m.B?.summoned, u: +(m.B?.u || 0).toFixed(2), hasSea: m.B?.hasSea, shoreK: m.B?.shoreK, life: Math.round(m.life), lifeMax: m.lifeMax }),
    },
  },
};
export const _test = { buildUmibozu, arms, S, SUB, placeHands, pose };
