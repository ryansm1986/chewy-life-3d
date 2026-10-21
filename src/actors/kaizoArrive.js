// Captain Kaizo's rowboat on the beach: the shared staging of an arrival by sea (ROADMAP Z-H3, H-6; docs/ZONES.md §3.1,
// docs/STELLA.md §6). Shiokaze Port's old captain came alone at first, a messenger for the Tide Pool; since Stella (the
// sixth hero) he rows her over, and her scene (actors/stellaJoin.js) owns the beats. This is what stays his:
//   - his rig (the zone villager's Toybox rig, SceneKaizo) and his rowboat (the buildings kit's boat, its oars shipped);
//   - the shore search: where the boat comes ashore on the beach below the foot of Beach Lane, in plain view of the camera,
//     with a spot beside it (`me`) that has room on the sand for you 2.1 m across the screen; his own spot on the boat's
//     other side;
//   - land(): the boat pulled up on the sand (its stern at the waterline, its bow up the beach), him beside it looking out
//     to sea; watch(): he turns to you and waves when you come near;
//   - goHome(): back to his boat, a hop in, and the boat sliding off the sand and out to sea with him sat facing the
//     beach, the camera watching him go; a splash, and the beach is quiet again.
// The owner gives it its clock: until(fn, max) resolves once fn() is true (checked every frame) or after max seconds.
import * as THREE from 'three';
import { Actor } from './actor.js';
import { Events } from '../core/events.js';
import { zoneNpcRig, zoneSpec } from './zoneVillagers.js';
import { ZONE_NPCS } from '../regions/village/data.js';
import { Builder, G as Geo, C, V, instantiate } from '../world/buildings/kit.js';
import { tube } from '../gfx/geom.js';
import { boat } from '../world/buildings/props2.js';
import { SceneView, frameGroup, paved, onPaving, groundCost, camAxes } from './sceneStage.js';

const sfx = (n, o) => Events.emit('sfx', n, o);
export const KAIZO_ID = 'sk_kaizo';
export const kaizoName = () => ZONE_NPCS[KAIZO_ID]?.name || 'Old Captain Kaizo';
export const LANE_END = { x: 96.6, z: 202 }; // the foot of Beach Lane (world/layout.js STREETS.beach), the beach just below it
/** the boat's size on the sand: half its length (along the way out to sea) and half its beam */
export const BOAT = { half: 0.85, beam: 0.42, seat: 0.14 };

/** the scene's Kaizo: a zone villager's rig that walks and talks */
export class SceneKaizo extends Actor {
  constructor(world, G) {
    super(world, zoneNpcRig(KAIZO_ID), { radius: 0.3, speed: 2.6, name: kaizoName() });
    this.G = G; this.height = this.rig.height || 1.2;
  }
}
// his rowboat: the buildings kit's boat with its oars shipped, in the village's own materials (as the beached rowboat by the
// bridge: world/details.js beachedBoatPiece)
let BOAT_TPL = null;
export function boatMesh() {
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

export class KaizoBoat {
  /** owner: the scene that plays it ({ until(fn, max) }) */
  constructor(G, owner) {
    this.G = G; this.owner = owner;
    this.kaizo = null; this.boat = null; this.boatAt = null; this.out = null; this.side = null; this.spot = null; this.me = null; this.view = null;
  }
  until(fn, max) { return this.owner.until(fn, max); }
  /** his face for the dialogue and the cards (the zone's villagers register theirs only once Shiokaze has been visited) */
  face() { if (this.faced || !this.G.registerPortrait) return; this.faced = true; try { this.G.registerPortrait(KAIZO_ID, zoneSpec(KAIZO_ID)); } catch (e) { /* the default face */ } }
  /** while the scene waits: his rig made hidden, the scenery round the lane's foot gathered a few ms a frame → ready */
  prepare() {
    const G = this.G;
    if (!this.kaizo) { this.kaizo = new SceneKaizo(G.world, G); this.kaizo.visible = false; this.kaizo.setPos(LANE_END.x, LANE_END.z); this.kaizo.update(0); }
    this.view ||= new SceneView(G, LANE_END, { w: 14, back: 8, front: 16 });
    return this.view.prepStep(3);
  }
  update(dt) { if (this.kaizo && this.kaizo.visible) this.kaizo.update(dt); }
  dispose() {
    this.kaizo?.dispose(); this.kaizo = null;
    if (this.boat) { this.boat.parent?.remove(this.boat); this.boat = null; }
    this.view?.dispose(); this.view = null;
    this.boatAt = null; this.out = null; this.side = null; this.spot = null; this.me = null;
  }
  // ------------------------------------------------------------------ the shore
  /** walkable ground (not the sea, not a wall) */
  dry(x, z) { const W = this.G.world; return W.walkable?.(x, z) !== false && !W.collision?.solidAt?.(x, z, 0.35); }
  /** off the boat (its hull, with a margin): r widens it */
  offBoat(x, z, r = 0) {
    const b = this.boatAt, o = this.out; if (!b || !o) return true;
    const dx = x - b.x, dz = z - b.z, along = dx * o.x + dz * o.z, across = dx * o.z - dz * o.x;
    return (along / (1.35 + r)) ** 2 + (across / (0.85 + r)) ** 2 > 1;
  }
  /** room to stand: dry, off the driftwood and clear of his boat */
  free(x, z) {
    const G = this.G; if (!this.dry(x, z)) return false;
    let nodes = []; try { nodes = G.cozy?.scav?.nodes?.() || []; } catch (e) { nodes = []; } // (not on the driftwood: it's gathered there)
    if (nodes.some(n => !n.taken && Math.hypot(n.x - x, n.z - z) < 1.25)) return false;
    return this.offBoat(x, z);
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
  /** Where his boat comes ashore: on the beach below the lane's foot, or along it a few steps either way, where the spot
   *  beside the boat (`me`: a step up the beach) and the boat are in plain view of the camera (the sakura on the bank hangs
   *  over the lane's foot), with room on the sand beside that spot for you, 2.1 m across the screen (the beach is a
   *  narrow strip: the grass behind it is knee-high) → { at, out, boat: {x, z}, me: {x, z}, sd (me's side of the boat) } */
  shore() {
    const G = this.G, Vw = this.view?.occ ? this.view : null, { T, R } = camAxes(G), cands = [];
    const sand = (x, z) => paved(G, x, z) && this.free(x, z);
    for (const o of [0, 2, -2, 4, -4, 6, -6, 8, -8]) {
      const w = this.waterline(LANE_END.x + o * 0.8, LANE_END.z + o * 0.6); if (!w) continue;
      const out = w.out, side = { x: out.z, z: -out.x }, boat = { x: w.at.x - out.x * 0.75, z: w.at.z - out.z * 0.75 };
      if (!this.free(boat.x, boat.z)) continue;
      for (const [up, sd] of [[1.3, 1.1], [1.3, -1.1], [0.9, 1.3], [0.9, -1.3], [0.5, 1.4], [0.5, -1.4], [1.8, 0.8], [1.8, -0.8]]) {
        const me = { x: boat.x - out.x * up + side.x * sd, z: boat.z - out.z * up + side.z * sd }; if (!this.free(me.x, me.z)) continue;
        // (your mark: 2.1 m across the screen from that spot, on the sand, either side)
        let room = 0; for (const s of [1, -1]) for (const t of [-0.5, -0.2, -0.8]) { const x = me.x - s * 2.1 * R[0] - t * T[0], z = me.z - s * 2.1 * R[1] - t * T[1]; if (sand(x, z) && onPaving(G, x, z, 0.5) && Math.hypot(x - boat.x, z - boat.z) > 1.3) room++; }
        const hid = Vw && (Vw.screened(me.x, me.z, [0.3, 0.7, 1.1, 1.45], 0.3) || Vw.screened(boat.x, boat.z, [0.2, 0.4], 0.5));
        cands.push({ ...w, boat, me, sd: Math.sign(sd), s: Math.abs(o) * 0.3 + (hid ? 10 : 0) + groundCost(G, me.x, me.z, 2) + (room ? 0 : 4) - Math.min(room, 3) * 0.3 });
      }
    }
    cands.sort((a, b) => a.s - b.s);
    if (cands[0]) return cands[0];
    const at = { x: LANE_END.x, z: LANE_END.z + 3 }, out = { x: -0.15, z: 1 };
    return { at, out, boat: { x: at.x - out.x * 0.75, z: at.z - out.z * 0.75 }, me: { x: at.x - out.x * 2 + 1, z: at.z - out.z * 2 }, sd: 1 };
  }
  /** the boat pulled up on the sand, its stern at the waterline and its bow up the beach; him on its other side from `me`,
   *  a step up the beach, looking out to sea → the shore record */
  land() {
    const G = this.G, k = this.kaizo, W = G.world, sh = this.shore();
    const out = this.out = new THREE.Vector3(sh.out.x, 0, sh.out.z).normalize();
    this.side = new THREE.Vector3(out.z, 0, -out.x);
    const b = this.boat = boatMesh(); b.position.set(sh.boat.x, W.heightAt(sh.boat.x, sh.boat.z), sh.boat.z); b.rotation.set(0, Math.atan2(out.x, out.z) + Math.PI / 2, 0.06); W.scene.add(b);
    this.boatAt = b.position.clone();
    this.me = new THREE.Vector3(sh.me.x, W.heightAt(sh.me.x, sh.me.z), sh.me.z);
    // his spot: beside the boat on the other side (or, no room there, up the beach past the bow)
    let ks = null;
    for (const [up, sd] of [[0.35, 1.15], [0.8, 1.2], [0, 1.25], [1.25, 1.0], [1.9, 0.4], [1.9, -0.4]]) { const x = b.position.x - out.x * up - this.side.x * sh.sd * sd, z = b.position.z - out.z * up - this.side.z * sh.sd * sd; if (this.free(x, z) && Math.hypot(x - sh.me.x, z - sh.me.z) > 1.3) { ks = { x, z }; break; } }
    ks ||= { x: b.position.x - out.x * 1.9, z: b.position.z - out.z * 1.9 };
    this.spot = new THREE.Vector3(ks.x, W.heightAt(ks.x, ks.z), ks.z);
    k.setPos(ks.x, ks.z); k.facing = k.faceTarget = Math.atan2(out.x, out.z); k.visible = true; k.update(0);
    this.face();
    sfx('water_splash', { pos: this.boatAt, vol: 0.4 });
    return sh;
  }
  /** a point on the boat: along (toward the bow, up the beach, from its middle), up (above the sand under it) */
  onBoat(along, up = BOAT.seat, out = new THREE.Vector3()) { const b = this.boat?.position || this.boatAt, o = this.out; return out.set(b.x - o.x * along, b.y + up, b.z - o.z * along); }
  /** he turns to you and waves when you come near (d: how far you are) */
  watch(dt, P, d) {
    const k = this.kaizo; if (!k) return;
    if (d < 12) k.faceTo(P.pos.x, P.pos.z); else k.faceTarget = Math.atan2(this.out.x, this.out.z);
    if (d < 12 && (this.waved = (this.waved || 0) - dt) <= 0) { this.waved = 5; k.anim.play('wave'); if (d < 9) this.G.vfx?.emote?.(k, '!', 1.2); }
  }
  /** back to his boat, in, and off to sea, the camera framing you, him and the boat (and pts: anyone else in the beat);
   *  the quest's card waits for it (world/questMoments.js why) */
  async goHome(P, pts = () => []) {
    const G = this.G, k = this.kaizo, b = this.boat, out = this.out; if (!k || !b) return;
    const frame = () => frameGroup(G, [[P.pos.x, P.pos.z, 0, 1.45], [k.pos.x, k.pos.z, 0, 1.45], [b.position.x, b.position.z, 0, 0.6], ...pts()], { min: 13, max: 22 });
    const clock = () => { const t0 = performance.now(); return () => (performance.now() - t0) / 1000; }; // (seconds since: frame-rate free)
    k.anim.play('wave'); await this.until(() => { frame(); return false; }, 0.8);
    if (!this.kaizo) return;
    const sd = Math.sign((k.pos.x - this.boatAt.x) * this.side.x + (k.pos.z - this.boatAt.z) * this.side.z) || 1, to = this.boatAt.clone().addScaledVector(this.side, 0.75 * sd); // (his side of it)
    await this.until(() => { frame(); return !this.kaizo || this.kaizo.moveTo(to.x, to.z, 1 / 60, 0.8, 0.25); }, 4);
    if (!this.kaizo) return;
    // he hops in (a little hop over the side) and sits on the thwart, facing the beach
    const by = this.boatAt.y, seat = () => k.pos.set(b.position.x, b.position.y + BOAT.seat, b.position.z);
    sfx('door_knock', { pos: this.boatAt, vol: 0.4, pitch: 0.8 });
    let T = clock(); const from = k.pos.clone();
    await this.until(() => { const e = Math.min(1, T() / 0.35); k.pos.lerpVectors(from, b.position, e); k.pos.y = by + BOAT.seat + Math.sin(e * Math.PI) * 0.35; frame(); return e >= 1; }, 1);
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
  }
}
