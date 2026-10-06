// Crowd helpers for big fights (docs/ZONES.md §7, ROADMAP Z-B3 / Z-B4).
//  - crowdOf(mode): a floor's monster grid (bucketed by position, tracks the largest body radius). Rebuilt from
//    mode.monsters at the start of every monster pass and kept fresh by Monster.sync, so separate(), the chase surround
//    step and alert() read only nearby cells instead of every monster (no O(N²) per frame).
//  - updateMonsters(mode, dt): the frame's monster pass with AI LOD. A monster that is not aggroed, not a boss, more
//    than WAKE m from the hero and every ally, and off screen (outside the camera frustum, with slack) sleeps: it
//    updates every 4th frame with the time it missed. Its wake-up check (a target within 9 m) can't fire that far out,
//    and anything that hits it alerts it, so aggro near the hero feels the same; on screen nothing changes.
// `?nogrid` restores the monster scans (combat.js reads the same flag), `?nolod` updates everyone every frame.
import * as THREE from 'three';
import { Grid } from '../combat/grid.js';

const QS = typeof location !== 'undefined' ? location.search : '';
export const NOGRID = /[?&]nogrid\b/.test(QS);
const NOLOD = /[?&]nolod\b/.test(QS), GRIDCHECK = /[?&]gridcheck\b/.test(QS);
// Inside the monster pass every monster moves only in its own update, which ends in sync() → move(): the buckets are
// exact for everyone else, so PAD only covers the rare monster one AI shoves for another (a boss placing its copies).
export const PAD = 0.5;
const WAKE = 22, SLEEP_EVERY = 4;
const _fr = new THREE.Frustum(), _pm = new THREE.Matrix4(), _s = new THREE.Sphere();
const isBig = m => !!m.def?.boss || (m.bodyR || 0) > 1;

/** The floor's monster grid: 2 m cells over the normal bodies; bosses and other big bodies sit in a short list every
 *  query adds, so one Lord Karakasa doesn't widen everyone's search. Same API as a Grid (near / release / move …). */
class Crowd {
  constructor() { this.grid = new Grid(2, { radius: 'bodyR' }); this.big = []; this.bufs = []; this.depth = 0; this.stack = []; this.list = null; this.check = GRIDCHECK ? { n: 0, bad: 0 } : null; }
  get maxR() { return this.grid.maxR; }
  rebuild(list) {
    this.list = list;
    this.grid.rebuild(list, m => !isBig(m));
    this.big.length = 0; for (const m of list) if (isBig(m)) this.big.push(m);
  }
  move(m) {
    if (isBig(m)) { if (m[this.grid.prop] !== undefined) this.grid.remove(m); if (!this.big.includes(m)) this.big.push(m); }
    else this.grid.move(m);
  }
  remove(m) { this.grid.remove(m); const i = this.big.indexOf(m); if (i >= 0) this.big.splice(i, 1); }
  near(x, z, r) {
    const c = this.grid.near(x, z, r);
    if (!this.big.length) { this.stack.push(false); if (this.check) this.verify(x, z, r, c); return c; }
    const out = this.bufs[this.depth] ||= []; this.depth++; this.stack.push(true);
    out.length = 0; for (let i = 0; i < c.length; i++) out.push(c[i]);
    for (let i = 0; i < this.big.length; i++) out.push(this.big[i]);
    if (this.check) this.verify(x, z, r, out);
    return out;
  }
  // ?gridcheck: every live monster the caller's exact test could accept (within r - PAD) must be a candidate
  verify(x, z, r, got) {
    const C = this.check, R = r - PAD; C.n++;
    for (const m of this.list || []) if (m.alive && (m.pos.x - x) ** 2 + (m.pos.z - z) ** 2 < R * R && !got.includes(m)) { C.bad++; if (C.bad <= 5) console.warn('[gridcheck] crowd query missed a monster'); return; }
  }
  release() { if (this.stack.pop()) this.depth--; this.grid.release(); }
}

export function crowdOf(mode) { return mode._crowd ||= new Crowd(); }

export function updateMonsters(mode, dt) {
  const list = mode.monsters, G = mode.G;
  const g = crowdOf(mode);
  if (!NOGRID) g.rebuild(list);
  const run = mode._runList ||= [];
  run.length = 0; for (let i = 0; i < list.length; i++) run.push(list[i]); // (a monster's update may splice the list)
  const frame = mode._lodFrame = (mode._lodFrame || 0) + 1;
  let lod = !NOLOD && run.length > 24;
  let px = 0, pz = 0, allies = null;
  if (lod) {
    const P = G.player, cam = G.engine?.camera;
    if (!P || !cam) lod = false;
    else {
      px = P.pos.x; pz = P.pos.z;
      allies = mode.combat?.allies;
      _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); _fr.setFromProjectionMatrix(_pm);
    }
  }
  let slept = 0;
  for (let i = 0; i < run.length; i++) {
    const m = run[i];
    const sl = lod && m.alive && !m.aggro && !m.def.boss && sleepy(m, px, pz, allies);
    if (sl !== !!m._asleep) setAsleep(m, sl);
    if (sl) {
      m._lodDt = (m._lodDt || 0) + dt;
      if ((frame + (m._lodK ??= (Math.random() * SLEEP_EVERY) | 0)) % SLEEP_EVERY) { slept++; continue; }
      const d = Math.min(m._lodDt, 0.25); m._lodDt = 0;
      m.update(d);
      continue;
    }
    if (m._lodDt) { const d = Math.min(m._lodDt + dt, 0.25); m._lodDt = 0; m.update(d); continue; } // (just woke: catch up)
    m.update(dt);
  }
  mode.lodSlept = slept;
}
// An individually drawn model (a skinned humanoid) of a sleeping monster leaves the scene graph while it sleeps: it is off
// screen and far from everyone, and the scene walks (matrices, the AO pass's transparency renders, shadows) skip it.
function setAsleep(m, on) {
  m._asleep = on;
  const r = m.model?.root; if (!r || m.model.slots) return; // (instanced models cost nothing asleep)
  if (on) { if (r.parent) { m._sleepParent = r.parent; r.removeFromParent(); } }
  else if (m._sleepParent) { if (!r.parent && !m.disposed) m._sleepParent.add(r); m._sleepParent = null; }
}
function sleepy(m, px, pz, allies) {
  const x = m.pos.x, z = m.pos.z;
  if ((x - px) * (x - px) + (z - pz) * (z - pz) < WAKE * WAKE) return false;
  if (allies) for (const a of allies) if (a.alive && a.pos && (x - a.pos.x) * (x - a.pos.x) + (z - a.pos.z) * (z - a.pos.z) < WAKE * WAKE) return false;
  _s.center.set(x, m.pos.y + (m.height || 1) * 0.5, z); _s.radius = 2.5 + (m.height || 1);
  return !_fr.intersectsSphere(_s);
}
