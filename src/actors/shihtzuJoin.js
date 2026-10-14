// Floofy, the Shih Tzu, arrives in Blossom Hollow (docs/SHIHTZU.md §5; ROADMAP Z-H3): his old Momiji Hollow scene, moved
// to the island. The arrivals (actors/arrivals.js) start it once Momiji Hollow opens and Poe has joined, on a calm moment
// in town; HeroManager owns it (heroes.stzJoin) and Arrivals calls update(dt) every frame.
//   wait     — his rig, his lanterns and a ghost pup are made hidden; golden hour less than ~1.2 game hours away, he waits for
//              it (a knight lights his lanterns at sunset); otherwise he comes at once, and says he's early
//   kneel    — on the Shrine Road, by the jizo or one of its stone lanterns (they're always there, on the way to the Burrow) he
//              kneels by three little paper lanterns and solemnly lights them one by one, a ghost pup bobbing at his
//              shoulder. Shadow hears of it ("Ghostlights, up the Shrine Road!"); the pointer and the maps show where. Walk
//              up to him, or stand about nearby: the pup comes to fetch you
//   proclaim — he rises and takes his mark (a step up-screen of you, on the road), the camera frames you both: "Halt,
//              traveller. You stand at the edge of the gloom. Few return fr—" and the ghost pup licks his face, slurp
//   talk     — the dialogue, his plea for Akane Hamlet (or, saved before he came, a solemn thank-you); he joins after he
//              snuffs the lanterns into his tome and fades away in ghostlight (HeroManager.joinShihtzu); Arrivals.finished
//              starts his quest ("The Gloom over Akane") with its card
// Leaving town, a hero switch or a knock-out before he speaks drops it: the arrival comes again a little later.
// The rumour: in town, once Poe has joined and before Momiji Hollow opens, Shadow passes it on (once).
import * as THREE from 'three';
import { Actor } from './actor.js';
import { Player } from './player.js';
import { Events } from '../core/events.js';
import { regionUnlocked, REGIONS } from '../regions/index.js';
import { stzFx } from '../gfx/shihtzuFx.js';
import '../gfx/shihtzuFxArts.js';
import { SceneView, frameGroup, keepOut, stageTalk, finish, frameClear, faceUp, paved, camAxes, villagersNear, shadowOnMark } from './sceneStage.js';
import { dist, rand, clamp, dampAngle } from '../core/util.js';

const sfx = (n, o) => Events.emit('sfx', n, o);
const LANTERNS = 3, LIGHT_EVERY = 1.6;
const JIZO = { x: 154.2, z: 94.7 };       // the jizo trio by the Shrine Road (world/details.js shrine(); found live when it's there)
const DUSK = [17.6, 20.2], EARLY = 16.4;  // game hours: golden hour; from EARLY he waits for it (~40 s at the day's pace)
const FETCH_R = 14, FETCH_S = 18;         // m, s: standing about this near, the pup comes to fetch you after this long
export const isDusk = h => h >= DUSK[0] && h < DUSK[1];

/** the scene's Shih Tzu: just a rig that walks and poses (no villager life) */
class SceneShihtzu extends Actor {
  constructor(world, G) {
    super(world, Player.buildRig(undefined, 'shihtzu'), { radius: 0.3, speed: 3.6, name: 'Floofy' });
    this.G = G; this.height = this.rig.height || 1.2;
  }
}

export class ShihtzuJoin {
  constructor(G, heroes) {
    this.G = G; this.H = heroes;
    this.state = 'off'; this.t = 0; this.knight = null; this.lanterns = []; this.pup = null; this.waits = []; this.plan = 'start';
    Events.on('mode:changed', () => this.reset());
    Events.on('hero:switching', () => this.reset());
  }
  get joined() { return !!this.G.state.flags.shihtzuJoined; }
  get busy() { return this.state === 'proclaim' || this.state === 'talk'; }
  get active() { return this.state !== 'off' && this.state !== 'done'; }
  /** the arrival begins (actors/arrivals.js): plan 'start' (he asks for help), 'saved' (Akane saved before he came) */
  start(a, plan = 'start') {
    if (this.busy) return;
    this.reset(true);
    this.plan = plan; this.state = 'wait'; this.t = 0;
  }
  reset(force = false) {
    if (this.busy && !force) return; // (the scene finishes what it started)
    const G = this.G;
    this.knight?.dispose(); this.knight = null;
    for (const L of this.lanterns) L.end(); this.lanterns.length = 0;
    this.freePup();
    if (force && this.busy) { const P = G.player; if (P) { P.controlLocked = false; P.moveTarget = null; } G.introFocus = null; }
    this.view?.dispose(); this.view = null; this.near?.dispose(); this.near = null; this.stg = null;
    if (G.sceneKeepOut?.by === 'shihtzu') keepOut(G, null);
    if (G.companion?.hold?.stz) G.companion.hold = null;
    this.waits.length = 0; this.state = 'off'; this.t = 0; this.spot = null; this.spotJob_ = null; this.nearT = 0;
  }
  freePup() { if (this.pup) { stzFx(this.G).pupBatch().remove(this.pup.slot); this.pup = null; } }
  /** resolves once fn() is true (checked every frame in update), or after max seconds */
  until(fn, max = 4) { return new Promise(res => this.waits.push({ fn, res, t: max })); }
  /** nothing else going on in town: a moment for a scene (actors/arrivals.js why) */
  calm() { return !this.H.arrivals?.why?.(); }
  update(dt) {
    const G = this.G;
    for (let i = this.waits.length - 1; i >= 0; i--) { const w = this.waits[i]; w.t -= dt; if (w.t <= 0 || w.fn()) { this.waits.splice(i, 1); w.res(); } }
    if (G.mode === 'village' && this.state === 'off') return this.townHint(dt);
    if (this.knight && this.state !== 'wait') { this.knight.update(dt); this.tickPup(dt); }
    if (this.busy || this.state === 'off' || this.state === 'done') return;
    if (G.mode !== 'village') { this.reset(); return; }
    const P = G.player; if (!P || G.playerDead) { this.reset(); return; }
    this.t += dt;
    if (this.state === 'wait') {
      // (his rig is built now, out of sight: no hitch when he shows up)
      if (!this.knight) { const j = this.jizo(); this.knight = new SceneShihtzu(G.world, G); this.knight.visible = false; this.knight.setPos(j.x, j.z); this.knight.update(0); }
      const h = G.day?.hour ?? 12; this.duskWait = h >= EARLY && h < DUSK[0]; // (golden hour is near: he waits for it)
      this.view ||= this.roadView(); // (the road's scenery, a few ms a frame: for his spot)
      if (this.view.prepStep(3)) { // (then his spot: a few ms a frame)
        if (!this.spot) { const job = this.spotJob_ ||= this.spotJob(), t0 = performance.now(); let r; do r = job.next(); while (!r.done && performance.now() - t0 < 3); if (r.done) { this.spot = r.value; this.spotJob_ = null; } }
        if (this.spot && this.t > 1.5 && !this.duskWait && this.calm()) this.beginKneel(P);
      }
      return;
    }
    if (this.state === 'kneel') this.tickKneel(dt, P);
  }
  /** the Shrine Road's scenery round the jizo, wide enough for every spot he might pick (the road climbs: its floor the
   *  lowest ground near) */
  roadView() {
    const G = this.G, W = G.world, j = this.jizo(); let lo = Infinity;
    for (let dx = -13; dx <= 13; dx += 2) for (let dz = -13; dz <= 13; dz += 2) lo = Math.min(lo, W.heightAt(j.x + dx, j.z + dz));
    return new SceneView(G, j, { w: 18, back: 14, front: 24, floor: Number.isFinite(lo) ? lo : null });
  }
  /** the jizo by the Shrine Road (the village's own record, else where it always stands) */
  jizo() { const r = this.G.village?.world?.veg?.instances?.find(x => x.kind === 'jizo'); return r ? { x: r.x, z: r.z } : JIZO; }
  free(x, z) {
    const W = this.G.world, h0 = W.heightAt(x, z);
    for (const [dx, dz] of [[0, 0], [0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]]) {
      const px = x + dx, pz = z + dz;
      if (W.walkable?.(px, pz) === false || W.collision?.solidAt?.(px, pz, 0.38) || Math.abs(W.heightAt(px, pz) - h0) > 0.5) return false;
    }
    return true;
  }
  /** the Shrine Road's stone lanterns near the jizo (the village's own records), as { x, z } */
  stoneLanterns() { const j = this.jizo(); return (this.G.village?.world?.veg?.instances || []).filter(x => x.kind === 'shrineLantern' && Math.hypot(x.x - j.x, x.z - j.z) < 16).map(x => ({ x: x.x, z: x.z })); }
  /** the talk's options round a spot: he stays among his lanterns, your mark 1.5 m across the screen and 1.5 m down-screen
   *  of him (so facing you he faces the camera and the lick reads), Shadow at your other side (actors/sceneStage.js) */
  talkOpts(view, at) { return { view, free: (x, z) => this.free(x, z), other: at, gap: 1.5, ups: [-1.5, -1.2, -1.8], tall: [1.45, 1.45], anchor: at, shadow: (me, th, side, f) => f(me, -side * 0.95, -0.35) }; }
  /** Where he kneels, as a search a few ms a frame while he waits (a generator; its value the spot): on the Shrine Road's
   *  paving, by the jizo or one of the road's stone lanterns, his three lanterns in front of him on the paving, and the
   *  whole talk in plain view of where the scene's camera will be (the road's maples and sakura stand between it and the
   *  camera for much of its length): the spot first by the cheap scores, then the talk's own staging round it (rays toward
   *  the predicted camera, `stageTalk`), the first that stages cleanly. Grass only when no paved spot does */
  *spotJob() {
    const G = this.G, j = this.jizo(), V = this.view?.occ ? this.view : null, stones = this.stoneLanterns(), { T, R } = camAxes(G);
    const face = Math.atan2(T[0], T[1]) + 0.5, cands = [];
    for (let dx = -13; dx <= 13; dx += 0.5) for (let dz = -13; dz <= 13; dz += 0.5) {
      const x = j.x + dx, z = j.z + dz, dj = Math.hypot(dx, dz); if (dj > 13 || dj < 1.2 || !this.free(x, z) || (V && !V.covers(x, z))) continue;
      const pv = paved(G, x, z), stone = stones.reduce((m, p) => Math.min(m, Math.hypot(p.x - x, p.z - z)), 99);
      // (his lanterns in front of him, and the talk's room: your mark either side, down-screen of him, on the road too)
      let lan = 0; for (let i = 0; i < LANTERNS; i++) { const a = face + (i - 1) * 0.55, lx = x + Math.sin(a) * 0.95, lz = z + Math.cos(a) * 0.95; if (!paved(G, lx, lz)) lan++; }
      let room = 0; for (const sd of [1.5, -1.5]) { const rx = x + R[0] * sd + T[0] * 1.5, rz = z + R[1] * sd + T[1] * 1.5; if (paved(G, rx, rz) && this.free(rx, rz)) room++; }
      const s = (pv ? 0 : 6) + lan * 0.8 + (room ? 0 : 2) + Math.min(dj, Math.max(0, stone - 1.2) * 1.5) * 0.25 + villagersNear(G, x, z, 3) * 1.5;
      cands.push({ x, z, s });
    }
    cands.sort((a, b) => a.s - b.s);
    yield;
    const at = c => new THREE.Vector3(c.x, G.world.heightAt(c.x, c.z), c.z);
    if (!V) return cands[0] ? at(cands[0]) : at({ x: j.x + 1.8, z: j.z + 1.4 });
    let tried = 0;
    for (const c of cands.slice(0, 200)) {
      if (V.screened(c.x, c.z, [0.3, 0.7, 1.1], 0.3)) continue; // (him, kneeling)
      const st = yield* stageTalk(G, { pos: { x: c.x + T[0] * 3, z: c.z + T[1] * 3 } }, this.talkOpts(V, c)); // (you, coming up from the camera's side)
      if (!st.fallback) { this.spotStaged = true; return at(c); }
      if (++tried >= 24) break;
      yield;
    }
    this.spotStaged = false;
    return cands[0] ? at(cands[0]) : at({ x: j.x + 1.8, z: j.z + 1.4 });
  }
  beginKneel(P) {
    const G = this.G, k = this.knight, fx = stzFx(G);
    if (!this.spot) { this.view ||= this.roadView(); this.view.ready(); const job = this.spotJob(); let r; do r = job.next(); while (!r.done); this.spot = r.value; }
    const spot = this.spot;
    this.near = new SceneView(G, spot, { w: 12, back: 9, front: 20 }); // (his spot's own, for the talk's staging: built while he lights the lanterns)
    // he faces the camera across the road, three lanterns in a little arc in front of him
    const { T } = camAxes(G), face = Math.atan2(T[0], T[1]) + 0.5;
    k.setPos(spot.x, spot.z); k.facing = k.faceTarget = face; k.visible = true; k.update(0);
    k.anim.play('stzKneel');
    for (let i = 0; i < LANTERNS; i++) {
      const a = face + (i - 1) * 0.55, x = spot.x + Math.sin(a) * 0.95, z = spot.z + Math.cos(a) * 0.95;
      this.lanterns.push(fx.shrineLantern(new THREE.Vector3(x, G.world.heightAt(x, z), z), a));
    }
    const slot = fx.pupBatch().add();
    if (slot) this.pup = { slot, pos: new THREE.Vector3(spot.x - Math.sin(face) * 0.6 + Math.cos(face) * 0.7, spot.y, spot.z - Math.cos(face) * 0.6 - Math.sin(face) * 0.7), yaw: face, t: 0, ph: rand(0, 6), mode: 'bob', nod: 0 };
    this.state = 'kneel'; this.t = 0; this.lit = 0; this.lightT = 1.2; this.nearT = 0; this.dusk = isDusk(G.day?.hour ?? 12);
    Events.emit('shihtzu:joinScene', { phase: 'kneel' });
  }
  /** Shadow notices (his tip, once it can show: never over a dialogue or another tip, never after the scene has moved on) */
  notice() {
    const G = this.G, F = G.state.flags; if (F.hints?.stzLanternsTown || this.t < 2.6 || !this.calm()) return;
    G.hint?.('stzLanternsTown', '*Sniff…* Ghostlights, up the Shrine Road! Somebody is lighting little paper lanterns by the stone ones…', false);
    if (F.hints?.stzLanternsTown && G.companion) G.vfx?.emote?.(G.companion, '?', 1.4);
  }
  tickKneel(dt, P) {
    const G = this.G, k = this.knight, a = k.anim.action;
    // lighting them one by one: a reach of the left paw, a glint, the flame
    this.near?.prepStep(2);
    this.lightT -= dt;
    if (a?.name === 'stzKneel') a.reach = clamp(1 - Math.abs(this.lightT - 0.35) / 0.35) * (this.lit < LANTERNS ? 1 : 0);
    if (this.lightT <= 0 && this.lit < LANTERNS) { this.lanterns[this.lit++].light(); sfx('lantern_set', { pos: k.pos, vol: 0.6, pitch: 1 + 0.08 * this.lit }); this.lightT = LIGHT_EVERY; }
    const d = dist(P.pos.x, P.pos.z, k.pos.x, k.pos.z);
    this.notice();
    this.nearT = d < FETCH_R ? this.nearT + dt : 0;
    // walk up to him; or, standing about nearby a while, the ghost pup comes to fetch you and he follows it over
    if (this.calm() && (d < 4.5 || this.nearT > FETCH_S)) this.proclaim(P, d >= 4.5);
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
  /** who the scene's camera frames: you, him, Shadow on his mark (and his lanterns, a little: they're snuffed at the end) */
  framePts(P) { const sh = this.G.companion, k = this.knight, out = [[P.pos.x, P.pos.z, 0, 1.45], [k.pos.x, k.pos.z, 0, 1.45]]; if (sh?.hold?.stz) out.push([sh.hold.x, sh.hold.z, 0, 0.8]); return out; } // (Shadow where he's going: his mark)
  /** he rises and announces, very gravely, and the ghost pup licks his face mid-word */
  async proclaim(P, fetched) {
    const G = this.G, k = this.knight, fx = stzFx(G), rig = G.engine.rig, p = this.pup, sh = G.companion;
    this.state = 'proclaim';
    P.controlLocked = true; P.moveTarget = null; G.skills?.charge?.cancel?.('scene', true);
    G.ui?.toasts?.retire?.(0); // (Shadow's "ghostlights" tip steps aside)
    Events.emit('shihtzu:joinScene', { phase: 'proclaim' });
    for (const L of this.lanterns.slice(this.lit)) L.light(); this.lit = LANTERNS;
    keepOut(G, { x: (P.pos.x + k.pos.x) / 2, z: (P.pos.z + k.pos.z) / 2 }, 3.6); G.sceneKeepOut.by = 'shihtzu';
    const prevDist = rig.distTarget;
    try {
      if (fetched && p) { // (the pup zooms over and yips at you, then back to him: he looks up)
        p.to = new THREE.Vector3(P.pos.x + 0.6, P.pos.y + 0.6, P.pos.z + 0.4); p.speed = 7; p.face = P.pos;
        await this.until(() => dist(p.pos.x, p.pos.z, p.to.x, p.to.z) < 0.3, 2.5);
        sfx('pup_yip', { pitch: 1.3 }); G.vfx?.emote?.(P, '!', 1.2);
        p.to = new THREE.Vector3(k.pos.x + 0.7, k.pos.y + 0.7, k.pos.z + 0.4); p.face = null;
      }
      k.anim.play('stzRise'); sfx('stz_sigh', { vol: 0.5, pitch: 1.05 });
      // the staging (while he rises): he stays among his lanterns; your mark a step down-screen of him, to one side (a knight
      // keeps a dignified distance, and so he faces the camera as he proclaims and the lick reads); Shadow sits at your
      // other side; on the road
      const V = this.near?.ready() ? this.near : this.view; this.used = V === this.near ? 'near' : 'road';
      const st = this.stg = finish(stageTalk(G, P, this.talkOpts(V, this.spot)));
      await this.until(() => k.anim.action?.name !== 'stzRise', 1.2);
      keepOut(G, st.mid, 3.2); G.sceneKeepOut.by = 'shihtzu';
      if (sh) sh.hold = { x: st.shd.x, z: st.shd.z, face: Math.atan2(st.mid.x - st.shd.x, st.mid.z - st.shd.z), stz: true };
      const mark = st.moved ? new THREE.Vector3(st.me.x, G.world.heightAt(st.me.x, st.me.z), st.me.z) : null;
      P.moveTarget = mark;
      await this.until(() => { if (P.moveTarget !== mark) P.moveTarget = mark; const a = k.moveTo(st.other.x, st.other.z, 1 / 60, 0.7, 0.3); if (p) { (p.to ||= new THREE.Vector3()).set(k.pos.x + Math.cos(k.facing) * 0.75, k.pos.y + 0.75, k.pos.z - Math.sin(k.facing) * 0.75); p.speed = 4; } const b = !st.moved || dist(P.pos.x, P.pos.z, st.me.x, st.me.z) < 0.3, c = !sh?.hold?.stz || dist(sh.pos.x, sh.pos.z, sh.hold.x, sh.hold.z) < 0.4; frameGroup(G, this.framePts(P), { min: 12, max: 17 }); return a && b && c; }, 4.5);
      shadowOnMark(sh);
      if (st.moved && dist(P.pos.x, P.pos.z, st.me.x, st.me.z) > 0.6) P.setPos(st.me.x, st.me.z);
      P.moveTarget = null;
      faceUp(G, k, P, [0.25, 0.3]);
      const fr = frameClear(G, V, this.framePts(P), [P.pos, k.pos], sh?.hold?.stz ? [sh.pos] : []); this.framed = fr?.moved ? 'moved' : 'base';
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
      G.introFocus = null; rig.distTarget = prevDist; P.controlLocked = false; P.moveTarget = null;
      if (G.sceneKeepOut?.by === 'shihtzu') keepOut(G, null);
      if (sh?.hold?.stz) sh.hold = null;
      this.view?.dispose(); this.view = null; this.near?.dispose(); this.near = null;
      if (!this.joined) this.reset(true);
      else { this.state = 'done'; this.H.arrivals?.finished?.('shihtzu'); } // (the arrival recorded; his quest and its card)
    }
  }
  async talk(P) {
    const G = this.G, ui = G.ui, k = this.knight, me = this.H.name(), name = this.H.name('shihtzu'), fx = stzFx(G);
    const portrait = G.portrait?.('shihtzu'), say = (lines, choices) => ui.dialogue({ speaker: name, portrait, lines, choices });
    k.anim.stop(); k.anim.talk = 0.8;
    const a = await say(['…', 'That was part of the ritual.', `Ahem. I am *${name}*, Knight of the Gloomhowl, keeper of the ghostlights along the Maple road.`],
      [{ text: 'Is that a ghost puppy?' }, { text: 'Very spooky!' }]);
    await say(a === 0 ? ['He is a very good ghost. He followed me home from the old shrine. They all do.', 'I did not ask them to. I am not complaining.'] : ['…Thank you. I practise in the mirror.']);
    await say(this.dusk ? ['I light these lanterns at sunset, so that lost pups can find their way home.', `And I came down the Maple road to find you, ${me}. Rosie's notice. The Burrow. The yokai with no manners whatsoever.`]
      : ['I light these lanterns at sunset, so that lost pups can find their way home.', '…It is not sunset. I am early. A knight is never late.', `I came down the Maple road to find you, ${me}. Rosie's notice. The Burrow. The yokai with no manners whatsoever.`]);
    G.actions.prepareJoin?.('shihtzu');
    const saved = this.plan === 'saved', crew = this.H.arrivals?.savedBy?.('maple') === 'crew';
    const c = await say(saved
      ? ['I came to ask for help. Akane Hamlet, my home among the maples, had fallen under the gloom.', crew ? 'But the ghostlights whisper that your crew has already lifted it. …I was going to be very brave about it.' : 'But the ghostlights whisper that someone has already lifted it. …It was you. The ghostlights are rarely wrong.', 'So I have come to say thank you. Solemnly.', 'My flail is heavy, and my hexes are… lingering. May I join your pack?']
      : ['And I need your help. Akane Hamlet, my home among the maples, has fallen under the gloom.', 'Yokai camp in its square, under a scarecrow captain with a scythe. Captain Strawgrin. He has no manners either.', 'My ghostlights cannot hold them back alone. The gloom needs a pack.', 'May I join yours? And will you come to Akane?'],
      [{ text: 'Welcome to the pack! ♡' }, { text: 'Only if the ghost pups come too.' }]);
    const then = saved ? 'I shall meet you at the cottage. The ghostlights will show me the way.' : 'I shall meet you at the cottage. Then, the Maple road. The ghostlights will show us the way.';
    await say(c === 1 ? ['They were always coming. They do not listen to me at all.', then] : ['…', 'Knights do not cry. It is the lantern smoke.', then]);
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
    this.until(() => false, 0.5).then(() => { if (this.knight === k0 && this.state === 'done') { this.knight?.dispose(); this.knight = null; for (const L of this.lanterns) L.end(); this.lanterns.length = 0; } });
  }
  // ------------------------------------------------------------------ the maps and the pointer (actors/arrivals.js)
  /** while he kneels on the Shrine Road: a person on the maps (a knight not yet met) */
  person() {
    const k = this.knight; if (!k?.visible || !this.active || this.G.mode !== 'village') return null;
    return { key: 'p:arrival:shihtzu', kind: 'person', group: 'quest', id: 'shihtzu', name: '???', role: 'Lighting lanterns on the Shrine Road', color: '#8a5aa8', initial: '?', npc: k, pos: k.pos, visible: true, badge: '!', prio: 7, named: true, area: 'village', arrival: true };
  }
  /** the pointer while he kneels there (G.questTarget, after a guide) */
  target() { const k = this.knight; return this.state === 'kneel' && k?.visible ? { pos: k.pos, label: 'Ghostlights on the Shrine Road', kind: 'npc', arrival: 'shihtzu' } : null; }
  // ------------------------------------------------------------------ the rumour in town
  townHint(dt) {
    const G = this.G, F = G.state.flags;
    if (this.joined || !this.H.joined('poe') || F.hints?.stzRumour) return;
    const u = regionUnlocked(G.state, 'maple'); if (u.ok) return; // (Momiji Hollow is open: he comes to town himself, actors/arrivals.js)
    if ((this.hintT = (this.hintT || 0) + dt) < 12 || G.ui?.dlg?.active || G.tutorials?.busy || G.tutorials?.cur || G.titleActive || this.H.arrivals?.active || G.player?.controlLocked) return; // (never over an arrival's scene)
    const where = REGIONS.maple?.name || 'Momiji Hollow';
    G.hint?.('stzRumour', `*Sniff sniff…* Rosie says a very serious little knight has been lighting lanterns along the road in ${where}, every sunset. Once the Wayfarer's Post opens it (${u.why.toLowerCase()}), I bet he'll come to us!`);
  }
}
