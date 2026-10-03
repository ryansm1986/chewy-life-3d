// The reel minigame's physics (docs/HOMESTEAD.md §3), kept apart from its widget (ui/reel.js) so it can be tested:
// a vertical bar from 0 (bottom) to 1 (top); the catch zone rises while the player holds F / LMB and falls when they
// let go; the fish darts about (its difficulty sets the speed and the darts); the catch meter fills while the fish is
// in the zone and drains while it isn't. Full = caught, empty = it escapes. No allocations per step.
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class ReelSim {
  /** d: 0..1 difficulty; beh: 'smooth' | 'darter' | 'sinker' | 'floater'; zone: the catch zone's height (the Moonlit
   *  Rod's is bigger); drain: how fast the meter empties (×); rng: () => [0, 1) */
  constructor({ d = 0.4, beh = 'smooth', zone = 0.28, drain = 1, rng = Math.random } = {}) {
    this.d = d; this.beh = beh; this.zh = zone; this.drainK = drain; this.rng = rng;
    this.z = 0.04; this.v = 0;                         // catch zone: bottom edge, velocity
    this.f = 0.35 + rng() * 0.3; this.ft = this.f;     // fish: position, target
    this.speed = 0.2; this.tt = 0.5; this.dart = false;
    this.m = 0.28; this.t = 0; this.inZone = false; this.done = null;
  }
  step(dt, hold) {
    if (this.done) return this.done;
    dt = Math.min(dt, 0.05);
    // the catch zone: buoyant while held, sinking when let go, a soft bounce at either end
    this.v = clamp(this.v + (hold ? 2.7 : -2.3) * dt, -1.35, 1.35);
    this.z += this.v * dt;
    if (this.z < 0) { this.z = 0; this.v = this.v < -0.3 ? -this.v * 0.3 : 0; }
    const top = 1 - this.zh;
    if (this.z > top) { this.z = top; this.v = this.v > 0.3 ? -this.v * 0.3 : 0; }
    // the fish: drifts toward a target, picks a new one every so often, and sometimes darts across the bar
    this.tt -= dt;
    if (this.tt <= 0) {
      const r = this.rng, d = this.d;
      this.dart = r() < (this.beh === 'darter' ? 0.45 : 0.18) * (0.4 + d);
      let tgt = this.dart ? (this.f < 0.5 ? 0.55 + r() * 0.4 : 0.05 + r() * 0.4) : this.f + (r() - 0.5) * (0.25 + 0.5 * d);
      if (this.beh === 'sinker') tgt -= 0.12; else if (this.beh === 'floater') tgt += 0.12;
      this.ft = clamp(tgt, 0.04, 0.96);
      this.speed = (0.18 + 0.75 * d) * (this.dart ? 2.2 : 1) * (0.8 + r() * 0.4);
      this.tt = (this.dart ? 0.35 : 0.5 + r() * 0.9) * (1.25 - d * 0.5);
    }
    const df = this.ft - this.f, s = this.speed * dt;
    this.f += clamp(df, -s, s) * (Math.abs(df) < 0.05 ? 0.5 : 1);
    this.f = clamp(this.f + Math.sin(this.t * (6 + 6 * this.d)) * 0.004 * this.d, 0.02, 0.98);
    // the catch meter
    this.inZone = this.f >= this.z && this.f <= this.z + this.zh;
    this.m += this.inZone ? (0.29 - 0.08 * this.d) * dt : -(0.2 + 0.12 * this.d) * this.drainK * dt;
    this.t += dt;
    if (this.m >= 1) { this.m = 1; this.done = 'catch'; } else if (this.m <= 0) { this.m = 0; this.done = 'escape'; }
    return this.done;
  }
}
