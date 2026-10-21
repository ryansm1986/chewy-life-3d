// Stella the Sun Oracle arrives in Blossom Hollow (docs/STELLA.md §6; ROADMAP H-6, Z-H3): Captain Kaizo rows her over from
// Shiokaze Port, the scene that took his stand-in's place in the arrival table (world/heroQuests.js ARRIVALS). The arrivals
// (actors/arrivals.js) start it once the Tide Pool opens and Floofy has joined, on a calm moment in town; HeroManager owns
// it (heroes.stlJoin) and Arrivals calls update(dt) every frame. Kaizo's rig, boat, shore search and row home are the shared
// staging in actors/kaizoArrive.js (KaizoBoat). Event `stella:joinScene` { phase }:
//   wait     — her rig and his are made hidden; the scenery round the foot of Beach Lane is gathered a few ms a frame
//   land     — his rowboat pulled up on the beach, him beside it looking out to sea; Stella sits in its bow under her open
//              wagasa, very upright, eyes closed, facing the sun. Shadow's tip; the pointer and the maps show where
//   float    — within 6 m: she opens her eyes, steps up onto the bow and off it, and the wagasa catches the air: she drifts
//              down onto the sand (stlFloat, a few motes, the paper "fwump"). Kaizo: "Careful now— …she always does that."
//   talk     — the controls lock; your marks on the sand (the staging), Shadow's behind you; her greeting
//   greet    — "I haven't greeted the sun yet today": she turns to the sun, raises the wagasa and bows (stlGreet); Shadow
//              copies her beside her, a perfect play-bow, tail going; she peeks (stlPeek) and sees it
//   zoomies  — a play-bow is an invitation: two big bounding loops round you and Shadow, the wagasa high, a trail of light
//              motes, Shadow chasing her; she skids onto her mark and smooths her robe (stlComposed): "…Ahem. The sun is
//              greeted." Kaizo: "She does that." Then the warmth: she touches Shadow's nose with the wagasa's tip, a little
//              morning light washes over him (stlTouch); the plea (prepareJoin first), or a thank-you
//   leave    — Kaizo rows home (KaizoBoat.goHome) while she waves him off (stlWave); she lifts the wagasa, a soft burst of
//              light, and she's gone to the cottage: HeroManager.joinStella; Arrivals.finished (the record, her quest and
//              its card, which waits until the beach is quiet)
//   done
// Leaving town, a hero switch or a knock-out before she floats down drops it (the boat, Kaizo, her): it comes again 10 s
// later. Once Kaizo is rowing home it just ends (she joins).
// Old saves (§6.2): Kaizo's visit recorded and his quest running: it stays his (q.giver), her plea is "Captain Kaizo told
// me…", no second quest; his quest done: a thank-you; Shiokaze saved before anyone came: the §6 thank-you.
// The rumour: in town, once Floofy has joined and before the Tide Pool opens, Shadow passes it on (once).
import * as THREE from 'three';
import { Actor } from './actor.js';
import { Player } from './player.js';
import { Events } from '../core/events.js';
import { CAST } from './charKit.js';
import { ACTIONS } from './animator.js';
import { STELLA_ACTIONS, PARASOL_HOLD } from './stellaPoses.js';
import { dressStella, mountParasol, aimParasol, swayTassels, finialWorld } from './stellaGear.js';
import { stlFx } from '../gfx/stellaFx.js';
import { regionUnlocked } from '../regions/index.js';
import { ZONE_NPCS } from '../regions/village/data.js';
import { KaizoBoat, KAIZO_ID, kaizoName, BOAT } from './kaizoArrive.js';
import { stageTalk, finish, keepOut, frameFor, frameGroup, frameClear, faceUp, shadowOnMark, camAxes, paved } from './sceneStage.js';
import { heroQuestGiver } from '../world/heroQuests.js';
import { dist } from '../core/util.js';

const sfx = (n, o) => Events.emit('sfx', n, o);
const EV = 'stella:joinScene';
const io = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clock = () => { const t0 = performance.now(); return () => (performance.now() - t0) / 1000; }; // (seconds since: frame-rate free)
const turnTo = (a, b, w) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * w;

// ------------------------------------------------------------------ the scene's own poses (on the shared ACTIONS table)
// stlSeat: her kneel in the boat's bow, very upright, eyes closed (stellaPoses.js stlKneel with the eyes shut);
// shdPlayBow: Shadow's play-bow (the front down, the rump up, the tail going: his front legs are laid forward on the sand
// after his own pose, bowLegs)
ACTIONS.stlSeat ||= { ...STELLA_ACTIONS.stlKneel, pose: (t, P, A, a) => { STELLA_ACTIONS.stlKneel.pose(t, P, A, a); A.eyesClosed = 1; A.body.x -= 0.12 * Math.min(1, t / 0.35); } };
ACTIONS.shdPlayBow ||= { dur: 99, hold: true, pose: (t, P, A) => { const k = io(Math.min(1, t / 0.3)), w = Math.sin(t * 5) * 0.03 * k; A.body.x += (0.55 + w) * k; A.head.x += -0.3 * k; A.y += -0.015 * k; A.tailWag = 4 * k; A.happy = 1; A.eyesHappy = 1; A.earKick += 1.2 * k; } };

/** the scene's Stella: her baked rig, the open wagasa in her paw (no villager life, no fighting) */
class SceneStella extends Actor {
  constructor(world, G) {
    super(world, Player.buildRig(undefined, 'stella'), { radius: 0.3, speed: 3.4, name: 'Stella' });
    this.G = G; this.height = this.rig.height || 1.24;
    this.parasol = dressStella(this.rig);
    this.anim.stance = PARASOL_HOLD; // (the wagasa up in her right paw, the canopy over her shoulder, never over her face)
    this.lift = false; // (off the ground: in the boat, floating down; her contact shadow stays on the sand)
    this.tilt = 0; this.tiltK = 0; // (0..1: the wagasa leaned back, away from the camera: tilted)
  }
  /** the wagasa leaned up and back, away from the game camera, at weight k (the run, the float, the wave: a pose that
   *  holds it high would put the canopy over her face from up here when she comes toward the camera) */
  tilted(k) {
    const A = this.anim.A; if (!A || k <= 0.001) return;
    const { T } = camAxes(this.G), f = this.facing, sf = Math.sin(f), cf = Math.cos(f), wx = -T[0] * 0.55, wz = -T[1] * 0.55, wy = 0.84;
    const hx = wx * sf + wz * cf, hz = wx * cf - wz * sf; // (world → her frame: x forward, z her left)
    const d = A.parasolDir || (A.parasolDir = { x: 0, y: 0, z: 0 }), w = A.parasolW || 0;
    d.x = d.x * (1 - k) + hx * k; d.y = d.y * (1 - k) + wy * k; d.z = d.z * (1 - k) + hz * k; A.parasolW = w * (1 - k) + k;
  }
  update(dt) {
    super.update(dt);
    const R = this.parasol;
    this.tiltK += (this.tilt - this.tiltK) * Math.min(1, dt * 6);
    if (R) { mountParasol(this.rig, R, 'hand'); this.tilted(this.tiltK); aimParasol(this.rig, R, this.facing, this.anim.A); swayTassels(R, dt, this); R.holder.visible = this.visible; }
    if (this.lift) { const gy = this.world.heightAt(this.pos.x, this.pos.z), h = this.pos.y - gy; this.shadow.position.y = gy + 0.03; this.shadow.scale.setScalar(Math.max(0.35, 1 - h * 0.5)); this.shadow.visible = this.visible && !this.inBoat; }
  }
}

export class StellaJoin {
  constructor(G, heroes) {
    this.G = G; this.H = heroes;
    this.state = 'off'; this.t = 0; this.stella = null; this.waits = []; this.plan = 'start'; this.mode = 'start';
    this.bt = new KaizoBoat(G, this);
    // (before she floats down: dropped, she comes again; once Kaizo is rowing home it just ends: she joins)
    const drop = () => { if (this.state === 'leave') this.endNow(); else this.reset(); };
    Events.on('mode:changed', drop);
    Events.on('hero:switching', drop);
  }
  get joined() { return !!this.G.state.flags.stellaJoined; }
  get busy() { return ['float', 'talk', 'greet', 'zoomies', 'leave'].includes(this.state); }
  get active() { return this.state !== 'off' && this.state !== 'done'; }
  // (the QA's and the tools' view of the staging)
  get kaizo() { return this.bt.kaizo; }
  get boat() { return this.bt.boat; }
  get boatAt() { return this.bt.boatAt; }
  get view() { return this.bt.view; }
  /** the arrival begins (actors/arrivals.js): plan 'start' (she asks for help), 'saved' (Shiokaze saved before she came),
   *  'had' (Captain Kaizo's quest already running, or done: an old save) */
  start(a, plan = 'start') {
    if (this.busy) return;
    this.reset(true);
    const Q = this.G.state.quests;
    this.plan = plan; this.state = 'wait'; this.t = 0; this.completed = false;
    this.mode = plan !== 'had' ? plan : Q.active.some(q => q.id === 'hq_shiokaze') ? 'kaizo' : 'thanks';
    this.bt.face();
  }
  reset(force = false) {
    if (this.busy && !force) return; // (the scene finishes what it started)
    const G = this.G;
    this.stella?.dispose(); this.stella = null;
    this.bt.dispose();
    this.releaseShadow();
    if (force && this.busy) { const P = G.player; if (P) { P.controlLocked = false; P.moveTarget = null; } G.introFocus = null; }
    if (G.sceneKeepOut?.by === 'stella') keepOut(G, null);
    this.waits.length = 0; this.state = 'off'; this.t = 0; this.stg = null; this.beat = null; this.loop = null; this.camFix = null; this.noticed = false;
  }
  /** Shadow back to himself: off his mark, his own speed, no play-bow */
  releaseShadow() {
    const sh = this.G.companion; if (!sh) return;
    if (sh.hold?.stl) sh.hold = null;
    if (this.shSpeed) { sh.speed = this.shSpeed; this.shSpeed = 0; }
    if (sh.anim?.action?.name === 'shdPlayBow') sh.anim.stop('shdPlayBow');
    this.bowing = 0;
  }
  /** resolves once fn() is true (checked every frame in update), or after max seconds */
  until(fn, max = 4) { return new Promise(res => this.waits.push({ fn, res, t: max })); }
  wait(s) { return this.until(() => false, s); }
  /** nothing else going on in town: a moment for a scene (actors/arrivals.js why) */
  calm() { return !this.H.arrivals?.why?.(); }
  update(dt) {
    const G = this.G;
    for (let i = this.waits.length - 1; i >= 0; i--) { const w = this.waits[i]; w.t -= dt; if (w.t <= 0 || w.fn()) { this.waits.splice(i, 1); w.res(); } }
    // (Kaizo's face for the card and the journal: an old save's quest of his, before Shiokaze Port's villagers register theirs)
    if (!this.bt.faced && G.registerPortrait && G.state.quests?.active?.some(q => q.id === 'hq_shiokaze') && heroQuestGiver(G.state, 'hq_shiokaze') === KAIZO_ID) this.bt.face();
    if (G.mode === 'village' && this.state === 'off') return this.townHint(dt);
    if (this.state !== 'wait') { this.bt.update(dt); if (this.stella) this.stella.update(dt); }
    if (this.bowing) this.bowLegs(); // (after Shadow's own pose this frame: game.js updates him before the heroes)
    if (this.busy && this.beat) this.frameTick();
    if (this.busy || this.state === 'off' || this.state === 'done') return;
    if (G.mode !== 'village') { this.reset(); return; }
    const P = G.player; if (!P || G.playerDead) { this.reset(); return; }
    this.t += dt;
    if (this.state === 'wait') {
      if (!this.stella) { this.stella = new SceneStella(G.world, G); this.stella.visible = false; this.stella.update(0); }
      if (this.bt.prepare() && this.t > 1.5 && this.calm()) this.land();
      return;
    }
    if (this.state === 'land') this.tickLand(dt, P);
  }
  // ------------------------------------------------------------------ the boat on the beach, her in its bow
  /** room to stand: dry, off the driftwood, clear of the boat, and not on Kaizo */
  free(x, z) { const k = this.bt.spot; return this.bt.free(x, z) && (!k || Math.hypot(x - k.x, z - k.z) > 1.1); }
  /** Kaizo's place while she's on the sand: beside his boat (off its far side from her mark, or by its stern), on the
   *  sand, clear of your marks and Shadow's */
  kaizoMark(st) {
    const bt = this.bt, b = bt.boatAt, o = bt.out, sd = bt.side, G = this.G; if (!b || !o) return null;
    const her = Math.sign((st.other.x - b.x) * sd.x + (st.other.z - b.z) * sd.z) || 1;
    let nodes = []; try { nodes = G.cozy?.scav?.nodes?.() || []; } catch (e) { nodes = []; }
    let best = null;
    for (const up of [-0.6, -0.2, 0.2, 0.6, 1.0, 1.5]) for (const s of [-1.05, -1.4, 1.05, 1.4]) {
      const x = b.x - o.x * up + sd.x * s * her, z = b.z - o.z * up + sd.z * s * her;
      if (!bt.dry(x, z) || !bt.offBoat(x, z, 0.05) || nodes.some(n => !n.taken && Math.hypot(n.x - x, n.z - z) < 0.75)) continue; // (beside the driftwood is fine: not on it)
      const clear = Math.min(...[st.me, st.other, st.shd].map(p => Math.hypot(p.x - x, p.z - z)));
      if (clear < 1.5) continue;
      const c = (paved(G, x, z) ? 0 : 1.5) + Math.abs(up - 0.2) * 0.4 + (s > 0 ? 0.6 : 0) - Math.min(clear, 3) * 0.3;
      if (!best || c < best.c) best = { x, z, c };
    }
    return best;
  }
  land() {
    const s = this.stella, sh = this.bt.land(), out = this.bt.out, { T } = camAxes(this.G);
    this.shore = sh;
    // in the bow, kneeling very upright under the open wagasa, eyes closed, facing the sun over the sea (a little toward the
    // camera, so her face reads)
    s.pos.copy(this.bt.onBoat(0.42, BOAT.seat - 0.02)); s.lift = true; s.inBoat = true;
    s.facing = s.faceTarget = turnTo(Math.atan2(out.x, out.z), Math.atan2(T[0], T[1]), 0.5);
    s.anim.play('stlSeat'); s.visible = true; s.update(0);
    this.state = 'land'; this.t = 0;
    Events.emit(EV, { phase: 'land' });
  }
  /** Shadow smells it (his tip, once it can show: never over a dialogue or another tip, never after the scene moved on) */
  notice() {
    const G = this.G, F = G.state.flags; if (F.hints?.stlBoat || this.t < 2 || !this.calm()) return;
    G.hint?.('stlBoat', '*Sniff sniff…* Salt, tar and old rope… and something warm, like a sunny windowsill. A boat just landed on the beach!', false);
    if (F.hints?.stlBoat && G.companion) G.vfx?.emote?.(G.companion, '?', 1.4);
  }
  tickLand(dt, P) {
    const s = this.stella, d = dist(P.pos.x, P.pos.z, s.pos.x, s.pos.z);
    this.notice();
    this.bt.watch(dt, P, dist(P.pos.x, P.pos.z, this.bt.kaizo.pos.x, this.bt.kaizo.pos.z));
    if (d < 6 && this.t > 0.6 && this.calm()) this.play(P);
  }
  // ------------------------------------------------------------------ the camera
  /** everyone in the beat in frame with a margin, in the middle of the band above the dialogue box (sceneStage.js frameFor):
   *  the float (her, Kaizo and the boat), the pair (you, her, Shadow), the loops (their extent), Kaizo's lines */
  frameTick() {
    const G = this.G, s = this.stella, P = G.player, k = this.bt.kaizo, sh = G.companion, b = this.beat; if (!s || !P) return;
    const pts = [[P.pos.x, P.pos.z, 0, 1.45], [s.pos.x, s.pos.z, Math.max(0, s.pos.y - G.world.heightAt(s.pos.x, s.pos.z)), Math.max(0, s.pos.y - G.world.heightAt(s.pos.x, s.pos.z)) + 1.5]];
    if (sh?.hold?.stl) pts.push([sh.pos.x, sh.pos.z, 0, 0.8]);
    if (k?.visible && (b === 'float' || b === 'kaizo')) pts.push([k.pos.x, k.pos.z, 0, 1.45]);
    if (b === 'float' && this.bt.boat) pts.push([this.bt.boat.position.x, this.bt.boat.position.z, 0, 0.6]);
    if (b === 'loop' && this.loop) for (const p of this.loop.ext) pts.push([p.x, p.z, 0, 1.6]);
    const TALK_MAX = 18, wide = b === 'loop' || b === 'float';
    frameGroup(G, pts, { min: 13, max: wide ? 22 : TALK_MAX });
    const fx = this.camFix; if (fx && b === 'pair') { G.introFocus.x += fx.x; G.introFocus.z += fx.z; G.engine.rig.distTarget += fx.d; } // (a lantern post or a branch would cross you from the plain framing)
    if (!wide) G.engine.rig.distTarget = Math.min(TALK_MAX, G.engine.rig.distTarget);
  }
  // ------------------------------------------------------------------ the dialogue
  say(lines, choices) { const G = this.G, s = this.stella; if (s) s.anim.talk = 0.8; return G.ui.dialogue({ speaker: this.H.name('stella'), portrait: G.portrait?.('stella'), lines, choices, voice: CAST.stella?.voice }).finally(() => { if (s) s.anim.talk = 0; }); }
  sayKaizo(lines, choices) {
    const G = this.G, k = this.bt.kaizo, prev = this.beat; if (k) { k.anim.talk = 0.8; if (this.stella) k.faceTo(this.stella.pos.x, this.stella.pos.z); }
    if (prev === 'pair') this.beat = 'kaizo';
    return G.ui.dialogue({ speaker: kaizoName(), portrait: G.portrait?.(KAIZO_ID), lines, choices, voice: ZONE_NPCS[KAIZO_ID]?.spec?.voice }).finally(() => { if (k) k.anim.talk = 0; if (this.beat === 'kaizo') this.beat = prev; });
  }
  // ------------------------------------------------------------------ the scene
  async play(P) {
    const G = this.G, s = this.stella, rig = G.engine.rig, sh = G.companion;
    this.state = 'float';
    P.controlLocked = true; P.moveTarget = null; G.skills?.charge?.cancel?.('scene', true);
    G.ui?.toasts?.retire?.(0); // (Shadow's "a boat just landed" steps aside)
    Events.emit(EV, { phase: 'float' });
    const prevDist = rig.distTarget;
    let leaving = false;
    try {
      if (!this.bt.view?.occ) this.bt.view?.ready();
      // the staging: her mark on the sand beside the boat (where she lands), yours 2.2 m across the screen, Shadow's
      // behind you both
      const st = this.stg = finish(stageTalk(G, P, { view: this.bt.view, free: (x, z) => this.free(x, z), other: this.bt.me, gap: 2.2, ups: [-0.5, -0.2, -0.8], tall: [1.45, 1.45], anchor: { x: this.bt.me.x, z: this.bt.me.z } }));
      keepOut(G, st.mid, 3.4); G.sceneKeepOut.by = 'stella';
      if (sh) { sh.hold = { x: st.shd.x, z: st.shd.z, face: Math.atan2(st.mid.x - st.shd.x, st.mid.z - st.shd.z), stl: true }; }
      const mark = st.moved ? new THREE.Vector3(st.me.x, G.world.heightAt(st.me.x, st.me.z), st.me.z) : null;
      P.moveTarget = mark;
      this.beat = 'float';
      // Kaizo by his boat, clear of your marks (he watches from there)
      const km = this.kaizoMark(st), k = this.bt.kaizo;
      if (km && k) this.bt.spot?.set(km.x, G.world.heightAt(km.x, km.z), km.z);
      if (km && k) this.until(() => !this.bt.kaizo || this.state !== 'float' || k.moveTo(km.x, km.z, 1 / 60, 0.8, 0.2), 4).then(() => { if (this.bt.kaizo === k && this.stella) k.faceTo(this.stella.pos.x, this.stella.pos.z); });
      // she opens her eyes, steps up onto the bow and off it: the wagasa catches the air (Kaizo, meanwhile: "Careful now—")
      const kz = this.wait(0.5).then(() => this.sayKaizo(['Careful now—', '…she always does that.']));
      await this.floatTo(st.other);
      await kz;
      // everyone on their marks
      await this.until(() => { if (mark && P.moveTarget !== mark) P.moveTarget = mark; const b = !st.moved || dist(P.pos.x, P.pos.z, st.me.x, st.me.z) < 0.3, c = !sh?.hold?.stl || dist(sh.pos.x, sh.pos.z, sh.hold.x, sh.hold.z) < 0.4; return b && c; }, 4);
      shadowOnMark(sh);
      if (st.moved && dist(P.pos.x, P.pos.z, st.me.x, st.me.z) > 0.6) P.setPos(st.me.x, st.me.z);
      P.moveTarget = null;
      faceUp(G, s, P, [0.4, 0.3]);
      // (the pair's framing in the clear from the camera's real place: frameClear's step, kept by frameTick)
      const pts = [[P.pos.x, P.pos.z, 0, 1.45], [s.pos.x, s.pos.z, 0, 1.5]]; if (sh?.hold?.stl) pts.push([sh.hold.x, sh.hold.z, 0, 0.8]);
      const base = frameFor(G, pts, { min: 13, max: 18 }), pick = this.bt.view?.occ ? frameClear(G, this.bt.view, pts, [P.pos, s.pos], sh?.hold?.stl ? [sh.pos] : [], { min: 13, max: 18 }) : null;
      this.camFix = base && pick?.moved ? { x: pick.focus.x - base.focus.x, z: pick.focus.z - base.focus.z, d: pick.dist - base.dist } : null; this.framed = pick?.moved ? 'moved' : 'base';
      this.beat = 'pair'; this.state = 'talk';
      Events.emit(EV, { phase: 'talk' });
      await this.wait(0.3);
      await this.talk(P);
      await this.greet(P);
      await this.zoomies(P);
      await this.warmth(P);
      await this.plea(P);
      // the leave: Kaizo rows home, she waves him off, a soft burst of light and she's gone
      this.state = 'leave'; leaving = true;
      Events.emit(EV, { phase: 'leave' });
      await this.leave(P);
    } finally {
      G.introFocus = null; rig.distTarget = prevDist; P.controlLocked = false; P.moveTarget = null; this.beat = null; this.loop = null; this.camFix = null;
      if (G.sceneKeepOut?.by === 'stella') keepOut(G, null);
      this.releaseShadow();
      if (!leaving && this.state !== 'off') this.reset(true);
    }
  }
  /** up onto the bow and off it, the wagasa catching the air: she drifts down onto the sand at `to` */
  async floatTo(to) {
    const G = this.G, s = this.stella, W = G.world, fx = stlFx(G), fin = new THREE.Vector3();
    s.anim.play('stlFloat'); s.inBoat = false; s.tilt = 0.5; // (her eyes open; the canopy leaned back a little)
    const seat = s.pos.clone(), bow = this.bt.onBoat(BOAT.half - 0.12, BOAT.seat + 0.2), face = Math.atan2(to.x - bow.x, to.z - bow.z);
    s.faceTarget = face;
    let T = clock();
    await this.until(() => { const e = Math.min(1, T() / 0.5); s.pos.lerpVectors(seat, bow, io(e)); s.pos.y += Math.sin(e * Math.PI) * 0.18; return e >= 1; }, 1.5);
    sfx('stl_parasol', { pos: s.pos, vol: 0.7 });
    // off the bow: a little lift as the canopy fills, then a slow, swaying drift down onto the sand
    const y1 = W.heightAt(to.x, to.z), from = s.pos.clone(), DUR = 1.9; let mt = 0;
    T = clock();
    await this.until(() => {
      const t = T(), e = Math.min(1, t / DUR), h = io(e);
      s.pos.x = from.x + (to.x - from.x) * h; s.pos.z = from.z + (to.z - from.z) * h;
      s.pos.y = from.y + (y1 - from.y) * (e * e * (3 - 2 * e)) + Math.sin(Math.min(1, e * 1.4) * Math.PI) * 0.45 * (1 - e * 0.5);
      s.facing = face + Math.sin(t * 3.1) * 0.08 * (1 - e);
      if (t - mt > 0.28 && s.parasol) { mt = t; fx.motes(finialWorld(s.parasol, fin), 2, { r: 0.3, rise: 0.4 }); }
      return e >= 1;
    }, DUR + 1);
    s.pos.set(to.x, y1, to.z); s.lift = false; s.shadow.scale.setScalar(1);
    s.anim.stop('stlFloat'); s.tilt = 0;
    G.vfx?.dust?.(s.pos, { n: 4 }); fx.motes(s.pos.clone().setY(y1 + 0.2), 5, { r: 0.5, rise: 0.5 });
  }
  async talk() {
    const G = this.G, me = this.H.name(), h = G.day?.hour ?? 9, morning = h >= 5 && h < 12;
    const a = await this.say([`Good morning. You must be ${me}.`, ...(morning ? [] : ["…It isn't morning? The sun doesn't mind. It's very forgiving."])], [{ text: 'Who are you?' }, { text: 'Nice parasol!' }]);
    await this.say(a === 0 ? ['Stella. I keep the sunrise shrine at Shiokaze Port. Every dawn I greet the sun over the sea.'] : ["It's a wagasa. It keeps the sun off, which is silly, because I'm on the sun's side."]);
    await this.say(["Excuse me. I haven't greeted the sun yet today."]);
  }
  /** she turns to the sun (across the screen, her bow in profile, her left toward the camera so the peek shows her face),
   *  raises the wagasa in both paws and bows; Shadow trots up beside her and copies her: a perfect play-bow */
  async greet() {
    const G = this.G, s = this.stella, sh = G.companion, { T, R } = camAxes(G);
    this.state = 'greet'; Events.emit(EV, { phase: 'greet' });
    const f = { x: -R[0], z: -R[1] }; s.faceTarget = Math.atan2(f.x, f.z);
    // Shadow's mark: at her left, toward the camera (a step ahead of her, so he's in plain view and in her peek)
    if (sh) {
      let m = null;
      for (const [t, a] of [[0.95, 0.15], [0.95, -0.25], [1.2, 0.1], [0.75, 0.5], [1.3, -0.4]]) { const x = s.pos.x + T[0] * t + f.x * a, z = s.pos.z + T[1] * t + f.z * a; if (this.free(x, z)) { m = { x, z }; break; } }
      m ||= { x: s.pos.x + T[0] * 0.95, z: s.pos.z + T[1] * 0.95 };
      sh.hold = { x: m.x, z: m.z, face: s.faceTarget, stl: true }; sh.anim?.stop?.('sit');
      this.bowAt = m;
    }
    await this.until(() => Math.abs(Math.atan2(Math.sin(s.faceTarget - s.facing), Math.cos(s.faceTarget - s.facing))) < 0.12 && (!sh || dist(sh.pos.x, sh.pos.z, sh.hold.x, sh.hold.z) < 0.35), 2.6);
    shadowOnMark(sh); if (sh) { sh.faceTarget = s.faceTarget; }
    await this.wait(0.3);
    const fx = stlFx(G), fin = new THREE.Vector3();
    let peeked = false;
    s.anim.play('stlGreet', { onEvent: e => {
      if (e === 'raise') { sfx('stl_greet', { pos: s.pos }); if (s.parasol) fx.motes(finialWorld(s.parasol, fin), 6, { r: 0.35, rise: 0.6 }); }
      if (e === 'bow' && sh) { sh.anim.play('shdPlayBow'); this.bowing = 1; sh.faceTarget = s.faceTarget; } // (beside her, Shadow copies her)
      if (e === 'peek') { peeked = true; }
    } });
    await this.until(() => peeked, 3);
    await this.wait(0.45);
    s.anim.play('stlPeek'); G.vfx?.emote?.(s, '!', 1.1); sfx('bark_small', { pos: sh?.pos || s.pos, pitch: 1.3, vol: 0.5 });
    await this.wait(1.0);
  }
  /** her composure breaks: two big bounding loops round you and Shadow, Shadow chasing her; she skids onto her mark */
  async zoomies(P) {
    const G = this.G, s = this.stella, sh = G.companion, fx = stlFx(G), st = this.stg, { T, R } = camAxes(G);
    this.state = 'zoomies'; Events.emit(EV, { phase: 'zoomies' });
    // the loops: round you and Shadow, wider across the screen than toward the camera (so they stay in the frame), each
    // point pulled in toward the middle off the sea and the boat
    const c = sh ? { x: (P.pos.x + sh.pos.x) / 2, z: (P.pos.z + sh.pos.z) / 2 } : { x: P.pos.x, z: P.pos.z };
    const ra = Math.max(2.3, dist(P.pos.x, P.pos.z, sh?.pos.x ?? P.pos.x, sh?.pos.z ?? P.pos.z) / 2 + 1.5), rb = ra * 0.7;
    const a0 = Math.atan2((s.pos.x - c.x) * R[0] + (s.pos.z - c.z) * R[1], (s.pos.x - c.x) * T[0] + (s.pos.z - c.z) * T[1]); // (her angle round the middle: across, toward)
    const path = [{ x: s.pos.x, z: s.pos.z }], N = 22, dir = 1, ext = [], kp = this.bt.kaizo?.pos;
    for (let i = 1; i <= N * 2; i++) {
      const a = a0 + dir * i / N * Math.PI * 2;
      let k = 1, x, z;
      for (; k > 0.35; k -= 0.08) { x = c.x + (R[0] * Math.sin(a) * ra + T[0] * Math.cos(a) * rb) * k; z = c.z + (R[1] * Math.sin(a) * ra + T[1] * Math.cos(a) * rb) * k; if (this.bt.dry(x, z) && this.bt.offBoat(x, z, 0.2) && (!kp || Math.hypot(x - kp.x, z - kp.z) > 1.0)) break; }
      path.push({ x, z });
      if (i <= N && i % Math.round(N / 4) === 0) ext.push({ x, z });
    }
    path.push({ x: st.other.x, z: st.other.z }); // (the skid onto her mark)
    this.loop = { ext }; this.beat = 'loop';
    // Shadow, out of his bow and after her
    if (sh) { this.bowing = 0; sh.anim.stop('shdPlayBow'); this.shSpeed = sh.speed; sh.speed *= 1.9; G.vfx?.emote?.(sh, '!', 0.9); }
    s.anim.play('stlZoom'); s.tilt = 1; sfx('stl_zoomies', { pos: s.pos }); // (the wagasa high and leaned back: never over her face)
    // along the path at a gallop, a little bound in each stride; motes and sunny paw prints behind her
    const L = []; let tot = 0; for (let i = 1; i < path.length; i++) { const d = Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z); L.push(d); tot += d; }
    const SPD = 6.4, DS = 0.9, at = (u, out) => { let d = u * tot, i = 0; while (i < L.length - 1 && d > L[i]) { d -= L[i]; i++; } const p = path[i], q = path[i + 1], e = L[i] ? Math.min(1, d / L[i]) : 1; out.x = p.x + (q.x - p.x) * e; out.z = p.z + (q.z - p.z) * e; return i; };
    const cur = { x: 0, z: 0 }, tail = { x: 0, z: 0 }, nx = { x: 0, z: 0 }; let mt = 0, pt = 0;
    // (at a gallop, then the skid: the last DS m at an even deceleration onto her mark)
    const T0 = clock(), DUR = (tot + DS) / SPD, far = Math.max(0, tot - DS), runT = far / SPD;
    const along = t => (t < runT ? SPD * t : Math.min(tot, far + SPD * (t - runT) - SPD * SPD * (t - runT) ** 2 / (4 * DS)));
    await this.until(() => {
      const t = T0(), u = this.zoomU = Math.min(1, t / DUR), ue = tot ? along(t) / tot : 1;
      at(ue, cur); at(Math.min(1, ue + 0.01), nx);
      s.pos.set(cur.x, G.world.heightAt(cur.x, cur.z) + Math.abs(Math.sin(t * 9)) * 0.12 * (1 - Math.max(0, (u - 0.85) / 0.15)), cur.z); s.lift = true;
      if (Math.hypot(nx.x - cur.x, nx.z - cur.z) > 1e-3) s.faceTarget = s.facing = Math.atan2(nx.x - cur.x, nx.z - cur.z);
      if (sh) { at(Math.max(0, ue - 1.5 / tot), tail); sh.hold = { x: tail.x, z: tail.z, face: s.facing, stl: true }; }
      if (t - mt > 0.11 && u < 0.95) { mt = t; fx.motes(new THREE.Vector3(cur.x, s.pos.y + 0.5, cur.z), 2, { r: 0.25, rise: 0.5 }); }
      if (t - pt > 0.24 && u < 0.92) { pt = t; fx.paw(new THREE.Vector3(cur.x, G.world.heightAt(cur.x, cur.z), cur.z), s.facing); }
      return u >= 1;
    }, DUR + 2);
    s.pos.set(st.other.x, G.world.heightAt(st.other.x, st.other.z), st.other.z); s.lift = false; s.tilt = 0;
    G.vfx?.dust?.(s.pos, { n: 6, size: 0.35 }); sfx('stl_catch', { pos: s.pos, vol: 0.5 });
    // Shadow trots back toward his mark, very pleased (panting)
    if (sh) { sh.speed = this.shSpeed || sh.speed; this.shSpeed = 0; sh.hold = { x: st.shd.x, z: st.shd.z, face: Math.atan2(s.pos.x - st.shd.x, s.pos.z - st.shd.z), stl: true }; sh.anim.mood = 1; }
    this.loop = null; this.beat = 'pair';
    // she smooths her robe, ears askew: very composed
    s.faceTo(P.pos.x, P.pos.z); s.faceTarget = turnTo(s.faceTarget, Math.atan2(T[0], T[1]), 0.4);
    s.anim.play('stlComposed'); G.vfx?.emote?.(s, 'sweat', 1.6);
    await this.wait(0.9);
    if (sh) G.vfx?.emote?.(sh, 'heart', 1.6);
    await this.say(['…Ahem.', 'The sun is greeted.']);
    await this.sayKaizo(['She does that.']);
  }
  /** her support, shown once: Shadow is panting; she touches his nose with the wagasa's tip and a little morning light
   *  washes over him */
  async warmth() {
    const G = this.G, s = this.stella, sh = G.companion, { T } = camAxes(G);
    if (sh) {
      let m = null;
      const R = camAxes(G).R, toP = Math.sign((G.player.pos.x - s.pos.x) * R[0] + (G.player.pos.z - s.pos.z) * R[1]) || 1; // (on your side of her: between you two)
      for (const [a, t] of [[1.0, 0.25], [1.0, 0.55], [0.95, -0.1], [-1.0, 0.25], [-1.0, 0.55]]) { const x = s.pos.x + R[0] * a * toP + T[0] * t, z = s.pos.z + R[1] * a * toP + T[1] * t; if (this.free(x, z)) { m = { x, z }; break; } }
      m ||= { x: s.pos.x + R[0] * toP, z: s.pos.z + R[1] * toP };
      sh.hold = { x: m.x, z: m.z, face: Math.atan2(s.pos.x - m.x, s.pos.z - m.z), stl: true };
      await this.until(() => dist(sh.pos.x, sh.pos.z, m.x, m.z) < 0.35, 2.5); shadowOnMark(sh);
      s.faceTo(m.x, m.z);
      await this.until(() => Math.abs(Math.atan2(Math.sin(s.faceTarget - s.facing), Math.cos(s.faceTarget - s.facing))) < 0.15, 0.8);
    }
    const fx = stlFx(G);
    let touched = false;
    s.anim.play('stlTouch', { onEvent: e => { if (e !== 'touch' || !sh) return; touched = true; const p = sh.pos.clone(); fx.wash(p, 1.1, { k: 0.6 }); fx.ripple(p.clone().setY(p.y + 0.05), 0.8); fx.motes(p.clone().setY(p.y + 0.5), 5, { r: 0.35, rise: 0.6, rose: true }); sfx('stl_bell', { pos: p, vol: 0.6 }); G.vfx?.emote?.(sh, 'heart', 1.4); sh.anim.play('happy'); } });
    await this.until(() => touched, 1.4);
    await this.wait(0.7);
    await this.say(['There. Thank you for bowing with me. Your form was better than mine.']);
  }
  /** the plea (her quest), or a thank-you (Shiokaze saved before she came, Kaizo's quest running or done) */
  async plea(P) {
    const G = this.G, s = this.stella, sh = G.companion;
    if (sh?.hold?.stl) { const st = this.stg; sh.hold = { x: st.shd.x, z: st.shd.z, face: Math.atan2(st.mid.x - st.shd.x, st.mid.z - st.shd.z), stl: true }; }
    faceUp(G, s, P, [0.4, 0.3]);
    G.actions.prepareJoin?.('stella');
    const oracle = "I'm the oracle of Shiokaze's little sunrise shrine. It's a very important job. The sun has never once been late.";
    const crew = this.H.arrivals?.savedBy?.('tidepool') === 'crew';
    const lines = {
      start: [oracle, 'But the port is under siege. Crabs on the shrine steps, kappa on the roofs, and a crab the size of a boathouse in the square. Captain Brineclaw.', 'With so many yokai about, the sun comes up grey.', "An oracle should be patient. I've been patient for weeks.", '…May I join your pack? And will you come and give Shiokaze its sunrise back?'],
      kaizo: [oracle, "Captain Kaizo told me he'd already found you, and that you'd said yes. So I came too. The sun shouldn't have to wait.", '…May I join your pack?'],
      thanks: ["You gave Shiokaze its sunrise back before I'd even met you. Captain Kaizo told me. Twice.", '…So I came to say thank you. And to join, if you\'ll have me.'],
      saved: [oracle, crew ? '…but my gulls tell me your crew already chased the crabs back to sea. The sun came up gold this morning, and I wondered why.' : '…but my gulls tell me the crabs went back to sea. The sun came up gold this morning, and I wondered why.', ...(crew ? [] : ["…It was you, wasn't it? You've got sunshine on your nose."]), 'So I came to say thank you. And to join, if you\'ll have me.'],
    }[this.mode] || [];
    const c = await this.say(lines, [{ text: 'Welcome to the pack! ♡' }, { text: 'Only if you teach me that bow.' }]);
    await this.say(c === 1 ? ["Shadow will teach you. He's better at it than me."] : ["Thank you. I'll keep you warm. And a little bit on fire, if anyone's rude."]);
  }
  async leave(P) {
    const G = this.G, s = this.stella, sh = G.companion, k = this.bt.kaizo;
    this.releaseShadow();
    if (G.sceneKeepOut?.by === 'stella') keepOut(G, null);
    if (k) await this.sayKaizo(["I'll row on ahead and put the kettle on, matey. You'll find me at my lookout."]);
    this.beat = null;
    // he rows home; she waves him off with the wagasa
    let wv = 0; s.tilt = 0.6;
    const waving = () => { if (!this.stella || this.state !== 'leave' || !this.bt.boat) return true; if (this.bt.kaizo) s.faceTo(this.bt.kaizo.pos.x, this.bt.kaizo.pos.z); if ((wv -= 1 / 60) <= 0 && s.anim.action?.name !== 'stlWave') { wv = 1.25; s.anim.play('stlWave'); } return false; };
    this.until(waving, 12);
    await this.bt.goHome(P, () => [[s.pos.x, s.pos.z, 0, 1.5]]);
    if (!this.stella) return;
    // she lifts the wagasa, a soft burst of light, and she's gone to the cottage
    s.faceTo(P.pos.x, P.pos.z); s.faceTarget = turnTo(s.faceTarget, Math.atan2(camAxes(G).T[0], camAxes(G).T[1]), 0.5);
    this.beat = 'pair'; s.tilt = 0;
    s.anim.play('stlWave'); await this.wait(0.7);
    s.anim.play('stlFloat'); sfx('stl_parasol', { pos: s.pos }); await this.wait(0.45);
    const fx = stlFx(G), p = s.pos.clone().setY(s.pos.y + 0.7);
    fx.motes(p, 14, { r: 0.6, rise: 1.1 }); fx.disc(p.clone().setY(p.y + 0.5), { r: 0.45, life: 0.35 }); G.vfx?.poof?.(p, { color: '#fff1c8', n: 12, size: 0.6 }); sfx('stl_bell', { pos: p, vol: 0.7 });
    s.visible = false; s.update(0);
    void sh;
    await this.complete();
  }
  /** she joins and the arrival is recorded (her quest and its card; an old save's Kaizo quest stays his) */
  async complete() {
    if (this.completed) return; this.completed = true;
    const G = this.G, F = G.state.flags, prev = F.arrivals?.tidepool || null;
    if (this.mode === 'kaizo') { const q = G.state.quests.active.find(x => x.id === 'hq_shiokaze'); if (q && !q.giver) q.giver = KAIZO_ID; } // (his, as it always was: the hand-in at his lookout)
    await this.H.joinStella();
    this.H.arrivals?.finished?.('stella', prev && !prev.by ? { kaizo: prev } : null);
    this.state = 'done';
    Events.emit(EV, { phase: 'done' });
    // (the scene's leftovers a moment later: the banner is up)
    this.until(() => false, 0.6).then(() => { if (this.state === 'done') { this.stella?.dispose(); this.stella = null; this.bt.dispose(); } });
  }
  /** a reset once Kaizo is rowing home: it just ends (she joins, the arrival recorded) */
  endNow() {
    const G = this.G, P = G.player;
    if (P) { P.controlLocked = false; P.moveTarget = null; } G.introFocus = null;
    this.releaseShadow();
    if (G.sceneKeepOut?.by === 'stella') keepOut(G, null);
    this.waits.length = 0;
    this.complete().finally(() => { this.stella?.dispose(); this.stella = null; this.bt.dispose(); this.state = 'done'; });
  }
  // ------------------------------------------------------------------ Shadow's play-bow (his front legs laid forward)
  bowLegs() {
    const sh = this.G.companion, L = sh?.rig?.parts?.legs; if (!L || sh.anim.action?.name !== 'shdPlayBow') { this.bowing = 0; return; }
    const k = io(Math.min(1, (sh.anim.action.t || 0) / 0.3)), rest = sh.anim.rest;
    for (const [i, a] of [[0, -1.4], [1, -1.3], [2, -0.5], [3, -0.5]]) { const l = L[i], r = rest.get(l); if (r) l.rotation.x = r.r.x + a * k; } // (the front legs laid forward along the sand, the hind ones kept under the raised rump)
    const tl = sh.rig.parts.tail; if (tl) tl.rotation.x = -0.3 - 0.6 * k; // (his tail up and going)
  }
  // ------------------------------------------------------------------ the maps and the pointer (actors/arrivals.js)
  person() {
    const s = this.stella; if (!s?.visible || !this.active || this.G.mode !== 'village') return null;
    return { key: 'p:arrival:stella', kind: 'person', group: 'quest', id: 'stella', name: '???', role: 'Just landed on the beach', color: '#e0a030', initial: '?', npc: s, pos: s.pos, visible: true, badge: '!', prio: 7, named: true, area: 'village', arrival: true };
  }
  target() { const s = this.stella; return this.state === 'land' && s?.visible ? { pos: s.pos, label: 'A boat on the beach', kind: 'npc', arrival: 'stella' } : null; }
  // ------------------------------------------------------------------ the rumour in town
  townHint(dt) {
    const G = this.G, F = G.state.flags;
    if (this.joined || !this.H.joined('shihtzu') || F.hints?.stlRumour) return;
    const u = regionUnlocked(G.state, 'tidepool'); if (u.ok) return; // (the Tide Pool is open: she comes to town herself, actors/arrivals.js)
    if ((this.hintT = (this.hintT || 0) + dt) < 12 || G.ui?.dlg?.active || G.tutorials?.busy || G.tutorials?.cur || G.titleActive || this.H.arrivals?.active || G.player?.controlLocked) return; // (never over an arrival's scene)
    G.hint?.('stlRumour', `*Sniff sniff…* Captain Kaizo's gulls say Shiokaze Port has an oracle who bows to the sun every morning, and the sun bows back. Once the Wayfarer's Post opens the Tidepools (${u.why.toLowerCase()}), I bet she'll come to us!`);
  }
}
