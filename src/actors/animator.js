// Procedural animation for kit characters: locomotion cycles, idle life, secondary motion (ears, tails, scarf),
// timed actions with hit events, squash & stretch and hit flashes.
import * as THREE from 'three';
import { clamp, lerp, ease, TAU, damp } from '../core/util.js';
import { LIFE_ACTIONS } from './lifePoses.js';
import { CHARGE_ACTIONS } from './chargePoses.js';
import { SAMURAI_ACTIONS, SAMURAI_OVERRIDES, SAMURAI_FLOURISH } from './samuraiPoses.js';
import { POE_ACTIONS } from './poePoses.js';

// action library: dur (s), events {name: t01}, pose(t01, P, A) applies additive offsets
const ACTIONS = {
  swing: { dur: 0.46, ev: { hit: 0.42 }, pose: (t, P, A) => {
    const wind = ease.outCubic(clamp(t / 0.34)), strike = ease.outQuad(clamp((t - 0.34) / 0.16)), rec = ease.inOutQuad(clamp((t - 0.55) / 0.45));
    const x = lerp(lerp(0, -2.5, wind), 1.2, strike) * (1 - rec), z = lerp(lerp(0, -0.5, wind), 0.5, strike) * (1 - rec);
    A.armR.x += x; A.armR.z += z; A.armL.x += -0.4 * wind * (1 - rec); A.armL.z += 0.3 * (1 - rec) * wind;
    A.body.y += lerp(lerp(0, 0.55, wind), -0.7, strike) * (1 - rec);
    A.body.x += 0.18 * strike * (1 - rec);
    A.lean += 0.05 * strike * (1 - rec);
    A.sq += -0.06 * strike * (1 - rec) + 0.04 * wind * (1 - strike);
  } },
  swing2: { dur: 0.46, ev: { hit: 0.42 }, pose: (t, P, A) => {
    const wind = ease.outCubic(clamp(t / 0.34)), strike = ease.outQuad(clamp((t - 0.34) / 0.16)), rec = ease.inOutQuad(clamp((t - 0.55) / 0.45));
    A.armR.x += lerp(lerp(0, -1.2, wind), -0.9, strike) * (1 - rec); A.armR.z += lerp(lerp(0, 1.6, wind), -1.1, strike) * (1 - rec);
    A.body.y += lerp(lerp(0, -0.6, wind), 0.8, strike) * (1 - rec);
    A.sq += -0.05 * strike * (1 - rec);
  } },
  throw: { dur: 0.5, ev: { release: 0.44 }, pose: (t, P, A) => {
    const wind = ease.outCubic(clamp(t / 0.38)), rel = ease.outQuad(clamp((t - 0.38) / 0.14)), rec = ease.inOutQuad(clamp((t - 0.55) / 0.45));
    A.armR.x += lerp(lerp(0, -2.9, wind), 1.3, rel) * (1 - rec); A.armR.z += -0.3 * wind * (1 - rec);
    A.armL.x += lerp(-0.2, 0.9, wind) * (1 - rec);
    A.body.y += lerp(lerp(0, 0.5, wind), -0.4, rel) * (1 - rec); A.body.x += lerp(-0.1 * wind, 0.25, rel) * (1 - rec);
    A.sq += 0.05 * wind * (1 - rel) - 0.05 * rel * (1 - rec);
  } },
  cast: { dur: 0.55, ev: { cast: 0.45 }, pose: (t, P, A) => {
    const up = ease.outBack(clamp(t / 0.4)), fw = ease.outQuad(clamp((t - 0.4) / 0.15)), rec = ease.inOutQuad(clamp((t - 0.6) / 0.4));
    A.armR.x += lerp(-2.6 * up, -1.4, fw) * (1 - rec); A.armL.x += lerp(-2.6 * up, -1.4, fw) * (1 - rec);
    A.armR.z += 0.3 * up * (1 - rec); A.armL.z += -0.3 * up * (1 - rec);
    A.sq += 0.08 * up * (1 - fw) - 0.06 * fw * (1 - rec); A.head.x += -0.2 * up * (1 - rec);
  } },
  bark: { dur: 0.5, ev: { bark: 0.28 }, pose: (t, P, A) => {
    const a = ease.outCubic(clamp(t / 0.25)), b = ease.inOutQuad(clamp((t - 0.35) / 0.65));
    A.head.x += (-0.35 * a + 0.45 * clamp((t - 0.22) / 0.1)) * (1 - b); A.body.x += 0.15 * a * (1 - b);
    A.mouth = Math.max(A.mouth, clamp((t - 0.2) / 0.08) * (1 - b));
    A.sq += (0.08 * a - 0.14 * clamp((t - 0.25) / 0.08)) * (1 - b);
    const tk = 0.5 * (P.anim?.barkTuck ?? 1); // (the inward tuck: the samurai halves it, keeping the paws out of his saya and haori fronts)
    A.armR.x += -0.6 * a * (1 - b); A.armL.x += -0.6 * a * (1 - b); A.armR.z += tk * a * (1 - b); A.armL.z += -tk * a * (1 - b);
    A.earKick += 3 * clamp((t - 0.25) / 0.05) * (1 - b);
  } },
  slam: { dur: 0.8, ev: { impact: 0.62 }, pose: (t, P, A) => {
    const crouch = ease.outQuad(clamp(t / 0.18)), jump = clamp((t - 0.18) / 0.44), land = clamp((t - 0.62) / 0.1), rec = ease.inOutQuad(clamp((t - 0.7) / 0.3));
    A.y += Math.sin(jump * Math.PI) * 0.9 * (1 - land);
    A.sq += 0.12 * crouch * (1 - jump) - 0.08 * Math.sin(jump * Math.PI) + 0.18 * land * (1 - rec);
    A.armR.x += lerp(0, -3.0, ease.outQuad(jump)) * (1 - land) + 1.4 * land * (1 - rec); A.armL.x += lerp(0, -3.0, ease.outQuad(jump)) * (1 - land) + 1.4 * land * (1 - rec);
    A.body.x += 0.35 * land * (1 - rec);
  } },
  hurt: { dur: 0.32, pose: (t, P, A) => { const k = Math.sin(clamp(t) * Math.PI); A.body.x += -0.35 * k; A.head.x += -0.3 * k; A.armR.z += -0.5 * k; A.armL.z += 0.5 * k; A.sq += 0.08 * k; A.flinch = k; } },
  die: { dur: 1.2, hold: true, pose: (t, P, A) => { const k = ease.outBounce(clamp(t / 0.7)); A.body.x += -1.35 * k; A.y += -0.1 * k; A.armR.z += -1.2 * k; A.armL.z += 1.2 * k; A.eyesClosed = 1; A.legL.x += -0.9 * k; A.legR.x += -1.2 * k; } },
  roll: { dur: 0.42, pose: (t, P, A) => { const k = ease.inOutQuad(clamp(t)); A.roll = k * TAU; A.sq += 0.25 * Math.sin(k * Math.PI); A.armR.x += -1.2 * Math.sin(k * Math.PI); A.armL.x += -1.2 * Math.sin(k * Math.PI); A.legL.x += -1.2 * Math.sin(k * Math.PI); A.legR.x += -1.2 * Math.sin(k * Math.PI); A.y += 0.15 * Math.sin(k * Math.PI); } },
  // wave / happy raise the arms inward-up (+z on armR). P.wave changes that for short arms under a big head: 'out' raises them
  // outward-up (the Toybox Rosie), 'front' forward-up in front of the face (the Toybox Moka, whose long ears hang beside the arms)
  wave: { dur: 1.3, pose: (t, P, A) => { const w = Math.sin(clamp(t) * Math.PI); const k3 = clamp(w * 3); A.armR.z += (P.wave === 'out' ? -1.85 : P.wave === 'front' ? -0.3 : 2.5) * k3; A.armR.x += P.wave === 'front' ? -2.1 * k3 : -0.3 * w; A.armR.zWave = Math.sin(t * 22) * 0.35 * clamp(w * 3); A.head.z += 0.12 * w; A.happy = 1; } },
  happy: { dur: 1.0, pose: (t, P, A) => { const j = Math.abs(Math.sin(t * Math.PI * 2)); A.y += j * 0.28; A.sq += -0.1 * j + 0.08 * (1 - j); const up = P.wave === 'out' ? -1.8 : P.wave === 'front' ? -0.35 : 2.4, fx = P.wave === 'front' ? -2.3 : -0.2; A.armR.z += up; A.armL.z += -up; A.armR.x += fx; A.armL.x += fx; A.happy = 1; A.eyesHappy = 1; } },
  pickup: { dur: 0.45, ev: { grab: 0.4 }, pose: (t, P, A) => { const k = Math.sin(clamp(t) * Math.PI); A.body.x += 0.6 * k; A.armR.x += -1.2 * k; A.armL.x += -1.2 * k; A.sq += 0.1 * k; A.y += -0.06 * k; } },
  drink: { dur: 0.7, pose: (t, P, A) => { const k = Math.sin(clamp(t) * Math.PI); A.armR.x += -2.2 * k; A.armR.z += 0.6 * k; A.head.x += -0.35 * k; A.eyesHappy = k > 0.5 ? 1 : 0; } },
  dig: { dur: 0.9, pose: (t, P, A) => { const s = Math.sin(t * 26); A.body.x += 0.55; A.armR.x += -1.2 + s * 0.7; A.armL.x += -1.2 - s * 0.7; A.sq += 0.06; A.tailWag = 2.5; } },
  sit: { dur: 99, hold: true, pose: (t, P, A) => { if (P.legs) return; /* quadrupeds sit in poseQuad */ const k = ease.outQuad(clamp(t / 0.3)), th = P.anim?.sitThigh ?? -1.4; A.y += -0.12 * k; A.legL.x += th * k; A.legR.x += th * k; A.sq += 0.04 * k; } }, // (sitThigh: the samurai's hakama hems flare at −1.4)
  spin: { dur: 99, hold: true, pose: (t, P, A) => { A.spin = t * 16; A.armR.z += 1.4; A.armL.z += -1.4; A.armR.x += -0.2; } },

  // ---- Moka's staff casts (staff in handR; mokaSpells points the staff through each one, see STAFF there)
  // quick flick: basic sparkle bolt, Kibble Missiles, Feather Flurry
  staffBolt: { dur: 0.36, ev: { release: 0.45 }, pose: (t, P, A) => {
    const wind = ease.outCubic(clamp(t / 0.4)), flick = ease.outQuad(clamp((t - 0.4) / 0.16)), rec = ease.inOutQuad(clamp((t - 0.6) / 0.4));
    A.armR.x += lerp(lerp(0, -2.1, wind), -1.35, flick) * (1 - rec); A.armR.z += 0.25 * wind * (1 - rec);
    A.armL.x += -0.35 * wind * (1 - rec); A.armL.z += 0.4 * wind * (1 - rec);
    A.body.y += lerp(0.28 * wind, -0.32, flick) * (1 - rec); A.body.x += 0.12 * flick * (1 - rec);
    A.sq += 0.05 * wind * (1 - flick) - 0.05 * flick * (1 - rec); A.head.x += -0.08 * wind * (1 - rec); A.earKick += 1.5 * flick * (1 - rec);
  } },
  // raise the staff with a little hop, then thrust it at the target (Splash Bolt, Whirlpool, runes, links…)
  staffCast: { dur: 0.5, ev: { cast: 0.5 }, pose: (t, P, A) => {
    const up = ease.outBack(clamp(t / 0.45)), fw = ease.outQuad(clamp((t - 0.45) / 0.15)), rec = ease.inOutQuad(clamp((t - 0.62) / 0.38));
    A.armR.x += lerp(-2.7 * up, -1.45, fw) * (1 - rec); A.armR.z += 0.3 * up * (1 - rec);
    A.armL.x += lerp(-0.9 * up, 0.35, fw) * (1 - rec); A.armL.z += 0.55 * up * (1 - rec);
    A.y += 0.07 * Math.sin(clamp(t / 0.45) * Math.PI);
    A.body.x += lerp(-0.1 * up, 0.2, fw) * (1 - rec); A.body.y += 0.15 * up * (1 - fw);
    A.sq += 0.07 * up * (1 - fw) - 0.07 * fw * (1 - rec); A.head.x += -0.18 * up * (1 - rec); A.earKick += 2 * fw * (1 - rec); A.tailWag = 1.5;
  } },
  // both paws and the staff to the sky (Treat Meteor, Squeaky Nova, Mallard Squadron)
  skyCast: { dur: 0.75, ev: { cast: 0.6 }, pose: (t, P, A) => {
    const up = ease.outBack(clamp(t / 0.5)), pump = Math.sin(clamp((t - 0.55) / 0.2) * Math.PI), rec = ease.inOutQuad(clamp((t - 0.72) / 0.28));
    A.armR.x += (-3.0 * up + 0.25 * pump) * (1 - rec); A.armL.x += (-2.8 * up + 0.2 * pump) * (1 - rec);
    A.armR.z += 0.35 * up * (1 - rec); A.armL.z += -0.35 * up * (1 - rec);
    A.head.x += -0.42 * up * (1 - rec); A.y += (0.06 * up + 0.08 * pump) * (1 - rec);
    A.sq += (-0.08 * up + 0.1 * pump) * (1 - rec); A.body.x += -0.12 * up * (1 - rec); A.earKick += 2.5 * pump; A.tailWag = 2.5; A.happy = up > 0.9 ? 1 : 0;
  } },
  // Wet Dog Shake: brace, then the full-body post-bath shake (head and body twisting against each other, ears flying)
  wetShake: { dur: 0.8, ev: { shake: 0.2 }, pose: (t, P, A) => {
    const tt = t * 0.8, crouch = ease.outQuad(clamp(t / 0.18)) * (1 - clamp((t - 0.2) / 0.1));
    const env = clamp((t - 0.16) / 0.08) * (1 - ease.inQuad(clamp((t - 0.62) / 0.2))), w = Math.sin(tt * 55), w2 = Math.sin(tt * 55 + 1.3);
    A.sq += 0.12 * crouch + Math.abs(w) * 0.04 * env; A.head.x += 0.25 * crouch;
    A.body.y += w * 0.6 * env; A.head.y += -w * 0.75 * env; A.body.z += w2 * 0.14 * env; A.head.z += w * 0.28 * env;
    A.armR.z += (1.0 + w * 0.45) * env; A.armL.z += -(1.0 - w * 0.45) * env; A.armR.x += -0.45 * env; A.armL.x += -0.45 * env;
    A.earKick += w * 7 * env; A.tailWag = 4 * env; A.eyesClosed = env > 0.3 ? 1 : 0;
    A.y += Math.abs(Math.sin(tt * 27)) * 0.05 * env + 0.1 * Math.sin(clamp((t - 0.8) / 0.2) * Math.PI);
    if (t > 0.82) A.eyesHappy = 1;
  } },
  // a twirl of the staff and a pirouette (Decoy Duck, Spirit Retriever)
  summon: { dur: 0.8, ev: { summon: 0.62 }, pose: (t, P, A) => {
    const tw = clamp(t / 0.6), thrust = ease.outQuad(clamp((t - 0.6) / 0.12)), rec = ease.inOutQuad(clamp((t - 0.72) / 0.28));
    A.spin = ease.inOutQuad(tw) * TAU;
    A.armR.x += (-1.6 + Math.sin(tw * TAU * 1.5) * 0.7) * (1 - thrust) * (1 - rec) + -1.6 * thrust * (1 - rec); A.armR.z += Math.cos(tw * TAU * 1.5) * 0.8 * (1 - thrust) * (1 - rec);
    A.armL.z += -1.1 * Math.sin(tw * Math.PI) * (1 - rec); A.armL.x += -0.3 * (1 - rec);
    A.y += 0.12 * Math.sin(tw * Math.PI); A.sq += -0.06 * Math.sin(tw * Math.PI) + 0.06 * thrust * (1 - rec);
    A.head.x += -0.15 * thrust * (1 - rec); A.happy = 1; A.eyesHappy = t > 0.6 ? 1 : 0; A.tailWag = 3;
  } },
  // Fetch!: fling the leash out, then yank it back with a lean
  yank: { dur: 0.7, ev: { lash: 0.3, yank: 0.62 }, pose: (t, P, A) => {
    const out = ease.outBack(clamp(t / 0.3)), hold = clamp((t - 0.3) / 0.28), pull = ease.outQuad(clamp((t - 0.58) / 0.14)), rec = ease.inOutQuad(clamp((t - 0.78) / 0.22));
    A.armR.x += (lerp(0, -1.9, out) + 1.6 * pull) * (1 - rec) - 0.06 * Math.sin(hold * 20) * (1 - pull); A.armR.z += 0.2 * out * (1 - rec);
    A.armL.x += (-0.8 * out + 0.5 * pull) * (1 - rec);
    A.body.x += (0.18 * out - 0.4 * pull) * (1 - rec); A.body.y += (-0.2 * out + 0.3 * pull) * (1 - rec);
    A.legL.x += 0.35 * pull * (1 - rec); A.legR.x += -0.25 * pull * (1 - rec);
    A.sq += (0.05 * out - 0.06 * pull) * (1 - rec); A.earKick += 3 * pull * (1 - rec); A.mouth = Math.max(A.mouth, 0.6 * pull * (1 - rec));
  } },
  // Puddle Hop: crouch, dive head-first into the floor, pop out of the other puddle with paws up
  puddleHop: { dur: 0.75, ev: { dive: 0.3, under: 0.44, pop: 0.6 }, pose: (t, P, A) => {
    const crouch = ease.outQuad(clamp(t / 0.18)), dive = ease.inQuad(clamp((t - 0.18) / 0.22)), pop = clamp((t - 0.52) / 0.2), land = clamp((t - 0.72) / 0.28);
    const under = t > 0.4 && t < 0.52;
    let y = -1.3 * dive; if (t >= 0.52) y = -1.3 + 1.6 * ease.outBack(pop) - 0.3 * clamp((t - 0.62) / 0.1);
    if (under) y = -1.3;
    A.y += y * (1 - land);
    A.sq += 0.14 * crouch * (1 - dive) - 0.14 * dive * (1 - pop) - 0.12 * Math.sin(pop * Math.PI) + 0.12 * Math.sin(land * Math.PI);
    A.body.x += (0.3 * crouch + 0.35 * dive) * (1 - pop);
    A.armR.x += (0.6 * crouch - 2.9 * dive) * (1 - pop) + -2.7 * Math.sin(pop * Math.PI * 0.5) * (1 - land); A.armL.x += (0.6 * crouch - 2.9 * dive) * (1 - pop) + -2.7 * Math.sin(pop * Math.PI * 0.5) * (1 - land);
    A.earKick += 3 * pop * (1 - land); A.eyesClosed = dive > 0.3 && pop < 0.3 ? 1 : 0; A.happy = pop > 0.5 ? 1 : 0;
  } },
  // Great Wave: hop up onto the crest, surf it for a beat (balance!), drop off
  surf: { dur: 1.1, ev: { wave: 0.12 }, pose: (t, P, A) => {
    const tt = t * 1.1, crouch = ease.outQuad(clamp(t / 0.12)) * (1 - clamp((t - 0.12) / 0.08));
    const up = ease.outBack(clamp((t - 0.12) / 0.16)), down = ease.inQuad(clamp((t - 0.74) / 0.16)), land = Math.sin(clamp((t - 0.88) / 0.12) * Math.PI);
    const ride = up * (1 - down), sway = Math.sin(tt * 7);
    A.y += 1.45 * ride + 0.08 * Math.sin(tt * 11) * ride;
    A.sq += 0.12 * crouch + 0.1 * land - 0.04 * ride;
    A.body.x += 0.22 * ride; A.body.z += sway * 0.12 * ride; A.body.y += 0.35 * ride;
    A.armL.z += -1.35 * ride + sway * 0.2 * ride; A.armR.z += 0.9 * ride; A.armR.x += -1.2 * ride;
    A.legL.x += -0.55 * ride; A.legR.x += 0.45 * ride; A.head.x += -0.12 * ride;
    A.earKick += 2 * sway * ride; A.happy = ride > 0.5 ? 1 : 0; A.eyesHappy = ride > 0.5 ? 1 : 0; A.tailWag = 3 * ride;
  } },
  // Moonbeam channel: the staff held high, a gentle sway
  beam: { dur: 99, hold: true, pose: (t, P, A) => {
    const k = ease.outQuad(clamp(t / 0.2));
    A.armR.x += -2.95 * k; A.armL.x += -2.5 * k; A.armR.z += 0.2 * k; A.armL.z += -0.35 * k;
    A.head.x += -0.32 * k; A.body.z += Math.sin(t * 3) * 0.04 * k; A.sq += -0.04 * k + Math.sin(t * 9) * 0.012;
    A.earKick += Math.sin(t * 5) * 0.4 * k; A.eyesHappy = 1; A.tailWag = 1.5;
  } },
  // Duck Call: the staff to the lips for a toot, a bounce on the honk
  duckCall: { dur: 0.6, ev: { cast: 0.42 }, pose: (t, P, A) => {
    const lift = ease.outBack(clamp(t / 0.3)), honk = Math.sin(clamp((t - 0.38) / 0.18) * Math.PI), rec = ease.inOutQuad(clamp((t - 0.7) / 0.3));
    A.armR.x += -1.35 * lift * (1 - rec); A.armR.z += 1.05 * lift * (1 - rec); A.armL.x += -0.9 * lift * (1 - rec); A.armL.z += -0.6 * lift * (1 - rec);
    A.head.x += (-0.15 * lift - 0.2 * honk) * (1 - rec); A.sq += -0.1 * honk; A.y += 0.1 * honk; A.mouth = Math.max(A.mouth, honk);
    A.earKick += 4 * honk; A.tailWag = 2;
  } },
};
// villager daily-life poses (bench sitting, chores, chat gestures, idle fidgets) live in lifePoses.js
for (const k in LIFE_ACTIONS) if (!ACTIONS[k]) ACTIONS[k] = LIFE_ACTIONS[k];
// charged abilities' wind-up poses (combat/charge.js writes a.style / a.k / a.pulse / a.full onto the action)
for (const k in CHARGE_ACTIONS) if (!ACTIONS[k]) ACTIONS[k] = CHARGE_ACTIONS[k];
// Chewy's samurai cuts, draws, stances and battle cries (samuraiPoses.js)
for (const k in SAMURAI_ACTIONS) if (!ACTIONS[k]) ACTIONS[k] = SAMURAI_ACTIONS[k];
Object.assign(ACTIONS, SAMURAI_OVERRIDES); // ('spin', 'slam': only Chewy's Whirlwind Stance / Helmet Splitter play them)
// Poe's fūma slashes, throw and catch, hand seal, Shadow Step and sneeze (poePoses.js, docs/POE.md)
for (const k in POE_ACTIONS) if (!ACTIONS[k]) ACTIONS[k] = POE_ACTIONS[k];
export { ACTIONS };

const zero = () => ({ x: 0, y: 0, z: 0 });
// The pose accumulator every action writes into: one per Animator, cleared each frame (no per-frame garbage).
// foreL/R, wristL/R: forearm and wrist bends (rigs that have those bones: the baked heroes); blade: the held prop's
// turn in the paw (Player.carrySword); bladeDir / bladeEdge (x forward, y up, z his left, in the hero's frame) with weight
// bladeW: point the katana that way instead (samuraiPoses.js); twoHand 0..1: the free paw joins the sword hilt
// (actors/armIK.js); armLock 0..1 holds the arms out of the walk swing (a two-handed guard while walking)
const LIMBS = ['body', 'head', 'armR', 'armL', 'legL', 'legR', 'foreR', 'foreL', 'wristR', 'wristL', 'blade', 'bladeDir', 'bladeEdge'];
const SCALARS = ['y', 'sq', 'lean', 'mouth', 'earKick', 'roll', 'spin', 'eyesClosed', 'eyesHappy', 'happy', 'tailWag', 'flinch', 'twoHand', 'armLock', 'bladeW'];
function newPose() { const A = {}; for (const k of LIMBS) A[k] = zero(); for (const k of SCALARS) A[k] = 0; return A; }
// (every field, so a pose that writes a new one of its own is cleared too: numbers to 0, {x, y, z} limbs to zero)
function clearPose(A) {
  for (const k in A) { const v = A[k]; if (v !== null && typeof v === 'object') { v.x = 0; v.y = 0; v.z = 0; if (v.zWave) v.zWave = 0; } else A[k] = 0; }
}

export class Animator {
  constructor(rig) {
    this.rig = rig;
    const P = this.P = rig.parts;
    this.quad = !!rig.quadruped;
    this.rest = new Map();
    rig.root.traverse(o => { if (o.isGroup || o.isObject3D) this.rest.set(o, { p: o.position.clone(), r: o.rotation.clone(), s: o.scale.clone() }); });
    this.t = Math.random() * 10;
    this.phase = 0; this.move = 0; this.speed = 0; this.runAmt = 0;
    this.action = null;
    this.blinkT = 1 + Math.random() * 3; this.blinkK = 0;
    this.ear = [{ a: 0, v: 0 }, { a: 0, v: 0 }];
    this.scarf = { a: 0, v: 0 };
    this.flash = 0; this.flashColor = new THREE.Color('#ffffff'); this.baseEmissive = rig.mat.emissive.clone();
    this.talk = 0; this.mood = 0; // mood: 0 normal, 1 happy
    this.wag = 1;
    this.prevPos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.first = true;
    this.lookYaw = 0;
    this.spinning = false;
  }
  play(name, { speed = 1, onEvent = null, force = true } = {}) {
    const def = ACTIONS[name]; if (!def) return;
    if (this.action && !force) return;
    this.action = { name, def, t: 0, dur: def.dur / speed, fired: new Set(), onEvent };
  }
  stop(name) { if (!name || this.action?.name === name) this.action = null; }
  busy() { return !!this.action && !this.action.def.hold && !['hurt', 'drink', 'wave', 'happy', 'pickup'].includes(this.action.name) && !SAMURAI_FLOURISH.has(this.action.name); }
  hit(color = '#ffffff') { if (this.t - (this.lastHit ?? -9) < 0.35) return; this.lastHit = this.t; this.flash = 1; this.flashColor.set(color); }
  update(dt, worldPos) {
    this.t += dt;
    if (worldPos) {
      if (this.first) { this.prevPos.copy(worldPos); this.first = false; }
      this.vel.subVectors(worldPos, this.prevPos).divideScalar(Math.max(dt, 1e-4)); this.prevPos.copy(worldPos);
    }
    const spd = Math.hypot(this.vel.x, this.vel.z);
    this.speed = damp(this.speed, spd, 12, dt);
    this.move = clamp(this.speed / 2.2);
    this.runAmt = clamp((this.speed - 3.2) / 2.5);
    // the sprint (the owner sets this.sprint 0..1: Player, sprint.js): past the run blend's 5.7 m/s ceiling the stride keeps
    // lengthening with the speed, so the feet keep the run's cadence instead of spinning faster. Quadrupeds stretch into
    // a gallop the same way above 4.5 m/s (Shadow pacing a sprinting hero).
    this.sprintAmt = damp(this.sprintAmt || 0, (this.sprint || 0) * clamp((this.speed - 3) / 2.5), 10, dt);
    this.gallop = this.quad ? clamp((this.speed - 4.5) / 4) : 0;
    const stride = this.quad ? 0.36 + this.gallop * 0.3 : 0.62 + this.runAmt * 0.25 + this.sprintAmt * 0.22;
    this.phase += (this.speed / stride) * dt * Math.PI;
    // action timing
    const A = this.A || (this.A = newPose()); clearPose(A);
    if (this.action) {
      const a = this.action; a.t += dt;
      const u = a.def.hold ? a.t : clamp(a.t / a.dur);
      if (a.def.ev) for (const [ev, at] of Object.entries(a.def.ev)) if (!a.fired.has(ev) && a.t / a.dur >= at) { a.fired.add(ev); a.onEvent?.(ev); }
      a.def.pose(a.def.hold ? a.t : u, this.P, A, a);
      if (!a.def.hold && a.t >= a.dur) { this.action = null; a.onEvent?.('end'); }
    }
    if (this.quad) this.poseQuad(dt, A); else this.poseBiped(dt, A);
    // blink
    this.blinkT -= dt;
    if (this.blinkT < 0) { this.blinkK = 1; this.blinkT = 2 + Math.random() * 4; }
    this.blinkK = Math.max(0, this.blinkK - dt * 7);
    const bl = Math.max(A.eyesClosed, Math.sin(this.blinkK * Math.PI));
    for (const e of this.P.eyes || []) e.scale.y = Math.max(0.08, 1 - bl) * (A.eyesHappy ? 0.35 : 1);
    // mouth (talk / bark): talking opens on uneven syllables rather than a steady flap
    const syl = Math.max(0, Math.sin(this.t * 15) * 0.7 + Math.sin(this.t * 6.1 + 1.3) * 0.5);
    const o = Math.max(A.mouth, this.talk > 0 ? Math.min(1, syl) * this.talk : 0);
    const m = this.P.mouth;
    if (m) { m.visible = o > 0.05; const k = o > 0.05 ? 1 : 0.0001; m.scale.set(k, Math.max(0.01, o) * k, k); }
    this.face(dt, A, bl, o);
    // flash
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 6);
    const mat = this.rig.mat;
    mat.emissive.copy(this.flashColor).multiplyScalar(this.flash * this.flash * 0.55 / (mat.emissiveIntensity || 1)).add(this.baseEmissive);
  }
  // rigs with a sculpted face (the Disney Chewy): the jaw drops instead of a mouth decal scaling, lids close over the
  // eyes instead of the eyes squashing, and the lip corners lift with the mood
  face(dt, A, blink, open) {
    const P = this.P;
    if (P.jaw) { const r = this.rest.get(P.jaw); P.jaw.rotation.x = r.r.x + open * 0.42; }
    if (P.lids) {
      // happy squint: upper lids +0.488 (0.4 of a blink), lower lids −0.24 (held at −0.1 otherwise); rig.squint = [upper, lower]
      // overrides it per model (a tall wrapped eye like the Toybox Rosie's reads happier with less upper lid)
      const sq = this.rig.squint, up = A.eyesHappy ? (sq ? sq[0] : 0.488) : 0, low = A.eyesHappy ? (sq ? sq[1] : -0.24) : -0.1;
      for (const l of P.lids) { const r = this.rest.get(l); l.rotation.x = r.r.x + Math.max(blink * 1.22, up); }
      for (const l of P.lidsLow || []) { const r = this.rest.get(l); l.rotation.x = r.r.x + low; }
    }
    if (P.lips) {
      this.smile = damp(this.smile ?? 0.4, A.happy || this.mood ? 1 : 0.4, 6, dt);
      for (const l of P.lips) { const r = this.rest.get(l); l.position.set(r.p.x, r.p.y + 0.007 * this.smile, r.p.z - 0.004 * this.smile); }
    }
  }
  _set(o, rx, ry, rz) { const r = this.rest.get(o); o.rotation.set(r.r.x + rx, r.r.y + ry, r.r.z + rz); }
  poseBiped(dt, A) {
    const P = this.P, mv = this.move, run = this.runAmt, ph = this.phase, t = this.t;
    const sp = this.sprintAmt || 0; // the sprint run: a deeper lean, a longer stride, pumping arms (see update)
    const swing = Math.sin(ph), bob = Math.abs(Math.sin(ph));
    const legAmp = (0.62 + run * 0.35 + sp * 0.24) * mv;
    this._set(P.legL, swing * legAmp + A.legL.x, A.legL.y, A.legL.z); // (z: a wide stance, + spreads the left leg out)
    this._set(P.legR, -swing * legAmp + A.legR.x, A.legR.y, A.legR.z);
    // arms
    const lock = 1 - A.armLock, armAmp = (0.55 + run * 0.4 + sp * 0.3) * mv * lock;
    const idleArm = Math.sin(t * 1.8) * 0.04 * (1 - mv);
    this._set(P.armL, -swing * armAmp + A.armL.x + idleArm, A.armL.y, 0.12 + 0.12 * run + A.armL.z);
    this._set(P.armR, swing * armAmp + A.armR.x - idleArm, A.armR.y, -0.12 - 0.12 * run + A.armR.z + (A.armR.zWave || 0));
    // elbows and wrists (baked heroes have the bones; at rest they sit at their bind pose). Sprinting bends the elbows.
    const elbow = -0.75 * sp * mv * lock;
    if (P.foreL) this._set(P.foreL, A.foreL.x + elbow, A.foreL.y, A.foreL.z);
    if (P.foreR) this._set(P.foreR, A.foreR.x + elbow, A.foreR.y, A.foreR.z);
    if (P.wristL) this._set(P.wristL, A.wristL.x, A.wristL.y, A.wristL.z);
    if (P.wristR) this._set(P.wristR, A.wristR.x, A.wristR.y, A.wristR.z);
    this.twoHand = A.twoHand;
    // body
    const rb = this.rest.get(P.body);
    const breathe = Math.sin(t * 2.3) * 0.014 * (1 - mv);
    P.body.position.y = rb.p.y + bob * (0.04 + run * 0.05 + sp * 0.025) * mv + A.y * 0 ;
    P.body.rotation.set(rb.r.x + (0.1 + run * 0.16 + sp * 0.22) * mv + A.body.x + A.lean + (A.roll || 0), rb.r.y + A.body.y + (A.spin || 0), rb.r.z + Math.sin(ph) * 0.05 * mv + A.body.z);
    // squash & stretch on root
    const sq = A.sq + breathe - bob * 0.03 * mv * (1 + run + sp);
    const root = this.rig.root, sc = this.rig.spec.scale || 1;
    root.scale.set(sc * (1 + sq * 0.5), sc * (1 - sq), sc * (1 + sq * 0.5));
    this.rig.offsetY = A.y + (A.roll ? 0 : 0);
    // head
    const lookY = Math.sin(t * 0.37) * 0.18 * (1 - mv) * (1 - this.talk * 0.5);
    this._set(P.head, (-0.05 - sp * 0.08) * mv + Math.sin(ph * 2) * 0.03 * mv + A.head.x + (this.talk ? Math.sin(t * 9) * 0.04 : 0), lookY + A.head.y, Math.sin(t * 0.71) * 0.05 * (1 - mv) + A.head.z); // (sprinting: the head lifts against the lean, eyes ahead)
    // ears: springs driven by bob velocity and forward speed
    this.secondary(dt, A, bob, mv);
    // tail wag
    if (P.tail) {
      const wagSpd = 9 + (A.happy || this.mood) * 10 + A.tailWag * 5;
      const r = this.rest.get(P.tail);
      P.tail.rotation.set(r.r.x - 0.15 * mv, Math.sin(t * wagSpd) * (0.35 + (A.happy || this.mood) * 0.35 + A.tailWag * 0.2), 0);
    }
  }
  poseQuad(dt, A) {
    const P = this.P, mv = this.move, ph = this.phase, t = this.t, gal = this.gallop || 0;
    const amp = (0.75 + gal * 0.2) * mv; // (a gallop reaches further: see update's stride)
    const [FL, FR, BL, BR] = P.legs;
    const s = Math.sin(ph);
    const sitting = this.action?.name === 'sit';
    this._set(FL, s * amp, 0, 0); this._set(BR, s * amp, 0, 0);
    this._set(FR, -s * amp, 0, 0); this._set(BL, -s * amp, 0, 0);
    // sit: the body pitches up at the front so the rump settles onto the ground (only the body drops, the front paws stay
    // planted), the haunches come down and the hind legs fold forward along the ground; the head counter-tilts to look ahead
    const sk = sitting ? ease.outQuad(Math.min(1, this.action.t / 0.3)) : 0;
    for (const L of [BL, BR]) L.position.y = this.rest.get(L).p.y - (this.rig.sitDrop ?? 0.17) * sk; // (baked dogs with short legs drop less)
    if (sk) { this._set(BL, -1.45 * sk, 0, 0); this._set(BR, -1.45 * sk, 0, 0); A.body.x -= 0.5 * sk; A.head.x += 0.38 * sk; }
    const rb = this.rest.get(P.body);
    const bob = Math.abs(Math.sin(ph));
    // A.y already lifts/lowers the whole rig through rig.offsetY (as for bipeds), so it is not added to the body again
    P.body.position.y = rb.p.y + bob * 0.03 * mv + Math.sin(t * 2.4) * 0.006 - 0.045 * sk;
    P.body.rotation.set(rb.r.x + A.body.x + Math.sin(ph * 2) * (0.03 + gal * 0.04) * mv, A.body.y, Math.sin(ph) * 0.04 * mv);
    this._set(P.head, Math.sin(ph * 2) * 0.05 * mv + A.head.x + Math.sin(t * 0.8) * 0.03, Math.sin(t * 0.43) * 0.25 * (1 - mv) + A.head.y, Math.sin(t * 0.61) * 0.08 * (1 - mv) + A.head.z);
    const sc = this.rig.spec.scale || 1, sq = A.sq;
    this.rig.root.scale.set(sc * (1 + sq * 0.5), sc * (1 - sq), sc * (1 + sq * 0.5));
    this.rig.offsetY = A.y;
    this.secondary(dt, A, bob, mv);
    if (P.tail) P.tail.rotation.set(-0.3, Math.sin(t * (14 + this.mood * 10)) * (0.5 + this.mood * 0.4), 0);
  }
  secondary(dt, A, bob, mv) {
    const P = this.P;
    const drive = -this.vel.y * 0.08 - mv * 0.25 - ((this.sprintAmt || 0) + (this.gallop || 0)) * 0.2 + Math.cos(this.phase) * 0.12 * mv + A.earKick * 0.3 + A.flinch * 0.6; // (a sprint / gallop streams the ears back)
    ['earL', 'earR'].forEach((k, i) => {
      const e = P[k]; if (!e) return;
      const S = this.ear[i];
      const target = drive + Math.sin(this.t * 1.3 + i) * 0.03;
      const eg = this.rig.earGain, g = (Array.isArray(eg) ? eg[i] : eg) || 1; // big sculpted ears (Disney Chewy) swing further and flick now and then; [left, right]: a gain per ear (heroModels.js)
      if (this.rig.earGain) {
        S.tw = (S.tw ?? 1 + Math.random() * 3) - dt;
        if (S.tw < 0) { S.tw = 2.5 + Math.random() * 4; S.v += (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 4); }
      }
      S.v += ((target - S.a) * 90 - S.v * 9) * dt; S.a += S.v * dt;
      const r = this.rest.get(e);
      const tip = e.userData.tip;
      if (tip) {
        const tr = this.rest.get(tip), a = S.a * 1.4 * g;
        // soft limits: the flap may flip well up (perked) but only fold a little tighter (further would pass into the skull)
        tip.rotation.x = tr.r.x + (a < 0 ? Math.tanh(a / 1.05) * 1.05 : Math.tanh(a / 0.6) * 0.6);
        const b = Math.tanh(S.a * 0.25 * g / 0.35) * 0.35;
        e.rotation.set(r.r.x + b, r.r.y, r.r.z + (i ? -1 : 1) * S.a * 0.12 * (g - 1));
      }
      else e.rotation.set(r.r.x + S.a * (e.userData.soft ? 0.9 : 0.4), r.r.y, r.r.z + (i ? -1 : 1) * S.a * 0.2);
    });
    if (P.scarfTail) {
      const S = this.scarf; const target = mv * 0.9 + Math.sin(this.t * 3) * 0.1 * mv;
      S.v += ((target - S.a) * 40 - S.v * 6) * dt; S.a += S.v * dt;
      P.scarfTail.rotation.x = -S.a;
    }
  }
}
