// Swimming and climbing (ROADMAP TR-1; the owner's picks 2026-10-27: free, cozy swimming in any deep water, no stamina,
// no drowning; climbing up and down the natural rocky cliffs in the village). No jumping (the owner: "Let's just not
// add jump"). One Traverse per hero body and per companion: it lets the body go where the world's travelOk() says
// (deep water and the village's cliffs as well as dry, gentle ground), works out the mode each frame from where it
// stands, and sets the height, the speed, the facing, the pose weights (Animator.swim / .climb), the contact shadow and
// a little offset off a cliff face. Attacks, skills, the roll and the sprint wait while swimming or climbing.
//
//   world.travelOk(x, z)      may a traversing body be here? (VillageWorld, RegionWorld; others: walkable only)
//   world.waterDepth(x, z)    water depth there (0 on land, on a deck, on ice)
//   world.waterSurface(x, z)    the water's surface height there
//   world.climbable(x, z)     a natural cliff face (the village only)
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { clamp } from '../core/util.js';

export const SWIM_DEPTH = { biped: 0.5, quad: 0.3 };   // m: deeper than this you swim (shallower: you wade)
const SINK = { biped: 0.56, quad: 0.3 };                // m below the surface the body's feet hang (the head stays out)
const SPEED = { swim: 0.66, climb: 1.5 };               // swim: × the walk; climb: m/s along the rock face
export const CLIMB_SLOPE = 0.5;                          // terrain slope (1 - normal.y) past which a face is a climb
const _n = new THREE.Vector3();

export class Traverse {
  constructor(body, { kind = 'biped' } = {}) {
    this.body = body; this.kind = kind;
    this.mode = 'walk'; this.k = { swim: 0, climb: 0 };
    this.mul = 1; this.strokeT = 0; this.enterT = 0;
    this.off = new THREE.Vector3(); // (the rig's offset off a cliff face: Actor.sync adds it)
    this.block = (x, z) => !this.ok(x, z);
  }
  get busy() { return this.mode !== 'walk'; }
  get swimming() { return this.mode === 'swim'; }
  get climbing() { return this.mode === 'climb'; }
  ok(x, z) { const W = this.body.world; return W.travelOk ? W.travelOk(x, z) : W.walkable ? W.walkable(x, z) : true; }
  /** after a step (or each frame): where am I standing → the mode, the height, the speed for the next step */
  settle() {
    const B = this.body, W = B.world, p = B.pos;
    const depth = W.waterDepth ? W.waterDepth(p.x, p.z) : 0;
    const was = this.mode;
    if (depth > SWIM_DEPTH[this.kind]) {
      this.mode = 'swim';
      p.y = (W.waterSurface ? W.waterSurface(p.x, p.z) : 0) - SINK[this.kind];
      this.mul = SPEED.swim; this.off.set(0, 0, 0);
    } else if (W.climbable && W.climbable(p.x, p.z)) {
      this.mode = 'climb';
      const T = W.terrain, n = T.normalAt(p.x, p.z), ny = Math.max(0.12, n.y), g = Math.sqrt(1 / (ny * ny) - 1);
      // the same pace up the rock whatever its steepness: the walk's ground speed scaled to SPEED.climb along the face
      this.mul = Math.min(1, SPEED.climb / (B.speed * Math.sqrt(1 + g * g)));
      // hug the face, a hand's breadth out from it, and look up it
      const hx = -n.x, hz = -n.z, hl = Math.hypot(hx, hz) || 1;
      this.up = { x: hx / hl, z: hz / hl };
      this.off.set(-this.up.x * 0.26, 0, -this.up.z * 0.26);
    } else {
      this.mode = 'walk'; this.mul = 1; this.off.set(0, 0, 0);
    }
    if (was !== this.mode) this.changed(was);
    return this.mode;
  }
  changed(was) {
    const B = this.body, G = B.G || B.game, p = B.pos;
    if (this.mode === 'swim' || was === 'swim') {
      const at = new THREE.Vector3(p.x, (B.world.waterSurface ? B.world.waterSurface(p.x, p.z) : 0) + 0.04, p.z);
      G?.vfx?.ring?.(at, { color: '#ffffff', r0: 0.2, r1: 1.3, life: 0.6, opacity: 0.7, y: 0 });
      Events.emit('sfx', this.mode === 'swim' ? 'water_splash' : 'splash', { pos: at });
      if (this.mode === 'swim' && B.rollT > 0) B.rollT = 0; // (a roll into the water ends in a paddle)
    }
    Events.emit('traverse:mode', { body: B, mode: this.mode, was });
  }
  /** per frame, before the pose: the pose weights, the facing on a cliff, the strokes' ripples, the shadow */
  update(dt) {
    const B = this.body, A = B.anim, moving = (A?.speed || 0) > 0.15;
    for (const m of ['swim', 'climb']) this.k[m] += ((this.mode === m ? 1 : 0) - this.k[m]) * Math.min(1, dt * 9);
    if (A) {
      A.swim = this.k.swim; A.climb = this.k.climb;
      if (this.mode === 'climb') A.climbPh = (A.climbPh || 0) + dt * (moving ? 7.5 : 0);
    }
    if (this.mode === 'climb' && this.up) B.faceTarget = Math.atan2(this.up.x, this.up.z); // (face the rock, up or down it)
    if (this.mode === 'swim') {
      this.strokeT -= dt * (moving ? 1 : 0.35);
      if (this.strokeT <= 0) {
        this.strokeT = moving ? 0.42 : 1.4;
        const W = B.world, p = B.pos, y = W.waterSurface ? W.waterSurface(p.x, p.z) : 0, G = B.G || B.game;
        G?.vfx?.ring?.(new THREE.Vector3(p.x, y + 0.03, p.z), { color: '#ffffff', r0: 0.25, r1: moving ? 1.0 : 0.7, life: 0.7, opacity: moving ? 0.5 : 0.3, y: 0 });
        if (moving && this.kind === 'biped') Events.emit('sfx', 'splash', { pos: p, vol: 0.35 });
      }
    }
    if (B.shadow) B.shadow.visible = B.visible !== false && this.mode !== 'swim';
  }
  reset() { this.mode = 'walk'; this.mul = 1; this.k.swim = this.k.climb = 0; this.off.set(0, 0, 0); if (this.body.anim) { this.body.anim.swim = 0; this.body.anim.climb = 0; } }
}

/** the swim and climb poses, blended in by the Animator's swim / climb weights (Animator.update calls it before the
 *  biped / quadruped pose; A is the additive pose; the walk cycle's swing is damped while either is on) */
export function traversePose(anim, A, t) {
  const sw = anim.swim || 0, cl = anim.climb || 0; if (sw < 0.002 && cl < 0.002) return 0;
  const mv = clamp(anim.speed / 2);
  if (anim.quad) {
    // Shadow: nose up, paws paddling under the water; on the rock, reaching up it
    A.body.x += -0.22 * sw - 0.62 * cl; A.head.x += -0.28 * sw + 0.45 * cl;
    A.tailWag += 0.6 * sw; // (the paddling legs: Animator.poseQuad, from anim.swim)
    return Math.max(sw, cl);
  }
  if (sw > 0.002) {
    // the doggy paddle: leaning into the water, chin up, paws circling in turn in front, the legs kicking behind
    const s = t * (6 + 3 * mv), a = Math.sin(s), b = Math.sin(s + Math.PI);
    A.body.x += 0.95 * sw; A.head.x += -0.85 * sw;
    A.armL.x += (-1.45 + a * 0.6) * sw; A.armR.x += (-1.45 + b * 0.6) * sw;
    A.armL.z += 0.25 * sw; A.armR.z += -0.25 * sw;
    A.foreL.x += (-0.5 + Math.cos(s) * 0.35) * sw; A.foreR.x += (-0.5 - Math.cos(s) * 0.35) * sw;
    A.legL.x += (0.7 + Math.sin(t * 9) * 0.35) * sw; A.legR.x += (0.7 - Math.sin(t * 9) * 0.35) * sw;
    A.y += Math.sin(t * 2.4) * 0.025 * sw; // (bobbing)
    A.happy = Math.max(A.happy || 0, 0.6 * sw);
  }
  if (cl > 0.002) {
    // climbing: leaning into the rock, looking up, hand over hand, a knee up in turn
    const p = anim.climbPh || 0, a = Math.sin(p), b = Math.sin(p + Math.PI);
    A.body.x += 0.28 * cl; A.head.x += -0.4 * cl;
    A.armL.x += (-2.35 + a * 0.5) * cl; A.armR.x += (-2.35 + b * 0.5) * cl;
    A.armL.z += 0.18 * cl; A.armR.z += -0.18 * cl;
    A.foreL.x += (-0.35 + Math.max(0, a) * 0.5) * cl; A.foreR.x += (-0.35 + Math.max(0, b) * 0.5) * cl;
    A.legL.x += (-0.55 + b * 0.45) * cl; A.legR.x += (-0.55 + a * 0.45) * cl;
  }
  return Math.max(sw, cl);
}
