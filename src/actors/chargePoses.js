// Wind-up poses for charged abilities (docs/CHARGE.md §1), merged into animator.js' ACTIONS as 'charge'.
// combat/charge.js plays 'charge' (a held action: the hero can still walk, slowly) and writes the charge state onto
// the action every frame: a.style (the pose family), a.k (0..1 of the whole charge), a.pulse (1 at a stage, decaying),
// a.full (held at the last stage). Each family holds the wound-back frame of the action its release plays (swing at
// u≈0.3, throw at u≈0.36, staffCast at u≈0.45 …) so the release snaps straight into the strike, and adds a coil that
// deepens with the charge, a tremble when it's full, and a little hop at each stage.
import { clamp, ease } from '../core/util.js';

const POSES = {
  // Bone Sword drawn back over the shoulder (swing's wind-up)
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
  // the duck call at the lips, cheeks puffing
  call(t, k, A, e) {
    A.armR.x += -1.35 * e; A.armR.z += 1.05 * e; A.armL.x += -0.9 * e; A.armL.z += -0.6 * e;
    A.head.x += (-0.15 - 0.15 * k) * e; A.sq += -0.05 * k * e; A.earKick += 1.5 * k * e;
  },
  // braced to shake, shivering harder as it fills
  shake(t, k, A, e) {
    const w = Math.sin(t * (30 + 30 * k)) * (0.05 + 0.12 * k);
    A.sq += (0.1 + 0.06 * k) * e; A.head.x += 0.2 * e; A.body.y += w * e; A.head.y += -w * 1.2 * e;
    A.armR.z += (0.6 + w) * e; A.armL.z += (-0.6 + w) * e; A.earKick += w * 6 * e; A.eyesClosed = k > 0.5 ? 1 : 0;
  },
  // the staff to the lips, blowing a bubble
  bubble(t, k, A, e) {
    A.armR.x += -1.5 * e; A.armR.z += 0.8 * e; A.armL.x += -1.1 * e; A.armL.z += -0.5 * e;
    A.head.x += -0.1 * e; A.sq += (-0.04 - 0.05 * k) * e; A.mouth = Math.max(A.mouth, 0.4 * e);
  },
  // the Moonbeam / Tail Spin channels keep their own action; these only exist for completeness
  beam(t, k, A, e) { POSES.sky(t, k, A, e); },
  spin(t, k, A, e) { POSES.sword(t, k, A, e); },
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
