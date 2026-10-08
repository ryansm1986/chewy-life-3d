// Shadow the dragon whelp (docs/GOLDEN.md §6; ROADMAP H-5): while the Golden Retriever dragoon is the active hero,
// Shadow wears his dragon whelp outfit and flies beside him like a little dragon pet. Switch to any other hero and he's
// his normal self again (a poof each way). He keeps his name, life, level and companion state: only the rig changes.
//
//  - the outfit: public/rigs/shadow_whelp.* (HERO_MODELS.shadowWhelp: the same quad skeleton and face as shadow_toy,
//    with the emerald hood, the bib, the back spikes and the tail cover) and the wing prop public/models/shadow-whelp-wing.glb
//    (the LEFT wing; the right one is its x-mirror), mounted on the body bone at wing_mount.json's spots
//    (tools/blender/work/codex/shadow-whelp: WING_MOUNT below, model metres, game axes; the prop's +X spans outward, +Z
//    forward, +Y up, flat at flap 0). A flap turns a wing about its root's +Z: + raises the tip, inside FLAP_RANGE
//    (−30°..60°, the range the clearances were checked over). Without the whelp rig (missing files, the classic kit) the
//    wings go on whichever Shadow there is (dressWings), so he still flies;
//  - the flight (Whelp.update, called from Companion.update before his AI): his AI still walks the ground plane (paths,
//    doors, collision, the follow slots), and the flight is how he's drawn over it: the Animator's fly / flyLift /
//    flyPitch / flyBank (animator.js poseQuad: the legs tuck, the rig lifts and pitches through its 'YXZ' root, the head
//    counters, the tail streams) and the wings' beat. He hovers ~1.05 m up (his body ~1.3 m), bobbing; noses down with
//    speed and banks into turns; the wings beat faster with speed, faster still climbing, and glide (held out, a flutter)
//    as he slows; in a fight he drops to ~0.55 m to bite.
//  - landing: he comes down and sits beside the hero when they've both been still a while (and takes off as soon as the
//    hero moves); indoors (the interiors), in a tight Burrow corridor, in a cut-scene or a conversation, while he's being
//    staged (`hold`) and when he's knocked out (he drops) he walks on the ground like a dog in a costume, wings folded;
//  - the Whelp Bond's moves (combat/goldenWhelp.js) take him over through `act`, a puppet record: where to (to: flown
//    straight there; at: placed exactly; walk: on foot, round the walls), how fast, the height (lift, eased at `rate` m/s;
//    liftNow: exactly), the pitch, the wings ('beat', 'spread' wide and fluttering, 'tuck' swept back for a dive, 'fold'),
//    the facing; grounded: on the ground (Dragon Heart). kick (a blow caught on the spread felt) and burst (the shield's
//    gust: three big beats) decay by themselves.
// Allocation-free per frame.
import * as THREE from 'three';
import { Animator } from './animator.js';
import { heroModelReady, buildHeroModel, loadHeroModel } from './heroModels.js';
import { buildBoston, enableXray } from './charKit.js';
import { loadGlb } from '../gfx/glbAssets.js';
import { makeToon } from '../gfx/materials.js';
import { Events } from '../core/events.js';
import { clamp, damp, dampAngle } from '../core/util.js';

const BASE = import.meta.env?.BASE_URL ?? '/';
export const WING = { file: 'models/shadow-whelp-wing.glb' };
// wing_mount.json: the left wing's root in the body bone's frame (game axes; the right one mirrors x) and the flap range
export const WING_MOUNT = { pos: [0.1322, 0.0553, -0.0854], kitPos: [0.11, 0.07, -0.06], kitScale: 0.9 };
export const FLAP_RANGE = [-30, 60];
const D2R = Math.PI / 180;
const FOLD = 52; // (°) the wings folded up along his back on the ground (a pet costume's wings at rest)
const LIFT = 1.05, LIFT_FIGHT = 0.55; // the root's height over the ground in the air (m): his body hangs ~0.2 above it

// ------------------------------------------------------------------ the wing prop (one mesh, one textured material)
const W = { state: 'idle', geo: null, mat: null, wait: [] };
function loadWing() {
  if (W.state !== 'idle') return;
  W.state = 'loading';
  loadGlb(BASE + WING.file).then(tpl => {
    let mesh = null; tpl.traverse(o => { if (!mesh && o.isMesh) mesh = o; });
    if (!mesh) throw new Error('no mesh');
    tpl.updateMatrixWorld(true);
    W.geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld); W.geo.computeBoundingSphere();
    W.mat = makeToon({ map: mesh.material.map || null, side: THREE.DoubleSide, rim: 0.4, brush: 0.08, objectBrush: true, shadowSat: 0.4 });
    W.mat.name = 'whelp_wing'; W.state = 'ready';
  }).catch(err => { W.state = 'missing'; console.warn('[whelp] the wing model did not load', err?.message || err); })
    .finally(() => { for (const fn of W.wait.splice(0)) fn(); });
}
/** load the outfit (the rig and the wing prop); resolves when both are in (or missing) */
export function loadWhelp() {
  loadWing();
  const wing = W.state === 'ready' || W.state === 'missing' ? Promise.resolve() : new Promise(res => W.wait.push(res));
  return Promise.all([loadHeroModel('shadowWhelp'), wing]);
}
export const whelpReady = () => heroModelReady('shadowWhelp');
export const wingsReady = () => W.state === 'ready';

/** mount a pair of wings on a Shadow rig's body (idempotent; the baked rigs at WING_MOUNT, the Boston kit near its
 *  shoulders) → rig.parts.wings = { L, R, flap(deg, degR?) } (null if the prop isn't loaded) */
export function dressWings(rig) {
  if (!rig?.parts?.body) return null;
  if (rig.parts.wings) return rig.parts.wings;
  if (W.state !== 'ready') return null;
  const baked = !!rig.bakedDisney, m = baked ? WING_MOUNT.pos : WING_MOUNT.kitPos, s = baked ? 1 : WING_MOUNT.kitScale;
  const mk = side => {
    const h = new THREE.Group(); h.name = side < 0 ? 'wing_R' : 'wing_L';
    h.position.set(m[0] * side * (baked ? 1 : 1 / (rig.spec?.scale || 1)), m[1], m[2]);
    const mesh = new THREE.Mesh(W.geo, W.mat); mesh.castShadow = true; mesh.receiveShadow = false;
    h.add(mesh); h.scale.set(side * s, s, s);
    rig.parts.body.add(h);
    return h;
  };
  const L = mk(1), R = mk(-1);
  const wings = rig.parts.wings = {
    L, R,
    /** set the flap (degrees: + raises the tips; clamped to FLAP_RANGE); degR for an uneven beat (a bank) */
    flap(deg, degR = deg) {
      L.rotation.z = clamp(deg, FLAP_RANGE[0], FLAP_RANGE[1]) * D2R;
      R.rotation.z = -clamp(degR, FLAP_RANGE[0], FLAP_RANGE[1]) * D2R; // (the mirror: the same visual flap is the negative angle)
    },
    show(on) { L.visible = R.visible = on; },
  };
  wings.flap(FOLD);
  return wings;
}
/** a whelp rig: the outfit if it's loaded, else the Toybox Shadow (or the kit Boston) with the wings on */
export function buildWhelpRig() {
  const rig = whelpReady() ? buildHeroModel('shadowWhelp') : heroModelReady('shadow') ? buildHeroModel('shadow') : buildBoston();
  rig.whelp = true;
  dressWings(rig);
  return rig;
}
/** Shadow's everyday rig (as companion.js builds it) */
export const buildShadowRig = () => (heroModelReady('shadow') ? buildHeroModel('shadow') : buildBoston());

// ------------------------------------------------------------------ the companion's whelp mode
const _v = new THREE.Vector3();
export class Whelp {
  constructor(sh) {
    this.sh = sh;
    this.on = false;        // wearing the outfit
    this.air = 0;           // 0 on the ground .. 1 airborne (the tuck, the pitch)
    this.lift = 0;          // the root's height over the ground (m)
    this.liftV = 0;         // its rate (m/s): a climb beats the wings faster
    this.ph = Math.random() * 6; this.beat = 0; this.mid = FOLD; this.flapAmp = 0;
    this.still = 0;         // s the hero and he have both been still (he lands after a while)
    this.landed = false;    // came down to sit (an idle landing: takes off when the hero moves)
    this.tightT = 0; this.tight = false; this.prevFace = 0; this.bank = 0; this.prevSpd = 0; this.glide = 0;
    this.lastWorld = null; this.flapSfx = 0;
    this.act = null; this.kick = 0; this.burst = 0; this.forced = null;
  }
  /** Companion.update calls this first: a Whelp Bond move steering him (combat/goldenWhelp.js sets `act`) → true when it
   *  took the move */
  steer(dt) {
    const a = this.act, sh = this.sh;
    if (!a || !this.on || sh.fainted > 0) return false;
    const W = sh.world;
    if (a.at) { sh.pos.x = a.at.x; sh.pos.z = a.at.z; sh.pos.y = W.heightAt(sh.pos.x, sh.pos.z); }
    else if (a.walk) { if (Math.hypot(a.to.x - sh.pos.x, a.to.z - sh.pos.z) > 0.3) sh.follow(a.to.x, a.to.z, dt, a.speed || 1, 0.25); }
    else { // flown straight there (over whatever is below), easing in at the end
      const dx = a.to.x - sh.pos.x, dz = a.to.z - sh.pos.z, d = Math.hypot(dx, dz);
      if (d > 0.02) { const st = Math.min(d, (a.speed || 8) * dt * clamp(d / 0.6, 0.35, 1)); sh.pos.x += dx / d * st; sh.pos.z += dz / d * st; sh.pos.y = W.heightAt(sh.pos.x, sh.pos.z); }
    }
    if (a.face != null) sh.faceTarget = a.face;
    sh.idleT = 0; sh.wanderTarget = null;
    if (sh.anim.action?.name === 'sit') sh.anim.stop('sit');
    return true;
  }
  get G() { return this.sh.G; }
  /** should he be wearing it? only while the dragoon is the active hero */
  wanted() { return this.forced ?? this.G?.state?.activeHero === 'golden'; } // (forced: Foosy's joining scene dresses him for a while: goldenJoin.js)
  /** put the outfit on / take it off: a new rig in place (same spot, facing, life and state), with a poof */
  swap(on, quiet = false) {
    const sh = this.sh, G = this.G;
    this.on = on;
    const rig = on ? buildWhelpRig() : buildShadowRig();
    const old = sh.rig, act = sh.anim?.action?.name;
    sh.world.scene.remove(old.root); old.dispose?.();
    sh.rig = rig; sh.anim = new Animator(rig);
    enableXray(rig, '#9fc8ff', 0.55);
    if (on) { rig.root.rotation.order = 'YXZ'; sh.anim.flyRig = true; }
    sh.world.scene.add(rig.root);
    if (act === 'die') sh.anim.play('die'); else if (act === 'sit') sh.anim.play('sit');
    this.air = 0; this.lift = 0; this.liftV = 0; this.landed = false; this.still = 0;
    sh.sync?.();
    if (!quiet && G?.vfx) {
      _v.set(sh.pos.x, sh.pos.y + 0.35, sh.pos.z);
      G.vfx.poof(_v, { color: on ? '#eaffef' : '#fff6ea', n: 16, size: 0.55 });
      G.vfx.sparkle(_v, { n: 10, color: on ? '#7ae0a8' : '#ffe9a8', r: 0.45, size: 0.24 });
      Events.emit('sfx', 'whelp_poof', { pos: sh.pos });
      if (on) G.vfx.emote?.(sh, 'heart', 1.2);
    }
    Events.emit('whelp:swap', { on });
    return rig;
  }
  /** can he be in the air right now? (else he walks, wings folded) */
  canFly() {
    const sh = this.sh, G = this.G;
    if (!this.on || G.mode === 'interior' || sh.hold || sh.fainted > 0 || sh.untargetable) return false;
    if (G.ui?.dlg?.active || G.introFocus || G.cutscene || G.titleActive) return false;
    return !this.tight;
  }
  /** a tight Burrow corridor: walls close on both sides of him (checked twice a second, with some hysteresis) */
  checkTight(dt) {
    const sh = this.sh, G = this.G, col = sh.world?.collision;
    if ((this.tightT -= dt) > 0) return;
    this.tightT = 0.5;
    if (G.mode !== 'dungeon' || !col?.solidAt) { this.tight = false; return; }
    let pairs = 0;
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 4, x = Math.cos(a), z = Math.sin(a), r = this.tight ? 0.95 : 0.75;
      if (col.solidAt(sh.pos.x + x * r, sh.pos.z + z * r, 0.05) && col.solidAt(sh.pos.x - x * r, sh.pos.z - z * r, 0.05)) pairs++;
    }
    this.tight = pairs > 0;
  }
  /** Companion.update calls this in place of its walking follow while he's airborne (and not fighting): he hovers to the
   *  hero's side across the camera's view, a little further from the camera than the hero, so he's in the picture and
   *  never in front of the hero; he keeps up when the hero moves. → true when it took the move */
  airFollow(dt, P) {
    const sh = this.sh, G = this.G;
    if (!this.on || this.landed || !this.canFly() || this.air < 0.3) return false;
    const yaw = G.engine?.rig?.yaw ?? 0, rx = Math.cos(yaw), rz = -Math.sin(yaw), fx = -Math.sin(yaw), fz = -Math.cos(yaw); // (the camera's right and forward on the ground)
    const ox = sh.pos.x - P.pos.x, oz = sh.pos.z - P.pos.z;
    const side = ox * rx + oz * rz;
    if (Math.abs(side) > 0.35 || !this.side) this.side = side >= 0 ? 1 : -1; // (keep to his side; pick one when he's straight in line)
    const moving = (P.anim?.speed || 0) > 0.5;
    // beside the hero across the view (a step further when the hero runs), a touch further from the camera, a touch ahead
    const across = moving ? 1.25 : 1.1, depth = 0.35, ahead = moving ? 0.25 : 0;
    let tx = P.pos.x + rx * this.side * across + fx * depth + Math.sin(P.facing) * ahead, tz = P.pos.z + rz * this.side * across + fz * depth + Math.cos(P.facing) * ahead;
    const W = sh.world;
    if (W?.walkable?.(tx, tz) === false || W?.collision?.solidAt?.(tx, tz, 0.3)) { // (no room there: the other side)
      const bx = P.pos.x - rx * this.side * across + fx * depth, bz = P.pos.z - rz * this.side * across + fz * depth;
      if (W?.walkable?.(bx, bz) !== false && !W?.collision?.solidAt?.(bx, bz, 0.3)) { this.side = -this.side; tx = bx; tz = bz; }
    }
    const d = Math.hypot(tx - sh.pos.x, tz - sh.pos.z), pace = Math.min(2.2, Math.max(1, (P.anim?.speed || 0) / (sh.speed * 1.05)));
    if (d > 0.2) sh.follow(tx, tz, dt, (d > 3 ? 1.5 : d > 0.8 ? 1.15 : 0.6) * pace, 0.15);
    if (d < 0.6) sh.faceTarget = moving ? P.facing : P.facing + this.side * 0.35; // (looking ahead with the hero, turned a little toward him)
    sh.idleT = 0; sh.wanderTarget = null;
    sh.anim.mood = moving ? 0.6 : 0.4;
    if (sh.anim.action?.name === 'sit') sh.anim.stop('sit');
    return true;
  }
  /** per frame, before his AI (Companion.update) */
  update(dt) {
    const sh = this.sh, G = this.G;
    const want = this.wanted();
    if (want !== this.on) this.swap(want, !G?.engine || (G.engine.time || 0) < 1.5 || !!G.titleActive);
    if (!this.on) return;
    const A = sh.anim, P = G.player;
    if (sh.world !== this.lastWorld) { this.lastWorld = sh.world; this.tight = false; this.tightT = 0; if (!this.canFly()) { this.lift = 0; this.air = 0; } } // (a new world: start on the ground where he can't fly)
    this.checkTight(dt);
    // idle landing: the hero and he both still for a while (and nothing to fight)
    const heroSpd = P?.anim?.speed || 0, mySpd = A.speed || 0, fighting = !!sh.target || (G.mode === 'dungeon' && sh.combatBusy);
    if (heroSpd < 0.3 && mySpd < 0.4 && !fighting) this.still += dt; else this.still = 0;
    const d = P ? Math.hypot(P.pos.x - sh.pos.x, P.pos.z - sh.pos.z) : 0;
    if (this.landed && (heroSpd > 0.6 || d > 2.4 || fighting)) this.landed = false;
    else if (!this.landed && this.still > 6) this.landed = true;
    const act = this.act && sh.fainted <= 0 ? this.act : null;
    if (act) this.landed = false;
    const fly = act ? !act.grounded && G.mode !== 'interior' : this.canFly() && !this.landed;
    // the height: up to the hover (or the fight's lower pass), down to land; a drop when knocked out (a Bond move's own)
    const target = !fly ? 0 : act ? act.lift ?? LIFT : G.mode === 'dungeon' && sh.combatBusy ? LIFT_FIGHT : LIFT;
    const prev = this.lift, rate = !fly && sh.fainted > 0 ? 5 : act?.rate ? act.rate : fly ? 2.2 : 2.8; // (m/s at most: a drop is quicker than a landing)
    if (act?.liftNow != null) this.lift = act.liftNow;
    else this.lift += clamp((target - this.lift) * (1 - Math.exp(-dt * 3.4)), -rate * dt, rate * dt);
    this.liftV = damp(this.liftV, (this.lift - prev) / Math.max(dt, 1e-4), 10, dt);
    this.air = damp(this.air, this.lift > 0.12 || (fly && this.lift > 0.02) ? 1 : 0, 7, dt);
    if (this.air > 0.05 && A.action?.name === 'sit') A.stop('sit');
    // down from an idle landing: he settles and sits beside the hero a moment later (not the dog's five-second wait)
    if (this.landed && this.lift < 0.02 && !sh.combatBusy) { if ((this.landT = (this.landT || 0) + dt) > 0.7 && !A.action && (sh.anim.speed || 0) < 0.2) A.play('sit'); } else this.landT = 0;
    // the pitch (nose down with speed, up when climbing) and the bank (into the turn)
    const spd = mySpd, yawRate = Math.atan2(Math.sin(sh.facing - this.prevFace), Math.cos(sh.facing - this.prevFace)) / Math.max(dt, 1e-4);
    this.prevFace = sh.facing;
    this.bank = damp(this.bank, clamp(-yawRate * 0.09, -0.4, 0.4) * clamp(spd / 2), 6, dt);
    const pitch = act?.pitch != null ? act.pitch : clamp(spd / 5.5) * 0.42 - clamp(this.liftV / 2, 0, 1) * 0.22;
    A.fly = this.air; A.flyLift = this.lift + Math.sin(sh.anim.t * 2.3) * 0.05 * this.air * (fly ? 1 : 0);
    A.flyPitch = damp(A.flyPitch || 0, pitch, act ? 12 : 5, dt); A.flyBank = this.bank; // (a Bond move's pitch comes quicker: the dive)
    // the wings: folded on the ground; in the air a sine beat inside the flap range — faster with speed, faster still
    // climbing, a gentle hover beat when still, and a glide (held out, a little flutter) as he slows
    const wings = sh.rig.parts.wings || dressWings(sh.rig);
    if (!wings) return;
    const slowing = spd < this.prevSpd - 0.05 * dt * 60 && spd > 0.4;
    this.prevSpd = damp(this.prevSpd, spd, 10, dt);
    this.glide = damp(this.glide, slowing && this.liftV < 0.2 ? 1 : 0, slowing ? 5 : 2.5, dt);
    const climb = clamp(this.liftV / 1.5, 0, 1), sp = clamp(spd / 5), wm = act?.wings || 'beat';
    this.kick = Math.max(0, this.kick - dt * 4); this.burst = Math.max(0, this.burst - dt * 1.6);
    let freq = (2.3 + 2.0 * sp + 3.0 * climb) * (1 - 0.6 * this.glide), amp = (26 + 18 * sp + 14 * climb) * (1 - 0.8 * this.glide), mid = 14 + 6 * this.glide;
    if (wm === 'spread') { freq = 4.5; amp = 5; mid = 4; } // (held out as wide as they go, fluttering)
    else if (wm === 'tuck') { freq = 9; amp = 3; mid = FOLD - 4; } // (swept back along his sides for the dive)
    else if (wm === 'fold') { freq = 2; amp = 0; mid = FOLD; }
    if (this.burst > 0) { freq = 6; amp = 46 * Math.min(1, this.burst * 2); mid = 12; } // (the gust: big beats)
    const air = this.air, out = air > 0.5 || (act && wm !== 'fold');
    this.mid = damp(this.mid, out ? mid : FOLD, wm === 'tuck' ? 14 : 6, dt);
    this.flapAmp = damp(this.flapAmp, out ? amp : 0, 6, dt);
    const was = Math.sin(this.ph);
    this.ph += dt * freq * Math.PI * 2;
    const s = Math.sin(this.ph), flap = this.mid + this.flapAmp * s + this.kick * 22 * Math.sin(sh.anim.t * 38);
    const bk = this.bank * 30 * air; // (banking: the inside wing a touch lower)
    wings.flap(flap - bk, flap + bk);
    // a soft whump on each downstroke (only a quiet one, and not every beat)
    if (air > 0.6 && was > 0 && s <= 0 && this.flapAmp > 18 && (this.flapSfx -= 1) <= 0) { this.flapSfx = 2; Events.emit('sfx', 'whelp_flap', { pos: sh.pos, vol: 0.5 + 0.5 * climb }); }
  }
}
