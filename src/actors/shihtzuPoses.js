// The Shih Tzu's actions (docs/SHIHTZU.md): the three-swing flail combo, Woeful Wallop, the hex flick of the free paw.
// Merged into animator.js' ACTIONS (same format: dur in s, ev {name: t01}, pose(t01, P, A) adding offsets to the pose
// accumulator). Conventions (animator.js): armR.x < 0 raises the right arm forward / up, armR.z > 0 swings it inward
// across the body (< 0 outward); armL is mirrored in z; body.y twists, body.x leans forward; A.y lifts the whole rig;
// sq squashes (> 0) or stretches (< 0).
// The flail's rope and ball are a verlet chain (actors/shihtzuGear.js): a pose only moves the paw, and may pull the
// ball toward a direction with A.flailDir (his frame: x forward, y up, z his left) at weight A.flailW (0..1). The chain
// keeps its own momentum, so the ball lags the wind-up, whips through the strike and swings on after the guide lets go.
// Actions whose def has `flail: true` draw the flail into his paw (shihtzuGear.js carryFlail).
import { clamp, lerp, ease, TAU } from '../core/util.js';
import { addChargePoses } from './chargePoses.js';

const S = (a, b, t) => clamp((t - a) / (b - a)); // 0..1 over [a, b]
const bump = (a, b, t) => Math.sin(S(a, b, t) * Math.PI); // 0 → 1 → 0 over [a, b]
/** pull the ball toward (x, y, z) in his frame at weight w (the strongest pull of the frame wins) */
function guide(A, x, y, z, w) {
  if (w <= (A.flailW || 0)) return;
  const d = A.flailDir || (A.flailDir = { x: 0, y: 0, z: 0 });
  d.x = x; d.y = y; d.z = z; A.flailW = w;
}
/** a direction blended along a list of key directions [[t, x, y, z], …] (piecewise linear in t; the gear normalises) */
function along(A, keys, t, w) {
  let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const a = keys[i], b = keys[i + 1], u = ease.inOutQuad(S(a[0], b[0], t));
  guide(A, lerp(a[1], b[1], u), lerp(a[2], b[2], u), lerp(a[3], b[3], u), w);
}

/** whirl the ball round him over [t0, t1]: `turns` turns from angle a0 (0 = in front, π/2 = his left; clockwise from
 *  above, the way a right paw swings), tilted up by `up` (0 level, 1 straight up) */
function whirl(A, t, t0, t1, turns, a0, up, w, back = 0) {
  const u = S(t0, t1, t), a = a0 - u * turns * Math.PI * 2, c = Math.sqrt(Math.max(0, 1 - up * up));
  guide(A, Math.cos(a) * c - back, up, Math.sin(a) * c, w); // (back: the circle leans back, so its front stays over his head)
}

export const SHIHTZU_ACTIONS = {
  // swing 1, the forehand: the flail wound up high over his right shoulder, then brought across and down to the left
  flailSwing1: { dur: 0.5, flail: true, ev: { hit: 0.5 }, pose: (t, P, A) => {
    const w = ease.outCubic(S(0, 0.42, t)), s = ease.outQuad(S(0.42, 0.58, t)), r = ease.inOutQuad(S(0.62, 1, t)), k = 1 - r;
    A.armR.x += lerp(lerp(0, -2.3, w), -0.9, s) * k; A.armR.z += lerp(lerp(0, -0.55, w), 1.1, s) * k;
    A.foreR.x += -0.5 * w * (1 - s) * k;
    A.armL.x += -0.35 * w * k; A.armL.z += lerp(0.25, -0.2, s) * k;
    A.body.y += lerp(lerp(0, -0.45, w), 0.5, s) * k; A.body.x += lerp(-0.08 * w, 0.2, s) * k; A.head.y += lerp(-0.2 * w, 0.15, s) * k;
    A.legL.x += -0.15 * s * k; A.legR.x += 0.15 * s * k;
    A.sq += (0.05 * w * (1 - s) - 0.06 * s) * k; A.earKick += 2 * s * k; A.mouth = Math.max(A.mouth, 0.4 * bump(0.45, 0.62, t));
    along(A, [[0, 0.3, -0.6, -0.4], [0.4, -0.55, 0.75, -0.45], [0.5, 0.85, 0.1, 0.25], [0.66, 0.35, -0.55, 0.75]], t, Math.max(0.55 * w, s * (1 - S(0.62, 0.86, t))));
  } },
  // swing 2, the backhand: from low on his left back across at waist height and out to the right
  flailSwing2: { dur: 0.48, flail: true, ev: { hit: 0.48 }, pose: (t, P, A) => {
    const w = ease.outCubic(S(0, 0.4, t)), s = ease.outQuad(S(0.4, 0.56, t)), r = ease.inOutQuad(S(0.6, 1, t)), k = 1 - r;
    A.armR.x += lerp(lerp(0, -1.0, w), -1.2, s) * k; A.armR.z += lerp(lerp(0, 1.25, w), -1.05, s) * k;
    A.armL.x += 0.25 * w * k; A.armL.z += -0.3 * k;
    A.body.y += lerp(lerp(0, 0.5, w), -0.55, s) * k; A.body.x += 0.12 * s * k; A.head.y += lerp(0.2 * w, -0.2, s) * k;
    A.legL.x += 0.2 * s * k; A.legR.x += -0.2 * s * k;
    A.sq += -0.05 * s * k; A.earKick += 2 * s * k;
    along(A, [[0, 0.4, -0.5, 0.6], [0.38, -0.3, 0.05, 0.95], [0.48, 0.9, 0.05, 0.1], [0.62, 0.2, -0.3, -0.9]], t, Math.max(0.5 * w, s * (1 - S(0.6, 0.84, t))));
  } },
  // swing 3, the finisher: the ball whirled up over his head and slammed down in front (a little hop, a thud)
  flailSlam: { dur: 0.62, flail: true, ev: { hit: 0.6 }, pose: (t, P, A) => {
    // the paw goes up over his head early and stays there through the whirl (the ball circles above the topknot, never in
    // front of his face), then comes down across his body to the middle, so the ball lands in front of him on his facing
    const up = ease.outCubic(S(0, 0.2, t)), dn = ease.inQuad(S(0.5, 0.62, t)), land = bump(0.58, 0.8, t), r = ease.inOutQuad(S(0.72, 1, t)), k = 1 - r;
    A.armR.x += lerp(lerp(0, -3.15, up), -0.95, dn) * k; A.armR.z += lerp(0.35 * up, 1.05, dn) * k;
    A.foreR.x += -0.2 * up * (1 - dn) * k;
    A.armL.x += lerp(-1.1 * up, -0.4, dn) * k; A.armL.z += 0.3 * up * k;
    A.y += 0.08 * bump(0.28, 0.58, t); A.body.x += lerp(-0.14 * up, 0.3, dn) * k; A.body.y += 0.18 * dn * k; A.head.x += lerp(-0.12 * up, 0.04, dn) * k;
    A.sq += -0.06 * up * (1 - dn) + 0.14 * land * k; A.earKick += 3.5 * dn * k; A.mouth = Math.max(A.mouth, 0.6 * bump(0.5, 0.7, t));
    // the ball whirled round high over his head (1¼ turns: from his right, behind, his left, in front, his right, ending
    // behind him), then over the top and down in front, a touch to his left of his paw (it's across the middle)
    if (t < 0.5) whirl(A, t, 0.06, 0.5, 1.25, -Math.PI / 2, 0.92, 0.5 + 0.5 * up, 0.26);
    else along(A, [[0.5, -0.6, 0.8, 0], [0.55, 0.15, 0.99, 0.05], [0.6, 0.78, -0.55, 0.28], [0.75, 0.62, -0.75, 0.2]], t, Math.max(0.95 * (1 - dn), dn * (1 - S(0.72, 0.9, t))));
  } },
  // Woeful Wallop: a deep sigh and the flail wound all the way back behind him, then one huge level sweep across the
  // front, all his weight in it, and a follow-through that turns him half round
  wallop: { dur: 0.66, flail: true, ev: { hit: 0.6 }, pose: (t, P, A) => {
    const sigh = bump(0, 0.3, t), w = ease.inOutQuad(S(0.12, 0.52, t)), s = ease.outQuad(S(0.52, 0.66, t)), r = ease.inOutQuad(S(0.7, 1, t)), k = 1 - r;
    A.armR.x += lerp(lerp(0, -1.5, w), -1.35, s) * k; A.armR.z += lerp(lerp(0, -1.2, w), 1.25, s) * k;
    A.armL.x += lerp(-0.5 * w, -0.9, s) * k; A.armL.z += lerp(0.45 * w, -0.5, s) * k;
    A.body.y += lerp(lerp(0, -0.8, w), 0.85, s) * k; A.body.x += lerp(-0.1 * w, 0.25, s) * k; A.head.y += lerp(-0.35 * w, 0.3, s) * k;
    A.head.x += -0.12 * sigh; A.sq += 0.06 * sigh - 0.04 * w * (1 - s) - 0.07 * s * k; A.y += -0.04 * w * (1 - s);
    A.legL.x += lerp(0.2 * w, -0.3, s) * k; A.legR.x += lerp(-0.2 * w, 0.3, s) * k; A.legL.z += 0.12 * w * k; A.legR.z += -0.12 * w * k;
    A.earKick += -1.5 * sigh + 3 * s * k; A.eyesClosed = sigh > 0.6 ? 1 : 0; A.mouth = Math.max(A.mouth, 0.5 * bump(0.55, 0.72, t));
    along(A, [[0, 0.2, -0.7, -0.4], [0.3, -0.5, 0.15, -0.85], [0.5, -0.85, 0.25, -0.4], [0.6, 0.9, 0.12, 0.3], [0.72, 0.1, 0.0, 0.99]], t, Math.max(0.6 * w, s * (1 - S(0.72, 0.92, t))));
  } },
  // a hex: the free (left) paw raised by his face, then thrust at the foe, ghostlight swirling off it (the sheet's CAST)
  hexFlick: { dur: 0.42, ev: { release: 0.52 }, pose: (t, P, A) => {
    const u = ease.outBack(S(0, 0.48, t)), f = ease.outQuad(S(0.48, 0.62, t)), r = ease.inOutQuad(S(0.68, 1, t)), k = 1 - r;
    A.armL.x += lerp(-1.1 * u, -1.55, f) * k; A.armL.z += lerp(-0.55 * u, 0.15, f) * k; A.foreL.x += lerp(-0.7 * u, 0, f) * k;
    A.armR.x += -0.2 * u * k; A.armR.z += -0.15 * k;
    A.body.y += lerp(-0.25 * u, 0.3, f) * k; A.body.x += lerp(-0.06 * u, 0.12, f) * k; A.head.x += lerp(-0.08 * u, 0.08, f) * k;
    A.legL.x += -0.25 * f * k; A.legR.x += 0.15 * f * k;
    A.sq += (0.04 * u * (1 - f) - 0.05 * f) * k; A.earKick += 1.5 * f * k;
  } },

  // ---------------------------------------------------------------- Flail Arts
  // Tug of Woe, the throw: the flail swung up behind his shoulder, then flung overhand straight at the foe (the ball leaves
  // the rope here: combat/shihtzuArts.js flies it out on a lengthening rope)
  tugThrow: { dur: 0.5, flail: true, ev: { release: 0.42 }, pose: (t, P, A) => {
    const w = ease.outCubic(S(0, 0.32, t)), f = ease.outQuad(S(0.32, 0.46, t)), r = ease.inOutQuad(S(0.55, 1, t)), k = 1 - r;
    A.armR.x += lerp(lerp(0, -2.7, w), -1.25, f) * k; A.armR.z += lerp(-0.3 * w, 0.25, f) * k; A.foreR.x += -0.4 * w * (1 - f) * k;
    A.armL.x += lerp(-0.6 * w, -0.2, f) * k; A.armL.z += 0.35 * k;
    A.body.y += lerp(-0.35 * w, 0.2, f) * k; A.body.x += lerp(-0.12 * w, 0.22, f) * k; A.head.x += lerp(-0.08 * w, 0.06, f) * k;
    A.legL.x += -0.2 * f * k; A.legR.x += 0.2 * f * k; A.sq += (0.05 * w * (1 - f) - 0.05 * f) * k; A.earKick += 2 * f * k;
    along(A, [[0, 0.2, -0.6, -0.3], [0.3, -0.7, 0.6, -0.2], [0.42, 0.95, 0.25, 0]], t, Math.max(0.6 * w, f * (1 - S(0.42, 0.5, t))));
  } },
  // Tug of Woe, the haul: both paws on the rope, a big tug-of-war heave back, braced, head shaking a little
  tugHaul: { dur: 0.55, flail: true, ev: { haul: 0.15 }, pose: (t, P, A) => {
    const g = ease.outQuad(S(0, 0.15, t)), h = ease.inOutQuad(S(0.15, 0.5, t)), r = ease.inOutQuad(S(0.6, 1, t)), k = 1 - r;
    A.armR.x += lerp(-1.3 * g, -0.5, h) * k; A.armR.z += 0.55 * k; A.armL.x += lerp(-1.3 * g, -0.5, h) * k; A.armL.z += -0.55 * k;
    A.body.x += lerp(0.12 * g, -0.22, h) * k; A.y += -0.05 * h * k; A.sq += 0.06 * h * k; A.head.y += Math.sin(t * 40) * 0.08 * h * k;
    A.legL.x += lerp(0, -0.35, h) * k; A.legR.x += lerp(0, 0.25, h) * k; A.earKick += -1.2 * h * k; A.mouth = Math.max(A.mouth, 0.3 * h * k);
  } },
  // Melancholy Maelstrom (held): the paw high overhead, the ball whirled round above his topknot, very solemnly
  stzWhirl: { dur: 99, hold: true, flail: true, pose: (t, P, A) => {
    const u = ease.outCubic(S(0, 0.25, t));
    A.armR.x += -2.95 * u; A.armR.z += 0.25 * u; A.foreR.x += -0.15 * u;
    A.armL.x += -0.35 * u; A.armL.z += 0.4 * u; A.body.y += Math.sin(t * 13) * 0.08 * u; A.body.x += -0.05 * u; A.head.x += 0.06 * u;
    A.sq += 0.02 * Math.sin(t * 26) * u; A.earKick += 0.4 * Math.sin(t * 13) * u;
    whirl(A, 0, 0, 1, 0, -Math.PI / 2 - t * 13, 0.6, 0.95 * u, 0.1); // (≈ 2 turns a second, clockwise, leaning back over his head)
  } },
  // Steadfast Sulk (held): hunkered down behind the flail held up across him like a shield, head low, ears flat, pouting
  sulk: { dur: 99, hold: true, flail: true, pose: (t, P, A) => {
    const u = ease.outBack(S(0, 0.2, t)), b = Math.sin(t * 2.6) * 0.02;
    A.y += (-0.07 + b) * u; A.sq += 0.09 * u; A.body.x += 0.16 * u; A.head.x += 0.24 * u;
    A.armR.x += -1.25 * u; A.armR.z += 0.95 * u; A.armL.x += -1.2 * u; A.armL.z += -0.95 * u;
    A.legL.x += -0.15 * u; A.legR.x += 0.12 * u; A.legL.z += 0.06 * u; A.legR.z += -0.06 * u; A.earKick += -0.8 * u;
    guide(A, 0.75, -0.55, 0.15, 0.55 * u);
  } },
  // the Sulk ends: a full turn with the flail swung out level round him
  sulkSpin: { dur: 0.6, flail: true, ev: { hit: 0.42 }, pose: (t, P, A) => {
    const s = ease.inOutQuad(S(0.05, 0.6, t)), r = ease.inOutQuad(S(0.65, 1, t)), k = 1 - r;
    A.spin = (A.spin || 0) + s * TAU; A.armR.x += -1.35 * k; A.armR.z += -0.9 * k; A.armL.x += -0.3 * k; A.armL.z += -0.5 * k;
    A.y += 0.04 * Math.sin(S(0.05, 0.6, t) * Math.PI); A.sq += -0.04 * k; A.earKick += 2.5 * s * k; A.mouth = Math.max(A.mouth, 0.4 * Math.sin(S(0.2, 0.6, t) * Math.PI));
    const a = -Math.PI / 2 - s * TAU; // (the ball out to his right, swept round with him)
    guide(A, Math.cos(a) * 0.95, -0.05, Math.sin(a) * 0.95, 0.95 * (1 - S(0.62, 0.85, t)));
  } },
  // The Heaviest Sigh: the deepest breath (eyes shut, chest up, the flail rising over his head), a hop, and down it comes
  sigh: { dur: 1.05, flail: true, ev: { hit: 0.78 }, pose: (t, P, A) => {
    const inh = ease.inOutQuad(S(0, 0.45, t)), hop = Math.sin(S(0.5, 0.76, t) * Math.PI), dn = ease.inQuad(S(0.66, 0.78, t)), land = bump(0.76, 0.95, t), r = ease.inOutQuad(S(0.82, 1, t)), k = 1 - r;
    A.armR.x += lerp(lerp(0, -3.05, ease.outCubic(S(0.2, 0.62, t))), -0.85, dn) * k; A.armR.z += lerp(0.3, 1.0, dn) * k;
    A.armL.x += lerp(-0.4 * inh, -0.5, dn) * k; A.armL.z += 0.35 * inh * k;
    A.sq += (-0.1 * inh * (1 - dn) + 0.16 * land) * k; A.body.x += lerp(-0.14 * inh, 0.36, dn) * k; A.head.x += lerp(-0.22 * inh, 0.12, dn) * k;
    A.y += 0.22 * hop; A.legL.x += -0.25 * hop; A.legR.x += -0.2 * hop;
    A.eyesClosed = t < 0.5 ? 1 : 0; A.mouth = Math.max(A.mouth, 0.7 * bump(0.72, 0.88, t)); A.earKick += 4 * dn * k;
    if (t < 0.66) guide(A, -0.35, 0.92, 0.05, 0.85 * ease.outCubic(S(0.15, 0.5, t)));
    else along(A, [[0.66, -0.35, 0.92, 0.05], [0.72, 0.4, 0.9, 0.1], [0.78, 0.85, -0.5, 0.2], [0.9, 0.7, -0.7, 0.15]], t, 0.95 * (1 - S(0.85, 0.98, t)));
  } },

  // ---------------------------------------------------------------- Gloom Hexes
  // both paws thrown up high, ghostlight gathering, then flung down at the crowd (Everlasting Gloom, Grumble Cloud)
  hexRaise: { dur: 0.7, ev: { release: 0.58 }, pose: (t, P, A) => {
    const u = ease.outBack(S(0, 0.45, t)), f = ease.outQuad(S(0.5, 0.62, t)), r = ease.inOutQuad(S(0.68, 1, t)), k = 1 - r;
    A.armR.x += lerp(-2.85 * u, -1.35, f) * k; A.armR.z += lerp(-0.35 * u, 0.2, f) * k; A.armL.x += lerp(-2.85 * u, -1.35, f) * k; A.armL.z += lerp(0.35 * u, -0.2, f) * k;
    A.body.x += lerp(-0.14 * u, 0.2, f) * k; A.head.x += lerp(-0.2 * u, 0.1, f) * k; A.y += 0.05 * u * (1 - f); A.sq += (-0.06 * u * (1 - f) + 0.08 * f) * k; A.earKick += 2.5 * f * k;
  } },
  // Mournful Awoo: head thrown right back, eyes shut, a long howl (the paws drift out a little)
  awoo: { dur: 1.1, ev: { howl: 0.28 }, pose: (t, P, A) => {
    const u = ease.outCubic(S(0, 0.25, t)), r = ease.inOutQuad(S(0.82, 1, t)), k = u * (1 - r), wob = Math.sin(t * 22) * 0.03 * S(0.28, 0.4, t);
    A.head.x += (-0.62 + wob) * k; A.body.x += -0.16 * k; A.sq += -0.08 * k; A.y += 0.02 * k;
    A.armR.z += -0.35 * k; A.armL.z += 0.35 * k; A.armR.x += -0.2 * k; A.armL.x += -0.2 * k;
    A.eyesClosed = k > 0.4 ? 1 : 0; A.mouth = Math.max(A.mouth, 0.85 * k * S(0.15, 0.3, t)); A.earKick += 1.8 * bump(0.25, 0.7, t);
  } },

  // ---------------------------------------------------------------- Ghostlight Tome
  // reading aloud from the spectral tome in his left paw, the right paw lifting on the last word (the summons, the ward)
  tomeRead: { dur: 0.7, ev: { release: 0.5 }, pose: (t, P, A) => {
    const u = ease.outBack(S(0, 0.3, t)), f = ease.outQuad(S(0.42, 0.55, t)), r = ease.inOutQuad(S(0.65, 1, t)), k = 1 - r;
    A.armL.x += -1.25 * u * k; A.armL.z += -0.45 * u * k; A.foreL.x += -0.55 * u * k;
    A.armR.x += lerp(-0.3 * u, -1.9, f) * k; A.armR.z += lerp(0.2, -0.25, f) * k;
    A.head.x += lerp(0.18 * u, -0.12, f) * k; A.body.x += lerp(0.05 * u, -0.08, f) * k; A.sq += (0.03 * u - 0.05 * f) * k; A.earKick += 1.2 * f * k;
    A.mouth = Math.max(A.mouth, 0.35 * bump(0.25, 0.55, t));
  } },
  // the Wayhome Lantern set down: a crouch, the left paw lowering it to the floor, a pat
  lanternSet: { dur: 0.72, ev: { set: 0.46 }, pose: (t, P, A) => {
    const d = ease.inOutQuad(S(0, 0.42, t)), r = ease.inOutQuad(S(0.58, 1, t)), k = d * (1 - r);
    A.y += -0.12 * k; A.sq += 0.06 * k; A.body.x += 0.45 * k; A.head.x += -0.1 * k;
    A.armL.x += -0.85 * k; A.armL.z += 0.05 * k; A.foreL.x += -0.3 * k; A.armR.x += -0.3 * k; A.armR.z += 0.3 * k;
    A.legL.x += -0.35 * k; A.legR.x += 0.3 * k;
  } },

  // ---------------------------------------------------------------- his joining scene (actors/shihtzuJoin.js)
  // kneeling at the roadside lanterns, the left paw reaching out to light one now and then (a.reach: 0..1, set by the scene)
  stzKneel: { dur: 99, hold: true, pose: (t, P, A, a) => {
    const u = ease.outCubic(S(0, 0.5, t)), r = a?.reach || 0;
    A.y += -0.2 * u; A.sq += 0.05 * u; A.body.x += (0.22 + 0.1 * r) * u; A.head.x += (0.12 + 0.08 * r) * u;
    A.legL.x += -1.15 * u; A.legR.x += -0.2 * u; A.legR.z += -0.08 * u;
    A.armL.x += lerp(-0.4, -1.25, r) * u; A.armL.z += lerp(-0.1, -0.35, r) * u; A.foreL.x += -0.3 * r * u;
    A.armR.x += -0.15 * u; A.armR.z += 0.2 * u; A.earKick += -0.4 * u + 0.6 * r * u; A.eyesClosed = r > 0.7 ? 1 : 0;
  } },
  // getting up from the lanterns, solemnly (the knee, then tall)
  stzRise: { dur: 0.8, pose: (t, P, A) => {
    const u = 1 - ease.inOutQuad(S(0, 1, t));
    A.y += -0.2 * u; A.body.x += 0.22 * u; A.legL.x += -1.15 * u; A.legR.x += -0.2 * u; A.sq += 0.05 * u - 0.04 * bump(0.6, 1, t);
  } },
  // the grave announcement: tall, a paw raised palm-out toward you, chin up ("Halt, traveller…")
  stzProclaim: { dur: 99, hold: true, pose: (t, P, A) => {
    const u = ease.outBack(S(0, 0.35, t));
    A.armR.x += -1.55 * u; A.armR.z += -0.15 * u; A.foreR.x += -0.25 * u; A.armL.x += -0.15 * u; A.armL.z += 0.25 * u;
    A.head.x += -0.12 * u; A.body.x += -0.06 * u; A.sq += -0.05 * u; A.y += 0.02 * u;
  } },
  // licked mid-word by the ghost pup: head yanked back, eyes screwed shut, ears flung up, a little hop
  stzLicked: { dur: 1.0, pose: (t, P, A) => {
    const k = bump(0, 0.55, t), j = bump(0.05, 0.35, t), r = 1 - S(0.55, 1, t);
    A.head.x += -0.32 * k; A.head.y += 0.18 * Math.sin(t * 30) * k; A.head.z += 0.2 * k; A.body.x += -0.12 * k;
    A.eyesClosed = k > 0.3 ? 1 : 0; A.earKick += 3.5 * j; A.y += 0.06 * j; A.sq += -0.06 * j;
    A.armR.x += -0.6 * k * r; A.armR.z += 0.6 * k * r; A.armL.x += -0.6 * k * r; A.armL.z += -0.6 * k * r; A.mouth = Math.max(A.mouth, 0.6 * k);
  } },
  // the tome opened to snuff the lanterns into it (both paws holding it up before him)
  stzTomeHold: { dur: 99, hold: true, pose: (t, P, A) => {
    const u = ease.outCubic(S(0, 0.3, t));
    A.armL.x += -1.15 * u; A.armL.z += -0.45 * u; A.foreL.x += -0.5 * u; A.armR.x += -1.05 * u; A.armR.z += 0.4 * u; A.foreR.x += -0.4 * u;
    A.head.x += 0.16 * u; A.body.x += 0.04 * u; A.eyesClosed = u > 0.8 && Math.sin(t * 2) > 0.6 ? 1 : 0;
  } },
};
/** the actions that root him (WASD won't walk out of them): player.js BUSY */
export const SHIHTZU_ROOTED = ['flailSwing1', 'flailSwing2', 'flailSlam', 'wallop', 'hexFlick', 'tugThrow', 'tugHaul', 'stzWhirl', 'sulk', 'sulkSpin', 'sigh', 'hexRaise', 'awoo', 'tomeRead', 'lanternSet']; // (stzWhirl: he walks slowly while it whirls: canMoveWhileActing)

// ------------------------------------------------------------------ charge wind-ups (combat/charge.js plays 'charge')
// (t: seconds held, k: 0..1 of the whole charge, A: the pose accumulator, e: the blend in/out). Each holds the wound-back
// frame of the action its release plays (chargedShihtzu.js fromFrame), deepening with k and trembling when full.
export const SHIHTZU_CHARGE_POSES = {
  // the flail wound right back behind him (wallop at u ≈ 0.5), the ball circling low at his back, faster as it fills
  stzWallop(t, k, A, e) {
    A.armR.x += (-1.5 - 0.15 * k) * e; A.armR.z += (-1.2 - 0.1 * k) * e; A.armL.x += -0.5 * e; A.armL.z += 0.45 * e;
    A.body.y += (-0.8 - 0.15 * k) * e; A.body.x += -0.1 * e; A.head.y += (-0.35 - 0.05 * k) * e; A.y += -0.04 * e;
    A.legL.x += 0.2 * e; A.legR.x += -0.2 * e; A.legL.z += 0.12 * e; A.legR.z += -0.12 * e; A.sq += (0.04 + 0.06 * k) * e;
    const a = Math.PI - t * (6 + 8 * k); guide(A, Math.cos(a) * 0.9 - 0.3, -0.1 + 0.15 * k, Math.sin(a) * 0.6 - 0.4, 0.7 * e);
  },
  // the ball whirled overhead, quicker as it fills (Tug of Woe, Melancholy Maelstrom)
  stzWhirlUp(t, k, A, e) {
    A.armR.x += -2.9 * e; A.armR.z += 0.25 * e; A.armL.x += -0.35 * e; A.armL.z += 0.4 * e; A.body.x += -0.05 * e; A.sq += 0.04 * k * e;
    A.body.y += Math.sin(t * (8 + 8 * k)) * 0.06 * e; A.earKick += 0.5 * k * e;
    whirl(A, 0, 0, 1, 0, -Math.PI / 2 - t * (7 + 9 * k), 0.6, 0.9 * e, 0.1);
  },
  // Steadfast Sulk: already hunkering down behind the flail, sulkier by the second
  stzSulk(t, k, A, e) {
    A.y += (-0.05 - 0.03 * k) * e; A.sq += (0.07 + 0.04 * k) * e; A.body.x += 0.15 * e; A.head.x += (0.2 + 0.08 * k) * e;
    A.armR.x += -1.2 * e; A.armR.z += 0.9 * e; A.armL.x += -1.15 * e; A.armL.z += -0.9 * e; A.earKick += -1 * e;
    guide(A, 0.75, -0.55, 0.15, 0.5 * e);
  },
  // The Heaviest Sigh's breath, held (sigh at u ≈ 0.45): eyes shut, chest swelling, the flail up over his head
  stzSigh(t, k, A, e) {
    A.armR.x += (-2.6 - 0.4 * k) * e; A.armR.z += 0.3 * e; A.armL.x += -0.4 * e; A.armL.z += 0.35 * e;
    A.sq += (-0.08 - 0.06 * k) * e; A.body.x += (-0.12 - 0.06 * k) * e; A.head.x += (-0.2 - 0.08 * k) * e; A.y += 0.02 * k * e;
    A.eyesClosed = 1; A.earKick += 0.6 * k * e;
    guide(A, -0.35, 0.92, 0.05, 0.8 * e);
  },
  // a hex gathering on his raised left paw by his face (hexFlick at u ≈ 0.48), trembling as it fills
  stzHex(t, k, A, e) {
    const sh = Math.sin(t * (24 + 30 * k)) * 0.025 * k;
    A.armL.x += (-1.1 - 0.15 * k) * e; A.armL.z += (-0.55 + sh) * e; A.foreL.x += -0.7 * e; A.armR.x += -0.2 * e; A.armR.z += -0.15 * e;
    A.body.y += -0.25 * e; A.body.x += -0.06 * e; A.head.x += -0.08 * e; A.sq += (0.04 + 0.04 * k) * e; A.earKick += 0.6 * k * e;
  },
  // both paws up, the gloom gathering over his head (hexRaise at u ≈ 0.45)
  stzHexUp(t, k, A, e) {
    const sh = Math.sin(t * (20 + 30 * k)) * 0.03 * k;
    A.armR.x += (-2.85 + sh) * e; A.armR.z += -0.35 * e; A.armL.x += (-2.85 - sh) * e; A.armL.z += 0.35 * e;
    A.body.x += -0.14 * e; A.head.x += -0.2 * e; A.y += (0.04 + 0.02 * k) * e; A.sq += (-0.06 - 0.03 * k) * e; A.earKick += 1 * k * e;
  },
  // the breath before the Awoo: head tipping back, chest filling
  stzAwoo(t, k, A, e) {
    A.head.x += (-0.3 - 0.2 * k) * e; A.body.x += (-0.08 - 0.06 * k) * e; A.sq += (-0.05 - 0.04 * k) * e; A.armR.z += -0.25 * e; A.armL.z += 0.25 * e;
    A.eyesClosed = 1; A.earKick += 0.8 * k * e;
  },
  // reading from the tome, the page held up close (tomeRead at u ≈ 0.4)
  stzTome(t, k, A, e) {
    A.armL.x += -1.25 * e; A.armL.z += -0.45 * e; A.foreL.x += -0.55 * e; A.armR.x += (-0.3 - 0.5 * k) * e; A.armR.z += 0.2 * e;
    A.head.x += (0.18 - 0.05 * k) * e; A.body.x += 0.05 * e; A.sq += 0.03 * e; A.mouth = Math.max(A.mouth, 0.25 * Math.abs(Math.sin(t * 9)) * e);
  },
};
addChargePoses(SHIHTZU_CHARGE_POSES);
