// Momiji Hollow monsters (kuri, kakashi, momijiWisp) — docs/REGIONS.md §2 / §3.4. Owned by the monsters agent.
// Exports MONSTERS (defs in the monsters.js format + stats / material / ai / update / onSpawn / onDeath / damageTaken)
// and BUILD (model builders -> { root, pivot, body, mat, outline }), made with the region monster kit in ./bamboo.js.
// Sounds live in ./maple.sfx.js (pure data); particles come from the hollow's shared effect host (../bosses/fx_tanuki.js,
// also Danzaburō's), so the region pays for one set of maple-leaf particle layers.
//   KURI         a glossy chestnut imp in a spiky burr that sits open behind it like a collar. It curls shut (the burr
//                closes, it winds back) and ROLLS down a lane at you, bonks into whatever stops it and sits dizzy; up close
//                the burr SNAPS shut round it (circle). Curled up it only takes half damage. Roasted kuri leave embers.
//   KAKASHI      a one-legged hopping scarecrow: straw mino, patched kimono on a cross-bar, a henohenomoheji face and a
//                straw hat with crows perched on it. It rattles and its crows SWOOP down lanes at you, then fly back to
//                their perch; up close it HOPS onto you (circle). The Oni Kakashi (no hat, horns) keeps three crows.
//   MOMIJI WISP  a glowing lantern-sprite with a mane of maple leaves and a ring of orbiting leaves. It keeps its
//                distance and flings a FLURRY of leaves (cone); crowded, it WHIRLS (circle) and scatters into leaves to
//                reform a few metres away. Ginkgo and Ember variants.
// Nothing here allocates per frame in steady state beyond particle spawn records.
import * as THREE from 'three';
import { V, col, ell, cone, shell, paint, merge, xf, INK, lathe, cyl, tubeC, eyesCute, cheeks, smile, assemble, act, mdef, every, roll, sfx, playerIn, hitArea, kite, push, tele, take, give, bolt, patch, puff } from './bamboo.js';
import { EDGE_OUT } from '../../dungeon/monsters.js';
import { mergeVertices, RoundedBox } from '../../gfx/geom.js';
import { makeToon, makeOutline } from '../../gfx/materials.js';
import { rand, clamp, TAU, dist, angleDiff, ease } from '../../core/util.js';
import { mapleFx, MCOL, F } from '../bosses/fx_tanuki.js';

const TELE = '#ff3a7a'; // pink-red: the veil + ink contour read on straw, earth and red leaf litter
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
const fxOf = m => mapleFx(m.G.vfx, m.world);

// ================================================================================================= leaves
// 7-lobed momiji leaf, flat in XY: the stem joint at the origin, the tip toward +y, `size` from the joint to the tip.
const LOBES = [[0, 1], [0.8, 0.93], [-0.8, 0.93], [1.58, 0.76], [-1.58, 0.76], [2.36, 0.42], [-2.36, 0.42]];
function lobeR(phi) { let r = 0.27; for (const [a, L] of LOBES) { const x = Math.abs(angleDiff(a, phi)); if (x < 0.4) r += L * 0.73 * Math.pow(1 - x / 0.4, 1.6); } return r; }
function flatLeaf(sh, t) {
  let g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -t / 2); g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-5); g.computeVertexNormals(); // shared rim normals: a continuous ink hull
  return g;
}
export function mapleLeaf(size, color, { t = 0.02, n = 40, stem = true } = {}) {
  const angs = []; for (let i = 0; i < n; i++) angs.push(-Math.PI + (i + 0.5) / n * TAU);
  for (const [a] of LOBES) angs.push(a);
  angs.sort((a, b) => a - b);
  const sh = new THREE.Shape();
  angs.forEach((phi, i) => { const r = lobeR(phi) * size, x = Math.sin(phi) * r, y = Math.cos(phi) * r; if (i) sh.lineTo(x, y); else sh.moveTo(x, y); });
  const g = flatLeaf(sh, t), c = col(color), dark = c.clone().multiplyScalar(0.8), light = c.clone().lerp(col('#fff2c0'), 0.28);
  paint(g, (p, nn, o) => o.copy(light).lerp(dark, clamp((Math.hypot(p.x, p.y) / size - 0.3) * 1.4))); // pale heart, deep tips
  if (!stem) return g;
  return merge([g, tubeC([[0, size * 0.1, 0, size * 0.04], [size * 0.03, -size * 0.3, size * 0.03, size * 0.03]], dark.getStyle(), 4)]);
}
/** ginkgo fan leaf with its notch, same frame as mapleLeaf */
export function ginkgoLeaf(size, color, { t = 0.02 } = {}) {
  const sh = new THREE.Shape(), n = 22, spread = 1.0;
  sh.moveTo(0, -size * 0.02);
  for (let i = 0; i <= n; i++) {
    const u = i / n, phi = -spread + u * 2 * spread, notch = Math.max(0, 1 - Math.abs(phi) / 0.14);
    const r = size * (1 - 0.28 * notch + 0.03 * Math.sin(u * 44));
    sh.lineTo(Math.sin(phi) * r, Math.cos(phi) * r * 0.86 + size * 0.1);
  }
  const g = flatLeaf(sh, t), c = col(color), dark = c.clone().multiplyScalar(0.84), light = c.clone().lerp(col('#fffbe0'), 0.3);
  paint(g, (p, nn, o) => o.copy(light).lerp(dark, clamp(p.y / size * 1.2)));
  return merge([g, tubeC([[0, size * 0.05, 0, size * 0.035], [0, -size * 0.35, size * 0.02, size * 0.028]], dark.getStyle(), 4)]);
}
/** transform a built geometry: rotation (Euler order `order`), then position */
function place(g, p, rx, ry, rz, order = 'YXZ', s = 1) {
  return g.applyMatrix4(new THREE.Matrix4().compose(V(p[0], p[1], p[2]), _q.setFromEuler(new THREE.Euler(rx, ry, rz, order)), V(s, s, s)));
}
const hurt = (name, gap = 0.45) => (m, dmg) => { const t = m.G.engine?.time || 0; if (t - (m._hurtT || -9) > gap) { m._hurtT = t; sfx(name, m.pos); } return dmg; };

// warm-up, once per region scene: the effect host's pooled meshes / particle layers and the pooled crows are drawn a few
// frames far below the ground (behind the region iris) so the first swoop / flurry doesn't compile anything mid-fight
const WARM = new WeakSet();
function warmScene(m) {
  const sc = m.world?.scene; if (!sc || WARM.has(sc) || !m.G.vfx) return;
  WARM.add(sc);
  fxOf(m).warm();
  const G = m.G, crows = [];
  for (let i = 0; i < 3; i++) { const c = take(G, 'mapleCrow', crowFly); c.position.set(rand(-2, 2), -60, rand(-2, 2)); crows.push(c); }
  let f = 0; const done = () => { if (++f < 3) return requestAnimationFrame(done); for (const c of crows) give(c); };
  requestAnimationFrame(done);
}

// ================================================================================================= KURI
// Built around the burr's centre (KU.C above the ground) so the whole ball can roll about it; the burr halves hinge on
// a vertical axis at the back and swing open into a spiky V collar (cream lining forward) or shut into a ball.
const KU = { R: 0.44, C: 0.46, OPEN: 0.5, CURL: 0.72, SPD: 10.5, W: 0.56, DIZZY: 1.3, SNAP_R: 1.25, SNAP_WIND: 0.45 };
const KU_PROF = [[0.001, 0.035], [0.15, 0.045], [0.25, 0.09], [0.3, 0.18], [0.315, 0.3], [0.3, 0.42], [0.255, 0.54], [0.19, 0.65], [0.12, 0.74], [0.06, 0.81], [0.02, 0.855], [0.001, 0.87]];
function kuriR(y) { for (let i = 1; i < KU_PROF.length; i++) if (y <= KU_PROF[i][1]) { const [r0, y0] = KU_PROF[i - 1], [r1, y1] = KU_PROF[i]; return r0 + (r1 - r0) * (y - y0) / (y1 - y0); } return 0.001; }
const kuriZ = (x, y) => Math.sqrt(Math.max(0, kuriR(y) ** 2 - x * x));
const EMBER = 'outgoingLight += diffuseColor.rgb * 0.9 * step(0.85, diffuseColor.r) * step(0.5, diffuseColor.g) * step(diffuseColor.b, 0.35);';
function kuriSpec(v) {
  const C0 = KU.C, R = KU.R, H = R * 0.9;
  const nut = col(v.nut), grain = col(v.nut).multiplyScalar(0.78), base = col(v.base || '#f2dcae');
  const B = [], FE = [];
  B.push(lathe(KU_PROF, 24, (p, n, o) => {
    const a = Math.atan2(p.x, p.z); o.copy(nut);
    if (Math.sin(a * 6 + 0.5) > 0.88 && p.y > 0.24 && p.y < 0.76) o.copy(grain);
    if (p.y < 0.2) o.lerp(base, clamp((0.2 - p.y) / 0.05)); // the pale hilum
  }));
  B.push(ell(0.036, 0.1, 0.016, v.gloss || '#fff0dc', [-0.15, 0.575, kuriZ(-0.15, 0.575) - 0.004], [-0.35, -0.55, 0.3], 10)); // a glossy streak
  B.push(cone(0.028, 0.075, base.getStyle(), [0, 0.89, 0], [0, 0, 0], 6)); // the tufted point
  // face: big eyes, cross brows following the shell, a toothy little grin
  B.push(...eyesCute(0.425, kuriZ(0.112, 0.425) - 0.012, 0.112, 1.35));
  for (const k of [-1, 1]) B.push(tubeC([[k * 0.19, 0.555, kuriZ(0.19, 0.555) + 0.006, 0.016], [k * 0.12, 0.535, kuriZ(0.12, 0.535) + 0.008, 0.017], [k * 0.05, 0.505, kuriZ(0.05, 0.505) + 0.006, 0.015]], INK, 5));
  B.push(...cheeks(0.33, kuriZ(0.19, 0.33) - 0.004, 0.19, 1.15));
  B.push(smile(0.318, kuriZ(0.045, 0.318) - 0.004, 0.045, 0.022, 0.011));
  B.push(cone(0.013, 0.034, '#ffffff', [0.022, 0.302, kuriZ(0.022, 0.3) + 0.002], [Math.PI + 0.25, 0, 0], 5));
  // stubby cream arms, dark little feet
  for (const k of [-1, 1]) {
    B.push(ell(0.065, 0.055, 0.055, base.getStyle(), [k * 0.305, 0.3, 0.06], [0, 0, k * 0.4], 10));
    FE.push(ell(0.08, 0.05, 0.1, v.foot || '#6a3418', [k * 0.12, 0.035, 0.05], [0, k * 0.2, 0], 10));
  }
  if (v.leaf) B.push(place(mapleLeaf(0.17, v.leaf), [0.03, 0.85, -0.03], -0.5, 0.5, -0.4));
  // the burr: two hemispherical shells (cream lining inside) bristling with spikes
  const burr = col(v.burr), burrD = col(v.burr).multiplyScalar(0.78), tip = col(v.tip);
  const half = side => {
    const g = new THREE.SphereGeometry(R, 12, 10, side < 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI, 0, Math.PI);
    paint(g, (p, n, o) => o.copy(burr).lerp(burrD, clamp(-n.y * 0.6 + 0.15)));
    const out = shell(g, 0.93, v.lining || '#d8b27a');
    const N = 72;
    for (let i = 0; i < N; i++) {
      const y = 1 - (i + 0.5) / N * 2, rr = Math.sqrt(1 - y * y), th = i * 2.39996, d = V(Math.cos(th) * rr, y, Math.sin(th) * rr);
      if (d.x * side < 0.07 || d.y < -0.72) continue;
      const h = 0.15 + (i * 7 % 5) * 0.012, cg = new THREE.ConeGeometry(0.042, h, 5, 1);
      cg.translate(0, h / 2, 0); cg.applyQuaternion(_q.setFromUnitVectors(UP, d)); cg.translate(d.x * R * 0.94, d.y * R * 0.94, d.z * R * 0.94);
      out.push(paint(cg, (p, n, o) => { const t = clamp((p.length() - R) / h); o.copy(burr).lerp(tip, t * t); }));
    }
    for (const g2 of out) g2.translate(0, 0, H);
    return out;
  };
  for (const g of B) g.translate(0, -C0, 0);
  for (const g of FE) g.translate(0, -C0, 0);
  // (the feet ride in the body: they tumble with the ball when it rolls, tucked against the closed burr)
  return { mat: v.glow ? { fragOut: EMBER } : {}, parts: [{ name: 'body', geo: [...B, ...FE] }, { name: 'bl', geo: half(-1), at: [0, 0, -H] }, { name: 'br', geo: half(1), at: [0, 0, -H] }] };
}
function buildKuri(v) {
  const M = assemble('kuri:' + v.key, () => kuriSpec(v));
  const I = M.inner, BL = M.g.bl, BR = M.g.br;
  let spin = 0, hop = 0, open = KU.OPEN;
  M.animate = (dt, t, moving) => {
    const a = M.act, k = (M.actT += dt);
    let y = 0, sx = 1, sy = 1, rz = 0, lean = 0, want = KU.OPEN + Math.sin(t * 2.1) * 0.05, rate = 10, spinV = 0;
    switch (a) {
      case 'curl': { // the burr slams shut, it rocks back and winds itself backwards like a bowling ball
        const p = clamp(k / (KU.CURL * 0.45)); want = 0; rate = 12; lean = -0.28 * ease.outCubic(p); sy = 1 - 0.1 * p; sx = 1 + 0.07 * p;
        rz = Math.sin(t * 60) * 0.05 * p; y = -0.03 * p;
        if (k > KU.CURL * 0.45) spinV = -7 * clamp((k - KU.CURL * 0.45) / (KU.CURL * 0.55));
        break;
      }
      case 'roll': want = 0; rate = 30; spinV = KU.SPD / KU.R; y = Math.abs(Math.sin(t * 17)) * 0.05; break;
      case 'bonk': { const p = clamp(k / 0.22); want = 0; sx = 1 + 0.2 * Math.sin(p * Math.PI); sy = 1 - 0.18 * Math.sin(p * Math.PI); break; }
      case 'dizzy': want = KU.OPEN * 1.5; rate = 14; rz = Math.sin(t * 7) * 0.16; lean = Math.cos(t * 7) * 0.08; break;
      case 'snapWind': { const p = ease.outCubic(clamp(k / KU.SNAP_WIND)); want = KU.OPEN + 0.6 * p; lean = -0.14 * p; sy = 1 - 0.08 * p; rz = Math.sin(t * 50) * 0.03 * p; break; }
      case 'snap': { const p = clamp(k / 0.32); want = p < 0.35 ? 0 : KU.OPEN * ease.outBack((p - 0.35) / 0.65); rate = 40; sy = 1 + 0.12 * Math.sin(p * Math.PI); lean = 0.22 * Math.sin(p * Math.PI); break; }
      default: {
        hop = (hop + dt * (moving ? 3.4 : 1.2)) % 1; const h = Math.sin(hop * Math.PI);
        y = moving ? h * 0.12 : 0; sy = 1 + (moving ? (h - 0.4) * 0.12 : Math.sin(t * 2.4) * 0.025); sx = 1 / Math.sqrt(sy);
        rz = Math.sin(t * 1.6) * 0.04 + (moving ? Math.sin(hop * TAU) * 0.07 : 0); lean = moving ? 0.1 : 0;
        if (moving) want += Math.sin(hop * TAU) * 0.1;
      }
    }
    open += (want - open) * Math.min(1, dt * rate);
    if (spinV) spin += dt * spinV; else spin += (Math.round(spin / TAU) * TAU - spin) * Math.min(1, dt * 8);
    I.position.set(0, KU.C + y, 0); I.rotation.set(lean + spin, 0, rz); I.scale.set(sx, sy, sx);
    BL.rotation.y = -open; BR.rotation.y = open;
  };
  M.animate(0, 0, false);
  return M;
}
function emberPatch(m, x, z) {
  const G = m.G, raw = Math.max(1, Math.round(roll(m) * 0.25)), y = m.world.heightAt(x, z);
  for (let i = 0; i < 3; i++) puff(G.vfx.glow, x + rand(-0.3, 0.3), y + 0.08, z + rand(-0.3, 0.3), { life: rand(1.8, 2.4), size: rand(0.35, 0.55), size1: 0.1, color: '#ff7a2a', alpha: 0.8, alpha1: 0, flicker: 12 });
  patch(m, { x, z, r: 0.6, life: 2.2, tick: 0.5,
    update: dt => { if (Math.random() < dt * 5) puff(G.vfx.spark, x + rand(-0.3, 0.3), y + 0.1, z + rand(-0.3, 0.3), { vy: rand(0.8, 1.6), life: 0.6, size: 0.18, size1: 0.02, color: '#ffb040', alpha: 1, alpha1: 0 }); },
    onTick: () => { if (playerIn(G, x, z, 0.55)) m.mode.combat.hitPlayer(raw, { element: 'fire', level: m.level, src: m }); } });
}
function kuriAI(m, dt, target, d, slow) {
  const rs = m.rs, G = m.G, tr = target.radius || 0.3;
  rs.t += dt; rs.snapCd = (rs.snapCd ?? 0.6) - dt;
  const go = (st, pose = st) => { rs.st = st; rs.t = 0; act(m, pose); };
  if ((rs.st === 'curl' || rs.st === 'snapWind') && m.state !== 'windup') go('move', 'idle'); // staggered out of the wind-up
  switch (rs.st) {
    case 'curl':
      m.facing = rs.aim;
      if (rs.t >= KU.CURL) { go('roll'); m.state = 'attack'; m.telegraph = null; rs.trav = 0; rs.hit = false; rs.ember = 0; sfx('kuri_roll', m.pos); }
      return false;
    case 'roll': {
      const step = push(m, rs.dx, rs.dz, KU.SPD * Math.max(0.5, slow), dt); rs.trav += step;
      if (!rs.hit && !target.invuln && dist(target.pos.x, target.pos.z, m.pos.x, m.pos.z) < KU.R * m.scale + tr + 0.3) {
        rs.hit = true; m.dealTo(target, Math.round(roll(m) * 1.25), m.stats.element, 1.6);
        G.vfx.impact(V(target.pos.x, target.pos.y + 0.5, target.pos.z), { color: '#fff0c0', r: 0.9 });
        sfx('kuri_bonk', target.pos);
      }
      fxOf(m).rollDust(m.pos.x, m.pos.z, rs.dx, rs.dz, 'ku-roll', dt, 0.45 * m.scale);
      if (m.model.variant?.glow && (rs.ember += step) > 1.1) { rs.ember = 0; emberPatch(m, m.pos.x, m.pos.z); }
      const blocked = step < KU.SPD * dt * 0.3;
      if (rs.trav >= rs.len || blocked || rs.t > 1.6) {
        go(blocked ? 'bonk' : 'dizzy'); m.state = 'chase'; m.cd = rand(2.6, 3.4);
        if (blocked) { fxOf(m).crash(m.pos.x + rs.dx * 0.4, m.pos.z + rs.dz * 0.4, 1.0, { light: false }); sfx('kuri_bonk', m.pos); }
        fxOf(m).dizzy(m.pos, m.pos.y + 1.05 * m.scale, KU.DIZZY, { r: 0.35, n: 4, size: 0.24 });
      }
      return true;
    }
    case 'bonk': if (rs.t >= 0.22) go('dizzy'); return false;
    case 'dizzy': if (rs.t >= KU.DIZZY) go('move', 'idle'); return false;
    case 'snapWind':
      m.faceTo(target.pos.x, target.pos.z, dt);
      if (rs.t >= KU.SNAP_WIND) {
        go('snap'); m.state = 'attack'; m.telegraph = null;
        hitArea(m, m.pos.x, m.pos.z, KU.SNAP_R, Math.round(roll(m) * 1.1), m.stats.element, 1.3);
        const fx = fxOf(m), y = m.pos.y + 0.5;
        fx.chips(m.pos.x, y, m.pos.z, { n: 8, color: col(m.model.variant?.burr || '#8cc43e'), speed: 5, size: 0.13 });
        G.vfx.ring(m.pos, { color: '#fff4d0', r0: 0.3, r1: KU.SNAP_R * 1.05, life: 0.25 });
        sfx('kuri_snap', m.pos);
      }
      return false;
    case 'snap': if (rs.t >= 0.34) { go('move', 'idle'); m.state = 'chase'; rs.snapCd = rand(1.6, 2.2); } return false;
    default: {
      if (rs.st !== 'move') go('move', 'idle');
      const los = m.mode.los(m.pos, target.pos);
      if (m.cd <= 0 && los && d > 2.2 && d < 8.5) {
        rs.aim = Math.atan2(target.pos.x - m.pos.x, target.pos.z - m.pos.z); rs.dx = Math.sin(rs.aim); rs.dz = Math.cos(rs.aim);
        rs.len = Math.min(d + 3, 10); m.facing = rs.aim;
        go('curl'); m.state = 'windup';
        m.telegraph = tele(G, { shape: 'lane', x: m.pos.x, z: m.pos.z, r: KU.W, dir: rs.aim, len: rs.len + 0.5, time: KU.CURL, color: TELE });
        sfx('kuri_curl', m.pos);
        return false;
      }
      if (d < KU.SNAP_R - 0.15 + tr && rs.snapCd <= 0) {
        go('snapWind'); m.state = 'windup';
        m.telegraph = tele(G, { x: m.pos.x, z: m.pos.z, r: KU.SNAP_R, time: KU.SNAP_WIND, color: TELE });
        sfx('kuri_snapwind', m.pos);
        return false;
      }
      if (d > 1.0 + tr) { m.chase(target, dt, slow); return true; }
      m.faceTo(target.pos.x, target.pos.z, dt);
      return false;
    }
  }
}
function kuriUpdate(m) {
  const rs = m.rs;
  if ((m.status.stun > 0 || m.status.freeze > 0) && rs.st === 'roll') { rs.st = 'dizzy'; rs.t = 0; act(m, 'dizzy'); m.state = 'chase'; }
  if (!m.aggro) act(m, 'idle');
}

// ================================================================================================= KAKASHI
// A scarecrow on one wooden leg: straw mino skirt, patched kimono on the cross-bar with straw tufts at the ends, a burlap
// head with a henohenomoheji face (の eyes, へ brows and mouth), a straw sugegasa pushed back, crows on the arm and hat.
const KK = { WIND: 0.8, LANE: 0.5, SPD: 11.5, TA: 0.3, BACK: 1.35, HOP_WIND: 0.36, HOP_AIR: 0.5, HOP_R: 1.45, HY: 1.45, HR: 0.2 };
function crowParts(c, hi, flying = false) {
  const P = [];
  P.push(ell(0.085, 0.075, 0.115, c, [0, 0.085, -0.01], [0.25, 0, 0], 10));
  P.push(ell(0.066, 0.064, 0.066, c, [0, 0.165, 0.065], [0, 0, 0], 10));
  P.push(cone(0.026, 0.08, '#ffb030', [0, 0.158, 0.145], [Math.PI / 2, 0, 0], 6));
  for (const k of [-1, 1]) {
    P.push(ell(0.022, 0.025, 0.012, '#ffffff', [k * 0.036, 0.182, 0.108], [0, k * 0.5, 0], 6), ell(0.012, 0.014, 0.008, '#1a1020', [k * 0.039, 0.18, 0.117], [0, k * 0.5, 0], 6));
    if (!flying) { P.push(ell(0.03, 0.058, 0.1, hi, [k * 0.075, 0.095, -0.025], [0.3, 0, k * 0.22], 8)); P.push(cone(0.012, 0.05, '#e89a2a', [k * 0.03, 0.02, 0.025], [0, 0, 0], 4)); }
  }
  P.push(ell(0.045, 0.012, 0.085, hi, [0, 0.07, -0.14], [-0.35, 0, 0], 8));
  return P;
}
function kakashiSpec(v) {
  const straw = col('#e4b85a'), straw2 = col('#b0823a'), kim = col(v.kimono), kim2 = col(v.kimono).multiplyScalar(0.78), wood = '#8a5a34', ink = '#2a1c24';
  const HY = KK.HY, HR = KK.HR, B = [];
  B.push(ell(0.075, 0.04, 0.1, '#6a4428', [0, 0.035, 0.015], [0, 0, 0], 10)); // wooden foot block
  B.push(cyl(0.034, 0.042, 0.66, wood, [0, 0.36, 0], [0, 0, 0], 7));          // the one leg
  // straw mino with a ragged hem
  const sk = new THREE.LatheGeometry([[0.35, 0.4], [0.33, 0.5], [0.27, 0.68], [0.2, 0.85], [0.14, 0.98]].map(([r, y]) => new THREE.Vector2(r, y)), 26);
  { const P = sk.attributes.position; for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i); if (y < 0.45) P.setY(i, y - 0.07 * Math.abs(Math.sin(Math.atan2(x, z) * 6.5))); } sk.computeVertexNormals(); }
  paint(sk, (p, n, o) => { const a = Math.atan2(p.x, p.z); o.copy(straw); if (Math.sin(a * 19 + p.y * 7) > 0.3) o.lerp(straw2, 0.6); if (p.y > 0.9) o.lerp(straw2, 0.3); });
  B.push(...shell(sk, 0.95, '#a8783a'));
  B.push(paint(xf(new THREE.TorusGeometry(0.205, 0.03, 5, 18), { p: [0, 0.965, 0], r: [Math.PI / 2, 0, 0] }), (p, n, o) => o.set(Math.sin(Math.atan2(p.x, p.z) * 18) > 0 ? '#d8a850' : '#b8883a')));
  // patched kimono torso with a cream V collar
  B.push(lathe([[0.2, 0.93], [0.225, 1.02], [0.215, 1.13], [0.17, 1.22], [0.09, 1.27], [0.001, 1.285]], 20, (p, n, o) => o.copy(p.y < 0.99 ? kim2 : kim)));
  for (const k of [-1, 1]) B.push(tubeC([[k * 0.1, 1.228, 0.13, 0.019], [k * 0.05, 1.13, 0.205, 0.019], [k * 0.012, 1.04, 0.226, 0.017]], '#e8dcc0', 5));
  B.push(paint(xf(new THREE.BoxGeometry(0.1, 0.085, 0.016), { p: [0.1, 1.07, 0.198], r: [0, 0.45, 0.12] }), (p, n, o) => o.set(v.patch)));
  // the cross-bar arms, kimono sleeves with a patch, straw bursting out of the ends
  B.push(cyl(0.028, 0.028, 1.3, wood, [0, 1.13, 0], [0, 0, Math.PI / 2], 7));
  for (const k of [-1, 1]) {
    B.push(paint(xf(new RoundedBox(0.34, 0.27, 0.12, 1, 0.045), { p: [k * 0.33, 1.07, 0], r: [0, 0, k * 0.06] }), (p, n, o) => o.copy(p.y < 0.955 ? kim2 : kim)));
    if (k < 0) B.push(paint(xf(new THREE.BoxGeometry(0.1, 0.08, 0.016), { p: [-0.37, 1.04, 0.064], r: [0, 0, -0.25] }), (p, n, o) => o.set(v.patch)));
    for (let j = 0; j < 5; j++) { const a = (j - 2) * 0.34; B.push(cone(0.036, 0.17, j % 2 ? '#e8c060' : '#d0a048', [k * (0.72 + Math.cos(a) * 0.02), 1.13 + Math.sin(a) * 0.075, (j % 2 - 0.5) * 0.05], [0, 0, -k * Math.PI / 2 + a * k], 5)); }
    if (v.persimmons) for (let j = 0; j < 3; j++) { // hoshigaki drying on strings
      const x = k * (0.2 + j * 0.13), yb = 1.02 - j * 0.03;
      B.push(tubeC([[x, 1.12, 0.05, 0.005], [x, yb + 0.06, 0.05, 0.005]], '#e8dcc0', 3), ell(0.045, 0.055, 0.045, '#f07a2a', [x, yb, 0.05], [0, 0, 0], 7), ell(0.022, 0.012, 0.022, '#5a3a1a', [x, yb + 0.05, 0.05], [0, 0, 0], 5));
    }
  }
  // burlap head, straw neck, rope tie
  B.push(cyl(0.05, 0.07, 0.1, '#d8a850', [0, 1.3, 0], [0, 0, 0], 8));
  const headC = col(v.head || '#efe0bc'), headD = headC.clone().multiplyScalar(0.92);
  B.push(paint(xf(new THREE.SphereGeometry(HR, 18, 12), { p: [0, HY, 0] }), (p, n, o) => o.copy((Math.sin(p.x * 140) + Math.sin(p.y * 140 + p.z * 90)) > 1.5 ? headD : headC)));
  B.push(paint(xf(new THREE.TorusGeometry(0.1, 0.022, 5, 14), { p: [0, HY - 0.16, 0], r: [Math.PI / 2 + 0.1, 0, 0] }), (p, n, o) => o.set('#b88a40')));
  // henohenomoheji, painted in ink on the sack
  const on = (u, w, lift = 0.004) => [u, HY + w, Math.sqrt(Math.max(0, HR * HR - u * u - w * w)) + lift];
  const stroke = (pts, r = 0.011) => tubeC(pts.map(([u, w]) => [...on(u, w), r]), ink, 5);
  for (const k of [-1, 1]) {
    B.push(v.oni ? stroke([[k * 0.14, 0.105], [k * 0.045, 0.06]], 0.014) : stroke([[k * 0.135, 0.068], [k * 0.095, 0.098], [k * 0.04, 0.072]]));
    const cx = k * 0.085, cy = 0.01, R0 = 0.042, eye = [[cx + 0.004, cy + 0.03], [cx - 0.016, cy - 0.028]];
    for (let j = 0; j <= 9; j++) { const a = (235 - j * 34) * Math.PI / 180; eye.push([cx + Math.cos(a) * R0, cy + Math.sin(a) * R0]); }
    B.push(stroke(eye, 0.0105));
    B.push(ell(0.04, 0.022, 0.012, '#ff9ab0', on(k * 0.135, -0.062, -0.002), [0, k * 0.6, 0], 8));
  }
  B.push(stroke([[0.006, -0.012], [-0.004, -0.048], [0.012, -0.064], [0.027, -0.052]], 0.008));
  B.push(stroke([[-0.062, -0.1], [-0.026, -0.08], [0.058, -0.112]], 0.011));
  if (v.oni) { // horns and a pair of fangs
    for (const k of [-1, 1]) { B.push(cone(0.038, 0.12, '#fff4d8', [k * 0.09, HY + 0.2, 0.02], [0, 0, -k * 0.35], 7)); B.push(cone(0.012, 0.03, '#ffffff', [k * 0.022, HY - 0.098, on(k * 0.022, -0.1)[2] + 0.004], [Math.PI, 0, 0], 4)); }
    B.push(paint(xf(new THREE.TorusGeometry(0.195, 0.022, 5, 20), { p: [0, HY + 0.07, 0], r: [Math.PI / 2 - 0.12, 0, 0] }), (p, n, o) => o.set(Math.sin(Math.atan2(p.x, p.z) * 7) > 0.3 ? '#ffffff' : '#e8403a'))); // hachimaki
  }
  let perchB = [0, HY + HR, -0.02];
  if (v.hat !== false) { // straw sugegasa pushed back off the face, a red cord round the crown
    const hat = new THREE.LatheGeometry([[0.36, 0], [0.33, 0.014], [0.29, 0.035], [0.24, 0.063], [0.2, 0.084], [0.17, 0.1], [0.11, 0.13], [0.06, 0.155], [0.001, 0.17]].map(([r, y]) => new THREE.Vector2(r, y)), 24);
    paint(hat, (p, n, o) => { const a = Math.atan2(p.x, p.z), r = Math.hypot(p.x, p.z); o.set(Math.cos(a * 12) > 0.6 || Math.abs(r - 0.29) < 0.01 || Math.abs(r - 0.11) < 0.01 ? '#c89a48' : '#e8c870'); if (r > 0.185 && r < 0.225) o.set('#c0402e'); if (r > 0.35) o.set('#c89a48'); });
    const hs = shell(hat, 0.94, '#b8904a'), T = { p: [0, HY + 0.11, -0.05], r: [-0.42, 0, 0.08] };
    for (const g of hs) xf(g, T);
    B.push(...hs, xf(ell(0.028, 0.028, 0.028, '#c0402e', [0, 0.175, 0], [0, 0, 0], 8), T));
    perchB = [0.012, HY + 0.265, -0.115];
  }
  const cc = v.crowC || '#2a2c44', ch = v.crowHi || '#454a78';
  const parts = [{ name: 'body', geo: B }, { name: 'crowA', geo: crowParts(cc, ch), at: [0.56, 1.155, 0] }, { name: 'crowB', geo: crowParts(cc, ch), at: perchB }];
  if ((v.crows || 2) >= 3) parts.push({ name: 'crowC', geo: crowParts(cc, ch), at: [-0.56, 1.155, 0] });
  return { parts };
}
function buildKakashi(v) {
  const M = assemble('kakashi:' + v.key, () => kakashiSpec(v));
  const I = M.inner, crows = ['crowA', 'crowB', 'crowC'].map(n => M.g[n]).filter(Boolean);
  crows.forEach((c, i) => { c.rotation.y = i === 1 ? 0.3 : -0.9; });
  M.crows = crows; M.crowY = crows.map(c => c.position.y);
  let hop = 0;
  M.animate = (dt, t, moving) => {
    const a = M.act, k = (M.actT += dt);
    let y = 0, sy = 1, rz = 0, rx = 0, ry = 0, flap = 0;
    switch (a) {
      case 'wind': { const p = clamp(k / KK.WIND); rz = Math.sin(t * 38) * 0.09 * p; y = Math.abs(Math.sin(t * 19)) * 0.05 * p; sy = 1 - 0.05 * p; flap = 1; rx = -0.1 * p; break; } // rattling
      case 'send': { const p = clamp(k / 0.3); rx = 0.22 * Math.sin(p * Math.PI); rz = Math.sin(t * 20) * 0.04 * (1 - p); break; }
      case 'hopWind': { const p = ease.outCubic(clamp(k / KK.HOP_WIND)); sy = 1 - 0.22 * p; y = -0.04 * p; rx = 0.12 * p; break; }
      case 'hopAir': { const p = clamp(k / KK.HOP_AIR); y = Math.sin(p * Math.PI) * 1.4; sy = 1.12 - 0.12 * p; rx = -0.15 + 0.3 * p; ry = ease.inOutQuad(p) * TAU; break; }
      case 'land': { const p = clamp(k / 0.3); sy = 1 - 0.26 * Math.sin(p * Math.PI); break; }
      default: {
        hop = (hop + dt * (moving ? 2.6 : 0.9)) % 1; const h = Math.sin(hop * Math.PI);
        y = h * (moving ? 0.26 : 0.03); sy = 1 + (moving ? (h - 0.35) * 0.1 : Math.sin(t * 2) * 0.015);
        rz = Math.sin(t * 1.3) * 0.05 + (moving ? Math.sin(hop * TAU) * 0.06 : 0); rx = moving ? 0.08 : 0;
      }
    }
    const ws = 1 / Math.sqrt(sy);
    I.position.y = y; I.scale.set(ws, sy, ws); I.rotation.set(rx, ry, rz);
    for (let i = 0; i < crows.length; i++) { // perched crows: head-turns, and they flutter while the scarecrow rattles
      const c = crows[i]; c.rotation.x = Math.sin(t * 2.3 + i * 2) * 0.12;
      c.position.y = M.crowY[i] + (flap ? Math.abs(Math.sin(t * 30 + i * 1.7)) * 0.06 : 0);
    }
  };
  M.animate(0, 0, false);
  return M;
}
// pooled flying crow: a body and two flapping wings (module-level geometry / materials: pool objects own nothing)
let CROW = null;
function crowFly() {
  if (!CROW) {
    const c = '#2a2c44', hi = '#454a78';
    const wing = s => merge([ell(0.13, 0.018, 0.07, c, [s * 0.12, 0, -0.01], [0, 0, 0], 10), ell(0.07, 0.014, 0.05, hi, [s * 0.2, 0.004, -0.03], [0, s * 0.3, 0], 8)]);
    CROW = { body: merge(crowParts(c, hi, true)), wl: wing(-1), wr: wing(1),
      mat: makeToon({ vertexColors: true, objectBrush: true, brush: 0.1, rim: 0.7, term: [-0.02, 0.3], fragOut: EDGE_OUT }), ol: makeOutline(INK, 0.018) };
  }
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const mk = (geo, parent) => { const me = new THREE.Mesh(geo, CROW.mat); me.castShadow = true; parent.add(me, new THREE.Mesh(geo, CROW.ol)); };
  mk(CROW.body, g);
  const wl = new THREE.Group(), wr = new THREE.Group(); wl.position.set(-0.07, 0.11, 0); wr.position.set(0.07, 0.11, 0);
  mk(CROW.wl, wl); mk(CROW.wr, wr); g.add(wl, wr);
  g.userData.wl = wl; g.userData.wr = wr;
  return g;
}
/** one crow leaves its perch, swoops low down a lane (dx, dz, len) and flies back up to the perch */
function launchCrow(m, slot, dx, dz, len, delay) {
  const G = m.G, W = m.world, Cb = m.mode.combat, perch = m.model.crows[slot];
  const o = take(G, 'mapleCrow', crowFly); o.visible = false;
  const TB = KK.TA + len / KK.SPD, TC = TB + KK.BACK, raw = Math.max(1, Math.round(roll(m) * 0.6));
  const s = { t: -delay, on: false, done: false, hit: false, x: 0, y: 0, z: 0, px: 0, py: 0, pz: 0, sx: 0, sy: 0, sz: 0, lx: 0, lz: 0, ex: 0, ey: 0, ez: 0, flap: rand(0, TAU) };
  const zn = Cb.addZone({ life: delay + TC + 0.5, update: dt => {
    if (s.done) return;
    s.t += dt; if (s.t < 0) return;
    if (!s.on) {
      s.on = true; perch.getWorldPosition(_v); s.x = s.sx = _v.x; s.y = s.sy = _v.y + 0.12; s.z = s.sz = _v.z;
      perch.visible = false; o.visible = true; o.scale.setScalar(m.scale); o.position.set(s.x, s.y, s.z);
      s.lx = m.pos.x + dx * 0.7; s.lz = m.pos.z + dz * 0.7; s.ex = s.lx + dx * len; s.ez = s.lz + dz * len;
      fxOf(m).feathers(s.x, s.y, s.z, { n: 3, speed: 1.5, up: 1 });
    }
    s.px = s.x; s.py = s.y; s.pz = s.z;
    const t = s.t;
    let low = false;
    if (t < KK.TA) { const k = t / KK.TA, e = ease.inOutQuad(k); s.x = s.sx + (s.lx - s.sx) * e; s.z = s.sz + (s.lz - s.sz) * e; s.y = s.sy + (W.heightAt(s.lx, s.lz) + 0.8 - s.sy) * e + Math.sin(k * Math.PI) * 0.5; }
    else if (t < TB) {
      const k = (t - KK.TA) / (TB - KK.TA); low = true;
      s.x = s.lx + (s.ex - s.lx) * k; s.z = s.lz + (s.ez - s.lz) * k; s.y = s.ey = W.heightAt(s.x, s.z) + 0.75;
      const P = G.player;
      if (!s.hit && P && !P.invuln && playerIn(G, s.x, s.z, 0.45)) { s.hit = true; hitArea(m, s.x, s.z, 0.45, raw, m.stats.element, 0.8); fxOf(m).feathers(s.x, s.y, s.z, { n: 5 }); sfx('kakashi_peck', P.pos); }
    } else if (t < TC) { // up and round, back to the perch (or away over the trees if the scarecrow has fallen)
      const k = (t - TB) / KK.BACK, e = ease.inOutQuad(k), home = m.alive && !m.disposed;
      if (home) perch.getWorldPosition(_v); else _v.set(s.ex + dx * 9, s.ey + 7, s.ez + dz * 9);
      const cx = s.ex + dx * 2.2, cy = s.ey + 2.8, cz = s.ez + dz * 2.2, u = 1 - e;
      s.x = u * u * s.ex + 2 * u * e * cx + e * e * _v.x; s.y = u * u * s.ey + 2 * u * e * cy + e * e * (_v.y + 0.12); s.z = u * u * s.ez + 2 * u * e * cz + e * e * _v.z;
      if (!home) o.scale.setScalar(m.scale * (1 - k * 0.8));
    } else { zn.life = 0; return; }
    const vx = s.x - s.px, vy = s.y - s.py, vz = s.z - s.pz, h = Math.hypot(vx, vz);
    if (h > 1e-4) o.rotation.set(-Math.atan2(vy, h) * 0.8, Math.atan2(vx, vz), 0);
    o.position.set(s.x, s.y, s.z);
    s.flap += dt * (low ? 12 : 26); const f = Math.sin(s.flap) * (low ? 0.3 : 0.95) + (low ? -0.25 : 0);
    o.userData.wl.rotation.z = -f; o.userData.wr.rotation.z = f;
  }, dispose: () => {
    if (s.done) return; s.done = true; give(o);
    if (s.on && m.alive && !m.disposed) { perch.visible = true; if (s.t >= TC) fxOf(m).feathers(s.x, s.y, s.z, { n: 2, speed: 1, up: 0.5 }); }
  } });
}
function killTeles(rs) { if (rs.teles) { for (const f of rs.teles) f.t = 999; rs.teles.length = 0; } }
function kakashiAI(m, dt, target, d, slow) {
  const rs = m.rs, G = m.G, tr = target.radius || 0.3, M = m.model;
  rs.t += dt; rs.hopCd = (rs.hopCd ?? 1.2) - dt;
  const go = (st, pose = st) => { rs.st = st; rs.t = 0; act(m, pose); };
  if ((rs.st === 'wind' || rs.st === 'hopWind') && m.state !== 'windup') { killTeles(rs); go('move', 'idle'); }
  switch (rs.st) {
    case 'wind':
      m.facing = dampAngle0(m.facing, rs.aim, dt);
      if (rs.t >= KK.WIND) {
        go('send'); m.state = 'attack'; m.telegraph = null; rs.teles.length = 0; // (the lanes keep filling until each crow is in)
        for (let i = 0; i < rs.lanes.length; i++) { const L = rs.lanes[i]; launchCrow(m, L.slot, Math.sin(L.a), Math.cos(L.a), rs.len, i * 0.15); }
        sfx('kakashi_caw', m.pos);
      }
      return false;
    case 'send': if (rs.t > 0.4) { go('move', 'idle'); m.state = 'chase'; m.cd = rand(3.4, 4.4); } return false;
    case 'hopWind':
      m.faceTo(rs.hx1, rs.hz1, dt);
      if (rs.t >= KK.HOP_WIND) { go('hopAir'); m.state = 'attack'; m.telegraph = null; rs.hx0 = m.pos.x; rs.hz0 = m.pos.z; sfx('kakashi_hop', m.pos); }
      return false;
    case 'hopAir': {
      const p = clamp(rs.t / KK.HOP_AIR);
      m.pos.x = rs.hx0 + (rs.hx1 - rs.hx0) * p; m.pos.z = rs.hz0 + (rs.hz1 - rs.hz0) * p;
      if (rs.t >= KK.HOP_AIR) {
        go('land');
        hitArea(m, rs.hx1, rs.hz1, KK.HOP_R, Math.round(roll(m) * 1.2), 'phys', 1.5);
        const fx = fxOf(m), y = m.world.heightAt(rs.hx1, rs.hz1);
        G.vfx.dustRing(V(rs.hx1, y, rs.hz1), 1.6, 14); fx.straw(rs.hx1, y + 0.5, rs.hz1, { n: 12, speed: 3.5, up: 3 });
        G.vfx.ring(V(rs.hx1, y, rs.hz1), { color: '#fff0c8', r0: 0.3, r1: KK.HOP_R * 1.1, life: 0.3 });
        if (playerIn(G, rs.hx1, rs.hz1, 5)) G.engine.rig.shake(0.25);
        sfx('kakashi_stomp', m.pos);
      }
      return true;
    }
    case 'land': if (rs.t > 0.36) { go('move', 'idle'); m.state = 'chase'; rs.hopCd = rand(3, 4.5); } return false;
    default: {
      if (rs.st !== 'move') go('move', 'idle');
      const los = m.mode.los(m.pos, target.pos);
      let perched = 0; for (const c of M.crows) if (c.visible) perched++;
      if (m.cd <= 0 && los && perched > 0 && d > 2.4 && d < 9.5) {
        rs.aim = Math.atan2(target.pos.x - m.pos.x, target.pos.z - m.pos.z); rs.len = Math.min(d + 2.5, 9.5);
        rs.lanes ||= []; rs.lanes.length = 0; rs.teles ||= [];
        const slots = []; M.crows.forEach((c, i) => { if (c.visible) slots.push(i); });
        // the first crow flies straight at you, the next ones cut off the dodge to either side (and a beat later)
        const sd = Math.random() < 0.5 ? 0.3 : -0.3;
        slots.forEach((slot, i) => {
          const a = rs.aim + (i === 0 ? 0 : i === 1 ? sd : -sd);
          rs.lanes.push({ slot, a });
          rs.teles.push(tele(G, { shape: 'lane', x: m.pos.x, z: m.pos.z, r: KK.LANE, dir: a, len: rs.len + 0.8, time: KK.WIND + i * 0.15 + KK.TA, color: TELE }));
        });
        m.telegraph = rs.teles[0];
        go('wind'); m.state = 'windup';
        sfx('kakashi_rattle', m.pos);
        return false;
      }
      if (d < 2.4 + tr && rs.hopCd <= 0) {
        let tx = target.pos.x, tz = target.pos.z; const L = Math.hypot(tx - m.pos.x, tz - m.pos.z);
        if (L > 3) { tx = m.pos.x + (tx - m.pos.x) / L * 3; tz = m.pos.z + (tz - m.pos.z) / L * 3; }
        if (m.world.walkable(tx, tz)) {
          rs.hx1 = tx; rs.hz1 = tz; go('hopWind'); m.state = 'windup';
          m.telegraph = tele(G, { x: tx, z: tz, r: KK.HOP_R, time: KK.HOP_WIND + KK.HOP_AIR, color: TELE });
          return false;
        }
        rs.hopCd = 1;
      }
      return kite(m, target, d, dt, slow, 3.6, 7, 0.45);
    }
  }
}
const dampAngle0 = (a, b, dt) => a + angleDiff(a, b) * (1 - Math.exp(-14 * dt));

// ================================================================================================= MOMIJI WISP
// A glowing lantern-sprite: a warm core with the face, a mane of leaves fanned behind it with two leaf "ears", a
// spiral wisp-tail with little leaves, and a ring of orbiting leaves (its own part: spins up, tightens and flings out).
const WS = { FLOAT: 0.55, WIND: 0.72, RANGE: 7.2, HALF: 0.4, N: 7, SPD: 9.5, WHIRL_R: 1.75, WHIRL_WIND: 0.5, BLINK: 0.5, CY: 0.36, CR: 0.2 };
function wispSpec(v) {
  const leaf = (s, c) => (v.ginkgo ? ginkgoLeaf(s, c) : mapleLeaf(s, c));
  const CY = WS.CY, CR = WS.CR, core = col(v.core), core2 = col(v.core2), L0 = v.leaf[0], L1 = v.leaf[1];
  const B = [], T = [], O = [];
  B.push(paint(xf(new THREE.SphereGeometry(CR, 22, 16), { p: [0, CY, 0] }), (p, n, o) => o.copy(core).lerp(core2, clamp(0.4 - n.y * 0.7))));
  const zc = (x, y) => Math.sqrt(Math.max(0, CR * CR - x * x - (y - CY) ** 2));
  B.push(...eyesCute(CY + 0.02, zc(0.07, CY + 0.02) - 0.014, 0.07, 0.95, { brow: 0 }));
  B.push(...cheeks(CY - 0.05, zc(0.12, CY - 0.05) - 0.004, 0.12, 0.8));
  B.push(smile(CY - 0.058, zc(0.028, CY - 0.058) - 0.003, 0.028, 0.016, 0.008));
  // mane: leaves fanned round the back of the core, leaning back; two taller "ears" on top
  for (const [deg, size, tilt, c] of [[62, 0.25, -0.75, L1], [-62, 0.25, -0.75, L1], [104, 0.24, -0.9, L0], [-104, 0.24, -0.9, L0], [146, 0.21, -1.0, L1], [-146, 0.21, -1.0, L1], [24, 0.3, -0.35, L0], [-24, 0.3, -0.35, L0]]) {
    const phi = deg * Math.PI / 180;
    B.push(place(leaf(size, c), [Math.sin(phi) * CR * 0.6, CY + Math.cos(phi) * CR * 0.6, -0.07], tilt, 0, -phi, 'ZYX'));
  }
  // tail: a tapering spiral of glow with two little leaves riding it
  const tp = []; for (let j = 0; j <= 6; j++) { const a = j * 1.05; tp.push([Math.sin(a) * (0.07 - j * 0.008), -j * 0.055, Math.cos(a) * (0.07 - j * 0.008) - 0.03, Math.max(0.012, 0.075 - j * 0.011)]); }
  T.push(tubeC(tp, (p, n, o) => o.copy(core2).lerp(col(L1), clamp(-p.y * 3)), 7));
  T.push(place(leaf(0.12, L0), [0.06, -0.12, -0.02], -0.6, 0.8, 0.9), place(leaf(0.09, L1), [-0.05, -0.25, 0.0], -0.4, -0.6, -2.2));
  for (const g of T) g.translate(0, CY - 0.12, 0);
  // the orbiting ring: leaves laid back, tips leading round the orbit
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; O.push(place(leaf(0.18, i % 2 ? L0 : L1), [Math.sin(a) * 0.52, Math.sin(i * 2.1) * 0.06, Math.cos(a) * 0.52], -Math.PI / 2 + 0.3, a - Math.PI / 2, 0, 'YXZ')); }
  const glow = `outgoingLight += diffuseColor.rgb * 0.7 * step(0.9, diffuseColor.r) * step(${(v.gMin ?? 0.8).toFixed(2)}, diffuseColor.g) * step(diffuseColor.b, 0.72);`;
  return { mat: { fragOut: glow }, parts: [{ name: 'body', geo: [...B, ...T] }, { name: 'orb', geo: O, at: [0, CY, 0] }] };
}
function buildWisp(v) {
  const M = assemble('momijiWisp:' + v.key, () => wispSpec(v));
  const I = M.inner, O = M.g.orb;
  let orb = rand(0, TAU), rad = 1, lean = 0;
  M.animate = (dt, t, moving) => {
    const a = M.act, k = (M.actT += dt);
    let spinV = 1.8, wantR = 1, sq = 1, wantLean = moving ? 0.18 : 0, rz = Math.sin(t * 1.4) * 0.08, s = 1;
    switch (a) {
      case 'wind': { const p = clamp(k / WS.WIND); spinV = 3 + 11 * p; wantR = 1 - 0.32 * p; sq = 1 - 0.08 * p; wantLean = -0.22 * p; rz += Math.sin(t * 45) * 0.04 * p; break; }
      case 'throw': { const p = clamp(k / 0.35); spinV = 6; wantR = 0.7 + 0.6 * p; wantLean = 0.35 * (1 - p); sq = 1 + 0.09 * (1 - p); break; }
      case 'whirlWind': { const p = clamp(k / WS.WHIRL_WIND); spinV = 6 + 18 * p; wantR = 1 + 0.9 * p; rz = Math.sin(t * 40) * 0.05 * p; break; }
      case 'whirl': spinV = 28; wantR = 2.6; break;
      case 'blink': { const p = clamp(k / WS.BLINK); s = Math.max(0.001, p < 0.3 ? 1 - p / 0.3 : p > 0.7 ? (p - 0.7) / 0.3 : 0); spinV = 20; break; }
    }
    orb += dt * spinV; rad += (wantR - rad) * Math.min(1, dt * 8); lean += (wantLean - lean) * Math.min(1, dt * 6);
    const ws = s / Math.sqrt(sq);
    I.position.y = WS.FLOAT + Math.sin(t * 2.3) * 0.07; I.rotation.set(lean, 0, rz); I.scale.set(ws, s * sq, ws);
    O.rotation.y = orb; O.scale.set(rad, 1, rad); O.position.y = WS.CY + Math.sin(t * 3.1) * 0.03;
  };
  M.animate(0, 0, false);
  return M;
}
const followQ = q => { const s = q.src; if (s) { q.x = s.x; q.y = s.y; q.z = s.z; } };
/** a spinning maple (or ginkgo) leaf dart with a warm glow trail */
const MAPLE_LOOK = {
  start(G, s, o) {
    const fx = mapleFx(G.vfx), size = o.size || 0.56, c = col(o.color || '#f0602e'), trail = col(o.trail || '#ffcf8a');
    const q = fx.p('n', o.frame ?? F.MAPLE, s.x, s.y, s.z, { life: 30, size, size1: size, color: c, alpha: 1, alpha1: 1, spin: rand(10, 16) * (Math.random() < 0.5 ? -1 : 1) });
    q.fn = followQ; q.src = s;
    return {
      update() { if (Math.random() < 0.5) puff(G.vfx.glow, s.x - s.dx * 0.25, s.y, s.z - s.dz * 0.25, { life: 0.2, size: size * 0.36, size1: 0.04, color: trail, alpha: 0.35, alpha1: 0 }); },
      end(s2, hit) {
        if (q.src === s) { q.src = null; q.t = q.life; }
        fx.leaves(s.x, s.y, s.z, { n: hit ? 5 : 3, speed: 2, up: 2, colors: o.colors, frame: o.frame ?? F.MAPLE, size: 0.22, life: 0.9 });
        if (hit) G.vfx.flash(V(s.x, s.y, s.z), '#ffe0b0', 0.8, 0.14);
      },
    };
  },
};
const SPRAY = [0.5, 0.08, 0.92, 0.3, 0.7, 0.0, 1.0, 0.42, 0.58, 0.18, 0.82]; // the fan fills in scattered, not as a sweep
function fireLeaf(m, i, n) {
  const rs = m.rs, v = m.model.variant || {}, u = n > 1 ? (n <= SPRAY.length ? SPRAY[i] : i / (n - 1)) - 0.5 : 0;
  const a = rs.aim + u * WS.HALF * 1.7 + rand(-0.05, 0.05);
  const from = { x: m.pos.x + Math.sin(rs.aim) * 0.35, z: m.pos.z + Math.cos(rs.aim) * 0.35 };
  const colors = v.ginkgo ? MCOL.gold : v.element === 'fire' ? MCOL.ember : MCOL.maple;
  bolt(m, { look: MAPLE_LOOK, from, dir: { x: Math.sin(a), z: Math.cos(a) }, speed: WS.SPD * rand(0.92, 1.08), range: WS.RANGE + 0.6, radius: 0.32, h: 0.95,
    color: i % 2 ? v.leaf?.[1] : v.dart, trail: v.trail, colors, frame: v.ginkgo ? F.GINKGO : F.MAPLE,
    onHit: e => { if (rs.fHits < 2) { rs.fHits++; m.dealTo(e, Math.max(1, Math.round(roll(m) * 0.55)), m.stats.element, 0.35); } } });
}
function wispAI(m, dt, target, d, slow) {
  const rs = m.rs, G = m.G, Cb = m.mode.combat, tr = target.radius || 0.3;
  rs.t += dt; rs.whirlCd = (rs.whirlCd ?? 1.5) - dt;
  const go = (st, pose = st) => { rs.st = st; rs.t = 0; act(m, pose); };
  if ((rs.st === 'wind' || rs.st === 'whirlWind') && m.state !== 'windup') go('move', 'idle');
  switch (rs.st) {
    case 'wind':
      m.facing = dampAngle0(m.facing, rs.aim, dt);
      if (rs.t >= WS.WIND) { go('throw'); m.state = 'attack'; m.telegraph = null; rs.fired = 0; rs.fHits = 0; rs.n = WS.N + (m.stats.multishot ? 4 : 0); sfx('wisp_flurry', m.pos); }
      return false;
    case 'throw':
      while (rs.fired < rs.n && rs.t >= rs.fired * 0.035) fireLeaf(m, rs.fired++, rs.n);
      if (rs.t > 0.5) { go('move', 'idle'); m.state = 'chase'; m.cd = rand(2.4, 3.2); }
      return false;
    case 'whirlWind':
      if (rs.t >= WS.WHIRL_WIND) {
        go('whirl'); m.state = 'attack'; m.telegraph = null;
        hitArea(m, m.pos.x, m.pos.z, WS.WHIRL_R, Math.round(roll(m) * 0.9), m.stats.element, 1.5);
        const fx = fxOf(m), y = m.pos.y + WS.FLOAT + WS.CY, v = m.model.variant || {};
        fx.leaves(m.pos.x, y, m.pos.z, { n: 16, speed: 6, up: 2.5, colors: v.ginkgo ? MCOL.gold : v.element === 'fire' ? MCOL.ember : MCOL.maple, frame: v.ginkgo ? F.GINKGO : F.MAPLE, size: 0.3 });
        G.vfx.ring(m.pos, { color: '#fff0d0', r0: 0.4, r1: WS.WHIRL_R * 1.1, life: 0.3 });
        sfx('wisp_burst', m.pos);
      }
      return false;
    case 'whirl':
      if (rs.t > 0.28) { // scatter into leaves and reform a few metres off
        go('blink'); m.state = 'attack'; Cb.remove(m); rs.gone = true;
        rs.bx0 = m.pos.x; rs.bz0 = m.pos.z; rs.bx1 = m.pos.x; rs.bz1 = m.pos.z;
        const W = m.world;
        for (let i = 0; i < 16; i++) {
          const a = rand(0, TAU), r = rand(4.5, 6), x = target.pos.x + Math.sin(a) * r, z = target.pos.z + Math.cos(a) * r;
          if (!W.walkable(x, z) || W.collision?.solidAt?.(x, z, 0.4) || !m.mode.los(V(x, 0, z), target.pos)) continue;
          rs.bx1 = x; rs.bz1 = z; break;
        }
        const fx = fxOf(m), v = m.model.variant || {};
        fx.leaves(m.pos.x, m.pos.y + WS.FLOAT + WS.CY, m.pos.z, { n: 12, speed: 3, up: 1.5, colors: v.ginkgo ? MCOL.gold : MCOL.maple, frame: v.ginkgo ? F.GINKGO : F.MAPLE, size: 0.28 });
        fx.twinkles(m.pos.x, m.pos.y + 0.8, m.pos.z, { n: 6, r: 0.5 });
        sfx('wisp_blink', m.pos);
      }
      return false;
    case 'blink': {
      const p = clamp((rs.t - WS.BLINK * 0.3) / (WS.BLINK * 0.4));
      m.pos.x = rs.bx0 + (rs.bx1 - rs.bx0) * ease.inOutQuad(p); m.pos.z = rs.bz0 + (rs.bz1 - rs.bz0) * ease.inOutQuad(p);
      if (rs.t > WS.BLINK * 0.55 && !rs.reform) { rs.reform = true; fxOf(m).swirl(rs.bx1, rs.bz1, 0.35, m.model.variant?.ginkgo ? MCOL.gold : MCOL.maple); }
      if (rs.t >= WS.BLINK) {
        rs.reform = false; rs.gone = false;
        if (m.alive && !m.vanished && G.dungeon === m.mode) Cb.add(m);
        go('move', 'idle'); m.state = 'chase'; rs.whirlCd = rand(5, 7); m.cd = Math.min(m.cd, 0.9);
      }
      return false;
    }
    default: {
      if (rs.st !== 'move') go('move', 'idle');
      if (d < WS.WHIRL_R - 0.2 + tr && rs.whirlCd <= 0) {
        go('whirlWind'); m.state = 'windup';
        m.telegraph = tele(G, { x: m.pos.x, z: m.pos.z, r: WS.WHIRL_R, time: WS.WHIRL_WIND, color: TELE });
        sfx('wisp_whirl', m.pos);
        return false;
      }
      if (m.cd <= 0 && d < WS.RANGE + 0.5 && m.mode.los(m.pos, target.pos)) {
        rs.aim = Math.atan2(target.pos.x - m.pos.x, target.pos.z - m.pos.z);
        go('wind'); m.state = 'windup';
        m.telegraph = tele(G, { shape: 'cone', x: m.pos.x, z: m.pos.z, r: WS.RANGE, dir: rs.aim, arc: WS.HALF, time: WS.WIND, color: TELE });
        const fx = fxOf(m), y = m.pos.y + WS.FLOAT + WS.CY, v = m.model.variant || {}, cs = v.ginkgo ? MCOL.gold : MCOL.maple;
        for (let i = 0; i < 10; i++) { const a = rand(0, TAU), r = rand(0.7, 1.1); fx.p('n', v.ginkgo ? F.GINKGO : F.MAPLE, m.pos.x + Math.cos(a) * r, y + rand(-0.3, 0.3), m.pos.z + Math.sin(a) * r, { vx: -Math.cos(a) * r * 1.3, vz: -Math.sin(a) * r * 1.3, life: WS.WIND * 0.9, size: 0.24, size1: 0.08, color: cs[i % cs.length], alpha: 0.3, alpha1: 1, spin: rand(-8, 8) }); }
        sfx('wisp_gather', m.pos);
        return false;
      }
      return kite(m, target, d, dt, slow, 4.2, 7.4, 0.6);
    }
  }
}
function wispUpdate(m, dt) {
  const M = m.model, rs = m.rs;
  if (!m.aggro) act(m, 'idle');
  if (rs.st === 'blink') return;
  if (every(M, 'dropT', dt, 0.35, 0.8) && playerIn(m.G, m.pos.x, m.pos.z, 18)) { // a trickle of leaves falling from it
    const v = M.variant || {}, cs = v.ginkgo ? MCOL.gold : v.element === 'fire' ? MCOL.ember : MCOL.maple;
    fxOf(m).p('n', v.ginkgo ? F.GINKGO : F.MAPLE, m.pos.x + rand(-0.3, 0.3), m.pos.y + WS.FLOAT + 0.2, m.pos.z + rand(-0.3, 0.3), { vx: rand(-0.3, 0.3), vy: -0.5, vz: rand(-0.3, 0.3), life: 1.4, size: 0.2, size1: 0.16, color: cs[(Math.random() * cs.length) | 0], alpha: 1, alpha1: 0, spin: rand(-4, 4) });
  }
}

// ================================================================================================= defs
const kuriHurt = hurt('kuri_hurt');
export const MONSTERS = {
  kuri: mdef({
    name: 'Kuri', build: 'kuri', scale: 0.9, radius: 0.38, vr: 0.47, speed: 2.6, pack: 1.2, material: 'wood',
    attack: { type: 'charge', range: 8, cd: 2.8, windup: KU.CURL, dash: KU.SPD },
    stats: { name: 'Kuri', life: 0.95, dmg: 1.1, def: 1.25, speed: 1.0, xp: 1.15, element: 'phys', res: { fire: -15, zap: 15 } },
    variants: [
      { key: 0, burr: '#8cc43e', tip: '#eef6a8', nut: '#9a4c22' },
      { key: 1, name: 'Roasted Kuri', burr: '#6a4428', tip: '#ffae3a', nut: '#6a3216', lining: '#b88a58', glow: true, element: 'fire' },
      { key: 2, name: 'Momiji Kuri', burr: '#c2d45a', tip: '#ff6a3a', nut: '#a85a2a', leaf: '#e8482e' },
    ],
    ai: kuriAI, update: kuriUpdate,
    onSpawn: warmScene,
    onDeath: m => {
      sfx('kuri_die', m.pos);
      const fx = fxOf(m), y = m.pos.y + 0.5;
      fx.chips(m.pos.x, y, m.pos.z, { n: 6, color: col(m.model.variant?.burr || '#8cc43e'), speed: 3 });
      fx.chips(m.pos.x, y, m.pos.z, { n: 4, color: MCOL.nut, speed: 2.5 });
    },
    damageTaken: (m, dmg) => { kuriHurt(m, dmg); const st = m.rs?.st; return st === 'roll' || st === 'curl' ? dmg * 0.5 : dmg; }, // curled up in its spiky burr
  }),
  kakashi: mdef({
    name: 'Kakashi', build: 'kakashi', radius: 0.36, vr: 0.5, speed: 2.3, pack: 0.8, material: 'silk',
    attack: { type: 'ranged', range: 9, cd: 3.4, windup: KK.WIND, proj: 'crow' },
    stats: { name: 'Kakashi', life: 1.05, dmg: 1.05, def: 0.9, speed: 1.0, xp: 1.2, element: 'phys', ranged: true, res: { fire: -25, stink: 20 } },
    variants: [
      { key: 0, kimono: '#3c4c90', patch: '#f08a3a', crows: 2 },
      { key: 1, name: 'Hoshigaki Kakashi', kimono: '#3f8058', patch: '#f4e2b0', crows: 2, persimmons: true },
      { key: 2, name: 'Oni Kakashi', kimono: '#5a3470', patch: '#e8503a', crows: 3, oni: true, hat: false, head: '#ff8a66' },
    ],
    ai: kakashiAI,
    update: m => { if (!m.aggro) act(m, 'idle'); },
    onSpawn: warmScene,
    onDeath: m => {
      sfx('kakashi_die', m.pos);
      const fx = fxOf(m);
      fx.straw(m.pos.x, m.pos.y + 0.8, m.pos.z, { n: 16, speed: 3, up: 3 });
      for (const c of m.model.crows) if (c.visible) { c.getWorldPosition(_v); fx.feathers(_v.x, _v.y, _v.z, { n: 5 }); c.visible = false; }
    },
    damageTaken: hurt('kakashi_hurt'),
  }),
  momijiWisp: mdef({
    name: 'Momiji Wisp', build: 'momijiWisp', scale: 1.15, radius: 0.36, vr: 0.5, speed: 2.7, pack: 1.0, material: 'lantern',
    attack: { type: 'ranged', range: WS.RANGE, cd: 2.8, windup: WS.WIND, proj: 'leaf' },
    stats: { name: 'Momiji Wisp', life: 0.75, dmg: 1.1, def: 0.7, speed: 1.05, xp: 1.2, element: 'phys', ranged: true, res: { holy: 20, fire: 20, frost: -20 } },
    variants: [
      { key: 0, leaf: ['#e2482e', '#f47034'], core: '#ffe07a', core2: '#ffb050', gMin: 0.8, dart: '#f0502a', trail: '#ffcf8a' },
      { key: 1, name: 'Ginkgo Wisp', ginkgo: true, leaf: ['#ffd23a', '#eeb028'], core: '#fff2b8', core2: '#ffd070', gMin: 0.9, dart: '#ffcf2a', trail: '#fff0a0' },
      { key: 2, name: 'Ember Wisp', leaf: ['#b81e2a', '#ff6a2a'], core: '#ffb24a', core2: '#ff6a2a', gMin: 0.6, dart: '#ff4a22', trail: '#ffa050', element: 'fire' },
    ],
    ai: wispAI, update: wispUpdate,
    onSpawn: warmScene,
    onDeath: m => {
      sfx('wisp_die', m.pos);
      const v = m.model.variant || {}, fx = fxOf(m), y = m.pos.y + WS.FLOAT + WS.CY;
      fx.leaves(m.pos.x, y, m.pos.z, { n: 14, speed: 3, up: 2.5, colors: v.ginkgo ? MCOL.gold : v.element === 'fire' ? MCOL.ember : MCOL.maple, frame: v.ginkgo ? F.GINKGO : F.MAPLE, size: 0.3, life: 1.6 });
      m.G.vfx.sparkle(V(m.pos.x, y, m.pos.z), { n: 10, color: '#fff0b0', r: 0.4, rise: 1.2 });
    },
    damageTaken: hurt('wisp_hurt'),
  }),
};
export const BUILD = { kuri: buildKuri, kakashi: buildKakashi, momijiWisp: buildWisp };
