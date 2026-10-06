// SkeletonUtils.clone without the userData JSON round trip on live three objects.
//
// Object3D.copy deep-copies userData with JSON.parse(JSON.stringify(...)). A hero rig node whose userData holds a three
// object (the ear joints' `tip` Group, Moka's staff `orb` Mesh, Poe's fūma holders' `mat`) is then serialised through
// toJSON, which calls Matrix4.toArray() into plain JS arrays. V8's keyed-store feedback inside Matrix4.toArray goes
// generic after that, so every later Skeleton.update and InstancedMesh.setMatrixAt in the session runs 10-20x slower
// (0.7 ms a frame in a 150-monster fight). Each clone also wrote about 50 KB of JSON.
//
// Here those values are lifted out (set to undefined, which JSON skips) for the clone and put back afterwards. On the
// copy, an Object3D inside the cloned tree maps to its copied node; anything else keeps the same reference. Plain data
// is still deep-copied as before. Rendering is unchanged: userData plays no part in drawing.
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

const live = v => !!v && typeof v === 'object' && !!(v.isObject3D || v.isMaterial || v.isBufferGeometry || v.isTexture);

export function cloneSkinnedSafe(src) {
  const lifted = [];
  src.traverse(o => { const U = o.userData; for (const k in U) if (live(U[k])) { lifted.push(o, k, U[k]); U[k] = undefined; } });
  if (!lifted.length) return cloneSkinned(src);
  let root;
  try { root = cloneSkinned(src); } finally { for (let i = 0; i < lifted.length; i += 3) lifted[i].userData[lifted[i + 1]] = lifted[i + 2]; }
  const a = [], b = []; src.traverse(o => a.push(o)); root.traverse(o => b.push(o));
  const map = new Map(); for (let i = 0; i < a.length && i < b.length; i++) map.set(a[i], b[i]);
  for (let i = 0; i < lifted.length; i += 3) {
    const v = lifted[i + 2], d = map.get(lifted[i]);
    if (d) d.userData[lifted[i + 1]] = v.isObject3D ? (map.get(v) || v) : v;
  }
  return root;
}
