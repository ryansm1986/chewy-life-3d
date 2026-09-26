// Procedural animation for kit characters: locomotion cycles, idle life, secondary motion (ears, tails, scarf),
// timed actions with hit events, squash & stretch and hit flashes.
import * as THREE from 'three';
import { clamp, lerp, ease, TAU, damp } from '../core/util.js';

// action library: dur (s), events {name: t01}, pose(t01, P, A) applies additive offsets
const ACTIONS = {
  swing: { dur: 0.46, ev: { hit: 0.42 }, pose: (t, P, A) => {
    const wind = ease.outCubic(clamp(t / 0.34)), strike = ease.outQuad(clamp((t - 0.34) / 0.16)), rec = ease.inOutQuad(clamp((t - 0.55) / 0.45));
    const x = lerp(lerp(0, -2.5, wind), 1.2, strike) * (1 - rec), z = lerp(lerp(0, -0.5, wind), 0.5, strike) * (1 - rec);
    A.armR.x += x; A.armR.z += z; A.armL.x += -0.4 * wind * (1 - rec); A.armL.z += 0.3 * (1 - rec) * wind;
    A.body.y += lerp(lerp(0, 0.55, wind), -0.7, strike) * (1 - rec);
    A.body.x += 0.18 * strike * (1 - rec);
    A.lean += 0.05 * strike * (1 - rec);
    A.sq += -0.06 * strike * (1 - rec) + 0.04 * wind * (1 - strike);
  } },
  swing2: { dur: 0.46, ev: { hit: 0.42 }, pose: (t, P, A) => {
    const wind = ease.outCubic(clamp(t / 0.34)), strike = ease.outQuad(clamp((t - 0.34) / 0.16)), rec = ease.inOutQuad(clamp((t - 0.55) / 0.45));
    A.armR.x += lerp(lerp(0, -1.2, wind), -0.9, strike) * (1 - rec); A.armR.z += lerp(lerp(0, 1.6, wind), -1.1, strike) * (1 - rec);
    A.body.y += lerp(lerp(0, -0.6, wind), 0.8, strike) * (1 - rec);
    A.sq += -0.05 * strike * (1 - rec);
  } },
  throw: { dur: 0.5, ev: { release: 0.44 }, pose: (t, P, A) => {
    const wind = ease.outCubic(clamp(t / 0.38)), rel = ease.outQuad(clamp((t - 0.38) / 0.14)), rec = ease.inOutQuad(clamp((t - 0.55) / 0.45));
    A.armR.x += lerp(lerp(0, -2.9, wind), 1.3, rel) * (1 - rec); A.armR.z += -0.3 * wind * (1 - rec);
    A.armL.x += lerp(-0.2, 0.9, wind) * (1 - rec);
    A.body.y += lerp(lerp(0, 0.5, wind), -0.4, rel) * (1 - rec); A.body.x += lerp(-0.1 * wind, 0.25, rel) * (1 - rec);
    A.sq += 0.05 * wind * (1 - rel) - 0.05 * rel * (1 - rec);
  } },
  cast: { dur: 0.55, ev: { cast: 0.45 }, pose: (t, P, A) => {
    const up = ease.outBack(clamp(t / 0.4)), fw = ease.outQuad(clamp((t - 0.4) / 0.15)), rec = ease.inOutQuad(clamp((t - 0.6) / 0.4));
    A.armR.x += lerp(-2.6 * up, -1.4, fw) * (1 - rec); A.armL.x += lerp(-2.6 * up, -1.4, fw) * (1 - rec);
    A.armR.z += 0.3 * up * (1 - rec); A.armL.z += -0.3 * up * (1 - rec);
    A.sq += 0.08 * up * (1 - fw) - 0.06 * fw * (1 - rec); A.head.x += -0.2 * up * (1 - rec);
  } },
  bark: { dur: 0.5, ev: { bark: 0.28 }, pose: (t, P, A) => {
    const a = ease.outCubic(clamp(t / 0.25)), b = ease.inOutQuad(clamp((t - 0.35) / 0.65));
    A.head.x += (-0.35 * a + 0.45 * clamp((t - 0.22) / 0.1)) * (1 - b); A.body.x += 0.15 * a * (1 - b);
    A.mouth = Math.max(A.mouth, clamp((t - 0.2) / 0.08) * (1 - b));
    A.sq += (0.08 * a - 0.14 * clamp((t - 0.25) / 0.08)) * (1 - b);
    A.armR.x += -0.6 * a * (1 - b); A.armL.x += -0.6 * a * (1 - b); A.armR.z += 0.5 * a * (1 - b); A.armL.z += -0.5 * a * (1 - b);
    A.earKick += 3 * clamp((t - 0.25) / 0.05) * (1 - b);
  } },
  slam: { dur: 0.8, ev: { impact: 0.62 }, pose: (t, P, A) => {
    const crouch = ease.outQuad(clamp(t / 0.18)), jump = clamp((t - 0.18) / 0.44), land = clamp((t - 0.62) / 0.1), rec = ease.inOutQuad(clamp((t - 0.7) / 0.3));
    A.y += Math.sin(jump * Math.PI) * 0.9 * (1 - land);
    A.sq += 0.12 * crouch * (1 - jump) - 0.08 * Math.sin(jump * Math.PI) + 0.18 * land * (1 - rec);
    A.armR.x += lerp(0, -3.0, ease.outQuad(jump)) * (1 - land) + 1.4 * land * (1 - rec); A.armL.x += lerp(0, -3.0, ease.outQuad(jump)) * (1 - land) + 1.4 * land * (1 - rec);
    A.body.x += 0.35 * land * (1 - rec);
  } },
  hurt: { dur: 0.32, pose: (t, P, A) => { const k = Math.sin(clamp(t) * Math.PI); A.body.x += -0.35 * k; A.head.x += -0.3 * k; A.armR.z += -0.5 * k; A.armL.z += 0.5 * k; A.sq += 0.08 * k; A.flinch = k; } },
  die: { dur: 1.2, hold: true, pose: (t, P, A) => { const k = ease.outBounce(clamp(t / 0.7)); A.body.x += -1.35 * k; A.y += -0.1 * k; A.armR.z += -1.2 * k; A.armL.z += 1.2 * k; A.eyesClosed = 1; A.legL.x += -0.9 * k; A.legR.x += -1.2 * k; } },
  roll: { dur: 0.42, pose: (t, P, A) => { const k = ease.inOutQuad(clamp(t)); A.roll = k * TAU; A.sq += 0.25 * Math.sin(k * Math.PI); A.armR.x += -1.2 * Math.sin(k * Math.PI); A.armL.x += -1.2 * Math.sin(k * Math.PI); A.legL.x += -1.2 * Math.sin(k * Math.PI); A.legR.x += -1.2 * Math.sin(k * Math.PI); A.y += 0.15 * Math.sin(k * Math.PI); } },
  wave: { dur: 1.3, pose: (t, P, A) => { const w = Math.sin(clamp(t) * Math.PI); A.armR.z += 2.5 * clamp(w * 3); A.armR.x += -0.3 * w; A.armR.zWave = Math.sin(t * 22) * 0.35 * clamp(w * 3); A.head.z += 0.12 * w; A.happy = 1; } },
  happy: { dur: 1.0, pose: (t, P, A) => { const j = Math.abs(Math.sin(t * Math.PI * 2)); A.y += j * 0.28; A.sq += -0.1 * j + 0.08 * (1 - j); A.armR.z += 2.4; A.armL.z += -2.4; A.armR.x += -0.2; A.armL.x += -0.2; A.happy = 1; A.eyesHappy = 1; } },
  pickup: { dur: 0.45, ev: { grab: 0.4 }, pose: (t, P, A) => { const k = Math.sin(clamp(t) * Math.PI); A.body.x += 0.6 * k; A.armR.x += -1.2 * k; A.armL.x += -1.2 * k; A.sq += 0.1 * k; A.y += -0.06 * k; } },
  drink: { dur: 0.7, pose: (t, P, A) => { const k = Math.sin(clamp(t) * Math.PI); A.armR.x += -2.2 * k; A.armR.z += 0.6 * k; A.head.x += -0.35 * k; A.eyesHappy = k > 0.5 ? 1 : 0; } },
  dig: { dur: 0.9, pose: (t, P, A) => { const s = Math.sin(t * 26); A.body.x += 0.55; A.armR.x += -1.2 + s * 0.7; A.armL.x += -1.2 - s * 0.7; A.sq += 0.06; A.tailWag = 2.5; } },
  sit: { dur: 99, hold: true, pose: (t, P, A) => { const k = ease.outQuad(clamp(t / 0.3)); A.y += -0.12 * k; A.legL.x += -1.4 * k; A.legR.x += -1.4 * k; A.sq += 0.04 * k; } },
  spin: { dur: 99, hold: true, pose: (t, P, A) => { A.spin = t * 16; A.armR.z += 1.4; A.armL.z += -1.4; A.armR.x += -0.2; } },
};
export { ACTIONS };

const zero = () => ({ x: 0, y: 0, z: 0 });

export class Animator {
  constructor(rig) {
    this.rig = rig;
    const P = this.P = rig.parts;
    this.quad = !!rig.quadruped;
    this.rest = new Map();
    rig.root.traverse(o => { if (o.isGroup || o.isObject3D) this.rest.set(o, { p: o.position.clone(), r: o.rotation.clone(), s: o.scale.clone() }); });
    this.t = Math.random() * 10;
    this.phase = 0; this.move = 0; this.speed = 0; this.runAmt = 0;
    this.action = null;
    this.blinkT = 1 + Math.random() * 3; this.blinkK = 0;
    this.ear = [{ a: 0, v: 0 }, { a: 0, v: 0 }];
    this.scarf = { a: 0, v: 0 };
    this.flash = 0; this.flashColor = new THREE.Color('#ffffff'); this.baseEmissive = rig.mat.emissive.clone();
    this.talk = 0; this.mood = 0; // mood: 0 normal, 1 happy
    this.wag = 1;
    this.prevPos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.first = true;
    this.lookYaw = 0;
    this.spinning = false;
  }
  play(name, { speed = 1, onEvent = null, force = true } = {}) {
    const def = ACTIONS[name]; if (!def) return;
    if (this.action && !force) return;
    this.action = { name, def, t: 0, dur: def.dur / speed, fired: new Set(), onEvent };
  }
  stop(name) { if (!name || this.action?.name === name) this.action = null; }
  busy() { return !!this.action && !this.action.def.hold && !['hurt', 'drink', 'wave', 'happy', 'pickup'].includes(this.action.name); }
  hit(color = '#ffffff') { if (this.t - (this.lastHit ?? -9) < 0.35) return; this.lastHit = this.t; this.flash = 1; this.flashColor.set(color); }
  update(dt, worldPos) {
    this.t += dt;
    if (worldPos) {
      if (this.first) { this.prevPos.copy(worldPos); this.first = false; }
      this.vel.subVectors(worldPos, this.prevPos).divideScalar(Math.max(dt, 1e-4)); this.prevPos.copy(worldPos);
    }
    const spd = Math.hypot(this.vel.x, this.vel.z);
    this.speed = damp(this.speed, spd, 12, dt);
    this.move = clamp(this.speed / 2.2);
    this.runAmt = clamp((this.speed - 3.2) / 2.5);
    const stride = this.quad ? 0.36 : 0.62 + this.runAmt * 0.25;
    this.phase += (this.speed / stride) * dt * Math.PI;
    // action timing
    const A = { body: zero(), head: zero(), armR: zero(), armL: zero(), legL: zero(), legR: zero(), y: 0, sq: 0, lean: 0, mouth: 0, earKick: 0, roll: 0, spin: 0, eyesClosed: 0, eyesHappy: 0, happy: 0, tailWag: 0, flinch: 0 };
    if (this.action) {
      const a = this.action; a.t += dt;
      const u = a.def.hold ? a.t : clamp(a.t / a.dur);
      if (a.def.ev) for (const [ev, at] of Object.entries(a.def.ev)) if (!a.fired.has(ev) && a.t / a.dur >= at) { a.fired.add(ev); a.onEvent?.(ev); }
      a.def.pose(a.def.hold ? a.t : u, this.P, A);
      if (!a.def.hold && a.t >= a.dur) { this.action = null; a.onEvent?.('end'); }
    }
    if (this.quad) this.poseQuad(dt, A); else this.poseBiped(dt, A);
    // blink
    this.blinkT -= dt;
    if (this.blinkT < 0) { this.blinkK = 1; this.blinkT = 2 + Math.random() * 4; }
    this.blinkK = Math.max(0, this.blinkK - dt * 7);
    const bl = Math.max(A.eyesClosed, Math.sin(this.blinkK * Math.PI));
    for (const e of this.P.eyes || []) e.scale.y = Math.max(0.08, 1 - bl) * (A.eyesHappy ? 0.35 : 1);
    // mouth (talk / bark)
    const m = this.P.mouth;
    if (m) {
      const talkOpen = this.talk > 0 ? (Math.sin(this.t * 18) * 0.5 + 0.5) * this.talk : 0;
      const o = Math.max(A.mouth, talkOpen);
      m.visible = o > 0.05; const k = o > 0.05 ? 1 : 0.0001; m.scale.set(k, Math.max(0.01, o) * k, k);
    }
    // flash
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 6);
    const mat = this.rig.mat;
    mat.emissive.copy(this.flashColor).multiplyScalar(this.flash * this.flash * 0.55 / (mat.emissiveIntensity || 1)).add(this.baseEmissive);
  }
  _set(o, rx, ry, rz) { const r = this.rest.get(o); o.rotation.set(r.r.x + rx, r.r.y + ry, r.r.z + rz); }
  poseBiped(dt, A) {
    const P = this.P, mv = this.move, run = this.runAmt, ph = this.phase, t = this.t;
    const swing = Math.sin(ph), bob = Math.abs(Math.sin(ph));
    const legAmp = (0.62 + run * 0.35) * mv;
    this._set(P.legL, swing * legAmp + A.legL.x, 0, 0);
    this._set(P.legR, -swing * legAmp + A.legR.x, 0, 0);
    // arms
    const armAmp = (0.55 + run * 0.4) * mv;
    const idleArm = Math.sin(t * 1.8) * 0.04 * (1 - mv);
    this._set(P.armL, -swing * armAmp + A.armL.x + idleArm, 0, 0.12 + 0.12 * run + A.armL.z);
    this._set(P.armR, swing * armAmp + A.armR.x - idleArm, 0, -0.12 - 0.12 * run + A.armR.z + (A.armR.zWave || 0));
    // body
    const rb = this.rest.get(P.body);
    const breathe = Math.sin(t * 2.3) * 0.014 * (1 - mv);
    P.body.position.y = rb.p.y + bob * (0.04 + run * 0.05) * mv + A.y * 0 ;
    P.body.rotation.set(rb.r.x + (0.1 + run * 0.16) * mv + A.body.x + A.lean + (A.roll || 0), rb.r.y + A.body.y + (A.spin || 0), rb.r.z + Math.sin(ph) * 0.05 * mv);
    // squash & stretch on root
    const sq = A.sq + breathe - bob * 0.03 * mv * (1 + run);
    const root = this.rig.root, sc = this.rig.spec.scale || 1;
    root.scale.set(sc * (1 + sq * 0.5), sc * (1 - sq), sc * (1 + sq * 0.5));
    this.rig.offsetY = A.y + (A.roll ? 0 : 0);
    // head
    const lookY = Math.sin(t * 0.37) * 0.18 * (1 - mv) * (1 - this.talk * 0.5);
    this._set(P.head, -0.05 * mv + Math.sin(ph * 2) * 0.03 * mv + A.head.x + (this.talk ? Math.sin(t * 9) * 0.04 : 0), lookY + A.head.y, Math.sin(t * 0.71) * 0.05 * (1 - mv) + A.head.z);
    // ears: springs driven by bob velocity and forward speed
    this.secondary(dt, A, bob, mv);
    // tail wag
    if (P.tail) {
      const wagSpd = 9 + (A.happy || this.mood) * 10 + A.tailWag * 5;
      const r = this.rest.get(P.tail);
      P.tail.rotation.set(r.r.x - 0.15 * mv, Math.sin(t * wagSpd) * (0.35 + (A.happy || this.mood) * 0.35 + A.tailWag * 0.2), 0);
    }
  }
  poseQuad(dt, A) {
    const P = this.P, mv = this.move, ph = this.phase, t = this.t;
    const amp = 0.75 * mv;
    const [FL, FR, BL, BR] = P.legs;
    const s = Math.sin(ph);
    const sitting = this.action?.name === 'sit';
    this._set(FL, s * amp, 0, 0); this._set(BR, s * amp, 0, 0);
    this._set(FR, -s * amp, 0, 0); this._set(BL, -s * amp, 0, 0);
    if (this.action?.name === 'sit') { const k = Math.min(1, this.action.t / 0.3); this._set(BL, -1.4 * k, 0, 0); this._set(BR, -1.4 * k, 0, 0); A.y -= 0.08 * k; A.body.x -= 0.5 * k; }
    const rb = this.rest.get(P.body);
    const bob = Math.abs(Math.sin(ph));
    P.body.position.y = rb.p.y + bob * 0.03 * mv + Math.sin(t * 2.4) * 0.006 + A.y;
    P.body.rotation.set(rb.r.x + A.body.x + Math.sin(ph * 2) * 0.03 * mv, A.body.y, Math.sin(ph) * 0.04 * mv);
    this._set(P.head, Math.sin(ph * 2) * 0.05 * mv + A.head.x + Math.sin(t * 0.8) * 0.03, Math.sin(t * 0.43) * 0.25 * (1 - mv) + A.head.y, Math.sin(t * 0.61) * 0.08 * (1 - mv) + A.head.z);
    const sc = this.rig.spec.scale || 1, sq = A.sq;
    this.rig.root.scale.set(sc * (1 + sq * 0.5), sc * (1 - sq), sc * (1 + sq * 0.5));
    this.rig.offsetY = A.y;
    this.secondary(dt, A, bob, mv);
    if (P.tail) P.tail.rotation.set(-0.3, Math.sin(t * (14 + this.mood * 10)) * (0.5 + this.mood * 0.4), 0);
  }
  secondary(dt, A, bob, mv) {
    const P = this.P;
    const drive = -this.vel.y * 0.08 - mv * 0.25 + Math.cos(this.phase) * 0.12 * mv + A.earKick * 0.3 + A.flinch * 0.6;
    ['earL', 'earR'].forEach((k, i) => {
      const e = P[k]; if (!e) return;
      const S = this.ear[i];
      const target = drive + Math.sin(this.t * 1.3 + i) * 0.03;
      S.v += ((target - S.a) * 90 - S.v * 9) * dt; S.a += S.v * dt;
      const r = this.rest.get(e);
      const tip = e.userData.tip;
      if (tip) { const tr = this.rest.get(tip); tip.rotation.x = tr.r.x + S.a * 1.4; e.rotation.set(r.r.x + S.a * 0.25, r.r.y, r.r.z); }
      else e.rotation.set(r.r.x + S.a * (e.userData.soft ? 0.9 : 0.4), r.r.y, r.r.z + (i ? -1 : 1) * S.a * 0.2);
    });
    if (P.scarfTail) {
      const S = this.scarf; const target = mv * 0.9 + Math.sin(this.t * 3) * 0.1 * mv;
      S.v += ((target - S.a) * 40 - S.v * 6) * dt; S.a += S.v * dt;
      P.scarfTail.rotation.x = -S.a;
    }
  }
}
