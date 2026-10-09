// The reel minigame's physics (docs/HOMESTEAD.md §3), kept apart from its widget (ui/reel.js) so it can be tested:
// a vertical bar from 0 (bottom) to 1 (top); the catch zone floats up while the player holds F / LMB / the screen and
// sinks when they let go; the fish swims about (its difficulty sets its speed, its darts and the zone's size); the catch
// meter fills while the fish is in the zone and drains while it isn't. Full = caught, empty = it escapes. No allocations
// per step.
// R-12, the cozy retune (measured with tools/fishing-sim.mjs, a bot with a human's ~0.3 s reaction):
//  - the zone is damped (it eases to a gentle top speed instead of sliding like ice), so a late press doesn't overshoot;
//  - the zone starts on the fish, the meter doesn't drain for the first REEL.grace s, and a fish just past the zone's
//    edge still counts (REEL.edge: the fish icon has a size);
//  - the meter drains slower than it fills (easy fish barely drain), and a floor (the guide, the first catch ever)
//    means the fish always lands;
//  - a harder fish shrinks the zone a little (REEL.zk), so the rare ones still ask for care.
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const REEL = {
  up: 2.4, down: 2.0, drag: 2.2, vmax: 1.1,                  // the zone: lift / sink (/s²), damping (/s), top speed
  fs0: 0.25, fs1: 0.7, dartK: 1.8, dartP: 0.25, dartPD: 0.38, // the fish: speed (+ per difficulty), darts (×, odds, a darter's)
  fill0: 0.24, fill1: 0.08, drain0: 0.12, drain1: 0.45,       // the meter (/s, - / + per difficulty)
  grace: 1.2, m0: 0.3, edge: 0.025, zk: 0.3,                  // no drain at first (s), the start, the zone's soft edge, its shrink
};

export class ReelSim {
  /** d: 0..1 difficulty; beh: 'smooth' | 'darter' | 'sinker' | 'floater'; zone: the catch zone's height (the rod's and
   *  the Relaxed setting's: life/fishData.js reelParams); drain: how fast the meter empties (×); floor: the meter never
   *  drops below it (> 0: the fish can't escape); rng: () => [0, 1) */
  constructor({ d = 0.4, beh = 'smooth', zone = 0.32, drain = 1, floor = 0, rng = Math.random } = {}) {
    const K = REEL;
    this.d = d; this.beh = beh; this.drainK = drain; this.floor = floor; this.rng = rng;
    this.zh = clamp(zone * (1 + K.zk * (0.4 - d)), 0.12, 0.7);
    this.f = 0.35 + rng() * 0.3; this.ft = this.f;     // fish: position, target
    this.z = clamp(this.f - this.zh / 2, 0, 1 - this.zh); this.v = 0; // catch zone: bottom edge (on the fish), velocity
    this.speed = 0.2; this.tt = 0.7; this.dart = false;
    this.m = K.m0; this.t = 0; this.inZone = true; this.done = null;
  }
  step(dt, hold) {
    if (this.done) return this.done;
    dt = Math.min(dt, 0.05);
    const K = REEL;
    // the catch zone: floats up while held, sinks when let go, eased (damped) to a gentle top speed, a soft bounce at either end
    this.v = clamp((this.v + (hold ? K.up : -K.down) * dt) * Math.exp(-K.drag * dt), -K.vmax, K.vmax);
    this.z += this.v * dt;
    if (this.z < 0) { this.z = 0; this.v = this.v < -0.3 ? -this.v * 0.25 : 0; }
    const top = 1 - this.zh;
    if (this.z > top) { this.z = top; this.v = this.v > 0.3 ? -this.v * 0.25 : 0; }
    // the fish: drifts toward a target, picks a new one every so often, and sometimes darts across the bar
    this.tt -= dt;
    if (this.tt <= 0) {
      const r = this.rng, d = this.d;
      this.dart = r() < (this.beh === 'darter' ? K.dartPD : K.dartP) * (0.3 + d);
      let tgt = this.dart ? (this.f < 0.5 ? 0.55 + r() * 0.4 : 0.05 + r() * 0.4) : this.f + (r() - 0.5) * (0.25 + 0.5 * d);
      if (this.beh === 'sinker') tgt -= 0.1; else if (this.beh === 'floater') tgt += 0.1;
      this.ft = clamp(tgt, 0.06, 0.94);
      this.speed = (K.fs0 + K.fs1 * d) * (this.dart ? K.dartK : 1) * (0.8 + r() * 0.4);
      this.tt = (this.dart ? 0.4 : 0.6 + r()) * (1.3 - d * 0.5);
    }
    const df = this.ft - this.f, s = this.speed * dt;
    this.f += clamp(df, -s, s) * (Math.abs(df) < 0.05 ? 0.5 : 1);
    this.f = clamp(this.f + Math.sin(this.t * (6 + 6 * this.d)) * 0.004 * this.d, 0.02, 0.98);
    // the catch meter
    this.inZone = this.f >= this.z - K.edge && this.f <= this.z + this.zh + K.edge;
    if (this.inZone) this.m += (K.fill0 - K.fill1 * this.d) * dt;
    else if (this.t >= K.grace) this.m -= (K.drain0 + K.drain1 * this.d) * this.drainK * dt;
    this.t += dt;
    if (this.m < this.floor) this.m = this.floor;
    if (this.m >= 1) { this.m = 1; this.done = 'catch'; } else if (this.m <= 0) { this.m = 0; this.done = 'escape'; }
    return this.done;
  }
}
