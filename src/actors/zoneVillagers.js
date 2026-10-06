// Zone villagers (docs/ZONES.md §2; ROADMAP Z-D3): the named folk of a zone village and a few townsfolk, built with the
// Toybox NPC kit (charKit buildHumanoid → toyKit) like Blossom Hollow's townsfolk, with a light routine instead of the
// full VillageLife: they mind their building, cross the square, sit on the engawa, chat and cheer. They live in a
// RegionWorld (its collision, its heightAt) and are driven by the village runtime (src/regions/village/village.js).
//
// States:  caged  — inside a siege cage: fidgets, waves for help when the hero is near, '!' now and then
//          hidden — indoors (barricaded): not drawn
//          scared — freed while the siege goes on: by their door, nervous, still talkable
//          life   — the village is saved: a slot routine (their spot, the square, a seat, a stroll), greets the hero
//          script — walking somewhere on purpose (out of a cage, out of a door), then back to the routine
import * as THREE from 'three';
import { Actor } from './actor.js';
import { buildHumanoid } from './charKit.js';
import { randomVillagerSpec } from './roster.js';
import { SEAT_LIFT } from './lifePoses.js';
import { rand, pick, chance, dist, damp, mulberry32 } from '../core/util.js';
import { Events } from '../core/events.js';
import { ZONE_NPCS, VILLAGES } from '../regions/village/data.js';

const SPECS = new Map();
/** the stable spec object of a zone villager (prebuildHumanoid keys on the object) */
export function zoneSpec(id) {
  let s = SPECS.get(id);
  if (!s) {
    const n = ZONE_NPCS[id];
    if (n) s = { name: n.name, ...n.spec, outfit: { ...(n.spec?.outfit || {}) } };
    else { // townsfolk 'tk_folk2': seeded from the village's folk seed
      const m = /^(.*)_folk(\d+)$/.exec(id), v = m && Object.values(VILLAGES).find(x => x.id === m[1] || x.villagers.some(q => q.id.startsWith(m[1] + '_')));
      s = randomVillagerSpec(mulberry32(((v?.folk?.seed || 1) * 7919 + (m ? +m[2] : 0) * 104729) >>> 0));
    }
    SPECS.set(id, s);
  }
  return s;
}
/** a fresh Toybox rig for a zone villager (G.zoneNpcBuilder: phase C's caged villager in the dungeon). The caller owns
 *  it (rig.dispose()). */
export function zoneNpcRig(id) { return buildHumanoid({ ...zoneSpec(id), outfit: { ...zoneSpec(id).outfit } }); }

const PLAYER_VR = 0.36;
const _d = new THREE.Vector3();

export class ZoneVillager extends Actor {
  /** def: the villager record (data.js) or { id, name, folk: true }; o: { village (runtime), home: { x, z, face }, spots } */
  constructor(world, G, def, o = {}) {
    const spec = zoneSpec(def.id);
    super(world, buildHumanoid(spec), { radius: 0.28, speed: 1.5, name: def.name || spec.name });
    this.G = G; this.def = def; this.id = def.id; this.spec = spec; this.folk = !!def.folk; this.zone = o.zone;
    this.village = o.village; this.home = o.home || null; this.spots = o.spots || [];
    this.state = 'life'; this.t = rand(0.5, 3); this.goal = null; this.route = null; this.act = null;
    this.talking = false; this.greeted = rand(2, 6); this.fidgetT = rand(3, 8); this.emoteT = rand(6, 14); this.seated = false;
    this.interact = { pos: this.pos, radius: 1.35, label: `Talk to ${this.name}`, onInteract: () => this.village?.talk(this), actor: this, npc: this };
    this.marker = null; // (the village's quest-marker sprite)
    // townsfolk cast no shadow-map shadow (their blob shadow stays): the square's draw-call budget (REGIONS §4)
    if (this.folk) this.rig.root.traverse(m => { if (m.isMesh) m.castShadow = false; });
  }
  get hidden() { return this.state === 'hidden'; }
  emote(kind, life) { if (kind) Events.emit('emote', { actor: this, kind, life }); }
  // ------------------------------------------------------------------ state changes (the village calls these)
  cage(c) { this.state = 'caged'; this.cageAt = c; this.visible = true; this.setPos(c.x, c.z); this.faceTarget = this.facing = c.face; this.anim.stop(); this.endSeat(); }
  hide() { this.state = 'hidden'; this.visible = false; this.endSeat(); this.anim.stop(); if (this.home) this.setPos(this.home.x, this.home.z); }
  /** walk from where it stands to (x, z) through the square (route), then do `then` (a state name or fn) */
  walkTo(x, z, then = 'life', speed = 1) {
    this.endSeat(); this.anim.stop();
    this.route = this.village?.route?.(this.pos, { x, z }) || [{ x, z }];
    this.goal = { x, z, then, speed }; this.state = 'script'; this.visible = true;
  }
  /** out of hiding: appear on the doorstep and step out */
  stepOut(then = 'life') {
    const h = this.home; if (!h) { this.state = then; this.visible = true; return; }
    this.visible = true; this.setPos(h.x - Math.sin(h.face) * 0.6, h.z - Math.cos(h.face) * 0.6);
    this.walkTo(h.x, h.z, then, 0.9);
    this.G.vfx?.poof?.(this.pos.clone().setY(this.pos.y + 0.3), { color: '#fff6ea', n: 6, size: 0.35 });
  }
  cheer() { if (this.state === 'hidden' || this.state === 'caged') return; this.anim.play(pick(['clap', 'happy', 'wave', 'laugh'])); this.emote(pick(['heart', 'note', 'sparkle'])); }
  // ------------------------------------------------------------------ frame
  update(dt) {
    if (this.state === 'hidden') { this.visible = false; super.update(dt); return; }
    const G = this.G, P = G.player, pd = P ? dist(P.pos.x, P.pos.z, this.pos.x, this.pos.z) : 99;
    if (this.talking) {
      if (P) this.faceTo(P.pos.x, P.pos.z);
      this.anim.talk = 0.8;
    } else {
      this.anim.talk = damp(this.anim.talk || 0, 0, 8, dt);
      switch (this.state) {
        case 'caged': this.cagedTick(dt, P, pd); break;
        case 'scared': this.scaredTick(dt, P, pd); break;
        case 'script': this.scriptTick(dt); break;
        default: this.lifeTick(dt, P, pd);
      }
    }
    if (!this.seated && this.state !== 'caged') this.keepOff(dt, P);
    this.interact.pos = this.pos;
    super.update(dt);
    if (this.seated) { this.pos.y = this.seatY; this.sync(); }
  }
  cagedTick(dt, P, pd) {
    const c = this.cageAt;
    if (P && pd < 6) this.faceTo(P.pos.x, P.pos.z); else this.faceTarget = c.face;
    this.greeted -= dt; this.fidgetT -= dt;
    if (P && pd < 5 && this.greeted <= 0) { this.greeted = rand(6, 9); this.anim.play(pick(['wave', 'wave', 'scratchHead'])); this.emote(pick(['!', 'sweat'])); }
    else if (this.fidgetT <= 0 && !this.anim.action) { this.fidgetT = rand(3, 6); this.anim.play(pick(['lookAround', 'scratchHead', 'nod'])); }
  }
  scaredTick(dt, P, pd) {
    const h = this.home;
    if (h && dist(h.x, h.z, this.pos.x, this.pos.z) > 0.6) { this.walkTo(h.x, h.z, 'scared', 1.1); return; }
    if (P && pd < 7) this.faceTo(P.pos.x, P.pos.z); else if (h) this.faceTarget = h.face;
    this.fidgetT -= dt; this.emoteT -= dt;
    if (this.fidgetT <= 0 && !this.anim.action) { this.fidgetT = rand(3.5, 6); this.anim.play(pick(['lookAround', 'scratchHead', 'lookAround'])); }
    if (this.emoteT <= 0) { this.emoteT = rand(7, 13); if (pd < 20) this.emote(pick(['sweat', '!'])); }
  }
  scriptTick(dt) {
    const r = this.route, g = this.goal;
    if (!g) { this.state = 'life'; return; }
    const tgt = r?.[0] || g;
    if (this.moveTo(tgt.x, tgt.z, dt, g.speed, 0.25)) {
      if (r?.length) r.shift();
      if (!r?.length) { const then = g.then; this.goal = null; this.route = null; if (typeof then === 'function') then(this); else { this.state = then || 'life'; this.t = rand(0.5, 1.5); } }
    }
    // stuck against something for a while: skip the waypoint
    this.stuck = (this.anim.speed ?? 1) < 0.15 ? (this.stuck || 0) + dt : 0;
    if (this.stuck > 1.6) { this.stuck = 0; if (r?.length > 1) r.shift(); else { this.setPos(tgt.x, tgt.z); } }
  }
  // the routine: pick a spot (weights by role), walk there through the square, do its pose for a while
  lifeTick(dt, P, pd) {
    this.greeted -= dt;
    if (P && pd < 3.2 && this.greeted <= 0 && !this.seated && !this.G.playerDead) { this.greeted = rand(14, 22); this.faceTo(P.pos.x, P.pos.z); this.anim.play(chance(0.6) ? 'wave' : 'bow'); if (chance(0.5)) this.emote(pick(['heart', 'note', '!'])); }
    const a = this.act;
    if (!a) {
      this.t -= dt; if (this.t > 0) return;
      const sp = this.pickSpot();
      if (!sp) { this.t = rand(2, 5); return; }
      this.act = { sp, phase: 'go', t: rand(sp.dur?.[0] ?? 8, sp.dur?.[1] ?? 18) };
      this.route = this.village?.route?.(this.pos, sp) || [{ x: sp.x, z: sp.z }];
      return;
    }
    if (a.phase === 'go') {
      const tgt = this.route?.[0] || a.sp;
      if (this.moveTo(tgt.x, tgt.z, dt, a.sp.speed || 1, 0.22)) {
        if (this.route?.length) this.route.shift();
        if (!this.route?.length) { a.phase = 'do'; this.faceTarget = a.sp.face ?? this.facing; this.startPose(a.sp); }
      }
      this.stuck = (this.anim.speed ?? 1) < 0.15 ? (this.stuck || 0) + dt : 0;
      if (this.stuck > 1.8) { this.stuck = 0; if (this.route?.length > 1) this.route.shift(); else { this.act = null; this.t = rand(1, 3); } }
      return;
    }
    // doing it
    a.t -= dt; this.fidgetT -= dt; this.emoteT -= dt;
    if (!this.seated) this.faceTarget = a.sp.face ?? this.faceTarget;
    if (!this.anim.action && a.sp.pose) this.anim.play(a.sp.pose);
    if (a.sp.fidget && this.fidgetT <= 0 && this.anim.action?.def?.hold) { this.fidgetT = rand(7, 13); this.anim.play(pick(a.sp.fidget)); }
    if (this.emoteT <= 0) { this.emoteT = rand(9, 18); if (pd < 24 && a.sp.emote) this.emote(pick(a.sp.emote)); }
    if (a.t <= 0) { this.endSeat(); this.anim.stop(); this.act = null; this.t = rand(1.5, 4); }
  }
  pickSpot() {
    const S = this.spots.filter(s => !s.claim || s.claim === this);
    if (!S.length) return null;
    let sum = 0; for (const s of S) sum += s.w ?? 1;
    let r = Math.random() * sum, best = S[0];
    for (const s of S) { r -= s.w ?? 1; if (r <= 0) { best = s; break; } }
    if (this.lastSpot === best && S.length > 1) return this.pickSpot();
    for (const s of this.spots) if (s.claim === this) s.claim = null;
    if (best.seat) best.claim = this;
    this.lastSpot = best;
    return best;
  }
  startPose(sp) {
    this.anim.stop();
    if (sp.seat) { // sit on the engawa / a bench: rump on the seat height, facing out
      this.seated = true; this.setPos(sp.x, sp.z); this.facing = this.faceTarget = sp.face ?? this.facing;
      this.seatY = sp.seatY - this.seatDrop(); this.anim.play('sitBench');
      return;
    }
    if (sp.pose) this.anim.play(sp.pose);
  }
  endSeat() {
    if (!this.seated) return;
    this.seated = false; for (const s of this.spots) if (s.claim === this) s.claim = null;
    const sp = this.act?.sp; if (sp) { const f = sp.face ?? 0; this.setPos(sp.x + Math.sin(f) * 0.45, sp.z + Math.cos(f) * 0.45); }
    this.anim.play('standUp');
  }
  seatDrop() {
    if (this._seatDrop != null) return this._seatDrop;
    let low = 0.25;
    try {
      const skin = this.rig.skin, bi = this.rig.skeleton?.bones.indexOf(this.rig.parts.body);
      if (skin && bi >= 0) { const P = skin.geometry.attributes.position, SI = skin.geometry.attributes.skinIndex; let m = Infinity; for (let i = 0; i < P.count; i++) if (SI.getX(i) === bi && P.getY(i) < m) m = P.getY(i); if (m < Infinity) low = m; }
    } catch (e) { /* keep the default */ }
    return (this._seatDrop = SEAT_LIFT + low * (this.rig.spec?.scale || 1) - 0.035);
  }
  // never stand inside the hero or Shadow (a soft shove, like the village's villagers)
  keepOff(dt, P) {
    const push = (e, r) => { if (!e) return; const dx = this.pos.x - e.pos.x, dz = this.pos.z - e.pos.z, d = Math.hypot(dx, dz), m = this.radius + r; if (d < m && d > 1e-4) { _d.set(dx / d, 0, dz / d); this.step(_d, dt, Math.min(1, (m - d) * 6)); } };
    push(P, PLAYER_VR); push(this.G.companion, 0.34);
  }
}
