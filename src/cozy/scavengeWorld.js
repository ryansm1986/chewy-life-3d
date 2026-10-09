// Scavenging in the world (docs/COZY.md §7, §10, §12; ROADMAP CZ-5, CZ-6): the gather nodes and Shadow's dig spots
// placed in Blossom Hollow and in each zone, drawn as ONE BatchedMesh an area (scavengeModels.js) plus one sparkle
// Points, their interactables, the gather (a pickup pose through life/tools.js), the hold-to-dig with the golden band
// (ui/digRing.js), Shadow's nose (actors/companion.js noseTo / digWith) and the debug actions. The rules and the
// numbers are the pure module's (cozy/scavenge.js).
//
//   installScavenge(G, village) → G.cozy.scav = {
//     area(), view(), nodes(), spots(), busy, session,
//     gather(id), digAt(id, o), refill(), reveal(), mapMarks(), setWild(fn), update(dt),
//   }
//   Events: 'scavenge:gather' { node, area, kind, mats, pantry, coins }, 'scavenge:dig' { area, spot, perfect, streak,
//   mats, coins, find, quest }, 'scavenge:found' { area, spot } (Shadow sniffed a spot out), 'scavenge:refill' { day }.
//
// Placement: Blossom Hollow's nodes sit on fixed, hand-picked sites (HOME_SITES); a zone's come from fixed slots built
// from its plan (the glades: the camp sites' rims, which phase B empties into wildlife glades once the village is
// saved; the trail's edges; the POIs' rims; the arrival), picked spread out in a fixed order, so a node's id (its slot,
// and so "taken") is stable across visits. A slot that isn't free on a visit (a prop, water, the zone village, a wild
// area) is skipped. The wild areas are phase B's (COZY §6.2, cozy/peaceful.js wildAreas(plan)): no node or dig spot
// within 2.5 m of a wild disc; setWild(fn(zone, x, z)) adds any further rule.
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { Input } from '../core/input.js';
import { Actions } from '../core/actions.js';
import { mulberry32, TAU, clamp } from '../core/util.js';
import { U } from '../gfx/materials.js';
import { registerDebug } from '../debug/registry.js';
import { pickFind } from '../home/finds.js';
import { ZONE_QUESTS, QUEST_ITEMS } from '../world/zoneQuests.js';
import { DigRing } from '../ui/digRing.js';
import { glyph } from '../ui/glyphs.js';
import {
  SCAV_AREAS, AREA_DEFS, NODE_KINDS, DIG_SECS, NOSE_RANGE, NOSE_RANGE_BANDANA, GATHER_SECS, areaFor, scavState, scavDay, areaRec,
  takeNode, findSpot, digSpot, digResult, cheatPerfect, spotCount, pickSpots, spotId, gatherYield, digYield, questFind, markQuestDig, staleAreas,
} from './scavenge.js';
import { nodeGeos, digGeos, scavBatch } from './scavengeModels.js';
import { wildAreas } from './peaceful.js'; // (phase B's interface: the wild discs stay monster-only, COZY §6.2)
import { PLOTS } from '../world/plots.js';
import { distToPaths, reservedAt } from '../world/layout.js';

const MAT_COL = { wood: '#d8a070', stone: '#c8c0d0', petal: '#ffb0d0', crystal: '#9ae8ff', bone: '#fff4e0', mochi: '#ffe0ec', silk: '#ece4ff', lantern: '#ffa060' };
const MOVE = ['w', 'a', 's', 'd', 'up', 'down', 'left', 'right', 'space', 'escape'];
const PARK = new THREE.Vector3(-999, -50, -999);
// the camera's view (screened): the game yaw is 45°; both 45° yaws it turns to must see a node (its foot and its top)
// and a dig spot (the kneeling hero, Shadow, the ring over them)
const VIEW_YAWS = [Math.PI / 4, -Math.PI / 4], GAME_YAW = [Math.PI / 4], NODE_HS = [0.55], DIG_HS = [0.55, 1.4];
const ZONE_NUDGES = [[0, 0], [0, 1.2], [1.2, 0], [-1.2, 0], [0, -1.2], [0.9, 0.9], [-0.9, 0.9], [0, 2.4], [2.2, 0.8], [-2.2, 0.8], [1.7, -1.7], [-1.7, -1.7], [0, -2.4], [0, 3.6], [3, 2], [-3, 2]];
const NUDGES = [[0, 0], [1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5], [1.5, 1.5], [-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [3, 0], [-3, 0], [0, 3], [0, -3], [3, -3], [-3, 3], [4.5, 0], [-4.5, 0], [0, 4.5], [0, -4.5]];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _v = new THREE.Vector3();

// ------------------------------------------------------------------ Blossom Hollow's sites (fixed; probed in the game)
// kind, x, z, rot. Off every plot, street and square, on open ground the camera sees: the beach (driftwood), the river
// banks (stones), the sakura belts (petal drifts), the old mulberry by the farm fields (silk). tools/qa/s33 checks them.
export const HOME_SITES = [
  { kind: 'driftwood', x: 84, z: 200, rot: 0.4 }, { kind: 'driftwood', x: 104, z: 207.5, rot: 2.1 }, { kind: 'driftwood', x: 126, z: 204, rot: 1.2 },
  { kind: 'riverStone', x: 78, z: 84, rot: 0.3 }, { kind: 'riverStone', x: 70, z: 138, rot: 1.9 }, { kind: 'riverStone', x: 53.5, z: 153, rot: 0.9 },
  { kind: 'petalDrift', x: 134, z: 100, rot: 0.2 }, { kind: 'petalDrift', x: 120, z: 136, rot: 1.4 }, { kind: 'petalDrift', x: 136, z: 174, rot: 2.6 },
  { kind: 'mulberry', x: 74, z: 102, rot: 0.6 },
];
// where Shadow's dig spots can be at home (a day's 2–3 are picked from these, spread out): open ground 3–9 m off a street
export const HOME_DIG = [[43, 99], [55, 111], [97, 96], [130, 96], [145, 90], [160, 102], [106, 132], [157, 135], [94, 159], [76, 159], [100, 174], [127, 177], [91, 189], [109, 189], [82, 78], [106, 81], [70, 144]];

export function installScavenge(G, village) {
  const run = new ScavRun(G, village);
  return run;
}

class ScavRun {
  constructor(G, village) {
    this.G = G; this.village = village;
    scavState(G.state);
    this.views = new Map(); // world → view
    this.s = null; // the dig session
    this.noseT = 0; this.day = scavDay(G.state); this.wildFn = null; this.showAll = 0; this.ringSpeed = 1;
    this.ring = G.ui?.layers?.hud ? new DigRing(G.ui, G.ui.layers.hud) : null;
    const self = this;
    const api = this.api = {
      area: () => self.view()?.area || null,
      view: () => self.view(),
      nodes: () => (self.view()?.nodes || []).map(n => ({ id: n.id, kind: n.kind, x: n.x, z: n.z, y: n.y, taken: n.taken, on: !!n.inst || n.inst === 0 })),
      spots: () => (self.view()?.spots || []).map(s => ({ id: s.id, x: s.x, z: s.z, y: s.y, state: s.state, quest: !!s.quest })),
      get busy() { return !!self.s; },
      /** QA: the dig ring's speed (1: the game's 1.4 s; the band tests slow it so a slow headless frame can't skip the band) */
      get ringSpeed() { return self.ringSpeed; }, set ringSpeed(v) { self.ringSpeed = Math.max(0.05, +v || 1); },
      get session() { return self.s; },
      gather: id => self.gatherNow(id),
      digAt: (id, o) => self.digNow(id, o),
      reveal: () => self.revealAll(),
      refill: () => self.refillAll(true),
      redraw: () => self.refillAll(false), // (redraw today's nodes and spots: the Guild's Bandana adds a spot at once, cozy/guildRun.js)
      mapMarks: () => self.mapMarks(),
      setWild: fn => { self.wildFn = typeof fn === 'function' ? fn : null; },
      update: dt => self.update(dt),
      ring: this.ring,
      /** QA: why a spot is screened from the camera ([{ yaw, h, t, by: 'ground' | 'scenery' }]) */
      screenWhy: (x, z, hs) => self.screenWhy(x, z, hs),
      homeSites: HOME_SITES,
    };
    if (G.cozy) G.cozy.scav = api;
    this.awayRefills(staleAreas(G.state)); // (the load's time away: a world day crossed while the game was closed)
    this.home = this.attach(village, 'home');
    Events.on('mode:changed', () => this.onMode());
    Events.on('cozy:changed', () => this.checkDay()); // (the debug clock, a sleep, time away: the day's refill at once; update polls too)
    this.registerDebug();
  }
  get st() { return this.G.state; }
  view() { return this.views.get(this.G.world) || null; }

  // ------------------------------------------------------------------ building an area's view
  onMode() {
    const G = this.G;
    this.endDig(true);
    // forget views of worlds that are gone (a region's teardown already took its meshes out: see attach)
    for (const [w, v] of this.views) if (v.area !== 'home' && w !== G.world) this.views.delete(w);
    const zone = G.mode === 'dungeon' && G.dungeon?.isRegion ? G.dungeon.zoneId : null;
    if (zone && !this.views.has(G.world)) this.attach(G.world, areaFor('dungeon', zone));
  }
  attach(world, area) {
    if (!world || !area || !AREA_DEFS[area]) return null;
    const v = { area, world, nodes: [], spots: [], inters: [], day: -1, mesh: null, spark: null, geo: {} };
    try {
      const t0 = performance.now();
      const sites = area === 'home' ? this.homeSites(world) : this.zoneSites(world, area);
      v.placeMs = +(performance.now() - t0).toFixed(1);
      v.nodes = sites.nodes; v.cands = sites.digs;
    } catch (e) { console.error('[scavenge] placement failed', e); v.nodes = []; v.cands = []; }
    this.occ = null; // (the occluder list is only for placement)
    // clear the little plants (flowers, ferns, tufts) off each node and dig site, so the prop sits in the open; the grass
    // stays (it's a GPU field) and big trees were already kept away by the camera check
    const veg = world.veg;
    if (veg?.recordsIn) for (const p of [...v.nodes, ...(v.cands || [])]) veg.recordsIn(p.x - 1.1, p.z - 1.1, p.x + 1.1, p.z + 1.1, rec => { if (rec.alive && !rec.keep && !rec.big && Math.hypot(rec.x - p.x, rec.z - p.z) < 1.0) veg._kill(rec); });
    this.buildMesh(v);
    // the interactables: one per node, plus a fixed pool for the day's dig spots (the village's list stays stable: s1)
    for (const n of v.nodes) { n.it = { pos: new THREE.Vector3(n.x, n.y, n.z), radius: 1.05, scav: n.id, label: NODE_KINDS[n.kind].verb, onInteract: () => this.gatherStart(v, n) }; v.inters.push(n.it); world.interactables.push(n.it); }
    v.pool = [];
    for (let i = 0; i < 4; i++) { const it = { pos: PARK.clone(), radius: 1.0, scavDig: true, label: 'Dig with Shadow', onInteract: () => this.digStart(v, it.spot) }; v.pool.push(it); world.interactables.push(it); }
    this.views.set(world, v);
    if (area !== 'home') world.disposers?.push(() => this.detach(v)); // (before the region's scene is disposed: our material stays alive)
    this.refresh(v);
    return v;
  }
  detach(v) {
    if (this.s?.v === v) this.endDig(true);
    for (const o of [v.mesh, v.spark, v.ring]) if (o) { o.parent?.remove(o); o.geometry?.dispose?.(); o.dispose?.(); }
    v.mesh = v.spark = null;
    this.views.delete(v.world);
  }
  /** Blossom Hollow: the fixed sites, nudged off anything solid */
  homeSites(world) {
    // each site, or the nearest of a few nudges round it that is open ground the camera sees (no canopy, roof or hill
    // between it and the lens from either 45° yaw)
    const ok = (x, z, hs) => world.walkable(x, z) && !world.collision?.solidAt(x, z, 0.6) && world.heightAt(x, z) > 0.05 && distToPaths(x, z) > 1.8 && !reservedAt(x, z)
      && !PLOTS.some(p => x > p.x - 1.2 && x < p.x + p.w + 1.2 && z > p.z - 1.2 && z < p.z + p.d + 1.2) && !this.screened(world, x, z, hs);
    const near = (x, z, hs) => { for (const [dx, dz] of NUDGES) if (ok(x + dx, z + dz, hs)) return { x: x + dx, z: z + dz }; return null; };
    const nodes = [];
    HOME_SITES.forEach((s, i) => { const p = near(s.x, s.z, NODE_HS) || s; nodes.push({ id: `home:${i}`, kind: s.kind, x: p.x, z: p.z, rot: s.rot, s: 1, y: this.groundY(world, p.x, p.z) }); });
    const digs = HOME_DIG.map(([x, z]) => near(x, z, DIG_HS)).filter(Boolean);
    return { nodes, digs };
  }
  // ------------------------------------------------------------------ the camera's view (no prop hidden under a canopy)
  /** What can hide a spot from the game camera, as a column grid (0.5 m cells over the world: the lowest and highest
   *  opaque scenery in each): trees, bamboo clumps, buildings and props, each instance of a batch by its box, a merged
   *  mesh triangle by triangle. Not the ground (the heightfield is marched), the grass, the low ground cover, the
   *  actors or the effects. Built once a placement (a few tens of ms), dropped after it. */
  occluders(world) {
    if (this.occ?.world === world) return this.occ;
    const G = this.G, skip = new Set([G.player?.rig?.root, G.companion?.rig?.root, ...(world.veg?.grassMeshes || []), ...(G.npcs || []).map(n => n.rig?.root)].filter(Boolean));
    const LOW = /^(terrain|regionGround|water|sky|horizon|scavenge|horde|fishing|veg:(litter|moss|d:flat|d:grass|flower|plant|fern|d:glow))/;
    const X0 = -50, N = 560, CS = 0.5, lo = new Float32Array(N * N).fill(1e9), hi = new Float32Array(N * N).fill(-1e9);
    const mark = (x0, z0, x1, z1, y0, y1) => {
      const i0 = Math.max(0, Math.floor((x0 - X0) / CS)), i1 = Math.min(N - 1, Math.floor((x1 - X0) / CS)), j0 = Math.max(0, Math.floor((z0 - X0) / CS)), j1 = Math.min(N - 1, Math.floor((z1 - X0) / CS));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * N + i; if (y0 < lo[k]) lo[k] = y0; if (y1 > hi[k]) hi[k] = y1; }
    };
    const box = new THREE.Box3(), m4 = new THREE.Matrix4(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const markBox = (bb, M, shrink = 0.8) => { box.copy(bb).applyMatrix4(M); const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2, hx = (box.max.x - box.min.x) / 2 * shrink, hz = (box.max.z - box.min.z) / 2 * shrink; mark(cx - hx, cz - hz, cx + hx, cz + hz, box.min.y, box.max.y); };
    const walk = ob => {
      if (skip.has(ob) || ob.visible === false || ob.isSkinnedMesh || ob.isBone || ob.isSprite || ob.isPoints || ob.isLine || LOW.test(ob.name || '') || /^terrain/.test(ob.name || '')) return;
      const mat = Array.isArray(ob.material) ? ob.material[0] : ob.material, g = ob.geometry;
      if ((ob.isMesh) && mat && !mat.transparent && mat.depthWrite !== false && g?.attributes?.position && (ob.layers.mask & 1) && !/skin|outline|xray/.test(ob.name)) {
        ob.updateWorldMatrix(true, false);
        if (ob.isBatchedMesh) {
          const n = ob._instanceInfo?.length ?? ob.instanceCount;
          for (let i = 0; i < n; i++) { try { if (!ob.getVisibleAt(i)) continue; ob.getMatrixAt(i, m4); m4.premultiply(ob.matrixWorld); const bb = ob.getBoundingBoxAt(ob.getGeometryIdAt(i), box.clone()); if (bb) markBox(bb, m4); } catch (e) { /* a freed slot */ } }
        } else if (ob.isInstancedMesh) {
          if (!g.boundingBox) g.computeBoundingBox();
          for (let i = 0; i < ob.count; i++) { ob.getMatrixAt(i, m4); m4.premultiply(ob.matrixWorld); markBox(g.boundingBox, m4); }
        } else {
          // a plain mesh: by its box when small, triangle by triangle when it's a big merged chunk (a region's props)
          if (!g.boundingBox) g.computeBoundingBox();
          box.copy(g.boundingBox).applyMatrix4(ob.matrixWorld);
          if (box.max.x - box.min.x < 6 && box.max.z - box.min.z < 6) markBox(g.boundingBox, ob.matrixWorld, 0.9);
          else {
            const P = g.attributes.position, I = g.index, n = I ? I.count : P.count, M = ob.matrixWorld;
            for (let t = 0; t + 2 < n; t += 3) {
              a.fromBufferAttribute(P, I ? I.getX(t) : t).applyMatrix4(M); b.fromBufferAttribute(P, I ? I.getX(t + 1) : t + 1).applyMatrix4(M); c.fromBufferAttribute(P, I ? I.getX(t + 2) : t + 2).applyMatrix4(M);
              mark(Math.min(a.x, b.x, c.x), Math.min(a.z, b.z, c.z), Math.max(a.x, b.x, c.x), Math.max(a.z, b.z, c.z), Math.min(a.y, b.y, c.y), Math.max(a.y, b.y, c.y));
            }
          }
        }
      }
      for (const ch of ob.children) walk(ch);
    };
    for (const ch of world.scene.children) walk(ch);
    return (this.occ = { world, X0, N, CS, lo, hi, seen: new Map() });
  }
  screenWhy(x, z, hs = NODE_HS) {
    const world = this.G.world, O = this.occluders(world), out = [], k = Math.tan(this.G.engine?.rig?.pitch ?? 0.62), y0 = world.heightAt(x, z);
    for (const yaw of [Math.PI / 4, -Math.PI / 4]) for (const h of hs) for (let t = 0.6; t < 26; t += 0.25) {
      const px = x + Math.sin(yaw) * t, pz = z + Math.cos(yaw) * t, py = y0 + h + k * t;
      if (world.heightAt(px, pz) > py + 0.05) { out.push({ yaw: +yaw.toFixed(2), h, t, by: 'ground' }); break; }
      const i = Math.floor((px - O.X0) / O.CS), j = Math.floor((pz - O.X0) / O.CS), c = j * O.N + i;
      if (py >= O.lo[c] && py <= O.hi[c]) { out.push({ yaw: +yaw.toFixed(2), h, t, by: 'scenery', lo: +O.lo[c].toFixed(1), hi: +O.hi[c].toFixed(1) }); break; }
    }
    this.occ = null;
    return out;
  }
  /** is (x, z) hidden from the game camera from either 45° yaw: a ray from each of `hs` heights up the camera's line
   *  meets the ground (a hill, a cliff) or a column of scenery (a canopy, a clump, a roof) */
  screened(world, x, z, hs = NODE_HS, yaws = VIEW_YAWS) {
    const O = this.occluders(world), key = `${x.toFixed(2)},${z.toFixed(2)},${hs.join()},${yaws.length}`;
    if (O.seen.has(key)) return O.seen.get(key);
    const pitch = this.G.engine?.rig?.pitch ?? 0.62, k = Math.tan(pitch), y0 = world.heightAt(x, z);
    let hid = false;
    for (const yaw of yaws) {
      const dx = Math.sin(yaw), dz = Math.cos(yaw);
      for (const h of hs) {
        for (let t = 0.6; t < 26 && !hid; t += 0.25) {
          const px = x + dx * t, pz = z + dz * t, py = y0 + h + k * t;
          if (world.heightAt(px, pz) > py + 0.05) { hid = true; break; }
          const i = Math.floor((px - O.X0) / O.CS), j = Math.floor((pz - O.X0) / O.CS);
          if (i < 0 || j < 0 || i >= O.N || j >= O.N) break;
          const c = j * O.N + i; if (py >= O.lo[c] && py <= O.hi[c]) hid = true;
        }
        if (hid) break;
      }
      if (hid) break;
    }
    O.seen.set(key, hid);
    return hid;
  }
  groundY(world, x, z) {
    let lo = 1e9, sum = 0;
    for (const [dx, dz] of [[0, 0], [0.35, 0], [-0.35, 0], [0, 0.35], [0, -0.35]]) { const h = world.heightAt(x + dx, z + dz); lo = Math.min(lo, h); sum += h; }
    return Math.min(sum / 5, lo + 0.04);
  }
  /** a zone: fixed slots from its plan, kinds by slot index, filtered by what's free this visit */
  zoneSites(world, area) {
    const P = world.plan || world.L?.plan, def = AREA_DEFS[area]; if (!P) return { nodes: [], digs: [] };
    const seq = kindSeq(def.nodes), slots = zoneSlots(P, area), want = seq.length, nodes = [], digs = [];
    const wild = this.wildDiscs(world);
    // the free slots in a fixed shuffled order: spread out first (6 m apart), then closer (3.2 m) until the area is full;
    // the kinds go to the chosen slots in slot order (wood, stone, specialty, forage, wood…)
    const free = slots.map((sl, i) => ({ ...sl, i })).filter(sl => this.slotOk(world, P, sl.x, sl.z, wild, []));
    const order = [...shuffled(free.filter(sl => !sl.fallback), `pick:${area}`), ...shuffled(free.filter(sl => sl.fallback), `pickf:${area}`)], pick = [];
    // a slot under a canopy (or behind a roof, a clump, a cliff) slides to the nearest spot round it the camera sees.
    // The game's camera turns only in build mode (the village), so a zone must be clear from the game yaw (45°); spots
    // clear from both 45° yaws are taken first, the game yaw alone fills the rest
    const seen = (x, z, hs, taken, kind, gap, yaws) => { for (const [dx, dz] of ZONE_NUDGES) { const px = x + dx, pz = z + dz; if ((dx || dz) && !this.slotOk(world, P, px, pz, wild, taken, kind, gap)) continue; if (!this.screened(world, px, pz, hs, yaws)) return { x: px, z: pz }; } return null; };
    const at = new Map();
    for (const [ti, yaws] of [VIEW_YAWS, GAME_YAW].entries()) for (const gap of [6, 3.4, 2.6]) for (const sl of order) {
      if (pick.length >= want) break;
      if (at.has(sl.i) || pick.some(n => n.i === sl.i)) continue;
      const key = `${ti}`, S = sl.seen ||= {};
      if (!(key in S)) S[key] = seen(sl.x, sl.z, NODE_HS, [], null, 0, yaws);
      const p = S[key]; if (!p || pick.some(n => Math.hypot(n.x - p.x, n.z - p.z) < gap)) continue;
      pick.push({ ...sl, x: p.x, z: p.z, both: ti === 0 }); at.set(sl.i, true);
    }
    pick.sort((a, b) => a.i - b.i).forEach((sl, k) => nodes.push({ id: `${area}:${sl.i}`, i: sl.i, kind: seq[k], x: sl.x, z: sl.z, rot: sl.rot, s: 1, y: this.groundY(world, sl.x, sl.z) }));
    for (const yaws of [VIEW_YAWS, GAME_YAW]) for (const d of digSlots(P, area)) { if (digs.length >= (yaws === VIEW_YAWS ? 14 : 6)) break; if (!this.slotOk(world, P, d.x, d.z, wild, [...nodes, ...digs], { dig: true }, 3.5)) continue; const p = seen(d.x, d.z, DIG_HS, [...nodes, ...digs], { dig: true }, 3.5, yaws); if (p) digs.push(p); }
    return { nodes, digs };
  }
  /** the zone's wild areas (phase B: cozy/peaceful.js wildAreas over the plan; the plan's `wild` discs as a fallback) */
  wildDiscs(world) {
    const P = world.plan || world.L?.plan, out = wildAreas(P).map(a => ({ x: a.x, z: a.z, r: a.r }));
    for (const d of P?.discs || []) if (d.kind === 'wild' && !out.some(a => Math.hypot(a.x - d.x, a.z - d.z) < 1)) out.push({ x: d.x, z: d.z, r: d.r });
    return out;
  }
  slotOk(world, P, x, z, wild, taken, kind, gap = 3.2) {
    if (!(x > 3 && z > 3 && x < 109 && z < 109)) return false;
    if (!world.walkable(x, z) || (world.waterAt?.(x, z) || 0) > 0.03) return false;
    if (world.terrain?.slopeAt && world.terrain.slopeAt(x, z) > 0.32) return false;
    if (world.pathDist && world.pathDist(x, z) < (P.trailW || 1.5) + 0.9) return false;
    if (Math.hypot(x - P.arena.x, z - P.arena.z) < P.arena.r + 2.5) return false;
    if (Math.hypot(x - P.start.x, z - P.start.z) < 3) return false;
    if (P.village && Math.hypot(x - P.village.x, z - P.village.z) < P.village.r + (P.village.clear || 0) + 2) return false;
    for (const d of wild) if (Math.hypot(x - d.x, z - d.z) < d.r + 2.5) return false;
    const zone = world.def?.id;
    if (this.wildFn && zone && this.wildFn(zone, x, z)) return false;
    const dig = !!kind?.dig; // (a dig spot is low and hidden until found: a lighter check)
    if (world.isFree && !world.isFree(x, z, dig ? 0.3 : 0.55, { clearings: true, path: (P.trailW || 1.5) + (dig ? 0.6 : 0.8) })) return false;
    if (world.collision?.solidAt(x, z, dig ? 0.55 : 0.7)) return false;
    // nothing tall right in front of it on the camera's side (a trunk would hide a little prop): the camera looks from +x +z
    if (!dig && (world.collision?.solidAt(x + 1.3, z + 1.3, 0.55) || world.collision?.solidAt(x + 2.4, z + 2.4, 0.7))) return false;
    for (const n of taken) if (Math.hypot(n.x - x, n.z - z) < gap) return false;
    return true;
  }

  // ------------------------------------------------------------------ the mesh
  buildMesh(v) {
    const W = v.world, def = AREA_DEFS[v.area];
    const kinds = [...new Set(v.nodes.map(n => NODE_KINDS[n.kind].model))];
    const geos = []; const add = g => { geos.push(g); return geos.length - 1; };
    const gi = {};
    for (const k of kinds) { const g = nodeGeos(k); gi[k] = { full: add(g.full), taken: add(g.taken) }; }
    const dg = digGeos(def.ground); gi.dig = { mound: add(dg.mound), dug: add(dg.dug) };
    const { bm, ids } = scavBatch(geos, v.nodes.length + 4);
    bm.name = `scavenge:${v.area}`;
    v.gid = {}; for (const [k, o] of Object.entries(gi)) { v.gid[k] = {}; for (const [kk, i] of Object.entries(o)) v.gid[k][kk] = ids[i]; }
    for (const n of v.nodes) { n.inst = bm.addInstance(v.gid[NODE_KINDS[n.kind].model].full); bm.setMatrixAt(n.inst, this.mat(n.x, n.y, n.z, n.rot, n.s)); }
    v.spotInst = []; for (let i = 0; i < 4; i++) { const id = bm.addInstance(v.gid.dig.mound); bm.setVisibleAt(id, false); bm.setMatrixAt(id, this.mat(0, -50, 0, 0, 1)); v.spotInst.push(id); }
    bm.computeBoundingBox(); bm.computeBoundingSphere();
    W.scene.add(bm); v.mesh = bm;
    // the sparkle: one soft glint over each full node (gold over a quest spot), a single Points draw
    const N = v.nodes.length + 4, pos = new Float32Array(N * 3), ph = new Float32Array(N), on = new Float32Array(N), gold = new Float32Array(N);
    v.nodes.forEach((n, i) => { pos.set([n.x, n.y + 0.55, n.z], i * 3); ph[i] = (i * 2.399) % TAU; });
    for (let i = 0; i < 4; i++) ph[v.nodes.length + i] = i * 1.7;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1)); g.setAttribute('aOn', new THREE.BufferAttribute(on, 1)); g.setAttribute('aGold', new THREE.BufferAttribute(gold, 1));
    const pts = new THREE.Points(g, sparkMaterial()); pts.frustumCulled = false; pts.renderOrder = 6; pts.name = `scavenge:sparkle:${v.area}`;
    W.scene.add(pts); v.spark = pts;
    // the "you can take this" cue, the same under every full node and found dig spot: a soft cream ring on the ground
    // that breathes slowly (one instanced draw, alpha ≤ 0.5, normal blending: it never brightens the scene)
    const ring = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), ringMaterial(), N);
    ring.geometry.setAttribute('aOn', new THREE.InstancedBufferAttribute(new Float32Array(N), 1));
    ring.geometry.setAttribute('aPh', new THREE.InstancedBufferAttribute(ph.slice(), 1));
    ring.frustumCulled = false; ring.renderOrder = 3; ring.name = `scavenge:ring:${v.area}`;
    v.nodes.forEach((n, i) => ring.setMatrixAt(i, this.mat(n.x, n.y + 0.04, n.z, 0, RING_R[NODE_KINDS[n.kind].model] || 1.7)));
    for (let k = 0; k < 4; k++) ring.setMatrixAt(v.nodes.length + k, this.mat(0, -50, 0, 0, 1.5));
    ring.instanceMatrix.needsUpdate = true;
    W.scene.add(ring); v.ring = ring;
  }
  mat(x, y, z, rot, s) { _q.setFromAxisAngle(_up, rot || 0); _s.setScalar(s || 1); return _m.compose(_p.set(x, y, z), _q, _s); }
  setSpark(v, i, on, gold = 0, at = null) {
    const g = v.spark?.geometry; if (!g) return;
    g.attributes.aOn.array[i] = on; g.attributes.aGold.array[i] = gold; g.attributes.aOn.needsUpdate = true; g.attributes.aGold.needsUpdate = true;
    if (at) { g.attributes.position.array.set([at.x, at.y, at.z], i * 3); g.attributes.position.needsUpdate = true; }
    const R = v.ring; if (!R) return;
    const a = R.geometry.attributes.aOn; a.array[i] = on; a.needsUpdate = true;
    if (at) { R.setMatrixAt(i, this.mat(at.x, at.y - 0.41, at.z, 0, 1.5)); R.instanceMatrix.needsUpdate = true; }
  }

  // ------------------------------------------------------------------ the day: nodes back, dig spots moved
  checkDay() {
    const d = scavDay(this.st);
    if (d === this.day) return false;
    this.day = d;
    this.awayRefills(staleAreas(this.st, d)); // (a hidden tab's time away: the card says what came back)
    for (const v of this.views.values()) this.refresh(v);
    Events.emit('scavenge:refill', { day: d });
    return true;
  }
  /** the "While you were away…" card's lines for the areas a crossed world day refilled (COZY §4.4.1) */
  awayRefills(areas) {
    const A = this.G.cozy?.awayNow?.(); if (!A || A.shown || !areas?.length) return;
    const LINES = { home: 'The driftwood has washed back up, and the sakura petals have drifted in again.', bamboo: 'Fresh culms have fallen in the Bamboo Grove, and the silk-moths have spun again.', maple: 'New leaves and branches are down in Momiji Hollow.', tidepool: 'The tide brought new sea glass and driftwood to the point.', onsen: 'Fresh snow, fresh ice crystals by the springs.' };
    A.refills = [...new Set([...(A.refills || []), ...areas.map(a => LINES[a]).filter(Boolean)])];
  }
  /** draw a view from the state: taken nodes, today's spots (hidden / found / dug) */
  refresh(v) {
    const st = this.st, day = scavDay(st), rec = areaRec(st, v.area, day), bm = v.mesh;
    v.day = day;
    v.nodes.forEach((n, i) => {
      n.taken = rec.taken.includes(n.id);
      const K = NODE_KINDS[n.kind];
      if (bm) bm.setGeometryIdAt(n.inst, v.gid[K.model][n.taken ? 'taken' : 'full']);
      n.it.pos.copy(n.taken ? PARK : _v.set(n.x, n.y, n.z));
      this.setSpark(v, i, n.taken ? 0 : 1);
    });
    // today's dig spots
    const S = scavState(st), n = Math.min(4, spotCount(v.area, day, { bandana: S.tools.bandana })), picks = v.cands.length ? pickSpots(v.area, day, v.cands, n) : [];
    const qf = questFind(st, v.area, ZONE_QUESTS, QUEST_ITEMS, day);
    v.spots = picks.map((ci, k) => {
      const c = v.cands[ci], id = spotId(v.area, day, ci);
      return { id, k, x: c.x, z: c.z, y: this.groundY(v.world, c.x, c.z), rot: (ci * 1.7) % TAU, state: rec.dug.includes(id) ? 'dug' : rec.found.includes(id) ? 'found' : 'hidden', quest: k === 0 && qf ? qf : null };
    });
    for (let k = 0; k < 4; k++) this.drawSpot(v, k);
  }
  drawSpot(v, k) {
    const s = v.spots[k], bm = v.mesh, id = v.spotInst?.[k], it = v.pool[k];
    const si = v.nodes.length + k;
    if (!s) { if (bm && id != null) bm.setVisibleAt(id, false); it.pos.copy(PARK); it.spot = null; this.setSpark(v, si, 0); return; }
    if (bm && id != null) {
      bm.setGeometryIdAt(id, v.gid.dig[s.state === 'dug' ? 'dug' : 'mound']);
      bm.setMatrixAt(id, this.mat(s.x, s.y, s.z, s.rot, 1));
      bm.setVisibleAt(id, s.state !== 'hidden' || this.showAll > 0);
    }
    it.spot = s;
    it.label = s.quest ? `Dig with Shadow: ${s.quest.name}?` : 'Dig with Shadow';
    it.pos.copy(s.state === 'found' || (this.showAll > 0 && s.state === 'hidden') ? _v.set(s.x, s.y, s.z) : PARK);
    this.setSpark(v, si, s.state === 'found' ? 1 : 0, s.quest ? 1 : 0, { x: s.x, y: s.y + 0.45, z: s.z });
  }
  refillAll(force = false) {
    const S = scavState(this.st);
    if (force) for (const a of SCAV_AREAS) delete S[a];
    for (const v of this.views.values()) this.refresh(v);
    Events.emit('scavenge:refill', { day: scavDay(this.st), debug: force });
  }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    const G = this.G;
    if (G.titleActive) return;
    this.checkDay();
    if (this.showAll > 0 && (this.showAll -= dt) <= 0) { this.showAll = 0; const v = this.view(); if (v) for (let k = 0; k < 4; k++) this.drawSpot(v, k); }
    const v = this.view();
    if (this.s) this.digTick(dt);
    else if (v) this.noseTick(v, dt);
  }

  // ------------------------------------------------------------------ Shadow's nose
  noseTick(v, dt) {
    const G = this.G, P = G.player, D = G.companion;
    if ((this.noseT -= dt) > 0 || !P || !D) return;
    this.noseT = 0.4;
    if (D.nose || G.playerDead || G.ui?.dlg?.active || P.controlLocked) return;
    if ((P.sprint?.k || 0) > 0.2) return; // (not while the hero sprints past: he'd fall far behind; s21's pacing check)
    const range = scavState(this.st).tools.bandana ? NOSE_RANGE_BANDANA : NOSE_RANGE;
    let best = null, bd = range;
    for (const s of v.spots) { if (s.state !== 'hidden') continue; const d = Math.hypot(s.x - P.pos.x, s.z - P.pos.z); if (d < bd) { bd = d; best = s; } }
    if (!best) return;
    if (G.mode === 'dungeon' && G.combat?.nearest?.(P.pos, 'ally', 9, e => !e.breakable)) return; // (not mid-fight)
    const s = best;
    const ok = D.noseTo?.(s.x, s.z, { onArrive: () => this.found(v, s), onGiveUp: () => this.found(v, s) });
    if (!ok) this.found(v, s); // (Shadow can't go: flying as the whelp, fainted… the spot shows itself)
  }
  found(v, s) {
    if (s.state !== 'hidden' || this.view() !== v) return;
    if (!findSpot(this.st, v.area, s.id)) return;
    s.state = 'found';
    this.drawSpot(v, s.k);
    const p = new THREE.Vector3(s.x, s.y + 0.3, s.z);
    this.G.vfx?.sparkle?.(p, { n: 12, color: s.quest ? '#ffe070' : '#fff2c0', r: 0.35, rise: 0.8, size: 0.24 });
    this.G.vfx?.dust?.(p, { n: 4, color: '#c8a880', size: 0.22 });
    Events.emit('sfx', 'bark_small', { pos: p });
    Events.emit('scavenge:found', { area: v.area, spot: s.id, quest: !!s.quest });
    if (!this.st.flags?.hints?.scavDig) this.G.hint?.('scavDig', `*Sniff sniff!* Something's buried here! ${scavState(this.st) && this.digMode() ? 'Press {interact} to dig!' : 'Hold {interact} to dig, and let go in the gold!'}`);
  }
  digMode() { return this.G.ui?.settings?.digMode === 1 ? 1 : 0; } // 0 hold · 1 tap (Settings › Dig)

  // ------------------------------------------------------------------ gather
  gatherStart(v, n) {
    const G = this.G, T = G.life?.tools;
    if (this.s || n.taken || !T || T.busy || G.player.controlLocked) return;
    if (Math.hypot(n.x - G.player.pos.x, n.z - G.player.pos.z) > 2.2) return;
    T.run({ prop: null, pose: 'pickup', dur: GATHER_SECS, at: 0.32, anywhere: true, face: { x: n.x, z: n.z }, onAct: () => this.collect(v, n) });
  }
  gatherNow(id) { const v = this.view(), n = v?.nodes.find(x => x.id === id); if (!n || n.taken) return null; return this.collect(v, n); }
  collect(v, n) {
    const G = this.G, st = this.st, A = G.actions;
    if (n.taken || !takeNode(st, v.area, n.id)) return null;
    const y = gatherYield(n.kind, Math.random, { basket: scavState(st).tools.basket });
    for (const [k, c] of Object.entries(y.mats)) A.addMaterial(k, c);
    for (const [k, c] of Object.entries(y.pantry)) A.addPantry(k, c, { src: 'forage' });
    if (y.coins) A.addCoins(y.coins);
    n.taken = true;
    v.mesh?.setGeometryIdAt(n.inst, v.gid[NODE_KINDS[n.kind].model].taken);
    n.it.pos.copy(PARK);
    this.setSpark(v, v.nodes.indexOf(n), 0);
    const p = new THREE.Vector3(n.x, n.y + 0.35, n.z);
    G.vfx?.sparkle?.(p, { n: 7, color: '#fff2c0', r: 0.3, rise: 0.9, size: 0.22 });
    G.vfx?.dust?.(p, { n: 3, color: '#e8d8c0', size: 0.2 });
    Events.emit('sfx', Object.keys(y.pantry).length ? 'pickup_magic' : 'pickup_item');
    this.floatGain(y);
    for (const [k, c] of Object.entries(y.pantry)) G.ui?.pantryGain?.(k, c, { worldPos: p, quiet: true });
    Events.emit('scavenge:gather', { node: n.id, area: v.area, kind: n.kind, mats: y.mats, pantry: y.pantry, coins: y.coins });
    return y;
  }
  floatGain(y, extra = '') {
    const G = this.G, P = G.player; if (!P) return;
    const parts = Object.entries(y.mats || {}).map(([k, c]) => `<span style="color:${MAT_COL[k] || '#fff'}">+${c}</span>${glyph(k)}`);
    if (y.coins) parts.push(`<span style="color:#ffd84a">+${y.coins}</span>${glyph('coin')}`);
    if (extra) parts.push(extra);
    if (parts.length) G.ui?.float?.(P.pos.clone().setY(P.pos.y + 1.5), '+', { kind: 'pickup', html: parts.join('<i style="width:6px"></i>') });
  }

  // ------------------------------------------------------------------ dig
  /** press at a found spot: the dig starts (hold mode follows the button; tap mode, or a press already let go, digs by itself) */
  digStart(v, s) {
    const G = this.G, P = G.player;
    const T = G.life?.tools; if (T?.busy && T.cur?.acted) T.end(true); // (a gather's pickup already landed: the dig may cut its last beat short)
    if (!s || s.state !== 'found' || this.s || T?.busy || P.controlLocked || G.playerDead) return;
    if (Math.hypot(s.x - P.pos.x, s.z - P.pos.z) > 2.2) return;
    const held = this.held(), hold = this.digMode() === 0;
    // staging: the hero kneels on the spot's left as the camera sees it and Shadow on its right, so the mound, the paws
    // and both faces are in view (never the hero's back over the hole)
    const R = this.camRight(), side = (P.pos.x - s.x) * R.x + (P.pos.z - s.z) * R.z > 0.25 ? 1 : -1;
    const stand = { x: s.x + R.x * side * 0.74, z: s.z + R.z * side * 0.74 };
    if (!G.world.walkable(stand.x, stand.z) || G.world.collision?.solidAt(stand.x, stand.z, 0.25)) { stand.x = P.pos.x; stand.z = P.pos.z; }
    this.s = { v, spot: s, t: 0, k: 0, hold, held, auto: !hold || !held, life0: G.actions.life?.() ?? 0, world: G.world, from: { x: P.pos.x, z: P.pos.z }, stand };
    P.moveTarget = null; P.interactTarget = null; P.controlLocked = true;
    P.faceTo(s.x, s.z); P.facing = P.faceTarget;
    P.anim.play('scavDig');
    G.companion?.digWith?.(s.x, s.z, { x: s.x - R.x * side, z: s.z - R.z * side }, { x: s.x - R.x * side * 0.8, z: s.z - R.z * side * 0.8 });
    this.ring?.start({ hold: hold && held });
    G.ui?.toasts?.retire?.(0); // (Shadow's tip steps aside: on a phone it would cover the ring)
    Events.emit('sfx', 'ui_click');
  }
  held() { return Actions.held('interact') || Actions.held('attack') || Actions.held('reel'); }
  /** the camera's screen-right on the ground (unit x, z) */
  camRight() { const c = this.G.engine?.camera; if (!c) return { x: 1, z: 0 }; c.updateMatrixWorld(); _v.setFromMatrixColumn(c.matrixWorld, 0); _v.y = 0; if (_v.lengthSq() < 1e-6) return { x: 1, z: 0 }; _v.normalize(); return { x: _v.x, z: _v.z }; }
  digTick(dt) {
    const G = this.G, s = this.s, P = G.player;
    if (G.world !== s.world || G.ui?.iris?.active || G.leavingDungeon || G.playerDead) return this.endDig(true);
    if ((G.actions.life?.() ?? 0) < s.life0 - 0.5) { G.ui?.toast?.('Ouch! The digging can wait.', { color: '#ffd8a8' }); return this.endDig(true); }
    if (MOVE.some(k => Input.hit(k)) || Actions.moveHit() || Actions.pressed('roll', 'pad') || Actions.pressed('menu', 'pad')) return this.endDig(true);
    if (dt <= 0) { this.drawRing(); return; } // (paused)
    s.t += dt * this.ringSpeed;
    if (s.stand && s.t < 0.3) { const k = Math.min(1, s.t / 0.22); P.setPos(s.from.x + (s.stand.x - s.from.x) * k, s.from.z + (s.stand.z - s.from.z) * k); P.faceTo(s.spot.x, s.spot.z); P.facing = P.faceTarget; } // (a little shuffle onto the spot's side)
    if (s.auto) {
      // a tap (or tap mode): the ring fills by itself to a good dig; a press caught again early becomes a held dig
      s.k = Math.min(1, s.t / (DIG_SECS * 0.75));
      if (s.k >= 1) return this.finishDig('normal');
    } else {
      s.k = Math.min(1, s.t / DIG_SECS);
      if (!this.held()) return this.finishDig(s.t < 0.12 ? 'normal' : digResult(s.k)); // (a quick tap is a normal dig, not a band check)
      if (s.k >= 1) return this.finishDig('normal');
    }
    if (P.anim.action?.name !== 'scavDig') P.anim.play('scavDig');
    this.drawRing();
    if ((s.dirtT = (s.dirtT || 0) - dt) <= 0) { s.dirtT = 0.16; this.dirt(s.spot, 3); }
    if ((s.sfxT = (s.sfxT || 0) - dt) <= 0) { s.sfxT = 0.5; Events.emit('sfx', 'dig', { vol: 0.5 }); }
  }
  drawRing() {
    const s = this.s, G = this.G; if (!s || !this.ring) return;
    const P = G.player; _v.set(P.pos.x, P.pos.y + (P.rig?.height || 1.2) + 0.5, P.pos.z).project(G.engine.camera);
    this.ring.draw(s.k, (_v.x * 0.5 + 0.5) * innerWidth, (-_v.y * 0.5 + 0.5) * innerHeight);
  }
  dirt(s, n = 4) {
    const D = this.G.vfx?.dot, col = AREA_DEFS[this.s?.v.area || 'home'].ground === 'snow' ? '#f4f8ff' : AREA_DEFS[this.s?.v.area || 'home'].ground === 'sand' ? '#e8d4a0' : '#8a6040';
    if (!D) return;
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU; D.spawn({ x: s.x + Math.cos(a) * 0.15, y: s.y + 0.12, z: s.z + Math.sin(a) * 0.15, vx: Math.cos(a) * (0.8 + Math.random()), vz: Math.sin(a) * (0.8 + Math.random()), vy: 1.6 + Math.random() * 1.4, grav: 9, life: 0.5, size: 0.07 + Math.random() * 0.05, color: col, alpha: 1, alpha1: 0.6 }); }
  }
  finishDig(result) {
    const s = this.s; if (!s) return;
    const G = this.G, st = this.st, A = G.actions, v = s.v, sp = s.spot;
    const perfect = result === 'perfect' || cheatPerfect(st);
    const y = digYield(v.area, Math.random, { perfect });
    const sk = digSpot(st, v.area, sp.id, perfect);
    sp.state = 'dug';
    for (const [k, c] of Object.entries(y.mats)) A.addMaterial(k, c);
    if (y.coins) A.addCoins(y.coins);
    let furniture = null, quest = null;
    if (y.find) { furniture = pickFind(v.area === 'home' ? 'burrow' : v.area, G.sim?.stats?.rank || 1, Math.random); A.addFurniture?.(furniture, 1, { src: 'dig' }); G.furnitureGain?.(furniture, 1, { worldPos: new THREE.Vector3(sp.x, sp.y + 0.6, sp.z) }); Events.emit('furniture:found', { id: furniture, dig: true }); }
    if (sp.quest) {
      quest = sp.quest; markQuestDig(st, v.area);
      const step = quest.step;
      G.ui?.toast?.(`Found: ${quest.name}!`, { icon: 'quest', color: '#ffe070', sub: 'Shadow dug it up' });
      Events.emit('quest:find', { item: quest.item, n: 1, zone: v.area, dungeon: step.dungeon || null, floor: step.floor ?? null, tier: 0, dig: true });
    }
    this.drawSpot(v, sp.k);
    const p = new THREE.Vector3(sp.x, sp.y + 0.3, sp.z);
    this.dirt(sp, 10);
    G.vfx?.sparkle?.(p, { n: perfect ? 22 : 9, color: perfect ? '#ffd84a' : '#fff2c0', r: perfect ? 0.6 : 0.35, rise: 1.3, size: perfect ? 0.3 : 0.24 });
    if (perfect) { G.vfx?.ring?.(p.clone().setY(sp.y + 0.05), { color: '#ffd84a', r0: 0.25, r1: 1.4, life: 0.5 }); Actions.rumble(0.35, 0.6, 140); G.ui?.touch?.buzz?.(30); }
    Events.emit('sfx', perfect ? 'dig_perfect' : 'pickup_item');
    this.floatGain(y);
    this.ring?.finish(perfect ? 'perfect' : 'normal', sk.streak);
    const D = G.companion; D?.digDone?.(perfect);
    // the hero comes up out of the dig with a little hop
    this.endDig(false);
    if (perfect) G.player.anim.play('happy'); else G.player.anim.play('pickup');
    Events.emit('scavenge:dig', { area: v.area, spot: sp.id, perfect, streak: sk.streak, mats: y.mats, coins: y.coins, find: furniture, quest: quest?.item || null, lines: y.lines });
    return { perfect, ...y, furniture, quest };
  }
  endDig(cancel) {
    const s = this.s; if (!s) return;
    this.s = null;
    const G = this.G, P = G.player;
    if (P.anim.action?.name === 'scavDig') P.anim.stop('scavDig');
    P.controlLocked = false; G.interactCooldown = performance.now() + 350; Actions.consume('interact'); Actions.consume('attack');
    if (cancel) { this.ring?.finish('cancel'); G.companion?.digDone?.(null); }
  }
  /** QA / debug: dig a spot now (o.k: the ring's fill when let go; o.result) */
  digNow(id, o = {}) {
    const v = this.view(), s = v?.spots.find(x => x.id === id) || (id == null ? v?.spots.find(x => x.state !== 'dug') : null);
    if (!s || s.state === 'dug') return null;
    if (s.state === 'hidden') this.found(v, s);
    this.s = { v, spot: s, t: 0, k: o.k ?? 1, hold: true, held: false, auto: false, life0: 0, world: this.G.world };
    return this.finishDig(o.result || (o.k != null ? digResult(o.k) : 'normal'));
  }
  revealAll() {
    const v = this.view(); if (!v) return 0;
    let n = 0; for (const s of v.spots) if (s.state === 'hidden') { this.found(v, s); n++; }
    return n;
  }

  // ------------------------------------------------------------------ the minimap (phase B's minimap draws these when it asks)
  /** [{ x, z, kind: 'node' | 'paw' | 'quest' }] in the current world: the found spots (a paw dot), and every full node
   *  while the debug "show all" is on */
  mapMarks() {
    const v = this.view(); if (!v) return [];
    const out = v.spots.filter(s => s.state === 'found').map(s => ({ x: s.x, z: s.z, kind: s.quest ? 'quest' : 'paw' }));
    if (this.showAll > 0) for (const n of v.nodes) if (!n.taken) out.push({ x: n.x, z: n.z, kind: 'node' });
    return out;
  }

  // ------------------------------------------------------------------ the Cozy debug section (docs/DEBUG.md)
  registerDebug() {
    const self = this, st = () => this.G.state;
    registerDebug('cozy', [
      { group: 'Scavenging', label: 'Refill every node', hint: 'Every area: the nodes back, the dig spots hidden again', run: () => { self.refillAll(true); return 'Every node refilled'; } },
      { label: 'Show every node', hint: 'Reveals today\'s dig spots here, and marks every node on the minimap for a minute', run: () => { const v = self.view(); if (!v) return 'Nothing to scavenge here'; self.showAll = 60; const n = self.revealAll(); return `${v.nodes.filter(x => !x.taken).length} nodes and ${v.spots.length} dig spots (${n} revealed) in ${AREA_DEFS[v.area].name}`; } },
      { label: 'A perfect-dig streak', hint: 'The next digs are perfect', choices: [{ label: '5 digs', value: 5 }, { label: '20 digs', value: 20 }], run: (G, n) => { scavState(st()).cheat.perfect = n; return `The next ${n} digs are perfect`; } },
      { label: 'Walk to the nearest node', closes: true, run: G => { const v = self.view(); if (!v) return 'Nothing to scavenge here'; const P = G.player, l = [...v.nodes.filter(n => !n.taken), ...v.spots.filter(s => s.state !== 'dug')].sort((a, b) => Math.hypot(a.x - P.pos.x, a.z - P.pos.z) - Math.hypot(b.x - P.pos.x, b.z - P.pos.z))[0]; if (!l) return 'All gathered today'; P.setPos(l.x + 1, l.z + 1); G.companion?.setPos?.(l.x + 1.6, l.z + 1.8); return `Next to ${l.kind ? NODE_KINDS[l.kind].name : 'a dig spot'}`; } },
      { label: "The Guild's tools", hint: "The Forager's Basket (+1 a gather) and Shadow's Bandana (18 m nose, one more spot a day)", toggle: true, get: () => !!scavState(st()).tools.basket, run: (G, on) => { const T = scavState(st()).tools; T.basket = T.bandana = !!on; self.refillAll(false); return on ? 'Basket and Bandana on' : 'Basket and Bandana off'; } },
    ], { title: 'Cozy', icon: 'leaf', order: 90 });
  }
}

// ------------------------------------------------------------------ zone slots (deterministic per plan)
/** the kinds in an interleaved order (wood, stone, specialty, forage, wood…), so any prefix of the slots mixes them */
function kindSeq(counts) {
  const lists = Object.entries(counts).map(([k, n]) => Array(n).fill(k)), out = [];
  for (let i = 0; lists.some(l => l.length); i++) for (const l of lists) if (l.length) out.push(l.pop());
  return out;
}
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
/** the node slots of a zone plan, in a fixed order: glade rims (the camp sites), the trail's edges, the POIs, the arrival */
export function zoneSlots(P, area) {
  const r = mulberry32(hashStr(`slots:${area}`)), out = [];
  const ring = (c, R, n, a0) => Array.from({ length: n }, (_, k) => { const a = a0 + k / n * TAU; return { x: c.x + Math.cos(a) * R, z: c.z + Math.sin(a) * R, rot: r() * TAU }; });
  // the glades (the camp sites, kept or spare): two rings round each rim
  for (const c of P.camps || []) { const R = c.r || 6; out.push(...ring(c, Math.max(2.4, R - 1.8), 6, r() * TAU), ...ring(c, R + 1.6, 6, r() * TAU)); }
  // the trail's edges: every 5 m, both sides, near and a little further out
  const tr = P.trail || []; let acc = 0;
  for (let i = 1; i < tr.length; i++) {
    const [x0, z0] = tr[i - 1], [x1, z1] = tr[i]; acc += Math.hypot(x1 - x0, z1 - z0);
    if (acc < 5) continue; acc = 0;
    const tx = x1 - x0, tz = z1 - z0, l = Math.hypot(tx, tz) || 1;
    for (const side of [1, -1]) for (const off of [3.0, 5.2, 7.6]) { const o = (P.trailW || 1.5) + off + r() * 0.8; out.push({ x: x1 - tz / l * side * o, z: z1 + tx / l * side * o, rot: r() * TAU }); }
  }
  // the POIs, the spurs' ends, the open discs, the arrival
  for (const p of P.pois || []) out.push(...ring(p, (p.r || 4.5) + 1.6, 4, r() * TAU));
  for (const o of P.open || []) out.push(...ring(o, Math.max(2, (o.r || 4) * 0.6), 4, r() * TAU));
  out.push(...ring(P.start, (P.start.r || 7) + 1.5, 5, r() * TAU));
  // the fallback: a 3.5 m lattice over the map near the trail (a zone so wooded that few of the slots above are open to
  // the camera from both yaws still fills: zoneSites takes these only once the shaped slots run out)
  for (let z = 6; z < 106; z += 3.5) for (let x = 6; x < 106; x += 3.5) { const px = x + (r() - 0.5) * 1.5, pz = z + (r() - 0.5) * 1.5; if (polyD(tr, px, pz) < 16) out.push({ x: px, z: pz, rot: r() * TAU, fallback: true }); }
  return out;
}
const polyD = (pts, x, z) => { let b = 1e9; for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], vx = bx - ax, vz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1))); b = Math.min(b, Math.hypot(x - ax - vx * t, z - az - vz * t)); } return b; };
/** a fixed shuffle (seeded by a key) */
function shuffled(list, key) {
  const r = mulberry32(hashStr(key)), a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
/** where a zone's dig spots can be: off the trail (4–6 m), at the glades' centres' edges and the POIs, every ~11 m */
function digSlots(P, area) {
  const r = mulberry32(hashStr(`digs:${area}`)), out = [], tr = P.trail || [];
  let acc = 0;
  for (let i = 1; i < tr.length; i++) {
    const [x0, z0] = tr[i - 1], [x1, z1] = tr[i]; acc += Math.hypot(x1 - x0, z1 - z0);
    if (acc < 4) continue; acc = 0;
    const tx = x1 - x0, tz = z1 - z0, l = Math.hypot(tx, tz) || 1;
    for (const side of [1, -1]) for (const off of [3.4, 5.6, 8]) { const o = (P.trailW || 1.5) + off + r() * 1.2; out.push({ x: x1 - tz / l * side * o, z: z1 + tx / l * side * o }); }
  }
  // the glades (the camp sites: open clearings, wildlife glades once the village is saved) and the POIs' rims
  for (const c of P.camps || []) for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + r(), d = (0.25 + 0.6 * r()) * Math.max(1.5, (c.r || 6) - 1); out.push({ x: c.x + Math.cos(a) * d, z: c.z + Math.sin(a) * d }); }
  for (const p of P.pois || []) for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + r(); out.push({ x: p.x + Math.cos(a) * ((p.r || 4.5) + 2.5), z: p.z + Math.sin(a) * ((p.r || 4.5) + 2.5) }); }
  return shuffled(out, `digorder:${area}`);
}
// ------------------------------------------------------------------ the sparkle material (soft, small, never a wash)
// the ground ring's size per model (a metre-wide prop gets about 1.7 m)
const RING_R = { mulberry: 1.9, honeyLog: 2.0, seaGlass: 2.0, netScraps: 1.9, culms: 2.0, branches: 2.0, seaDrift: 2.0, pine: 2.0, driftwood: 1.9 };
let _ring = null;
function ringMaterial() {
  return (_ring ||= new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime },
    vertexShader: /* glsl */`
      attribute float aOn; attribute float aPh; uniform float uTime; varying vec2 vUv; varying float vA;
      void main() {
        vUv = uv; vA = aOn * (0.78 + 0.22 * sin(uTime * 1.6 + aPh));
        vec4 wp = modelMatrix * instanceMatrix * vec4(position * (aOn > 0.0 ? 1.0 : 0.0), 1.0);
        vec4 mv = viewMatrix * wp;
        mv.z += 0.4; // (drawn as if 0.4 m nearer: it wins over the grass blades round it, never over the prop or an actor)
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying float vA;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float band = smoothstep(0.66, 0.8, d) * (1.0 - smoothstep(0.86, 1.0, d));   // a soft ring
        float fill = (1.0 - smoothstep(0.0, 0.84, d)) * 0.16;                      // and a faint glow inside it
        float a = (band * 0.62 + fill) * vA;
        if (a < 0.01) discard;
        gl_FragColor = vec4(1.0, 0.95, 0.8, a);
      }`,
    transparent: true, depthWrite: false, fog: false, toneMapped: false,
  }));
}
let _spark = null;
function sparkMaterial() {
  return (_spark ||= new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uPx: { value: 1 } },
    vertexShader: /* glsl */`
      attribute float aPh; attribute float aOn; attribute float aGold;
      uniform float uTime; varying float vA; varying float vGold;
      void main() {
        float tw = pow(0.5 + 0.5 * sin(uTime * 2.6 + aPh * 3.1), 2.0);
        vec3 p = position; p.y += 0.06 * sin(uTime * 1.4 + aPh);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float k = aOn * (0.25 + 0.75 * tw);
        gl_PointSize = aOn * (16.0 + 18.0 * tw + aGold * 8.0) * (22.0 / max(4.0, -mv.z)) * ${(typeof devicePixelRatio === 'number' ? Math.min(2, devicePixelRatio) : 1).toFixed(2)};
        vA = k; vGold = aGold;
      }`,
    fragmentShader: /* glsl */`
      varying float vA; varying float vGold;
      void main() {
        vec2 q = gl_PointCoord - 0.5; float d = length(q);
        float star = max(0.0, 1.0 - abs(q.x) * 9.0) * max(0.0, 1.0 - abs(q.y) * 2.2) + max(0.0, 1.0 - abs(q.y) * 9.0) * max(0.0, 1.0 - abs(q.x) * 2.2);
        float a = (smoothstep(0.5, 0.0, d) * 0.35 + star * 0.8) * vA;
        if (a < 0.01) discard;
        vec3 c = mix(vec3(1.0, 0.97, 0.86), vec3(1.0, 0.82, 0.3), vGold);
        gl_FragColor = vec4(c * a * 0.95, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
  }));
}
export { staleAreas };
