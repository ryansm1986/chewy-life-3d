// Yukimi Onsen monsters (yukiwarashi, yukidaruma, tsurara) — docs/REGIONS.md §2 / §3.4. Owned by the monsters agent.
// Exports MONSTERS (defs in the monsters.js format + stats / material / ai / update / onSpawn / onDeath / damageTaken)
// and BUILD (model builders -> { root, pivot, body, mat, outline }). Sounds live in ./onsen.sfx.js (pure data).
// Models use the region monster kit in ./bamboo.js (assemble / mdef / lob / chill / kite …); the frost effects (snow and
// ice particles, pooled draped telegraphs, snowballs, icicles) come from ../bosses/fx_yukionna.js, shared with Yuki-onna.
//   Yuki-warashi  a snow child in a shaggy straw mino and a little kasa, red mittens: keeps its distance and lobs
//                 barrages of snowballs (a landing circle each) that chill; hops back out of melee.
//   Yuki-daruma   a two-ball snowman brute in a red bucket and a green scarf: curls up into a giant snowball (lane
//                 telegraph) and bowls through you, then sits dizzy; up close it raises both mittens and frost-slams.
//   Tsurara       an icicle wraith (icicle hair, glowing eyes, a wisp tail): blinks around the fight (a ring marks where it
//                 will reappear) and calls icicle rain down in telegraphed circles.
// Nothing here allocates per frame in steady state beyond particle spawn records (and one closure per attack).
import * as THREE from 'three';
import { V, col, ell, cone, shell, paint, xf, tubeC, lathe, eyesCute, cheeks, smile, blob, assemble, act, mdef, every, roll, sfx, playerIn, hitArea, chill, kite, push, lob } from './bamboo.js';
import { frostFx, FR, ICE, PAL_SNOW, PAL_ICE, orbitFn } from '../bosses/fx_yukionna.js';
import { rand, clamp, TAU, dist, ease, smoothstep } from '../../core/util.js';

// telegraph colours, picked against snow (white / pale blue ground): saturated, with the kit's ink veil and hot rim
export const TC = { ball: '#2f5cff', icicle: '#ff3d6b', slam: '#ff4458', roll: '#ff6a2a', blink: '#9a5cff' };
const _sp = new THREE.Vector3(), _from = new THREE.Vector3();
const at = (x, y, z) => _sp.set(x, y, z); // scratch position for sfx (read synchronously)
const hurt = (name, gap = 0.45) => (m, dmg) => { const t = m.G.engine.time || 0; if (t - (m._hurtT || -9) > gap) { m._hurtT = t; sfx(name, m.pos); } return dmg; };
/** how far a straight run from (x, z) along (dx, dz) stays on open ground r wide (up to max) */
function clearRun(W, x, z, dx, dz, max, r = 0.7) {
  const px = -dz, pz = dx;
  for (let s = 0.5; s <= max; s += 0.35) {
    const cx = x + dx * s, cz = z + dz * s;
    if (!W.walkable(cx, cz) || !W.walkable(cx + px * r, cz + pz * r) || !W.walkable(cx - px * r, cz - pz * r) || W.collision?.solidAt?.(cx, cz, 0.3)) return Math.max(0, s - 0.35);
  }
  return max;
}
/** stunned / frozen / feared out of a wind-up: drop the telegraph and go back to moving */
function interrupted(m, winds, back = 'move') {
  const st = m.status, rs = m.rs;
  if (!rs || !winds.has(rs.st) || !(st.stun > 0 || st.freeze > 0 || st.fear > 0)) return false;
  rs.tele?.kill(); rs.tele = null; rs.st = back; rs.t = 0; act(m, 'idle'); m.state = 'chase';
  return true;
}
/** per-monster rate-limited emitter (fractional carry on the AI state; key is a literal) */
function emitM(rs, key, rate, dt) { const a = (rs[key] || 0) + rate * dt, n = Math.floor(a); rs[key] = a - n; return n; }

// ================================================================================================= shared: icicle rain
/**
 * An icicle falling into a telegraphed circle at (x, z): the circle fills over `time`, the icicle drops in for the last
 * 0.34 s and shatters (frost damage + a chill to the player / allies inside). Used by the tsurara and by Yuki-onna.
 * o: { r, time, raw (damage), color, chillS, chillA, scale, knock, onLand(x, z) }
 */
export function icicleDrop(m, x, z, { r = 1, time = 1, raw = 1, color = TC.icicle, chillS = 1.3, chillA = 0.28, scale = 1, knock = 0.5, onLand = null } = {}) {
  const G = m.G, fx = frostFx(G), W = m.world, gy = W.heightAt(x, z), mode = m.mode, FALL = 0.34, len = 1.25 * scale;
  fx.tele({ shape: 'circle', x, z, r, time, color });
  fx.icicleN = (fx.icicleN || 0) + 1; // (a pack of tsurara holds its casts while many are already falling)
  let ic = null, landed = false, lt = 0;
  fx.run((dt, t) => {
    if (!ic && t >= time - FALL) { ic = fx.take('icicle', f => f.mkIcicle()); ic.scale.setScalar(scale); ic.rotation.set(rand(-0.08, 0.08), rand(0, TAU), rand(-0.08, 0.08)); sfx('tsurara_fall', at(x, gy + 3, z)); }
    if (ic && !landed) {
      const k = clamp((t - (time - FALL)) / FALL);
      ic.position.set(x, gy + len - 0.12 + (1 - k * k) * 9, z);
      if (fx.emit('icT', 40, dt)) fx.p('a', FR.STREAK, x + rand(-0.15, 0.15), ic.position.y - len * 0.5, z + rand(-0.15, 0.15), { vy: 3, life: 0.2, size: 0.9, size1: 0.3, color: ICE.glow, alpha: 0.6, alpha1: 0, rot: Math.PI / 2 });
    }
    if (!landed && t >= time) {
      landed = true;
      if (G.dungeon === mode) { const res = hitArea(m, x, z, r, raw, 'frost', knock); if (res) chill(m, chillS, chillA); }
      fx.shatter(x, gy + 0.35, z, { n: 12, r: 0.25 });
      fx.puffs(x, gy + 0.1, z, { n: 5, size: 0.45, speed: 1.6 * r, up: 0.5, life: 0.6, alpha: 0.7 });
      fx.p('a', FR.RING, x, gy + 0.12, z, { life: 0.3, size: 0.4, size1: r * 2.4, color: ICE.glow, alpha: 0.9, alpha1: 0, rot: 0 });
      sfx('tsurara_shatter', at(x, gy, z));
      if (playerIn(G, x, z, 3.2)) G.engine.rig.shake(0.14);
      onLand?.(x, z);
    }
    if (landed) {
      lt += dt;
      if (lt > 0.28) { const k = clamp((lt - 0.28) / 0.2); ic.scale.setScalar(Math.max(0.001, scale * (1 - k))); if (k >= 1) { fx.burst(x, gy + 0.4, z, { frame: FR.SHARD, n: 6, colors: PAL_ICE, speed: 2.5, up: 2.5, size: 0.22, grav: 10, life: 0.5 }); return false; } }
    }
    return true;
  }, () => { if (ic) fx.give('icicle', ic); fx.icicleN = Math.max(0, (fx.icicleN || 1) - 1); });
}

// ================================================================================================= YUKI-WARASHI
// Snow child: three tiers of shaggy straw mino (zig-zag fringe, straw strands), a big round face with an okappa bob
// and blunt fringe, a little straw kasa with a snow heap tipped back on its head, a knitted scarf, red mittens on straw
// sleeves, each holding a snowball. Keeps 4–8 m away and lobs 3 (5) snowballs a volley: a landing circle for each, fanned
// across and along your path; a hit chills. Crowd it and it hops back.
const WR = { WIND: 0.5, GAP: 0.17, FLIGHT: 0.8, R: 0.85, HOP: 0.42, HY: 0.75, HR: 0.222 };
function warashiSpec(v) {
  const straw = col(v.straw), strawD = col(v.strawD), strawL = col(v.strawL), snow = col('#ffffff');
  const HY = WR.HY, HR = WR.HR;
  const faceZ = (x, y) => Math.sqrt(Math.max(0, HR * HR - x * x - ((y - HY) / 0.97) ** 2)) * 0.97 + 0.012;
  const B = [];
  // the mino: three flared straw tiers with zig-zag fringes (strands alternate light / dark per segment)
  const tier = (y0, y1, r0, r1, teeth, seed, inside) => {
    const pts = []; for (let i = 0; i <= 4; i++) { const t = i / 4; pts.push(new THREE.Vector2(r0 + (r1 - r0) * t + Math.sin(t * Math.PI) * 0.018, y0 + (y1 - y0) * t)); }
    const SEG = 26, g = new THREE.LatheGeometry(pts, SEG);
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) if (P.getY(i) < y0 + 1e-4) { const a = Math.atan2(P.getX(i), P.getZ(i)); P.setY(i, y0 - 0.01 - 0.04 * Math.pow(Math.abs(Math.sin(a * teeth * 0.5 + seed)), 0.7)); }
    g.computeVertexNormals();
    paint(g, (p, n, o) => {
      const a = Math.atan2(p.x, p.z), col2 = ((Math.round((a / TAU) * SEG) % 2) + 2) % 2, u = clamp((p.y - y0) / (y1 - y0));
      o.copy(straw).lerp(col2 ? strawD : strawL, col2 ? 0.45 : 0.35);
      o.lerp(strawL, u * 0.25); if (p.y < y0 + 0.012) o.lerp(strawD, 0.35);
      if (v.frost && n.y > 0.28) o.lerp(snow, clamp((n.y - 0.28) * 2.6) * 0.9);
    });
    return inside ? shell(g, 0.955, v.inner) : [g];
  };
  B.push(...tier(0.075, 0.3, 0.335, 0.245, 13, 0.3, true), ...tier(0.235, 0.45, 0.285, 0.185, 13, 1.7), ...tier(0.39, 0.585, 0.225, 0.095, 13, 2.9));
  // little straw boots peeking out in front
  for (const k of [-1, 1]) B.push(ell(0.07, 0.055, 0.092, v.boot, [k * 0.1, 0.045, 0.29], [0, k * 0.15, 0], 9));
  // head, cheeks, face
  B.push(ell(HR, HR * 0.97, HR * 0.97, v.skin || '#fff2ea', [0, HY, 0.012], [0, 0, 0], 20));
  // the face is its own part with a thin contour (on a head this small the body's ink hull ringed the eyes like goggles)
  const F = [...eyesCute(HY - 0.02, faceZ(0.078, HY - 0.02) - 0.018, 0.078, 1.18, { seg: 10 })];
  for (const k of [-1, 1]) { const x = k * 0.132, y = HY - 0.092; F.push(ell(0.042, 0.022, 0.012, v.blush || '#ff9ab0', [x, y, faceZ(x, y) - 0.005], [0, k * 0.62, 0], 8)); }
  F.push(smile(HY - 0.112, faceZ(0, HY - 0.112) - 0.001, 0.02, 0.01, 0.0065));
  // okappa bob: a hair shell with a blunt fringe across the brow, falling to the jaw at the sides and back
  const hair = new THREE.SphereGeometry(HR * 1.045, 22, 15); hair.translate(0, HY, 0.006);
  const HP = hair.attributes.position;
  for (let i = 0; i < HP.count; i++) {
    const x = HP.getX(i), y = HP.getY(i) - HY, z = HP.getZ(i) - 0.006, fw = smoothstep(0.38, 0.62, Math.cos(Math.atan2(x, z)));
    const cut = -0.12 * (1 - fw) + 0.1 * fw;
    if (y < cut) HP.setY(i, HY + cut);
  }
  hair.computeVertexNormals();
  const hairC = col(v.hair), hi = col(v.hairHi || '#9a8ac8');
  paint(hair, (p, n, o) => { o.copy(hairC); if (n.y > 0.1 && Math.abs(p.y - HY - 0.15) < 0.024) o.lerp(hi, 0.6); });
  B.push(hair);
  // the kasa: a shallow straw cone tipped back, woven rings, a snow heap on top (v2: a red camellia)
  const hat = [];
  const hg = new THREE.ConeGeometry(0.32, 0.14, 18, 2, true);
  paint(hg, (p, n, o) => { const r = Math.hypot(p.x, p.z); o.copy(straw).lerp(strawL, 0.35); if (Math.sin(r * 95) > 0.55) o.lerp(strawD, 0.55); });
  hat.push(...shell(hg, 0.94, v.inner));
  hat.push(ell(0.035, 0.03, 0.035, strawD.getStyle(), [0, 0.07, 0], [0, 0, 0], 8));
  if (v.heap) hat.push(ell(0.19, 0.075, 0.18, '#ffffff', [0, 0.03, 0], [0, 0, 0], 14), ell(0.1, 0.07, 0.1, '#ffffff', [0.03, 0.09, 0.01], [0, 0, 0], 10));
  else hat.push(ell(0.13, 0.05, 0.12, '#ffffff', [0.02, 0.035, -0.01], [0, 0, 0], 12));
  if (v.flower) { for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; hat.push(ell(0.035, 0.012, 0.03, '#e8283a', [0.13 + Math.cos(a) * 0.03, 0.02, 0.1 + Math.sin(a) * 0.03], [0, -a, 0.3], 8)); } hat.push(ell(0.018, 0.015, 0.018, '#ffd84a', [0.13, 0.03, 0.1], [0, 0, 0], 6)); }
  for (const g of hat) { xf(g, { r: [-0.32, 0, 0.06] }); g.translate(0, HY + 0.192, -0.03); }
  B.push(...hat);
  // knitted scarf round the neck, one tail down the front
  const sc = col(v.scarf);
  B.push(paint(xf(new THREE.TorusGeometry(0.115, 0.042, 8, 22), { p: [0, 0.565, 0.012], r: [Math.PI / 2 - 0.12, 0, 0] }), (p, n, o) => o.copy(sc).multiplyScalar(0.9 + 0.1 * Math.sin(Math.atan2(p.x, p.z) * 11))));
  B.push(tubeC([[0.075, 0.555, 0.1, 0.04], [0.105, 0.47, 0.16, 0.037], [0.115, 0.39, 0.19, 0.032]], (p, n, o) => o.copy(sc).multiplyScalar(0.92 + 0.08 * Math.sin(p.y * 90)), 7));
  for (const x of [0.095, 0.115, 0.135]) B.push(cone(0.012, 0.05, sc.getStyle(), [x, 0.355, 0.195], [0, 0, 0], 5));
  // straw sleeves ending in red mittens (fluffy white cuffs); a snowball in each
  const arm = k => [
    tubeC([[0, 0, 0, 0.052], [k * 0.035, -0.07, 0.035, 0.05], [k * 0.058, -0.13, 0.07, 0.047]], straw.getStyle(), 8),
    paint(xf(new THREE.TorusGeometry(0.047, 0.022, 6, 12), { p: [k * 0.062, -0.145, 0.076], r: [Math.PI / 2 + 0.55, 0, 0] }), (p, n, o) => o.set('#ffffff')),
    ell(0.08, 0.086, 0.072, v.mitten, [k * 0.068, -0.21, 0.098], [0.35, 0, 0], 11),
    ell(0.033, 0.04, 0.032, v.mitten, [k * 0.012, -0.18, 0.14], [0.3, 0, -k * 0.4], 7),
  ];
  const ball = () => [blob(10, 8, q => q.multiplyScalar(0.078 * (1 + 0.06 * Math.sin(q.x * 5 + q.z * 3))), (p, n, o) => { o.set('#ffffff'); if (n.y < 0) o.lerp(col('#c8dcf2'), -n.y * 0.7); })];
  return { parts: [
    { name: 'body', geo: B },
    { name: 'face', geo: F, outline: 0.006, shadow: false },
    { name: 'armR', geo: arm(1), at: [0.172, 0.47, 0.06] }, { name: 'armL', geo: arm(-1), at: [-0.172, 0.47, 0.06] },
    { name: 'ballR', geo: ball(), at: [0.07, -0.28, 0.13], parent: 'armR' }, { name: 'ballL', geo: ball(), at: [-0.07, -0.28, 0.13], parent: 'armL' }, // (on top of the mitten when the arm is up)
  ] };
}
function buildWarashi(v) {
  const M = assemble('warashi:' + v.key, () => warashiSpec(v));
  const I = M.inner, AR = M.g.armR, AL = M.g.armL, BR = M.g.ballR, BL = M.g.ballL;
  let hop = 0;
  M.flick = 0; M.side = 1; M.grow = [1, 1]; // throwing arm whip, which side, ball regrowth [L, R]
  M.animate = (dt, t, moving) => {
    const a = M.act, k = (M.actT += dt);
    let y = 0, sy = 1, rx = 0, rz = 0, lX = -0.4, lZ = -0.12, rX = -0.4, rZ = 0.12;
    M.flick = Math.max(0, M.flick - dt / 0.2);
    switch (a) {
      case 'wind': { const p = ease.outCubic(clamp(k / WR.WIND)); lX = rX = -0.4 - 2.15 * p; lZ = -0.12 - 0.15 * p; rZ = 0.12 + 0.15 * p; rx = -0.16 * p; sy = 1 - 0.09 * p; rz = Math.sin(t * 50) * 0.03 * p; break; }
      case 'throw': {
        lX = rX = -2.55; lZ = -0.27; rZ = 0.27;
        const w = Math.sin((1 - M.flick) * Math.PI) * (M.flick > 0 ? 1 : 0);
        if (M.side > 0) rX += 1.95 * w; else lX += 1.95 * w;
        rx = 0.1 * w - 0.08; sy = 1 + 0.05 * w; rz = M.side * 0.06 * w;
        break;
      }
      case 'hop': { const p = clamp(k / WR.HOP), h = Math.sin(p * Math.PI); y = h * 0.34; rx = -0.28 * h; lX = rX = -1.3 * h - 0.4; lZ = -0.12 - 0.5 * h; rZ = 0.12 + 0.5 * h; sy = p < 0.15 ? 1 - 0.18 * (1 - p / 0.15) : 1 + 0.08 * h; break; }
      case 'scoop': {
        const p = clamp(k / 1.3), dn = Math.sin(clamp(p * 1.2) * Math.PI);
        sy = 1 - 0.13 * dn; rx = 0.32 * dn; lX = rX = -0.4 + 1.1 * dn + Math.sin(t * 16) * 0.18 * dn; lZ = -0.3 * dn - 0.12; rZ = 0.3 * dn + 0.12;
        if (k > 1.3) act(M, 'idle');
        break;
      }
      default: {
        hop = (hop + dt * (moving ? 3.6 : 0.8)) % 1;
        const h = Math.sin(hop * Math.PI);
        y = moving ? h * 0.1 : 0; sy = 1 + (moving ? (h - 0.4) * 0.1 : Math.sin(t * 2.6) * 0.022);
        rz = moving ? Math.sin(hop * TAU) * 0.1 : Math.sin(t * 1.6) * 0.04; rx = moving ? 0.1 : 0;
        lX += moving ? Math.sin(hop * TAU) * 0.4 : Math.sin(t * 1.9) * 0.08; rX += moving ? -Math.sin(hop * TAU) * 0.4 : Math.sin(t * 1.9 + 1) * 0.08;
      }
    }
    I.position.y = y; I.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy)); I.rotation.set(rx, 0, rz);
    AR.rotation.set(rX, 0, rZ); AL.rotation.set(lX, 0, lZ);
    // snowballs are packed in the mittens for a volley (and while scooping), gone otherwise: the red mittens read at rest
    const armed = a === 'wind' || a === 'throw' || (a === 'scoop' && k > 0.5);
    for (let i = 0; i < 2; i++) M.grow[i] = armed ? Math.min(1, M.grow[i] + dt / 0.32) : Math.max(0, M.grow[i] - dt * 5);
    BL.visible = M.grow[0] > 0.01; BR.visible = M.grow[1] > 0.01;
    BL.scale.setScalar(Math.max(0.001, ease.outBack(M.grow[0]))); BR.scale.setScalar(Math.max(0.001, ease.outBack(M.grow[1])));
  };
  return M;
}
// a snowball in flight: pooled mesh, tumbling, shedding flakes
const SNOWBALL_LOOK = {
  start(G, s) {
    const fx = frostFx(G), o = fx.take('snowball', f => f.mkSnowball());
    o.position.set(s.x, s.y, s.z); o.scale.setScalar(0.85);
    return {
      update(dt) { o.position.set(s.x, s.y, s.z); o.rotation.x += dt * 9; o.rotation.z += dt * 5; if (fx.emit('sbT', 18, dt)) fx.p('n', FR.FLAKE, s.x, s.y, s.z, { vx: rand(-0.4, 0.4), vy: rand(-0.2, 0.4), vz: rand(-0.4, 0.4), life: 0.45, size: 0.16, size1: 0.05, color: ICE.white, alpha: 0.95, alpha1: 0, spin: 4 }); },
      end() { fx.give('snowball', o); },
    };
  },
};
function throwBall(m, target, i) {
  const M = m.model, fx = frostFx(m.G), W = m.world;
  const px = target.pos.x, pz = target.pos.z, dx = px - m.pos.x, dz = pz - m.pos.z, L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
  const OFF = [[0, 0], [1.35, 0.45], [-1.35, 0.45], [0.75, -1.25], [-0.75, -1.25]], o = OFF[i % OFF.length];
  let tx = px - uz * o[0] + ux * o[1], tz = pz + ux * o[0] + uz * o[1];
  if (!W.walkable(tx, tz)) { tx = px; tz = pz; }
  const side = i % 2 ? -1 : 1, f = m.facing, sc = m.scale;
  M.flick = 1; M.side = side; M.grow[side > 0 ? 1 : 0] = 0;
  _from.set(m.pos.x + (Math.sin(f) * 0.16 + Math.cos(f) * 0.14 * side) * sc, m.pos.y + 1.02 * sc, m.pos.z + (Math.cos(f) * 0.16 - Math.sin(f) * 0.14 * side) * sc);
  const time = WR.FLIGHT + i * 0.03;
  fx.tele({ shape: 'circle', x: tx, z: tz, r: WR.R, time, color: TC.ball });
  lob(m, { look: SNOWBALL_LOOK, from: _from, to: { x: tx, z: tz }, h: 2.1, time, r: WR.R, tele: false, onLand: s => {
    if (m.G.dungeon !== m.mode) return;
    const res = hitArea(m, s.tx, s.tz, WR.R, Math.max(1, Math.round(roll(m) * 0.5)), 'frost', 0.35);
    if (res) chill(m, 1.8, 0.32);
    fx.splat(s.tx, s.ty, s.tz, 0.9);
    sfx('warashi_splat', at(s.tx, s.ty, s.tz));
  } });
  sfx('warashi_throw', m.pos);
}
const WR_WINDS = new Set(['wind']);
function warashiAI(m, dt, target, d, slow) {
  const rs = m.rs, G = m.G, fx = frostFx(G), tr = target.radius || 0.3;
  rs.t += dt; rs.hopCd = (rs.hopCd ?? 1) - dt;
  const go = (st, pose = st) => { rs.st = st; rs.t = 0; act(m, pose); };
  if (rs.st === 'wind' && m.state !== 'windup') go('move', 'idle');
  switch (rs.st) {
    case 'wind':
      m.faceTo(target.pos.x, target.pos.z, dt * 1.5);
      if (rs.t >= WR.WIND) { go('barrage', 'throw'); m.state = 'attack'; rs.i = 0; rs.next = 0; rs.n = m.model.variant?.shots || 3; }
      return false;
    case 'barrage':
      m.faceTo(target.pos.x, target.pos.z, dt);
      if (rs.t >= rs.next && rs.i < rs.n) { throwBall(m, target, rs.i); rs.i++; rs.next += WR.GAP; }
      if (rs.i >= rs.n && rs.t > rs.next + 0.12) { go('move', 'idle'); m.state = 'chase'; m.cd = rand(2.6, 3.4); }
      return false;
    case 'hop': {
      const k = rs.t / WR.HOP;
      push(m, rs.hx, rs.hz, 6 * (1 - k * 0.6), dt);
      m.faceTo(target.pos.x, target.pos.z, dt * 0.5);
      if (rs.t >= WR.HOP) { go('move', 'idle'); fx.puffs(m.pos.x, m.pos.y, m.pos.z, { n: 5, size: 0.35, speed: 1.2, up: 0.4, life: 0.5, alpha: 0.6 }); m.cd = Math.min(m.cd, 0.3); }
      return true;
    }
    default: {
      if (rs.st !== 'move') go('move', 'idle');
      if (d < 2.1 + tr && rs.hopCd <= 0) {
        const a = Math.atan2(m.pos.x - target.pos.x, m.pos.z - target.pos.z) + rand(-0.6, 0.6);
        rs.hx = Math.sin(a); rs.hz = Math.cos(a); rs.hopCd = rand(3, 4.5);
        go('hop'); sfx('warashi_hop', m.pos);
        return true;
      }
      if (m.cd <= 0 && d < 10 && m.mode.los(m.pos, target.pos)) { go('wind'); m.state = 'windup'; sfx('warashi_wind', m.pos); return false; }
      return kite(m, target, d, dt, slow, 4.2, 7.6, 0.5);
    }
  }
}
function warashiUpdate(m, dt) {
  interrupted(m, WR_WINDS);
  if (!m.aggro) { const M = m.model; if (M.act !== 'scoop') act(m, 'idle'); if (every(M, 'scoopT', dt, 4, 8)) { act(m, 'scoop'); if (playerIn(m.G, m.pos.x, m.pos.z, 10)) sfx('warashi_giggle', m.pos); } }
  if (m.model.act === 'scoop' && m.model.actT > 0.4 && m.model.actT < 1 && Math.random() < dt * 10) frostFx(m.G).p('n', FR.CHUNK, m.pos.x + Math.sin(m.facing) * 0.3, m.pos.y + 0.1, m.pos.z + Math.cos(m.facing) * 0.3, { vx: rand(-0.6, 0.6), vy: rand(1.2, 2.2), vz: rand(-0.6, 0.6), life: 0.5, size: 0.12, size1: 0.08, color: ICE.white, alpha: 1, alpha1: 0.8, grav: 9 });
}

// ================================================================================================= YUKI-DARUMA
// Snowman brute: a big lumpy snowball body and head, coal eyes under thick charcoal brows, a carrot nose, a coal-bead
// grin, coal buttons, a tipped red bucket for a helmet, a striped green scarf, twig arms with big knitted mitten fists.
// It lumbers after you; from range it curls up into a giant rolling snowball (lane telegraph) and bowls through, then
// pops out dizzy (bonking a wall: dizzier); up close it raises both fists (circle telegraph) and frost-slams.
const DR = { CURL: 0.95, ROLL: 10.5, LANE: 0.78, SLAM_W: 0.85, SLAM_R: 2.3, DIZZY: 1.15, BALL_R: 0.72 };
function darumaSpec(v) {
  const snowC = col(v.snow || '#f6faff'), shadeC = col(v.shade || '#c2d4ee'), speck = col('#dcefff'), coal = v.coal || '#2c2934';
  const snowP = (p, n, o) => { o.copy(snowC); if (n.y < 0.2) o.lerp(shadeC, clamp((0.2 - n.y) * 0.85)); if (Math.sin(p.x * 41 + p.y * 17) * Math.sin(p.z * 37 - p.y * 23) > 0.86) o.lerp(speck, 0.8); };
  const B = [];
  B.push(blob(22, 16, q => { const k = 1 + 0.035 * Math.sin(q.x * 6 + 1) * Math.cos(q.z * 5); return q.set(q.x * 0.56 * k, q.y * 0.5 * k + 0.5, q.z * 0.54 * k); }, snowP));
  B.push(blob(20, 14, q => { const k = 1 + 0.03 * Math.sin(q.x * 7 + 2) * Math.cos(q.z * 6); return q.set(q.x * 0.36 * k, q.y * 0.33 * k + 1.16, q.z * 0.35 * k); }, snowP));
  const hz = (x, y) => 0.35 * Math.sqrt(Math.max(0, 1 - (x / 0.36) ** 2 - ((y - 1.16) / 0.33) ** 2));
  const bz = (x, y) => 0.54 * Math.sqrt(Math.max(0, 1 - (x / 0.56) ** 2 - ((y - 0.5) / 0.5) ** 2));
  // coal eyes with sparkles, thick angry charcoal brows, carrot nose, coal-bead grin, cheeks
  for (const k of [-1, 1]) {
    const x = k * 0.12, y = 1.2, z = hz(x, y);
    B.push(ell(0.056, 0.064, 0.034, coal, [x, y, z - 0.008], [0, k * 0.34, 0], 10));
    B.push(ell(0.019, 0.021, 0.012, '#ffffff', [x - 0.016, y + 0.022, z + 0.02], [0, 0, 0], 8), ell(0.009, 0.009, 0.008, '#ffffff', [x + 0.017, y - 0.02, z + 0.02], [0, 0, 0], 6));
    const x0 = k * 0.205, x1 = k * 0.055, y0 = 1.315, y1 = 1.28;
    B.push(tubeC([[x0, y0, hz(x0, y0) + 0.012, 0.024], [(x0 + x1) / 2, (y0 + y1) / 2 + 0.008, hz((x0 + x1) / 2, (y0 + y1) / 2) + 0.018, 0.03], [x1, y1, hz(x1, y1) + 0.016, 0.026]], coal, 6));
    B.push(ell(0.05, 0.028, 0.014, '#ffa8b8', [k * 0.215, 1.105, hz(k * 0.215, 1.105) - 0.002], [0, k * 0.6, 0], 10));
  }
  B.push(paint(xf(new THREE.ConeGeometry(0.052, 0.21, 9, 3), { p: [0, 1.135, hz(0, 1.135) + 0.095], r: [Math.PI / 2, 0, 0] }), (p, n, o) => { o.set('#ff8a2a'); if (Math.sin(p.z * 120) > 0.7) o.lerp(col('#d86418'), 0.6); }));
  for (let i = -2; i <= 2; i++) { const x = i * 0.056, y = 1.035 + i * i * 0.0085; B.push(ell(0.022, 0.022, 0.018, coal, [x, y, hz(x, y) - 0.004], [0, 0, 0], 8)); }
  for (const y of [0.78, 0.6, 0.42]) B.push(ell(0.036, 0.036, 0.022, coal, [0, y, bz(0, y) - 0.004], [0, 0, 0], 8));
  // bucket helmet (red lacquer staves, two iron bands, a wire handle), tipped over one eye
  const bucket = [];
  const bk = new THREE.CylinderGeometry(0.19, 0.235, 0.25, 16, 3);
  paint(bk, (p, n, o) => { const a = Math.atan2(p.x, p.z); o.set(v.bucket || '#d8453a'); if (Math.abs(Math.sin(a * 9)) < 0.12) o.multiplyScalar(0.72); if (Math.abs(p.y + 0.07) < 0.02 || Math.abs(p.y - 0.08) < 0.02) o.set('#b8bcc8'); if (n.y > 0.9) o.set(v.bucketTop || '#b8352c'); });
  bucket.push(bk, paint(xf(new THREE.TorusGeometry(0.22, 0.011, 5, 16, Math.PI), { p: [0, -0.02, 0], r: [0, 0, -0.4] }), (p, n, o) => o.set('#9aa0ac')));
  for (const g of bucket) { xf(g, { r: [-0.14, 0, 0.24] }); g.translate(0.05, 1.5, -0.03); }
  B.push(...bucket);
  // striped scarf in the neck groove, with a fringed tail down the front
  const sc = col(v.scarf || '#44a468'), st = col(v.stripe || '#fff6e4');
  B.push(paint(xf(new THREE.TorusGeometry(0.285, 0.078, 8, 22), { p: [0, 0.93, 0], r: [Math.PI / 2 + 0.06, 0, 0] }), (p, n, o) => { o.copy(sc); if (Math.sin(Math.atan2(p.x, p.z) * 9) > 0.55) o.copy(st); }));
  B.push(tubeC([[-0.16, 0.92, 0.25, 0.07], [-0.23, 0.8, 0.37, 0.066], [-0.27, 0.64, 0.45, 0.062], [-0.28, 0.5, 0.47, 0.056]], (p, n, o) => { o.copy(sc); if (Math.sin(p.y * 38) > 0.55) o.copy(st); }, 8, false));
  for (let i = 0; i < 4; i++) B.push(cone(0.018, 0.08, sc.getStyle(), [-0.25 - i * 0.018, 0.43, 0.47 + (i % 2) * 0.01], [0, 0, 0], 5));
  // twig arms with knitted mitten fists
  const mit = v.mitten || '#44a468';
  const arm = k => [
    tubeC([[k * -0.06, 0, 0, 0.048], [k * 0.14, 0.07, 0.03, 0.04], [k * 0.29, 0.12, 0.07, 0.032]], '#7a5236', 6),
    tubeC([[k * 0.15, 0.074, 0.032, 0.02], [k * 0.19, 0.19, 0.02, 0.012]], '#7a5236', 5),
    ell(0.125, 0.115, 0.115, mit, [k * 0.39, 0.14, 0.1], [0, 0, 0], 11),
    ell(0.048, 0.055, 0.045, mit, [k * 0.34, 0.21, 0.17], [0, 0, k * 0.5], 8),
    paint(xf(new THREE.TorusGeometry(0.07, 0.03, 5, 12), { p: [k * 0.3, 0.13, 0.09], r: [0, Math.PI / 2, 0] }), (p, n, o) => o.set(v.stripe || '#fff6e4')),
  ];
  // the rolled-up snowball (shown while charging): lumpy snow with the scarf band, twigs and a mitten poking out
  const BL = [blob(20, 14, q => { const k = 1 + 0.05 * Math.sin(q.x * 5 + 1) * Math.cos(q.z * 4) + 0.03 * Math.sin(q.y * 9); return q.multiplyScalar(DR.BALL_R * k); }, snowP)];
  BL.push(paint(xf(new THREE.TorusGeometry(DR.BALL_R * 0.97, 0.075, 6, 24), { r: [0.35, 0.2, 0.1] }), (p, n, o) => { o.copy(sc); if (Math.sin(Math.atan2(p.y, p.x) * 11) > 0.55) o.copy(st); }));
  BL.push(tubeC([[0.5, 0.45, 0.1, 0.035], [0.66, 0.6, 0.1, 0.028], [0.76, 0.66, 0.14, 0.018]], '#7a5236', 5), tubeC([[-0.52, -0.3, 0.4, 0.035], [-0.64, -0.38, 0.52, 0.025]], '#7a5236', 5));
  BL.push(ell(0.12, 0.11, 0.11, mit, [-0.6, 0.35, -0.38], [0, 0, 0], 10), ell(0.1, 0.06, 0.1, v.bucket || '#d8453a', [0.1, 0.72, -0.2], [0.3, 0, 0.2], 10));
  for (let i = 0; i < 5; i++) { const a = i * 1.9, b = i * 0.8 - 1.5; BL.push(ell(0.035, 0.035, 0.03, coal, [Math.cos(a) * Math.cos(b) * DR.BALL_R, Math.sin(b) * DR.BALL_R, Math.sin(a) * Math.cos(b) * DR.BALL_R], [0, 0, 0], 6)); }
  // a soft luminance knee: a near-white snowman under dusk bloom (threshold 0.7) would glow like glass
  const knee = ' { float lmD = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722)); if (lmD > 0.52) { float nlD = 0.52 + 0.16 * (1.0 - exp(-(lmD - 0.52) / 0.16)); outgoingLight *= nlD / lmD; } }';
  return { mat: { fragOut: knee }, parts: [
    { name: 'body', geo: B },
    { name: 'armR', geo: arm(1), at: [0.47, 0.78, 0.02] }, { name: 'armL', geo: arm(-1), at: [-0.47, 0.78, 0.02] },
    { name: 'ball', geo: BL, at: [0, DR.BALL_R, 0], parent: 'pivot' },
  ] };
}
function buildDaruma(v) {
  const M = assemble('daruma:' + v.key, () => darumaSpec(v));
  const I = M.inner, AR = M.g.armR, AL = M.g.armL, BALL = M.g.ball;
  BALL.visible = false; M.spin = 0;
  let step = 0;
  M.animate = (dt, t, moving) => {
    const a = M.act, k = (M.actT += dt);
    let y = 0, sy = 1, sx = 1, rx = 0, rz = 0, raise = 0.3 + Math.sin(t * 1.7) * 0.06, pitch = 0, bs = 0, show = true;
    switch (a) {
      case 'curl': { const p = clamp(k / DR.CURL); sy = 1 - 0.38 * ease.inQuad(p); sx = 1 + 0.14 * p; raise = 0.3 - 1.1 * p; rz = Math.sin(t * 45) * 0.04 * p; bs = p < 0.3 ? 0 : ease.outBack((p - 0.3) / 0.7); show = p < 0.96; M.spin += dt * 7 * p; break; }
      case 'roll': bs = 1; show = false; break;
      case 'unroll': { const p = clamp(k / 0.35); bs = p < 0.2 ? 1 + p * 1.2 : 0; show = p >= 0.2; sy = show ? 0.55 + 0.45 * ease.outBack((p - 0.2) / 0.8, 2.4) : 1; sx = 1 / Math.sqrt(sy); raise = 1.2 * (1 - p); break; }
      case 'dizzy': rz = Math.sin(t * 6) * 0.14; rx = Math.cos(t * 6) * 0.07; raise = 0.6 + Math.sin(t * 6) * 0.4; break;
      case 'slamWind': { const p = ease.outCubic(clamp(k / DR.SLAM_W)); raise = 0.3 + 1.35 * p; pitch = 0.3 * p; rx = -0.2 * p; sy = 1 + 0.07 * p; rz = Math.sin(t * 60) * 0.025 * p; break; }
      case 'slam': { const p = clamp(k / 0.16), q = clamp((k - 0.16) / 0.5); raise = 1.65 - 2.1 * ease.inQuad(p) + 0.75 * ease.outCubic(q); pitch = 0.3 + 0.9 * p - 1.2 * q; rx = 0.26 * p - 0.26 * q; sy = 1 - 0.16 * Math.sin(Math.min(1, k / 0.35) * Math.PI); sx = 1 + 0.08 * Math.sin(Math.min(1, k / 0.35) * Math.PI); break; }
      default: {
        step = (step + dt * (moving ? 2.4 : 0)) % 1;
        const h = Math.abs(Math.sin(step * Math.PI));
        y = moving ? h * 0.07 : 0; rz = moving ? Math.sin(step * TAU) * 0.13 : Math.sin(t * 1.2) * 0.025;
        sy = 1 + Math.sin(t * 1.8) * 0.02 - (moving ? (1 - h) * 0.04 : 0); sx = 1 / Math.sqrt(sy);
        raise += moving ? Math.sin(step * TAU) * 0.18 : 0; pitch = moving ? Math.cos(step * TAU) * 0.2 : 0;
      }
    }
    I.visible = show; I.position.y = y; I.scale.set(sx, sy, sx); I.rotation.set(rx, 0, rz);
    AR.rotation.set(pitch, 0, raise); AL.rotation.set(pitch, 0, -raise);
    BALL.visible = bs > 0.01;
    if (BALL.visible) { BALL.scale.setScalar(bs); BALL.rotation.set(M.spin, 0, a === 'roll' ? Math.sin(t * 9) * 0.06 : 0); BALL.position.y = DR.BALL_R * bs + (a === 'roll' ? Math.abs(Math.sin(M.spin * 1.5)) * 0.05 : 0); }
  };
  return M;
}
function darumaUnroll(m, bonk) {
  const rs = m.rs, G = m.G, fx = frostFx(G);
  rs.st = 'unroll'; rs.t = 0; act(m, 'unroll'); m.state = 'chase';
  rs.dizzy = DR.DIZZY + (bonk ? 0.6 : 0); rs.rollCd = rand(5, 7);
  const x = m.pos.x, y = m.pos.y, z = m.pos.z;
  fx.splat(x, y + 0.5, z, 1.3, true);
  fx.puffs(x, y + 0.3, z, { n: 8, size: 0.6, speed: 2.4, up: 1, life: 0.8 });
  if (bonk) { sfx('daruma_bonk', m.pos); if (playerIn(G, x, z, 8)) G.engine.rig.shake(0.2); } else sfx('daruma_pop', m.pos);
  // dizzy stars round the head
  const cen = m.pos, n = 5;
  for (let i = 0; i < n; i++) { const q = fx.p('n', FR.DIZZY, x, y + 1.75 * m.scale, z, { life: rs.dizzy + 0.35, size: 0.3, size1: 0.24, color: ICE.gold, alpha: 1, alpha1: 0.6, spin: 2, fn: orbitFn }); q.cen = cen; q.ang = i / n * TAU; q.rad = 0.42 * m.scale; q.w = 4.5; q.rin = 0; q.climb = 0; q.y = y + 1.75 * m.scale + Math.sin(i * 2.1) * 0.05; }
}
const DR_WINDS = new Set(['curl', 'slamWind']);
function darumaAI(m, dt, target, d, slow) {
  const rs = m.rs, G = m.G, fx = frostFx(G), W = m.world, tr = target.radius || 0.3, M = m.model;
  rs.t += dt; rs.rollCd = (rs.rollCd ?? rand(1.2, 2.6)) - dt; rs.slamCd = (rs.slamCd ?? 0.6) - dt;
  const go = (st, pose = st) => { rs.st = st; rs.t = 0; act(m, pose); };
  if ((rs.st === 'curl' || rs.st === 'slamWind') && m.state !== 'windup') { rs.tele?.kill(); rs.tele = null; go('walk', 'idle'); }
  switch (rs.st) {
    case 'curl':
      m.facing = Math.atan2(rs.dx, rs.dz);
      if (emitM(rs, 'eC', 26, dt)) { const a = rand(0, TAU), r = rand(0.9, 1.4); fx.p('n', FR.PUFF, m.pos.x + Math.cos(a) * r, m.pos.y + rand(0.1, 0.9), m.pos.z + Math.sin(a) * r, { vx: -Math.cos(a) * 2.2, vz: -Math.sin(a) * 2.2, vy: 0.3, life: 0.4, size: 0.35, size1: 0.1, color: ICE.snow, alpha: 0.2, alpha1: 0.8 }); }
      if (rs.t >= DR.CURL) { go('roll'); m.state = 'attack'; rs.trav = 0; rs.hit = false; rs.tele = null; sfx('daruma_roll', m.pos); }
      return false;
    case 'roll': {
      const step = push(m, rs.dx, rs.dz, DR.ROLL, dt); rs.trav += step; M.spin += step / DR.BALL_R;
      if (!rs.hit && dist(target.pos.x, target.pos.z, m.pos.x, m.pos.z) < DR.BALL_R * m.scale + tr + 0.05) {
        rs.hit = true; m.dealTo(target, Math.round(roll(m) * 1.35), 'frost', 2.4);
        if (target === G.player) chill(m, 2, 0.4);
        fx.splat(target.pos.x, target.pos.y + 0.4, target.pos.z, 1, true); sfx('daruma_hit', target.pos); G.engine.rig.shake(0.3);
      }
      const n = emitM(rs, 'eR', 34, dt);
      for (let i = 0; i < n; i++) { const s = rand(-1, 1); fx.p('n', i % 3 ? FR.CHUNK : FR.PUFF, m.pos.x - rs.dx * 0.6 - rs.dz * s * 0.5, m.pos.y + 0.1, m.pos.z - rs.dz * 0.6 + rs.dx * s * 0.5, { vx: -rs.dx * rand(1, 3) - rs.dz * s * 2, vy: rand(1.5, 3.5), vz: -rs.dz * rand(1, 3) + rs.dx * s * 2, life: 0.55, size: i % 3 ? 0.16 : 0.5, size1: i % 3 ? 0.08 : 0.9, color: ICE.snow, alpha: i % 3 ? 1 : 0.7, alpha1: 0, grav: i % 3 ? 10 : 0, drag: 1.5 }); }
      const blocked = step < DR.ROLL * dt * 0.3;
      if (rs.trav >= rs.len || blocked || rs.t > 1.8) darumaUnroll(m, blocked && rs.trav < rs.len - 0.4);
      return true;
    }
    case 'unroll': if (rs.t >= 0.35) go('dizzy'); return false;
    case 'dizzy': if (rs.t >= rs.dizzy) go('walk', 'idle'); return false;
    case 'slamWind':
      m.faceTo(target.pos.x, target.pos.z, dt * 0.8);
      if (emitM(rs, 'eS', 20, dt)) fx.p('a', FR.STAR, m.pos.x + rand(-0.6, 0.6), m.pos.y + rand(1.4, 1.9) * m.scale, m.pos.z + rand(-0.6, 0.6), { vy: -0.5, life: 0.3, size: 0.3, size1: 0.05, color: ICE.glow, alpha: 1, alpha1: 0 });
      if (rs.t >= DR.SLAM_W) {
        go('slam'); m.state = 'attack'; rs.tele = null;
        const x = m.pos.x + Math.sin(m.facing) * 0.35, z = m.pos.z + Math.cos(m.facing) * 0.35, y = m.pos.y;
        const res = hitArea(m, x, z, DR.SLAM_R, Math.round(roll(m) * 1.2), 'frost', 1.6);
        if (res) chill(m, 2.2, 0.42);
        fx.burst(x, y + 0.15, z, { frame: FR.SHARD, n: 16, colors: PAL_ICE, speed: 6.5, up: 3, size: 0.34, grav: 10, drag: 1.2, life: 0.7, r: 0.4 });
        fx.splat(x, y, z, 1.6, true);
        fx.p('a', FR.RING, x, y + 0.12, z, { life: 0.35, size: 0.6, size1: DR.SLAM_R * 2.4, color: ICE.glow, alpha: 1, alpha1: 0, rot: 0 });
        G.vfx.dustRing(at(x, y, z), 2, 16);
        sfx('daruma_slam', m.pos);
        if (playerIn(G, x, z, 6)) G.engine.rig.shake(0.38);
      }
      return false;
    case 'slam': if (rs.t >= 0.7) { go('walk', 'idle'); m.state = 'chase'; rs.slamCd = rand(3, 4); } return false;
    default: {
      if (rs.st !== 'walk') go('walk', 'idle');
      if (d < DR.SLAM_R - 0.3 + tr && rs.slamCd <= 0) {
        go('slamWind'); m.state = 'windup';
        rs.tele = fx.tele({ shape: 'circle', x: m.pos.x + Math.sin(m.facing) * 0.35, z: m.pos.z + Math.cos(m.facing) * 0.35, r: DR.SLAM_R, time: DR.SLAM_W, color: TC.slam });
        sfx('daruma_slam_wind', m.pos);
        return false;
      }
      if (rs.rollCd <= 0 && d > 3.4 && d < 11 && m.mode.los(m.pos, target.pos)) {
        const dx = (target.pos.x - m.pos.x) / d, dz = (target.pos.z - m.pos.z) / d, len = clearRun(W, m.pos.x, m.pos.z, dx, dz, Math.min(d + 3.2, 12), DR.LANE);
        if (len > 3) {
          rs.dx = dx; rs.dz = dz; rs.len = len; m.facing = Math.atan2(dx, dz);
          go('curl'); m.state = 'windup';
          rs.tele = fx.tele({ shape: 'lane', x: m.pos.x, z: m.pos.z, r: DR.LANE, dir: m.facing, len: len + DR.BALL_R, time: DR.CURL, color: TC.roll });
          sfx('daruma_curl', m.pos);
          return false;
        }
        rs.rollCd = 1;
      }
      if (d > 1.1 + tr + m.bodyR * 0.6) { m.chase(target, dt, slow); return true; }
      m.faceTo(target.pos.x, target.pos.z, dt);
      return false;
    }
  }
}
function darumaUpdate(m, dt) {
  interrupted(m, DR_WINDS, 'walk');
  if (!m.aggro) act(m, 'idle');
  const M = m.model;
  if (m.aggro && M.act === 'idle' && every(M, 'grumbleT', dt, 5, 9) && playerIn(m.G, m.pos.x, m.pos.z, 12)) sfx('daruma_grumble', m.pos);
}

// ================================================================================================= TSURARA
// Icicle wraith: a pale ice ghost (round head, body tapering to a curling wisp tail), glowing cyan eyes, a small "o"
// mouth, icicle hair hanging round the back and sides of its head and a little crystal crown, stubby icicle arms. It
// floats at 4–7 m, blinks elsewhere every few seconds (it shatters into glints; a violet ring marks where it will
// reappear), and raises its arms to call icicle rain: 3 (4) circles, one on you, the rest close by.
const TS = { CAST: 0.55, BLINK: 0.36, GONE: 0.24, APPEAR: 0.34, R: 1.0 };
function tsuraraSpec(v) {
  const body = col(v.body), bodyD = col(v.bodyD), white = col('#ffffff'), tip = col(v.tip || '#ffffff');
  const PROF = [[0.001, 0.0], [0.05, 0.03], [0.1, 0.1], [0.16, 0.2], [0.22, 0.33], [0.265, 0.46], [0.28, 0.57], [0.27, 0.67], [0.235, 0.76], [0.17, 0.84], [0.09, 0.895], [0.001, 0.915]];
  const rAt = y => { for (let i = 1; i < PROF.length; i++) if (y <= PROF[i][1]) { const [r0, y0] = PROF[i - 1], [r1, y1] = PROF[i]; return r0 + (r1 - r0) * (y - y0) / (y1 - y0); } return 0.001; };
  const sz = (x, y) => Math.sqrt(Math.max(0, rAt(y) ** 2 - x * x));
  const B = [];
  B.push(lathe(PROF, 26, (p, n, o) => { const a = Math.atan2(p.x, p.z); o.copy(body).lerp(bodyD, clamp((0.52 - p.y) * 1.5)); o.lerp(white, (0.5 + 0.5 * Math.sin(a * 6 + p.y * 4)) * 0.14 * clamp(p.y * 2)); }));
  // eyes: glowing cyan ovals in a dark rim, white glints; a little "o" mouth; frosty blush
  for (const k of [-1, 1]) {
    const x = k * 0.1, y = 0.54, z = sz(x, y);
    B.push(ell(0.07, 0.086, 0.03, v.rim || '#1c2c58', [x, y, z - 0.012], [0, k * 0.38, 0], 14));
    B.push(ell(0.056, 0.072, 0.03, v.eye || '#6ef2ff', [x, y, z - 0.004], [0, k * 0.38, 0], 14));
    B.push(ell(0.02, 0.024, 0.012, '#ffffff', [x - k * 0.012 - 0.008, y + 0.028, z + 0.02], [0, 0, 0], 8));
    B.push(ell(0.048, 0.024, 0.012, v.blush || '#9fd4ff', [k * 0.18, 0.45, sz(k * 0.18, 0.45) - 0.002], [0, k * 0.6, 0], 10));
  }
  B.push(ell(0.024, 0.03, 0.014, v.rim || '#1c2c58', [0, 0.445, sz(0, 0.445) - 0.004], [0, 0, 0], 10));
  // crystal crown: three spikes on top
  const crystal = (r, h, p, rot) => paint(xf(new THREE.ConeGeometry(r, h, 6, 1), { p, r: rot }), (q, n, o) => { o.copy(tip).lerp(col(v.crystal || '#9fe6ff'), 0.4 + 0.3 * Math.sin(Math.atan2(n.x, n.z) * 3)); });
  B.push(crystal(0.06, 0.3, [0, 1.03, -0.01], [-0.1, 0, 0]), crystal(0.045, 0.2, [0.1, 0.97, -0.02], [-0.1, 0, -0.5]), crystal(0.045, 0.2, [-0.1, 0.97, -0.02], [-0.1, 0, 0.5]), crystal(0.035, 0.15, [0, 0.95, -0.12], [-0.7, 0, 0]));
  // icicle hair round the sides and back (the face stays clear), hanging from a frosty band
  const C = [];
  const band = new THREE.TorusGeometry(0.275, 0.036, 6, 26, TAU * 0.72); band.rotateX(Math.PI / 2); band.rotateY(-(Math.PI / 2 + TAU * 0.14)); // (the gap faces front)
  C.push(paint(band, (p, n, o) => o.copy(white).lerp(col(v.crystal || '#9fe6ff'), 0.25)));
  const N = 13;
  for (let i = 0; i < N; i++) {
    const a = Math.PI * 0.27 + (i / (N - 1)) * Math.PI * 1.46, u = Math.abs(i - (N - 1) / 2) / ((N - 1) / 2); // u: 0 at the back, 1 by the face
    const h = 0.42 - 0.2 * u + 0.08 * ((i * 7) % 3 === 0 ? 1 : 0) - 0.06 * (i % 2), r = 0.046 + 0.014 * (1 - u) + 0.01 * ((i + 1) % 2);
    const g = new THREE.ConeGeometry(r, h, 5, 2); g.rotateX(Math.PI); g.translate(0, -h / 2, 0); g.rotateX(-0.95 + 0.45 * u); g.rotateY(a); // splayed out: a spiky frill from above
    g.translate(Math.sin(a) * 0.27, 0.005 * (i % 2), Math.cos(a) * 0.27);
    C.push(paint(g, (q, n, o) => { const k = clamp(-q.y / h); o.copy(col(v.crystal || '#9fe6ff')).lerp(tip, k * 0.8); if (n.x * Math.cos(a) - n.z * Math.sin(a) > 0.3) o.lerp(white, 0.3); }));
  }
  // stubby icicle arms (one part: they rise together to call the rain)
  const A = [];
  for (const k of [-1, 1]) {
    A.push(ell(0.055, 0.12, 0.055, body.getStyle(), [k * 0.26, -0.08, 0.04], [0.1, 0, k * 0.55], 10));
    A.push(paint(xf(new THREE.ConeGeometry(0.04, 0.12, 6), { p: [k * 0.325, -0.19, 0.055], r: [Math.PI + 0.1, 0, -k * 0.55] }), (q, n, o) => o.copy(col(v.crystal || '#9fe6ff')).lerp(tip, 0.5)));
  }
  // the wisp tail curling back
  const T = [tubeC([[0, 0.02, 0, 0.07], [0, -0.07, -0.08, 0.056], [0, -0.1, -0.2, 0.04], [0, -0.05, -0.3, 0.026], [0, 0.04, -0.34, 0.012]], (p, n, o) => o.copy(bodyD).lerp(white, clamp(-p.z * 1.5) * 0.4), 8)];
  const glow = 'outgoingLight += diffuseColor.rgb * 0.95 * step(0.62, diffuseColor.g) * step(0.8, diffuseColor.b) * step(diffuseColor.r, 0.55);'
    + ' outgoingLight += vec3(0.5, 0.82, 1.0) * pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.4) * 0.42;';
  return { mat: { fragOut: glow }, parts: [
    { name: 'body', geo: B },
    { name: 'crown', geo: C, at: [0, 0.72, 0] },
    { name: 'arms', geo: A, at: [0, 0.44, 0.02] },
    { name: 'tail', geo: T, at: [0, 0.01, 0] },
  ] };
}
function buildTsurara(v) {
  const M = assemble('tsurara:' + v.key, () => tsuraraSpec(v));
  const I = M.inner, CR = M.g.crown, AR = M.g.arms, TL = M.g.tail;
  let spin = 0;
  M.animate = (dt, t, moving) => {
    const a = M.act, k = (M.actT += dt);
    let y = 0.42 + Math.sin(t * 2.2) * 0.07, s = 1, rx = moving ? 0.14 : 0, rz = Math.sin(t * 1.3) * 0.06, arm = Math.sin(t * 1.7) * 0.12, spinV = 0, jit = 0;
    switch (a) {
      case 'cast': { const p = ease.outCubic(clamp(k / TS.CAST)); y += 0.2 * p; arm = -2.3 * p; rx = -0.22 * p; jit = p; break; }
      case 'recoil': { const p = clamp(k / 0.45); arm = -2.3 * (1 - ease.outCubic(p)); rx = 0.16 * Math.sin(p * Math.PI); y += 0.2 * (1 - p); break; }
      case 'blinkOut': { const p = clamp(k / TS.BLINK); s = 1 - ease.inCubic(p); spinV = 22 * p; y += 0.25 * p; arm = -1.2 * p; break; }
      case 'gone': s = 0; break;
      case 'blinkIn': { const p = clamp(k / TS.APPEAR); s = ease.outBack(p, 2.2); spinV = 16 * (1 - p); arm = -1.2 * (1 - p); break; }
    }
    if (spinV) spin += dt * spinV; else spin += (Math.round(spin / TAU) * TAU - spin) * Math.min(1, dt * 9);
    I.visible = s > 0.01;
    I.position.y = y; I.scale.setScalar(Math.max(0.001, s)); I.rotation.set(rx, spin, rz);
    AR.rotation.x = arm;
    CR.rotation.set(Math.sin(t * 2.3) * 0.03, 0, Math.sin(t * 3.1) * 0.03 + Math.sin(t * 43) * 0.035 * jit);
    TL.rotation.set(Math.sin(t * 2.4) * 0.22, Math.sin(t * 1.7) * 0.45, 0);
  };
  return M;
}
function tsuraraBlinkSpot(m, target) {
  const W = m.world, tp = target.pos;
  let best = null;
  for (let i = 0; i < 16; i++) {
    const a = rand(0, TAU), r = rand(4.6, 6.4), x = tp.x + Math.cos(a) * r, z = tp.z + Math.sin(a) * r;
    if (!W.walkable(x, z) || W.collision?.solidAt?.(x, z, 0.4) || !m.mode.los(_sp.set(x, 0, z), tp)) continue;
    const sc = -Math.abs(dist(x, z, m.pos.x, m.pos.z) - 5) + rand(0, 1.5); // a lateral hop, not across the map
    if (!best || sc > best.sc) best = { x, z, sc };
  }
  return best;
}
const TS_WINDS = new Set(['cast']);
function tsuraraAI(m, dt, target, d, slow) {
  const rs = m.rs, G = m.G, fx = frostFx(G), Cb = m.mode.combat, W = m.world, tr = target.radius || 0.3;
  rs.t += dt; rs.blinkCd = (rs.blinkCd ?? rand(2.5, 4)) - dt;
  const go = (st, pose = st) => { rs.st = st; rs.t = 0; act(m, pose); };
  if (rs.st === 'cast' && m.state !== 'windup') go('float', 'idle');
  switch (rs.st) {
    case 'cast':
      m.faceTo(target.pos.x, target.pos.z, dt);
      if (emitM(rs, 'eT', 30, dt)) { const a = rand(0, TAU), r = rand(0.4, 0.8), h = m.pos.y + 1.55 * m.scale; fx.p('a', FR.STAR, m.pos.x + Math.cos(a) * r, h + rand(-0.2, 0.2), m.pos.z + Math.sin(a) * r, { vx: -Math.cos(a) * r * 2, vz: -Math.sin(a) * r * 2, life: 0.35, size: 0.26, size1: 0.05, color: ICE.glow, alpha: 0.3, alpha1: 1 }); }
      if (rs.t >= TS.CAST) {
        go('recover', 'recoil'); m.state = 'attack';
        const n = m.model.variant?.shots || 3, px = target.pos.x, pz = target.pos.z, raw = Math.max(1, Math.round(roll(m) * 0.72));
        for (let i = 0; i < n; i++) {
          let x = px, z = pz;
          if (i) for (let k = 0; k < 8; k++) { const a = rand(0, TAU), r = rand(1.5, 2.7); x = px + Math.cos(a) * r; z = pz + Math.sin(a) * r; if (W.walkable(x, z)) break; x = px; z = pz; }
          icicleDrop(m, x, z, { r: TS.R, time: 0.8 + i * 0.2, raw, color: TC.icicle });
        }
        fx.twinkle(m.pos.x, m.pos.y + 1.6 * m.scale, m.pos.z, { n: 8, r: 0.5, frame: FR.GLINT, size: 0.45, life: 0.5 });
        sfx('tsurara_cast', m.pos);
      }
      return false;
    case 'recover': if (rs.t >= 0.45) { go('float', 'idle'); m.state = 'chase'; m.cd = rand(3.2, 4.4); } return false;
    case 'blinkOut':
      if (rs.t >= TS.BLINK) {
        Cb.remove(m); m.untargetable = true; m.shadow.visible = false;
        fx.shatter(m.pos.x, m.pos.y + 0.8, m.pos.z, { n: 10, r: 0.35, speed: 3.5 });
        go('gone');
      }
      return false;
    case 'gone':
      if (rs.t >= TS.GONE) {
        m.pos.set(rs.bx, W.heightAt(rs.bx, rs.bz), rs.bz); m.facing = Math.atan2(target.pos.x - rs.bx, target.pos.z - rs.bz);
        m.untargetable = false; m.shadow.visible = true;
        if (m.alive && G.dungeon === m.mode) Cb.add(m);
        fx.twinkle(m.pos.x, m.pos.y + 0.5, m.pos.z, { n: 10, r: 0.5, frame: FR.GLINT, size: 0.5, life: 0.5, rise: 1.4 });
        fx.burst(m.pos.x, m.pos.y + 0.8, m.pos.z, { frame: FR.FLAKE, n: 8, colors: PAL_SNOW, speed: 2.5, up: 1.5, size: 0.24, grav: 1, drag: 2, life: 0.8 });
        sfx('tsurara_blink_in', m.pos);
        go('blinkIn');
      }
      return false;
    case 'blinkIn': if (rs.t >= TS.APPEAR) { go('float', 'idle'); m.cd = Math.max(Math.min(m.cd, rand(0.5, 1)), 0.3); } return false;
    default: {
      if (rs.st !== 'float') go('float', 'idle');
      const los = m.mode.los(m.pos, target.pos);
      if (rs.blinkCd <= 0 && (d < 2.6 + tr || !los || rs.t > 4.5)) {
        const b = tsuraraBlinkSpot(m, target);
        if (b) {
          rs.bx = b.x; rs.bz = b.z; rs.blinkCd = rand(4.5, 6.5);
          fx.tele({ shape: 'circle', x: b.x, z: b.z, r: 0.85, time: TS.BLINK + TS.GONE, color: TC.blink });
          go('blinkOut'); sfx('tsurara_blink_out', m.pos);
          return false;
        }
        rs.blinkCd = 1;
      }
      if (m.cd <= 0 && d < 10 && los) {
        if ((fx.icicleN || 0) > 5) m.cd = rand(0.5, 1.1); // the sky is busy: wait for a gap
        else { go('cast'); m.state = 'windup'; return false; }
      }
      return kite(m, target, d, dt, slow, 4.2, 7.2, 0.6);
    }
  }
}
function tsuraraUpdate(m, dt) {
  interrupted(m, TS_WINDS, 'float');
  const M = m.model, G = m.G;
  if (!m.aggro) act(m, 'idle');
  if (M.act !== 'gone' && M.act !== 'blinkOut' && Math.random() < dt * 3) frostFx(G).p('n', FR.FLAKE, m.pos.x + rand(-0.35, 0.35), m.pos.y + rand(0.3, 1.1) * m.scale, m.pos.z + rand(-0.35, 0.35), { vx: rand(-0.2, 0.2), vy: -0.35, vz: rand(-0.2, 0.2), life: 1.2, size: 0.13, size1: 0.05, color: ICE.white, alpha: 0.9, alpha1: 0, spin: 2 });
  if (M.act === 'idle' && every(M, 'wailT', dt, 6, 12) && playerIn(G, m.pos.x, m.pos.z, 11)) sfx('tsurara_wail', m.pos);
}

// ================================================================================================= defs
let ID = 0;
const spawnFx = (m, kinds) => {
  m.rs.id = ++ID;
  const fx = frostFx(m.G);
  for (const k of kinds) fx.want(k, k === 'snowball' ? f => f.mkSnowball() : f => f.mkIcicle(), k === 'snowball' ? 6 : 4);
};
export const MONSTERS = {
  yukiwarashi: mdef({
    name: 'Yuki-warashi', build: 'yukiwarashi', radius: 0.34, vr: 0.4, speed: 2.5, pack: 1.1, material: 'wood',
    attack: { type: 'ranged', range: 9, cd: 3, windup: WR.WIND },
    stats: { name: 'Yuki-warashi', life: 0.75, dmg: 1.0, def: 0.8, speed: 1.05, xp: 1.2, element: 'frost', ranged: true, res: { frost: 50, fire: -25 } },
    variants: [
      { key: 0, straw: '#d8b262', strawD: '#9a7434', strawL: '#f0d890', inner: '#6a4c26', hair: '#2c2436', mitten: '#e8403c', scarf: '#e8403c', boot: '#b88a4c' },
      { key: 1, name: 'Snowdrift Warashi', straw: '#cdb888', strawD: '#8c7a5a', strawL: '#ece0c0', inner: '#5a4a36', hair: '#3a2c2a', hairHi: '#8a7a9a', mitten: '#ff6a98', scarf: '#4a86e8', boot: '#9a7a5a', frost: true, heap: true },
      { key: 2, name: 'Camellia Warashi', straw: '#c89a52', strawD: '#86602c', strawL: '#e8c880', inner: '#5a3e22', hair: '#1e1a2a', mitten: '#d8303a', scarf: '#8a4ab8', boot: '#a8743c', flower: true, shots: 5 },
    ],
    ai: warashiAI, update: warashiUpdate,
    onSpawn: m => spawnFx(m, ['snowball']),
    onDeath: m => { const fx = frostFx(m.G), p = m.pos; sfx('warashi_die', p); fx.splat(p.x, p.y + 0.5, p.z, 1, true); fx.burst(p.x, p.y + 0.5, p.z, { frame: FR.CHUNK, n: 8, colors: [col(m.model.variant?.straw || '#d8b262')], speed: 3, up: 3, size: 0.16, grav: 9, life: 0.8 }); },
    damageTaken: hurt('warashi_hurt'),
  }),
  yukidaruma: mdef({
    name: 'Yuki-daruma', build: 'yukidaruma', radius: 0.55, vr: 0.6, speed: 1.85, pack: 0.75, material: 'stone',
    attack: { type: 'charge', range: 10, cd: 5, windup: DR.CURL, dash: DR.ROLL },
    stats: { name: 'Yuki-daruma', life: 1.6, dmg: 1.3, def: 1.3, speed: 0.95, xp: 1.45, element: 'frost', res: { frost: 60, fire: -30, phys: 10 } },
    variants: [
      { key: 0 },
      { key: 1, name: 'Dusk Daruma', bucket: '#4a6ad8', bucketTop: '#3a54b0', scarf: '#e8503a', stripe: '#fff2d8', mitten: '#e8503a' },
      { key: 2, name: 'Grand Daruma', bucket: '#e8b83a', bucketTop: '#c8942a', scarf: '#8a4ab8', stripe: '#ffe8a0', mitten: '#8a4ab8', snow: '#fbf8ff', shade: '#cfc6ee' },
    ],
    ai: darumaAI, update: darumaUpdate,
    onSpawn: m => spawnFx(m, []),
    onDeath: m => { const fx = frostFx(m.G), p = m.pos; sfx('daruma_die', p); fx.splat(p.x, p.y + 0.7, p.z, 1.6, true); fx.puffs(p.x, p.y + 0.6, p.z, { n: 10, size: 0.7, speed: 2.2, up: 1.2, life: 1 }); fx.burst(p.x, p.y + 1.2, p.z, { frame: FR.DOT, n: 7, colors: [col('#2c2934')], speed: 2.5, up: 4, size: 0.14, grav: 12, life: 0.8, alpha1: 1 }); },
    damageTaken: hurt('daruma_hurt', 0.6),
  }),
  tsurara: mdef({
    name: 'Tsurara', build: 'tsurara', scale: 1.15, radius: 0.36, vr: 0.45, speed: 2.6, pack: 0.9, material: 'crystal',
    attack: { type: 'ranged', range: 9, cd: 3.5, windup: TS.CAST },
    stats: { name: 'Tsurara', life: 0.8, dmg: 1.15, def: 0.8, speed: 1.1, xp: 1.3, element: 'frost', ranged: true, res: { frost: 75, fire: -30 } },
    variants: [
      { key: 0, body: '#e6f6ff', bodyD: '#a6d8f6' },
      { key: 1, name: 'Aurora Tsurara', body: '#e8fff4', bodyD: '#9ee0d0', crystal: '#c8a8ff', eye: '#7affd8', blush: '#d8b8ff' },
      { key: 2, name: 'Black-ice Tsurara', body: '#5a6ca8', bodyD: '#2a3464', crystal: '#7ad8ff', eye: '#6ef6ff', rim: '#0e1430', blush: '#7a9ae8', shots: 4 },
    ],
    ai: tsuraraAI, update: tsuraraUpdate,
    onSpawn: m => spawnFx(m, ['icicle']),
    onDeath: m => { const fx = frostFx(m.G), p = m.pos; sfx('tsurara_die', p); fx.shatter(p.x, p.y + 0.9, p.z, { n: 20, r: 0.4, speed: 5 }); fx.puffs(p.x, p.y + 0.8, p.z, { n: 6, size: 0.5, color: ICE.pale, speed: 1.5, up: 1 }); },
    damageTaken: hurt('tsurara_hurt'),
  }),
};
export const BUILD = { yukiwarashi: buildWarashi, yukidaruma: buildDaruma, tsurara: buildTsurara };
