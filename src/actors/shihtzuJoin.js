// The Shih Tzu joins the pack (docs/SHIHTZU.md §5): his scene in Momiji Hollow (the Maple zone) in its golden-hour
// light, and the rumour in town that sends you there. HeroManager (heroes.js) owns one ShihtzuJoin and calls update(dt)
// every frame.
//
// The scene runs on any Maple visit while he hasn't joined, so a new game and an old save meet him the same way:
//   wait     — his rig, his lanterns and a ghost pup are made hidden as you arrive; once you've been there a few seconds,
//              walked a little and nothing is chasing you, he appears beside the trail ahead (on screen, near the jizo
//              shrine when you're close to it)
//   kneel    — he kneels by a row of little paper lanterns and solemnly lights them one by one with ghostlight, a ghost
//              pup bobbing at his shoulder; Shadow notices. Walk up to him (or wait: the pup comes to fetch you)
//   proclaim — he rises and turns, the camera frames you both: "Halt, traveller. You stand at the edge of the gloom. Few
//              return from—" and the ghost pup licks his face, slurp, mid-word. Flustered (the sweat drop), he insists that
//              was part of the ritual
//   talk     — the dialogue; prepareJoin; he asks to join; HeroManager.joinShihtzu (the banner, flags.shihtzuJoined, the
//              save); he snuffs the lanterns into his tome, wisp by wisp, and fades away in ghostlight "to meet you at the
//              cottage" (he's a villager at home the next time you're in town)
// Leaving the zone, dying or a hero switch before he speaks resets it: the next Maple visit starts over.
// The rumour: in town, once Poe has joined and he hasn't, Shadow passes it on (once).
import * as THREE from 'three';
import { Actor } from './actor.js';
import { Player } from './player.js';
import { Events } from '../core/events.js';
import { regionUnlocked, REGIONS } from '../regions/index.js';
import { stzFx, STZ_COL } from '../gfx/shihtzuFx.js';
import '../gfx/shihtzuFxArts.js';
import { dist, rand, clamp, dampAngle } from '../core/util.js';

const sfx = (n, o) => Events.emit('sfx', n, o);
const LANTERNS = 3, LIGHT_EVERY = 1.6;

/** the scene's Shih Tzu: just a rig that walks and poses (no villager life, no combat: monsters can't see him either) */
class SceneShihtzu extends Actor {
  constructor(world, G) {
    super(world, Player.buildRig(undefined, 'shihtzu'), { radius: 0.3, speed: 3.6, name: 'Floofy' });
    this.G = G; this.height = this.rig.height || 1.2;
  }
}

export class ShihtzuJoin {
  constructor(G, heroes) {
    this.G = G; this.H = heroes;
    this.state = 'off'; this.t = 0; this.knight = null; this.lanterns = []; this.pup = null; this.walked = 0; this.last = null; this.waits = [];
    Events.on('mode:changed', () => this.reset());
    Events.on('hero:switching', () => this.reset());
  }
  get joined() { return !!this.G.state.flags.shihtzuJoined; }
  get busy() { return this.state === 'proclaim' || this.state === 'talk'; }
  /** in Momiji Hollow, on a visit where he can still meet you */
  inHollow() { const G = this.G; return G.mode === 'dungeon' && G.dungeon?.isRegion && G.dungeon.regionId === 'maple' && !this.joined; }
  reset() {
    if (this.busy) return; // (the scene finishes what it started)
    this.knight?.dispose(); this.knight = null;
    for (const L of this.lanterns) L.end(); this.lanterns.length = 0;
    this.freePup();
    this.walked = 0; this.last = null; this.waits.length = 0; this.state = 'off'; this.t = 0; this.spot = null;
  }
  freePup() { if (this.pup) { stzFx(this.G).pupBatch().remove(this.pup.slot); this.pup = null; } }
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
    if (this.knight && this.state !== 'wait') { this.knight.update(dt); this.tickPup(dt); }
    if (this.busy || this.state === 'done') return; // (done: his fade plays out, then reset() clears it)
    if (!this.inHollow()) { if (this.state !== 'off') this.reset(); return; }
    const P = G.player; if (!P || G.playerDead) return;
    this.t += dt;
    if (this.state === 'off') { this.state = 'wait'; this.t = 0; return; }
    if (this.state === 'wait') {
      // (his rig is built now, behind the arrival: no hitch when he shows up)
      if (!this.knight) { this.knight = new SceneShihtzu(G.world, G); this.knight.visible = false; this.knight.setPos(P.pos.x, P.pos.z); this.knight.update(0); }
      this.track(P);
      if (this.t > 5 && this.walked > 5 && this.calm()) this.beginKneel(P);
      return;
    }
    if (this.state === 'kneel') this.tickKneel(dt, P);
  }
  track(P) {
    const L = this.last;
    if (!L) { this.last = P.pos.clone(); return; }
    const d = dist(P.pos.x, P.pos.z, L.x, L.z); if (d > 0.3) { this.walked += d; L.copy(P.pos); }
  }
  /** on screen and clear of the HUD (the bars along the bottom, the minimap) */
  onScreen(x, y, z) {
    const cam = this.G.engine?.camera; if (!cam) return true;
    const v = (this._v ||= new THREE.Vector3()).set(x, y + 0.6, z).project(cam);
    return Math.abs(v.x) < 0.7 && v.y > -0.45 && v.y < 0.6;
  }
  /** room for him and his lanterns: walkable, clear, level-ish */
  free(x, z) {
    const W = this.G.world, h0 = W.heightAt(x, z);
    for (const [dx, dz] of [[0, 0], [1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]]) {
      const px = x + dx, pz = z + dz;
      if (W.walkable?.(px, pz) === false || W.collision?.solidAt?.(px, pz, 0.4) || Math.abs(W.heightAt(px, pz) - h0) > 0.45 || (W.waterAt?.(px, pz) || 0) > 0.05) return false;
    }
    return true;
  }
  /** where he kneels: by the jizo shrine if you're near it; else 7–10 m off along where you're heading, on screen */
  pickSpot(P) {
    const G = this.G, shrine = G.world.plan?.pois?.find(p => p.kind === 'shrine');
    if (shrine && dist(shrine.x, shrine.z, P.pos.x, P.pos.z) < 16) {
      for (const [dx, dz] of [[2.4, 0.6], [-2.4, 0.6], [0.6, 2.6], [0.6, -2.6], [3.2, 2], [-3.2, -2]]) { const x = shrine.x + dx, z = shrine.z + dz; if (this.free(x, z) && this.onScreen(x, P.pos.y, z)) return new THREE.Vector3(x, G.world.heightAt(x, z), z); }
    }
    const f = P.facing;
    for (const d of [8, 9, 7, 10, 6]) for (const da of [0.35, -0.35, 0.6, -0.6, 0.15, -0.15, 0.9, -0.9]) {
      const x = P.pos.x + Math.sin(f + da) * d, z = P.pos.z + Math.cos(f + da) * d;
      if (this.free(x, z) && this.onScreen(x, P.pos.y, z)) return new THREE.Vector3(x, G.world.heightAt(x, z), z);
    }
    return null;
  }
  beginKneel(P) {
    const G = this.G, spot = this.pickSpot(P); if (!spot) return;
    const k = this.knight, fx = stzFx(G);
    this.spot = spot;
    // he faces across the trail, three lanterns in a little arc in front of him
    const face = Math.atan2(P.pos.x - spot.x, P.pos.z - spot.z) + 1.2;
    k.setPos(spot.x, spot.z); k.facing = k.faceTarget = face; k.visible = true; k.update(0);
    k.anim.play('stzKneel');
    for (let i = 0; i < LANTERNS; i++) {
      const a = face + (i - 1) * 0.55, x = spot.x + Math.sin(a) * 0.95, z = spot.z + Math.cos(a) * 0.95;
      this.lanterns.push(fx.shrineLantern(new THREE.Vector3(x, G.world.heightAt(x, z), z), a));
    }
    const slot = fx.pupBatch().add();
    if (slot) this.pup = { slot, pos: new THREE.Vector3(spot.x - Math.sin(face) * 0.6 + Math.cos(face) * 0.7, spot.y, spot.z - Math.cos(face) * 0.6 - Math.sin(face) * 0.7), yaw: face, t: 0, ph: rand(0, 6), mode: 'bob', nod: 0 };
    this.state = 'kneel'; this.t = 0; this.lit = 0; this.lightT = 1.2;
    Events.emit('shihtzu:joinScene', { phase: 'kneel' });
    this.until(() => this.state !== 'kneel' || this.t > 2.6).then(() => {
      if (this.state !== 'kneel') return;
      if (G.companion) G.vfx?.emote?.(G.companion, '?', 1.4);
      G.hint?.('stzLanterns', '*Sniff…* Ghostlights, by the road! Somebody is lighting lanterns over there…', false);
    });
  }
  tickKneel(dt, P) {
    const G = this.G, k = this.knight, a = k.anim.action;
    // lighting them one by one: a reach of the left paw, a glint, the flame
    this.lightT -= dt;
    if (a?.name === 'stzKneel') a.reach = clamp(1 - Math.abs(this.lightT - 0.35) / 0.35) * (this.lit < LANTERNS ? 1 : 0);
    if (this.lightT <= 0 && this.lit < LANTERNS) { this.lanterns[this.lit++].light(); sfx('lantern_set', { pos: k.pos, vol: 0.6, pitch: 1 + 0.08 * this.lit }); this.lightT = LIGHT_EVERY; }
    const d = dist(P.pos.x, P.pos.z, k.pos.x, k.pos.z);
    // walk up to him; or, after a while, the ghost pup comes to fetch you and he follows it over
    if (this.calm() && (d < 4.5 || this.t > 18)) this.proclaim(P, d >= 4.5);
  }
  /** the ghost pup: bobbing at his shoulder; or zooming to a point (fetch, lick) */
  tickPup(dt) {
    const p = this.pup; if (!p) return;
    p.t += dt;
    if (p.to) { const dx = p.to.x - p.pos.x, dz = p.to.z - p.pos.z, d = Math.hypot(dx, dz); if (d > 0.05) { const s = Math.min(d, (p.speed || 5) * dt); p.pos.x += dx / d * s; p.pos.z += dz / d * s; p.yaw = dampAngle(p.yaw, Math.atan2(dx, dz), 12, dt); } p.y = p.to.y ?? p.y; }
    if (p.face) p.yaw = dampAngle(p.yaw, Math.atan2(p.face.x - p.pos.x, p.face.z - p.pos.z), 10, dt);
    const bob = Math.sin(p.t * 3.1 + p.ph) * 0.06;
    stzFx(this.G).pupBatch().set(p.slot, { x: p.pos.x, y: (p.y ?? (this.G.world.heightAt(p.pos.x, p.pos.z) + 0.35)) + bob, z: p.pos.z, yaw: p.yaw, pitch: p.pitch || 0, phase: p.ph, nod: p.nod || 0, alpha: 1, wag: 1, scale: 0.9 });
  }
  /** he rises and announces, very gravely, and the ghost pup licks his face mid-word */
  async proclaim(P, fetched) {
    const G = this.G, k = this.knight, fx = stzFx(G), rig = G.engine.rig, p = this.pup;
    this.state = 'proclaim';
    P.controlLocked = true; P.moveTarget = null; G.skills?.charge?.cancel?.('scene', true);
    Events.emit('shihtzu:joinScene', { phase: 'proclaim' });
    for (const L of this.lanterns.slice(this.lit)) L.light(); this.lit = LANTERNS;
    const prevDist = rig.distTarget;
    try {
      if (fetched && p) { // (the pup zooms over and yips at you, then back to him: he looks up)
        p.to = new THREE.Vector3(P.pos.x + 0.6, P.pos.y + 0.6, P.pos.z + 0.4); p.speed = 7; p.face = P.pos;
        await this.until(() => dist(p.pos.x, p.pos.z, p.to.x, p.to.z) < 0.3, 2.5);
        sfx('pup_yip', { pitch: 1.3 }); G.vfx?.emote?.(P, '!', 1.2);
        p.to = new THREE.Vector3(k.pos.x + 0.7, k.pos.y + 0.7, k.pos.z + 0.4); p.face = null;
      }
      k.anim.play('stzRise'); sfx('stz_sigh', { vol: 0.5, pitch: 1.05 });
      await this.until(() => k.anim.action?.name !== 'stzRise', 1.2);
      // he walks over (not too close: a knight keeps a dignified distance) to stand up-screen of you, so he faces the camera
      // as he proclaims (and the lick reads), you with your back to it
      const { f: cf } = rig.groundAxes(), W = G.world, ok = (x, z) => W.walkable?.(x, z) !== false && !W.collision?.solidAt?.(x, z, 0.35);
      // (of the spots up-screen of you, the one nearest his lanterns: they stay in the frame for the snuff at the end)
      let to = null, best = 1e9;
      const ca = Math.atan2(cf.x, cf.z);
      for (let da = -1.2; da <= 1.21; da += 0.3) for (const d of [2.4, 2.8]) {
        const x = P.pos.x + Math.sin(ca + da) * d, z = P.pos.z + Math.cos(ca + da) * d, q = dist(x, z, this.spot.x, this.spot.z) + Math.abs(da) * 0.4;
        if (q < best && ok(x, z)) { best = q; to = new THREE.Vector3(x, 0, z); }
      }
      to ||= P.pos.clone().lerp(k.pos, 0.6);
      await this.until(() => k.moveTo(to.x, to.z, 1 / 60, 0.7, 0.3), 4);
      k.faceTo(P.pos.x, P.pos.z); P.faceTo(k.pos.x, k.pos.z);
      rig.distTarget = 13; G.introFocus = P.pos.clone().lerp(k.pos, 0.5).lerp(this.spot, 0.2);
      if (p) { p.to = new THREE.Vector3(k.pos.x + Math.cos(k.facing) * 0.75, k.pos.y + 0.75, k.pos.z - Math.sin(k.facing) * 0.75); p.speed = 4; p.face = P.pos; }
      await this.until(() => Math.abs(Math.atan2(Math.sin(k.faceTarget - k.facing), Math.cos(k.faceTarget - k.facing))) < 0.15, 0.8); // (turned to you before he speaks)
      k.anim.play('stzProclaim');
      const portrait = G.portrait?.('shihtzu'), name = this.H.name('shihtzu');
      await G.ui?.dialogue?.({ speaker: name, portrait, lines: ['Halt, traveller.', 'You stand at the edge of the gloom. Few return fr—'] });
      // *slurp*
      if (p) { p.to = new THREE.Vector3(k.pos.x + Math.sin(k.facing) * 0.32, k.pos.y + 1.05, k.pos.z + Math.cos(k.facing) * 0.32); p.speed = 6; p.face = k.pos; }
      await this.until(() => !p || dist(p.pos.x, p.pos.z, p.to.x, p.to.z) < 0.08, 1.2);
      if (p) { p.nod = 0.5; p.pitch = 0.3; }
      k.anim.play('stzLicked'); sfx('gp_lick', { pos: k.pos }); fx.hearts(new THREE.Vector3(k.pos.x, k.pos.y + 1.35, k.pos.z), 5);
      await this.until(() => k.anim.action?.name !== 'stzLicked', 1.3);
      if (p) { p.nod = 0; p.pitch = 0; p.to = new THREE.Vector3(k.pos.x + Math.cos(k.facing) * 0.8, k.pos.y + 0.8, k.pos.z - Math.sin(k.facing) * 0.8); p.speed = 3; p.face = P.pos; }
      G.vfx?.emote?.(k, 'sweat', 1.6); if (G.companion) G.vfx?.emote?.(G.companion, 'heart', 1.4);
      this.state = 'talk';
      await this.talk(P);
    } finally {
      G.introFocus = null; rig.distTarget = prevDist; P.controlLocked = false;
      this.state = this.joined ? 'done' : 'off';
      if (!this.joined) { this.state = 'off'; this.reset(); }
    }
  }
  async talk(P) {
    const G = this.G, ui = G.ui, k = this.knight, me = this.H.name(), name = this.H.name('shihtzu'), fx = stzFx(G);
    const portrait = G.portrait?.('shihtzu'), say = (lines, choices) => ui.dialogue({ speaker: name, portrait, lines, choices });
    k.anim.stop(); k.anim.talk = 0.8;
    const a = await say(['…', 'That was part of the ritual.', `Ahem. I am *${name}*, Knight of the Gloomhowl, keeper of the ghostlights along the Maple road.`],
      [{ text: 'Is that a ghost puppy?' }, { text: 'Very spooky!' }]);
    await say(a === 0 ? ['He is a very good ghost. He followed me home from the old shrine. They all do.', 'I did not ask them to. I am not complaining.'] : ['…Thank you. I practise in the mirror.']);
    await say(['I light these lanterns at sunset, so that lost pups can find their way home.', `And I have heard of you, ${me}. Rosie's notice. The Burrow. The yokai with no manners whatsoever.`]);
    G.actions.prepareJoin?.('shihtzu');
    const c = await say(['My flail is heavy, and my hexes are… lingering. I am told I am very hard to knock over.', 'The gloom needs a pack. May I join yours?'],
      [{ text: 'Welcome to the pack! ♡' }, { text: 'Only if the ghost pups come too.' }]);
    await say(c === 1 ? ['They were always coming. They do not listen to me at all.', 'I shall meet you at the cottage. The ghostlights will show me the way.']
      : ['…', 'Knights do not cry. It is the lantern smoke.', 'I shall meet you at the cottage. The ghostlights will show me the way.']);
    k.anim.talk = 0;
    // he opens the tome and the lanterns' flames fly into it, one by one; then he fades away in ghostlight — and only then
    // the "joined the pack" banner (over the scene it covered him)
    k.anim.play('stzTomeHold');
    const tome = fx.tome(); tome.set(new THREE.Vector3(k.pos.x + Math.sin(k.facing) * 0.42, k.pos.y + 0.78, k.pos.z + Math.cos(k.facing) * 0.42), k.facing); sfx('tome_open');
    const into = new THREE.Vector3(k.pos.x + Math.sin(k.facing) * 0.42, k.pos.y + 0.85, k.pos.z + Math.cos(k.facing) * 0.42);
    Events.emit('shihtzu:joinScene', { phase: 'snuff' });
    for (const L of this.lanterns) { L.snuff(into); sfx('hex_tick', { pos: k.pos, vol: 0.7 }); await this.until(() => false, 0.35); }
    tome.pages(6); await this.until(() => false, 0.5); tome.end();
    if (this.pup) { this.pup.to = new THREE.Vector3(k.pos.x, k.pos.y + 0.8, k.pos.z); this.pup.speed = 3; }
    fx.summonPuff(k.pos, 0.7); sfx('gp_rise', { pitch: 1.4, vol: 0.6 });
    await this.until(() => false, 0.35);
    const k0 = k; k0.visible = false; this.freePup();
    await this.H.joinShihtzu();
    Events.emit('shihtzu:joinScene', { phase: 'done' });
    this.until(() => false, 0.5).then(() => { if (this.knight === k0) this.reset(); });
  }
  // ------------------------------------------------------------------ the rumour in town
  townHint(dt) {
    const G = this.G, F = G.state.flags;
    if (this.joined || !this.H.joined('poe') || F.hints?.stzRumour) return;
    if ((this.hintT = (this.hintT || 0) + dt) < 12 || G.ui?.dlg?.active || G.tutorials?.busy || G.tutorials?.cur || G.titleActive) return;
    const u = regionUnlocked(G.state, 'maple'), where = REGIONS.maple?.name || 'Momiji Hollow';
    G.hint?.('stzRumour', u.ok
      ? `*Sniff sniff…* Rosie says a very serious little knight has been lighting lanterns along the road in ${where}, every sunset. Let's take the Wayfarer's Post and see!`
      : `*Sniff sniff…* Rosie says a very serious little knight has been lighting lanterns along the road in ${where}, every sunset. The Wayfarer's Post opens it: ${u.why.toLowerCase()}.`);
  }
}
