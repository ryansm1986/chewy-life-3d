// Wind-up poses for charged abilities (docs/CHARGE.md §1), merged into animator.js' ACTIONS as 'charge'.
// combat/charge.js plays 'charge' (a held action: the hero can still walk, slowly) and writes the charge state onto
// the action every frame: a.style (the pose family), a.k (0..1 of the whole charge), a.pulse (1 at a stage, decaying),
// a.full (held at the last stage). Each family holds the wound-back frame of the action its release plays (swing at
// u≈0.3, throw at u≈0.36, staffCast at u≈0.45 …) so the release snaps straight into the strike, and adds a coil that
// deepens with the charge, a tremble when it's full, and a little hop at each stage.
import { clamp, ease } from '../core/util.js';
import { SAMURAI_KEYS as SK } from './samuraiPoses.js';

const POSES = {
  // ---- Chewy the samurai (samuraiPoses.js keys): each holds the frame its release starts from
  // iai: the paw on the hilt at the left hip, sinking lower and leaning in as it fills (Crescent Chomp → iaiCut at 0.3)
  iai(t, k, A, e) {
    SK.add(A, SK.IAI, e);
    A.sq += 0.06 * k * e; A.y += -0.04 * k * e; A.body.x += 0.08 * k * e; A.legL.x += -0.12 * k * e; A.legR.x += 0.12 * k * e;
    A.head.x += -0.05 * k * e; A.earKick += -0.5 * k * e;
  },
  // the same draw stance, but coiled lower and further forward for a dash (Flash Draw)
  iaiDash(t, k, A, e) {
    SK.add(A, SK.IAI, e);
    A.sq += (0.06 + 0.08 * k) * e; A.y += (-0.03 - 0.05 * k) * e; A.body.x += (0.12 + 0.1 * k) * e; A.legL.x += (-0.2 - 0.15 * k) * e; A.legR.x += (0.2 + 0.15 * k) * e;
    A.earKick += -0.8 * k * e;
  },
  // Whirlwind Stance's wind-up: settling into the planted two-handed stance, coiling back against the coming turn
  stance(t, k, A, e) {
    SK.add(A, SK.WHIRL, e);
    const [f0, u0, l0] = SK.WHIRL_DIR, s = -0.5 * k; // (coiled: the blade drawn back the other way)
    A.bladeDir.x += (f0 * Math.cos(s) - l0 * Math.sin(s)) * e; A.bladeDir.y += u0 * e; A.bladeDir.z += (f0 * Math.sin(s) + l0 * Math.cos(s)) * e; A.bladeW += e;
    A.body.y += s * e; A.head.y += -s * 0.8 * e; A.sq += 0.05 * k * e; A.y += -0.03 * k * e; A.legL.z += 0.06 * k * e; A.legR.z += -0.06 * k * e;
  },
  // Helmet Splitter's wind-up: crouched over the katana held low behind, ready to spring
  splitter(t, k, A, e) {
    SK.add(A, SK.SPLIT_CROUCH, e);
    A.sq += 0.06 * k * e; A.y += -0.04 * k * e; A.body.x += 0.1 * k * e; A.legL.x += -0.12 * k * e; A.legR.x += 0.1 * k * e; A.earKick += -0.6 * k * e;
  },
  // Sakura Storm's wind-up: the katana up in salute, standing tall as the petals gather
  storm(t, k, A, e) {
    SK.add(A, SK.STORM_IN, e);
    A.body.x += -0.08 * k * e; A.head.x += -0.12 * k * e; A.sq += -0.05 * k * e; A.y += (0.03 + 0.02 * Math.sin(t * 3)) * k * e;
  },
  // Pack Call / War Banner Howl / Moonlit Blades: the deep breath before the call, the katana up
  warCry(t, k, A, e) {
    SK.add(A, SK.WAR_IN, e);
    A.body.x += -0.1 * k * e; A.head.x += -0.2 * k * e; A.sq += -0.06 * k * e; A.y += 0.03 * k * e; A.earKick += 1.4 * k * e;
  },
  // Kiai!'s breath: the katana up in hassō, chest swelling, head back (→ kiai at 0.22)
  kiai(t, k, A, e) {
    SK.add(A, SK.KIAI_IN, e);
    A.body.x += -0.1 * k * e; A.head.x += -0.15 * k * e; A.sq += -0.06 * k * e; A.y += 0.03 * k * e; A.earKick += 1.2 * k * e;
    A.legL.z += 0.08 * k * e; A.legR.z += -0.08 * k * e;
  },
  // a sword drawn back over the shoulder (swing's wind-up)
  sword(t, k, A, e) {
    // (a held twist reads as 'turned away' from the iso camera: a smaller coil than swing's, the head kept on the target)
    const tw = 0.34 + 0.12 * k;
    A.armR.x += -2.5 * e - 0.3 * k; A.armR.z += (-0.5 - 0.15 * k) * e; A.armL.x += (-0.4 + 0.5 * k) * e; A.armL.z += 0.35 * e;
    A.body.y += tw * e; A.head.y += -tw * 0.85 * e; A.body.x += -0.1 * k * e;
    A.sq += (0.05 + 0.09 * k) * e; A.y += -0.03 * k * e; A.legL.x += 0.25 * k * e; A.legR.x += -0.2 * k * e;
  },
  // the ball cocked behind the head, the other paw aiming (throw's wind-up)
  ball(t, k, A, e) {
    const tw = 0.32 + 0.12 * k;
    A.armR.x += -2.9 * e - 0.2 * k; A.armR.z += -0.3 * e; A.armL.x += (0.9 + 0.35 * k) * e; A.armL.z += 0.15 * k * e;
    A.body.y += tw * e; A.head.y += -tw * 0.85 * e; A.body.x += (-0.1 - 0.1 * k) * e;
    A.sq += (0.05 + 0.07 * k) * e; A.legL.x += 0.2 * k * e; A.legR.x += -0.25 * k * e;
  },
  // the staff raised high, water / stars gathering at its orb (staffCast's wind-up), floating a little on the magic
  staff(t, k, A, e) {
    A.armR.x += (-2.7 - 0.15 * k) * e; A.armR.z += 0.3 * e; A.armL.x += (-0.9 + 0.35 * k) * e; A.armL.z += (0.55 + 0.2 * k) * e;
    A.body.x += -0.1 * e; A.body.y += 0.15 * e; A.head.x += (-0.18 - 0.1 * k) * e;
    A.sq += (0.07 - 0.04 * k) * e; A.y += (0.04 + 0.06 * k + 0.025 * Math.sin(t * 3.2)) * k * e;
    A.earKick += (0.6 * k + 0.25 * Math.sin(t * 5)) * e; A.tailWag = 1.5;
  },
  // a low crouch before a leap / dash / hop
  crouch(t, k, A, e) {
    A.sq += (0.1 + 0.14 * k) * e; A.y += -0.06 * k * e; A.body.x += (0.25 + 0.15 * k) * e;
    A.armR.x += (0.5 + 0.4 * k) * e; A.armL.x += (0.5 + 0.4 * k) * e; A.armR.z += -0.2 * e; A.armL.z += 0.2 * e;
    A.legL.x += -0.35 * k * e; A.legR.x += 0.25 * k * e; A.head.x += -0.12 * k * e; A.earKick += -0.6 * k * e;
  },
  // a big breath before a bark / howl: chest out, head back, paws braced
  breath(t, k, A, e) {
    A.head.x += (-0.25 - 0.25 * k) * e; A.body.x += (-0.12 - 0.12 * k) * e; A.sq += (-0.04 - 0.08 * k) * e;
    A.armR.x += -0.5 * k * e; A.armL.x += -0.5 * k * e; A.armR.z += 0.45 * k * e; A.armL.z += -0.45 * k * e;
    A.y += 0.03 * k * e; A.earKick += 1.2 * k * e;
  },
  // both paws (and the staff) to the sky
  sky(t, k, A, e) {
    A.armR.x += (-2.8 - 0.2 * k) * e; A.armL.x += (-2.6 - 0.2 * k) * e; A.armR.z += 0.35 * e; A.armL.z += -0.35 * e;
    A.head.x += (-0.35 - 0.1 * k) * e; A.sq += (-0.06 - 0.04 * k) * e; A.y += 0.05 * k * e; A.body.x += -0.12 * e; A.earKick += 1.5 * k * e;
  },
  // a slow staff twirl that speeds up (the summons)
  twirl(t, k, A, e) {
    const w = t * (3 + 7 * k);
    A.armR.x += (-1.6 + Math.sin(w) * 0.5) * e; A.armR.z += Math.cos(w) * 0.6 * e; A.armL.z += -0.6 * e; A.armL.x += -0.3 * e;
    A.body.y += Math.sin(w * 0.5) * 0.12 * k * e; A.sq += 0.04 * k * e; A.happy = 1; A.tailWag = 2.5;
  },
  // the duck call at the lips, the other arm flung wide to call the flock, head back, up on her toes
  // (a big silhouette change: it has to read past Moka's hat from the high camera)
  call(t, k, A, e) {
    const bob = Math.sin(t * (6 + 6 * k)) * 0.06 * k;
    A.armR.x += -1.55 * e; A.armR.z += 1.15 * e; A.armL.x += (-1.4 - 0.5 * k) * e; A.armL.z += (-1.35 - 0.25 * k) * e;
    A.head.x += (-0.3 - 0.25 * k + bob) * e; A.body.x += (-0.12 - 0.1 * k) * e; A.sq += (-0.07 - 0.06 * k) * e; A.y += (0.05 + 0.05 * k) * e;
    A.earKick += (1.5 + k) * e; A.legL.x += 0.15 * k * e;
  },
  // a wide braced stance, arms flung out, shivering harder as it fills (water flicks off her: chargeFx gatherStyle)
  shake(t, k, A, e) {
    const w = Math.sin(t * (30 + 30 * k)) * (0.06 + 0.16 * k);
    A.sq += (0.12 + 0.08 * k) * e; A.y += -0.04 * k * e; A.head.x += 0.2 * e; A.body.y += w * e; A.head.y += -w * 1.2 * e;
    A.armR.x += -0.5 * e; A.armL.x += -0.5 * e; A.armR.z += (1.15 + 0.2 * k + w) * e; A.armL.z += (-1.15 - 0.2 * k + w) * e;
    A.legL.z += 0.25 * e; A.legR.z += -0.25 * e;
    A.earKick += w * 7 * e; A.eyesClosed = k > 0.5 ? 1 : 0;
  },
  // the staff held high, blowing a bubble from its orb (bubbles stream off it: chargeFx gatherStyle), the free paw out
  bubble(t, k, A, e) {
    A.armR.x += (-2.55 - 0.2 * k) * e; A.armR.z += 0.45 * e; A.armL.x += (-0.8 - 0.4 * k) * e; A.armL.z += (-1 - 0.2 * k) * e;
    A.head.x += (-0.3 - 0.1 * k) * e; A.body.x += -0.08 * e; A.sq += (-0.05 - 0.06 * k) * e; A.y += 0.04 * k * e;
    A.mouth = Math.max(A.mouth, 0.5 * e); A.earKick += 0.8 * k * e;
  },
  // the Moonbeam / Whirlwind Stance channels keep their own action; these only exist for completeness
  beam(t, k, A, e) { POSES.sky(t, k, A, e); },
  spin(t, k, A, e) { POSES.stance(t, k, A, e); },
};

export const CHARGE_ACTIONS = {
  charge: { dur: 99, hold: true, pose: (t, P, A, a) => {
    const k = clamp(a?.k ?? 0), e = ease.outCubic(clamp(t / 0.16)), f = POSES[a?.style] || POSES.sword;
    f(t, k, A, e);
    const pulse = a?.pulse || 0;
    A.sq += -0.09 * pulse; A.y += 0.07 * pulse * e;
    if (a?.full) { const tr = Math.sin(t * 42) * 0.03; A.armR.x += tr; A.armL.x -= tr * 0.6; A.sq += Math.abs(tr) * 0.6; }
  } },
};
export const POSE_STYLES = Object.keys(POSES);
/** more wind-up families from another module (Poe's: actors/poePoses.js POE_CHARGE_POSES), merged in by name */
export function addChargePoses(more) { for (const k in more) { if (!POSES[k]) POSES[k] = more[k]; if (!POSE_STYLES.includes(k)) POSE_STYLES.push(k); } }
