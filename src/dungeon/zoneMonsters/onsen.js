// Onsen Caverns' own monster (docs/ZONES.md §8.2; ROADMAP Z-C2): the AKANAME, the bath-licking yokai. Built with the
// region monster kit (src/regions/monsters/bamboo.js: assemble / mdef / tele / hitArea…), registered with the region
// monsters (src/regions/monsters/index.js) so it batches, pools and tests like them. Sounds: ./onsen.sfx.js (pure data).
//
// A chubby little red imp who haunts old bathhouses and licks the tubs clean: a big round head with a shock of black hair
// and two nub horns, a white tenugui folded on top, huge eyes, a wide grin with a long pink tongue lolling out, a round
// belly, stubby clawed feet and a tawashi scrub brush in one fist. It is warm-blooded among the snow folk (steam curls
// off its head; fire hardly hurts it, frost does), and it is the GRABBER of the zone's packs:
//   LICK     (mid range) it squats, sucks its tongue in (a narrow lane telegraph), then lashes it out along the lane up to
//            6.5 m; caught, you're slobbered (a short slow) and YANKED toward it, into the pack. Afterwards it pants, tongue
//            hanging out (the moment to hit it).
//   STEAM    (close) it puffs up, steam whistling out of its ears (a ring telegraph), then bursts in a scalding cloud of
//            bath steam (fire) that shoves you back.
// It scurries fast and is a little fragile: fodder that pulls you out of position, not a wall.
// Variants: the plain Akaname (red, a white tenugui), the Yuzu Akaname (orange-red, a yuzu on its towel, a blue towel) and
// the Elder Akaname (deep crimson, white brows and beard, a hachimaki tied round its head).
import * as THREE from 'three';
import { assemble, mdef, act, tele, hitArea, roll, sfx, puff, playerIn, ell, cyl, tubeC, blob, cheeks, paint, cone, eyesCute, V, col, INK } from '../../regions/monsters/bamboo.js';
import { rand, clamp, TAU, ease } from '../../core/util.js';

const AK = { LICK_WIND: 0.62, LICK_OUT: 0.14, LICK_HOLD: 0.1, LICK_BACK: 0.18, LICK_LEN: 6.5, LICK_R: 0.42, PANT: 0.95, STEAM_WIND: 0.7, STEAM_R: 2.1, YANK: 7.5 };
const TC = { lick: '#ff3f7a', steam: '#ff7a2a' };
const TONGUE = 1, TL = 0.17; // the tongue part's scale at rest; its geometry's length along +z (the lash scales z to its reach)
const _d = new THREE.Vector3();
const nzs = (x, y, z) => Math.sin(x * 9.1 + y * 3.7) * Math.cos(z * 7.3 - x * 2.1) * 0.5 + Math.sin(x * 23 + z * 19) * 0.25;

function akaSpec(v) {
  const skin = col(v.skin), skinHi = col(v.skinHi), belly = col(v.belly);
  const HY = 0.66, HR = 0.25; // head centre / radius
  const faceZ = (x, y) => Math.sqrt(Math.max(0, HR * HR - x * x - ((y - HY) / 0.94) ** 2)) * 0.96 + 0.015;
  const B = [];
  // the round belly-body (a pear), the pale belly patch, darker underneath
  B.push(blob(22, 16, q => { const b = 1 + 0.04 * Math.sin(q.x * 5 + 1) * Math.cos(q.z * 4); let y = q.y * 0.2 * b + 0.25; if (y < 0.06) y = 0.06 - (0.06 - y) * 0.2; return q.set(q.x * 0.24 * b * (1 + 0.12 * clamp(0.3 - q.y)), y, q.z * 0.23 * b); }, (p, n, o) => {
    o.copy(skin).lerp(skinHi, clamp(n.y * 0.4 + 0.35 + nzs(p.x * 2, p.y * 2, p.z * 2) * 0.15));
    const bz = n.z - 0.55 + Math.abs(n.x) * 0.3; if (bz > 0 && p.y < 0.36) o.lerp(belly, clamp(bz * 4) * 0.85);
    if (n.y < -0.3) o.multiplyScalar(0.78);
  }));
  // stubby legs with two-clawed feet
  for (const k of [-1, 1]) {
    B.push(ell(0.075, 0.07, 0.085, v.skin, [k * 0.11, 0.07, 0.02], [0, 0, 0], 10));
    B.push(ell(0.08, 0.045, 0.11, v.skinHi, [k * 0.12, 0.035, 0.07], [0, k * 0.18, 0], 10));
    for (const c of [-1, 1]) B.push(cone(0.022, 0.05, '#fff4e6', [k * 0.12 + c * 0.03, 0.03, 0.18], [Math.PI / 2, 0, 0], 6));
  }
  // the big head
  B.push(ell(HR, HR * 0.94, HR * 0.96, v.skin, [0, HY, 0.0], [0, 0, 0], 22));
  // two nub horns, ivory, poking out of the hair
  for (const k of [-1, 1]) { B.push(cone(0.045, 0.13, '#f6ead4', [k * 0.165, HY + 0.2, 0.05], [0.2, 0, -k * 0.75], 8)); B.push(ell(0.05, 0.02, 0.05, v.skin, [k * 0.15, HY + 0.17, 0.05], [0.2, 0, -k * 0.75], 8)); }
  // a shock of wild black hair on the crown (lumpy tufts), a ragged fringe
  const hair = col(v.hair), hairHi = col(v.hairHi);
  for (let i = 0; i < 7; i++) { // (a few wild tufts sticking up and back: the shock of hair, not a helmet)
    const a = i / 7 * TAU + 0.5, r = 0.07 + (i % 3) * 0.025, x = Math.cos(a) * r, z = Math.sin(a) * r * 0.8 - 0.06, h = 0.09 + (i % 2) * 0.05;
    B.push(paint(new THREE.ConeGeometry(0.06, h, 7).rotateX(z * 2.4 - 0.15).rotateZ(-x * 2.6).translate(x * 1.05, HY + HR * 0.9 + h * 0.3, z), (p, n, o) => o.copy(hair).lerp(hairHi, clamp(n.y) * 0.45)));
  }
  B.push(ell(HR * 0.82, HR * 0.34, HR * 0.8, v.hair, [0, HY + HR * 0.76, -0.04], [-0.15, 0, 0], 16));
  for (const k of [-1.5, -0.5, 0.5, 1.5]) B.push(cone(0.032, 0.07, v.hair, [k * 0.05, HY + 0.2, faceZ(k * 0.05, HY + 0.2) - 0.03], [Math.PI * 0.86, 0, k * 0.2], 6));
  // the towel on top: a folded white (or blue) tenugui with two stripes, sat a little crooked; the yuzu's fruit on it
  if (!v.hachimaki) {
    const tw = new THREE.BoxGeometry(0.3, 0.032, 0.21, 6, 1, 4); tw.rotateY(0.25); tw.rotateZ(0.1); tw.translate(0.02, HY + HR * 1.08, -0.02);
    { const P = tw.attributes.position; for (let i = 0; i < P.count; i++) { const x = P.getX(i) - 0.02, z = P.getZ(i) + 0.02; P.setY(i, P.getY(i) - (x * x + z * z) * 1.6); } tw.computeVertexNormals(); }
    B.push(paint(tw, (p, n, o) => { o.set(v.towel); const sx = (p.x - 0.02) * Math.cos(0.25) - (p.z + 0.01) * Math.sin(0.25); if (Math.abs(Math.abs(sx) - 0.08) < 0.014) o.set(v.stripe); if (n.y < 0.3) o.multiplyScalar(0.86); }));
    if (v.yuzu) { B.push(blob(12, 9, q => q.multiplyScalar(0.07 * (1 + 0.04 * Math.sin(q.x * 9 + q.y * 7))), (p, n, o) => o.set('#ffc81e').lerp(col('#ffe46a'), clamp(n.y * 0.5 + 0.3)))); B[B.length - 1].translate(0.03, HY + HR * 1.1 + 0.08, 0.0); B.push(ell(0.035, 0.008, 0.018, '#5aa040', [0.05, HY + HR * 1.1 + 0.15, -0.01], [0, 0.6, 0.3], 6)); }
  } else { // the elder's hachimaki: a white band round the brow, knotted at the side with two tails
    B.push(paint(new THREE.TorusGeometry(HR * 0.99, 0.028, 6, 26).rotateX(Math.PI / 2).rotateZ(0.06).translate(0, HY + 0.1, 0), (p, n, o) => o.set('#f8f4ec')));
    B.push(ell(0.04, 0.035, 0.03, '#f8f4ec', [HR * 0.92, HY + 0.12, 0.05], [0, 0, 0], 8), ell(0.06, 0.018, 0.012, '#f8f4ec', [HR * 1.02, HY + 0.08, 0.08], [0, 0.4, -0.6], 6), ell(0.055, 0.016, 0.012, '#f8f4ec', [HR * 1.0, HY + 0.04, 0.03], [0, -0.3, -1.0], 6));
  }
  // the face: huge eyes (big glints), the elder's bushy white brows, a wide open grin (dark mouth, a pink inside), blush
  const ey = HY + 0.035, ex = 0.098;
  B.push(...eyesCute(ey, faceZ(ex, ey) - 0.03, ex, 1.3, { seg: 12, yaw: 0.42 })); // (sunk well in: a proud eye's ink hull rings it like goggles)
  if (v.elder) for (const k of [-1, 1]) B.push(tubeC([[k * 0.04, ey + 0.12, faceZ(k * 0.04, ey + 0.12) + 0.002, 0.022], [k * 0.1, ey + 0.135, faceZ(k * 0.1, ey + 0.135), 0.026], [k * 0.165, ey + 0.11, faceZ(k * 0.165, ey + 0.11) - 0.02, 0.018]], '#f4f2ec', 6));
  // the grin: a wide crescent (dark mouth, a pink inside), up-turned corners, two little fangs
  const my = HY - 0.12, gw = 0.11;
  { const sh = new THREE.Shape(); sh.moveTo(-gw, 0.012); sh.quadraticCurveTo(0, -0.12, gw, 0.012); sh.quadraticCurveTo(0, -0.03, -gw, 0.012);
    const gg = new THREE.ShapeGeometry(sh, 10), P0 = gg.attributes.position; for (let i = 0; i < P0.count; i++) { const x = P0.getX(i), y = P0.getY(i) + my; P0.setXYZ(i, x, y, faceZ(x, y) + 0.004); } gg.computeVertexNormals();
    B.push(paint(gg, (p, n, o) => o.set(p.y < my - 0.045 ? '#c84a64' : '#4a1424'))); }
  for (const k of [-1, 1]) B.push(cone(0.011, 0.028, '#ffffff', [k * 0.05, my - 0.012, faceZ(k * 0.05, my - 0.012) + 0.002], [Math.PI, 0, 0], 5)); // two little fangs
  B.push(...cheeks(HY - 0.07, faceZ(0.15, HY - 0.07) - 0.008, 0.15, 1.15, v.blush));
  if (v.elder) B.push(paint(new THREE.ConeGeometry(0.07, 0.16, 8).rotateX(Math.PI + 0.35).translate(0, my - 0.11, faceZ(0, my - 0.06) - 0.02), (p, n, o) => o.set('#f4f2ec').lerp(col('#d8d4cc'), clamp(-n.y) * 0.5))); // a white tuft of beard
  // the tongue (its own part: it lashes): a long, flat pink tongue with a darker groove down the middle and a round tip,
  // 1 long along +z (the part scales z to its length); at rest it lolls out of the grin
  // (its natural size is the lolling rest pose, so the round tip stays round; the lash stretches it into a long ribbon)
  const tPaint = (p, n, o) => { o.set('#ff6e92').lerp(col('#ffb4c4'), clamp(n.y * 0.5 + 0.3)); if (Math.abs(p.x) < 0.008 && n.y > 0.5) o.set('#e04a70'); };
  const tg = [tubeC([[0, 0, 0, 0.03], [0, -0.004, TL * 0.4, 0.04], [0, -0.002, TL * 0.82, 0.045]], tPaint, 8, false), blob(12, 8, q => q.set(q.x * 0.046, q.y * 0.045, q.z * 0.05 + TL * 0.86), tPaint)];
  for (const g2 of tg) g2.scale(1.45, 0.5, 1); // (a broad, flat tongue with a round tip)
  // stubby arms; the right fist holds a tawashi (a brown palm-fibre scrub brush)
  const arm = k => {
    const out = [tubeC([[0, 0, 0, 0.055], [k * 0.05, -0.07, 0.03, 0.05], [k * 0.07, -0.14, 0.06, 0.045]], v.skin, 8), ell(0.06, 0.055, 0.06, v.skinHi, [k * 0.075, -0.18, 0.075], [0, 0, 0], 10)];
    for (const c of [-1, 0, 1]) out.push(cone(0.014, 0.035, '#fff4e6', [k * 0.075 + c * 0.025, -0.225, 0.11], [Math.PI * 0.85, 0, 0], 5));
    if (k < 0) { // (the right arm: local -x is its outside)
      out.push(paint(new THREE.CylinderGeometry(0.07, 0.065, 0.12, 9).rotateZ(Math.PI / 2).translate(k * 0.075, -0.2, 0.15), (p, n, o) => o.set('#8a5a32').lerp(col('#b88050'), clamp(Math.sin(p.x * 120) * 0.5 + 0.5) * 0.5)));
      out.push(paint(new THREE.TorusGeometry(0.058, 0.012, 4, 10).rotateY(Math.PI / 2).translate(k * 0.075, -0.2, 0.15), (p, n, o) => o.set('#e8d4a0')));
    }
    return out;
  };
  return { outline: 0.019, parts: [
    { name: 'body', geo: B },
    { name: 'tongue', geo: tg, at: [0.02, my - 0.04, faceZ(0, my - 0.04) - 0.03], outline: 0.008 },
    { name: 'armL', geo: arm(1), at: [0.22, 0.34, 0.03] }, { name: 'armR', geo: arm(-1), at: [-0.22, 0.34, 0.03] },
  ] };
}
function buildAka(v) {
  const M = assemble('akaname:' + v.key, () => akaSpec(v));
  const I = M.inner, Tg = M.g.tongue, aL = M.g.armL, aR = M.g.armR;
  let hop = 0;
  M.variant = v; M.tongueLen = TONGUE; // (the AI sets tongueLen during a lick; animate eases toward it otherwise)
  M.animate = (dt, t, moving) => {
    const a = M.act, k = (M.actT += dt);
    let y = 0, sx = 1, sy = 1, rx = 0, rz = 0, al = -0.1, ar = -0.1, alz = 0.35, arz = -0.35, tl = TONGUE + Math.sin(t * 3.1) * 0.08, tx = 0.42 + Math.sin(t * 2.3) * 0.06, ty = 0.3 + Math.sin(t * 2.7) * 0.12;
    switch (a) {
      case 'lickWind': { const p = ease.outCubic(clamp(k / AK.LICK_WIND)); sy = 1 - 0.14 * p; sx = 1 + 0.06 * p; rx = -0.22 * p; al = ar = 0.5 * p; alz = 0.8; arz = -0.8; tl = TONGUE * (1 - p * 0.9); rz = Math.sin(t * 40) * 0.025 * p; break; }
      case 'lick': { tl = M.tongueLen; tx = -0.04; ty = 0; rx = 0.18; sy = 1.06; sx = 0.97; al = ar = -0.6; alz = 0.9; arz = -0.9; break; }
      case 'pant': { tl = 2.0 + Math.sin(t * 14) * 0.25; tx = 0.95; ty = Math.sin(t * 9) * 0.25; sy = 1 + Math.sin(t * 14) * 0.035; rx = 0.12; al = ar = 0.4; alz = 0.25; arz = -0.25; break; }
      case 'steamWind': { const p = ease.outCubic(clamp(k / AK.STEAM_WIND)); sy = 1 + 0.12 * p + Math.sin(t * 30) * 0.02 * p; sx = 1 + 0.16 * p; al = ar = -0.4 * p; alz = 0.35 + 0.9 * p; arz = -0.35 - 0.9 * p; tl = TONGUE * (1 - p); break; }
      case 'steam': { const p = clamp(k / 0.18); sy = 1.16 - 0.3 * Math.sin(Math.min(1, k / 0.4) * Math.PI); sx = 1.1; al = ar = -1.6 * (1 - p * 0.5); alz = 1.2; arz = -1.2; tl = 1.6; tx = 0.2; break; }
      default: {
        hop = (hop + dt * (moving ? 4.4 : 0.7)) % 1;
        const h = Math.abs(Math.sin(hop * Math.PI));
        y = moving ? h * 0.07 : 0; rz = moving ? Math.sin(hop * TAU) * 0.12 : Math.sin(t * 1.5) * 0.035; rx = moving ? 0.14 : 0;
        sy = 1 + (moving ? (h - 0.5) * 0.08 : Math.sin(t * 2.2) * 0.02); sx = 1 / Math.sqrt(sy);
        al = moving ? Math.sin(hop * TAU) * 0.7 : -0.1 + Math.sin(t * 1.7) * 0.08; ar = moving ? -Math.sin(hop * TAU) * 0.7 : -0.1 - Math.sin(t * 1.7) * 0.08;
        if (moving) { tl = 1.35; tx = 0.5 + h * 0.2; ty = Math.sin(hop * TAU) * 0.35; }
      }
    }
    I.scale.set(sx, sy, sx); I.rotation.set(rx, 0, rz); I.position.y = y;
    aL.rotation.set(al, 0, alz); aR.rotation.set(ar, 0, arz);
    // (the tongue: z is its length; it droops (rot x) at rest and swings side to side)
    const tw = a === 'lick' ? 1.6 : 1; // (the lashing tongue a little broader: it reads from the game camera)
    Tg.scale.set(tw, tw, Math.max(0.02, tl)); Tg.rotation.set(tx, ty, 0);
  };
  M.animate(0, 0, false);
  return M;
}
/** the hero's position measured along the akaname's lick lane: → { along, off } */
function laneOf(m, P, dir) { const dx = P.pos.x - m.pos.x, dz = P.pos.z - m.pos.z; return { along: dx * Math.sin(dir) + dz * Math.cos(dir), off: Math.abs(dx * Math.cos(dir) - dz * Math.sin(dir)) }; }
/** how far the lane runs before rock (so the tongue stops on a wall) */
function laneLen(m, dir, max) { const W = m.world, sx = Math.sin(dir), sz = Math.cos(dir); for (let s = 0.4; s <= max; s += 0.3) if (!W.walkable(m.pos.x + sx * s, m.pos.z + sz * s) || W.collision?.solidAt?.(m.pos.x + sx * s, m.pos.z + sz * s, 0.05)) return Math.max(0.6, s - 0.2); return max; }
function akaAI(m, dt, target, d, slow) {
  const rs = m.rs, G = m.G, M = m.model, tr = target.radius || 0.3;
  rs.t += dt; rs.lcd = (rs.lcd ?? rand(1.2, 2.6)) - dt;
  const go = (st, pose = st) => { rs.st = st; rs.t = 0; act(m, pose); };
  if ((rs.st === 'lickWind' || rs.st === 'steamWind') && m.state !== 'windup') { go('up', 'idle'); M.tongueLen = TONGUE; }
  switch (rs.st) {
    case 'lickWind':
      if (rs.t >= AK.LICK_WIND) { go('lick'); m.state = 'attack'; m.telegraph = null; rs.hit = false; rs.len = laneLen(m, rs.dir, AK.LICK_LEN); sfx('akaname_lash', m.pos); }
      return false;
    case 'lick': {
      const T1 = AK.LICK_OUT, T2 = T1 + AK.LICK_HOLD, T3 = T2 + AK.LICK_BACK, sc = m.scale || 1;
      const reach = rs.t < T1 ? ease.outCubic(rs.t / T1) : rs.t < T2 ? 1 : 1 - ease.inQuad(clamp((rs.t - T2) / AK.LICK_BACK));
      M.tongueLen = Math.max(TONGUE, rs.len * reach / sc / TL);
      if (reach > 0.3) { const tip = rs.len * reach, fy = m.pos.y + 0.5 * sc; puff(G.vfx.dot, m.pos.x + Math.sin(rs.dir) * tip, fy, m.pos.z + Math.cos(rs.dir) * tip, { life: 0.06, size: 0.2 * sc, size1: 0.18 * sc, color: '#ff7a9a', alpha: 1, alpha1: 1 }); } // (the round tip, at any reach)
      const P = G.player;
      if (!rs.hit && rs.t > T1 * 0.6 && rs.t < T2 + 0.04 && P && !G.playerDead) {
        const L = laneOf(m, P, rs.dir);
        if (L.along > 0 && L.along < rs.len * reach + tr && L.off < AK.LICK_R + tr) {
          rs.hit = true;
          const res = hitArea(m, P.pos.x, P.pos.z, 0.1, Math.round(roll(m) * 1.05), 'phys', 0.01);
          if (res) { // slobbered: a short slow, and yanked toward the akaname
            const k = P.knock ||= new THREE.Vector3(); _d.set(m.pos.x - P.pos.x, 0, m.pos.z - P.pos.z); const dl = _d.length() || 1;
            k.addScaledVector(_d, Math.min(AK.YANK, dl * 4) / dl);
            P.slowT = Math.max(P.slowT || 0, 1.1); P.slowAmt = Math.max(P.slowAmt || 0, 0.3);
            G.ui?.float?.(V(P.pos.x, P.pos.y + 1.7, P.pos.z), 'Licked!', { kind: 'status', color: '#ff9ab8' });
            for (let i = 0; i < 8; i++) puff(G.vfx.dot, P.pos.x, P.pos.y + 0.8, P.pos.z, { vx: rand(-1.5, 1.5), vy: rand(1, 2.6), vz: rand(-1.5, 1.5), life: rand(0.4, 0.6), size: rand(0.06, 0.1), color: '#ffb8cc', alpha: 0.95, alpha1: 0.6, grav: 9 });
            sfx('akaname_slurp', P.pos);
          }
        }
      }
      if (rs.t >= T3) { go('pant'); m.state = 'rest'; m.restDur = AK.PANT; M.tongueLen = TONGUE; m.emote(rs.hit ? 'heart' : 'sweat', AK.PANT * 0.8); }
      return false;
    }
    case 'pant': if (rs.t >= AK.PANT) { go('up', 'idle'); m.state = 'chase'; m.cd = rand(0.4, 0.9); } return false;
    case 'steamWind':
      if (rs.t >= AK.STEAM_WIND) {
        go('steam'); m.state = 'attack'; m.telegraph = null;
        hitArea(m, m.pos.x, m.pos.z, AK.STEAM_R, Math.round(roll(m) * 1.1), 'fire', 1.8);
        for (let i = 0; i < 16; i++) { const a = i / 16 * TAU + rand(-0.2, 0.2), s = rand(2.2, 3.6); puff(G.vfx.smoke, m.pos.x + Math.cos(a) * 0.4, m.pos.y + rand(0.3, 0.8), m.pos.z + Math.sin(a) * 0.4, { vx: Math.cos(a) * s, vy: rand(0.4, 1.0), vz: Math.sin(a) * s, life: rand(0.7, 1.0), size: 0.5, size1: 1.5, color: '#fff0e4', alpha: 0.42, alpha1: 0, drag: 2.2 }); }
        for (let i = 0; i < 6; i++) { const a = rand(0, TAU); puff(G.vfx.glow, m.pos.x, m.pos.y + 0.6, m.pos.z, { vx: Math.cos(a) * 2, vy: rand(0.5, 1.5), vz: Math.sin(a) * 2, life: 0.5, size: 0.3, size1: 0.05, color: '#ffa860', alpha: 0.8, alpha1: 0 }); }
        G.vfx.ring?.(V(m.pos.x, m.pos.y + 0.05, m.pos.z), { color: '#ffc49a', r0: 0.3, r1: AK.STEAM_R * 1.1, life: 0.35 });
        if (playerIn(G, m.pos.x, m.pos.z, 5)) G.engine.rig.shake(0.18);
        sfx('akaname_steam', m.pos);
      }
      return false;
    case 'steam': if (rs.t >= 0.55) { go('up', 'idle'); m.state = 'chase'; m.cd = rand(1.6, 2.2); } return false;
    default: {
      if (rs.st !== 'up') go('up', 'idle');
      if (rs.lcd <= 0 && d > 2.2 && d < AK.LICK_LEN - 0.4 && m.mode.los(m.pos, target.pos)) { // the lick down a locked lane
        rs.lcd = rand(3.4, 4.8);
        const a = Math.atan2(target.pos.x - m.pos.x, target.pos.z - m.pos.z); m.facing = a; rs.dir = a;
        go('lickWind'); m.state = 'windup';
        m.telegraph = tele(G, { shape: 'lane', x: m.pos.x, z: m.pos.z, r: AK.LICK_R, dir: a, len: laneLen(m, a, AK.LICK_LEN), time: AK.LICK_WIND, color: TC.lick });
        sfx('akaname_wind', m.pos);
        return false;
      }
      if (d < AK.STEAM_R - 0.3 + tr && m.cd <= 0) {
        go('steamWind'); m.state = 'windup';
        m.telegraph = tele(G, { x: m.pos.x, z: m.pos.z, r: AK.STEAM_R, time: AK.STEAM_WIND, color: TC.steam });
        sfx('akaname_whistle', m.pos);
        return false;
      }
      if (d > 1.0 + tr) { m.chase(target, dt, slow); return true; }
      m.faceTo(target.pos.x, target.pos.z, dt);
      return false;
    }
  }
}
const hurt = (name, gap = 0.45) => (m, dmg) => { const t = m.G.engine.time || 0; if (t - (m._hurtT || -9) > gap) { m._hurtT = t; sfx(name, m.pos); } return dmg; };

export const MONSTERS = {
  akaname: mdef({
    name: 'Akaname', build: 'akaname', scale: 1.15, radius: 0.4, vr: 0.5, speed: 3.0, pack: 0.5, material: 'mochi',
    attack: { type: 'melee', range: 2, cd: 2.2, windup: AK.STEAM_WIND },
    stats: { name: 'Akaname', life: 0.95, dmg: 1.1, def: 0.9, speed: 1.2, xp: 1.4, element: 'fire', res: { fire: 40, frost: -25 } },
    variants: [
      { key: 0, skin: '#e8463e', skinHi: '#ff7a64', belly: '#ffb49a', hair: '#24182a', hairHi: '#5a4a6a', towel: '#fbf8f2', stripe: '#3a6ec0', blush: '#ffb0b8' },
      { key: 1, name: 'Yuzu Akaname', skin: '#f05a32', skinHi: '#ff8e5a', belly: '#ffc49a', hair: '#2a1a1e', hairHi: '#6a4a3a', towel: '#5a8ad8', stripe: '#fbf8f2', blush: '#ffc0a0', yuzu: true },
      { key: 2, name: 'Elder Akaname', skin: '#b42a3a', skinHi: '#dc4c56', belly: '#f08e8a', hair: '#a8a4ae', hairHi: '#e4e0e8', towel: '#fbf8f2', stripe: '#c83a3a', blush: '#ff9aa8', elder: true, hachimaki: true },
    ],
    ai: akaAI,
    update: (m, dt) => { // warm-blooded: a wisp of steam off its head now and then; a giggle when it notices you
      if (m.aggro && !m._giggled) { m._giggled = true; if (Math.random() < 0.6) sfx('akaname_giggle', m.pos); }
      if (Math.random() < dt * (m.rs?.st === 'steamWind' ? 14 : 0.9)) { const sc = m.scale || 1, wind = m.rs?.st === 'steamWind'; for (const k of wind ? [-1, 1] : [0]) puff(m.G.vfx.smoke, m.pos.x + Math.cos(m.facing) * 0.24 * sc * k, m.pos.y + (wind ? 0.72 : 1.02) * sc, m.pos.z - Math.sin(m.facing) * 0.24 * sc * k, { vx: Math.cos(m.facing) * k * 0.8 + rand(-0.1, 0.1), vy: rand(0.3, 0.6), vz: -Math.sin(m.facing) * k * 0.8 + rand(-0.1, 0.1), life: rand(0.9, 1.4), size: 0.16, size1: 0.6, color: '#fff2ea', alpha: wind ? 0.45 : 0.25, alpha1: 0 }); }
    },
    onSpawn: m => { m.facing = rand(0, TAU); },
    onDeath: m => { sfx('akaname_die', m.pos); for (let i = 0; i < 10; i++) { const a = rand(0, TAU); puff(m.G.vfx.smoke, m.pos.x, m.pos.y + 0.6, m.pos.z, { vx: Math.cos(a) * rand(0.8, 2), vy: rand(0.6, 1.6), vz: Math.sin(a) * rand(0.8, 2), life: rand(0.8, 1.2), size: 0.4, size1: 1.2, color: '#fff0e8', alpha: 0.4, alpha1: 0, drag: 1.5 }); } for (let i = 0; i < 6; i++) { const a = rand(0, TAU); puff(m.G.vfx.dot, m.pos.x, m.pos.y + 0.6, m.pos.z, { vx: Math.cos(a) * rand(1, 2.5), vy: rand(2, 4), vz: Math.sin(a) * rand(1, 2.5), life: 0.7, size: 0.1, color: '#ff8aa8', alpha: 1, alpha1: 0.7, grav: 12 }); } },
    damageTaken: hurt('akaname_hurt'),
  }),
};
export const BUILD = { akaname: buildAka };
