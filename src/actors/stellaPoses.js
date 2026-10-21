// Stella the Sun Oracle's moves (docs/STELLA.md §4.4), merged into animator.js' ACTIONS (same format as goldenPoses.js:
// dur in s, ev {name: t01}, pose(t01, P, A) adding offsets to the pose accumulator; a few key poses blended in time).
//
// A key pose holds additive offsets from the rig's rest (armR / armL / foreR / foreL / wristR / wristL [x, y, z], body,
// head, legL, legR, sq, y, lean, mouth, earKick, tailWag, eyesHappy, eyesClosed, happy, armLock, armLockR), plus the
// wagasa: dir [forward, up, her left], where its shaft points in her frame (actors/stellaGear.js aimParasol turns the
// holder there; it pivots at the right paw's grip) and up (the same frame), the way the canopy's seam faces.
//
// THE CONTRACT (combat/stellaSkills.js, stellaArts.js, chargedStella.js and actors/stellaJoin.js play these by name and
// listen for these events at these times; the charged releases start them from the frame their wind-up pose holds):
//   parasolSweep1 0.42 s {hit 0.46} · parasolSweep2 0.42 s {hit 0.46} · parasolTwirl 0.5 s {hit 0.5} (the Sunsweep combo)
//   parasolAim 0.56 s {release 0.42} (Golden Ray, Prism, Kind Light; charged from 0.3)
//   parasolGlint 0.42 s {release 0.36} (Glint; charged from 0.26)
//   solarChannel hold (Solar Ray: braced, the wagasa held out level; she walks with it)
//   skimThrow 0.6 s {release 0.5} (Skipping Sun; charged from 0.36)
//   parasolRaise 0.7 s {cast 0.46} (Morning Light, Solar Flare, Sunspot, Halo, Rising Sun; charged from 0.32)
//   gnomonPlant 0.9 s {plant 0.4} (Sundial; charged from 0.3)
//   sunCall 0.85 s {cast 0.55} (Little Sun, Sun Dog, Daybreak; charged from 0.4)
//   the scene poses (her arrival): stlFloat (hold), stlGreet 2.4 s {raise 0.2, bow 0.45, peek 0.75}, stlPeek (hold),
//   stlComposed 1.4 s {smooth 0.5}, stlKneel (hold), stlWave 1.2 s, stlTouch 1.0 s {touch 0.5}, stlZoom (hold: the run)
//   the charge wind-ups (STELLA_CHARGE_POSES): stlSunUp, stlAim, stlSkim, stlGnomon
// Every move's def has `parasol: true` (the wagasa comes out into her paw: stellaGear.js carryParasol).
import { clamp, ease } from '../core/util.js';
import { addChargePoses } from './chargePoses.js';

const LIMB = ['armR', 'armL', 'foreR', 'foreL', 'wristR', 'wristL', 'body', 'head', 'legL', 'legR'];
const SCAL = ['sq', 'y', 'lean', 'mouth', 'earKick', 'tailWag', 'eyesHappy', 'eyesClosed', 'happy', 'armLock', 'armLockR', 'spin'];
const nrm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
/** a key pose (its wagasa direction and up normalised) */
export function K(o) { const k = { ...o }; if (o.dir) k.dir = nrm(o.dir); if (o.up) k.up = nrm(o.up); return k; }
const vec = (A, n) => A[n] || (A[n] = { x: 0, y: 0, z: 0 });
/** add a key pose at weight w */
export function addKey(A, k, w) {
  if (w <= 0) return;
  for (const n of LIMB) { const v = k[n]; if (v) { const a = A[n]; a.x += v[0] * w; a.y += (v[1] || 0) * w; a.z += (v[2] || 0) * w; } }
  for (const n of SCAL) if (k[n]) A[n] = (A[n] || 0) + k[n] * w;
  if (k.dir) { const d = vec(A, 'parasolDir'); d.x += k.dir[0] * w; d.y += k.dir[1] * w; d.z += k.dir[2] * w; A.parasolW = (A.parasolW || 0) + w; }
  if (k.up) { const u = vec(A, 'parasolUp'); u.x += k.up[0] * w; u.y += k.up[1] * w; u.z += k.up[2] * w; }
}
/** blend a timeline [[u, key, ease?], ...] at u */
export function track(A, keys, u) {
  if (u <= keys[0][0]) return addKey(A, keys[0][1], 1);
  for (let i = 1; i < keys.length; i++) {
    const [u1, k1, e] = keys[i];
    if (u <= u1) { const [u0, k0] = keys[i - 1], s = (e || ease.inOutQuad)(clamp((u - u0) / Math.max(1e-4, u1 - u0))); addKey(A, k0, 1 - s); addKey(A, k1, s); return; }
  }
  addKey(A, keys[keys.length - 1][1], 1);
}
const out = ease.outCubic, snap = t => 1 - Math.pow(1 - t, 4), io = ease.inOutQuad;
const S = (a, b, t) => clamp((t - a) / (b - a));
const bump = (a, b, t) => Math.sin(S(a, b, t) * Math.PI);

// ------------------------------------------------------------------ key poses
const REST = K({});
/** the hold while the wagasa is out: upright in her right paw, out to her right and a touch behind, the canopy over her
 *  shoulder (never over her face) */
// (2026-10-17: the paw out at her side and the canopy leaning out to her right, so it stays off her face from the 45° yaw
// on her parasol side: it covered her near eye at the game camera)
export const HOLD = K({ armR: [-0.1, 0, -0.42], foreR: [-0.7, 0, 0], body: [0, -0.04, 0], dir: [-0.3, 0.82, -0.6], up: [1, 0, 0], armLockR: 1 });
// the Sunsweep: wound out to her right, then swept level across the front to her left (and back the other way)
const SW1_BACK = K({ armR: [-1.1, 0, -0.65], foreR: [-0.3, 0, 0], body: [-0.04, -0.45, 0], head: [0, 0.3, 0], legL: [-0.2], legR: [0.2], dir: [0.1, 0.25, -0.96], up: [0, 1, 0], armLockR: 1, sq: 0.04 });
const SW1_END = K({ armR: [-1.25, 0, 0.85], foreR: [-0.2, 0, 0], body: [0.12, 0.5, 0], head: [0, -0.3, 0], legL: [-0.45], legR: [0.35], dir: [0.55, 0.2, 0.8], up: [0, 1, 0], armLockR: 1, sq: -0.05, earKick: 1.5, mouth: 0.4 });
const SW2_BACK = K({ armR: [-1.2, 0, 0.75], foreR: [-0.35, 0, 0], body: [0.04, 0.4, 0], head: [0, -0.25, 0], legL: [-0.3], legR: [0.25], dir: [0.4, 0.3, 0.86], up: [0, 1, 0], armLockR: 1, sq: 0.04 });
const SW2_END = K({ armR: [-1.15, 0, -0.7], foreR: [-0.2, 0, 0], body: [0.1, -0.5, 0], head: [0, 0.3, 0], legL: [-0.35], legR: [0.45], dir: [0.45, 0.2, -0.87], up: [0, 1, 0], armLockR: 1, sq: -0.05, earKick: 1.5, mouth: 0.4 });
const TWIRL = K({ armR: [-2.5, 0, -0.1], foreR: [-0.3, 0, 0], armL: [-0.6, 0, -0.5], body: [-0.05, 0, 0], head: [-0.2, 0, 0], dir: [0.05, 1, -0.1], up: [1, 0, 0], armLockR: 1, sq: -0.06, happy: 1, eyesHappy: 1, tailWag: 2 });
// aiming the finial at the foe: the paw out to her right, the shaft pointing ahead and up, the canopy off her shoulder
const AIM = K({ armR: [-1.35, 0, -0.35], foreR: [-0.15, 0, 0], armL: [-0.3, 0, 0.1], body: [0.02, -0.2, 0], head: [-0.04, 0.12, 0], legL: [-0.25], legR: [0.2], dir: [0.8, 0.45, -0.4], up: [0, 1, 0], armLockR: 1 });
const AIM_SHOT = K({ armR: [-1.45, 0, -0.3], foreR: [-0.05, 0, 0], armL: [-0.2, 0, 0.15], body: [0.08, -0.15, 0], head: [-0.06, 0.1, 0], legL: [-0.4], legR: [0.3], dir: [0.88, 0.3, -0.36], up: [0, 1, 0], armLockR: 1, sq: -0.04, earKick: 1, mouth: 0.3 });
const GLINT_TILT = K({ armR: [-1.5, 0, -0.45], foreR: [-0.3, 0, 0], wristR: [0, 0, 0.3], body: [0, -0.25, 0], head: [0, 0.15, 0], dir: [0.55, 0.75, -0.35], up: [0, 1, 0], armLockR: 1 });
const CHANNEL = K({ armR: [-1.45, 0, -0.25], foreR: [-0.1, 0, 0], armL: [-1.2, 0, 0.35], foreL: [-0.3, 0, 0], body: [0.06, -0.15, 0], head: [-0.04, 0.1, 0], legL: [-0.3, 0, 0.1], legR: [0.25, 0, -0.1], dir: [0.85, 0.35, -0.38], up: [0, 1, 0], armLockR: 1, earKick: -1.5 });
const SKIM_LOW = K({ armR: [-0.4, 0, -0.9], foreR: [-0.4, 0, 0], body: [0.3, -0.6, 0], head: [-0.1, 0.45, 0], legL: [-0.6], legR: [0.5], dir: [-0.2, 0.55, -0.8], up: [0, 1, 0], armLockR: 1, sq: 0.1, y: -0.08 });
const SKIM_THROW = K({ armR: [-1.0, 0, 0.7], foreR: [-0.1, 0, 0], body: [0.25, 0.35, 0], head: [-0.05, -0.2, 0], legL: [-0.7], legR: [0.55], dir: [0.7, 0.35, 0.62], up: [0, 1, 0], armLockR: 1, sq: -0.06, y: -0.05, earKick: 2, mouth: 0.5 });
const RAISE = K({ armR: [-2.6, 0, -0.15], foreR: [-0.15, 0, 0], armL: [-0.5, 0, 0.1], body: [-0.08, 0, 0], head: [-0.3, 0, 0], dir: [0.1, 1, -0.12], up: [1, 0, 0], armLockR: 1, sq: -0.06, y: 0.02 });
const RAISE_LIFT = K({ armR: [-2.9, 0, -0.1], foreR: [0, 0, 0], armL: [-0.9, 0, 0.3], body: [-0.12, 0, 0], head: [-0.4, 0, 0], dir: [0.08, 1, -0.06], up: [1, 0, 0], armLockR: 1, sq: -0.1, y: 0.05, eyesClosed: 1, tailWag: 1 });
const GNOMON = K({ armR: [-0.9, 0, -0.1], foreR: [-0.5, 0, 0], armL: [-0.9, 0, 0.4], body: [0.35, 0, 0], head: [0.15, 0, 0], legL: [-0.35], legR: [0.35], dir: [0.55, -0.83, -0.1], up: [1, 0, 0], armLockR: 1, sq: 0.08, y: -0.06 });
const GNOMON_STEP = K({ armR: [-0.7, 0, -0.1], foreR: [-0.3, 0, 0], body: [0.1, 0, 0], head: [-0.15, 0, 0], legL: [0.3], legR: [-0.2], dir: [0.5, -0.86, -0.1], up: [1, 0, 0], armLockR: 1, eyesHappy: 1 });
const CALL = K({ armR: [-2.7, 0, -0.2], foreR: [-0.2, 0, 0], armL: [-2.6, 0, 0.25], foreL: [-0.2, 0, 0], body: [-0.12, 0, 0], head: [-0.45, 0, 0], dir: [0.05, 1, 0.05], up: [1, 0, 0], armLockR: 1, sq: -0.1, y: 0.04, happy: 1, eyesHappy: 1, tailWag: 3, mouth: 0.4 });
// the scene poses (actors/stellaJoin.js)
const FLOAT = K({ armR: [-2.7, 0, -0.1], foreR: [-0.15, 0, 0], armL: [-0.3, 0, -0.3], body: [-0.04, 0, 0], head: [-0.15, 0, 0], legL: [0.25], legR: [-0.15], dir: [0, 1, 0], up: [1, 0, 0], armLockR: 1, sq: -0.04 });
const GREET_UP = K({ armR: [-2.6, 0, 0.3], foreR: [-0.2, 0, 0], armL: [-2.5, 0, -0.3], foreL: [-0.2, 0, 0], body: [-0.1, 0, 0], head: [-0.35, 0, 0], dir: [0.1, 1, 0.15], up: [1, 0, 0], armLockR: 1, eyesClosed: 1 });
const GREET_BOW = K({ armR: [-1.2, 0, 0.6], foreR: [-0.9, 0, 0], armL: [-1.2, 0, -0.6], foreL: [-0.9, 0, 0], body: [0.75, 0, 0], head: [0.3, 0, 0], legL: [-0.1], legR: [0.1], dir: [0.55, 0.8, -0.2], up: [1, 0, 0], armLockR: 1, eyesClosed: 1, sq: 0.04 });
const PEEK = K({ armR: [-1.2, 0, 0.6], foreR: [-0.9, 0, 0], armL: [-1.2, 0, -0.6], foreL: [-0.9, 0, 0], body: [0.7, 0, 0], head: [0.15, 0.55, 0.15], dir: [0.55, 0.8, -0.2], up: [1, 0, 0], armLockR: 1 });
const COMPOSED = K({ armR: [-0.35, 0, -0.15], foreR: [-0.8, 0, 0], armL: [-0.4, 0, 0.45], foreL: [-1.1, 0, 0], body: [-0.06, 0, 0], head: [-0.12, 0, 0.12], dir: [-0.1, 0.96, -0.25], up: [1, 0, 0], armLockR: 1, eyesClosed: 1, sq: -0.04 });
const KNEEL = K({ legL: [-1.2], legR: [0.9], y: -0.18, body: [0.15, 0, 0], head: [0.1, 0, 0], armR: [-0.6, 0, -0.1], foreR: [-0.6, 0, 0], armL: [-0.7, 0, 0.3], dir: [0.3, 0.9, -0.3], up: [1, 0, 0], armLockR: 1 });
const WAVE_UP = K({ armR: [-2.6, 0, -0.35], foreR: [-0.2, 0, 0], body: [-0.04, 0, 0], head: [-0.1, 0, 0], dir: [0.1, 1, -0.2], up: [1, 0, 0], armLockR: 1, happy: 1, tailWag: 2 });
const TOUCH = K({ armR: [-1.3, 0, -0.1], foreR: [-0.2, 0, 0], body: [0.35, 0, 0], head: [0.25, 0, 0], legL: [-0.2], legR: [0.2], dir: [0.6, -0.8, -0.05], up: [1, 0, 0], armLockR: 1, happy: 1, eyesHappy: 1 });
const ZOOM = K({ armR: [-2.7, 0, -0.2], foreR: [-0.2, 0, 0], armL: [-0.3, 0, 0.3], body: [0.25, 0, 0], head: [-0.2, 0, 0], dir: [-0.15, 1, -0.1], up: [1, 0, 0], armLockR: 1, happy: 1, eyesHappy: 1, tailWag: 4, mouth: 0.6, earKick: 3 });

const PAR = { parasol: true };
const act = (dur, ev, keys, extra, flags = {}) => ({ dur, ev, ...PAR, ...flags, pose: (t, P, A, a) => { track(A, keys, t); extra?.(t, A, a); } });
const hold = (key, extra) => ({ dur: 99, hold: true, ...PAR, pose: (t, P, A, a) => { const k = io(clamp(t / 0.35)); addKey(A, key, k); extra?.(t, A, k, a); } });

export const STELLA_ACTIONS = {
  // ---- the Sunsweep combo (combat/stellaSkills.js cast_parasolSweep: one move per attack, at her attack speed)
  parasolSweep1: act(0.42, { hit: 0.46 }, [[0, HOLD], [0.3, SW1_BACK, out], [0.48, SW1_END, snap], [0.68, SW1_END], [1, HOLD, io]]),
  parasolSweep2: act(0.42, { hit: 0.46 }, [[0, HOLD], [0.3, SW2_BACK, out], [0.48, SW2_END, snap], [0.68, SW2_END], [1, HOLD, io]]),
  parasolTwirl: act(0.5, { hit: 0.5 }, [[0, HOLD], [0.3, TWIRL, out], [0.75, TWIRL], [1, HOLD, io]], (t, A) => { A.spin = (A.spin || 0) + ease.inOutQuad(S(0.3, 0.72, t)) * Math.PI * 2; }),
  // ---- aiming the finial (Golden Ray, Prism, Kind Light) and the glint
  parasolAim: act(0.56, { release: 0.42 }, [[0, HOLD], [0.3, AIM, out], [0.44, AIM_SHOT, snap], [0.7, AIM_SHOT], [1, HOLD, io]]),
  parasolGlint: act(0.42, { release: 0.36 }, [[0, HOLD], [0.26, GLINT_TILT, out], [0.38, AIM_SHOT, snap], [0.66, AIM_SHOT], [1, HOLD, io]]),
  // ---- Solar Ray's hold (a channel: she walks with it at half speed)
  solarChannel: hold(CHANNEL, (t, A, k) => { A.armR.x += Math.sin(t * 23) * 0.012 * k; A.earKick += Math.sin(t * 3) * 0.3 * k; }),
  // ---- Skipping Sun: crouched side-on, the disc skimmed off the canopy's rim
  skimThrow: act(0.6, { release: 0.5 }, [[0, HOLD], [0.36, SKIM_LOW, out], [0.5, SKIM_THROW, snap], [0.74, SKIM_THROW], [1, HOLD, io]]),
  // ---- the wagasa up to the sky (Morning Light, the flares, the sunspot, Halo, Rising Sun)
  parasolRaise: act(0.7, { cast: 0.46 }, [[0, HOLD], [0.32, RAISE, out], [0.46, RAISE_LIFT, snap], [0.72, RAISE_LIFT], [1, HOLD, io]]),
  // ---- Sundial: the tip set to the ground, a step back
  gnomonPlant: act(0.9, { plant: 0.4 }, [[0, HOLD], [0.3, GNOMON, out], [0.45, GNOMON, snap], [0.75, GNOMON_STEP, io], [1, HOLD, io]]),
  // ---- both paws up, the canopy turning (Little Sun, Sun Dog, Daybreak)
  sunCall: act(0.85, { cast: 0.55 }, [[0, HOLD], [0.4, CALL, out], [0.78, CALL], [1, HOLD, io]], (t, A) => { A.y += 0.04 * bump(0.45, 0.7, t); }),
  // ---- her arrival's scene poses (actors/stellaJoin.js)
  stlFloat: hold(FLOAT, (t, A, k) => { A.legL.x += Math.sin(t * 2.2) * 0.08 * k; A.legR.x -= Math.sin(t * 2.2) * 0.08 * k; }),
  stlGreet: act(2.4, { raise: 0.2, bow: 0.45, peek: 0.75 }, [[0, HOLD], [0.2, GREET_UP, out], [0.36, GREET_UP], [0.5, GREET_BOW, io], [0.72, GREET_BOW], [0.8, PEEK, io], [1, PEEK]]),
  stlPeek: hold(PEEK, (t, A, k) => { A.head.y += Math.sin(t * 1.3) * 0.04 * k; }),
  stlComposed: act(1.4, { smooth: 0.5 }, [[0, PEEK], [0.25, HOLD, out], [0.45, COMPOSED, io], [0.85, COMPOSED], [1, HOLD, io]], (t, A) => { A.armL.z += Math.sin(t * 28) * 0.05 * bump(0.4, 0.75, t); }),
  stlKneel: hold(KNEEL),
  stlWave: act(1.2, null, [[0, HOLD], [0.2, WAVE_UP, out], [0.85, WAVE_UP], [1, HOLD, io]], (t, A) => { A.armR.z += Math.sin(t * 22) * 0.18 * bump(0.2, 0.85, t); }),
  stlTouch: act(1.0, { touch: 0.5 }, [[0, HOLD], [0.35, TOUCH, out], [0.7, TOUCH], [1, HOLD, io]]),
  stlZoom: hold(ZOOM, (t, A, k) => { A.earKick += Math.sin(t * 14) * 1.2 * k; }),
};
/** the hold while the wagasa is out (animator.js `stance`; stellaGear.js sets it) */
export function PARASOL_HOLD(A, t, k) { addKey(A, HOLD, k); A.armR.x += Math.sin(t * 2.1) * 0.025 * k; }
/** the actions that root her (WASD won't walk out of them): player.js BUSY */
export const STELLA_ROOTED = ['parasolSweep1', 'parasolSweep2', 'parasolTwirl', 'parasolAim', 'parasolGlint', 'skimThrow', 'parasolRaise', 'gnomonPlant', 'sunCall', 'stlGreet', 'stlComposed', 'stlTouch'];
/** where each charged release starts its action from (the frame the wind-up pose holds) */
export const STELLA_FROM = { parasolAim: 0.3, parasolGlint: 0.26, skimThrow: 0.36, parasolRaise: 0.32, gnomonPlant: 0.3, sunCall: 0.4 };

// ------------------------------------------------------------------ charged wind-ups (docs/CHARGE.md; rpg/chargeStella.js pose names)
const tremble = (t, k) => Math.sin(t * (30 + 25 * k)) * 0.02 * k;
export const STELLA_CHARGE_POSES = {
  // the wagasa raised to the sky, light gathering on the finial (parasolRaise from 0.32; sunCall from 0.4)
  stlSunUp(t, k, A, e) { addKey(A, RAISE, e); A.y += 0.02 * k * e; A.armR.x += tremble(t, k) * e; A.head.x += -0.06 * k * e; A.eyesClosed = k > 0.5 ? 1 : 0; },
  // drawn back, the finial aimed, a bead of light growing on it (parasolAim from 0.3, parasolGlint from 0.26)
  stlAim(t, k, A, e) { addKey(A, AIM, e); A.body.y += -0.1 * k * e; A.sq += 0.03 * k * e; A.armR.z += tremble(t, k) * e; },
  // crouched side-on, the disc held low (skimThrow from 0.36)
  stlSkim(t, k, A, e) { addKey(A, SKIM_LOW, e); A.y += -0.03 * k * e; A.sq += 0.04 * k * e; A.armR.z += tremble(t, k) * e; },
  // the tip set to the ground, rays creeping round it (gnomonPlant from 0.3)
  stlGnomon(t, k, A, e) { addKey(A, GNOMON, e); A.sq += 0.04 * k * e; A.armR.x += tremble(t, k) * e; },
};
addChargePoses(STELLA_CHARGE_POSES);
