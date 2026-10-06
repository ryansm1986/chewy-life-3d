// Poe's actions (docs/POE.md): the one-paw fūma slash combo, the sidearm Fūma Throw and its catch, the hand seal, the
// Shadow Step melt-and-strike, and the sneeze. Merged into animator.js' ACTIONS (same format: dur in s, ev {name: t01},
// pose(t01, P, A) adding offsets to the pose accumulator). Conventions (animator.js): armR.x < 0 raises the right arm
// forward / up, armR.z > 0 swings it inward across the body (< 0 outward); armL is mirrored in z; body.y twists, body.x
// leans forward; A.y lifts the whole rig; sq squashes (> 0) or stretches (< 0).
// The fūma itself is posed by actors/poeGear.js (in the paw it spins during the combo); combat/poeSkills.js fires the hits.
import { clamp, lerp, ease } from '../core/util.js';
import { addChargePoses } from './chargePoses.js';

const S = (a, b, t) => clamp((t - a) / (b - a)); // 0..1 over [a, b]
const bump = (a, b, t) => Math.sin(S(a, b, t) * Math.PI); // 0 → 1 → 0 over [a, b]

export const POE_ACTIONS = {
  // forehand: the fūma swung out to the right and up, then whipped across the front to the left
  fumaSlash: { dur: 0.34, ev: { hit: 0.44 }, pose: (t, P, A) => {
    const w = ease.outCubic(S(0, 0.34, t)), s = ease.outQuad(S(0.34, 0.52, t)), r = ease.inOutQuad(S(0.58, 1, t)), k = 1 - r;
    A.armR.x += lerp(lerp(0, -1.75, w), -1.15, s) * k; A.armR.z += lerp(lerp(0, -1.05, w), 1.25, s) * k;
    A.armL.x += -0.45 * w * k; A.armL.z += lerp(0.2, -0.35, s) * k;
    A.body.y += lerp(lerp(0, 0.5, w), -0.55, s) * k; A.body.x += 0.12 * s * k; A.head.y += lerp(-0.25 * w, 0.2, s) * k;
    A.sq += (0.05 * w * (1 - s) - 0.05 * s) * k; A.y += 0.03 * bump(0.3, 0.6, t); A.earKick += 2.2 * s * k;
  } },
  // backhand: from across the body back out to the right, a step in
  fumaSlash2: { dur: 0.32, ev: { hit: 0.42 }, pose: (t, P, A) => {
    const w = ease.outCubic(S(0, 0.32, t)), s = ease.outQuad(S(0.32, 0.5, t)), r = ease.inOutQuad(S(0.56, 1, t)), k = 1 - r;
    A.armR.x += lerp(lerp(0, -1.35, w), -0.9, s) * k; A.armR.z += lerp(lerp(0, 1.3, w), -1.25, s) * k;
    A.armL.x += 0.3 * w * k; A.armL.z += -0.25 * k;
    A.body.y += lerp(lerp(0, -0.5, w), 0.55, s) * k; A.body.x += 0.1 * s * k; A.head.y += lerp(0.2 * w, -0.2, s) * k;
    A.legL.x += -0.25 * s * k; A.legR.x += 0.2 * s * k;
    A.sq += -0.05 * s * k; A.earKick += 2 * s * k;
  } },
  // the finisher: a full twirl with the fūma held straight out (a little hop, ears flying), a show-off flourish at the end
  fumaTwirl: { dur: 0.48, ev: { hit: 0.5 }, pose: (t, P, A) => {
    const sp = ease.inOutQuad(S(0.08, 0.72, t)), arm = bump(0, 0.9, t), r = ease.inOutQuad(S(0.72, 1, t));
    A.spin = sp * Math.PI * 2;
    A.armR.z += -1.45 * arm; A.armR.x += -0.35 * arm; A.armL.z += 1.0 * arm * (1 - r); A.armL.x += -0.3 * arm;
    A.y += 0.12 * bump(0.12, 0.7, t); A.sq += -0.06 * bump(0.1, 0.5, t) + 0.08 * bump(0.68, 0.9, t);
    A.earKick += 4 * bump(0.1, 0.8, t); A.tailWag = 3; A.eyesHappy = t > 0.78 ? 1 : 0;
  } },
  // Fūma Throw: a sidearm frisbee throw — coil left with the fūma across the body, the free paw aiming, then whip it out
  fumaThrow: { dur: 0.46, ev: { release: 0.45 }, pose: (t, P, A) => {
    const w = ease.outCubic(S(0, 0.42, t)), rl = ease.outQuad(S(0.42, 0.56, t)), r = ease.inOutQuad(S(0.62, 1, t)), k = 1 - r;
    A.armR.x += lerp(lerp(0, -1.05, w), -1.45, rl) * k; A.armR.z += lerp(lerp(0, 1.55, w), -1.3, rl) * k;
    A.armL.x += lerp(-1.35 * w, -0.5, rl) * k; A.armL.z += lerp(-0.25 * w, 0.4, rl) * k; // (the free paw points at the target)
    A.body.y += lerp(lerp(0, -0.75, w), 0.6, rl) * k; A.body.x += lerp(-0.12 * w, 0.2, rl) * k; A.head.y += lerp(0.5 * w, -0.25, rl) * k;
    A.legL.x += lerp(-0.25 * w, 0.2, rl) * k; A.legR.x += lerp(0.15 * w, -0.25, rl) * k;
    A.sq += (0.07 * w * (1 - rl) - 0.08 * rl) * k; A.earKick += 3 * rl * k; A.tailWag = 2;
  } },
  // the fūma comes home: a paw up, a snap and a proud little bounce
  fumaCatch: { dur: 0.36, ev: { catch: 0.18 }, pose: (t, P, A) => {
    const u = bump(0, 1, t), c = bump(0.15, 0.5, t);
    A.armR.x += -1.5 * u; A.armR.z += -0.5 * u; A.armL.z += -0.3 * c;
    A.sq += 0.08 * c; A.y += 0.04 * bump(0.4, 0.9, t); A.head.x += -0.1 * u; A.eyesHappy = t > 0.35 ? 1 : 0; A.tailWag = 3;
  } },
  // a ninja hand seal at the chest (paws pressed together, head bowed), then the bomb slapped down at her feet: POOF
  handSeal: { dur: 0.52, ev: { seal: 0.3, poof: 0.56 }, pose: (t, P, A) => {
    const s = ease.outBack(S(0, 0.3, t)), d = ease.outQuad(S(0.5, 0.66, t)), r = ease.inOutQuad(S(0.72, 1, t)), k = 1 - r;
    const shake = Math.sin(t * 70) * 0.04 * S(0.2, 0.5, t) * (1 - d);
    A.armR.x += (lerp(0, -1.3, s) + 1.6 * d) * k; A.armR.z += (lerp(0, 1.05, s) - 1.6 * d + shake) * k;
    A.armL.x += (lerp(0, -1.3, s) + 1.6 * d) * k; A.armL.z += (lerp(0, -1.05, s) + 1.6 * d - shake) * k;
    A.head.x += (0.22 * s - 0.25 * d) * k; A.body.x += (0.08 * s - 0.1 * d) * k;
    A.sq += (0.1 * s * (1 - d) - 0.1 * d) * k; A.y += 0.1 * bump(0.55, 0.9, t);
    A.eyesClosed = t > 0.12 && t < 0.5 ? 1 : 0; A.earKick += 3 * d * k; A.tailWag = 2.5 * d;
  } },
  // Shadow Step, part 1: crouch and melt into her shadow (arms swept back like a ninja dash); 'step' = gone
  shadowStepOut: { dur: 0.24, ev: { step: 0.92 }, pose: (t, P, A) => {
    const c = ease.outQuad(S(0, 0.6, t)), sink = ease.inQuad(S(0.45, 1, t));
    A.sq += 0.16 * c - 0.1 * sink; A.y += -0.1 * c - 0.35 * sink; A.body.x += 0.45 * c;
    A.armR.x += 1.0 * c; A.armL.x += 1.0 * c; A.armR.z += -0.4 * c; A.armL.z += 0.4 * c;
    A.head.x += -0.15 * c; A.earKick += -2 * c;
  } },
  // part 2: rise out of the shadow right behind the foe in a rising cut
  shadowStrike: { dur: 0.36, ev: { hit: 0.36 }, pose: (t, P, A) => {
    const rise = ease.outBack(S(0, 0.3, t)), s = ease.outQuad(S(0.3, 0.48, t)), r = ease.inOutQuad(S(0.6, 1, t)), k = 1 - r;
    A.y += lerp(-0.3, 0.05, rise) * (1 - S(0.5, 1, t)) ; A.sq += (0.12 * (1 - rise) - 0.08 * s) * k;
    A.armR.x += lerp(lerp(0.6, -0.5, rise), -2.4, s) * k; A.armR.z += lerp(1.0 * rise, -0.6, s) * k;
    A.armL.x += 0.6 * (1 - s) * k; A.armL.z += 0.35 * k;
    A.body.y += lerp(-0.45 * rise, 0.5, s) * k; A.body.x += lerp(0.35, -0.08, s) * k; A.head.x += -0.12 * s * k;
    A.earKick += 3 * s * k; A.tailWag = 2;
  } },
  // the giveaway: a big inhale (head back, eyes squeezing) and ah-ah-ACHOO! (the whole pug jolts forward)
  sneeze: { dur: 0.9, ev: { achoo: 0.56 }, pose: (t, P, A) => {
    const inh = ease.inOutQuad(S(0, 0.5, t)) * (1 - S(0.52, 0.6, t)), ch = S(0.52, 0.6, t) * (1 - ease.inOutQuad(S(0.62, 1, t)));
    A.head.x += -0.38 * inh + 0.5 * ch; A.body.x += -0.12 * inh + 0.28 * ch; A.sq += -0.05 * inh - 0.1 * ch;
    A.armR.x += -0.5 * inh; A.armL.x += -0.5 * inh; A.armR.z += 0.6 * inh; A.armL.z += -0.6 * inh; // (paws up toward the nose)
    A.mouth = Math.max(A.mouth, 0.35 * inh + ch); A.eyesClosed = inh > 0.45 || ch > 0.05 ? 1 : 0; A.earKick += 7 * ch; A.y += 0.05 * ch;
  } },

  // ================================================================== phase 2: the other skills
  // Kunai Fan: paws crossed at the chest with the kunai fanned between her claws, then flung out wide
  kunaiFan: { dur: 0.4, ev: { release: 0.45 }, pose: (t, P, A) => {
    const w = ease.outCubic(S(0, 0.4, t)), f = ease.outQuad(S(0.4, 0.56, t)), r = ease.inOutQuad(S(0.62, 1, t)), k = 1 - r;
    A.armR.x += lerp(-1.2 * w, -1.5, f) * k; A.armR.z += lerp(1.3 * w, -1.05, f) * k;
    A.armL.x += lerp(-1.2 * w, -1.5, f) * k; A.armL.z += lerp(-1.3 * w, 1.05, f) * k;
    A.body.x += lerp(-0.08 * w, 0.22, f) * k; A.head.x += lerp(0.12 * w, -0.08, f) * k;
    A.sq += (0.07 * w * (1 - f) - 0.06 * f) * k; A.y += 0.05 * bump(0.42, 0.75, t); A.earKick += 3 * f * k; A.tailWag = 2;
  } },
  // Shadow Stitch: three kunai held high, then an overhand whip straight down at the foe's shadow
  stitchThrow: { dur: 0.42, ev: { release: 0.52 }, pose: (t, P, A) => {
    const w = ease.outCubic(S(0, 0.45, t)), th = ease.inQuad(S(0.45, 0.58, t)), r = ease.inOutQuad(S(0.64, 1, t)), k = 1 - r;
    A.armR.x += lerp(-2.9 * w, -0.35, th) * k; A.armR.z += -0.2 * w * k;
    A.armL.x += lerp(-1.1 * w, -0.4, th) * k; A.armL.z += 0.25 * k;
    A.body.x += lerp(-0.14 * w, 0.4, th) * k; A.head.x += lerp(-0.12 * w, 0.28, th) * k; A.y += 0.04 * w * (1 - th);
    A.sq += (-0.05 * w + 0.1 * th) * k; A.earKick += 2.5 * th * k;
  } },
  // Whirling Fūma: a spare fūma pulled from behind her back, a low crouch and a skimming sidearm fling along the floor
  sawThrow: { dur: 0.5, ev: { release: 0.5 }, pose: (t, P, A) => {
    const reach = ease.outCubic(S(0, 0.3, t)), w = ease.inOutQuad(S(0.25, 0.48, t)), f = ease.outQuad(S(0.48, 0.62, t)), r = ease.inOutQuad(S(0.68, 1, t)), k = 1 - r;
    A.armR.x += lerp(lerp(-2.6 * reach, -0.6, w), -1.0, f) * k; A.armR.z += lerp(lerp(-0.3 * reach, 1.4, w), -1.35, f) * k;
    A.armL.x += -0.5 * w * k; A.armL.z += lerp(-0.2, 0.6, f) * k;
    A.body.y += lerp(-0.6 * w, 0.55, f) * k; A.body.x += (0.3 * w + 0.1 * f) * k;
    A.sq += (0.12 * w * (1 - f) + 0.04 * f) * k; A.y += -0.06 * w * k; A.legL.x += -0.3 * w * k; A.legR.x += 0.25 * w * k; A.earKick += 3 * f * k;
  } },
  // Shuriken Rain: crouch, a big leap, both paws fling the shuriken down at the top, and a landing with a pose
  rainLeap: { dur: 0.78, ev: { throw: 0.46, land: 0.86 }, pose: (t, P, A) => {
    const c = bump(0, 0.3, t), air = S(0.14, 0.82, t), up = Math.sin(air * Math.PI), wind = ease.outQuad(S(0.18, 0.4, t)), fl = ease.outQuad(S(0.4, 0.56, t)), land = bump(0.8, 0.96, t), pose = ease.outBack(S(0.86, 1, t));
    A.y += 1.25 * up - 0.06 * c; A.sq += 0.14 * c - 0.07 * up * (1 - fl) + 0.12 * land;
    A.armR.x += (0.8 * c + lerp(-2.8 * wind, -0.7, fl) * (1 - pose) - 2.5 * pose); A.armR.z += 0.25 * pose;
    A.armL.x += (0.8 * c + lerp(-2.6 * wind, -0.6, fl) * (1 - pose)); A.armL.z += 0.8 * pose;
    A.body.x += (0.25 * c + 0.32 * fl * (1 - land)) * (1 - pose); A.roll = 0.35 * fl * (1 - S(0.6, 0.82, t));
    A.legL.x += -0.9 * up; A.legR.x += -0.7 * up; A.earKick += 4 * up; A.eyesHappy = t > 0.88 ? 1 : 0; A.tailWag = t > 0.86 ? 3 : 1;
  } },
  // Thousand Star Flurry: she spins on the spot, arms flung out, emptying every pouch; a little "ta-da" at the end
  starSpin: { dur: 2.1, ev: { end: 0.99 }, pose: (t, P, A, a) => {
    const on = S(0, 0.06, t), off = S(0.9, 1, t), spinT = t * (a?.dur || 2.1);
    A.spin = spinT * Math.PI * 2 * 3.2 * (1 - off * 0.2);
    const flick = Math.sin(spinT * 38) * 0.18;
    A.armR.z += (-1.5 + flick) * on * (1 - off); A.armL.z += (1.5 - flick) * on * (1 - off); A.armR.x += -0.35 * on * (1 - off); A.armL.x += -0.25 * on * (1 - off);
    A.armR.x += -2.4 * off; A.armR.z += 1.0 * off; A.armL.x += -2.4 * off; A.armL.z += -1.0 * off; // (the finish: paws crossed overhead)
    A.y += 0.08 * Math.abs(Math.sin(spinT * 6)) * (1 - off); A.sq += -0.04 * on + 0.1 * bump(0.9, 1, t);
    A.earKick += 4 * (1 - off); A.eyesHappy = off > 0.5 ? 1 : 0; A.tailWag = 3;
  } },
  // Fire Release: Puff Ball — a seal, a big inhale with very round cheeks, and the spit
  puffSpit: { dur: 0.55, ev: { spit: 0.6 }, pose: (t, P, A) => {
    const s = ease.outBack(S(0, 0.25, t)), inh = ease.inOutQuad(S(0.25, 0.58, t)), sp = ease.outQuad(S(0.58, 0.7, t)), r = ease.inOutQuad(S(0.72, 1, t)), k = 1 - r;
    A.armR.x += lerp(-1.3, -0.5, inh) * s * k; A.armR.z += lerp(1.05, 0.3, inh) * s * k; A.armL.x += lerp(-1.3, -0.5, inh) * s * k; A.armL.z += lerp(-1.05, -0.3, inh) * s * k;
    A.head.x += (-0.35 * inh * (1 - sp) + 0.32 * sp) * k; A.body.x += (-0.12 * inh * (1 - sp) + 0.22 * sp) * k;
    A.sq += (-0.07 * inh * (1 - sp) + 0.08 * sp) * k; A.y += 0.04 * inh * (1 - sp);
    A.mouth = Math.max(A.mouth, sp * k); A.eyesClosed = inh > 0.3 && sp < 0.2 ? 1 : 0; A.earKick += 3 * sp * k;
  } },
  // Lightning Release: Thunder Paw — one paw raised high, crackling, then slapped down onto the floor
  thunderSlap: { dur: 0.6, ev: { slap: 0.62 }, pose: (t, P, A) => {
    const up = ease.outCubic(S(0, 0.5, t)), sl = ease.inQuad(S(0.52, 0.64, t)), r = ease.inOutQuad(S(0.72, 1, t)), k = 1 - r;
    const buzz = Math.sin(t * 90) * 0.05 * up * (1 - sl);
    A.armR.x += lerp(-3.0 * up + buzz, 0.35, sl) * k; A.armR.z += -0.15 * up * k; A.armL.z += lerp(0.5 * up, 0.2, sl) * k; A.armL.x += -0.3 * k;
    A.body.x += lerp(-0.12 * up, 0.55, sl) * k; A.head.x += lerp(-0.22 * up, 0.25, sl) * k; A.y += lerp(0.05 * up, -0.08, sl) * k;
    A.sq += (-0.05 * up * (1 - sl) + 0.16 * sl) * k; A.earKick += (1.5 * up + 4 * sl) * k;
  } },
  // Smoke Dragon: three quick seals (high, at the chest, low), then both paws thrust forward to send it
  dragonSeal: { dur: 0.95, ev: { seal: 0.2, seal2: 0.4, release: 0.64 }, pose: (t, P, A) => {
    const a1 = bump(0.02, 0.28, t), a2 = bump(0.22, 0.46, t), a3 = bump(0.4, 0.62, t), th = ease.outQuad(S(0.6, 0.72, t)), r = ease.inOutQuad(S(0.78, 1, t)), k = 1 - r;
    const seal = (x, z) => { A.armR.x += x; A.armR.z += z; A.armL.x += x; A.armL.z += -z; };
    seal(-2.1 * a1, 0.9 * a1); seal(-1.3 * a2, 1.2 * a2); seal(-0.7 * a3, 1.0 * a3);
    seal(-1.6 * th * k, 0.25 * th * k);
    A.body.x += (0.3 * th - 0.08 * a1) * k; A.head.x += (-0.2 * a1 + 0.15 * a3) * k; A.y += 0.05 * (a1 + a2 + a3) / 3;
    A.sq += (0.05 * a3 - 0.06 * th) * k; A.eyesClosed = a2 > 0.4 ? 1 : 0; A.earKick += 3 * th * k; A.tailWag = 2;
  } },
  // Shadow Clone: paws crossed in front of her face, head bowed, a shiver — then flung wide as the copies POOF out
  crossSeal: { dur: 0.55, ev: { poof: 0.6 }, pose: (t, P, A) => {
    const s = ease.outBack(S(0, 0.28, t)), sh = Math.sin(t * 64) * 0.05 * S(0.2, 0.55, t), o = ease.outQuad(S(0.58, 0.72, t)), r = ease.inOutQuad(S(0.76, 1, t)), k = 1 - r;
    A.armR.x += lerp(-1.9 * s, -1.2, o) * k; A.armR.z += (lerp(1.2 * s, -1.2, o) + sh) * k;
    A.armL.x += lerp(-1.55 * s, -1.2, o) * k; A.armL.z += (lerp(-1.25 * s, 1.2, o) - sh) * k;
    A.head.x += (0.25 * s * (1 - o) - 0.15 * o) * k; A.sq += (0.08 * s * (1 - o) - 0.08 * o) * k; A.y += 0.08 * bump(0.58, 0.9, t);
    A.eyesClosed = t > 0.12 && t < 0.58 ? 1 : 0; A.earKick += 3 * o * k; A.tailWag = 2.5 * o;
  } },
  // Substitution: a tiny quick seal and a crouch, and she's gone (the log takes her place)
  swapSeal: { dur: 0.26, ev: { swap: 0.72 }, pose: (t, P, A) => {
    const s = ease.outBack(S(0, 0.5, t)), c = ease.inQuad(S(0.45, 1, t));
    A.armR.x += -1.2 * s; A.armR.z += 1.0 * s; A.armL.x += -1.2 * s; A.armL.z += -1.0 * s;
    A.sq += 0.1 * s + 0.08 * c; A.y += -0.08 * c; A.eyesClosed = s > 0.5 ? 1 : 0;
  } },
  // …and the landing at the far end: up out of a crouch into a proud little pose
  swapLand: { dur: 0.34, pose: (t, P, A) => {
    const c = 1 - ease.outQuad(S(0, 0.4, t)), p = ease.outBack(S(0.25, 0.7, t)) * (1 - ease.inOutQuad(S(0.75, 1, t)));
    A.sq += 0.15 * c; A.y += -0.06 * c + 0.05 * bump(0.3, 0.7, t);
    A.armR.x += -2.4 * p; A.armR.z += 0.3 * p; A.armL.z += 0.7 * p; A.eyesHappy = p > 0.4 ? 1 : 0; A.tailWag = 3;
  } },
  // Afterimage Dash: a low ninja sprint, arms swept back (played to the dash's length)
  dashRun: { dur: 0.3, ev: { end: 0.99 }, pose: (t, P, A) => {
    const on = S(0, 0.15, t), ph = t * Math.PI * 2 * 3;
    A.body.x += 0.55 * on; A.armR.x += 1.15 * on; A.armL.x += 1.15 * on; A.armR.z += -0.25 * on; A.armL.z += 0.25 * on;
    A.legL.x += Math.sin(ph) * 0.9 * on; A.legR.x += -Math.sin(ph) * 0.9 * on; A.y += 0.04 * Math.abs(Math.sin(ph)); A.sq += 0.04 * on;
    A.head.x += -0.2 * on; A.earKick += -2.5 * on;
  } },
  // Vanish: paws pressed together, eyes squeezed shut, thinking very invisible thoughts (a tiny shiver), then gone
  vanishSeal: { dur: 0.5, ev: { vanish: 0.62 }, pose: (t, P, A) => {
    const s = ease.outBack(S(0, 0.3, t)), sh = Math.sin(t * 50) * 0.035 * S(0.25, 0.6, t), r = ease.inOutQuad(S(0.7, 1, t)), k = 1 - r;
    A.armR.x += -1.35 * s * k; A.armR.z += (1.1 * s + sh) * k; A.armL.x += -1.35 * s * k; A.armL.z += (-1.1 * s - sh) * k;
    A.head.x += (0.25 * s + sh * 2) * k; A.sq += 0.08 * s * k; A.y += -0.03 * s * k; A.eyesClosed = t > 0.1 && t < 0.7 ? 1 : 0;
  } },
  // Caltrop Flip: a neat back-flip away from the aim, caltrops scattered at take-off, a crouched landing
  backflip: { dur: 0.5, ev: { scatter: 0.18, land: 0.92 }, pose: (t, P, A) => {
    const c = bump(0, 0.22, t), fl = ease.inOutQuad(S(0.12, 0.86, t)), air = Math.sin(S(0.12, 0.88, t) * Math.PI), land = bump(0.84, 1, t);
    A.roll = -fl * Math.PI * 2; A.y += 0.75 * air - 0.05 * c; A.sq += 0.12 * c + 0.14 * land - 0.06 * air;
    A.armR.x += -2.6 * air + 0.7 * c; A.armL.x += -2.6 * air + 0.7 * c; A.armR.z += -0.3 * air; A.armL.z += 0.3 * air;
    A.legL.x += -1.1 * air; A.legR.x += -1.1 * air; A.earKick += 4 * air;
  } },
  // her joining scene (actors/poeJoin.js): tiptoeing after you, crouched, paws up like a cartoon burglar…
  sneakWalk: { dur: 99, hold: true, pose: (t, P, A) => {
    const b = Math.sin(t * 9), e = Math.min(1, t / 0.2);
    A.sq += 0.12 * e; A.y += (-0.06 + Math.abs(b) * 0.025) * e; A.body.x += 0.35 * e;
    A.armR.x += -1.3 * e; A.armR.z += 0.6 * e; A.armL.x += -1.05 * e; A.armL.z += -0.45 * e;
    A.head.x += (-0.12 + b * 0.03) * e; A.head.y += Math.sin(t * 2.3) * 0.28 * e; A.earKick += -1.5 * e; A.tailWag = 0.5;
  } },
  // …and stock-still the moment you look her way: straight as a bamboo stalk, paws at her sides, eyes squeezed shut
  ninjaFreeze: { dur: 99, hold: true, pose: (t, P, A) => {
    const e = Math.min(1, t / 0.12), tr = Math.sin(t * 40) * 0.012 * (t > 0.4 ? 1 : 0);
    A.sq += -0.07 * e; A.y += 0.03 * e; A.armR.z += (-0.14 + tr) * e; A.armL.z += (0.14 - tr) * e; A.armR.x += 0.12 * e; A.armL.x += 0.12 * e;
    A.body.x += -0.06 * e; A.head.x += -0.14 * e; A.eyesClosed = 1; A.legL.z += 0.05 * e; A.legR.z += -0.05 * e; A.tailWag = 0;
  } },
  // Bullseye Mark: a dainty flick of a very small brush toward the foe
  brushFlick: { dur: 0.4, ev: { flick: 0.55 }, pose: (t, P, A) => {
    const u = ease.outCubic(S(0, 0.45, t)), f = ease.outQuad(S(0.48, 0.62, t)), r = ease.inOutQuad(S(0.7, 1, t)), k = 1 - r;
    A.armR.x += lerp(-1.7 * u, -1.25, f) * k; A.armR.z += lerp(0.45 * u, -0.55, f) * k; A.armL.z += 0.35 * u * k; A.armL.x += -0.25 * k;
    A.head.y += lerp(0.15 * u, -0.1, f) * k; A.head.x += -0.06 * u * k; A.body.y += lerp(0.2 * u, -0.15, f) * k;
    A.eyesHappy = f > 0.2 ? 1 : 0; A.tailWag = 2;
  } },
};
/** the actions that root her (WASD won't walk out of them): player.js BUSY */
export const POE_ROOTED = ['fumaSlash', 'fumaSlash2', 'fumaTwirl', 'fumaThrow', 'handSeal', 'shadowStepOut', 'shadowStrike',
  'kunaiFan', 'stitchThrow', 'sawThrow', 'rainLeap', 'starSpin', 'puffSpit', 'thunderSlap', 'dragonSeal', 'crossSeal', 'swapSeal', 'dashRun', 'vanishSeal', 'backflip', 'brushFlick'];

// ------------------------------------------------------------------ charge wind-ups (combat/charge.js plays 'charge'; chargePoses.js)
// Each holds the frame its release starts from (the release plays its action from that u: chargedPoe.js) and deepens
// with the charge k; e eases the pose in. Registered into chargePoses.js' families.
export const POE_CHARGE_POSES = {
  // the fūma coiled back across her body in both paws (fumaThrow / sawThrow at u ≈ 0.4)
  poeFuma(t, k, A, e) {
    A.armR.x += (-1.05 - 0.2 * k) * e; A.armR.z += (1.55 + 0.1 * k) * e; A.armL.x += (-1.35 + 0.2 * k) * e; A.armL.z += (-0.25 - 0.5 * k) * e;
    A.body.y += (-0.75 - 0.25 * k) * e; A.body.x += -0.12 * e; A.head.y += (0.5 + 0.1 * k) * e;
    A.legL.x += -0.25 * e; A.legR.x += 0.15 * e; A.sq += (0.07 + 0.06 * k) * e; A.y += -0.03 * k * e; A.tailWag = 1.5;
  },
  // the kunai fanned between crossed paws at her chest (kunaiFan / stitchThrow at u ≈ 0.42)
  poeKunai(t, k, A, e) {
    A.armR.x += (-1.2 - 0.25 * k) * e; A.armR.z += (1.3 + 0.1 * k) * e; A.armL.x += (-1.2 - 0.25 * k) * e; A.armL.z += (-1.3 - 0.1 * k) * e;
    A.body.x += (-0.08 - 0.08 * k) * e; A.head.x += 0.12 * e; A.sq += (0.07 + 0.06 * k) * e; A.y += -0.02 * k * e; A.earKick += -0.6 * k * e;
  },
  // a hand seal at the chest, eyes closed, rising a little on the gathering smoke (the jutsu: handSeal / crossSeal / vanishSeal ≈ 0.3)
  poeSeal(t, k, A, e) {
    const sh = Math.sin(t * (20 + 30 * k)) * 0.02 * k;
    A.armR.x += -1.3 * e; A.armR.z += (1.05 + sh) * e; A.armL.x += -1.3 * e; A.armL.z += (-1.05 - sh) * e;
    A.head.x += (0.22 + 0.06 * k) * e; A.body.x += 0.08 * e; A.sq += (0.1 - 0.05 * k) * e; A.y += (0.03 + 0.05 * k + 0.02 * Math.sin(t * 3)) * k * e;
    A.eyesClosed = 1; A.earKick += 0.8 * k * e; A.tailWag = 1.5;
  },
  // the seal, cheeks filling and head tipping back as the Puff Ball swells (puffSpit at 0.5)
  poePuff(t, k, A, e) {
    A.armR.x += -0.6 * e; A.armR.z += 0.45 * e; A.armL.x += -0.6 * e; A.armL.z += -0.45 * e;
    A.head.x += (-0.25 - 0.15 * k) * e; A.body.x += (-0.1 - 0.05 * k) * e; A.sq += (-0.05 - 0.05 * k) * e; A.y += 0.03 * k * e; A.eyesClosed = 1;
  },
  // one paw held high, crackling (thunderSlap at 0.5)
  poeThunder(t, k, A, e) {
    const buzz = Math.sin(t * 90) * (0.03 + 0.05 * k);
    A.armR.x += (-3.0 + buzz) * e; A.armR.z += -0.15 * e; A.armL.z += 0.5 * e; A.armL.x += -0.3 * e;
    A.body.x += -0.12 * e; A.head.x += -0.22 * e; A.y += (0.05 + 0.04 * k) * e; A.sq += -0.05 * e; A.earKick += (1.5 + 2 * k) * e;
  },
  // three seals cycling faster and faster (dragonSeal before the thrust)
  poeDragon(t, k, A, e) {
    const w = t * (4 + 8 * k), ph = w % 3, i = Math.floor(ph), f = ph - i, x = [-2.1, -1.3, -0.7][i], z = [0.9, 1.2, 1.0][i], b = Math.sin(f * Math.PI);
    A.armR.x += x * b * e; A.armR.z += z * b * e; A.armL.x += x * b * e; A.armL.z += -z * b * e;
    A.head.x += 0.1 * e; A.sq += 0.06 * k * e; A.y += 0.04 * k * e; A.eyesClosed = 1; A.tailWag = 2;
  },
  // a low ninja crouch, one paw on the floor, the other swept back (the dashes, the steps, the flip, the leap)
  poeCrouch(t, k, A, e) {
    A.sq += (0.12 + 0.12 * k) * e; A.y += (-0.04 - 0.07 * k) * e; A.body.x += (0.38 + 0.12 * k) * e;
    A.armL.x += 0.9 * e; A.armL.z += 0.15 * e; A.armR.x += (1.0 + 0.2 * k) * e; A.armR.z += -0.3 * e;
    A.legL.x += -0.35 * e; A.legR.x += 0.3 * e; A.head.x += -0.15 * e; A.earKick += (-0.8 - 0.8 * k) * e;
  },
  // arms crossed in, pouches full, a slow twist that winds up (Thousand Star Flurry)
  poeStars(t, k, A, e) {
    const tw = Math.sin(t * (3 + 6 * k)) * (0.15 + 0.35 * k);
    A.armR.x += -0.9 * e; A.armR.z += 1.3 * e; A.armL.x += -0.9 * e; A.armL.z += -1.3 * e;
    A.body.y += tw * e; A.sq += (0.08 + 0.06 * k) * e; A.y += -0.03 * k * e; A.earKick += 0.6 * k * e;
  },
  // the little brush held up by her face, taking aim (brushFlick at 0.45)
  poeBrush(t, k, A, e) {
    A.armR.x += -1.7 * e; A.armR.z += 0.45 * e; A.armL.z += 0.35 * e; A.armL.x += -0.25 * e;
    A.head.y += 0.15 * e; A.head.x += (-0.06 + 0.04 * Math.sin(t * 4)) * e; A.body.y += 0.2 * e; A.eyesHappy = k > 0.6 ? 1 : 0;
  },
};

addChargePoses(POE_CHARGE_POSES); // (combat/charge.js plays them by the table's pose name: rpg/chargePoe.js)
