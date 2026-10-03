// Villager "daily life" poses for humanoid rigs: bench sitting, chores (sweep / water / tend / fish / crank),
// chatting gestures and little idle fidgets. Same contract as animator.js ACTIONS: pose(t, P, A) adds offsets to the
// accumulator A (t = seconds for hold poses, 0..1 for one-shots). Registered into ACTIONS by animator.js.
// Axis cheat-sheet (biped): legs/arms x<0 = forward; armR z>0 / armL z<0 = inward-up; body.x>0 = lean forward;
// head.x>0 = look down, head.y = turn, head.z = tilt; A.y lifts the whole rig (rig.offsetY).
import { clamp, ease, smoothstep } from '../core/util.js';

export const SEAT_LIFT = 0.235; // nominal rig lift while seated; villager code sets pos.y from the real seat and the rig's rump height
const inOut = (u, a = 0.2, b = 0.25) => ease.inOutQuad(clamp(u / a)) * (1 - ease.inOutQuad(clamp((u - 1 + b) / b)));

// seated base: rump on the seat, legs out front (with an optional dangle), paws resting on the lap
function seat(A, k, t, dangle) {
  A.y += SEAT_LIFT * k;
  const sw = dangle * Math.sin(t * 2.6);
  A.legL.x += (-1.3 + sw) * k; A.legR.x += (-1.3 - sw) * k;
  A.armR.x += -0.62 * k; A.armR.z += 0.34 * k; A.armL.x += -0.62 * k; A.armL.z += -0.34 * k;
  A.body.x += -0.05 * k; A.sq += 0.02 * k;
}
const sitK = t => ease.inOutQuad(clamp(t / 0.35));
// hands clasped in front (shopkeeper / polite standing)
function clasp(A, k) { A.armR.x += -0.42 * k; A.armR.z += 0.5 * k; A.armL.x += -0.42 * k; A.armL.z += -0.5 * k; }
// paws behind the back
function behind(A, k) { A.armR.x += 0.45 * k; A.armR.z += 0.2 * k; A.armL.x += 0.45 * k; A.armL.z += -0.2 * k; }

export const LIFE_ACTIONS = {
  // ---- seated (hold). Villager code places the actor on the seat and turns it to face out.
  sitBench: { dur: 99, hold: true, pose: (t, P, A) => {
    const k = sitK(t), dangle = 0.24 * smoothstep(0.2, 0.8, Math.sin(t * 0.43 + 1));
    seat(A, k, t, dangle);
    A.head.y += Math.sin(t * 0.31) * 0.22 * k; A.head.z += Math.sin(t * 0.53) * 0.06 * k;
    A.sq += Math.sin(t * 2.1) * 0.008;
  } },
  sitDoze: { dur: 99, hold: true, pose: (t, P, A) => {
    const k = sitK(t);
    seat(A, k, t, 0);
    const br = Math.sin(t * 1.4);
    A.head.x += (0.36 + br * 0.05) * k; A.head.z += 0.12 * k; A.body.x += 0.12 * k;
    A.armR.x += 0.25 * k; A.armL.x += 0.25 * k;
    A.sq += br * 0.018 * k; A.eyesClosed = k > 0.4 ? 1 : 0;
  } },
  sitWave: { dur: 1.3, pose: (u, P, A) => {
    seat(A, 1, u * 1.3, 0);
    const w = Math.sin(clamp(u) * Math.PI), up = clamp(w * 3);
    A.armR.x += 0.62 * up - 0.3 * w; A.armR.z += 2.2 * up; A.armR.zWave = Math.sin(u * 26) * 0.35 * up;
    A.head.z += 0.12 * w; A.happy = 1; A.eyesHappy = w > 0.3 ? 1 : 0;
  } },
  standUp: { dur: 0.4, pose: (u, P, A) => { seat(A, 1 - ease.inOutQuad(clamp(u)), 0, 0); A.body.x += 0.25 * Math.sin(clamp(u) * Math.PI); } },

  // ---- chores (hold)
  sweep: { dur: 99, hold: true, pose: (t, P, A) => {
    const k = ease.outQuad(clamp(t / 0.3)), s = Math.sin(t * 4.2), c = Math.cos(t * 4.2);
    A.body.x += 0.2 * k; A.body.y += s * 0.3 * k;
    A.armR.x += (-0.55 + c * 0.1) * k; A.armR.z += (0.3 + s * 0.28) * k;
    A.armL.x += (-0.95 + c * 0.1) * k; A.armL.z += (-0.5 + s * 0.28) * k;
    A.head.x += 0.2 * k; A.head.y += -s * 0.14 * k;
    A.legL.x += s * 0.07 * k; A.legR.x -= s * 0.07 * k; A.sq += 0.02 * k;
  } },
  water: { dur: 99, hold: true, pose: (t, P, A) => {
    const k = ease.outQuad(clamp(t / 0.35)), pour = 0.5 + 0.5 * Math.sin(t * 1.3);
    A.armR.x += (-0.95 - 0.2 * pour) * k; A.armR.z += 0.12 * k;
    A.armL.x += 0.15 * k; A.armL.z += 0.45 * k; // other paw on the hip
    A.body.x += 0.12 * k; A.head.x += 0.26 * k; A.head.z += Math.sin(t * 0.9) * 0.08 * k;
    A.sq += Math.sin(t * 2.6) * 0.012 * k; A.happy = 1;
  } },
  tend: { dur: 99, hold: true, pose: (t, P, A) => {
    const k = ease.outQuad(clamp(t / 0.35)), cyc = t * 2.4, a = Math.max(0, Math.sin(cyc)), b = Math.max(0, -Math.sin(cyc));
    A.body.x += (0.62 + 0.08 * (a + b)) * k; A.y += -0.05 * k;
    A.armR.x += (-1.05 - 0.45 * a) * k; A.armR.z += 0.2 * k; A.armL.x += (-1.05 - 0.45 * b) * k; A.armL.z += -0.2 * k;
    A.head.x += 0.2 * k; A.head.y += Math.sin(t * 0.5) * 0.2 * k; A.sq += 0.06 * k;
    A.legL.x += 0.12 * k; A.legR.x += -0.1 * k; A.tailWag = 1;
  } },
  // tilling with the hoe (life/tools.js): two chops — both paws raise it high, then swing it down into the soil
  till: { dur: 1.1, ev: { chop: 0.36, chop2: 0.86 }, pose: (u, P, A) => {
    const v = (u < 0.5 ? u : u - 0.5) / 0.5, k = ease.outQuad(clamp(u / 0.08)) * (1 - ease.inOutQuad(clamp((u - 0.9) / 0.1)));
    const raise = ease.outQuad(clamp(v / 0.5)), strike = ease.inQuad(clamp((v - 0.5) / 0.22)), settle = clamp((v - 0.72) / 0.28);
    const ax = ((-0.6 - 2.1 * raise) * (1 - strike) - 0.15 * strike) * (1 - settle) - 0.45 * settle;
    A.armR.x += ax * k; A.armL.x += ax * k; A.armR.z += 0.3 * k; A.armL.z += -0.3 * k;
    A.body.x += ((-0.16 * raise) * (1 - strike) + 0.45 * strike * (1 - settle * 0.4)) * k;
    A.head.x += (0.14 + 0.12 * strike) * k; A.legL.x += -0.25 * k; A.legR.x += 0.1 * k;
    A.sq += (0.07 * strike * (1 - settle) - 0.03 * raise * (1 - strike)) * k; A.y += 0.04 * raise * (1 - strike) * k;
  } },
  // casting the rod (life/fishing.js): wind it back over the shoulder with a little twist, flick it forward, settle
  // into the 'fish' hold (the float leaves the rod at 'release')
  rodCast: { dur: 0.72, ev: { release: 0.58 }, pose: (u, P, A) => {
    const back = ease.outQuad(clamp(u / 0.42)), flick = ease.outBack(clamp((u - 0.45) / 0.18)), k = 1 - flick;
    A.armR.x += -1.0 - 1.85 * back * k + 0.1 * flick; A.armR.z += 0.38; A.armL.x += -0.85 - 0.9 * back * k; A.armL.z += -0.36;
    A.body.y += 0.42 * back * k - 0.1 * flick; A.body.x += -0.14 * back * k + 0.12 * flick * (1 - clamp((u - 0.75) / 0.25));
    A.head.x += -0.12 * back * k + 0.1 * flick; A.sq += 0.05 * back * k - 0.04 * flick; A.earKick += 2 * flick * k;
  } },
  fish: { dur: 99, hold: true, pose: (t, P, A) => {
    const k = ease.outQuad(clamp(t / 0.4)), bob = Math.sin(t * 1.1);
    A.armR.x += (-1.0 + 0.05 * bob) * k; A.armR.z += 0.38 * k; A.armL.x += (-0.85 + 0.05 * bob) * k; A.armL.z += -0.36 * k;
    A.body.x += 0.04 * k; A.head.x += 0.1 * k; A.head.z += Math.sin(t * 0.37) * 0.07 * k;
    A.sq += Math.sin(t * 1.9) * 0.01 * k;
  } },
  reel: { dur: 1.0, pose: (u, P, A) => {
    const e = Math.sin(clamp(u) * Math.PI), yank = ease.outBack(clamp(u / 0.3)) * (1 - ease.inOutQuad(clamp((u - 0.55) / 0.45)));
    A.armR.x += -1.0 - 1.1 * yank; A.armR.z += 0.38; A.armL.x += -0.85 - 1.1 * yank; A.armL.z += -0.36;
    A.body.x += -0.25 * yank; A.y += 0.1 * e; A.sq += -0.06 * e; A.eyesHappy = e > 0.4 ? 1 : 0; A.earKick += 2 * e;
  } },
  crank: { dur: 99, hold: true, pose: (t, P, A) => {
    const k = ease.outQuad(clamp(t / 0.3)), a = t * 3.4, s = Math.sin(a), c = Math.cos(a);
    A.armR.x += (-1.2 + s * 0.35) * k; A.armR.z += (0.35 + c * 0.18) * k;
    A.armL.x += (-1.05 + s * 0.3) * k; A.armL.z += (-0.35 + c * 0.18) * k;
    A.body.x += (0.14 + s * 0.05) * k; A.body.y += c * 0.08 * k; A.head.x += 0.12 * k; A.sq += s * 0.015 * k;
  } },
  read: { dur: 99, hold: true, pose: (t, P, A) => {
    const k = ease.outQuad(clamp(t / 0.35));
    A.armR.x += -1.3 * k; A.armR.z += 0.62 * k; // paw to the chin
    A.armL.x += -0.55 * k; A.armL.z += -0.55 * k; // arm across the tummy
    A.head.x += (-0.12 + 0.05 * Math.sin(t * 0.7)) * k; A.head.z += Math.sin(t * 0.45) * 0.14 * k; A.head.y += Math.sin(t * 0.33) * 0.28 * k;
  } },
  shopkeep: { dur: 99, hold: true, pose: (t, P, A) => {
    const k = ease.outQuad(clamp(t / 0.3));
    clasp(A, k);
    A.body.y += Math.sin(t * 0.6) * 0.07 * k; A.head.z += Math.sin(t * 0.8) * 0.07 * k;
    A.y += Math.max(0, Math.sin(t * 1.6)) * 0.012 * k; A.happy = 1;
  } },
  admire: { dur: 99, hold: true, pose: (t, P, A) => {
    const k = ease.outQuad(clamp(t / 0.35)), rock = Math.max(0, Math.sin(t * 1.8));
    behind(A, k);
    A.y += 0.025 * rock * k; A.body.x += (-0.05 + 0.04 * rock) * k;
    A.head.x += -0.2 * k; A.head.z += Math.sin(t * 0.5) * 0.1 * k; A.happy = 1;
  } },

  // ---- conversation (hold): the speaker gestures, the listener nods along
  chat: { dur: 99, hold: true, pose: (t, P, A) => {
    const k = ease.outQuad(clamp(t / 0.25)), g = Math.sin(t * 2.3), g2 = Math.sin(t * 3.1 + 1);
    A.armR.x += (-0.5 - 0.4 * Math.max(0, g)) * k; A.armR.z += (0.25 + 0.22 * g2) * k;
    A.armL.x += (-0.3 - 0.35 * Math.max(0, -g)) * k; A.armL.z += (-0.15 - 0.18 * g2) * k;
    A.body.y += 0.09 * Math.sin(t * 1.3) * k; A.body.x += 0.05 * Math.max(0, g) * k;
    A.head.z += 0.09 * Math.sin(t * 1.7) * k; A.sq += 0.022 * Math.sin(t * 6.5) * k; A.happy = 1;
  } },
  listen: { dur: 99, hold: true, pose: (t, P, A) => {
    const k = ease.outQuad(clamp(t / 0.25)), burst = smoothstep(0.35, 0.8, Math.sin(t * 0.9));
    behind(A, k * 0.8);
    A.head.x += (0.12 * Math.max(0, Math.sin(t * 6)) * burst) * k; A.head.z += 0.1 * Math.sin(t * 0.6) * k;
    A.y += 0.012 * Math.max(0, Math.sin(t * 1.4)) * k; A.eyesHappy = burst > 0.9 ? 1 : 0;
  } },

  // ---- one-shot fidgets & reactions
  stretch: { dur: 1.9, pose: (u, P, A) => {
    const k = inOut(u, 0.3, 0.3), up = P.toyArms ? -2.25 : 2.75; // (Toybox kit rigs: short arms under a big head stretch outward-up, or they'd vanish into it)
    A.armR.z += up * k; A.armL.z += -up * k; A.armR.x += -0.25 * k; A.armL.x += -0.25 * k;
    A.body.x += -0.14 * k; A.head.x += -0.22 * k; A.sq += -0.07 * k; A.y += 0.03 * k;
    A.eyesClosed = k > 0.6 ? 1 : 0; A.mouth = Math.max(A.mouth, 0.5 * clamp((k - 0.7) / 0.3));
  } },
  yawn: { dur: 2.0, pose: (u, P, A) => {
    const k = inOut(u, 0.25, 0.3);
    A.head.x += -0.32 * k; A.body.x += -0.08 * k; A.sq += -0.03 * k;
    A.armR.x += -0.7 * k; A.armR.z += -0.9 * k; A.armL.x += -0.7 * k; A.armL.z += 0.9 * k;
    A.mouth = Math.max(A.mouth, k); A.eyesClosed = k > 0.4 ? 1 : 0;
  } },
  lookAround: { dur: 2.4, pose: (u, P, A) => {
    const k = inOut(u, 0.12, 0.15);
    A.head.y += Math.sin(u * Math.PI * 2) * 0.8 * k; A.body.y += Math.sin(u * Math.PI * 2) * 0.18 * k;
    A.head.x += -0.06 * k; A.y += 0.02 * k;
  } },
  scratchHead: { dur: 1.6, pose: (u, P, A) => {
    const k = inOut(u, 0.2, 0.25);
    A.armR.z += -2.5 * k; A.armR.x += -0.55 * k; A.armR.zWave = Math.sin(u * 40) * 0.12 * k;
    A.head.z += -0.16 * k; A.head.x += 0.06 * k;
  } },
  bow: { dur: 1.3, pose: (u, P, A) => {
    const k = inOut(u, 0.28, 0.35);
    A.body.x += 0.62 * k; A.head.x += 0.18 * k; clasp(A, k * 0.7); A.eyesHappy = k > 0.5 ? 1 : 0;
  } },
  laugh: { dur: 1.3, pose: (u, P, A) => {
    const k = inOut(u, 0.12, 0.25);
    A.body.x += -0.14 * k; A.sq += Math.sin(u * 44) * 0.035 * k; A.mouth = Math.max(A.mouth, 0.7 * k);
    A.armR.x += -0.5 * k; A.armR.z += 0.45 * k; A.armL.x += -0.5 * k; A.armL.z += -0.45 * k;
    A.eyesHappy = 1; A.happy = 1; A.head.x += -0.12 * k;
  } },
  // cooking (life/kitchen.js): stirring the pot with the ladle in little circles, the other paw steadying it, a hungry
  // lean over the steam; 'season' (an event at the end) is the sprinkle that finishes the dish
  cook: { dur: 99, hold: true, pose: (t, P, A) => {
    const k = ease.outQuad(clamp(t / 0.3)), a = t * 7.5, sx = Math.sin(a), cz = Math.cos(a);
    A.armR.x += (-0.95 + 0.16 * sx) * k; A.armR.z += (0.32 + 0.14 * cz) * k;
    A.armL.x += -0.7 * k; A.armL.z += -0.42 * k;
    A.body.x += (0.18 + 0.03 * sx) * k; A.body.y += 0.08 * cz * k; A.head.x += 0.22 * k; A.head.z += 0.06 * sx * k;
    A.sq += 0.012 * Math.sin(a * 2) * k; A.tailWag = 1; A.happy = 1;
  } },
  // eating a dish: both paws up to the mouth, three happy munches, a satisfied little bounce
  munch: { dur: 1.15, pose: (u, P, A) => {
    const k = inOut(u, 0.14, 0.22), m = Math.max(0, Math.sin(u * Math.PI * 6)) * (1 - smoothstep(0.7, 0.85, u)), hop = smoothstep(0.78, 0.9, u) * (1 - smoothstep(0.9, 1, u));
    A.armR.x += -1.35 * k; A.armR.z += 0.62 * k; A.armL.x += -1.35 * k; A.armL.z += -0.62 * k;
    A.head.x += (0.12 - 0.08 * m) * k; A.mouth = Math.max(A.mouth || 0, 0.7 * m * k); A.sq += 0.03 * m * k;
    A.y += 0.06 * hop; A.eyesHappy = 1; A.happy = 1; A.earKick += 1.5 * hop;
  } },
  clap: { dur: 1.2, pose: (u, P, A) => {
    const k = inOut(u, 0.15, 0.2), c = Math.sin(u * 32) * 0.22;
    A.armR.x += -1.25 * k; A.armR.z += (0.55 + c) * k; A.armL.x += -1.25 * k; A.armL.z += -(0.55 + c) * k;
    A.y += Math.abs(Math.sin(u * Math.PI * 2)) * 0.05 * k; A.eyesHappy = 1; A.happy = 1;
  } },
  nod: { dur: 0.8, pose: (u, P, A) => { A.head.x += Math.max(0, Math.sin(u * Math.PI * 3)) * 0.2 * (1 - u); A.happy = 1; } },

  // ---- woken up by a knock at night (npc.js sleepy doorstep answer)
  // a big yawn: head tipped back, one paw politely over the mouth, the other arm stretching up, up on the toes
  sleepyYawn: { dur: 2.4, pose: (u, P, A) => {
    const k = inOut(u, 0.22, 0.3), top = smoothstep(0.25, 0.5, u) * (1 - smoothstep(0.7, 0.88, u));
    A.head.x += -0.36 * k; A.head.z += 0.14 * k; A.body.x += -0.1 * k; A.sq += -0.04 * k + 0.02 * top * Math.sin(u * 30);
    A.armR.x += -1.45 * k; A.armR.z += 0.62 * k;                  // paw over the mouth
    A.armL.x += -0.2 * k; A.armL.z += (P.toyArms ? 2.1 : -2.5) * k * (0.7 + 0.3 * top); // the other arm stretches up (outward on Toybox kit rigs)
    A.y += 0.025 * top; A.mouth = Math.max(A.mouth, k * (0.6 + 0.4 * top)); A.eyesClosed = k > 0.3 ? 1 : 0.6;
  } },
  // standing at the door half asleep: heavy lids, a slow sway, and every few seconds the head sinks… and snaps back up
  drowsy: { dur: 99, hold: true, pose: (t, P, A) => {
    const k = ease.outQuad(clamp(t / 0.4)), cyc = (t % 4.6) / 4.6;
    const drop = smoothstep(0.3, 0.78, cyc) * (1 - smoothstep(0.8, 0.86, cyc)), jolt = Math.sin(clamp((cyc - 0.8) / 0.14) * Math.PI);
    A.head.x += (0.1 + 0.34 * drop - 0.12 * jolt) * k; A.head.z += (Math.sin(t * 0.8) * 0.1 + 0.08 * drop) * k;
    A.body.x += (0.03 + 0.1 * drop) * k; A.body.y += Math.sin(t * 0.9) * 0.08 * k;
    A.armR.x += -0.2 * k; A.armR.z += 0.3 * k; A.armL.x += -0.2 * k; A.armL.z += -0.3 * k; // paws together in front
    A.y += (-0.012 * drop + 0.015 * jolt) * k; A.sq += (0.015 * Math.sin(t * 1.3) + 0.03 * jolt) * k;
    A.eyesClosed = drop > 0.35 ? 1 : 0.6;
  } },
};
