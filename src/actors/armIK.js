// The free paw on the katana hilt (Chewy's two-handed cuts, docs/HEROES.md): a two-bone reach for the upper arm and
// forearm of a baked hero (bones at rest have no rotation, actors/heroModels.js), or a one-bone aim for a kit rig
// (no forearm). The Animator poses the arm first (FK); reach() then turns it so the palm lands on the target, blended
// by w (0..1): the poses fade a paw onto the hilt and off again. No allocations: every temp is module-level.
import * as THREE from 'three';

const _S = new THREE.Vector3(), _E = new THREE.Vector3(), _H = new THREE.Vector3(), _T = new THREE.Vector3();
const _n = new THREE.Vector3(), _m = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3(), _e2 = new THREE.Vector3();
const _qd = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _ql = new THREE.Quaternion(), _q0 = new THREE.Quaternion();

/** turn bone (world-space delta qd applied to its world rotation), blended by w */
function turn(bone, qd, w) {
  bone.getWorldQuaternion(_qw); bone.parent.getWorldQuaternion(_qp);
  _ql.copy(_qp).invert().multiply(_qd.copy(qd).multiply(_qw)); // local = parent⁻¹ · qd · world
  _q0.copy(bone.quaternion);
  bone.quaternion.copy(_q0).slerp(_ql, w);
  bone.updateMatrixWorld(true);
}

/**
 * Reach the paw (palm group `hand`, under `fore` under `upper`) to world point `target`. The elbow bends toward
 * where the FK pose already had it (or down and out). Call after the rig's world matrices are current.
 */
export function reach(upper, fore, hand, target, w = 1) {
  if (!upper || !hand || w <= 0.001) return;
  _T.copy(target);
  upper.getWorldPosition(_S); hand.getWorldPosition(_H);
  if (!fore) { // one bone: aim the whole arm
    _u.subVectors(_H, _S).normalize(); _w.subVectors(_T, _S).normalize();
    turn(upper, _qd.setFromUnitVectors(_u, _w), w);
    return;
  }
  fore.getWorldPosition(_E);
  const a = _S.distanceTo(_E), b = _E.distanceTo(_H);
  let d = _S.distanceTo(_T);
  if (a < 1e-5 || b < 1e-5) return;
  _n.subVectors(_T, _S).divideScalar(Math.max(d, 1e-5));
  d = Math.min(Math.max(d, Math.abs(a - b) + 1e-4), a + b - 1e-4);
  // the bend plane: the FK elbow's offset from the shoulder→target line (fallback: down)
  _m.subVectors(_E, _S); _m.addScaledVector(_n, -_m.dot(_n));
  if (_m.lengthSq() < 1e-8) _m.set(0, -1, 0).addScaledVector(_n, -_n.y);
  _m.normalize();
  const ca = (a * a + d * d - b * b) / (2 * a * d), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
  _e2.copy(_S).addScaledVector(_n, a * ca).addScaledVector(_m, a * sa); // the elbow's new place
  _u.subVectors(_E, _S).normalize(); _w.subVectors(_e2, _S).normalize();
  turn(upper, _qd.setFromUnitVectors(_u, _w), w);
  // then the forearm: from the (moved) elbow, point the paw at the target
  fore.getWorldPosition(_E); hand.getWorldPosition(_H);
  _u.subVectors(_H, _E).normalize(); _w.subVectors(_T, _E).normalize();
  turn(fore, _qd.setFromUnitVectors(_u, _w), w);
}
