// Poe joins the pack (docs/POE.md §5): her scene in the Whispering Bamboo Grove, and the hint in town that sends you
// there. HeroManager (heroes.js) owns one PoeJoin and calls update(dt) every frame.
//
// The scene runs on any Bamboo visit while she hasn't joined, so a new game and an old save meet her the same way:
//   wait   — a few seconds after you arrive, once you've walked a little and nothing is chasing you
//   tail   — she "stealthily" follows 4–7 m behind along your path (always on screen), crouched on tiptoe. Look her way and she freezes stiff
//            as a bamboo stalk (eyes shut: if she can't see you…); she snorts now and then, and Shadow notices
//   caught — after a while (or if you walk right up to her) she sneezes: ACHOO! You both turn, the camera frames you,
//            she trots up, embarrassed
//   talk   — she insists it was a test; she joins (HeroManager.joinPoe: the banner, flags.poeJoined) and vanishes in a
//            puff of smoke "to meet you at the cottage" (she's a villager at home the next time you're in town)
// Leaving the region, dying or a hero switch before she's caught resets it: the next Bamboo visit starts over.
// The hint: in town, once Moka has joined and Poe hasn't, Shadow passes on a rumour about the bamboo (once).
import * as THREE from 'three';
import { Actor } from './actor.js';
import { Player } from './player.js';
import { Events } from '../core/events.js';
import { regionUnlocked } from '../regions/index.js';
import { poeFx, POE_COL } from '../gfx/poeFx.js';
import { dist, rand } from '../core/util.js';

const sfx = (n, o) => Events.emit('sfx', n, o);
const TRAIL_STEP = 0.5, TRAIL_N = 40, BEHIND = 7, MIN_BEHIND = 3.6;

/** the scene's Poe: just a rig that walks (no villager life, no combat: monsters can't see her either) */
class TailingPoe extends Actor {
  constructor(world, G) {
    super(world, Player.buildRig(undefined, 'poe'), { radius: 0.28, speed: 4.6, name: 'Poe' });
    this.G = G; this.height = this.rig.height || 1.1;
  }
}

export class PoeJoin {
  constructor(G, heroes) {
    this.G = G; this.H = heroes;
    this.state = 'off'; this.t = 0; this.poe = null; this.trail = []; this.walked = 0; this.last = null; this.waits = [];
    Events.on('mode:changed', () => this.reset());
    Events.on('hero:switching', () => this.reset());
  }
  get joined() { return !!this.G.state.flags.poeJoined; }
  get busy() { return this.state === 'caught' || this.state === 'talk'; }
  /** in the bamboo, on a visit where she can still meet you */
  inGrove() { const G = this.G; return G.mode === 'dungeon' && G.dungeon?.isRegion && G.dungeon.regionId === 'bamboo' && !this.joined; }
  reset() {
    if (this.busy) return; // (the scene finishes what it started)
    this.poe?.dispose(); this.poe = null; this.trail.length = 0; this.walked = 0; this.last = null; this.waits.length = 0;
    this.state = 'off'; this.t = 0;
  }
  /** resolves once fn() is true (checked every frame in update), or after max seconds */
  until(fn, max = 4) { return new Promise(res => this.waits.push({ fn, res, t: max })); }
  /** nothing chasing the hero, no dialogue, no boss fight: a moment for a scene */
  calm() {
    const G = this.G, P = G.player;
    if (!P || G.playerDead || G.ui?.dlg?.active || G.heroSwitching || G.ui?.anyModal?.() || P.controlLocked || G.ui?.iris?.active) return false;
    if (G.dungeon?.boss?.introDone && G.dungeon.boss.alive && G.dungeon.boss.aggro) return false;
    if (G.dungeon?.village?.celebrate) return false; // (a crew's relief being celebrated in the square: docs/COZY.md §3.2)
    for (const m of G.dungeon?.monsters || []) if (m.alive && m.aggro && dist(m.pos.x, m.pos.z, P.pos.x, P.pos.z) < 13) return false;
    return true;
  }
  update(dt) {
    const G = this.G;
    for (let i = this.waits.length - 1; i >= 0; i--) { const w = this.waits[i]; w.t -= dt; if (w.t <= 0 || w.fn()) { this.waits.splice(i, 1); w.res(); } }
    if (G.mode === 'village') return this.townHint(dt);
    if (this.poe && this.state !== 'wait') this.poe.update(dt);
    if (this.busy) return;
    if (!this.inGrove()) { if (this.state !== 'off') this.reset(); return; }
    const P = G.player; if (!P || G.playerDead) return;
    this.t += dt;
    if (this.state === 'off') { this.state = 'wait'; this.t = 0; return; }
    if (this.state === 'wait') {
      // (her rig is built now, behind the arrival: no hitch when she shows up)
      if (!this.poe) { this.poe = new TailingPoe(G.world, G); this.poe.visible = false; this.poe.setPos(P.pos.x, P.pos.z); this.poe.update(0); }
      this.track(P);
      if (this.t > 7 && this.walked > 6 && this.calm()) this.beginTail(P);
      return;
    }
    if (this.state === 'tail') this.tickTail(dt, P);
  }
  /** the hero's path, a point every half metre (she follows it, not a straight line through the bamboo) */
  track(P) {
    const L = this.last;
    if (!L) { this.last = P.pos.clone(); this.trail.unshift(P.pos.clone()); return; }
    const d = dist(P.pos.x, P.pos.z, L.x, L.z);
    if (d >= TRAIL_STEP) { this.walked += d; L.copy(P.pos); this.trail.unshift(P.pos.clone()); if (this.trail.length > TRAIL_N) this.trail.pop(); }
  }
  /** the trail point m metres back (or the oldest) */
  trailAt(m) { return this.trail[Math.min(this.trail.length - 1, Math.round(m / TRAIL_STEP))] || null; }
  /** on screen and clear of the HUD (the bars along the bottom, the minimap) */
  onScreen(x, y, z) {
    const cam = this.G.engine?.camera; if (!cam) return true;
    const v = (this._v ||= new THREE.Vector3()).set(x, y + 0.6, z).project(cam);
    return Math.abs(v.x) < 0.78 && v.y > -0.55 && v.y < 0.7;
  }
  free(x, z) { const W = this.G.world; return W.walkable?.(x, z) !== false && !W.collision?.solidAt?.(x, z, 0.35); }
  /** where she tails from (the gag only works if you can see her): as far back along your path as BEHIND while that's
   *  on screen (walking down-screen or across: the full 7 m). Walking up-screen the path behind runs off the bottom of
   *  the screen within a few metres, so she sneaks along beside it instead, 3.5–5.5 m off to one side (a bamboo stalk
   *  at a time), keeping to the side she's on. */
  behindPoint() {
    const G = this.G, P = G.player;
    const iMax = Math.min(this.trail.length - 1, Math.round(BEHIND / TRAIL_STEP)), iMin = Math.round(MIN_BEHIND / TRAIL_STEP);
    for (let i = iMax; i >= iMin; i--) { const p = this.trail[i]; if (this.onScreen(p.x, p.y, p.z)) return p; }
    const rig = G.engine?.rig; if (!rig?.groundAxes || !P) return this.trail[Math.min(iMax, iMin)] || null;
    const { f, r } = rig.groundAxes(), out = this._side ||= new THREE.Vector3();
    const poe = this.poe, now = poe ? Math.sign((poe.pos.x - P.pos.x) * r.x + (poe.pos.z - P.pos.z) * r.z) || 1 : 1;
    for (const s of [now, -now]) for (const k of [4.5, 5, 4, 5.5, 3.5]) for (const back of [1, 0.5, 0, 1.5]) {
      const x = P.pos.x - f.x * back + r.x * k * s, z = P.pos.z - f.z * back + r.z * k * s;
      if (this.free(x, z) && this.onScreen(x, P.pos.y, z)) return out.set(x, P.pos.y, z);
    }
    return this.trail[Math.min(iMax, iMin)] || null;
  }
  beginTail(P) {
    const G = this.G, at = this.trailAt(12) || P.pos, poe = this.poe; // (she sneaks in from round the last bend, 12 m back)
    poe.setPos(at.x, at.z); poe.visible = true; poe.faceTo(P.pos.x, P.pos.z); poe.facing = poe.faceTarget;
    poe.anim.play('sneakWalk');
    this.state = 'tail'; this.t = 0; this.snortT = 3 + rand(0, 2); this.frozen = false; this.freezes = 0;
    Events.emit('poe:joinScene', { phase: 'tail' });
    // a nudge for the player: Shadow pricks up his ears
    this.until(() => this.state !== 'tail' || this.t > 2.5).then(() => {
      if (this.state !== 'tail') return;
      if (G.companion) G.vfx?.emote?.(G.companion, '?', 1.4);
      G.hint?.('poeTail', '*Sniff…* Psst! Something is following us through the bamboo…', false);
    });
  }
  tickTail(dt, P) {
    const G = this.G, poe = this.poe, fx = poeFx(G);
    this.track(P);
    const d = dist(P.pos.x, P.pos.z, poe.pos.x, poe.pos.z);
    // caught: she's been at it a while (and nothing's chasing you), or you walked right up to her
    if (this.calm() && (this.t > 16 || (d < 2.6 && this.t > 2))) { this.caught(P); return; }
    // is the hero looking her way? then freeze — perfectly still, eyes shut, a very convincing bamboo
    const toPoe = Math.atan2(poe.pos.x - P.pos.x, poe.pos.z - P.pos.z), look = Math.abs(((P.facing - toPoe + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    const seen = look < 0.9 && d < 11;
    if (seen !== this.frozen) {
      this.frozen = seen;
      if (seen) { poe.anim.play('ninjaFreeze'); this.freezes++; G.vfx?.emote?.(poe, 'sweat', 1.1); } else poe.anim.play('sneakWalk');
    }
    if (!this.frozen) {
      const tgt = this.behindPoint();
      if (tgt && dist(tgt.x, tgt.z, P.pos.x, P.pos.z) > 3.5) poe.moveTo(tgt.x, tgt.z, dt, 1, 0.4);
      else poe.faceTo(P.pos.x, P.pos.z);
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
    await this.until(() => sneezed && poe.anim.action?.name !== 'sneeze', 3);
    const prevDist = rig.distTarget;
    try {
      rig.distTarget = 15; G.introFocus = P.pos.clone().lerp(poe.pos, 0.5);
      // she trots up, embarrassed
      const to = P.pos.clone().lerp(poe.pos, 0.55);
      await this.until(() => poe.moveTo(to.x, to.z, 1 / 60, 0.55, 0.25), 2.5);
      poe.faceTo(P.pos.x, P.pos.z); P.faceTo(poe.pos.x, poe.pos.z);
      G.introFocus = P.pos.clone().lerp(poe.pos, 0.5);
      this.state = 'talk';
      await this.talk(P);
    } finally {
      G.introFocus = null; rig.distTarget = prevDist; P.controlLocked = false;
      this.state = this.joined ? 'done' : 'off';
      if (!this.joined) this.reset();
    }
  }
  async talk(P) {
    const G = this.G, ui = G.ui, poe = this.poe, me = this.H.name(), fx = poeFx(G);
    const portrait = G.portrait?.('poe'), say = (lines, choices) => ui.dialogue({ speaker: 'Poe', portrait, lines, choices });
    poe.anim.talk = 0.8;
    const a = await say(['…', 'Ahem. You saw nothing. There is nobody here. Just a very short bamboo.'], [{ text: 'A very short bamboo… with a giant fūma?' }, { text: 'Bless you!' }]);
    await say(a === 1 ? ['Thank you! …I mean — WHO SAID THAT?', '…Fine. FINE.'] : ['…It is a very well-armed bamboo.', '…Fine. FINE.']);
    await say([`I am *Poe*, shinobi of the Bamboo Grove! I have been tailing you since the Wayfarer's Stone, ${me}. Silently. Like a shadow.`, '(You snorted the whole way.)', 'That was a TEST! And you passed. Only a true hero notices the greatest ninja in the grove.']);
    G.actions.prepareJoin?.('poe');
    const c = await say(["Rosie's notice says the Burrow pack needs paws. My fūma is yours — and I know smoke bombs, kunai and the Shadow Step!", 'Can I join? I promise to only sneeze on the yokai.'], [{ text: 'Welcome to the pack, Poe! ♡' }, { text: 'Only if you stop sneaking up on me.' }]);
    await say(c === 1 ? ['No promises! Ninja are always sneaking. It is in the job description.', "I'll meet you at the cottage. Watch this: I will vanish without a trace!"] : ["Yes!! I'll meet you at the cottage. Watch this: I will vanish without a trace!"]);
    poe.anim.talk = 0;
    await this.H.joinPoe();
    // …in a puff of smoke (and, a moment later, from somewhere in the bamboo: achoo)
    let gone = false;
    poe.anim.play('handSeal', { onEvent: ev => {
      if (ev !== 'poof') return;
      fx.puff(poe.pos, { r: 1.1, n: 12 }); fx.word('POOF!', new THREE.Vector3(poe.pos.x, poe.pos.y + 1.6, poe.pos.z), { a: '#ffffff', b: '#cfc4ec', size: 1, life: 0.7 });
      sfx('smoke_bomb'); poe.visible = false; gone = true;
    } });
    await this.until(() => gone, 2);
    this.until(() => false, 0.9).then(() => sfx('poe_sneeze', { vol: 0.35, pitch: 1.1 }));
    Events.emit('poe:joinScene', { phase: 'done' });
    this.until(() => false, 0.6).then(() => { this.poe?.dispose(); this.poe = null; });
  }
  // ------------------------------------------------------------------ the rumour in town
  townHint(dt) {
    const G = this.G, F = G.state.flags;
    if (this.joined || !this.H.joined('moka') || F.hints?.poeRumour) return;
    if ((this.hintT = (this.hintT || 0) + dt) < 10 || G.ui?.dlg?.active || G.tutorials?.busy || G.titleActive) return;
    const open = regionUnlocked(G.state, 'bamboo').ok;
    G.hint?.('poeRumour', open
      ? "*Sniff sniff…* Rosie says somebody's been tiptoeing round the Bamboo Grove — very loudly. Let's take the Wayfarer's Post and have a look!"
      : "*Sniff sniff…* Rosie says somebody's been tiptoeing round the Bamboo Grove — very loudly. The Wayfarer's Post opens it at level 4!");
  }
}
