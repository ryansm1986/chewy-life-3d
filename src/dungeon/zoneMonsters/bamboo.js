// Bamboo Depths' own monster (docs/ZONES.md §8.2; ROADMAP Z-C2): the IWA-BŌZU, a rock monk. Built with the region monster
// kit (src/regions/monsters/bamboo.js: assemble / mdef / tele / hitArea…), registered with the region monsters
// (src/regions/monsters/index.js) so it batches, pools and tests like them. Sounds: ./bamboo.sfx.js (pure data).
//
// A round, mossy boulder with a sleepy face, stubby stone arms, a straw shimenawa belt hung with paper shide and two
// little takenoko sprouting from its moss cap. It dozes looking like any other boulder (eyes shut, a slow breath) until
// someone comes close: it WAKES ("!", a hop, eyes pop open), then trundles after you and either
//   SLAMS   (close)    both arms up, a ring telegraph, a ground thump that knocks you back;
//   ROLLS   (mid range) tucks into a ball, a lane telegraph, then barrels along it (it stops on a wall) and is dizzy.
// The slow tank among the grove's fast yokai: lots of life and armour, few to a pack (pack 0.35).
// Variants: the plain rock monk, the Lantern monk (a tiny glowing stone lantern on its head) and the Elder (white lichen
// beard, a bigger moss cap).
import * as THREE from 'three';
import { assemble, mdef, act, tele, hitArea, roll, sfx, puff, playerIn, ell, cyl, tubeC, blob, cheeks, paint, V, col, INK } from '../../regions/monsters/bamboo.js';
import { rand, clamp, TAU, ease } from '../../core/util.js';

const IW = { WAKE: 0.75, SLAM_WIND: 0.8, SLAM_R: 2.3, TUCK: 0.55, ROLL_T: 0.95, ROLL_V: 8.5, ROLL_LEN: 7.5, DIZZY: 1.1 };
const _c = new THREE.Vector3();
const nzs = (x, y, z) => Math.sin(x * 9.1 + y * 3.7) * Math.cos(z * 7.3 - x * 2.1) * 0.5 + Math.sin(x * 23 + z * 19) * 0.25;
function iwaSpec(v) {
  const stone = col(v.stone), stoneHi = col(v.stoneHi), moss = col(v.moss), mossHi = col(v.mossHi);
  const R = 0.5, H = 0.43, Y = 0.44;
  // the boulder: a lumpy sphere, a flattened seat, moss pooled on its top, lichen speckles, darker underneath
  // the boulder: a lumpy sphere on a flattened seat, warm grey stone in big patches with a few cracks, a moss cap on top
  // (tongues of it running down), lichen speckles, darker underneath
  const bump = q => {
    const b = 1 + 0.08 * Math.sin(q.x * 4.1 + 1.2) * Math.cos(q.z * 3.3) + 0.06 * Math.sin(q.y * 5 + q.x * 2.6) + 0.04 * Math.sin(q.z * 7 - q.y * 4);
    let y = q.y * H * b + Y; if (y < 0.07) y = 0.07 - (0.07 - y) * 0.15;
    return q.set(q.x * R * b, y, q.z * R * 0.94 * b);
  };
  const lichen = col('#dcdca8'), crackC = col(v.foot);
  const body = [blob(28, 20, bump, (p, n, o) => {
    const pa = nzs(p.x * 0.7 + 3, p.y * 0.7, p.z * 0.7);
    o.copy(stone).lerp(stoneHi, clamp(n.y * 0.45 + 0.3 + pa * 0.5)).multiplyScalar(0.9 + 0.1 * nzs(p.x * 3, p.y * 3, p.z * 3));
    const cr = Math.abs(Math.sin(Math.atan2(p.x, p.z) * 2.5 + p.y * 7 + 1.3) * 0.6 + nzs(p.x * 4, p.y * 2, p.z * 4) * 0.25);
    if (cr < 0.035 && n.y < 0.5) o.lerp(crackC, 0.75).multiplyScalar(0.7);
    const m = n.y + nzs(p.x * 2.2, p.y, p.z * 2.2) * 0.32 + Math.max(0, Math.sin(Math.atan2(p.x, p.z) * 5 + 0.7)) * 0.14 - (v.elder ? 0.32 : 0.46);
    if (m > 0.16) o.copy(moss).lerp(mossHi, clamp((m - 0.16) * 2.4) * 0.65).multiplyScalar(0.92 + 0.12 * nzs(p.x * 6, p.y * 6, p.z * 6));
    else if (m > 0.08) o.lerp(moss, 0.5);
    if (n.y < -0.25) o.multiplyScalar(0.76);
    if (Math.sin(p.x * 61) * Math.sin(p.z * 57 + p.y * 30) > 0.93 && m < 0.08) o.lerp(lichen, 0.65);
  })];
  // feet
  for (const k of [-1, 1]) body.push(ell(0.13, 0.07, 0.15, v.foot, [k * 0.2, 0.045, 0.14], [0, k * 0.2, 0], 10));
  // the shimenawa belt (a twisted straw rope, slightly tilted) and three zigzag shide papers hanging at the front
  { const pts = []; for (let i = 0; i <= 28; i++) { const a = i / 28 * TAU, x = Math.sin(a) * R * 1.0, z = Math.cos(a) * R * 0.95; pts.push([x, 0.3 + Math.sin(a) * 0.03 + Math.cos(a) * 0.02, z, 0.034]); } body.push(tubeC(pts, (p, n, o) => o.set('#e4cc8c').multiplyScalar(0.8 + 0.2 * Math.max(0, Math.sin(Math.atan2(p.z, p.x) * 30 + p.y * 90))), 6, false)); }
  // (single-sided paper planes in the body: the inverted-hull ink only shows from behind, so the zigzags stay crisp
  // without a part of their own; the model is 4 parts = 8 instanced batches a variant, ROADMAP Z-B2)
  for (const k of [-1, 0, 1]) {
    const yaw = k * 0.36, cx = Math.sin(yaw) * 0.5, cz = Math.cos(yaw) * 0.475;
    for (let j = 0; j < 3; j++) {
      const g = new THREE.PlaneGeometry(0.036, 0.052); g.translate(j % 2 ? 0.018 : -0.018, 0.265 - j * 0.05, 0.016 + j * 0.007); // (a lightning zigzag)
      g.rotateY(yaw); g.translate(cx, 0, cz - 0.005); body.push(paint(g, (p, n, o) => o.set('#fffaf0')));
    }
  }
  // the crown: two takenoko sprouts and a fern leaf (or the lantern monk's little toro, the elder's lichen beard)
  if (v.lantern) {
    // a little stone toro sat in the moss: base, short post, platform, a glowing fire box, a wide hip roof and a knob
    const ly = Y + H * 0.94;
    body.push(cyl(0.11, 0.13, 0.05, '#aaa498', [0, ly + 0.02, 0], [0, 0, 0], 8), cyl(0.06, 0.07, 0.08, '#b6b0a4', [0, ly + 0.085, 0], [0, 0, 0], 8), cyl(0.12, 0.08, 0.045, '#a09a8e', [0, ly + 0.145, 0], [0, 0, 0], 8));
    body.push(paint(new THREE.BoxGeometry(0.11, 0.13, 0.11).translate(0, ly + 0.235, 0), (p, n, o) => o.set('#ffd84a')));
    for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) body.push(cyl(0.014, 0.014, 0.13, '#948e82', [x * 0.058, ly + 0.235, z * 0.058], [0, 0, 0], 5));
    body.push(paint(new THREE.ConeGeometry(0.16, 0.09, 4).rotateY(Math.PI / 4).translate(0, ly + 0.345, 0), (p, n, o) => o.set('#8c8478').multiplyScalar(n.y > 0.9 ? 1 : 0.9 + 0.1 * n.y)));
    body.push(ell(0.032, 0.036, 0.032, '#9a9286', [0, ly + 0.405, 0], [0, 0, 0], 8));
  } else if (!v.elder) {
    for (const [x, z, h, r, c] of [[0.08, -0.06, 0.2, 0.06, '#b0844e'], [-0.12, 0.05, 0.14, 0.045, '#9c7444']]) {
      const s = new THREE.ConeGeometry(r, h, 8); s.translate(x, Y + H * 0.95 + h / 2, z);
      body.push(paint(s, (p, n, o) => o.set(c).lerp(col('#c8cc66'), clamp((p.y - Y - H * 0.95) / h * 1.6 - 0.5)).multiplyScalar(0.86 + 0.2 * clamp(n.y + 0.4))));
    }
    for (const k of [-1, 1]) body.push(ell(0.09, 0.015, 0.035, '#6aa848', [0.02 + k * 0.07, Y + H * 1.02, -0.02], [0, 0.6, k * 0.5], 8));
  }
  if (v.elder) { // white lichen hanging at its temples like an old monk's side-locks, a little cairn on its head
    for (const k of [-1, 1]) for (let i = 0; i < 3; i++) { const a = k * (0.95 + i * 0.16); body.push(ell(0.03, 0.12 - i * 0.02, 0.022, '#eeeede', [Math.sin(a) * 0.5, 0.5 - i * 0.03, Math.cos(a) * 0.46], [0, a, k * 0.12], 8)); }
    body.push(ell(0.1, 0.05, 0.085, '#b4ac9e', [0.04, Y + H * 1.01, -0.04], [0, 0.4, 0.05], 10), ell(0.065, 0.04, 0.055, '#c4bcae', [0.03, Y + H * 1.01 + 0.075, -0.04], [0, 1.1, -0.06], 10));
  }
  // the face: open eyes (big, round, stone-heavy brows), the dozing lids, a little smile, blush
  // the face: open eyes and stone brows in the body; the 'lids' part (shown while it dozes) caps each eye in stone with a
  // sleepy closed line, so no separate eyes part is needed
  const eyes = [], lids = [], lidC = col(v.stone).lerp(col(v.stoneHi), 0.3).multiplyScalar(0.92);
  for (const k of [-1, 1]) {
    eyes.push(ell(0.068, 0.078, 0.03, INK, [k * 0.15, 0.53, 0.44], [0, k * 0.32, 0], 12));
    eyes.push(ell(0.024, 0.026, 0.014, '#ffffff', [k * 0.15 - 0.02, 0.56, 0.465], [0, 0, 0], 8), ell(0.011, 0.011, 0.01, '#ffffff', [k * 0.15 + 0.02, 0.5, 0.465], [0, 0, 0], 6));
    lids.push(ell(0.084, 0.094, 0.024, lidC, [k * 0.15, 0.53, 0.468], [0, k * 0.32, 0], 12));
    lids.push(tubeC([[k * 0.085, 0.53, 0.487, 0.012], [k * 0.15, 0.51, 0.5, 0.013], [k * 0.215, 0.53, 0.483, 0.012]], INK, 4));
    const brow = [[k * 0.08, 0.64, 0.43, 0.04], [k * 0.15, 0.66, 0.44, 0.045], [k * 0.23, 0.63, 0.4, 0.035]];
    eyes.push(tubeC(brow, v.elder ? '#eeeee0' : v.stoneHi, 7));
  }
  const face = [ell(0.04, 0.026, 0.02, INK, [0, 0.43, 0.468], [-0.2, 0, 0], 10), ell(0.024, 0.012, 0.012, '#ff8a9a', [0, 0.418, 0.478], [-0.2, 0, 0], 8), ...cheeks(0.465, 0.445, 0.25, 1.1)]; // (a small round "oh" mouth)
  // stubby stone arms with round fists (their own parts: they swing for the slam)
  const arm = k => [tubeC([[0, 0, 0, 0.075], [k * 0.08, -0.12, 0.06, 0.07], [k * 0.1, -0.22, 0.12, 0.06]], v.stone, 7), ell(0.085, 0.08, 0.085, v.stoneHi, [k * 0.1, -0.26, 0.14], [0, 0, 0], 10)];
  const glow = v.lantern ? 'outgoingLight += diffuseColor.rgb * 0.9 * step(0.9, diffuseColor.r) * step(0.6, diffuseColor.g) * step(diffuseColor.b, 0.45);' : '';
  return { mat: { fragOut: glow }, outline: 0.02, parts: [
    { name: 'body', geo: [...body, ...face, ...eyes] },
    { name: 'lids', geo: lids, outline: 0 }, // (no ink ring: a lid, not goggles)
    { name: 'armL', geo: arm(1), at: [0.42, 0.5, 0.06] }, { name: 'armR', geo: arm(-1), at: [-0.42, 0.5, 0.06] },
  ] };
}
function buildIwa(v) {
  const M = assemble('iwabozu:' + v.key, () => iwaSpec(v));
  const I = M.inner, lids = M.g.lids, aL = M.g.armL, aR = M.g.armR;
  let rollA = 0, hop = 0, armK = 1;
  M.variant = v;
  M.animate = (dt, t, moving) => {
    const a = M.act, k = (M.actT += dt);
    let y = 0, sx = 1, sy = 1, rx = 0, rz = 0, al = 0, ar = 0, alz = 0.2, arz = -0.2;
    const shut = a === 'sleep';
    lids.visible = shut;
    switch (a) {
      case 'sleep': sy = 1 + Math.sin(t * 1.6) * 0.025; sx = 1 / Math.sqrt(sy); al = ar = 0.5; alz = 0.5; arz = -0.5; break;
      case 'wake': { const p = clamp(k / IW.WAKE); y = Math.sin(clamp(p * 1.6) * Math.PI) * 0.35; sy = 1 + Math.sin(p * Math.PI * 2) * 0.12; sx = 1 / Math.sqrt(sy); al = ar = -1.2 * Math.sin(p * Math.PI); alz = 0.6; arz = -0.6; break; }
      case 'slamWind': { const p = ease.outCubic(clamp(k / IW.SLAM_WIND)); al = ar = -2.6 * p; rx = -0.2 * p; sy = 1 + 0.08 * p; sx = 1 - 0.04 * p; alz = 0.15; arz = -0.15; break; }
      case 'slam': { const p = clamp(k / 0.18); al = ar = -2.6 + 3.4 * ease.inQuad(p); rx = 0.25 * p; sy = 1 - 0.16 * Math.sin(Math.min(1, k / 0.35) * Math.PI); sx = 1 / Math.sqrt(sy); break; }
      case 'tuck': { const p = ease.outCubic(clamp(k / IW.TUCK)); sy = 1 - 0.14 * p; sx = 1 + 0.06 * p; al = ar = -0.4 * p; rollA += dt * 4 * p; rx = rollA; break; }
      case 'roll': rollA += dt * 16; rx = rollA; al = ar = -0.4; sy = 0.86; sx = 1.06; break;
      case 'dizzy': rz = Math.sin(t * 7) * 0.16; rx = Math.cos(t * 7) * 0.08; al = 0.3 * Math.sin(t * 5); ar = -al; break;
      default: {
        hop = (hop + dt * (moving ? 2.4 : 0.6)) % 1;
        rz = moving ? Math.sin(hop * TAU) * 0.13 : Math.sin(t * 1.3) * 0.03; y = moving ? Math.abs(Math.sin(hop * TAU)) * 0.06 : 0;
        al = moving ? Math.sin(hop * TAU) * 0.5 : 0.1; ar = moving ? -Math.sin(hop * TAU) * 0.5 : 0.1;
      }
    }
    if (a !== 'roll' && a !== 'tuck') { const tgt = Math.round(rollA / TAU) * TAU; rollA += (tgt - rollA) * Math.min(1, dt * 9); if (a !== 'slamWind' && a !== 'slam' && a !== 'dizzy') rx = rollA; }
    // (rolls and wobbles turn about the boulder's middle, not its feet)
    I.scale.set(sx, sy, sx); I.rotation.set(rx, 0, rz);
    _c.set(0, 0.44 * sy, 0).applyEuler(I.rotation);
    I.position.set(-_c.x, 0.44 * sy - _c.y + y + (a === 'roll' || a === 'tuck' ? 0.04 : 0), -_c.z);
    armK += ((a === 'roll' || a === 'tuck' ? 0.3 : 1) - armK) * Math.min(1, dt * 12); // (arms pulled into the boulder to roll)
    aL.rotation.set(al, 0, alz); aR.rotation.set(ar, 0, arz); aL.scale.setScalar(armK); aR.scale.setScalar(armK);
  };
  M.animate(0, 0, false);
  return M;
}
function iwaAI(m, dt, target, d, slow) {
  const rs = m.rs, G = m.G;
  rs.t += dt; rs.rcd = (rs.rcd ?? rand(1.5, 3)) - dt;
  const go = st => { rs.st = st; rs.t = 0; act(m, st === 'up' ? 'idle' : st); };
  if ((rs.st === 'slamWind' || rs.st === 'tuck') && m.state !== 'windup') go('up'); // staggered out of the wind-up
  switch (rs.st) {
    case 'sleep': case 'idle': // just woken by the aggro: the "!" and a hop
      go('wake'); sfx('iwabozu_wake', m.pos); return false; // (Monster.alert() already showed the "!")
    case 'wake': m.faceTo(target.pos.x, target.pos.z, dt * 0.6); if (rs.t >= IW.WAKE) go('up'); return false;
    case 'slamWind':
      m.faceTo(target.pos.x, target.pos.z, dt * 0.4);
      if (rs.t >= IW.SLAM_WIND) {
        go('slam'); m.state = 'attack'; m.telegraph = null;
        const fx = m.pos.x + Math.sin(m.facing) * 0.5, fz = m.pos.z + Math.cos(m.facing) * 0.5;
        hitArea(m, fx, fz, IW.SLAM_R, Math.round(roll(m) * 1.25), 'phys', 2.0);
        G.vfx.dustRing(V(fx, m.pos.y, fz), IW.SLAM_R, 18); G.vfx.ring(V(fx, m.pos.y, fz), { color: '#d8e8b0', r0: 0.3, r1: IW.SLAM_R * 1.1, life: 0.4 });
        for (let i = 0; i < 12; i++) { const a = rand(0, TAU), s = rand(1.5, 3.5); puff(G.vfx.dot, fx, m.pos.y + 0.15, fz, { vx: Math.cos(a) * s, vy: rand(2.5, 5), vz: Math.sin(a) * s, life: rand(0.5, 0.8), size: rand(0.08, 0.15), size1: 0.05, color: i % 3 ? '#8a8a7a' : '#7aa850', alpha: 1, alpha1: 0.8, grav: 14, drag: 0.8 }); }
        if (playerIn(G, fx, fz, 6)) G.engine.rig.shake(0.35);
        sfx('iwabozu_slam', m.pos);
      }
      return false;
    case 'slam': if (rs.t >= 0.5) { go('up'); m.state = 'chase'; m.cd = rand(1.6, 2.2); } return false;
    case 'tuck':
      if (rs.t >= IW.TUCK) { go('roll'); m.state = 'attack'; m.telegraph = null; rs.hit = false; sfx('iwabozu_roll', m.pos); }
      return false;
    case 'roll': {
      const dir = rs.dir, sp = IW.ROLL_V * slow;
      const px = m.pos.x, pz = m.pos.z;
      m.move(dir, dt, sp / Math.max(0.1, m.speed));
      const moved = Math.hypot(m.pos.x - px, m.pos.z - pz);
      if (!rs.hit && playerIn(G, m.pos.x, m.pos.z, m.bodyR + 0.2)) { rs.hit = true; hitArea(m, m.pos.x, m.pos.z, m.bodyR + 0.4, Math.round(roll(m) * 1.4), 'phys', 2.6); G.engine.rig.shake(0.3); sfx('iwabozu_slam', m.pos); }
      if (Math.random() < dt * 20) puff(G.vfx.smoke, m.pos.x, m.pos.y + 0.1, m.pos.z, { vx: rand(-0.4, 0.4), vy: rand(0.2, 0.5), vz: rand(-0.4, 0.4), life: 0.6, size: 0.35, size1: 0.8, color: '#c8c0a8', alpha: 0.45, alpha1: 0, drag: 2 });
      if (rs.t >= IW.ROLL_T || moved < sp * dt * 0.25) { go('dizzy'); m.state = 'rest'; m.restDur = IW.DIZZY; G.vfx.dustRing(m.pos, 1.2, 10); if (moved < sp * dt * 0.25) sfx('iwabozu_thud', m.pos); }
      return true;
    }
    case 'dizzy': if (rs.t >= IW.DIZZY) { go('up'); m.state = 'chase'; m.cd = rand(0.8, 1.3); } return false;
    default: {
      if (rs.st !== 'up') go('up');
      if (rs.rcd <= 0 && d > 3.6 && d < 9 && m.mode.los(m.pos, target.pos)) { // tuck and roll down a locked lane
        rs.rcd = rand(5, 7);
        const a = Math.atan2(target.pos.x - m.pos.x, target.pos.z - m.pos.z); m.facing = a;
        rs.dir = (rs._dir ||= new THREE.Vector3()).set(Math.sin(a), 0, Math.cos(a));
        go('tuck'); m.state = 'windup';
        m.telegraph = tele(G, { shape: 'lane', x: m.pos.x, z: m.pos.z, r: m.bodyR + 0.15, dir: a, len: IW.ROLL_LEN, time: IW.TUCK, color: '#ff6a4a' });
        sfx('iwabozu_tuck', m.pos);
        return false;
      }
      if (d < IW.SLAM_R - 0.2 + (target.radius || 0.3) && m.cd <= 0) {
        go('slamWind'); m.state = 'windup';
        m.telegraph = tele(G, { x: m.pos.x + Math.sin(m.facing) * 0.5, z: m.pos.z + Math.cos(m.facing) * 0.5, r: IW.SLAM_R, time: IW.SLAM_WIND, color: '#ff5a5a' });
        sfx('iwabozu_wind', m.pos);
        return false;
      }
      if (d > 1.2 + (target.radius || 0.3)) { m.chase(target, dt, slow); return true; }
      m.faceTo(target.pos.x, target.pos.z, dt);
      return false;
    }
  }
}
const hurt = (name, gap = 0.5) => (m, dmg) => { const t = m.G.engine.time || 0; if (t - (m._hurtT || -9) > gap) { m._hurtT = t; sfx(name, m.pos); } return dmg; };

export const MONSTERS = {
  iwabozu: mdef({
    name: 'Iwa-bōzu', build: 'iwabozu', scale: 1.25, radius: 0.5, vr: 0.62, speed: 1.55, pack: 0.35, material: 'stone',
    attack: { type: 'melee', range: 2, cd: 2, windup: IW.SLAM_WIND },
    stats: { name: 'Iwa-bōzu', life: 1.9, dmg: 1.25, def: 1.6, speed: 0.75, xp: 1.55, element: 'phys', res: { fire: 20, frost: 20, zap: -15 } },
    variants: [
      { key: 0, stone: '#a0968a', stoneHi: '#cbbfae', moss: '#6a9a3c', mossHi: '#a6c860', foot: '#6e665c' },
      { key: 1, name: 'Lantern Iwa-bōzu', stone: '#a89c8e', stoneHi: '#d2c6b2', moss: '#729e42', mossHi: '#b0cc68', foot: '#766c60', lantern: true },
      { key: 2, name: 'Elder Iwa-bōzu', stone: '#968e86', stoneHi: '#c4bab0', moss: '#5a8a3a', mossHi: '#98c05c', foot: '#665e56', elder: true },
    ],
    ai: iwaAI,
    update: (m, dt) => {
      if (!m.aggro) { act(m, 'sleep'); m.rs.st = 'sleep'; if (Math.random() < dt * 0.25 && playerIn(m.G, m.pos.x, m.pos.z, 14)) m.emote('zzz', 1.4); }
      if (m.model.variant?.lantern && Math.random() < dt * 2) puff(m.G.vfx.glow, m.pos.x, m.pos.y + 1.15 * m.scale, m.pos.z, { vy: 0.4, life: 0.8, size: 0.2, size1: 0.05, color: '#ffc87a', alpha: 0.9, alpha1: 0 });
    },
    onSpawn: m => { m.facing = rand(0, TAU); m.rs.st = 'sleep'; act(m, 'sleep'); m.model.animate?.(0, 0, false); }, // (asleep from the start: far, LOD-sleeping monks keep their eyes shut)
    onDeath: m => { sfx('iwabozu_die', m.pos); m.G.vfx.dustRing(m.pos, 1.4, 14); for (let i = 0; i < 10; i++) { const a = rand(0, TAU); puff(m.G.vfx.dot, m.pos.x, m.pos.y + 0.5, m.pos.z, { vx: Math.cos(a) * rand(1, 3), vy: rand(2, 4.5), vz: Math.sin(a) * rand(1, 3), life: rand(0.6, 0.9), size: rand(0.1, 0.18), size1: 0.06, color: i % 2 ? '#9a9a8c' : '#6a9a4a', alpha: 1, alpha1: 0.8, grav: 13, drag: 0.6 }); } },
    damageTaken: hurt('iwabozu_hurt'),
  }),
};
export const BUILD = { iwabozu: buildIwa };
