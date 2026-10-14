// Captain Kaizo brings the Tide Pool's news to Blossom Hollow (ROADMAP Z-H3; docs/ZONES.md §3.1). The Tide Pool's hero,
// Stella the Weimaraner (ROADMAP H-6), is still a concept; until her arrival takes this one's place in the arrival table
// (world/heroQuests.js ARRIVALS), Shiokaze Port's old captain rows over himself. A messenger: he asks, and goes home.
//   wait   — his rig (the zone villager's Toybox rig) and his rowboat are built hidden
//   land   — once the Tidepools open and Floofy has joined, on a calm moment in town, his boat is pulled up on the beach at
//            the end of Beach Lane and he stands by it, looking out to sea. Shadow smells it ("Salt, tar and old rope!");
//            the pointer and the maps show where. He waves when you come near
//   talk   — walk up to him: the staging (your marks on the sand, Shadow's behind you), his greeting, his plea for Shiokaze
//            Port (or, saved before he came, a thank-you); Arrivals.finished records the visit and starts the quest
//            ("Trouble at Shiokaze Port"); its card waits until he's gone
//   leave  — he waves, walks back to his boat and hops in, and it slides off the sand and out to sea with him sat facing
//            the beach, the camera watching him go; a splash, the beach is quiet again, and you're free. The quest's hand-in is his, at his lookout in
//            Shiokaze Port (regions/village/talk.js)
// Leaving town or a hero switch before he speaks drops it: the arrival comes again a little later (once he's rowing home,
// it just ends).
import * as THREE from 'three';
import { Actor } from './actor.js';
import { Events } from '../core/events.js';
import { zoneNpcRig, zoneSpec } from './zoneVillagers.js';
import { ZONE_NPCS } from '../regions/village/data.js';
import { Builder, G as Geo, C, V, instantiate } from '../world/buildings/kit.js';
import { tube } from '../gfx/geom.js';
import { boat } from '../world/buildings/props2.js';
import { SceneView, frameGroup, keepOut, stageTalk, finish, frameClear, faceUp, paved, onPaving, groundCost, shadowOnMark, camAxes } from './sceneStage.js';
import { dist } from '../core/util.js';

const sfx = (n, o) => Events.emit('sfx', n, o);
const ID = 'sk_kaizo';
const LANE_END = { x: 96.6, z: 202 }; // the foot of Beach Lane (world/layout.js STREETS.beach), the beach just below it

/** the scene's Kaizo: a zone villager's rig that walks and talks */
class SceneKaizo extends Actor {
  constructor(world, G) {
    super(world, zoneNpcRig(ID), { radius: 0.3, speed: 2.6, name: ZONE_NPCS[ID]?.name || 'Old Captain Kaizo' });
    this.G = G; this.height = this.rig.height || 1.2;
  }
}
// his rowboat: the buildings kit's boat with its oars shipped, in the village's own materials (as the beached rowboat by the
// bridge: world/details.js beachedBoatPiece)
let BOAT_TPL = null;
function boatMesh() {
  if (!BOAT_TPL) {
    const B = new Builder(777); B.warpAmt = 0.02; B.jitter = 0.03;
    B.at([0, -0.04, 0], 0, () => boat(B, { L: 1.7, color: '#f4ece0', trim: '#2e4a6e' }), 1, 0, 0);
    for (const sx of [-1, 1]) {
      B.add(tube([{ p: V(sx * 0.12, 0.26, -0.55), r: 0.018 }, { p: V(sx * 0.18, 0.3, 0.45), r: 0.016 }], 5, true), C.woodLight);
      const blade = Geo.box(0.08, 0.015, 0.26, 0.006); blade.translate(sx * 0.19, 0.3, 0.58); B.add(blade, C.woodLight);
    }
    BOAT_TPL = B.finish();
  }
  const g = instantiate(BOAT_TPL).group; g.userData.sceneActor = true;
  return g;
}

export class KaizoArrive {
  constructor(G, heroes) {
    this.G = G; this.H = heroes;
    this.state = 'off'; this.t = 0; this.kaizo = null; this.boat = null; this.waits = []; this.plan = 'start';
    Events.on('mode:changed', () => this.reset(this.state === 'leave')); // (rowing off: done with; before he speaks: he comes again)
    Events.on('hero:switching', () => this.reset(this.state === 'leave'));
  }
  get busy() { return this.state === 'talk' || this.state === 'leave'; }
  get active() { return this.state !== 'off' && this.state !== 'done'; }
  start(a, plan = 'start') {
    if (this.busy) return;
    this.reset(true);
    this.plan = plan; this.state = 'wait'; this.t = 0;
    try { this.G.registerPortrait?.(ID, zoneSpec(ID)); } catch (e) { /* (his face: the dialogue and the card) */ }
  }
  reset(force = false) {
    if (this.busy && !force) return;
    const G = this.G;
    this.kaizo?.dispose(); this.kaizo = null;
    if (this.boat) { this.boat.parent?.remove(this.boat); this.boat = null; }
    if (force && this.busy) { const P = G.player; if (P) { P.controlLocked = false; P.moveTarget = null; } G.introFocus = null; }
    this.view?.dispose(); this.view = null; this.stg = null;
    if (G.sceneKeepOut?.by === 'kaizo') keepOut(G, null);
    if (G.companion?.hold?.kaizo) G.companion.hold = null;
    this.waits.length = 0; this.state = 'off'; this.t = 0; this.spot = null; this.boatAt = null; this.out = null;
  }
  until(fn, max = 4) { return new Promise(res => this.waits.push({ fn, res, t: max })); }
  wait(s) { return this.until(() => false, s); }
  calm() { return !this.H.arrivals?.why?.(); }
  update(dt) {
    const G = this.G;
    // (his face for the dialogue, the quest's card and the journal: also after a reload with his quest on, before Shiokaze
    //  Port has been visited, where the zone's villagers register theirs)
    if (!this.faced && G.registerPortrait && (this.state !== 'off' || G.state.quests?.active?.some(q => q.id === 'hq_shiokaze'))) { this.faced = true; try { G.registerPortrait(ID, zoneSpec(ID)); } catch (e) { /* the default face */ } }
    for (let i = this.waits.length - 1; i >= 0; i--) { const w = this.waits[i]; w.t -= dt; if (w.t <= 0 || w.fn()) { this.waits.splice(i, 1); w.res(); } }
    if (this.kaizo && this.state !== 'wait') this.kaizo.update(dt);
    if (this.busy || this.state === 'off' || this.state === 'done') return;
    if (G.mode !== 'village') { this.reset(); return; }
    const P = G.player; if (!P || G.playerDead) { this.reset(); return; }
    this.t += dt;
    if (this.state === 'wait') {
      if (!this.kaizo) { this.kaizo = new SceneKaizo(G.world, G); this.kaizo.visible = false; this.kaizo.setPos(LANE_END.x, LANE_END.z); this.kaizo.update(0); }
      this.view ||= new SceneView(G, LANE_END, { w: 14, back: 8, front: 16 });
      if (this.view.prepStep(3) && this.t > 1.5 && this.calm()) this.land();
      return;
    }
    if (this.state === 'land') this.tickLand(dt, P);
  }
  /** walkable ground (not the sea, not a wall) */
  dry(x, z) { const W = this.G.world; return W.walkable?.(x, z) !== false && !W.collision?.solidAt?.(x, z, 0.35); }
  /** room to stand: dry, off the driftwood and clear of his boat */
  free(x, z) {
    const G = this.G; if (!this.dry(x, z)) return false;
    let nodes = []; try { nodes = G.cozy?.scav?.nodes?.() || []; } catch (e) { nodes = []; } // (not on the driftwood: it's gathered there)
    if (nodes.some(n => !n.taken && Math.hypot(n.x - x, n.z - z) < 1.25)) return false;
    const b = this.boatAt, o = this.out; if (!b || !o) return true; // (and clear of his boat: 1.7 m long, along the way out)
    const dx = x - b.x, dz = z - b.z, along = dx * o.x + dz * o.z, across = dx * o.z - dz * o.x;
    return (along / 1.35) ** 2 + (across / 0.85) ** 2 > 1;
  }
  /** the nearest waterline from a point on the beach: { at (the last dry step), out (the way out to sea), d } | null */
  waterline(x0, z0) {
    let best = null;
    for (let k = -8; k <= 8; k++) { // (the sea lies south and west of the beach: a fan of rays round south)
      const a = k * 0.17, dx = Math.sin(a), dz = Math.cos(a);
      let last = null;
      for (let d = 0; d < 14; d += 0.25) { const x = x0 + dx * d, z = z0 + dz * d; if (!this.dry(x, z)) { if (last && (!best || d < best.d)) best = { at: last, out: { x: dx, z: dz }, d }; break; } last = { x, z }; }
    }
    return best;
  }
  /** Where his boat comes ashore: on the beach below the lane's foot, or along it a few steps either way, where he (beside
   *  his boat, a step up the beach) and the boat are in plain view of the camera (the sakura on the bank hangs over the
   *  lane's foot), with room on the sand beside him for you (the beach is a narrow strip: the grass behind it is knee-high)
   *  → { at, out, boat: {x, z}, me: {x, z} } */
  shore() {
    const G = this.G, V = this.view?.occ ? this.view : null, { T, R } = camAxes(G), cands = [];
    const sand = (x, z) => paved(G, x, z) && this.free(x, z);
    for (const o of [0, 2, -2, 4, -4, 6, -6, 8, -8]) {
      const w = this.waterline(LANE_END.x + o * 0.8, LANE_END.z + o * 0.6); if (!w) continue;
      const out = w.out, side = { x: out.z, z: -out.x }, boat = { x: w.at.x - out.x * 0.75, z: w.at.z - out.z * 0.75 };
      if (!this.free(boat.x, boat.z)) continue;
      for (const [up, sd] of [[1.3, 1.1], [1.3, -1.1], [0.9, 1.3], [0.9, -1.3], [0.5, 1.4], [0.5, -1.4], [1.8, 0.8], [1.8, -0.8]]) {
        const me = { x: boat.x - out.x * up + side.x * sd, z: boat.z - out.z * up + side.z * sd }; if (!this.free(me.x, me.z)) continue;
        // (your mark: 2.1 m across the screen from him, on the sand, either side)
        let room = 0; for (const s of [1, -1]) for (const t of [-0.5, -0.2, -0.8]) { const x = me.x - s * 2.1 * R[0] - t * T[0], z = me.z - s * 2.1 * R[1] - t * T[1]; if (sand(x, z) && onPaving(G, x, z, 0.5) && Math.hypot(x - boat.x, z - boat.z) > 1.3) room++; }
        const hid = V && (V.screened(me.x, me.z, [0.3, 0.7, 1.1, 1.45], 0.3) || V.screened(boat.x, boat.z, [0.2, 0.4], 0.5));
        cands.push({ ...w, boat, me, s: Math.abs(o) * 0.3 + (hid ? 10 : 0) + groundCost(G, me.x, me.z, 2) + (room ? 0 : 4) - Math.min(room, 3) * 0.3 });
      }
    }
    cands.sort((a, b) => a.s - b.s);
    if (cands[0]) return cands[0];
    const at = { x: LANE_END.x, z: LANE_END.z + 3 }, out = { x: -0.15, z: 1 };
    return { at, out, boat: { x: at.x - out.x * 0.75, z: at.z - out.z * 0.75 }, me: { x: at.x - out.x * 2 + 1, z: at.z - out.z * 2 } };
  }
  land() {
    const G = this.G, k = this.kaizo, W = G.world, sh = this.shore();
    const out = new THREE.Vector3(sh.out.x, 0, sh.out.z).normalize();
    this.out = out;
    // his boat pulled up on the sand, its stern at the waterline and its bow up the beach; him beside it, a step up the
    // beach, looking out to sea
    const b = this.boat = boatMesh(); b.position.set(sh.boat.x, W.heightAt(sh.boat.x, sh.boat.z), sh.boat.z); b.rotation.set(0, Math.atan2(out.x, out.z) + Math.PI / 2, 0.06); W.scene.add(b);
    this.boatAt = b.position.clone();
    this.spot = new THREE.Vector3(sh.me.x, W.heightAt(sh.me.x, sh.me.z), sh.me.z);
    k.setPos(sh.me.x, sh.me.z); k.facing = k.faceTarget = Math.atan2(out.x, out.z); k.visible = true; k.update(0);
    this.state = 'land'; this.t = 0; this.waved = 0;
    Events.emit('kaizo:arrive', { phase: 'land' });
    sfx('water_splash', { pos: this.boatAt, vol: 0.4 });
  }
  /** Shadow smells it (his tip, once it can show: never over a dialogue or another tip, never after the scene moved on) */
  notice() {
    const G = this.G, F = G.state.flags; if (F.hints?.kaizoBoat || this.t < 2 || !this.calm()) return;
    G.hint?.('kaizoBoat', "*Sniff sniff…* Salt, tar and old rope! A boat just landed on the beach. Somebody's waving a very old bandana…", false);
    if (F.hints?.kaizoBoat && G.companion) G.vfx?.emote?.(G.companion, '?', 1.4);
  }
  tickLand(dt, P) {
    const G = this.G, k = this.kaizo, d = dist(P.pos.x, P.pos.z, k.pos.x, k.pos.z);
    this.notice();
    if (d < 12) k.faceTo(P.pos.x, P.pos.z); else k.faceTarget = Math.atan2(this.out.x, this.out.z);
    if (d < 12 && (this.waved -= dt) <= 0) { this.waved = 5; k.anim.play('wave'); if (d < 9) G.vfx?.emote?.(k, '!', 1.2); }
    if (d < 4.5 && this.calm()) this.talk(P);
  }
  framePts(P) { const sh = this.G.companion, k = this.kaizo, out = [[P.pos.x, P.pos.z, 0, 1.45], [k.pos.x, k.pos.z, 0, 1.45]]; if (sh?.hold?.kaizo) out.push([sh.hold.x, sh.hold.z, 0, 0.8]); return out; } // (Shadow where he's going: his mark)
  async talk(P) {
    const G = this.G, k = this.kaizo, rig = G.engine.rig, sh = G.companion, ui = G.ui;
    this.state = 'talk';
    P.controlLocked = true; P.moveTarget = null; G.skills?.charge?.cancel?.('scene', true);
    G.ui?.toasts?.retire?.(0);
    Events.emit('kaizo:arrive', { phase: 'talk' });
    const prevDist = rig.distTarget;
    let leaving = false;
    try {
      if (!this.view?.occ) this.view?.ready();
      // the staging: he stays by his boat (a step either way at most), your mark on the sand beside him across the screen,
      // Shadow's behind you both
      const st = this.stg = finish(stageTalk(G, P, { view: this.view, free: (x, z) => this.free(x, z), other: k.pos, gap: 2.1, ups: [-0.5, -0.2, -0.8], tall: [1.45, 1.45], anchor: { x: k.pos.x, z: k.pos.z } }));
      keepOut(G, st.mid, 3.2); G.sceneKeepOut.by = 'kaizo';
      if (sh) sh.hold = { x: st.shd.x, z: st.shd.z, face: Math.atan2(st.mid.x - st.shd.x, st.mid.z - st.shd.z), kaizo: true };
      const mark = st.moved ? new THREE.Vector3(st.me.x, G.world.heightAt(st.me.x, st.me.z), st.me.z) : null;
      P.moveTarget = mark;
      await this.until(() => { if (P.moveTarget !== mark) P.moveTarget = mark; const a = k.moveTo(st.other.x, st.other.z, 1 / 60, 0.6, 0.3), b = !st.moved || dist(P.pos.x, P.pos.z, st.me.x, st.me.z) < 0.3, c = !sh?.hold?.kaizo || dist(sh.pos.x, sh.pos.z, sh.hold.x, sh.hold.z) < 0.4; frameGroup(G, this.framePts(P), { min: 12, max: 17 }); return a && b && c; }, 4);
      shadowOnMark(sh);
      if (st.moved && dist(P.pos.x, P.pos.z, st.me.x, st.me.z) > 0.6) P.setPos(st.me.x, st.me.z);
      P.moveTarget = null;
      faceUp(G, k, P, [0.4, 0.3]);
      const fr = frameClear(G, this.view, this.framePts(P), [P.pos, k.pos], sh?.hold?.kaizo ? [sh.pos] : []); this.framed = fr?.moved ? 'moved' : 'base';
      await this.wait(0.4);
      k.anim.play('wave');
      const me = this.H.name(), name = ZONE_NPCS[ID]?.name || 'Old Captain Kaizo', portrait = G.portrait?.(ID);
      const say = (lines, choices) => ui.dialogue({ speaker: name, portrait, lines, choices, voice: ZONE_NPCS[ID]?.spec?.voice });
      k.anim.talk = 0.8;
      const a = await say([`Ahoy there! You'd be ${me}, from Rosie's notice? The one with the very good dog?`], [{ text: "That's us!" }, { text: "Who's asking?" }]);
      await say(a === 0 ? ["Ha! I knew it. Your Shadow's famous all the way down the coast."] : ['Old Captain Kaizo of Shiokaze Port, that\'s who. Sailed every cove from here to the moon.', '…Well. Most coves.']);
      const saved = this.plan === 'saved', crew = this.H.arrivals?.savedBy?.('tidepool') === 'crew';
      if (saved) {
        await say(['I came to fetch help, matey. Shiokaze Port was under siege.', crew ? 'But my gulls tell me your crew already chased the crabs back to sea! Fine sailors, the lot of them.' : "But my gulls tell me someone already chased the crabs back to sea. …It was you, wasn't it? You've a sea dog's grin.", 'So I rowed all this way to say thank you. And I\'d row it again.', 'Come and see the port, matey. The fish market\'s open, and the tea is terrible.']);
      } else {
        await say(["I'll not waste your time, matey. Shiokaze Port's under siege.", 'Crabs in the nets, kappa on the roofs, and a crab the size of a boathouse sitting in the square. Captain Brineclaw, he calls himself.', "The Waypoint Shrine's gone dark and the boats can't put out. So I rowed all night to find you."]);
        const c = await say(['Will you come? The port needs a crew with paws.'], [{ text: 'Anchors aweigh! ♡' }, { text: 'Only if I get to steer the boat.' }]);
        await say(c === 1 ? ['Ha! Only if you promise not to steer it into the pier. I did that once. The pier remembers.', "I'll be at my lookout. Take the Wayfarer's Post to the Tidepools, and mind the crabs."] : ["That's the spirit! I'll be at my lookout.", "Take the Wayfarer's Post to the Tidepools, and mind the crabs."]);
      }
      k.anim.talk = 0;
      // he goes home: a wave, back to his boat, in, and off to sea, the camera watching him go (a few seconds); the visit
      // recorded first (a reload now doesn't bring him again), the quest's card once the beach is quiet
      this.state = 'leave'; leaving = true;
      Events.emit('kaizo:arrive', { phase: 'leave' });
      if (sh?.hold?.kaizo) sh.hold = null;
      if (G.sceneKeepOut?.by === 'kaizo') keepOut(G, null);
      this.H.arrivals?.finished?.(ID);
      await this.goHome(P);
    } finally {
      G.introFocus = null; rig.distTarget = prevDist; P.controlLocked = false; P.moveTarget = null;
      if (G.sceneKeepOut?.by === 'kaizo') keepOut(G, null);
      if (sh?.hold?.kaizo) sh.hold = null;
      if (!leaving) this.reset(true);
    }
  }
  /** back to his boat, in, and off to sea, the camera framing you, him and the boat (the quest's card waits for it:
   *  world/questMoments.js why) */
  async goHome(P) {
    const G = this.G, k = this.kaizo, b = this.boat, out = this.out; if (!k || !b) { this.state = 'done'; return; }
    const frame = () => frameGroup(G, [[P.pos.x, P.pos.z, 0, 1.45], [k.pos.x, k.pos.z, 0, 1.45], [b.position.x, b.position.z, 0, 0.6]], { min: 13, max: 22 });
    const clock = () => { const t0 = performance.now(); return () => (performance.now() - t0) / 1000; }; // (seconds since: frame-rate free)
    k.anim.play('wave'); await this.until(() => { frame(); return false; }, 0.8);
    if (!this.kaizo) return;
    const side = new THREE.Vector3(out.z, 0, -out.x), to = this.boatAt.clone().addScaledVector(side, 0.75);
    await this.until(() => { frame(); return !this.kaizo || this.kaizo.moveTo(to.x, to.z, 1 / 60, 0.8, 0.25); }, 4);
    if (!this.kaizo) return;
    // he hops in (a little hop over the side) and sits on the thwart, facing the beach
    const by = this.boatAt.y, seat = () => k.pos.set(b.position.x, b.position.y + 0.14, b.position.z);
    sfx('door_knock', { pos: this.boatAt, vol: 0.4, pitch: 0.8 });
    let T = clock(); const from = k.pos.clone();
    await this.until(() => { const e = Math.min(1, T() / 0.35); k.pos.lerpVectors(from, b.position, e); k.pos.y = by + 0.14 + Math.sin(e * Math.PI) * 0.35; frame(); return e >= 1; }, 1);
    seat(); k.faceTarget = k.facing = Math.atan2(-out.x, -out.z); k.anim.play('sit');
    await this.until(() => { frame(); return false; }, 0.4);
    // the boat slides off the sand and out to sea, rocking, him sat facing the beach; then a splash, and the sea's empty
    const p0 = b.position.clone(); T = clock();
    await this.until(() => {
      const t = T(), e = Math.min(1, t / 3.4), d = 9 * e * e * (3 - 2 * e);
      b.position.set(p0.x + out.x * d, p0.y - 0.14 * Math.min(1, e * 3) + Math.sin(t * 4) * 0.025, p0.z + out.z * d); b.rotation.z = Math.sin(t * 2.6) * 0.05;
      seat(); frame();
      return e >= 1;
    }, 4);
    G.vfx?.poof?.(b.position.clone().setY(b.position.y + 0.4), { color: '#e8f4ff', n: 14, size: 0.7 }); sfx('splash', { pos: b.position, vol: 0.5 });
    b.parent?.remove(b); this.boat = null;
    this.kaizo?.dispose(); this.kaizo = null;
    this.view?.dispose(); this.view = null;
    this.state = 'done';
    Events.emit('kaizo:arrive', { phase: 'done' });
  }
  // ------------------------------------------------------------------ the maps and the pointer (actors/arrivals.js)
  person() {
    const k = this.kaizo; if (!k?.visible || !this.active || this.G.mode !== 'village') return null;
    return { key: 'p:arrival:kaizo', kind: 'person', group: 'quest', id: ID, name: ZONE_NPCS[ID]?.name || 'Old Captain Kaizo', role: 'Just landed on the beach', color: '#2e4a6e', initial: 'K', npc: k, pos: k.pos, visible: true, badge: '!', prio: 7, named: true, area: 'village', arrival: true };
  }
  target() { const k = this.kaizo; return this.state === 'land' && k?.visible ? { pos: k.pos, label: 'A boat on the beach', kind: 'npc', arrival: 'kaizo' } : null; }
}
