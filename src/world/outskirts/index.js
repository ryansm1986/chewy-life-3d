// Blossom Hollow's outskirts (ROADMAP HP-1; the plan: world/outskirtsPlan.js, the concepts:
// tools/blender/work/codex/hollow-pois/concepts/): the two footbridges on the Ramble, the ten cozy places beside it,
// discovering them (a name card the first time; the map's Places list), and the small toolkit each place builds with.
//
//   installOutskirts(G, world) → G.outskirts = { places, found(id), visit(id), update(dt, t), stats }
//   Each place is pois/<id>.js: export function build(ctx) → optional { update(dt, t, night), near(d) }
//   State: G.state.outskirts = { found: { id: day }, done: { 'id:key': day } } (a daily thing is keyed by the day).
//   Events: 'outskirts:found' { id }, 'outskirts:did' { id, key }.
import * as THREE from 'three';
import { Events } from '../../core/events.js';
import { mulberry32, clamp } from '../../core/util.js';
import { U } from '../../gfx/materials.js';
import { Builder, instantiate } from '../buildings/kit.js';
import { registerDebug } from '../../debug/registry.js';
import { POIS, POI, FOOTBRIDGES } from '../outskirtsPlan.js';
import { footbridge, footbridgeDeckY } from './footbridge.js';
import * as lighthouse from './pois/lighthouse.js';
import * as tea from './pois/tea.js';
import * as tidepools from './pois/tidepools.js';
import * as wishtree from './pois/wishtree.js';
import * as windmill from './pois/windmill.js';
import * as moonpond from './pois/moonpond.js';
import * as pier from './pois/pier.js';
import * as seaarch from './pois/seaarch.js';
import * as bees from './pois/bees.js';
import * as cove from './pois/cove.js';

const BUILDERS = { lighthouse, tea, tidepools, wishtree, windmill, moonpond, pier, seaarch, bees, cove };
const NEAR = 70; // m: a place's own update runs while the player is this close
const FOUND_R = 1.0; // × its radius: walking this far in finds it

export function outskirtsState(G) { return (G.state.outskirts ||= { found: {}, done: {} }); }
const today = G => G.state.day || G.day?.day || 1;

export function installOutskirts(G, world) {
  const group = new THREE.Group(); group.name = 'outskirts'; world.scene.add(group);
  const anims = []; // kit parts that spin / swing / bob ({ node, a })
  // ---- the footbridges (walkable decks)
  for (const F of FOOTBRIDGES) {
    const [ax, az] = F.a, [bx, bz] = F.b, L = Math.hypot(bx - ax, bz - az), cx = (ax + bx) / 2, cz = (az + bz) / 2, yaw = Math.atan2(bx - ax, bz - az);
    const y0 = Math.max(world.terrain.heightAt(ax, az), world.terrain.heightAt(bx, bz), 0.3) - 0.05;
    const tpl = footbridge(F.id.length * 7 + Math.round(L), { L, w: F.w, rise: F.rise });
    const inst = instantiate(tpl); inst.group.position.set(cx, y0, cz); inst.group.rotation.y = yaw; group.add(inst.group);
    for (const l of tpl.lights) world.lightPool?.addSource({ pos: l.pos.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(new THREE.Vector3(cx, y0, cz)), color: l.color, intensity: l.intensity, radius: l.radius, flicker: l.flicker, nightOnly: l.nightOnly });
    // the deck: along the bridge's own axis (a rotated box), its height the arch
    const ux = (bx - ax) / L, uz = (bz - az) / L, hw = F.w / 2 + 0.05;
    const xs = [ax, bx], zs = [az, bz];
    world.decks.push({
      x0: Math.min(...xs) - hw - 0.4, z0: Math.min(...zs) - hw - 0.4, x1: Math.max(...xs) + hw + 0.4, z1: Math.max(...zs) + hw + 0.4,
      bridge: F.id,
      inside(x, z) { const px = x - cx, pz = z - cz, s = px * ux + pz * uz, t = -px * uz + pz * ux; return Math.abs(s) <= L / 2 + 0.05 && Math.abs(t) <= hw; },
      h(x, z) { const px = x - cx, pz = z - cz, s = px * ux + pz * uz; return Math.max(y0 + footbridgeDeckY(s, L, F.rise), world.terrain.heightAt(x, z)); },
    });
  }
  // decks are boxes in world.deckAt: a turned footbridge would claim the water beside it, so its inside() narrows it
  world.deckAt = (x, z) => { for (const d of world.decks) if (x > d.x0 && x < d.x1 && z > d.z0 && z < d.z1 && (!d.inside || d.inside(x, z))) return d; return null; };

  // ---- the toolkit a place builds with
  const st = outskirtsState(G);
  const places = [];
  const mkCtx = (poi) => {
    const updates = [];
    const ctx = {
      G, world, poi, group, THREE,
      rand: mulberry32(poi.id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0),
      H: (x, z) => world.terrain.heightAt(x, z),
      night: () => clamp(U.uNight.value),
      /** a kit model (buildings/kit.js Builder: B.add / B.glow / B.light / B.anim…) built by fn(B), placed at (x, y, z)
       *  turned by yaw (local +z faces (sin yaw, cos yaw)); its lights join the LightPool, its anims run → { group } */
      kit(seed, fn, { x = poi.x, z = poi.z, y = null, yaw = 0, warp = 0.02 } = {}) {
        const B = new Builder(seed); B.warpAmt = warp; B.jitter = 0.03; fn(B);
        const tpl = B.finish(), inst = instantiate(tpl);
        const yy = y ?? world.terrain.heightAt(x, z);
        inst.group.position.set(x, yy, z); inst.group.rotation.y = yaw; group.add(inst.group);
        inst.group.updateMatrixWorld(true);
        for (const l of tpl.lights) world.lightPool?.addSource({ pos: l.pos.clone().applyMatrix4(inst.group.matrixWorld), color: l.color, intensity: l.intensity, radius: l.radius, flicker: l.flicker, nightOnly: l.nightOnly });
        for (const p of inst.parts) anims.push(p);
        return inst;
      },
      /** any three.js object, added to the outskirts */
      add(obj) { group.add(obj); return obj; },
      /** a round collider (solid to the player and the companions) */
      collide(x, z, r) { return world.collision?.addCircle(x, z, r, 'outskirts'); },
      /** a walkable deck { x0, z0, x1, z1, h(x, z) } (axis-aligned) */
      deck(d) { world.decks.push(d); return d; },
      /** an interaction: { x, z, y?, r = 1.3, label, onInteract } → the record (change .label, or .pos to move it) */
      interact({ x, z, y = null, r = 1.3, label, onInteract }) {
        const it = { pos: new THREE.Vector3(x, y ?? world.terrain.heightAt(x, z), z), radius: r, label, onInteract, outskirts: poi.id };
        world.interactables.push(it); return it;
      },
      /** Shadow says something (a tip toast with his face); once: true says it only the first time ever (key) */
      say(text, { once = null } = {}) { if (once) return G.hint?.(`os:${poi.id}:${once}`, text); G.ui?.toasts?.show?.(text, { color: '#9fd0ff', iconURL: G.portrait?.('shadow'), duration: 6, sub: 'Shadow' }); },
      /** a short message under the name card style (no face) */
      toast(text) { G.ui?.toast?.(text, { duration: 4 }); },
      /** give the player things: { coins, mats: { wood: 2 }, pantry: { honey: 1 }, at: Vector3 } (floating gains, a sparkle) */
      give({ coins = 0, mats = {}, pantry = {}, at = null } = {}) {
        const A = G.actions; if (!A) return;
        for (const [k, c] of Object.entries(mats)) A.addMaterial(k, c);
        for (const [k, c] of Object.entries(pantry)) A.addPantry(k, c, { src: 'forage' });
        if (coins) A.addCoins(coins);
        const p = at || G.player?.pos?.clone().add(new THREE.Vector3(0, 1.2, 0));
        if (p) G.vfx?.sparkle?.(p, { n: 9, color: '#fff2c0', r: 0.35, rise: 0.9, size: 0.22 });
        for (const [k, c] of Object.entries(pantry)) G.ui?.pantryGain?.(k, c, { worldPos: p, quiet: true });
        G.cozy?.scav?.floatGain?.({ mats, coins });
        Events.emit('sfx', Object.keys(pantry).length ? 'pickup_magic' : 'pickup_item');
      },
      /** has `key` been done here today? */
      doneToday(key) { return st.done[`${poi.id}:${key}`] === today(G); },
      /** do `key` once a day → true the first time today (and marks it) */
      daily(key) { const k = `${poi.id}:${key}`; if (st.done[k] === today(G)) return false; st.done[k] = today(G); Events.emit('outskirts:did', { id: poi.id, key }); return true; },
      /** a short pose through the tool runner (life/tools.js: 'pickup', 'tend', 'water', 'munch', 'clap'…), onAct at `at` */
      pose(pose, { dur = 1.2, at = 0.5, face = null, onAct } = {}) {
        const T = G.life?.tools; if (!T || T.busy || G.player?.controlLocked) return false;
        return T.run({ prop: null, pose, dur, at, anywhere: true, face, onAct });
      },
      /** sit at (x, z) facing `face` (a yaw) for up to `dur` s (any move stands up): Shadow sits by you; onDone(rested) */
      sit({ x, z, y = null, face = 0, dur = 6, onDone } = {}) { return sitAt(G, world, { x, z, y, face, dur, onDone }); },
      /** a cup or a snack that leaves a Well Fed buff: a dish id (life/pantry.js), added and eaten at once */
      treat(dish) { const A = G.actions; if (!A?.addPantry || !A.eat) return null; A.addPantry(dish, 1, { src: 'gift' }); return A.eat(dish); },
      /** a good rest (a bench, a fire): life and zoom back to full, a soft sparkle */
      rest() { G.actions?.restoreAll?.(); const p = G.player?.pos; if (p) G.vfx?.sparkle?.(p.clone().add(new THREE.Vector3(0, 1, 0)), { n: 10, color: '#ffe0f0', r: 0.5, rise: 0.8, size: 0.2 }); },
      sfx(name, pos) { Events.emit('sfx', name, pos ? { pos } : undefined); },
      /** per frame while the player is near: fn(dt, t, night) */
      onUpdate(fn) { updates.push(fn); },
    };
    return { ctx, updates };
  };
  for (const poi of POIS) {
    const B = BUILDERS[poi.id]; if (!B?.build) continue;
    const { ctx, updates } = mkCtx(poi);
    let api = null;
    try { api = B.build(ctx) || null; } catch (e) { console.error(`[outskirts] ${poi.id} failed to build`, e); }
    if (api?.update) updates.push(api.update);
    places.push({ poi, ctx, api, updates });
  }

  // ---- discovery, the per-frame updates and the anims
  const stats = { found: 0, cards: 0 };
  const visit = (id) => {
    const p = POI[id]; if (!p || st.found[id]) return false;
    st.found[id] = today(G); stats.found++;
    const sting = () => { const A = G.audio; try { A?.duck?.(0.55, 2.2); A?.sting?.('place'); } catch (e) { /* (no audio yet) */ } };
    if (!G.cutscene && !G.titleActive) { G.ui?.banner?.(p.name, p.sub, { style: 'place', kicker: 'Blossom Hollow', onShow: sting }); stats.cards++; }
    Events.emit('outskirts:found', { id });
    return true;
  };
  let checkT = 0;
  const update = (dt, t) => {
    const P = G.player; if (!P || G.mode !== 'village') return;
    tickSeat(G, dt);
    const n = clamp(U.uNight.value);
    for (const pl of places) {
      const d = Math.hypot(P.pos.x - pl.poi.x, P.pos.z - pl.poi.z);
      if (d > NEAR) continue;
      for (const f of pl.updates) f(dt, t, n, d);
    }
    for (const { node, a } of anims) {
      const k = Math.sin(t * a.speed + a.phase) * a.amp;
      if (a.kind === 'spin') node.quaternion.setFromAxisAngle(a.axis, t * a.speed + a.phase);
      else if (a.kind === 'bob') node.position.y = a.pivot.y + k;
      else node.quaternion.setFromAxisAngle(a.axis, k);
    }
    checkT -= dt; if (checkT > 0) return; checkT = 0.4;
    if (G.cutscene || G.introFocus || G.titleActive || G.ui?.banners?.busy) return;
    for (const p of POIS) if (!st.found[p.id] && Math.hypot(P.pos.x - p.x, P.pos.z - p.z) < p.r * FOUND_R) { visit(p.id); break; }
  };

  registerDebug('outskirts', [
    ...POIS.map(p => ({ group: 'Go to', label: p.name, closes: true, run: G => { G.player.setPos(p.x + p.r + 2, p.z + p.r + 2); G.companion?.setPos?.(p.x + p.r + 3, p.z + p.r + 2); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap?.(); return p.name; } })),
    { group: 'Found', label: 'Find them all', run: G => { for (const p of POIS) st.found[p.id] ||= today(G); return 'All ten found'; } },
    { group: 'Found', label: 'Forget them all', run: () => { st.found = {}; st.done = {}; return 'Forgotten'; } },
  ], { title: 'Outskirts', icon: 'map', order: 40, note: "Blossom Hollow's outskirts (ROADMAP HP-1): the Ramble, its footbridges and ten cozy places." });

  return (G.outskirts = { places, group, update, visit, found: id => !!st.found[id], stats, state: () => st });
}

// sitting: a snap to the seat, the bench pose, Shadow sits at your feet; moving away (or dur) stands you up. The
// outskirts' update ticks it (tickSeat).
let seat = null;
function sitAt(G, world, { x, z, y, face, dur, onDone }) {
  const P = G.player; if (!P || P.controlLocked || G.life?.tools?.busy || seat) return false;
  P.moveTarget = null; P.interactTarget = null; P.route?.clear?.();
  P.setPos(x, z); if (y != null) P.pos.y = y;
  P.facing = P.faceTarget = face;
  P.anim?.play?.('sitBench');
  G.companion?.setPos?.(x + Math.sin(face + 1.2) * 0.9, z + Math.cos(face + 1.2) * 0.9);
  G.companion?.anim?.play?.('sit');
  seat = { t: 0, dur, x, z, onDone, end(rested) { if (seat !== this) return; seat = null; P.anim?.stop?.('sitBench'); P.anim?.play?.('standUp'); onDone?.(rested); } };
  return seat;
}
function tickSeat(G, dt) {
  const s = seat, P = G.player; if (!s || !P) return;
  s.t += dt;
  if (Math.hypot(P.pos.x - s.x, P.pos.z - s.z) > 0.25 || P.moveTarget) return s.end(s.t >= s.dur * 0.6);
  if (s.t >= s.dur) s.end(true);
}
export const sittingNow = () => seat;
