// Tide Caves' own monster (docs/ZONES.md §8.2; ROADMAP Z-C2): the SAZAE-ONI (栄螺鬼), a turban-shell oni. Built with the
// region monster kit (src/regions/monsters/bamboo.js: assemble / mdef / tele / bolt / hitArea…), registered with the
// region monsters (src/regions/monsters/index.js) so it batches, pools and tests like them. Sounds: ./tidepool.sfx.js.
//
// A turban snail grown old enough to become an oni: a big spiky spiral shell on a frilly snail foot, and peeking out of
// its pearly mouth a round red oni face with two ivory horns, a seaweed tuft, a fangy grin and stubby arms. It sits in
// its shell with the lid shut, like any other shell on the sand, until someone comes close: then it pops out ("!") and
// glides after you, and either
//   SPINE STAR  (mid range) shuts itself in, its spines bristle and eight lanes flash out round it, then it fires them
//                in a star (one aimed at you: step between the lanes);
//   SHELL SPIN  (close)     shuts itself in, a ring telegraph, then spins like a top with its spines out, sliding after
//                you (a knock-back), and is dizzy afterwards: its head lolls out, the moment to hit it.
// While it is shut in its shell it takes half damage (a clank and sparks): hit it when its face is out.
// The slow tank among the tidepools' quick yokai: lots of life and armour, few to a pack (pack 0.35).
// Variants: the red Sazae-oni, the Hotaru Sazae-oni (blue, its shell spotted with glowing plankton) and the Elder (a
// barnacled, weed-hung shell, a white beard). 4 parts (shell, spines, head, lid) = 8 instanced batches a variant.
import * as THREE from 'three';
import { assemble, mdef, act, tele, hitArea, roll, sfx, puff, playerIn, ell, cyl, tubeC, blob, cheeks, eyesCute, smile, paint, take, give, bolt, V, col, INK } from '../../regions/monsters/bamboo.js';
import { makeToon } from '../../gfx/materials.js';
import { rand, clamp, TAU, ease } from '../../core/util.js';

const SZ = { WAKE: 0.6, BRISTLE: 0.95, FIRE: 0.35, NSP: 8, SP_V: 9.5, SP_LEN: 7.5, SPIN_WIND: 0.8, SPIN_T: 0.95, SPIN_R: 2.2, SPIN_V: 1.8, DIZZY: 1.15 };
const PI = Math.PI;
const nzs = (x, y, z) => Math.sin(x * 9.1 + y * 3.7) * Math.cos(z * 7.3 - x * 2.1) * 0.5 + Math.sin(x * 23 + z * 19) * 0.25;
// the shell's surface: a turban spire on a wide body whorl, the whorls winding up it (t 0 base .. 1 apex, a = angle)
const Y0 = 0.1, HS = 0.84, TURNS = 2.6;
function shellR(t) { return 0.6 * Math.sqrt(clamp(t / 0.24)) * Math.pow(1 - t, 0.72); }
/** the whorl coordinate at (a, t): 0 at a suture, rising round the whorl to the next */
const whorl = (a, t) => { const s = t * TURNS - a / TAU; return s - Math.floor(s); };
function shellAt(a, t, out = new THREE.Vector3()) {
  const f = whorl(a, t), w = 1 - 0.07 + 0.2 * Math.pow(Math.sin(f * PI), 0.6) * (1 - t * 0.5); // (each whorl swells out between its sutures)
  const da = Math.atan2(Math.sin(a - PI / 2), Math.cos(a - PI / 2)), mouth = 0.34 * Math.exp(-((da / 0.5) ** 2)) * Math.exp(-(((t - 0.24) / 0.13) ** 2)); // (the shell's mouth: a hollow at the front the face looks out of)
  const R = shellR(t) * w * (1 - mouth), y = Y0 + t * HS;
  return out.set(Math.cos(a) * R, y, Math.sin(a) * R * 0.94 - (y - Y0) * 0.1);
}
function sazaeSpec(v) {
  const shC = col(v.shell), bandC = col(v.band), darkC = col(v.shell).multiplyScalar(0.55), glowC = col('#9ff8ff');
  // the shell: whorl bands with a dark suture between them, a lighter crest on every whorl, a mottle, plankton spots
  const shell = blob(56, 48, q => { const t = q.y * 0.5 + 0.5, a = Math.atan2(q.z, q.x); return shellAt(a, t, q); }, (p, n, o) => {
    const t = clamp((p.y - Y0) / HS), a = Math.atan2(p.z + (p.y - Y0) * 0.1, p.x), f = whorl(a, t);
    o.copy(shC).multiplyScalar((0.86 + 0.18 * nzs(p.x * 4, p.y * 4, p.z * 4)) * (0.93 + 0.08 * Math.sin(a * 38 + f * 5))); // (fine growth lines)
    if (f > 0.5) o.lerp(bandC, 0.6 * clamp((f - 0.5) * 6));                   // the pale upper band of every whorl
    if (Math.abs(f - 0.33) < 0.035) o.lerp(col('#f4ecd8'), 0.4);             // a thin pale line round it
    if (f < 0.1 || f > 0.94) o.lerp(darkC, 0.9);                             // the suture
    else if (f < 0.16) o.lerp(darkC, 0.4);
    if (n.y < -0.3) o.multiplyScalar(0.7);
    if (v.glow && nzs(p.x * 11, p.y * 11, p.z * 11) > 0.62) o.copy(glowC);   // (the Hotaru's glowing plankton)
    if (v.elder && nzs(p.x * 9 + 2, p.y * 9, p.z * 9) > 0.5) o.lerp(col('#e8e2d2'), 0.7); // barnacle crust
  });
  const body = [shell];
  // the snail's foot: a frilly mottled skirt under the shell
  body.push(blob(28, 12, q => q.set(q.x * 0.48, Math.max(-0.2, q.y) * 0.1 + 0.07 + Math.sin(Math.atan2(q.z, q.x) * 9) * 0.014 * (1 - Math.abs(q.y)), q.z * 0.46 + 0.08), (p, n, o) => o.set(v.foot).multiplyScalar(0.85 + 0.25 * clamp(nzs(p.x * 8, 0, p.z * 8) + 0.5)).lerp(col(v.footEdge), clamp(Math.hypot(p.x / 0.54, (p.z - 0.05) / 0.5) * 2 - 1.2))));
  // its pearly mouth at the front, a dark throat inside
  { const lip = new THREE.TorusGeometry(0.215, 0.055, 8, 24); lip.scale(1, 0.86, 1); lip.rotateX(-0.2); lip.translate(0, 0.3, 0.4); body.push(paint(lip, (p, n, o) => o.set('#f4dcd2').lerp(col('#ffffff'), clamp(n.z * 0.6)).lerp(col('#e8a8b8'), clamp(-n.y) * 0.4)));
    const throat = new THREE.CircleGeometry(0.2, 18); throat.scale(1, 0.86, 1); throat.rotateX(-0.2); throat.translate(0, 0.3, 0.3); body.push(paint(throat, (p, n, o) => o.set('#2a1820'))); }
  if (v.elder) { // weed strands hanging off the shell's whorls
    for (const [a, t, L] of [[0.4, 0.3, 0.32], [2.2, 0.22, 0.4], [3.6, 0.36, 0.28], [5.0, 0.27, 0.36]]) {
      const p0 = shellAt(a, t), out = V(Math.cos(a), 0, Math.sin(a));
      body.push(tubeC([[p0.x, p0.y, p0.z, 0.02], [p0.x + out.x * 0.08, p0.y - L * 0.5, p0.z + out.z * 0.08, 0.016], [p0.x + out.x * 0.1, p0.y - L, p0.z + out.z * 0.1, 0.006]], (p, n, o) => o.set('#4a6a30').lerp(col('#8aa848'), clamp((p0.y - p.y) / L)), 4));
    }
  }
  // the spines: two rows of hollow spines round the body whorl and the next, pointing out and down (bristle when it fights)
  const spines = [];
  for (const [k, n, L, r] of [[0, 11, 0.32, 0.075], [1, 8, 0.23, 0.06], [2, 6, 0.15, 0.045]]) { // (on the crest of each whorl, following the spiral up)
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + k * 0.4, t = (k + 0.42 + a / TAU) / TURNS; if (t > 0.85) continue;
      const p0 = shellAt(a, t); if (t < 0.36 && Math.abs(Math.atan2(Math.sin(a - PI / 2), Math.cos(a - PI / 2))) < 0.8) continue; // (not over its face)
      const dir = V(Math.cos(a), -0.15 + t * 0.6, Math.sin(a)).normalize(), g = new THREE.ConeGeometry(r, L, 7);
      g.translate(0, L / 2, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir)); g.translate(p0.x, p0.y, p0.z);
      spines.push(paint(g, (p, nn, o) => o.set(v.spine).lerp(col(v.tip), clamp((Math.hypot(p.x - p0.x, p.y - p0.y, p.z - p0.z) / L) * 1.6 - 0.6))));
    }
  }
  // the head (its pivot sits in the shell's mouth, so it shrinks back inside): a round red oni face, ivory horns, a
  // seaweed tuft, big eyes under fierce little brows, a fangy grin, blush, stubby arms
  const head = [ell(0.2, 0.18, 0.15, v.skin, [0, 0.02, 0.06], [0, 0, 0], 16)];
  for (const k of [-1, 1]) { const h = new THREE.ConeGeometry(0.045, 0.2, 8); h.translate(0, 0.1, 0); h.rotateZ(-k * 0.6); h.rotateX(0.35); h.translate(k * 0.12, 0.12, 0.1); head.push(paint(h, (p, n, o) => o.set(v.horn).lerp(col('#c8b48c'), clamp(0.18 - p.y) * 4))); }
  for (let i = 0; i < 3; i++) head.push(ell(0.05, 0.016, 0.028, v.hair, [(i - 1) * 0.045, 0.19, 0.02 - Math.abs(i - 1) * 0.02], [0.3, (i - 1) * 0.7, (i - 1) * 0.5], 8));
  head.push(...eyesCute(0.05, 0.19, 0.074, 0.95, { brow: 1, yaw: 0.3 }));
  head.push(smile(-0.055, 0.205, 0.05, 0.02, 0.01));
  for (const k of [-1, 1]) { const f = new THREE.ConeGeometry(0.012, 0.034, 5); f.translate(k * 0.03, -0.05, 0.207); head.push(paint(f, (p, n, o) => o.set('#fffaf0'))); }
  head.push(...cheeks(-0.015, 0.195, 0.12, 1.0));
  if (v.elder) head.push(ell(0.11, 0.07, 0.05, '#f4f2ea', [0, -0.13, 0.13], [0.2, 0, 0], 10), ell(0.05, 0.05, 0.04, '#f4f2ea', [0, -0.19, 0.12], [0, 0, 0], 8)); // a white beard
  for (const k of [-1, 1]) { head.push(tubeC([[k * 0.17, -0.06, 0.05, 0.045], [k * 0.25, -0.1, 0.1, 0.042], [k * 0.3, -0.13, 0.15, 0.04]], v.skin, 7), ell(0.055, 0.05, 0.05, v.skin, [k * 0.31, -0.14, 0.17], [0, 0, 0], 10)); }
  // the lid (the operculum: shown while it hides): a chalky disc with a spiral, set in the mouth
  const lidG = new THREE.CylinderGeometry(0.2, 0.2, 0.045, 24, 1, true); lidG.rotateX(PI / 2);
  const lidF = new THREE.RingGeometry(0.0, 0.2, 32, 8); lidF.translate(0, 0, 0.0225); // (rings of vertices, so the spiral can be painted)
  const lid = [lidG, lidF].map(g0 => { g0.scale(1, 0.86, 1); g0.rotateX(-0.2); g0.translate(0, 0.3, 0.39); return paint(g0, (p, n, o) => {
    const dx = p.x, dy = (p.y - 0.3) / 0.86, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx), sp = ((r * 15 - a / TAU + 9) % 1 + 1) % 1;
    o.set(v.lid).lerp(col('#fff4e0'), clamp(1 - r / 0.2) * 0.35); if (sp < 0.3 && n.z > 0.5) o.lerp(col('#8a6a4a'), 0.5); if (n.z < 0.5) o.multiplyScalar(0.8); }); });
  const glow = v.glow ? 'outgoingLight += diffuseColor.rgb * 1.15 * step(0.85, diffuseColor.b) * step(diffuseColor.r, 0.75);' : '';
  return { mat: { fragOut: glow }, outline: 0.02, parts: [
    { name: 'body', geo: body },
    { name: 'spines', geo: spines },
    { name: 'head', geo: head, at: [0, 0.3, 0.32] }, // (its geometry is authored round its pivot in the mouth)
    { name: 'lid', geo: lid, outline: 0.012 },
  ] };
}
function buildSazae(v) {
  const M = assemble('sazaeOni:' + v.key, () => sazaeSpec(v));
  const I = M.inner, head = M.g.head, lid = M.g.lid, sp = M.g.spines;
  let spinA = 0, hS = 0.12, spS = 1, rate = 0;
  M.variant = v;
  M.animate = (dt, t, moving) => {
    const a = M.act, k = (M.actT += dt);
    let y = 0, sx = 1, sy = 1, rx = 0, rz = 0, hw = 1, shut = false, sw = 1, hy = 0, hr = 0, want = 0;
    switch (a) {
      case 'sleep': hw = 0.12; shut = true; sy = 1 + Math.sin(t * 1.4) * 0.015; sx = 1 / Math.sqrt(sy); break;
      case 'wake': { const p = clamp(k / SZ.WAKE); hw = 0.12 + ease.outBack(clamp(p * 1.7)) * 0.88; shut = p < 0.12; y = Math.sin(clamp(p * 1.4) * PI) * 0.24; sy = 1 + Math.sin(p * PI * 2) * 0.09; sx = 1 / Math.sqrt(sy); break; }
      case 'tuck': hw = 0.12; shut = k > 0.12; sy = 1 - 0.06 * Math.sin(clamp(k / 0.2) * PI); break;
      case 'bristle': { const p = clamp(k / SZ.BRISTLE); hw = 0.12; shut = true; sw = 1 + 0.12 * ease.outCubic(p); sp.rotation.y = Math.sin(t * 50) * 0.04 * p; rz = Math.sin(t * 42) * 0.035 * p; rx = Math.cos(t * 37) * 0.025 * p; sy = 1 - 0.05 * p; break; }
      case 'fire': { const p = clamp(k / SZ.FIRE); hw = 0.12; shut = true; sw = 1.12 - 0.12 * ease.outCubic(p); sp.rotation.y = 0; y = -0.05 * (1 - p); sy = 1 + 0.08 * Math.sin(p * PI); break; }
      case 'spinWind': { const p = clamp(k / SZ.SPIN_WIND); hw = 0.12; shut = true; sw = 1 + 0.1 * p; want = 3 + p * 9; sy = 1 - 0.07 * p; break; }
      case 'spin': hw = 0.12; shut = true; sw = 1.1; want = 22; y = 0.05 + Math.abs(Math.sin(t * 30)) * 0.03; break;
      case 'dizzy': rz = Math.sin(t * 7) * 0.16; rx = Math.cos(t * 7) * 0.07; hw = 1; hr = Math.sin(t * 9) * 0.3; hy = -0.03; break;
      default: {
        rz = moving ? Math.sin(t * 5) * 0.06 : Math.sin(t * 1.3) * 0.025; y = moving ? Math.abs(Math.sin(t * 5)) * 0.025 : 0;
        sy = moving ? 1 + Math.sin(t * 10) * 0.025 : 1 + Math.sin(t * 1.6) * 0.012; sx = 1 / Math.sqrt(sy);
        hr = moving ? Math.sin(t * 5) * 0.12 : Math.sin(t * 0.9) * 0.08; hy = moving ? Math.abs(Math.sin(t * 5)) * 0.015 : Math.sin(t * 1.6) * 0.008;
      }
    }
    // the spin winds up and runs down; between spins the shell settles back to face its way (nearest whole turn)
    rate += (want - rate) * Math.min(1, dt * (want > rate ? 6 : 4));
    if (want > 0 || rate > 0.5) spinA += rate * dt; else { const tgt = Math.round(spinA / TAU) * TAU; spinA += (tgt - spinA) * Math.min(1, dt * 8); }
    hS += (hw - hS) * Math.min(1, dt * (hw > hS ? 14 : 22)); spS += (sw - spS) * Math.min(1, dt * 12);
    I.scale.set(sx, sy, sx); I.rotation.set(rx, spinA, rz); I.position.y = y;
    head.scale.setScalar(hS); head.position.set(0, 0.3 + hy * hS, 0.32 + (hS - 0.12) * 0.08); head.rotation.set(0, 0, hr);
    head.visible = hS > 0.14; lid.visible = shut || hS < 0.2;
    sp.scale.setScalar(spS);
  };
  M.animate(0, 0, false);
  return M;
}
// the spine shot's look: a pooled little spike (one shared geometry / material), a faint wake
let _spG = null, _spM = null;
function spineMesh() {
  _spG ||= paint(new THREE.ConeGeometry(0.06, 0.4, 6).rotateX(PI / 2), (p, n, o) => o.set('#f4ecd8').lerp(col('#5e7064'), clamp(0.5 - p.z * 2.2)));
  _spM ||= makeToon({ vertexColors: true, rim: 0.5, brush: 0.08 });
  const g = new THREE.Group(); const m = new THREE.Mesh(_spG, _spM); m.castShadow = false; g.add(m); return g;
}
const SPINE_LOOK = {
  start(G, s, o) {
    const m = take(G, 'sazaeSpine', spineMesh), yaw = Math.atan2(s.dx, s.dz), trail = o.trail || '#e8fff4';
    m.position.set(s.x, s.y, s.z); m.rotation.set(0, yaw, 0);
    return {
      update(dt) { m.position.set(s.x, s.y, s.z); if (Math.random() < dt * 22) puff(G.vfx.dot, s.x - s.dx * 0.2, s.y, s.z - s.dz * 0.2, { life: 0.22, size: 0.09, size1: 0.02, color: trail, alpha: 0.6, alpha1: 0 }); },
      end(s2, hit) { give(m); for (let i = 0; i < (hit ? 7 : 4); i++) puff(G.vfx.dot, s.x, s.y, s.z, { vx: rand(-1.6, 1.6), vy: rand(0.6, 2.2), vz: rand(-1.6, 1.6), life: rand(0.3, 0.5), size: 0.09, size1: 0.03, color: i % 2 ? '#f4ecd8' : trail, alpha: 1, alpha1: 0, grav: 7 }); if (hit) G.vfx.flash(V(s.x, s.y, s.z), '#fff4e0', 0.7, 0.12); },
    };
  },
};
const shutIn = st => st === 'sleep' || st === 'bristle' || st === 'fire' || st === 'spinWind' || st === 'spin';
function killTeles(rs) { for (const t of rs.teles || []) t.t = 999; if (rs.teles) rs.teles.length = 0; }
function sazaeAI(m, dt, target, d, slow) {
  const rs = m.rs, G = m.G;
  rs.t += dt; rs.bcd = (rs.bcd ?? rand(1.5, 3)) - dt;
  const go = st => { rs.st = st; rs.t = 0; act(m, st === 'up' ? 'idle' : st); };
  if ((rs.st === 'bristle' || rs.st === 'spinWind') && m.state !== 'windup') { killTeles(rs); go('up'); } // staggered out of the wind-up
  switch (rs.st) {
    case 'sleep': case 'idle': // just woken by the aggro: it pops out of its shell
      go('wake'); sfx('sazae_wake', m.pos); return false;
    case 'wake': m.faceTo(target.pos.x, target.pos.z, dt * 0.7); if (rs.t >= SZ.WAKE) go('up'); return false;
    case 'bristle':
      if (rs.t >= SZ.BRISTLE) {
        go('fire'); m.state = 'attack'; killTeles(rs); m.telegraph = null;
        const raw = Math.max(1, Math.round(roll(m) * 0.7));
        for (let i = 0; i < SZ.NSP; i++) {
          const a = rs.aim + i / SZ.NSP * TAU, dx = Math.sin(a), dz = Math.cos(a);
          bolt(m, { look: SPINE_LOOK, from: { x: m.pos.x + dx * 0.55 * m.scale, z: m.pos.z + dz * 0.55 * m.scale }, dir: { x: dx, z: dz }, speed: SZ.SP_V, range: SZ.SP_LEN - 0.5, radius: 0.32, h: 0.45, trail: m.model.variant?.trail, onHit: e => m.dealTo(e, raw, 'phys', 0.5) });
        }
        G.vfx.ring(m.lift(0.4), { color: '#f4ecd8', r0: 0.3, r1: 1.6, life: 0.3 });
        sfx('sazae_fire', m.pos);
      } else if (Math.random() < dt * 14) puff(G.vfx.dot, m.pos.x + rand(-0.5, 0.5), m.pos.y + rand(0.3, 0.9), m.pos.z + rand(-0.5, 0.5), { vy: 0.5, life: 0.4, size: 0.08, size1: 0.02, color: '#fff4e0', alpha: 0.9, alpha1: 0 });
      return false;
    case 'fire': if (rs.t >= SZ.FIRE) { go('up'); m.state = 'chase'; m.cd = rand(1.2, 1.8); } return false;
    case 'spinWind':
      m.faceTo(target.pos.x, target.pos.z, dt * 0.5);
      if (rs.t >= SZ.SPIN_WIND) { go('spin'); m.state = 'attack'; m.telegraph = null; rs.hit = false; sfx('sazae_spin', m.pos); }
      return false;
    case 'spin': {
      const dx = target.pos.x - m.pos.x, dz = target.pos.z - m.pos.z, L = Math.hypot(dx, dz) || 1;
      if (L > 0.6) m.move((rs._dir ||= new THREE.Vector3()).set(dx / L, 0, dz / L), dt, SZ.SPIN_V * slow / Math.max(0.1, m.speed));
      if (!rs.hit && playerIn(G, m.pos.x, m.pos.z, SZ.SPIN_R * 0.8)) { rs.hit = true; hitArea(m, m.pos.x, m.pos.z, SZ.SPIN_R * 0.85, Math.round(roll(m) * 1.2), 'phys', 2.2); G.engine.rig.shake(0.25); sfx('sazae_clank', m.pos); }
      if (Math.random() < dt * 26) { const a = rand(0, TAU); puff(G.vfx.dot, m.pos.x + Math.cos(a) * 0.6, m.pos.y + 0.25, m.pos.z + Math.sin(a) * 0.6, { vx: Math.cos(a + 1.4) * 3, vy: rand(0.8, 2), vz: Math.sin(a + 1.4) * 3, life: 0.35, size: rand(0.06, 0.11), size1: 0.02, color: i2c(a), alpha: 1, alpha1: 0, grav: 6 }); }
      if (Math.random() < dt * 10) G.vfx.dustRing?.(m.pos, 0.9, 5);
      if (rs.t >= SZ.SPIN_T) { go('dizzy'); m.state = 'rest'; m.restDur = SZ.DIZZY; m.emote?.('dizzy', SZ.DIZZY); sfx('sazae_dizzy', m.pos); }
      return true;
    }
    case 'dizzy': if (rs.t >= SZ.DIZZY) { go('up'); m.state = 'chase'; m.cd = rand(2.2, 3.2); } return false;
    default: {
      if (rs.st !== 'up') go('up');
      if (rs.bcd <= 0 && d > 3.2 && d < 8.5 && m.mode.los(m.pos, target.pos)) { // shut in, bristle, the star of spines
        rs.bcd = rand(6, 8);
        rs.aim = Math.atan2(target.pos.x - m.pos.x, target.pos.z - m.pos.z); m.facing = rs.aim;
        go('bristle'); m.state = 'windup'; sfx('sazae_tuck', m.pos); setTimeout(() => sfx('sazae_bristle', m.pos), 120);
        killTeles(rs); rs.teles ||= [];
        for (let i = 0; i < SZ.NSP; i++) rs.teles.push(tele(G, { shape: 'lane', x: m.pos.x, z: m.pos.z, r: 0.3, dir: rs.aim + i / SZ.NSP * TAU, len: SZ.SP_LEN, time: SZ.BRISTLE, color: '#ff6a4a' }));
        m.telegraph = rs.teles[0];
        return false;
      }
      if (d < SZ.SPIN_R - 0.3 + (target.radius || 0.3) && m.cd <= 0) { // shut in and spin
        go('spinWind'); m.state = 'windup'; sfx('sazae_tuck', m.pos);
        m.telegraph = tele(G, { x: m.pos.x, z: m.pos.z, r: SZ.SPIN_R, time: SZ.SPIN_WIND, color: '#ff5a5a' });
        return false;
      }
      if (d > 1.25 + (target.radius || 0.3)) { m.chase(target, dt, slow); return true; }
      m.faceTo(target.pos.x, target.pos.z, dt);
      return false;
    }
  }
}
const i2c = a => (Math.sin(a * 3) > 0 ? '#f4ecd8' : '#c8d8c0');
function damageTaken(m, dmg) {
  const t = m.G.engine?.time || 0, shut = shutIn(m.rs?.st);
  if (t - (m._hurtT || -9) > 0.45) { m._hurtT = t; sfx(shut ? 'sazae_clank' : 'sazae_hurt', m.pos); if (shut) m.G.vfx.sparks?.(m.lift(0.6), { n: 6, color: '#fff0c8', speed: 3, size: 0.2 }); }
  return shut ? Math.max(1, Math.round(dmg * 0.5)) : dmg;
}

export const MONSTERS = {
  sazaeOni: mdef({
    name: 'Sazae-oni', build: 'sazaeOni', scale: 1.2, radius: 0.5, vr: 0.62, speed: 1.45, pack: 0.35, material: 'stone',
    attack: { type: 'melee', range: 2, cd: 2, windup: SZ.SPIN_WIND },
    stats: { name: 'Sazae-oni', life: 1.85, dmg: 1.2, def: 1.7, speed: 0.72, xp: 1.55, element: 'phys', res: { frost: 30, fire: 10, zap: -15 } },
    variants: [
      { key: 0, shell: '#5e7a66', band: '#c8c09a', spine: '#6e8270', tip: '#ece4cc', skin: '#e8705e', horn: '#f6eedc', hair: '#4a8a4a', foot: '#8a7e72', footEdge: '#c8a898', lid: '#d8c4a4', trail: '#e8fff4' },
      { key: 1, name: 'Hotaru Sazae-oni', shell: '#34548a', band: '#7ab8d8', spine: '#4a64a0', tip: '#bff4ff', skin: '#6aa0d8', horn: '#f8f2e4', hair: '#3a8a8a', foot: '#6a7288', footEdge: '#a8b8d8', lid: '#c8d0e0', trail: '#9ff8ff', glow: true },
      { key: 2, name: 'Elder Sazae-oni', shell: '#7a6a80', band: '#d8c8d4', spine: '#887a8a', tip: '#f2eaee', skin: '#7ab070', horn: '#ece4cc', hair: '#5a8a3a', foot: '#7a7268', footEdge: '#b8aaa0', lid: '#d4c8b8', trail: '#f4f0ff', elder: true },
    ],
    ai: sazaeAI,
    update: (m, dt) => {
      if (!m.aggro) { act(m, 'sleep'); m.rs.st = 'sleep'; if (Math.random() < dt * 0.25 && playerIn(m.G, m.pos.x, m.pos.z, 14)) m.emote('zzz', 1.4); }
      if (m.model.variant?.glow && Math.random() < dt * 2.5) puff(m.G.vfx.glow, m.pos.x + rand(-0.4, 0.4), m.pos.y + rand(0.4, 1.1) * m.scale, m.pos.z + rand(-0.4, 0.4), { vy: 0.3, life: 1.0, size: 0.12, size1: 0.03, color: '#9ff8ff', alpha: 0.9, alpha1: 0 });
    },
    onSpawn: m => { m.facing = rand(0, TAU); m.rs.st = 'sleep'; act(m, 'sleep'); m.model.animate?.(0, 0, false); m.height = 1.15 * m.scale; }, // (asleep in its shell from the start)
    onDeath: m => { killTeles(m.rs); sfx('sazae_die', m.pos); m.G.vfx.dustRing(m.pos, 1.3, 12); for (let i = 0; i < 12; i++) { const a = rand(0, TAU); puff(m.G.vfx.dot, m.pos.x, m.pos.y + 0.5, m.pos.z, { vx: Math.cos(a) * rand(1, 3), vy: rand(2, 4.5), vz: Math.sin(a) * rand(1, 3), life: rand(0.6, 0.9), size: rand(0.08, 0.15), size1: 0.05, color: i % 3 ? m.model.variant?.band || '#c8c09a' : '#f4dcd2', alpha: 1, alpha1: 0.8, grav: 13, drag: 0.6 }); } },
    damageTaken,
  }),
};
export const BUILD = { sazaeOni: buildSazae };
