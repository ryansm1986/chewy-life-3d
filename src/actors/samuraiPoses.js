// Chewy the samurai's moves (docs/HEROES.md "Chewy the samurai"), merged into animator.js' ACTIONS: the basic-attack
// combo (cut1 diagonal kesa, cut2 rising backhand, cut3 big two-handed sweep), the iai draw-cut (Crescent Chomp), the
// sheathing flourish (noto: a model with a saya) or a blade flick (chiburi: no saya), the Flash Draw dash and the Kiai!
// battle cry. Each one is a few key poses blended in time; the cuts keep the timing of the swings they replace (dur 0.46,
// hit at 0.42: the attack speed and the hit frame are game numbers), and the battle cry the bark's (0.5, shout at 0.28).
//
// A key pose holds additive offsets from the rig's rest, the same fields the Animator's pose accumulator has (A): armR /
// armL / foreR / foreL (upper arms, forearms: [x, y, z]), body, head, legL, legR, sq, y, lean, mouth, earKick, tailWag,
// and the katana: dir [forward, up, his left], where the blade points in the hero's frame, edge (the same frame) where
// its cutting edge faces (player.js aimSword turns it there; a key without dir blends back to the carry angle), and
// two (0..1), the free paw on the hilt (actors/armIK.js). On these rigs a negative arm / forearm x raises it forward
// (−1.57 level), a positive right-arm z swings it in across the chest (the left arm mirrors: negative z is in), a
// positive body y turns him to his left. Chibi arms are short: a paw reaches about eye height, so a raised blade reads
// by the blade standing up past the head, and two paws only meet on a hilt held near the middle of the chest.
import { clamp, ease } from '../core/util.js';

const LIMB = ['armR', 'armL', 'foreR', 'foreL', 'wristR', 'wristL', 'body', 'head', 'legL', 'legR'];
const SCAL = ['sq', 'y', 'lean', 'mouth', 'earKick', 'tailWag', 'eyesHappy', 'eyesClosed', 'happy', 'armLock'];

/** a key pose (its blade direction and edge normalised) */
function K(o) {
  const k = { ...o }, n = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  if (o.dir) k.dir = n(o.dir);
  if (o.edge) k.edge = n(o.edge);
  k.two = o.two || 0;
  return k;
}
const REST = K({});
function add(A, k, w) {
  if (w <= 0) return;
  for (const n of LIMB) { const v = k[n]; if (v) { const a = A[n]; a.x += v[0] * w; a.y += (v[1] || 0) * w; a.z += (v[2] || 0) * w; } }
  for (const n of SCAL) if (k[n]) A[n] += k[n] * w;
  if (k.dir) { A.bladeDir.x += k.dir[0] * w; A.bladeDir.y += k.dir[1] * w; A.bladeDir.z += k.dir[2] * w; A.bladeW += w; }
  if (k.edge) { A.bladeEdge.x += k.edge[0] * w; A.bladeEdge.y += k.edge[1] * w; A.bladeEdge.z += k.edge[2] * w; }
  A.twoHand += k.two * w;
}
/** blend a timeline [[u, key, ease?], ...] at u: the ease is the one of the segment arriving at that key */
function track(A, keys, u) {
  if (u <= keys[0][0]) return add(A, keys[0][1], 1);
  for (let i = 1; i < keys.length; i++) {
    const [u1, k1, e] = keys[i];
    if (u <= u1) { const [u0, k0] = keys[i - 1], s = (e || ease.inOutQuad)(clamp((u - u0) / Math.max(1e-4, u1 - u0))); add(A, k0, 1 - s); add(A, k1, s); return; }
  }
  add(A, keys[keys.length - 1][1], 1);
}
const out = ease.outCubic, snap = t => 1 - Math.pow(1 - t, 4), io = ease.inOutQuad, inq = ease.inQuad, lin = ease.linear;

// ------------------------------------------------------------------ key poses
// a two-handed guard at the belly, the blade up at the foe (chūdan)
const CHUDAN = K({ armR: [-0.7, 0, 0.95], foreR: [-0.75, 0, 0.35], dir: [0.85, 0.5, 0], edge: [0, -1, 0], two: 1, body: [0.06, 0, 0], legL: [-0.25], legR: [0.2], armLock: 1 });
// cut 1: kesa-giri, from hassō (both paws by the right shoulder, the blade standing up behind) down across to the left hip
const HASSO = K({ armR: [-1.0, 0, 0.25], foreR: [-1.3, 0, 0.2], dir: [-0.25, 0.95, -0.2], edge: [1, 0, 0], two: 1, body: [-0.05, -0.35, 0], head: [0, 0.3, 0], legL: [-0.35], legR: [0.3], sq: 0.05, armLock: 1 });
const KESA_MID = K({ armR: [-1.0, 0, 0.7], foreR: [-0.8, 0, 0.3], dir: [0.85, 0.3, 0.2], edge: [0.2, -0.7, 0.7], two: 1, body: [0.12, 0.1, 0], legL: [-0.45], legR: [0.4], armLock: 1 });
const KESA_END = K({ armR: [-0.55, 0, 1.0], foreR: [-0.4, 0, 0.25], dir: [0.55, -0.55, 0.6], edge: [0.2, -0.7, 0.7], two: 1, body: [0.25, 0.45, 0], head: [0.05, -0.35, 0], legL: [-0.5], legR: [0.45], sq: -0.06, lean: 0.06, y: -0.04, armLock: 1 });
// cut 2: a rising one-handed backhand, low left up to high right, the free paw flung out for balance
const LOW_LEFT = K({ armR: [-0.5, 0, 1.15], foreR: [-0.6, 0, 0.5], dir: [-0.45, -0.35, 0.8], edge: [0, 0.7, -0.7], body: [0.2, 0.5, 0], head: [0, -0.35, 0], armL: [-0.3, 0, 0.35], legL: [-0.45], legR: [0.4], sq: 0.06, armLock: 1 });
const RISE_MID = K({ armR: [-1.1, 0, 0.2], foreR: [-0.5, 0, 0.2], dir: [0.9, 0.1, 0.3], edge: [0, 0.7, -0.7], body: [0.05, 0, 0], armL: [-0.6, 0, 0.2], foreL: [-0.6, 0, 0], legL: [-0.3], legR: [0.3], armLock: 1 });
const HIGH_RIGHT = K({ armR: [-1.6, 0, -0.7], foreR: [-0.3, 0, 0], dir: [0.4, 0.72, -0.57], edge: [0, 0.7, -0.7], body: [-0.08, -0.5, 0], head: [-0.05, 0.3, 0], armL: [-0.9, 0, -0.25], foreL: [-1.2, 0, 0], legL: [-0.2], legR: [0.25], sq: -0.07, y: 0.03, armLock: 1 });
// cut 3: the big two-handed sweep, the blade laid back past the right shoulder, then all the way across to the left
const LAID_BACK = K({ armR: [-1.1, 0, 0.3], foreR: [-1.0, 0, -0.2], dir: [-0.85, 0.25, -0.45], edge: [0.3, 0, 1], two: 1, body: [-0.05, -0.6, 0], head: [0, 0.5, 0], legL: [-0.3], legR: [0.3], sq: 0.08, y: -0.03, armLock: 1 });
const SWEEP_MID = K({ armR: [-1.3, 0, 0.6], foreR: [-0.6, 0, 0.1], dir: [0.8, 0.05, -0.6], edge: [0.3, 0, 1], two: 1, body: [0.1, 0, 0], legL: [-0.5], legR: [0.45], armLock: 1 });
const SWEPT = K({ armR: [-1.3, 0, 1.15], foreR: [-0.3, 0, 0.3], dir: [0.45, 0, 0.9], edge: [-0.6, 0, 0.8], two: 1, body: [0.22, 0.65, 0], head: [0, -0.5, 0], legL: [-0.65], legR: [0.55], sq: -0.08, y: -0.08, lean: 0.08, armLock: 1 });

// iai: the paw on the hilt at the left hip, crouched, eyes on the foe (the blade, if out, lies back along the hip)
const IAI = K({ armR: [-0.35, 0, 1.25], foreR: [-0.9, 0, 0.6], dir: [-0.75, -0.22, 0.62], edge: [0, 1, 0], armL: [-0.25, 0, -0.25], foreL: [-0.55, 0, -0.3], body: [0.32, 0.38, 0], head: [-0.12, -0.4, 0], legL: [-0.5, 0, 0.12], legR: [0.45, 0, -0.12], sq: 0.12, y: -0.07, armLock: 1 });
// the draw: out of the hip, across the front, and the free paw slaps onto the hilt as it finishes (two-handed)
const IAI_MID = K({ armR: [-0.9, 0, 0.8], foreR: [-0.5, 0, 0.3], dir: [0.9, 0.1, 0.35], edge: [0, 0, -1], armL: [-0.2, 0, -0.2], body: [0.25, 0, 0], legL: [-0.55, 0, 0.1], legR: [0.5, 0, -0.1], sq: 0.04, y: -0.06, armLock: 1 });
const DRAWN = K({ armR: [-1.45, 0, 0.15], foreR: [-0.25, 0, 0.05], dir: [0.55, 0.1, -0.83], edge: [-0.3, 0, -1], two: 1, body: [0.14, -0.45, 0], head: [0, 0.35, 0], legL: [-0.6, 0, 0.1], legR: [0.5, 0, -0.1], sq: -0.07, y: -0.05, lean: 0.06, armLock: 1 });

// the sheathing flourish: the blade turned back to the saya at the left hip, the free paw at the mouth
const NOTO_IN = K({ armR: [-0.45, 0, 1.25], foreR: [-0.9, 0, 0.6], dir: [-0.88, -0.32, 0.3], edge: [-0.2, 0.97, 0.1], armL: [-0.2, 0, -0.35], foreL: [-0.6, 0, -0.3], body: [0.1, 0.25, 0], head: [0.15, -0.2, 0], armLock: 1 });
// (NOTO_HOME's dir / edge: the samurai model's saya axis and edge-up, export/saya_mount.json in his frame: the hand-off to the sheathed hilt is seamless)
const NOTO_HOME = K({ armR: [-0.3, 0, 1.15], foreR: [-0.7, 0, 0.5], dir: [-0.84, -0.47, 0.27], edge: [-0.45, 0.88, 0.14], armL: [-0.2, 0, -0.35], foreL: [-0.55, 0, -0.3], body: [0.16, 0.2, 0], head: [0.28, -0.15, 0], eyesClosed: 1, armLock: 1 });
// chiburi: the flick that shakes the blade clean (no saya): up by the temple, then snapped down and out to the right
const FLICK_UP = K({ armR: [-1.6, 0, -0.25], foreR: [-1.2, 0, 0], dir: [0.2, 0.9, -0.3], edge: [1, 0, 0], body: [0, -0.2, 0], armLock: 1 });
const FLICK_DOWN = K({ armR: [-0.5, 0, -0.6], foreR: [-0.05, 0, 0], dir: [0.6, -0.55, -0.55], edge: [0, -1, 0], body: [0.06, 0.15, 0], head: [0.1, 0, 0], sq: -0.04, armLock: 1 });

// Kiai!: the breath in (the blade up in hassō), then the shout: chest out, head up, the katana thrust high in one paw,
// the other fist pumped back, feet planted wide
const KIAI_IN = K({ armR: [-1.1, 0, 0.35], foreR: [-1.25, 0, 0.2], dir: [0.1, 0.98, -0.1], edge: [1, 0, 0], two: 1, body: [-0.12, 0, 0], head: [-0.2, 0, 0], sq: 0.06, legL: [0, 0, 0.12], legR: [0, 0, -0.12], armLock: 1 });
const KIAI = K({ armR: [-2.6, 0, 0.1], foreR: [-0.3, 0, 0], dir: [0.25, 0.97, 0], edge: [1, 0, 0], armL: [0.5, 0, 0.55], foreL: [-1.1, 0, 0], body: [-0.22, 0, 0], head: [-0.38, 0, 0], sq: -0.1, y: 0.05, legL: [0, 0, 0.32], legR: [0, 0, -0.32], mouth: 1, earKick: 3, armLock: 1 });

// Flash Draw: through the foes in one low stride, the blade out to the side behind him
const FLASH = K({ armR: [-1.2, 0, -1.1], foreR: [-0.1, 0, 0], dir: [-0.75, 0, -0.65], edge: [0, 0, -1], armL: [0.6, 0, 0.3], body: [0.55, -0.3, 0], head: [-0.4, 0.3, 0], legL: [-0.95], legR: [0.85], sq: 0.08, y: -0.08, armLock: 1 });

// Whirlwind Stance: planted wide and low, both paws on the hilt, the blade level out to his right; the upper body turns
// (A.spin) while the legs stay planted, so the blade sweeps round him (its direction turns with him: the pose below)
const WHIRL = K({ armR: [-0.85, 0, 0.6], foreR: [-0.55, 0, 0.2], two: 1, body: [0.12, 0, 0], head: [0.08, 0, 0], legL: [-0.15, 0, 0.32], legR: [0.15, 0, -0.32], y: -0.07, sq: 0.08, armLock: 1 });
const WHIRL_DIR = [0.3, 0.06, -0.95]; // (in his turning body's frame: out to the right, a touch ahead and up)
// Helmet Splitter: the katana low behind in the crouch, raised high in both paws for the leap, then split down
const SPLIT_CROUCH = K({ armR: [0.25, 0, -0.25], foreR: [-0.3, 0, 0], dir: [-0.7, -0.45, -0.5], edge: [0, -1, 0], body: [0.32, -0.2, 0], head: [-0.15, 0.2, 0], legL: [-0.45], legR: [0.35], sq: 0.15, y: -0.07, armLock: 1 });
const SPLIT_HIGH = K({ armR: [-2.3, 0, 0.6], foreR: [-0.7, 0, 0.3], dir: [-0.55, 0.83, -0.05], edge: [1, 0, 0], two: 1, body: [-0.18, 0, 0], head: [-0.2, 0, 0], legL: [-0.65], legR: [-0.45], sq: -0.07, armLock: 1 });
const SPLIT_PEAK = K({ armR: [-2.45, 0, 0.55], foreR: [-0.8, 0, 0.3], dir: [-0.75, 0.66, 0], edge: [1, 0, 0], two: 1, body: [-0.24, 0, 0], head: [-0.22, 0, 0], legL: [-0.55], legR: [-0.35], sq: -0.08, armLock: 1 });
const SPLIT_DOWN = K({ armR: [-0.6, 0, 0.95], foreR: [-0.4, 0, 0.25], dir: [0.75, -0.66, 0.05], edge: [0.3, -1, 0], two: 1, body: [0.38, 0, 0], head: [0.18, 0, 0], legL: [-0.55], legR: [0.45], sq: 0.18, y: -0.05, armLock: 1 });
// Sakura Storm: the blade raised high in salute as the spectral blades come up round him
const STORM_IN = K({ armR: [-1.1, 0, 0.35], foreR: [-1.25, 0, 0.2], dir: [0.1, 0.98, -0.1], edge: [1, 0, 0], two: 1, body: [-0.06, 0, 0], sq: 0.05, armLock: 1 });
const STORM = K({ armR: [-2.55, 0, 0.15], foreR: [-0.3, 0, 0], dir: [0.18, 0.98, 0], edge: [1, 0, 0], armL: [-0.4, 0, -0.75], foreL: [-1.1, 0, 0], body: [-0.16, 0, 0], head: [-0.3, 0, 0], sq: -0.09, y: 0.04, eyesHappy: 1, armLock: 1 });
// Pack Call: the katana thrust forward and up — "Go!" — the free fist at the hip, calling
const CALL_IN = K({ armR: [-1.0, 0, -0.2], foreR: [-1.2, 0, 0], dir: [-0.3, 0.9, -0.2], edge: [1, 0, 0], armL: [0.2, 0, 0.3], body: [-0.08, -0.25, 0], sq: 0.05, armLock: 1 });
const CALL = K({ armR: [-1.55, 0, 0.15], foreR: [-0.1, 0, 0], dir: [0.95, 0.28, 0.05], edge: [0, -1, 0], armL: [0.25, 0, 0.45], foreL: [-1.0, 0, 0], body: [0.14, 0.2, 0], head: [-0.15, 0, 0], legL: [-0.4], legR: [0.3], sq: -0.06, mouth: 1, earKick: 2, armLock: 1 });
// War Banner Howl: the left paw plants the banner, chest out, head thrown back, the katana raised: the howl
const WAR_IN = K({ armR: [-1.1, 0, 0.35], foreR: [-1.25, 0, 0.2], dir: [0.1, 0.98, -0.1], edge: [1, 0, 0], armL: [-0.9, 0, 0.5], foreL: [-0.6, 0, 0], body: [-0.1, 0, 0], head: [-0.15, 0, 0], sq: 0.06, armLock: 1 });
const WAR = K({ armR: [-2.5, 0, 0.1], foreR: [-0.3, 0, 0], dir: [0.3, 0.95, 0], edge: [1, 0, 0], armL: [-0.75, 0, 0.75], foreL: [-0.3, 0, 0], body: [-0.24, 0, 0], head: [-0.55, 0, 0], sq: -0.1, y: 0.04, legL: [0, 0, 0.25], legR: [0, 0, -0.25], mouth: 1, earKick: 3, armLock: 1 });
// Moonlit Blades: the howl to the moon, the katana pointed straight at it, the free paw on his heart
const MOON = K({ armR: [-2.6, 0, 0.25], foreR: [-0.25, 0, 0], dir: [0.05, 1, 0], edge: [1, 0, 0], armL: [-0.7, 0, -0.55], foreL: [-1.2, 0, 0], body: [-0.28, 0, 0], head: [-0.62, 0, 0], sq: -0.1, y: 0.05, mouth: 1, earKick: 2.5, armLock: 1 });
// Unbending Stance: a block catches the blow on the blade, held level across the body (a quick parry)
const PARRY = K({ armR: [-1.2, 0, 0.8], foreR: [-0.7, 0, 0.3], dir: [0.15, 0.25, 0.96], edge: [1, 0.3, 0], two: 1, body: [-0.1, 0, 0], legL: [-0.3], legR: [0.35], sq: 0.08, y: -0.03, armLock: 1 });

const act = (dur, ev, keys, extra) => ({ dur, ev, pose: (t, P, A) => { track(A, keys, t); extra?.(t, A); } });
/** these replace the Animator's generic actions of the same name: only Chewy's skills play them (Whirlwind Stance's
 *  channel and Helmet Splitter's leap keep their names, so the channel / leap plumbing and the QA read them as before) */
export const SAMURAI_OVERRIDES = {
  spin: { dur: 99, hold: true, pose: (t, P, A) => {
    const e = ease.outCubic(clamp(t / 0.15)), s = t * 16, c = Math.cos(s), sn = Math.sin(s);
    add(A, WHIRL, e); A.spin = s;
    const [f0, u0, l0] = WHIRL_DIR;
    A.bladeDir.x += (f0 * c - l0 * sn) * e; A.bladeDir.y += u0 * e; A.bladeDir.z += (f0 * sn + l0 * c) * e; A.bladeW += e;
    A.bladeEdge.x += (-f0 * sn - l0 * c) * e; A.bladeEdge.z += (f0 * c - l0 * sn) * e; // (the edge leads the turn)
    A.y += Math.sin(t * 9) * 0.015 * e; A.earKick += 1.2 * e;
  } },
  slam: act(0.8, { impact: 0.62 }, [[0, REST], [0.16, SPLIT_CROUCH, out], [0.3, SPLIT_HIGH, out], [0.55, SPLIT_PEAK, io], [0.62, SPLIT_DOWN, ease.inCubic], [0.74, SPLIT_DOWN], [1, REST, io]], (t, A) => {
    const jump = clamp((t - 0.18) / 0.44), land = clamp((t - 0.62) / 0.1);
    A.y += Math.sin(jump * Math.PI) * 0.9 * (1 - land);
  }),
};
export const SAMURAI_ACTIONS = {
  // ---- the basic-attack combo (skillRunner.cast_attack: one cut per attack, the same speed and hit frame as before)
  cut1: act(0.46, { hit: 0.42 }, [[0, REST], [0.32, HASSO, out], [0.42, KESA_MID, inq], [0.5, KESA_END, snap], [0.66, KESA_END], [1, REST, io]]),
  cut2: act(0.46, { hit: 0.42 }, [[0, REST], [0.32, LOW_LEFT, out], [0.42, RISE_MID, inq], [0.5, HIGH_RIGHT, snap], [0.66, HIGH_RIGHT], [1, REST, io]]),
  cut3: act(0.46, { hit: 0.42 }, [[0, REST], [0.32, LAID_BACK, out], [0.42, SWEEP_MID, inq], [0.5, SWEPT, snap], [0.7, SWEPT], [1, REST, io]]),
  // ---- Crescent Chomp: the iai draw-cut (its charge holds the IAI key: chargePoses.js 'iai')
  iaiCut: act(0.46, { draw: 0.36, hit: 0.42 }, [[0, REST], [0.28, IAI, out], [0.34, IAI], [0.42, IAI_MID, inq], [0.5, DRAWN, snap], [0.7, DRAWN], [1, REST, io]]),
  // ---- the end of a combo: sheathe it (a model with a saya: 'click' puts the katana away) or flick it clean
  noto: act(0.8, { click: 0.7 }, [[0, REST], [0.3, NOTO_IN, io], [0.7, NOTO_HOME, inq], [0.82, NOTO_HOME], [1, REST, io]]),
  chiburi: act(0.55, { flick: 0.42 }, [[0, REST], [0.3, FLICK_UP, io], [0.42, FLICK_DOWN, snap], [0.72, FLICK_DOWN], [1, REST, io]]),
  // ---- Kiai!: the battle cry (the bark's timing: its event is still called 'bark')
  kiai: act(0.5, { bark: 0.28 }, [[0, REST], [0.25, KIAI_IN, out], [0.32, KIAI, snap], [0.72, KIAI], [1, REST, io]], (t, A) => { if (t > 0.3 && t < 0.75) A.earKick += 2 * Math.sin(t * 40); }),
  // ---- Flash Draw: the dash (played at the dash's own length, skillRunner.cast_zoom)
  flashDraw: act(0.3, null, [[0, IAI], [0.18, FLASH, snap], [1, FLASH, lin]]),
  // ---- Sakura Storm (the 'cast' it replaced kept no events: the storm starts with the cast)
  stormCall: act(0.55, null, [[0, REST], [0.3, STORM_IN, out], [0.45, STORM, snap], [0.75, STORM], [1, REST, io]]),
  // ---- Pack Call, War Banner Howl, Moonlit Blades (the bark's timing: 'bark' at 0.28, the summon / rally / moonfall)
  command: act(0.5, { bark: 0.28 }, [[0, REST], [0.22, CALL_IN, out], [0.3, CALL, snap], [0.72, CALL], [1, REST, io]]),
  warCry: act(0.5, { bark: 0.28 }, [[0, REST], [0.24, WAR_IN, out], [0.32, WAR, snap], [0.75, WAR], [1, REST, io]], (t, A) => { if (t > 0.3 && t < 0.78) A.earKick += 2 * Math.sin(t * 36); }),
  moonCall: act(0.5, { bark: 0.28 }, [[0, REST], [0.24, STORM_IN, out], [0.32, MOON, snap], [0.75, MOON], [1, REST, io]]),
  // ---- Unbending Stance: a quick parry when a block lands (cut short by anything)
  parry: act(0.32, null, [[0, REST], [0.25, PARRY, snap], [0.6, PARRY], [1, REST, io]]),
};
/** actions that root him (no walking out of a cut) */
export const SAMURAI_ROOTED = ['cut1', 'cut2', 'cut3', 'iaiCut', 'kiai', 'stormCall', 'command', 'warCry', 'moonCall'];
/** the sword cuts the melee assist tracks (skillRunner.updateMelee) */
export const SAMURAI_CUTS = new Set(['cut1', 'cut2', 'cut3', 'iaiCut']);
/** the flourishes: anything cuts them short, and they don't make the next cast wait */
export const SAMURAI_FLOURISH = new Set(['noto', 'chiburi', 'parry']);
/** the keys, for the charge wind-ups (chargePoses.js) */
export const SAMURAI_KEYS = { IAI, HASSO, KIAI_IN, CHUDAN, WHIRL, WHIRL_DIR, SPLIT_CROUCH, STORM_IN, WAR_IN, add };
