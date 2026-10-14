// Poe arrives in Blossom Hollow (docs/POE.md §5; ROADMAP Z-H3): her old Bamboo Grove scene, moved to the island. The
// arrivals (actors/arrivals.js) start it once the Bamboo opens (Moka joined, the next calm moment in town); HeroManager
// owns it (heroes.poeJoin) and Arrivals calls update(dt) every frame.
//   wait   — her rig is built hidden; once you've walked a little round the plaza (or, after a while, wherever you are in
//            town) and nothing else is going on, she starts
//   tail   — she "stealthily" follows 4–7 m behind along your path (always on screen), crouched on tiptoe. Look her way
//            and she freezes stiff as a lantern post (eyes shut: if she can't see you…); she snorts now and then, and
//            Shadow notices
//   caught — after a while (or if you walk right up to her) she sneezes: ACHOO! You both turn, the camera frames you,
//            she trots up, embarrassed
//   talk   — she insists it was a test; then the truth: Takemori is under siege and she came to fetch help (or, the
//            village saved before she came, to say thank you); she joins (HeroManager.joinPoe: the banner,
//            flags.poeJoined) and vanishes in a puff of smoke "to meet you at the cottage"; Arrivals.finished starts her
//            quest ("Takemori Under Siege") with its card
// Leaving town, a hero switch or a knock-out before she's caught drops the scene: the arrival comes again a little later.
// The rumour: in town, once Moka has joined and before the Bamboo opens, Shadow passes on a rumour about the bamboo (once).
import * as THREE from 'three';
import { Actor } from './actor.js';
import { Player } from './player.js';
import { Events } from '../core/events.js';
import { regionUnlocked } from '../regions/index.js';
import { LANDMARKS } from '../world/layout.js';
import { poeFx, POE_COL } from '../gfx/poeFx.js';
import { SceneView, frameGroup, keepOut, stageTalk, finish, frameClear, faceUp, shadowOnMark } from './sceneStage.js';
import { dist, rand } from '../core/util.js';

const sfx = (n, o) => Events.emit('sfx', n, o);
const TRAIL_STEP = 0.5, TRAIL_N = 40, BEHIND = 7, MIN_BEHIND = 3.6;
const PLAZA_R = 28;   // m from the fountain: "round the plaza", where she starts tailing you
const ANYWHERE_S = 40; // s in town elsewhere before she tails you wherever you are (never strand an arrival)

/** the scene's Poe: just a rig that walks (no villager life) */
class TailingPoe extends Actor {
  constructor(world, G) {
    super(world, Player.buildRig(undefined, 'poe'), { radius: 0.28, speed: 4.6, name: 'Poe' });
    this.G = G; this.height = this.rig.height || 1.1;
  }
}

export class PoeJoin {
  constructor(G, heroes) {
    this.G = G; this.H = heroes;
    this.state = 'off'; this.t = 0; this.poe = null; this.trail = []; this.walked = 0; this.last = null; this.waits = []; this.plan = 'start';
    Events.on('mode:changed', () => this.reset());
    Events.on('hero:switching', () => this.reset());
  }
  get joined() { return !!this.G.state.flags.poeJoined; }
  get busy() { return this.state === 'caught' || this.state === 'talk'; }
  get active() { return this.state !== 'off' && this.state !== 'done'; }
  /** the arrival begins (actors/arrivals.js): plan 'start' (she asks for help), 'saved' (Takemori was saved before she came:
   *  a thank-you), 'had' (her quest already ran) */
  start(a, plan = 'start') {
    if (this.busy) return;
    this.reset(true);
    this.plan = plan; this.state = 'wait'; this.t = 0; this.inTown = 0;
  }
  reset(force = false) {
    if (this.busy && !force) return; // (the scene finishes what it started)
    this.poe?.dispose(); this.poe = null; this.trail.length = 0; this.walked = 0; this.last = null; this.waits.length = 0;
    if (force && this.busy) { const P = this.G.player; if (P) { P.controlLocked = false; P.moveTarget = null; } this.G.introFocus = null; }
    this.view?.dispose(); this.view = null; this.stg = null;
    if (this.G.sceneKeepOut?.by === 'poe') keepOut(this.G, null);
    if (this.G.companion?.hold?.poe) this.G.companion.hold = null;
    this.state = 'off'; this.t = 0;
  }
  /** resolves once fn() is true (checked every frame in update), or after max seconds */
  until(fn, max = 4) { return new Promise(res => this.waits.push({ fn, res, t: max })); }
  /** nothing else going on in town: a moment for a scene (actors/arrivals.js why) */
  calm() { return !this.H.arrivals?.why?.(); }
  update(dt) {
    const G = this.G;
    for (let i = this.waits.length - 1; i >= 0; i--) { const w = this.waits[i]; w.t -= dt; if (w.t <= 0 || w.fn()) { this.waits.splice(i, 1); w.res(); } }
    if (G.mode === 'village' && this.state === 'off') return this.townHint(dt);
    if (this.poe && this.state !== 'wait') this.poe.update(dt);
    if (this.busy || this.state === 'off' || this.state === 'done') return;
    if (G.mode !== 'village') { this.reset(); return; }
    const P = G.player; if (!P || G.playerDead) { this.reset(); return; }
    this.t += dt;
    if (this.state === 'wait') {
      // (her rig is built now, out of sight: no hitch when she shows up)
      if (!this.poe) { this.poe = new TailingPoe(G.world, G); this.poe.visible = false; this.poe.setPos(P.pos.x, P.pos.z); this.poe.update(0); }
      this.track(P);
      const F = LANDMARKS.fountain, near = dist(P.pos.x, P.pos.z, F.x, F.z) < PLAZA_R;
      if (this.calm()) this.inTown += dt;
      if (this.t > 4 && this.walked > 6 && this.calm() && (near || this.inTown > ANYWHERE_S)) this.beginTail(P, near);
      return;
    }
    if (this.state === 'tail') this.tickTail(dt, P);
  }
  /** the hero's path, a point every half metre (she follows it, not a straight line through the houses) */
  track(P) {
    const L = this.last;
    if (!L) { this.last = P.pos.clone(); this.trail.unshift(P.pos.clone()); return; }
    const d = dist(P.pos.x, P.pos.z, L.x, L.z);
    if (d > 6) { this.trail.length = 0; this.trail.unshift(P.pos.clone()); L.copy(P.pos); return; } // (a teleport: the old path is no way here)
    if (d >= TRAIL_STEP) { this.walked += d; L.copy(P.pos); this.trail.unshift(P.pos.clone()); if (this.trail.length > TRAIL_N) this.trail.pop(); }
  }
  /** the trail point m metres back (or the oldest) */
  trailAt(m) { return this.trail[Math.min(this.trail.length - 1, Math.round(m / TRAIL_STEP))] || null; }
  /** on screen and clear of the HUD (the bars along the bottom, the minimap) */
  onScreen(x, y, z, m = 0) {
    const cam = this.G.engine?.camera; if (!cam) return true;
    const v = (this._v ||= new THREE.Vector3()).set(x, y + 0.6, z).project(cam);
    const phone = !!this.G.ui?.root?.classList?.contains('m-phone'); // (a phone's HUD takes more of its short screen: the stick and buttons below, the portrait and the map above)
    return Math.abs(v.x) < (phone ? 0.7 : 0.78) - m && v.y > (phone ? -0.42 : -0.55) + m && v.y < (phone ? 0.56 : 0.7) - m;
  }
  free(x, z) { const W = this.G.world; return W.walkable?.(x, z) !== false && !W.collision?.solidAt?.(x, z, 0.35); }
  /** where she tails from (the gag only works if you can see her): as far back along your path as BEHIND while that's
   *  on screen (walking down-screen or across: the full 7 m). Walking up-screen the path behind runs off the bottom of
   *  the screen within a few metres, so she sneaks along beside it instead, 3.5–5.5 m off to one side (a lantern post
   *  at a time), keeping to the side she's on. */
  behindPoint() {
    const G = this.G, P = G.player;
    const iMax = Math.min(this.trail.length - 1, Math.round(BEHIND / TRAIL_STEP)), iMin = Math.round(MIN_BEHIND / TRAIL_STEP);
    // (behind a roof or a tree she can't be seen: a few new ray tests a frame, the answers kept; a spot not tested yet counts
    //  as hidden this frame, so she never settles where the camera can't see her)
    const V = this.view?.occ ? this.view : null, H = [0.4, 0.8];
    let tests = 4; const hidden = (x, z) => { if (!V || !V.covers(x, z)) return false; const k = V.known(x, z, H, 0.15); if (k !== undefined) return k; return tests-- > 0 ? V.screened(x, z, H, 0.15) : true; };
    for (let i = iMax; i >= iMin; i--) { const p = this.trail[i]; if (this.onScreen(p.x, p.y, p.z, 0.12) && !hidden(p.x, p.z)) { this.tgtI = i; return p; } }
    this.tgtI = -1;
    const rig = G.engine?.rig; if (!rig?.groundAxes || !P) return this.trail[Math.min(iMax, iMin)] || null;
    const { f, r } = rig.groundAxes(), out = this._side ||= new THREE.Vector3();
    const poe = this.poe, now = poe ? Math.sign((poe.pos.x - P.pos.x) * r.x + (poe.pos.z - P.pos.z) * r.z) || 1 : 1;
    for (const s of [now, -now]) for (const k of [4.5, 5, 4, 5.5, 3.5]) for (const back of [1, 0.5, 0, 1.5]) {
      const x = P.pos.x - f.x * back + r.x * k * s, z = P.pos.z - f.z * back + r.z * k * s;
      if (this.free(x, z) && this.onScreen(x, P.pos.y, z, 0.12) && !hidden(x, z)) return out.set(x, P.pos.y, z);
    }
    return this.trail[Math.min(iMax, iMin)] || null;
  }
  beginTail(P, plaza) {
    const G = this.G, poe = this.poe;
    let at = this.trailAt(12) || P.pos; // (she sneaks in from round the last corner, 12 m back)
    if (!this.free(at.x, at.z)) at = this.trailAt(8) || P.pos;
    poe.setPos(at.x, at.z); poe.visible = true; poe.faceTo(P.pos.x, P.pos.z); poe.facing = poe.faceTarget;
    poe.anim.play('sneakWalk');
    this.state = 'tail'; this.t = 0; this.snortT = 3 + rand(0, 2); this.frozen = false; this.freezes = 0; this.plaza = plaza;
    // the scenery round the plaza (or round you), built a little a frame while she tails you: where the scene can play in
    // plain view of the camera (actors/sceneStage.js)
    const F = LANDMARKS.fountain; this.view = new SceneView(G, plaza ? F : P.pos, { w: 16, back: 12, front: 22 });
    Events.emit('poe:joinScene', { phase: 'tail' });
    // a nudge for the player: Shadow pricks up his ears
    this.until(() => this.state !== 'tail' || this.t > 2.5).then(() => {
      if (this.state !== 'tail') return;
      if (G.companion) G.vfx?.emote?.(G.companion, '?', 1.4);
      G.hint?.('poeTailTown', '*Sniff…* Psst! Something is following us… and it smells like bamboo.', false);
    });
  }
  tickTail(dt, P) {
    const G = this.G, poe = this.poe, fx = poeFx(G);
    this.track(P);
    if (this.view && !this.view.fresh) { this.view.dispose(); this.view = new SceneView(G, P.pos, { w: 16, back: 12, front: 22 }); } // (the camera turned: build it again)
    this.view?.prepStep(3);
    const d = dist(P.pos.x, P.pos.z, poe.pos.x, poe.pos.z);
    // caught: she's been at it a while (and nothing else is going on), or you walked right up to her
    if (this.calm() && (this.t > 16 || (d < 2.6 && this.t > 2))) { this.caught(P); return; }
    // is the hero looking her way? then freeze — perfectly still, eyes shut, a very convincing lantern post
    const toPoe = Math.atan2(poe.pos.x - P.pos.x, poe.pos.z - P.pos.z), look = Math.abs(((P.facing - toPoe + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    const seen = look < 0.9 && d < 11;
    if (seen !== this.frozen) {
      this.frozen = seen;
      if (seen) { poe.anim.play('ninjaFreeze'); this.freezes++; G.vfx?.emote?.(poe, 'sweat', 1.1); } else poe.anim.play('sneakWalk');
    }
    if (!this.frozen) {
      const tgt = this.behindPoint();
      if (tgt && dist(tgt.x, tgt.z, P.pos.x, P.pos.z) > 3.5) {
        // (on your path she follows it, a point or two ahead of where she is on it: round the signpost, never into it)
        let to = tgt;
        if (this.tgtI >= 0) { let j = -1, bd = 1.2; for (let k = this.tgtI; k < this.trail.length; k++) { const q = this.trail[k], e = dist(q.x, q.z, poe.pos.x, poe.pos.z); if (e < bd) { bd = e; j = k; } } if (j > this.tgtI) to = this.trail[Math.max(this.tgtI, j - 2)]; }
        const was = dist(poe.pos.x, poe.pos.z, tgt.x, tgt.z);
        poe.moveTo(to.x, to.z, dt, 1, 0.4);
        const now = dist(poe.pos.x, poe.pos.z, tgt.x, tgt.z);
        this.stuckT = now > 0.6 && was - now < dt * 0.8 ? (this.stuckT || 0) + dt : 0;
        if (this.stuckT > 0.7 && !this.onScreen(poe.pos.x, poe.pos.y, poe.pos.z)) { poe.setPos(tgt.x, tgt.z); this.stuckT = 0; } // (stuck where you can't see her: she's simply there)
      } else poe.faceTo(P.pos.x, P.pos.z);
      if (d > 16) { const b = this.trailAt(11) || P.pos; poe.setPos(b.x, b.z); } // (fell behind round a corner: she catches up, out of sight)
    }
    // a little pug snort now and then (Shadow hears it)
    this.snortT -= dt;
    if (this.snortT <= 0) {
      this.snortT = rand(4, 6.5);
      fx.pn.spawn({ frame: 0, x: poe.pos.x + Math.sin(poe.facing) * 0.35, y: poe.pos.y + 0.9, z: poe.pos.z + Math.cos(poe.facing) * 0.35, vy: 0.3, life: 0.5, size: 0.14, size1: 0.3, color: POE_COL.smoke, alpha: 0.7, alpha1: 0 });
      sfx('poe_snort', { pos: poe.pos, vol: 0.6 });
      if (Math.random() < 0.5 && G.companion) G.vfx?.emote?.(G.companion, '?', 1.0);
    }
  }
  /** ah… ah… ACHOO! The game is up. */
  async caught(P) {
    const G = this.G, poe = this.poe, fx = poeFx(G), rig = G.engine.rig;
    this.state = 'caught';
    P.controlLocked = true; P.moveTarget = null; G.skills?.charge?.cancel?.('scene', true);
    G.ui?.toasts?.retire?.(0); // (Shadow's "something is following us" steps aside: the game is up)
    keepOut(G, { x: (P.pos.x + poe.pos.x) / 2, z: (P.pos.z + poe.pos.z) / 2 }, 3.6); G.sceneKeepOut.by = 'poe'; // (the villagers start walking round you both at once)
    poe.faceTo(P.pos.x, P.pos.z);
    Events.emit('poe:joinScene', { phase: 'caught' });
    let sneezed = false;
    poe.anim.play('sneeze', { onEvent: ev => {
      if (ev !== 'achoo') return;
      sneezed = true;
      const f = new THREE.Vector3(Math.sin(poe.facing), 0, Math.cos(poe.facing));
      fx.sneeze(new THREE.Vector3(poe.pos.x, poe.pos.y + 0.95, poe.pos.z).addScaledVector(f, 0.35), f); sfx('poe_sneeze');
      P.faceTo(poe.pos.x, poe.pos.z); G.vfx?.emote?.(P, '!', 1.4); if (G.companion) G.vfx?.emote?.(G.companion, '!', 1.4);
    } });
    let job = null, st = null; // (the view, then the staging, a few ms a frame while she sneezes)
    await this.until(() => { if (!this.view || this.view.prepStep(6)) { job ||= this.stageJob(P); const t0 = performance.now(); while (!st && performance.now() - t0 < 5) { const r = job.next(); if (r.done) st = r.value; } } return sneezed && poe.anim.action?.name !== 'sneeze'; }, 3);
    const prevDist = rig.distTarget, sh = G.companion;
    try {
      // the staging: your mark (where you are, or a step from it) and hers beside you across the screen, Shadow's in front,
      // all in plain view of the camera and clear of the villagers, who walk round you both while you talk
      if (!st) { if (job) { let r; do r = job.next(); while (!r.done); st = r.value; } else st = this.stage(P); }
      this.stg = st;
      keepOut(G, st.mid, 3.2); G.sceneKeepOut.by = 'poe';
      if (sh) sh.hold = { x: st.shd.x, z: st.shd.z, face: Math.atan2(st.mid.x - st.shd.x, st.mid.z - st.shd.z), poe: true };
      frameGroup(G, this.framePts(P), { min: 12, max: 17 });
      // she trots up, embarrassed (and you take a step to your mark if you need one)
      const mark = st.moved ? new THREE.Vector3(st.me.x, G.world.heightAt(st.me.x, st.me.z), st.me.z) : null;
      P.moveTarget = mark;
      await this.until(() => { if (P.moveTarget !== mark) P.moveTarget = mark; const a = poe.moveTo(st.other.x, st.other.z, 1 / 60, 0.55, 0.25), b = !st.moved || dist(P.pos.x, P.pos.z, st.me.x, st.me.z) < 0.3, c = !sh?.hold?.poe || dist(sh.pos.x, sh.pos.z, sh.hold.x, sh.hold.z) < 0.4; frameGroup(G, this.framePts(P), { min: 12, max: 17 }); return a && b && c; }, 3.5); // (Shadow on his mark too, before she speaks)
      shadowOnMark(sh);
      if (st.moved && dist(P.pos.x, P.pos.z, st.me.x, st.me.z) > 0.6) P.setPos(st.me.x, st.me.z); // (blocked on the way: on the mark)
      P.moveTarget = null;
      this.faceUp(P);
      this.frameClear(P);
      this.state = 'talk';
      await this.talk(P);
    } finally {
      G.introFocus = null; rig.distTarget = prevDist; P.controlLocked = false; P.moveTarget = null;
      if (G.sceneKeepOut?.by === 'poe') keepOut(G, null);
      if (sh?.hold?.poe) sh.hold = null;
      this.view?.dispose(); this.view = null;
      this.state = this.joined ? 'done' : 'off';
      if (!this.joined) this.reset(true);
      else this.H.arrivals?.finished?.('poe'); // (the arrival recorded; her quest and its card, once the scene's camera has let go)
    }
  }
  /** the scene's marks, worked out once when she's caught (actors/sceneStage.js stageTalk): yours (where you stand, or a few
   *  steps away, on paving if it can be), hers 2.3 m across the screen and a little up-screen (facing you, she half faces
   *  the camera), Shadow's just behind you both; all in plain view of where the scene's camera will be, clear of villagers */
  stageJob(P) { return stageTalk(this.G, P, { view: this.view, free: (x, z) => this.free(x, z), other: this.poe.pos, gap: 2.3, ups: [-0.4, -0.1, -0.7], tall: [1.45, 1.3] }); }
  stage(P) { return finish(this.stageJob(P)); }
  /** you and her face each other, each turned a little toward the camera (so the faces read from up here) */
  faceUp(P) { faceUp(this.G, this.poe, P, [0.42, 0.3]); }
  /** the scene's camera where you all stand now, in the clear (sceneStage.js frameClear) */
  frameClear(P) { const sh = this.G.companion, fr = frameClear(this.G, this.view, this.framePts(P), [P.pos, this.poe.pos], sh?.hold?.poe ? [sh.pos] : []); this.framed = fr?.moved ? 'moved' : 'base'; }
  /** who the scene's camera frames: you, her, and Shadow on his mark */
  framePts(P) { const sh = this.G.companion, out = [[P.pos.x, P.pos.z, 0, 1.45]]; if (this.poe) out.push([this.poe.pos.x, this.poe.pos.z, 0, 1.3]); if (sh?.hold?.poe) out.push([sh.hold.x, sh.hold.z, 0, 0.8]); return out; } // (Shadow where he's going: his mark)
  async talk(P) {
    const G = this.G, ui = G.ui, poe = this.poe, me = this.H.name(), fx = poeFx(G);
    const portrait = G.portrait?.('poe'), say = (lines, choices) => ui.dialogue({ speaker: 'Poe', portrait, lines, choices });
    poe.anim.talk = 0.8;
    const a = await say(['…', 'Ahem. You saw nothing. There is nobody here. Just a very short lantern post.'], [{ text: 'A lantern post… with a giant fūma?' }, { text: 'Bless you!' }]);
    await say(a === 1 ? ['Thank you! …I mean — WHO SAID THAT?', '…Fine. FINE.'] : ['…It is a very well-armed lantern post.', '…Fine. FINE.']);
    await say([`I am *Poe*, shinobi of the Bamboo Grove! I have been tailing you all the way ${this.plaza ? 'round the plaza' : 'across Blossom Hollow'}, ${me}. Silently. Like a shadow.`, '(You snorted the whole way.)', 'That was a TEST! And you passed. Only a true hero notices the greatest ninja in the grove.']);
    G.actions.prepareJoin?.('poe');
    // the plea (or, Takemori saved before she came, a thank-you), then she asks to join
    const saved = this.plan === 'saved', crew = this.H.arrivals?.savedBy?.('bamboo') === 'crew';
    if (saved) await say(['…The truth is, I came all this way to fetch help for Takemori, my village in the bamboo.', crew ? 'But Grandma Sasa\'s pigeon says your crew already chased the yokai off! Faster than a ninja. I am not jealous.' : 'But Grandma Sasa\'s pigeon says somebody already chased the yokai off. …It was you, wasn\'t it.', 'So this is a thank-you visit. A very stealthy thank-you visit.']);
    else await say(['…The truth is, I came to fetch help.', 'Takemori is under siege! My village, in the bamboo. Yokai camp in the square, Grandma Sasa is barricaded in, and Master Kazemaru is VERY cross.', "Rosie's notice says the Burrow pack has paws to spare. My fūma is yours: smoke bombs, kunai and the Shadow Step!"]);
    const c = await say(saved ? ['My fūma is yours: smoke bombs, kunai and the Shadow Step!', 'Can I join? I promise to only sneeze on the yokai.'] : ['Can I join? And will you come to Takemori? I promise to only sneeze on the yokai.'],
      [{ text: 'Welcome to the pack, Poe! ♡' }, { text: 'Only if you stop sneaking up on me.' }]);
    const then = saved ? "I'll meet you at the cottage. Watch this: I will vanish without a trace!" : "I'll meet you at the cottage. Then, to Takemori! Watch this: I will vanish without a trace!";
    await say(c === 1 ? ['No promises! Ninja are always sneaking. It is in the job description.', then] : ['Yes!! ' + then]);
    poe.anim.talk = 0;
    // …in a puff of smoke (and, a moment later, from somewhere behind the bakery: achoo); then the banner, once she's gone
    let gone = false;
    poe.anim.play('handSeal', { onEvent: ev => {
      if (ev !== 'poof') return;
      fx.puff(poe.pos, { r: 1.1, n: 12 }); fx.word('POOF!', new THREE.Vector3(poe.pos.x, poe.pos.y + 1.6, poe.pos.z), { a: '#ffffff', b: '#cfc4ec', size: 1, life: 0.7 });
      sfx('smoke_bomb'); poe.visible = false; gone = true;
    } });
    await this.until(() => gone, 2);
    if (this.poe) this.poe.visible = false;
    await this.H.joinPoe();
    this.until(() => false, 0.9).then(() => sfx('poe_sneeze', { vol: 0.35, pitch: 1.1 }));
    Events.emit('poe:joinScene', { phase: 'done' });
    this.until(() => false, 0.6).then(() => { this.poe?.dispose(); this.poe = null; });
  }
  // ------------------------------------------------------------------ the maps (actors/arrivals.js people)
  /** while she's about in town: a person on the maps (a sneaky somebody, not yet met) */
  person() {
    const p = this.poe; if (!p?.visible || !this.active || this.G.mode !== 'village') return null;
    return { key: 'p:arrival:poe', kind: 'person', group: 'quest', id: 'poe', name: '???', role: this.state === 'tail' ? 'Somebody very sneaky' : 'Poe, a shinobi from the Bamboo', color: '#6a9a3a', initial: '?', npc: p, pos: p.pos, visible: true, badge: '!', prio: 7, named: true, area: 'village', arrival: true };
  }
  // ------------------------------------------------------------------ the rumour in town
  townHint(dt) {
    const G = this.G, F = G.state.flags;
    if (this.joined || !this.H.joined('moka') || F.hints?.poeRumour) return;
    if (regionUnlocked(G.state, 'bamboo').ok) return; // (the Bamboo is open: she comes to town herself, actors/arrivals.js)
    if ((this.hintT = (this.hintT || 0) + dt) < 10 || G.ui?.dlg?.active || G.tutorials?.busy || G.titleActive || this.H.arrivals?.active || G.player?.controlLocked) return; // (never over an arrival's scene)
    G.hint?.('poeRumour', "*Sniff sniff…* Rosie says somebody's been tiptoeing round the Bamboo Grove, very loudly. Once the Wayfarer's Post opens it (level 4), I bet they'll come and find us!");
  }
}
