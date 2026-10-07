// The Golden Retriever dragoon's moves (docs/GOLDEN.md), merged into animator.js' ACTIONS (same format: dur in s, ev
// {name: t01}, pose(t01, P, A) adding offsets to the pose accumulator). Built like the samurai's (samuraiPoses.js): a few
// key poses blended in time.
//
// A key pose holds additive offsets from the rig's rest (armR / armL / foreR / foreL [x, y, z], body, head, legL, legR,
// sq, y, lean, mouth, earKick, tailWag, eyesHappy, happy, armLock), plus the lance: dir [forward, up, his left], where it
// points in his frame (actors/goldenGear.js aimLance turns the holder there; it pivots at the right paw's grip), up (the
// same frame) the way the flat of its flame head faces, and two (0..1), the left paw on the shaft (armIK, at the point of
// the shaft nearest where the key put that paw), slide (m, + toward the tip: a thrust runs the shaft out through the
// grip, goldenGear.js). A throw's key sets jav (0..1: the javelin shows in the right paw) and
// javDir. On these rigs a negative arm / forearm x raises it forward (−1.57 level), a positive right-arm z swings it in
// across the chest (the left arm mirrors), a positive body y turns him to his left. Chibi arms are short (a paw reaches
// about 0.3 m from the shoulder), so a two-handed spear reads by the body turning side-on behind it: the left shoulder
// leads, the shaft runs from the right paw at his hip past the left paw out in front.
//
// The guard (LANCE_GUARD, the stance goldenGear.js holds while the lance is drawn: animator.js `stance`) is where every
// lance move starts and ends (their defs have `guard: true`: the hand-over is a cut, not a blend through the rest pose).
import { clamp, ease } from '../core/util.js';
import { addChargePoses } from './chargePoses.js';

const LIMB = ['armR', 'armL', 'foreR', 'foreL', 'wristR', 'wristL', 'body', 'head', 'legL', 'legR'];
const SCAL = ['sq', 'y', 'lean', 'mouth', 'earKick', 'tailWag', 'eyesHappy', 'eyesClosed', 'happy', 'armLock'];
const nrm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
/** a key pose (its lance direction and up normalised) */
export function K(o) {
  const k = { ...o };
  if (o.dir) k.dir = nrm(o.dir);
  if (o.up) k.up = nrm(o.up);
  if (o.javDir) k.javDir = nrm(o.javDir);
  k.two = o.two || 0;
  return k;
}
const vec = (A, n) => A[n] || (A[n] = { x: 0, y: 0, z: 0 });
/** add a key pose at weight w */
export function addKey(A, k, w) {
  if (w <= 0) return;
  for (const n of LIMB) { const v = k[n]; if (v) { const a = A[n]; a.x += v[0] * w; a.y += (v[1] || 0) * w; a.z += (v[2] || 0) * w; } }
  for (const n of SCAL) if (k[n]) A[n] += k[n] * w;
  if (k.dir) { const d = vec(A, 'lanceDir'); d.x += k.dir[0] * w; d.y += k.dir[1] * w; d.z += k.dir[2] * w; A.lanceW = (A.lanceW || 0) + w; }
  if (k.up) { const u = vec(A, 'lanceUp'); u.x += k.up[0] * w; u.y += k.up[1] * w; u.z += k.up[2] * w; }
  if (k.two) A.lanceTwo = (A.lanceTwo || 0) + k.two * w;
  if (k.slide) A.lanceSlide = (A.lanceSlide || 0) + k.slide * w;
  if (k.jav) A.javW = (A.javW || 0) + k.jav * w;
  if (k.javDir) { const d = vec(A, 'javDir'); d.x += k.javDir[0] * w; d.y += k.javDir[1] * w; d.z += k.javDir[2] * w; }
}
/** blend a timeline [[u, key, ease?], ...] at u: the ease is the one of the segment arriving at that key */
export function track(A, keys, u) {
  if (u <= keys[0][0]) return addKey(A, keys[0][1], 1);
  for (let i = 1; i < keys.length; i++) {
    const [u1, k1, e] = keys[i];
    if (u <= u1) { const [u0, k0] = keys[i - 1], s = (e || ease.inOutQuad)(clamp((u - u0) / Math.max(1e-4, u1 - u0))); addKey(A, k0, 1 - s); addKey(A, k1, s); return; }
  }
  addKey(A, keys[keys.length - 1][1], 1);
}
const out = ease.outCubic, snap = t => 1 - Math.pow(1 - t, 4), io = ease.inOutQuad, inq = ease.inQuad;
const S = (a, b, t) => clamp((t - a) / (b - a));
const bump = (a, b, t) => Math.sin(S(a, b, t) * Math.PI);

// ------------------------------------------------------------------ key poses
const REST = K({});
// the guard (standing guard, between moves and while he walks with it drawn): the lance upright at his right side in the
// right paw, a touch forward and out, the left paw easy at his side. (A two-handed guard can't read from the game's high
// camera: with chibi arms the shaft has to cross in front of him, so the tip lands over his face. The moves themselves
// are two-handed.)
export const GUARD = K({ armR: [-0.32, 0, 0.12], foreR: [-0.75, 0, 0.1], armL: [-0.12, 0, -0.08], foreL: [-0.35, 0, 0], body: [0.02, -0.08, 0], head: [0, 0.06, 0],
  dir: [0.22, 0.95, -0.22], up: [1, 0, 0], two: 0, armLock: 1 });
// the thrust's draw-back: the right paw pulled back past the hip, the lance level at the foe, weight on the back foot
const DRAW = K({ armR: [0.15, 0, 0.35], foreR: [-0.85, 0, 0.25], armL: [-1.15, 0, -0.45], foreL: [-0.35, 0, 0], body: [-0.04, -0.55, 0], head: [0, 0.5, 0], legL: [-0.35], legR: [0.3],
  dir: [0.95, 0.08, 0.3], up: [0, 1, 0], two: 1, slide: -0.18, sq: 0.06, y: -0.03, armLock: 1 });
// the thrust at full reach: both paws driven forward, the body lunging into it, the front foot stepped out
const LUNGE = K({ armR: [-1.35, 0, 0.45], foreR: [-0.1, 0, 0.1], armL: [-1.45, 0, -0.25], foreL: [-0.05, 0, 0], body: [0.24, -0.2, 0], head: [-0.06, 0.2, 0], legL: [-0.75], legR: [0.55],
  dir: [1, -0.02, 0.12], up: [0, 1, 0], two: 1, slide: 0.3, sq: -0.07, y: -0.06, lean: 0.06, mouth: 0.6, earKick: 1.5, armLock: 1 });
// the second thrust (a little higher, from the other side: the follow-up poke)
const DRAW2 = K({ armR: [-0.25, 0, 0.75], foreR: [-0.8, 0, 0.3], armL: [-0.9, 0, -0.55], foreL: [-0.5, 0, 0], body: [0.02, -0.15, 0], head: [0, 0.3, 0], legL: [-0.2], legR: [0.25],
  dir: [0.95, 0.2, 0.25], up: [0, 1, 0.1], two: 1, slide: -0.15, sq: 0.04, armLock: 1 });
const LUNGE2 = K({ armR: [-1.55, 0, 0.35], foreR: [-0.05, 0, 0.05], armL: [-1.6, 0, -0.2], foreL: [0, 0, 0], body: [0.2, -0.12, 0], head: [-0.08, 0.12, 0], legL: [-0.6], legR: [0.5],
  dir: [1, 0.06, 0.06], up: [0, 1, 0], two: 1, slide: 0.28, sq: -0.06, y: -0.04, lean: 0.05, mouth: 0.5, earKick: 1.2, armLock: 1 });
// the swat: the lance wound back over his right shoulder, then swept level across the front, right to left
const SWAT_BACK = K({ armR: [-1.6, 0, -0.55], foreR: [-0.7, 0, 0], armL: [-0.9, 0, -0.5], foreL: [-0.6, 0, 0], body: [-0.06, -0.7, 0], head: [0, 0.55, 0], legL: [-0.25], legR: [0.25],
  dir: [-0.35, 0.35, -0.87], up: [0, 1, 0], two: 0.6, sq: 0.06, armLock: 1 });
const SWAT_MID = K({ armR: [-1.45, 0, 0.35], foreR: [-0.25, 0, 0], armL: [-1.1, 0, -0.3], foreL: [-0.3, 0, 0], body: [0.12, -0.05, 0], head: [0, 0.1, 0], legL: [-0.45], legR: [0.4],
  dir: [0.95, 0.05, -0.3], up: [0, 1, 0], two: 0.6, sq: -0.04, armLock: 1 });
const SWAT_END = K({ armR: [-1.2, 0, 1.1], foreR: [-0.2, 0, 0.2], armL: [-0.6, 0, 0.2], foreL: [-0.3, 0, 0], body: [0.2, 0.6, 0], head: [0, -0.45, 0], legL: [-0.55], legR: [0.45],
  dir: [0.35, 0, 0.94], up: [0, 1, 0], two: 0.3, sq: -0.07, y: -0.05, lean: 0.06, mouth: 0.5, earKick: 2, armLock: 1 });
// Sunbeam Thrust: a deep crouch with the lance drawn right back, then the biggest lunge he has: one paw stretched along
// the shaft, the other driving it, ears streaming
const SUN_DRAW = K({ armR: [0.3, 0, 0.3], foreR: [-1.0, 0, 0.3], armL: [-1.2, 0, -0.5], foreL: [-0.45, 0, 0], body: [-0.08, -0.75, 0], head: [-0.05, 0.65, 0], legL: [-0.5], legR: [0.45],
  dir: [0.97, 0.12, 0.22], up: [0, 1, 0], two: 1, slide: -0.25, sq: 0.12, y: -0.08, earKick: -1, armLock: 1 });
const SUN_LUNGE = K({ armR: [-1.45, 0, 0.5], foreR: [0, 0, 0], armL: [-1.55, 0, -0.15], foreL: [0, 0, 0], body: [0.32, -0.25, 0], head: [-0.12, 0.25, 0], legL: [-1.0], legR: [0.75],
  dir: [1, -0.04, 0.08], up: [0, 1, 0], two: 0.85, slide: 0.3, sq: -0.1, y: -0.1, lean: 0.1, mouth: 1, earKick: 3, armLock: 1 });
// a javelin throw: the lance stays in the left paw (goldenGear 'left'), a javelin drawn from the quiver over his right
// shoulder, wound back behind his head, then hurled overhand with a step, the left paw (and the lance) swinging back
const JAV_DRAW = K({ armR: [-2.0, 0, -0.55], foreR: [-0.8, 0, 0], armL: [-0.55, 0, -0.25], foreL: [-0.4, 0, 0], body: [-0.1, -0.45, 0], head: [-0.05, 0.4, 0], legL: [-0.3], legR: [0.3],
  javDir: [-0.2, 1, -0.3], sq: 0.05 });
// cocked: the paw up and out past his ear drape (they hang to his shoulders), the javelin raised back over it, its gold tip
// high behind him; the left paw (and the lance) out in front for aim
const JAV_WIND = K({ armR: [-2.4, 0, -0.8], foreR: [-0.6, 0, 0], armL: [-1.25, 0, -0.3], foreL: [-0.2, 0, 0], body: [-0.16, -0.7, 0], head: [-0.06, 0.6, 0], legL: [-0.45], legR: [0.4],
  javDir: [-0.35, 0.85, -0.45], sq: 0.07, y: -0.03 });
// the throw: overhand and forward with a step, the paw following through low, the left paw swung back
const JAV_THROW = K({ armR: [-1.5, 0, 0.3], foreR: [-0.1, 0, 0], armL: [-0.1, 0, 0.25], foreL: [-0.3, 0, 0], body: [0.2, 0.25, 0], head: [-0.05, -0.15, 0], legL: [-0.65], legR: [0.5],
  javDir: [1, 0.1, 0], sq: -0.07, y: -0.04, lean: 0.06, mouth: 0.6, earKick: 2 });

// ---- Sunfall Jump (the dragoon's Jump): a crouch with the lance drawn in close, the spring up with it held high, the hang
// at the top turning lance-down, the dive (body pitched right over, the point first, ears streaming up), the landing with
// the lance planted in the ground. The height is the action's (jumpY below × a.h), the ground travel goldenArts.js'.
const JUMP_CROUCH = K({ armR: [-0.7, 0, 0.35], foreR: [-0.9, 0, 0.2], armL: [-0.9, 0, -0.35], foreL: [-0.6, 0, 0], body: [0.18, 0, 0], head: [-0.1, 0, 0], legL: [-0.35], legR: [0.25],
  dir: [0.1, 1, -0.05], up: [1, 0, 0], two: 0.8, slide: -0.1, sq: 0.16, y: -0.1, earKick: -1, armLock: 1 });
const JUMP_RISE = K({ armR: [-2.7, 0, 0.15], foreR: [-0.25, 0, 0], armL: [-2.6, 0, -0.15], foreL: [-0.2, 0, 0], body: [-0.12, 0, 0], head: [-0.25, 0, 0], legL: [0.35], legR: [0.5],
  dir: [0.15, 1, 0], up: [1, 0, 0], two: 0.8, sq: -0.14, earKick: 2.5, mouth: 0.4, armLock: 1 });
const JUMP_HANG = K({ armR: [-2.4, 0, 0.3], foreR: [-0.5, 0, 0], armL: [-2.3, 0, -0.25], foreL: [-0.4, 0, 0], body: [0.55, 0, 0], head: [0.2, 0, 0], legL: [0.6], legR: [0.75],
  dir: [0.35, -0.94, 0], up: [1, 0, 0], two: 0.9, sq: -0.06, earKick: 1, armLock: 1 });
const JUMP_DIVE = K({ armR: [-1.6, 0, 0.35], foreR: [-0.2, 0, 0], armL: [-1.7, 0, -0.25], foreL: [-0.1, 0, 0], body: [0.85, 0, 0], head: [0.1, 0, 0], legL: [0.8], legR: [0.9],
  dir: [0.25, -1, 0.02], up: [1, 0, 0], two: 1, slide: 0.25, sq: -0.12, earKick: 3, mouth: 0.8, armLock: 1 });
const JUMP_LAND = K({ armR: [-1.0, 0, 0.4], foreR: [-0.3, 0, 0], armL: [-1.15, 0, -0.3], foreL: [-0.3, 0, 0], body: [0.42, -0.1, 0], head: [-0.15, 0.1, 0], legL: [-0.65], legR: [0.55],
  dir: [0.55, -0.83, 0.05], up: [1, 0, 0], two: 1, slide: 0.15, sq: 0.18, y: -0.12, mouth: 0.6, earKick: 2, armLock: 1 });
/** the jump's height (×a.h) over the action's u: the spring (ease out), the hang (a breath of float), the dive (ease in) */
export function jumpY(t) {
  if (t < 0.15) return 0;
  if (t < 0.46) { const s = (t - 0.15) / 0.31; return 1 - (1 - s) * (1 - s); }
  if (t < 0.6) return 1 + 0.04 * Math.sin((t - 0.46) / 0.14 * Math.PI);
  if (t < 0.76) { const s = (t - 0.6) / 0.16; return 1 - s * s; }
  return 0;
}
export const JUMP_U = { launch: 0.15, dive: 0.6, impact: 0.76 };
// ---- Pinwheel Sweep: a paw planted, the lance out level at full reach on his right; the whole of him turns (goldenArts.js
// spins his facing a full turn to his left, so the lance on his right leads round through his front)
const PIN_COIL = K({ armR: [-1.25, 0, -0.35], foreR: [-0.3, 0, 0], armL: [-1.05, 0, -0.55], foreL: [-0.45, 0, 0], body: [0.05, -0.5, 0], head: [0, 0.35, 0], legL: [-0.3, 0, 0.15], legR: [0.3, 0, -0.15],
  dir: [-0.3, 0.08, -0.95], up: [0, 1, 0], two: 0.8, slide: 0.05, sq: 0.07, y: -0.04, armLock: 1 });
const PIN_SPIN = K({ armR: [-1.45, 0, -0.55], foreR: [-0.05, 0, 0], armL: [-1.3, 0, -0.75], foreL: [-0.1, 0, 0], body: [0.1, -0.3, 0], head: [0, 0.15, 0], legL: [-0.35, 0, 0.18], legR: [0.35, 0, -0.18],
  dir: [0.18, 0.03, -0.98], up: [0, 1, 0], two: 0.7, slide: 0.3, sq: -0.04, y: -0.05, lean: 0.04, earKick: 2.5, mouth: 0.5, armLock: 1 });
const PIN_END = K({ armR: [-1.2, 0, 0.2], foreR: [-0.3, 0, 0], armL: [-0.9, 0, -0.3], foreL: [-0.3, 0, 0], body: [0.08, 0.1, 0], head: [0, -0.1, 0], legL: [-0.3], legR: [0.25],
  dir: [0.8, 0.3, -0.5], up: [0, 1, 0], two: 0.5, sq: 0.04, earKick: 1, tailWag: 2, armLock: 1 });
// ---- Gallant Charge: the lance couched under his right arm and levelled, a crouch, the gallop (the legs run on the
// Animator's own stride: the dash moves him), then a skid with the point lifted
const CHG_SET = K({ armR: [-0.55, 0, 0.55], foreR: [-1.25, 0, 0.3], armL: [-1.05, 0, -0.35], foreL: [-0.3, 0, 0], body: [0.22, -0.3, 0], head: [-0.1, 0.25, 0], legL: [-0.45], legR: [0.4],
  dir: [1, 0.02, 0.1], up: [0, 1, 0], two: 1, slide: -0.05, sq: 0.1, y: -0.06, earKick: -1, armLock: 1 });
const CHG_RUN = K({ armR: [-0.7, 0, 0.6], foreR: [-1.1, 0, 0.3], armL: [-1.2, 0, -0.3], foreL: [-0.2, 0, 0], body: [0.38, -0.2, 0], head: [-0.22, 0.15, 0],
  dir: [1, -0.03, 0.06], up: [0, 1, 0], two: 1, slide: 0.15, sq: -0.04, lean: 0.12, earKick: 3.5, mouth: 0.7, armLock: 1 });
const CHG_SKID = K({ armR: [-0.9, 0, 0.45], foreR: [-0.7, 0, 0.2], armL: [-1.1, 0, -0.35], foreL: [-0.3, 0, 0], body: [-0.18, -0.25, 0], head: [0.05, 0.2, 0], legL: [-0.8], legR: [-0.3],
  dir: [1, 0.25, 0.1], up: [0, 1, 0], two: 1, sq: 0.1, y: -0.05, earKick: 1.5, armLock: 1 });
// ---- Starfall Lance: wound back overhead, then heaved straight up with everything he has (up on his toes, watching it
// go); the catch when it comes home
const STAR_WIND = K({ armR: [-2.75, 0, -0.35], foreR: [-0.7, 0, 0], armL: [-1.2, 0, -0.35], foreL: [-0.3, 0, 0], body: [-0.2, -0.45, 0], head: [-0.25, 0.35, 0], legL: [-0.35], legR: [0.3],
  dir: [-0.45, 0.85, -0.25], up: [1, 0, 0], two: 0, slide: -0.2, sq: 0.08, y: -0.04, armLock: 1 });
const STAR_HEAVE = K({ armR: [-3.0, 0, 0.1], foreR: [-0.1, 0, 0], armL: [-2.2, 0, -0.3], foreL: [-0.2, 0, 0], body: [-0.22, 0.1, 0], head: [-0.55, 0, 0], legL: [0.1], legR: [0.2],
  dir: [0.08, 1, 0], up: [1, 0, 0], two: 0, slide: 0.3, sq: -0.12, y: 0.06, mouth: 0.8, earKick: 2, armLock: 1 });
const STAR_WATCH = K({ armR: [-1.0, 0, 0.2], foreR: [-0.4, 0, 0], armL: [-0.6, 0, -0.2], foreL: [-0.4, 0, 0], body: [-0.1, 0, 0], head: [-0.45, 0, 0], sq: -0.03, tailWag: 2, happy: 0.5 });
const CATCH_UP = K({ armR: [-2.6, 0, 0.15], foreR: [-0.3, 0, 0], armL: [-0.5, 0, -0.1], foreL: [-0.3, 0, 0], body: [-0.05, 0, 0], head: [-0.35, 0, 0], legL: [-0.1], legR: [0.1],
  dir: [0.05, 1, 0], up: [1, 0, 0], sq: -0.06, happy: 1, eyesHappy: 1, tailWag: 3, armLock: 1 });
// ---- the javelin throws' variants: a fanned volley (the throw sweeps across, right to left), True Flight's long flat
// throw (a deeper turn, a bigger step), Sunshower's fling of the whole quiver straight up
const JAV_FAN_WIND = K({ armR: [-1.9, 0, -1.0], foreR: [-0.5, 0, 0], armL: [-1.1, 0, -0.3], foreL: [-0.3, 0, 0], body: [-0.12, -0.85, 0], head: [-0.05, 0.65, 0], legL: [-0.4], legR: [0.35],
  javDir: [-0.3, 0.55, -0.8], sq: 0.06 });
const JAV_FAN_SWEEP = K({ armR: [-1.45, 0, 0.95], foreR: [-0.05, 0, 0], armL: [-0.3, 0, 0.3], foreL: [-0.3, 0, 0], body: [0.15, 0.55, 0], head: [0, -0.3, 0], legL: [-0.6], legR: [0.45],
  javDir: [0.4, 0.05, 0.9], sq: -0.06, lean: 0.05, mouth: 0.6, earKick: 2, tailWag: 3 });
const JAV_DEEP = K({ armR: [-2.2, 0, -0.95], foreR: [-0.4, 0, 0], armL: [-1.45, 0, -0.2], foreL: [-0.1, 0, 0], body: [-0.2, -0.95, 0], head: [-0.05, 0.8, 0], legL: [-0.55], legR: [0.5],
  javDir: [-0.85, 0.25, -0.45], sq: 0.1, y: -0.05 });
const JAV_LONG = K({ armR: [-1.6, 0, 0.2], foreR: [0, 0, 0], armL: [0.1, 0, 0.3], foreL: [-0.3, 0, 0], body: [0.28, 0.35, 0], head: [-0.1, -0.2, 0], legL: [-0.95], legR: [0.7],
  javDir: [1, 0.02, 0], sq: -0.1, y: -0.06, lean: 0.1, mouth: 0.7, earKick: 3 });
const SHOWER_REACH = K({ armR: [-2.9, 0, -0.4], foreR: [-1.0, 0, 0], armL: [-2.5, 0, 0.3], foreL: [-0.6, 0, 0], body: [-0.15, -0.2, 0], head: [-0.2, 0.2, 0], legL: [-0.2], legR: [0.2],
  javDir: [-0.4, 0.8, -0.2], sq: 0.08, y: -0.05 });
const SHOWER_FLING = K({ armR: [-3.1, 0, 0.15], foreR: [0, 0, 0], armL: [-3.0, 0, -0.15], foreL: [0, 0, 0], body: [-0.28, 0, 0], head: [-0.6, 0, 0], legL: [0.05], legR: [0.15],
  javDir: [0.05, 1, 0], sq: -0.14, y: 0.1, mouth: 0.9, earKick: 2.5, tailWag: 3 });
// ---- the Whelp Bond's call ("Shadow, breathe!"): the left paw flung out at the foes, a bark of a command, the guard kept
const CALL = K({ armL: [-1.55, 0, 0.1], foreL: [-0.1, 0, 0], head: [-0.1, 0.15, 0], body: [0.04, 0.12, 0], mouth: 0.8, tailWag: 2, earKick: 1 });

const act = (dur, ev, keys, extra, flags = {}) => ({ dur, ev, ...flags, pose: (t, P, A) => { track(A, keys, t); extra?.(t, A); } });
const LANCE = { lance: true, guard: true };
const jw = (a, b) => (t, A) => { A.javW = t > a && t < b ? 1 : 0; }; // (the javelin in his paw from the draw to the release)

export const GOLDEN_ACTIONS = {
  // ---- the reach combo (combat/goldenSkills.js cast_lancePoke: one move per attack, at his attack speed)
  lanceThrust1: act(0.42, { hit: 0.46 }, [[0, GUARD], [0.3, DRAW, out], [0.46, LUNGE, snap], [0.66, LUNGE], [1, GUARD, io]], null, LANCE),
  lanceThrust2: act(0.42, { hit: 0.46 }, [[0, GUARD], [0.28, DRAW2, out], [0.46, LUNGE2, snap], [0.64, LUNGE2], [1, GUARD, io]], null, LANCE),
  lanceSwat: act(0.5, { hit: 0.5 }, [[0, GUARD], [0.34, SWAT_BACK, out], [0.46, SWAT_MID, inq], [0.56, SWAT_END, snap], [0.74, SWAT_END], [1, GUARD, io]], null, LANCE),
  // ---- Sunbeam Thrust
  sunbeamThrust: act(0.62, { hit: 0.5 }, [[0, GUARD], [0.36, SUN_DRAW, out], [0.5, SUN_LUNGE, snap], [0.74, SUN_LUNGE], [1, GUARD, io]],
    (t, A) => { A.eyesClosed = t > 0.2 && t < 0.42 ? 1 : 0; A.tailWag += 2 * bump(0.5, 1, t); }, LANCE),
  // ---- a javelin from the quiver (Bonk Dart and the other throws: combat/goldenSkills.js; jav: the lance goes to the left paw)
  javToss: act(0.46, { release: 0.52 }, [[0, REST], [0.16, JAV_DRAW, out], [0.42, JAV_WIND, io], [0.54, JAV_THROW, snap], [0.74, JAV_THROW], [1, REST, io]],
    jw(0.1, 0.52), { jav: true }), // (the javelin in his paw from the draw to the release: then it's in the air)
  // ---- Lance Arts (combat/goldenArts.js)
  sunfallJump: { dur: 1.3, ev: { launch: JUMP_U.launch, dive: JUMP_U.dive, impact: JUMP_U.impact }, ...LANCE,
    pose: (t, P, A, a) => {
      track(A, [[0, GUARD], [0.13, JUMP_CROUCH, out], [0.3, JUMP_RISE, out], [0.46, JUMP_HANG, io], [0.6, JUMP_HANG], [0.72, JUMP_DIVE, inq], [0.76, JUMP_LAND, snap], [0.88, JUMP_LAND], [1, GUARD, io]], t);
      A.y += jumpY(t) * (a?.h ?? 2.8); A.eyesClosed = t > 0.62 && t < 0.76 ? 1 : 0; A.tailWag += 2 * bump(0.76, 1, t);
    } },
  pinwheel: act(0.62, { hit: 0.52 }, [[0, GUARD], [0.26, PIN_COIL, out], [0.34, PIN_SPIN, inq], [0.7, PIN_SPIN], [0.84, PIN_END, out], [1, GUARD, io]], null, LANCE),
  gallantCharge: act(0.85, { go: 0.16 }, [[0, GUARD], [0.16, CHG_SET, out], [0.24, CHG_RUN, snap], [0.62, CHG_RUN], [0.74, CHG_SKID, out], [0.86, CHG_SKID], [1, GUARD, io]],
    (t, A) => { A.eyesClosed = 0; A.tailWag += 3 * bump(0.2, 0.7, t); }, LANCE),
  starfallThrow: act(0.75, { throw: 0.42 }, [[0, GUARD], [0.3, STAR_WIND, out], [0.44, STAR_HEAVE, snap], [0.62, STAR_HEAVE], [0.82, STAR_WATCH, io], [1, REST, io]], null, LANCE),
  lanceCatch: act(0.5, { catch: 0.3 }, [[0, REST], [0.28, CATCH_UP, out], [0.45, CATCH_UP], [1, GUARD, io]], null, LANCE),
  // ---- Javelins (combat/goldenArts.js)
  javVolley: act(0.5, { release: 0.5 }, [[0, REST], [0.16, JAV_DRAW, out], [0.4, JAV_FAN_WIND, io], [0.56, JAV_FAN_SWEEP, snap], [0.74, JAV_FAN_SWEEP], [1, REST, io]], jw(0.1, 0.5), { jav: true }),
  javTrue: act(0.62, { release: 0.56 }, [[0, REST], [0.16, JAV_DRAW, out], [0.46, JAV_DEEP, io], [0.58, JAV_LONG, snap], [0.78, JAV_LONG], [1, REST, io]], jw(0.1, 0.56), { jav: true }),
  sunshowerThrow: act(0.8, { fling: 0.5 }, [[0, REST], [0.3, SHOWER_REACH, out], [0.44, SHOWER_REACH], [0.52, SHOWER_FLING, snap], [0.7, SHOWER_FLING], [1, REST, io]], jw(0.15, 0.5), { jav: true }),
  // ---- the Whelp Bond's call (the guard is kept: `stance`)
  whelpCall: act(0.45, { call: 0.32 }, [[0, REST], [0.3, CALL, out], [0.65, CALL], [1, REST, io]], null, { stance: true }),
  // ---- Shadow the whelp's own moves (quadruped: the head, body, mouth, squash; combat/goldenWhelp.js plays them)
  whelpBreath: { dur: 0.95, ev: { puff1: 0.36, puff2: 0.54, puff3: 0.72 }, pose: (t, P, A) => {
    const inh = ease.outQuad(S(0, 0.3, t)) * (1 - S(0.3, 0.38, t)), ex = S(0.3, 0.38, t) * (1 - io(S(0.8, 1, t)));
    const pulse = t > 0.34 && t < 0.82 ? Math.max(0, Math.sin((t - 0.34) / 0.18 * Math.PI * 2)) : 0;
    A.head.x += -0.35 * inh + 0.14 * ex; A.body.x += -0.12 * inh + 0.04 * ex;
    A.sq += -0.1 * inh + 0.06 * ex * pulse; A.mouth = Math.max(A.mouth, ex * (0.55 + 0.45 * pulse)); A.earKick += 1.5 * ex;
  } },
  whelpRoar: { dur: 1.1, ev: { roar: 0.42 }, pose: (t, P, A) => {
    const up = ease.outQuad(S(0, 0.36, t)) * (1 - io(S(0.8, 1, t))), r = S(0.4, 0.46, t) * (1 - S(0.74, 0.86, t));
    A.body.x += -0.32 * up; A.head.x += -0.5 * up + Math.sin(t * 70) * 0.04 * r; A.sq += -0.14 * up + 0.08 * r; A.y += 0.06 * up;
    A.mouth = Math.max(A.mouth, r); A.earKick += 3 * r;
  } },
  whelpStomp: { dur: 0.7, ev: { stomp: 0.45 }, pose: (t, P, A) => {
    const rear = ease.outQuad(S(0, 0.32, t)) * (1 - S(0.32, 0.45, t)), slam = S(0.4, 0.46, t) * (1 - io(S(0.6, 1, t)));
    A.body.x += -0.4 * rear + 0.12 * slam; A.y += 0.1 * rear; A.sq += -0.06 * rear + 0.12 * slam; A.mouth = Math.max(A.mouth, 0.5 * slam); A.head.x += -0.2 * rear;
  } },
};
/** the guard stance while the lance is drawn (animator.js `stance`; goldenGear.js sets it), breathing a little */
export function LANCE_GUARD(A, t, k) {
  addKey(A, GUARD, k);
  A.armR.x += Math.sin(t * 2.1) * 0.03 * k; A.armL.x += Math.sin(t * 2.1 + 0.4) * 0.03 * k;
}
/** the actions that root him (WASD won't walk out of them): player.js BUSY */
export const GOLDEN_ROOTED = ['lanceThrust1', 'lanceThrust2', 'lanceSwat', 'sunbeamThrust', 'javToss', 'sunfallJump', 'pinwheel', 'gallantCharge', 'starfallThrow', 'lanceCatch',
  'javVolley', 'javTrue', 'sunshowerThrow', 'whelpCall'];

// ------------------------------------------------------------------ charged wind-ups (docs/CHARGE.md; rpg/chargeGolden.js
// pose names). Each holds the frame its release starts from (combat/chargedGolden.js fromFrame), coiling deeper as it fills.
const tremble = (t, k) => Math.sin(t * (30 + 25 * k)) * 0.02 * k;
/** the charge styles that hold a javelin (goldenGear.js carryLance moves the lance to his left paw for them) */
export const GLD_JAV_STYLES = new Set(['gldJav', 'gldVolley', 'gldTrue', 'gldShower']);
export const GOLDEN_CHARGE_POSES = {
  // Sunbeam Thrust (from 0.36): crouched over the lance drawn right back, sinking lower as the sunbeam gathers
  gldThrust(t, k, A, e) { addKey(A, SUN_DRAW, e); A.sq += 0.06 * k * e; A.y += -0.04 * k * e; A.body.y += -0.12 * k * e; A.armR.x += tremble(t, k) * e; A.eyesClosed = 1; },
  // Sunfall Jump (from 0.13): the crouch, coiling like a spring
  gldJump(t, k, A, e) { addKey(A, JUMP_CROUCH, e); A.sq += 0.08 * k * e; A.y += -0.05 * k * e; A.body.x += 0.06 * k * e; A.earKick += -0.6 * k * e; },
  // Pinwheel Sweep (from 0.26): the lance out to his right, wound back further round behind him
  gldPinwheel(t, k, A, e) { addKey(A, PIN_COIL, e); A.body.y += -0.25 * k * e; A.head.y += 0.15 * k * e; A.sq += 0.04 * k * e; A.armR.z += tremble(t, k) * e; },
  // Gallant Charge (from 0.16): the lance couched, pawing at the ground, ears back
  gldCharge(t, k, A, e) { addKey(A, CHG_SET, e); A.legR.x += Math.sin(t * (8 + 6 * k)) * 0.18 * k * e; A.sq += 0.05 * k * e; A.earKick += -1 * k * e; },
  // Starfall Lance (from 0.3): wound back overhead, rising onto his toes
  gldStarfall(t, k, A, e) { addKey(A, STAR_WIND, e); A.body.x += -0.08 * k * e; A.y += 0.02 * k * e; A.armR.x += tremble(t, k) * e; },
  // the javelin throws, cocked (javToss from 0.42, javVolley from 0.4, javTrue from 0.46, sunshowerThrow from 0.44)
  gldJav(t, k, A, e) { addKey(A, JAV_WIND, e); A.body.y += -0.12 * k * e; A.sq += 0.04 * k * e; A.armR.z += tremble(t, k) * e; A.javW = 1; },
  gldVolley(t, k, A, e) { addKey(A, JAV_FAN_WIND, e); A.body.y += -0.12 * k * e; A.armR.z += tremble(t, k) * e; A.tailWag += 2 * k * e; A.javW = 1; },
  gldTrue(t, k, A, e) { addKey(A, JAV_DEEP, e); A.body.y += -0.1 * k * e; A.y += -0.03 * k * e; A.armR.z += tremble(t, k) * e; A.javW = 1; },
  gldShower(t, k, A, e) { addKey(A, SHOWER_REACH, e); A.sq += 0.05 * k * e; A.armR.x += tremble(t, k) * e; A.javW = 1; },
  // the Whelp Bond (whelpCall from 0.3): the guard kept, the left paw up, calling Shadow over, louder as it fills
  gldCall(t, k, A, e) { addKey(A, GUARD, e); addKey(A, CALL, e * (0.6 + 0.4 * k)); A.mouth = Math.max(A.mouth, 0.3 + 0.5 * k * (0.5 + 0.5 * Math.sin(t * 9))); A.tailWag += 2 * k * e; },
};
addChargePoses(GOLDEN_CHARGE_POSES); // (combat/charge.js plays them by the table's pose name: rpg/chargeGolden.js)
