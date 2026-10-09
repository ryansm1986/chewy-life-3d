// The zone village runtime (docs/ZONES.md §2; ROADMAP Z-D1 to Z-D5): one per RegionMode visit to a zone whose village
// is authored (data.js ready). RegionMode wires it in four places:
//   build()  ZoneVillage.for(mode) before the RegionWorld (it sets layout.hooks.populate: the static village goes into
//            the world's prop chunks, colliders, nav grid, ground paint and greenery), then attach(world) after it (the
//            siege / saved overlays, cages, lights, villagers, interactables, mode.villagePos)
//   start()  start(): the siege camps' monsters and the captain; arrival() picks the inn / the waypoint as the start
//   update() update(dt, t): villagers, markers, the camps and cages, the captain's ward, the gloom, the celebration
//   onBossDefeated(captain) → captainDefeated(): saveVillage, 'village:saved', the celebration
// Save state: zones[zone].village ('besieged' | 'saved', rpg/zones.js), zones[zone].siegeCamps [{ id, cleared }]
// (camps stay cleared between visits), zones[zone].quests.freed [npc ids] (freed captives stay freed) and
// zones[zone].quests.rescued [npc ids] (villagers rescued in the dungeon, who then live in the village).
import * as THREE from 'three';
import { VILLAGES, slotAt, slotOffset, slotOf, screenAt, screenYaw, ZONE_NPCS, WAYSTONE, WAYSTONE_TINTS } from './data.js';
import * as Bamboo from './artBamboo.js';
import * as Maple from './artMaple.js';
import * as Tidepool from './artTidepool.js';
import * as Onsen from './artOnsen.js';
import { loadGlb, glbInstance } from '../../gfx/glbAssets.js';
import { makeOutline } from '../../gfx/materials.js';
import { villageMats, tplGroup, animateParts, cageTpl, captainGearTpl, arenaRing, warBanner, spikes, tent, campfire, debris, bones, scorchMesh, litLantern, tornLantern, bunting } from './art.js';
import { Builder } from '../../world/buildings/kit.js';
import { merge } from '../../gfx/geom.js';
import { Placer } from '../assets/bambooKit.js';
import { handOver } from '../biomeKit.js';
import { RCELL } from '../layoutGen.js';
import { zoneOf, saveVillage } from '../../rpg/zones.js';
import { MONSTER_MODS } from '../../rpg/stats.js';
import { monsterMods } from '../../rpg/zoneMods.js';
import { Monster } from '../../dungeon/monster.js';
import { MONSTERS } from '../../dungeon/monsters.js';
import { Events } from '../../core/events.js';
import { ZoneVillager, zoneSpec } from '../../actors/zoneVillagers.js';
import { prebuildHumanoid } from '../../actors/charKit.js';
import { CAPTAINS } from './captains.js';
import { villageTalk, buildingAction, wakeLines } from './talk.js';
import { crewParty } from '../../cozy/crewParty.js'; // (a crew's relief celebrated on arrival: docs/COZY.md §3.2)
import { rand, pick, clamp, lerp, TAU, mulberry32 } from '../../core/util.js';

const THEMES = { bamboo: Bamboo, maple: Maple, tidepool: Tidepool, onsen: Onsen };
const HELPERS = new Set(['cook', 'apprentice', 'deckhand', 'farmer']); // (roles that share a building with its keeper)
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

export class ZoneVillage {
  /** the village of this region visit, or null (no authored village / no site in the recipe) */
  static for(mode) {
    const def = VILLAGES[mode.zoneId], site = mode.layout?.village;
    if (!def?.ready || !site || !THEMES[def.theme]) return null;
    return new ZoneVillage(mode, def, site);
  }
  constructor(mode, def, site) {
    this.mode = mode; this.G = mode.G; this.def = def; this.zone = def.zone; this.theme = THEMES[def.theme];
    this.site = { x: site.x, z: site.z, r: site.r };
    const Z = this.Z = zoneOf(this.G.state, this.zone);
    Z.quests.freed ||= []; Z.quests.rescued ||= [];
    this.saved = Z.village === 'saved';
    // a crew's relief not yet seen (docs/COZY.md §3.2): the village is saved but plays its celebration on this arrival, the
    // saved look growing in as for a siege you broke yourself, with the crew in the square
    this.party = this.saved && !!Z.celebrate;
    // the siege camps' progress persists until the village is saved (then saveVillage clears the list)
    if (!this.saved) for (const c of def.camps) if (!Z.siegeCamps.some(s => s.id === c.id)) Z.siegeCamps.push({ id: c.id, cleared: false });
    this.camps = def.camps.map(c => { const p = screenAt(this.site, c.at[0], c.at[1]); return { ...c, ...p, ...slotOf(this.site, p.x, p.z), cleared: this.saved || !!Z.siegeCamps.find(s => s.id === c.id)?.cleared, monsters: [] }; });
    this.buildings = []; this.lamps = []; this.villagers = []; this.cages = []; this.inter = []; this.lights = []; this.spinners = []; this.siegeCols = [];
    this.t = 0; this.markT = 0; this.campT = 0; this.gloom = this.saved ? 0 : 1;
    Object.defineProperty(mode.layout, 'hooks', { value: { populate: ctx => this.populate(ctx), mapColor: (x, z) => this.mapColor(x, z) }, configurable: true, enumerable: false });
  }
  /** world position of a screen-polar slot round the square */
  at(a, d) { const s = slotAt(this.site, a, d); return { ...s, y: this.h0 ?? 0 }; }
  local(b, x, z) { const c = Math.cos(b.rot), s = Math.sin(b.rot); return { x: b.x + x * c + z * s, z: b.z - x * s + z * c }; }
  faceOf(b, yaw = 0) { return b.rot + yaw; }

  // ------------------------------------------------------------------ populate (inside the RegionWorld constructor)
  populate(ctx) {
    const S = this.site, T = this.theme;
    const h0 = this.h0 = ctx.heightAt(S.x, S.z);
    this.ctx = ctx;
    // the clearing's ground: a little worn everywhere, the square paved, paths to every door
    ctx.paint('litter', S.x, S.z, S.r + 1.5, 0, 0.4); ctx.paint('moss', S.x, S.z, S.r, 0.25, 0.4);
    const sq = this.def.square.r;
    ctx.paint('trail', S.x, S.z, sq + 0.35, 1, 0.18); ctx.paint('grass', S.x, S.z, sq + 0.6, 0, 0.3);
    // the buildings (static: the region's merged prop chunks), their colliders and nav blockers
    for (const b of this.def.buildings) {
      const build = T[b.kind]; if (!build) continue;
      const at = slotAt(S, b.a, b.d);
      if (b.face === 'camera') at.rot = Math.PI / 4; // (a low camera-side piece shows its front: +z toward the camera)
      let info = null;
      if (b.kind === 'waypoint' && WAYSTONE.glb) { const KB = new Builder(1); info = build(KB); KB.finish(); } // (Z-D6: a Blender shrine stands in: attach places it)
      else ctx.prop(B => { B.yaw0 = at.rot; info = build(B); if (this.saved && !this.party) info.saved?.(B); }, { x: at.x, z: at.z, y: h0, rot: at.rot, seed: hashStr(this.def.id + b.id) % 9973, occluder: true }); // (saved: its overlay in the same prop, so it warps with the walls it hangs on; a crew's party grows it in: attach)
      const rec = { ...b, ...at, info };
      this.buildings.push(rec);
      this.solidRect(rec, info.fp);
      const dr = this.local(rec, info.door[0], info.door[1]);
      rec.doorPos = V3(dr.x, h0, dr.z);
      if (b.face !== 'camera') this.paintPath(ctx, dr.x, dr.z, b.kind === 'waypoint' ? 0.6 : 0.8);
      else ctx.paint('trail', dr.x, dr.z, 1.1, 0.8, 0.5);
      const fr = this.local(rec, 0, info.fp[3] + 0.8); ctx.paint('dirt', fr.x, fr.z, 1.8, 0.35, 0.6); ctx.paint('grass', fr.x, fr.z, 1.4, 0.3, 0.6);
      for (const l of info.lamps || []) { const p = this.local(rec, l[0], l[2]); this.lamps.push({ x: p.x, y: h0 + l[1], z: p.z, b: rec }); }
    }
    // the square's furniture, gates, fences, lantern posts and greenery (the theme's own pieces)
    const PL = new Placer({ heightAt: (x, z) => ctx.heightAt(x, z), name: 'village' });
    this.decor = T.decor?.(this, ctx, PL, h0) || {};
    for (const l of this.decor.lamps || []) this.lamps.push(l);
    handOver(ctx, PL, { lightMul: 0 });
    // a saved village is built clean every visit: its saved dressing joins the region's merged prop chunks (no extra draw calls)
    if (this.saved && !this.party) { ctx.prop(B => { B.push([-S.x, -h0, -S.z]); this.savedDressing(B, { buildings: false }); B.pop(); }, { x: S.x, z: S.z, y: h0, warp: 0.03, seed: hashStr(this.def.id) % 9973 + 13 }); this.savedStatic = true; }
    // the siege's ground scars (the region is rebuilt per visit: a saved village is simply clean)
    if (!this.saved) {
      for (const c of this.camps) { ctx.paint('dirt', c.x, c.z, c.r + 1.2, 0.85, 0.5); ctx.paint('grass', c.x, c.z, c.r + 0.8, 0.1, 0.5); }
      const rr = mulberry32(hashStr(this.def.id) + 3);
      for (let i = 0; i < 7; i++) { const a = rr() * 360 - 180, d = 2 + rr() * (S.r - 3), p = this.at(a, d); ctx.paint('dirt', p.x, p.z, 1 + rr() * 1.4, 0.6, 0.6); }
    }
  }
  /** the minimap: the buildings' roofs and the paved square (RegionWorld.mapColor asks first) */
  mapColor(x, z) {
    const S = this.site; if (Math.hypot(x - S.x, z - S.z) > S.r) return null;
    for (const b of this.buildings) { const c = Math.cos(b.rot), s = Math.sin(b.rot), dx = x - b.x, dz = z - b.z, lx = dx * c - dz * s, lz = dx * s + dz * c, f = b.info.fp; if (lx > f[0] && lx < f[2] && lz > f[1] && lz < f[3]) return this.theme.MAP?.[b.kind] || '#c8a878'; }
    return Math.hypot(x - S.x, z - S.z) < this.def.square.r ? '#e6dcc6' : null;
  }
  /** the square ring's waypoint toward (x, z): routes go door → square → door */
  paintPath(ctx, x, z, w = 0.8) {
    const S = this.site, sq = this.def.square.r, d = Math.hypot(x - S.x, z - S.z), ux = (x - S.x) / (d || 1), uz = (z - S.z) / (d || 1);
    for (let t = sq - 0.2; t <= d + 0.2; t += 0.45) ctx.paint('trail', S.x + ux * t, S.z + uz * t, w, 1, 0.35);
  }
  /** colliders (a grid of small circles: the buildings turn every way) and blocked monster-grid cells for a local rect */
  solidRect(b, [x0, z0, x1, z1]) {
    const W = this.ctx.world, L = this.mode.layout, step = 0.55, r = 0.4;
    for (let z = z0 + r * 0.7; z <= z1 - r * 0.7 + 1e-3; z += step) for (let x = x0 + r * 0.7; x <= x1 - r * 0.7 + 1e-3; x += step) { const p = this.local(b, x, z); W.collision.addCircle(p.x, p.z, r); }
    for (const [x, z] of [[x0 + r * 0.7, z1 - r * 0.7], [x1 - r * 0.7, z1 - r * 0.7]]) { const p = this.local(b, x, z); W.collision.addCircle(p.x, p.z, r); }
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    for (let cy = 0; cy < L.H; cy++) for (let cx = 0; cx < L.W; cx++) {
      const wx = (cx + 0.5) * RCELL - b.x, wz = (cy + 0.5) * RCELL - b.z; if (wx * wx + wz * wz > 64) continue;
      const lx = wx * c - wz * s, lz = wx * s + wz * c;
      if (lx > x0 - 0.2 && lx < x1 + 0.2 && lz > z0 - 0.2 && lz < z1 + 0.2) L.grid[cy * L.W + cx] = 0;
    }
  }

  // ------------------------------------------------------------------ attach (after the RegionWorld exists)
  attach(world) {
    const G = this.G, S = this.site, h0 = this.h0 ?? world.heightAt(S.x, S.z);
    this.world = world;
    this.mats = villageMats(world.mood?.night ?? 0);
    this.mode.villagePos = V3(S.x, h0, S.z); // (the quest pointer: story.js placeFor)
    // the two overlays: the siege (only built while besieged) and the saved village (hidden until the celebration)
    if (!this.saved) { this.buildSiege(); this.buildSaved(); }
    if (this.party) this.buildSaved(); // (the crew's party: the saved look grows in, as a separate group)
    this.setSavedLook(this.saved && !this.party, true);
    // the cages of camps whose captive is still inside
    for (const c of this.camps) if (c.cage && !this.saved && !this.Z.quests.freed.includes(c.cage)) this.makeCage(c);
    // the villagers, then the interactables
    this.spawnVillagers();
    for (const b of this.buildings) this.addBuildingInteract(b);
    for (const it of this.inter) world.interactables.push(it);
    if (WAYSTONE.glb) for (const b of this.buildings) if (b.kind === 'waypoint') this.placeShrineGlb(b);
  }
  /** ROADMAP Z-D6: the Blender Waypoint Shrine (data.js WAYSTONE.glb) at the kit shrine's slot, its 'tint…' materials in the zone colour */
  placeShrineGlb(b) {
    const world = this.world;
    loadGlb(WAYSTONE.glb).then(tpl => {
      if (this.world !== world || !world.scene) return;
      const o = glbInstance(tpl, { outline: true }), tint = new THREE.Color(WAYSTONE_TINTS[this.zone] || '#5a9a88');
      o.traverse(m => { if (m.isMesh && /^tint/i.test(m.material?.name || '')) { m.material = m.material.clone(); m.material.color?.copy(tint); } });
      o.position.set(b.x, this.h0, b.z); o.rotation.y = b.rot + (WAYSTONE.yaw || 0); o.scale.setScalar(WAYSTONE.scale || 1);
      world.scene.add(o); this.shrineModel = o;
    }).catch(e => console.warn('[village] shrine model', e));
  }
  buildSiege() {
    const B = new Builder(hashStr(this.def.id) + 11); B.warpAmt = 0.03;
    const h0 = this.h0;
    for (const l of this.lamps) B.at([l.x, l.y, l.z], 0, () => tornLantern(B, { seed: Math.round(l.x * 7 + l.z * 3) }));
    // the camps (data.js pieces: screen offsets): a campfire, a tent, a war banner, spikes across the road, leftovers
    const W = this.world, col = (x, z, r) => this.siegeCols.push(W.collision.addCircle(x, z, r)), burns = [];
    for (const c of this.camps) {
      const P = c.pieces || {}, at = q => screenAt(this.site, q[0], q[1]), sd = c.a | 0;
      const f = at(P.fire || c.at);
      B.at([f.x, h0, f.z], 0, () => { campfire(B, { seed: sd }); bones(B, 1.6, { seed: sd + 3, n: 4 }); debris(B, 2.4, { seed: sd + 5, n: 5 }); });
      burns.push({ x: f.x, y: h0, z: f.z, r: c.r * 0.8, seed: sd + 1, a: 0.55 });
      col(f.x, f.z, 0.45); c.fire = V3(f.x, h0 + 0.5, f.z);
      if (P.tent) { const t = at(P.tent), yaw = screenYaw(P.tent[2] || 0); B.at([t.x, h0, t.z], yaw, () => tent(B, { L: 1.7, w: 1.4, h: 1.15, color: ['#5a3a5a', '#3a4a5a', '#5a3a3a'][this.camps.indexOf(c) % 3], seed: sd })); for (const k of [-0.5, 0.5]) col(t.x + Math.cos(yaw) * k, t.z - Math.sin(yaw) * k, 0.62); }
      if (P.banner) { const b = at(P.banner); B.at([b.x, h0, b.z], 0, () => warBanner(B, { h: 2.7, w: 0.6, seed: sd + 7 })); col(b.x, b.z, 0.14); }
      if (P.spikes) { const sp = at(P.spikes), yaw = screenYaw(P.spikes[2] || 0); B.at([sp.x, h0, sp.z], yaw, () => spikes(B, 2.4, { seed: sd })); for (const k of [-0.9, 0, 0.9]) col(sp.x + Math.cos(yaw) * k, sp.z - Math.sin(yaw) * k, 0.38); }
    }
    // the captain's dais: war banners at the square's top corners and scorch on the paving
    for (const a0 of [-48, 48]) { // (off the road: nudged round the square's rim until clear of the trail)
      let a = a0, p = this.at(a, this.def.square.r + 1.0);
      for (const da of [0, 10, -10, 20, -20, 32, -32]) { const q = this.at(a0 + da, this.def.square.r + 1.0); if ((this.ctx?.pathDist?.(q.x, q.z) ?? 9) > (this.ctx?.plan?.trailW ?? 1.5) + 0.7) { a = a0 + da; p = q; break; } }
      B.at([p.x, h0, p.z], 0, () => warBanner(B, { h: 3.1, w: 0.7, seed: a0 + 99 })); col(p.x, p.z, 0.15);
    }
    for (let i = 0; i < 4; i++) { const p = this.at(i * 90 - 45 + 20, 2.6 + (i % 2) * 1.4); burns.push({ x: p.x, y: h0, z: p.z, r: 0.9 + (i % 3) * 0.3, seed: 40 + i, a: 0.32 }); }
    this.siegeGroup = tplGroup(this.withOverlays(B.finish(), 'siege'), this.mats, 'village:siege');
    this.siegeGroup.add(scorchMesh(burns));
    this.world.scene.add(this.siegeGroup);
    // light: the camp fires only (the village's lanterns are dark)
    for (const c of this.camps) if (!c.cleared) c.light = this.world.lightPool.addSource({ pos: c.fire.clone(), color: new THREE.Color('#ff8a3a'), intensity: 5, radius: 6.5, flicker: 0.8, priority: 3 });
    // the captain's arena ring
    const cp = this.def.captain, ca = this.at(cp.a, cp.d);
    this.ring = arenaRing(cp.ring || 5, '#c84a6a'); this.ring.position.set(ca.x, this.h0 + 0.04, ca.z); this.world.scene.add(this.ring);
  }
  buildSaved() {
    const B = new Builder(hashStr(this.def.id) + 13); B.warpAmt = 0.03;
    this.savedDressing(B, { buildings: false });
    this.savedGroup = tplGroup(this.withOverlays(B.finish(), 'saved'), this.mats, 'village:saved');
    this.world.scene.add(this.savedGroup);
  }
  /** a building's overlay ('siege' | 'saved') built in the building's own frame with its own seed and warp — so a board
   *  or a glow a centimetre off a wall stays on it, exactly as on the static model — then placed in world space */
  overlayTpl(b, which) {
    const fn = b.info[which]; if (!fn) return null;
    const B = new Builder(hashStr(this.def.id + b.id) % 9973); B.yaw0 = b.rot; // (the building prop's seed, and the kit's default warp)
    fn(B);
    const tpl = B.finish(), m = new THREE.Matrix4().compose(V3(b.x, this.h0, b.z), new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), b.rot), V3(1, 1, 1));
    for (const k of Object.keys(tpl.geos)) tpl.geos[k].applyMatrix4(m);
    return tpl;
  }
  /** a world-space template plus every building's overlay of that kind, bucket by bucket */
  withOverlays(tpl, which) {
    const add = {};
    for (const b of this.buildings) { const o = this.overlayTpl(b, which); if (o) for (const k of Object.keys(o.geos)) (add[k] ||= []).push(o.geos[k]); }
    for (const k of Object.keys(add)) { const list = [tpl.geos[k], ...add[k]].filter(Boolean); tpl.geos[k] = list.length > 1 ? merge(list) : list[0]; tpl.geos[k].computeBoundingSphere(); }
    return tpl;
  }
  /** everything the saved village puts out (world coordinates): the buildings' saved overlays (unless they ride their own
   *  props / overlay templates: buildings: false), lit lanterns, bunting, the theme's saved decor */
  savedDressing(B, { buildings = true } = {}) {
    const h0 = this.h0;
    if (buildings) for (const b of this.buildings) if (b.info.saved) B.at([b.x, h0, b.z], b.rot, () => b.info.saved(B));
    for (const l of this.lamps) B.at([l.x, l.y, l.z], 0, () => litLantern(B, { r: 0.14, h: 0.3, color: l.color || '#e8503a' }));
    // festival bunting across the top of the square, between the lantern posts / building eaves
    const pts = [-58, -30, 0, 30, 58].map(a => { const p = this.at(a, this.def.square.r + 1.2); return [p.x, h0 + 2.55 + (a === 0 ? 0.25 : 0), p.z]; });
    bunting(B, pts, { sag: 0.18, size: 0.13 });
    this.theme.savedDecor?.(this, B, h0);
  }
  /** show the saved look (lit lanterns, open shops, the waystone's rune) — instant, or grown in by the celebration */
  setSavedLook(on, instant = false) {
    if (this.savedGroup) this.savedGroup.visible = on;
    if (on) {
      if (!this.lampLights) {
        this.lampLights = [];
        for (const l of this.lamps) this.lampLights.push(this.world.lightPool.addSource({ pos: V3(l.x, l.y - 0.25, l.z), color: new THREE.Color(l.light || '#ffb468'), intensity: instant ? 2.6 : 0, radius: 4.5, flicker: 0.4, priority: 2 }));
        const wp = this.buildings.find(b => b.kind === 'waypoint');
        if (wp?.info.rune) { const p = this.local(wp, wp.info.rune[0], wp.info.rune[2]); this.lampLights.push(this.runeLight = this.world.lightPool.addSource({ pos: V3(p.x, this.h0 + wp.info.rune[1], p.z), color: new THREE.Color('#8fd0ff'), intensity: instant ? 5 : 0, radius: 5, flicker: 0.2, priority: 4 })); }
      }
      if (!instant && this.savedGroup) this.growT = 0;
    }
  }
  makeCage(c) {
    const tpl = cageTpl((c.a | 0) + 3), g = tplGroup(tpl, this.mats, 'village:cage');
    const q = c.pieces?.cage || [c.at[0], c.at[1] - 2.5, 0], p = screenAt(this.site, q[0], q[1]), x = p.x, z = p.z, face = screenYaw(q[2] || 0); // (its door faces the camera)
    g.position.set(x, this.h0, z); g.rotation.y = face;
    this.world.scene.add(g);
    const cg = { camp: c, npc: c.cage, x, z, face, group: g, door: g.userData.parts[0]?.node, open: 0, opening: false, cols: [] };
    // its colliders (the villager stands inside), and the interactable
    for (const [dx, dz] of [[-0.5, -0.45], [0.5, -0.45], [-0.5, 0.45], [0.5, 0.45], [0, -0.5], [0, 0.5], [-0.55, 0], [0.55, 0]]) {
      const c2 = Math.cos(face), s2 = Math.sin(face); cg.cols.push(this.world.collision.addCircle(x + dx * c2 + dz * s2, z - dx * s2 + dz * c2, 0.12));
    }
    const name = ZONE_NPCS[c.cage]?.name || c.cage;
    cg.it = { pos: V3(x + Math.sin(face) * 0.9, this.h0, z + Math.cos(face) * 0.9), radius: 1.5, label: `Free ${name}`, onInteract: () => this.freeCage(cg) };
    Object.defineProperty(cg.it, 'label', { get: () => (this.campAlive(c) ? `${name} is locked in — the yokai stand guard` : `Free ${name}`), configurable: true });
    this.inter.push(cg.it);
    this.cages.push(cg);
    return cg;
  }

  // ------------------------------------------------------------------ the villagers
  presentIds() {
    const Z = this.Z, out = [];
    for (const n of this.def.villagers) {
      if (n.rescue && !Z.quests.rescued.includes(n.id)) continue; // (still down in the dungeon)
      out.push(n);
    }
    return out;
  }
  spawnVillagers() {
    const W = this.world, folkN = this.saved && !this.party ? this.def.folk.n : 0; // (a crew's party: the townsfolk step out to cheer)
    const list = [...this.presentIds(), ...Array.from({ length: folkN }, (_, i) => ({ id: `${this.def.id}_folk${i}`, folk: true }))];
    for (const d of list) {
      const home = this.homeOf(d);
      const v = new ZoneVillager(W, this.G, d, { village: this, zone: this.zone, home, spots: this.spotsFor(d, home) });
      this.villagers.push(v);
      const caged = d.camp && !this.saved && !this.Z.quests.freed.includes(d.id);
      if (caged) { const cg = this.cages.find(c => c.npc === d.id); if (cg) { v.cage({ x: cg.x, z: cg.z, face: cg.face }); cg.v = v; } else v.hide(); }
      else if (!this.saved && (d.hide || d.folk)) v.hide();
      else if (!this.saved) { v.setPos(home.x, home.z); v.facing = v.faceTarget = home.face; v.state = 'scared'; }
      else { const sp = v.spots[Math.floor(Math.random() * v.spots.length)] || home; v.setPos(sp.x + rand(-0.3, 0.3), sp.z + rand(-0.3, 0.3)); v.state = 'life'; }
      this.G.registerPortrait?.(d.id, v.spec);
    }
  }
  homeOf(d) {
    const b = this.buildings.find(x => x.id === d.home) || this.buildings.find(x => x.kind === 'elder') || this.buildings[0];
    const k = b.info.keeper && !d.folk && d.home === b.id && !HELPERS.has(d.role) ? b.info.keeper : [b.info.door[0], b.info.door[1], 0]; // (a helper waits by the door: the keeper has the counter)
    const p = this.local(b, k[0], k[1]);
    return { x: p.x, z: p.z, face: this.faceOf(b, k[2] || 0), b };
  }
  spotsFor(d, home) {
    const S = this.site, sq = this.def.square.r, out = [], B = home.b;
    const role = d.role;
    // their own place: the counter / the dojo floor / the workbench
    const pose = { shopkeeper: 'shopkeep', innkeeper: 'shopkeep', cook: 'shopkeep', elder: 'admire', sensei: 'listen', craftsman: 'read', teaMaster: 'shopkeep', farmer: 'admire', apprentice: 'listen', fishmonger: 'shopkeep', boatwright: 'read', deckhand: 'listen', bathkeeper: 'shopkeep', smith: 'read' }[role] || 'admire';
    if (!d.folk) out.push({ x: home.x, z: home.z, face: home.face, pose, w: 4, dur: [16, 34], fidget: ['nod', 'lookAround', 'stretch', 'bow'], emote: ['note', 'sparkle'] });
    if (B?.info.seat && (role === 'elder' || role === 'innkeeper' || d.folk)) { const p = this.local(B, B.info.seat[0], B.info.seat[1]); out.push({ x: p.x, z: p.z, face: this.faceOf(B, B.info.seat[2] || 0), seat: true, seatY: this.h0 + (B.info.seat[3] ?? (B.kind === 'elder' ? 0.38 : 0.42)), w: 1.5, dur: [18, 36], emote: ['zzz', 'note', 'heart'] }); }
    // the square: chatting round its edge, admiring the basin, a lantern-gaze, a bench
    for (let i = 0; i < 6; i++) { const a = -150 + i * 60 + rand(-12, 12), p = this.at(a, sq - 0.8 - rand(0, 1.4)); out.push({ x: p.x, z: p.z, face: Math.atan2(S.x - p.x, S.z - p.z) + rand(-0.6, 0.6), pose: pick(['chat', 'listen', 'admire']), w: d.folk ? 1.4 : 0.6, dur: [8, 16], fidget: ['laugh', 'nod', 'clap', 'scratchHead'], emote: ['note', 'heart', 'sparkle'] }); }
    for (const s of this.decor.spots || []) out.push({ ...s, w: (s.w ?? 0.8) * (d.folk ? 1.3 : 1) });
    return out;
  }
  /** a walking route from `a` to `b` through the square (doors face it, so the way between buildings is open) */
  route(a, b) {
    const S = this.site, sq = this.def.square.r + 0.4, da = Math.hypot(a.x - S.x, a.z - S.z), db = Math.hypot(b.x - S.x, b.z - S.z);
    if (da < sq + 1.5 && db < sq + 1.5) return [{ x: b.x, z: b.z }];
    const edge = (p, d) => ({ x: S.x + (p.x - S.x) / (d || 1) * Math.min(d, sq), z: S.z + (p.z - S.z) / (d || 1) * Math.min(d, sq) });
    const pts = [];
    if (da > sq + 1.5) pts.push(edge(a, da));
    if (db > sq + 1.5) pts.push(edge(b, db));
    pts.push({ x: b.x, z: b.z });
    return pts;
  }
  villager(id) { return this.villagers.find(v => v.id === id) || null; }
  /** a zone villager's position for the quest pointer (story.js), or null when they're not out */
  npcPos(id) { const v = this.villager(id); return v && v.visible && v.state !== 'hidden' ? v.pos : null; }
  talk(v) { return villageTalk(this, v); }

  // ------------------------------------------------------------------ the buildings' doors (their services: talk.js)
  addBuildingInteract(b) {
    const it = { pos: b.doorPos, radius: b.kind === 'waypoint' ? 1.6 : 1.2, building: b, onInteract: () => buildingAction(this, b) };
    Object.defineProperty(it, 'label', { get: () => (this.saved ? b.label || this.doorLabel(b) : b.kind === 'waypoint' ? 'The Waypoint Shrine is dark — break the siege' : `${b.name} — boarded up`), configurable: true });
    this.inter.push(it);
  }
  doorLabel(b) {
    return { elder: `Knock at ${b.name}`, shop: `Shop at ${b.name}`, inn: `Rest at the ${b.name}`, waypoint: 'Touch the Waypoint Shrine', dojo: `Enter the ${b.name}`, craft: `Browse the ${b.name}`,
      teaHouse: `Sit down at the ${b.name}`, fishmonger: `Browse ${b.name}`, boatwright: `Visit the ${b.name}`, bathhouse: `Soak at the ${b.name}`, smith: `Visit ${b.name}` }[b.kind] || b.name;
  }

  // ------------------------------------------------------------------ start (RegionMode.start): the siege's monsters
  start(arrive = {}) {
    const M = this.mode, G = this.G;
    if (arrive.respawn && this.saved) setTimeout(() => this.wakeAtInn(), 900);
    if (this.party) this.startParty();
    if (this.saved) return;
    // the townsfolk come out when the siege lifts: their rigs are built now, behind the entry iris
    for (let i = 0; i < this.def.folk.n; i++) prebuildHumanoid(zoneSpec(`${this.def.id}_folk${i}`));
    void G;
    const kinds = M.theme.monsters, lvl = (M.layout.mlvl || 1) + 1;
    for (const c of this.camps) {
      if (c.cleared) continue;
      const n = c.n || 5;
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU + rand(-0.3, 0.3), r = rand(1.1, 2.4);
        let x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
        if (!this.world.walkable(x, z)) { x = c.x; z = c.z; }
        // one kind and one look per camp (each camp reads as its own band, and the horde draws a camp in one batch:
        // a mix of kinds × variants near the square cost ~140 draw calls)
        const ci = this.camps.indexOf(c), rank = i === 0 ? 'champion' : 'normal', kind = kinds[ci % kinds.length];
        const m = monsterMods(M, new Monster(M, kind, { level: lvl, rank, variant: ci % 3, x, z, rng: () => M.rng.next() }));
        m.siegeCamp = c.id; c.monsters.push(m);
        M.monsters.push(m); M.combat.add(m);
      }
    }
    this.spawnCaptain();
  }
  spawnCaptain() {
    const M = this.mode, cp = this.def.captain, C = CAPTAINS[cp.id];
    if (!C || !MONSTERS[cp.id]) return;
    const p = this.at(cp.a, cp.d);
    const m = monsterMods(M, new Monster(M, cp.id, { level: (M.layout.mlvl || 1) + (C.lvl || 2), variant: C.variant || 0, x: p.x, z: p.z, rng: () => M.rng.next() }));
    for (const id of C.mods || []) MONSTER_MODS[id]?.apply(m.stats);
    m.lifeMax = m.life = Math.round(m.stats.life * (MONSTERS[cp.id].life || 1));
    m.siegeCaptain = true; m.facing = Math.PI / 4; // (faces the camera)
    M.monsters.push(m); M.combat.add(m);
    this.dressCaptain(m);
    this.captain = m; M.regionBoss = M.boss;
    // warded while any camp stands: it doesn't wake, and blows glance off its banner ward
    m.warded = this.camps.some(c => !c.cleared);
    const alert0 = m.alert.bind(m), hurt0 = m.takeDamage.bind(m);
    m.alert = () => { if (m.warded) return; if (M.boss !== m && m.alive) M.boss = m; alert0(); };
    m.takeDamage = (dmg, o) => {
      if (!m.warded) return hurt0(dmg, o);
      if ((this.wardTipT || 0) < this.t) { this.wardTipT = this.t + 2.5; this.G.ui?.float?.(m.lift(m.height + 0.3), 'Warded!', { kind: 'status', color: '#d8b8ff' }); this.G.vfx?.ring?.(m.pos, { color: '#c8a8ff', r0: 0.6, r1: 2.2, life: 0.35 }); Events.emit('sfx', 'block'); }
      if ((this.wardToastT || 0) < this.t) { this.wardToastT = this.t + 9; this.G.ui?.toast?.(`${m.name}'s banner ward holds! Break the siege camps first (${this.camps.filter(c => c.cleared).length}/${this.camps.length})`, { icon: 'oni', color: '#d8b8ff' }); }
    };
    if (m.warded) this.makeWard(m);
  }
  /** the captain's gear (art.js captainGearTpl) on its model's body: out of the instanced batches, a plain scene model */
  dressCaptain(m) {
    const H = this.mode._horde, model = m.model, host = model.inner || model.pivot || model.root;
    if (!host || model.rig) return;
    if (model.slots && H) H.release(model);
    const C = CAPTAINS[this.def.captain.id] || {};
    const gear = tplGroup(captainGearTpl(C.gear || {}), this.mats, 'captain:gear'), ol = makeOutline('#2a1622', 0.012);
    for (const c of [...gear.children]) if (c.isMesh && c.material === this.mats.body) { const o = new THREE.Mesh(c.geometry, ol); o.name = 'captain:gearOutline'; gear.add(o); }
    host.add(gear);
    if (!model.root.parent) H ? H.place(model) : this.world.scene.add(model.root);
    // ROADMAP Z-D6: a Blender captain (CAPTAINS[id].glb) stands in for the kit body; the gear, the AI and the hitbox stay
    if (C.glb) loadGlb(C.glb).then(tpl => {
      if (!m.alive || m.disposed || !this.world?.scene) return;
      const o = glbInstance(tpl, { outline: true }); o.name = 'captain:glb';
      host.traverse(c => { if (c.isMesh && !c.name.startsWith('captain:')) c.visible = false; });
      host.add(o);
    }).catch(e => console.warn('[village] captain model', e));
  }
  makeWard(m) {
    const g = new THREE.RingGeometry(1.2, 1.38, 48); g.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: '#b88aff', transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(g, mat); ring.renderOrder = 3;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.5, 24, 12, 0, TAU, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#c8a8ff', transparent: true, opacity: 0.12, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    dome.renderOrder = 3;
    const grp = new THREE.Group(); grp.add(ring, dome); grp.position.copy(m.pos); grp.position.y += 0.05; grp.scale.setScalar(m.bodyR * 1.6);
    this.world.scene.add(grp); this.ward = grp;
  }
  campAlive(c) { return c.monsters.some(m => m.alive); }

  // ------------------------------------------------------------------ the siege, frame by frame
  update(dt, t) {
    this.t += dt;
    const G = this.G;
    for (const v of this.villagers) v.update(dt);
    if (this.siegeGroup?.visible) animateParts(this.siegeGroup.userData.parts, t);
    for (const s of this.spinners) s(dt, t);
    this.decor.update?.(dt, t);
    // the camps: cleared when their monsters are all down
    if ((this.campT -= dt) <= 0 && !this.saved) {
      this.campT = 0.25;
      for (const c of this.camps) if (!c.cleared && c.monsters.length && !this.campAlive(c)) this.campCleared(c);
    }
    // the cages' doors swing open
    for (const cg of this.cages) if (cg.opening && cg.door) { cg.open = Math.min(1, cg.open + dt * 2.2); cg.door.rotation.y = -cg.open * 1.9; }
    if (this.ward && this.captain) { this.ward.position.set(this.captain.pos.x, this.captain.pos.y + 0.05, this.captain.pos.z); this.ward.rotation.y += dt * 0.8; const k = 0.5 + 0.1 * Math.sin(t * 3); this.ward.children[0].material.opacity = k; }
    if (this.ring) this.ring.material.opacity = (this.captain?.alive ? 0.42 + 0.12 * Math.sin(t * 2.2) : Math.max(0, this.ring.material.opacity - dt * 0.8));
    // the captain borrows the region's boss slot while it fights near the village, and gives it back
    const cap = this.captain, M = this.mode;
    if (cap?.alive && !cap.warded && cap.aggro && M.boss !== cap) M.boss = cap;
    if (cap && !cap.alive && !this.saved && !cap.vanished) this.captainDefeated(cap); // (a death outside the boss slot still saves the village)
    this.updateGloom(dt);
    this.updateCelebration(dt);
    this.updateMarkers(dt, t);
  }
  campCleared(c) {
    c.cleared = true;
    const rec = this.Z.siegeCamps.find(s => s.id === c.id); if (rec) rec.cleared = true;
    if (c.light) { this.world.lightPool.removeSource(c.light); c.light = null; }
    const G = this.G, left = this.camps.filter(x => !x.cleared).length;
    const name = ZONE_NPCS[c.cage]?.name;
    G.ui?.toast?.(`${cap(c.name)} is broken!${name && !this.Z.quests.freed.includes(c.cage) ? ` Free ${name} from the cage (F)` : ''}`, { icon: 'star', color: '#8fe0c0', sub: left ? `${left} siege camp${left > 1 ? 's' : ''} left` : 'The captain\'s ward is breaking…' });
    G.vfx?.sparkle?.(c.fire?.clone?.() || V3(c.x, this.h0 + 0.6, c.z), { n: 18, color: '#ffe8a0', r: 1 });
    const cg = this.cages.find(x => x.camp === c); if (cg?.v) { cg.v.emote('!'); cg.v.anim.play('wave'); }
    Events.emit('village:campCleared', { zone: this.zone, camp: c.id, left });
    if (!left) setTimeout(() => this.breakWard(), 1400);
    G.save?.();
  }
  breakWard() {
    const m = this.captain, G = this.G;
    if (!m?.alive || !m.warded) return;
    m.warded = false;
    if (this.ward) { G.vfx?.ring?.(this.ward.position, { color: '#c8a8ff', r0: 0.8, r1: 4.5, life: 0.6 }); G.vfx?.sparkle?.(m.lift(1), { n: 30, color: '#d8c0ff', r: 1.4, rise: 1.6 }); this.world.scene.remove(this.ward); this.ward.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); this.ward = null; }
    G.ui?.toast?.(`${m.name}'s ward shatters! The captain wakes in the square…`, { icon: 'oni', color: '#ff8a9a' });
    Events.emit('sfx', 'boss_roar');
    G.engine.rig.shake(0.35);
    m.emote('anger', 1.6);
  }
  freeCage(cg) {
    const G = this.G;
    if (cg.freed) return;
    if (this.campAlive(cg.camp)) { G.ui?.toast?.(`The yokai of ${cg.camp.name} still guard the cage!`, { icon: 'oni', color: '#ff8a9a' }); Events.emit('sfx', 'ui_error'); return; }
    cg.freed = true; cg.opening = true;
    const i = this.inter.indexOf(cg.it); if (i >= 0) this.inter.splice(i, 1);
    const j = this.world.interactables.indexOf(cg.it); if (j >= 0) this.world.interactables.splice(j, 1);
    for (const c of cg.cols) this.world.collision.remove(c);
    this.Z.quests.freed.push(cg.npc);
    Events.emit('sfx', 'chest_open');
    G.vfx?.sparkle?.(V3(cg.x, this.h0 + 1, cg.z), { n: 24, color: '#fff2c8', r: 0.8, rise: 1.4 });
    const v = cg.v;
    if (v) {
      v.state = 'idle'; v.anim.play('happy'); v.emote('heart', 2);
      setTimeout(() => { if (v.world !== this.world) return; const h = v.home; v.walkTo(h.x, h.z, this.saved ? 'life' : 'scared', 1.2); }, 900);
    }
    G.ui?.toast?.(`${ZONE_NPCS[cg.npc]?.name || cg.npc} is free!`, { icon: 'heart', color: '#ff8fb0', sub: this.saved ? '' : 'They run home — but the siege captain still holds the square' });
    Events.emit('villager:rescued', { npc: cg.npc, zone: this.zone, dungeon: null, floor: 0, village: this.def.id });
    G.story?.addHearts?.(cg.npc, 10);
    G.save?.();
  }

  // ------------------------------------------------------------------ the captain falls: the village is saved
  captainDefeated(b, xp = 0) {
    const G = this.G, M = this.mode;
    M.boss = M.regionBoss?.alive ? M.regionBoss : null;
    G.ui?.setBoss?.(null);
    G.engine.timeScale = 0.4; setTimeout(() => { G.engine.timeScale = 1; }, 1100);
    G.engine.post?.pulse?.('#fff4d8', 0.3);
    G.vfx?.victory?.(b.pos.clone(), {});
    G.vfx?.calm?.(2.5); G.ui?.floats?.hush?.(2.6);
    G.ui?.banner?.('Victory!', `${b.name} was defeated!`, { style: 'victory', xp });
    M.clearBossFight?.(b);
    Events.emit('boss:dead', { id: b.id, floor: 0, ...M.where(), captain: true }); // (the music's victory; the boss bar clears)
    G.audio?.music?.('dungeon', { fade: 3 });
    // any siege monster still standing flees in a puff (the camps are already down, but stragglers may be about)
    for (const c of this.camps) for (const m of c.monsters) if (m.alive) m.vanish(0.4 + Math.random() * 0.6);
    this.saveNow();
  }
  saveNow() {
    if (this.saved) return;
    const G = this.G, first = saveVillage(G.state, this.zone);
    this.saved = true;
    for (const c of this.camps) { c.cleared = true; if (c.light) { this.world.lightPool.removeSource(c.light); c.light = null; } }
    for (const o of this.siegeCols) this.world.collision.remove(o); this.siegeCols.length = 0; // (the barricades come down)
    this.celebrate = { t: 0, stage: 0 };
    this.pendingSaved = first; // ('village:saved' goes out with the "…is saved!" banner, so the story's beats follow it in order)
    G.save?.();
  }
  /** A crew's relief, celebrated on this arrival (docs/COZY.md §3.2): the crew stand in the square in front of the
   *  shrine you arrive at, the village's lanterns and shop fronts grow in, everyone cheers, then the crew heads home. */
  startParty() {
    const Z = this.Z;
    Z.celebrate = false; // (once: a reload mid-scene doesn't play it again)
    this.crew = crewParty(this, Z.celebrateCrew || []);
    this.partyBy = this.crew?.members?.length ? (this.crew.members.length > 1 ? `${this.crew.members[0].name}'s crew` : this.crew.members[0].name) : 'your crew';
    Z.celebrateCrew = [];
    this.celebrate = { t: 0, stage: 0, crew: true };
    Events.emit('village:celebrate', { zone: this.zone, village: this.def.id, crew: (this.crew?.members || []).map(m => m.key) });
  }
  updateCelebration(dt) {
    const C = this.celebrate; if (!C) return;
    const G = this.G; C.t += dt;
    if (this.crew) { this.crew.update(dt, C.stage >= 1 && C.t < 8); if (C.crew && C.t > 8.2) this.crew.leave(); }
    if (C.stage === 0 && C.t > (C.crew ? 2.2 : 1.5)) {
      C.stage = 1;
      G.ui?.banner?.(`${this.def.name} is saved!`, C.crew ? `${this.def.jp} · ${this.partyBy} drove the siege off` : `${this.def.jp} · ${this.def.sub}`, { style: 'quest' });
      this.emitSaved();
      Events.emit('sfx', 'ui_levelup');
      // the siege comes down: banners crumple, boards pop off in puffs
      if (this.siegeGroup) C.fall = 0;
      for (const b of this.buildings) G.vfx?.poof?.(b.doorPos.clone().setY(this.h0 + 1), { color: '#e8d8c0', n: 8, size: 0.5 });
    }
    if (C.fall != null && this.siegeGroup) {
      C.fall += dt;
      const k = clamp(C.fall / 0.7);
      this.siegeGroup.scale.y = 1 - k * k; this.siegeGroup.position.y = 0;
      if (k >= 1) { this.siegeGroup.visible = false; C.fall = null; }
    }
    if (C.stage === 1 && C.t > 2.1) {
      C.stage = 2;
      this.setSavedLook(true, false);
      if (this.ring) this.ring.visible = true;
      for (const l of this.lamps) G.vfx?.sparkle?.(V3(l.x, l.y - 0.3, l.z), { n: 6, color: '#ffe0a0', r: 0.2, rise: 0.6 });
      // everyone comes out and cheers
      for (const v of this.villagers) {
        if (v.state === 'caged') { const cg = this.cages.find(c => c.v === v); if (cg) { cg.camp.monsters.length = 0; this.freeCage(cg); } }
        else if (v.state === 'hidden') v.stepOut('life');
        else if (v.state === 'scared') v.state = 'life';
      }
      setTimeout(() => this.spawnFolk(), 600);
    }
    if (this.growT != null) {
      this.growT += dt;
      const k = clamp(this.growT / 0.8), e = 1 - (1 - k) * (1 - k);
      this.savedGroup.scale.y = Math.max(0.02, e);
      for (const l of this.lampLights || []) l.intensity = (l === this.runeLight ? 5 : 2.6) * e;
      if (k >= 1) this.growT = null;
    }
    if (C.stage === 2 && C.t > 2.6 && C.t < 7) {
      C.cheer = (C.cheer ?? 0) - dt;
      if (C.cheer <= 0) {
        C.cheer = 0.9;
        for (const v of this.villagers) if (Math.random() < 0.6) v.cheer();
        const a = rand(-180, 180), p = this.at(a, rand(1, this.def.square.r));
        G.vfx?.sparkle?.(V3(p.x, this.h0 + rand(1.5, 3), p.z), { n: 16, color: pick(['#ff8fb0', '#ffd24a', '#8fe0c0', '#8fd0ff']), r: 0.8, rise: 1.2 });
        G.vfx?.petals?.(V3(p.x, this.h0 + 2.5, p.z), 14);
      }
    }
    if (C.stage === 2 && C.t > 4.2) {
      C.stage = 3;
      G.ui?.toast?.('The Waypoint Shrine glows again — you can travel here from the map', { icon: 'map', color: '#8fd0ff' });
      setTimeout(() => G.ui?.toast?.('The villagers have quests for you! Look for the "!"', { icon: 'quest', color: '#ffd84a' }), 2600);
    }
    if (C.stage === 3 && C.t > 6.5) { // the open cages are carried off
      C.stage = 4;
      for (const cg of this.cages) { G.vfx?.poof?.(V3(cg.x, this.h0 + 0.6, cg.z), { color: '#efe2c8', n: 10, size: 0.5 }); cg.group.visible = false; if (cg.marker) cg.marker.visible = false; }
    }
    if (C.t > (C.crew ? 15 : 9)) { this.celebrate = null; if (this.crew) { this.crew.dispose(); this.crew = null; } }
  }
  emitSaved() { if (!this.pendingSaved) return; this.pendingSaved = false; Events.emit('village:saved', { zone: this.zone, village: this.def.id }); }
  spawnFolk() {
    if (this.villagers.some(v => v.folk)) return;
    const W = this.world;
    for (let i = 0; i < this.def.folk.n; i++) {
      const d = { id: `${this.def.id}_folk${i}`, folk: true }, home = this.homeOf(d);
      const v = new ZoneVillager(W, this.G, d, { village: this, zone: this.zone, home, spots: this.spotsFor(d, home) });
      this.villagers.push(v); v.stepOut('life');
      this.G.registerPortrait?.(d.id, v.spec);
    }
  }
  // the siege gloom: the besieged village sits under a desaturated, slightly darker grade that lifts when it's saved
  updateGloom(dt) {
    const S = this.site, P = this.G.player, post = this.G.engine.post; if (!P || !post) return;
    const inside = Math.hypot(P.pos.x - S.x, P.pos.z - S.z) < S.r + 4;
    const want = !this.saved && inside ? 1 : 0;
    const was = this.gloomApplied;
    this.gloom += (want - this.gloom) * Math.min(1, dt * (want ? 1.2 : 0.7));
    if (this.gloom < 0.002 && !was) return;
    const g = this.mode.region.mood?.grade || {}, gr = post.grade.uniforms, k = this.gloom;
    const gain = g.gain || [1, 1, 1];
    gr.get('uSat').value = (g.sat ?? 1.05) * (1 - 0.16 * k);
    gr.get('uGain').value.set(gain[0] * (1 - 0.06 * k), gain[1] * (1 - 0.07 * k), gain[2] * (1 - 0.03 * k));
    gr.get('uVignette').value = (g.vignette ?? 1) + 0.12 * k;
    this.gloomApplied = this.gloom >= 0.002;
  }
  // '!' / '?' markers over the villagers (quests: talk.js), and over a cage whose camp is cleared
  updateMarkers(dt, t) {
    const G = this.G;
    if ((this.markT -= dt) <= 0) {
      this.markT = 0.4;
      for (const v of this.villagers) this.setMarker(v, v.visible && !v.talking && !v.hidden ? this.markerFor(v) : null);
      for (const cg of this.cages) this.setMarker(cg, !cg.freed && !this.campAlive(cg.camp) ? '!' : null, V3(cg.x, this.h0 + 1.9, cg.z));
    }
    for (const v of this.villagers) if (v.marker?.visible) v.marker.position.set(v.pos.x, v.pos.y + (v.rig.height || 1.2) + 0.75 + Math.sin(t * 3 + v.pos.x) * 0.08, v.pos.z);
    void G;
  }
  markerFor(v) {
    if (v.folk) return null;
    const S = this.G.story;
    if (this.saved && S?.zoneOffers?.(v.id, this.zone)?.length) return '!';
    return S?.markerFor?.(v.id) || null;
  }
  setMarker(o, kind, pos = null) {
    let m = o.marker;
    if (!kind) { if (m) m.visible = false; return; }
    const vfx = this.G.vfx; if (!vfx?.emoteTexture) return;
    if (!m) { m = o.marker = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false, toneMapped: false })); m.renderOrder = 25; m.scale.setScalar(0.62); this.world.scene.add(m); }
    if (m.userData.kind !== kind) { m.material.map = vfx.emoteTexture(kind); m.material.needsUpdate = true; m.userData.kind = kind; }
    m.visible = true; if (pos) m.position.copy(pos);
  }

  // ------------------------------------------------------------------ arrival (RegionMode.start): the inn after a knock-out, the shrine by travel
  /** a knock-out in the zone: the hero wakes at the inn, and its keeper fusses (like Rosie at home) */
  wakeAtInn() {
    const G = this.G, b = this.buildings.find(x => x.kind === 'inn'), v = b && this.villager(b.keeper);
    if (G.dungeon !== this.mode || !G.ui?.dialogue) return;
    G.ui.dialogue({ speaker: v?.name || b?.name || 'The inn', portrait: v ? G.portrait?.(v.id) : null, voice: v?.spec?.voice, lines: wakeLines(this, b?.keeper) });
  }
  arrival(o = {}) {
    if (!this.saved) return null;
    const b = this.buildings.find(x => x.kind === (o.respawn ? 'inn' : 'waypoint'));
    if (!b) return null;
    const off = b.kind === 'inn' ? 1.1 : 0.4, f = this.local(b, b.info.door[0], b.info.door[1] + off);
    return V3(f.x, this.h0, f.z);
  }
  dispose() {
    this.emitSaved(); // (left before the banner: the event still goes out)
    for (const v of this.villagers) { try { v.dispose(); } catch (e) { /* the scene teardown frees the rest */ } }
    this.villagers.length = 0;
    if (this.crew) { this.crew.dispose(); this.crew = null; }
  }
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
void lerp;

// villagers rescued in the zone's dungeon (phase C emits 'villager:rescued' with a dungeon): from then on they live in
// their village (presentIds); a captive freed from a siege cage is recorded by freeCage itself
Events.on('villager:rescued', e => {
  const n = ZONE_NPCS[e?.npc], st = globalThis.G?.state;
  if (!n?.rescue || !e.dungeon || !st) return;
  const Z = zoneOf(st, n.zone); Z.quests.rescued ||= [];
  if (!Z.quests.rescued.includes(n.id)) Z.quests.rescued.push(n.id);
});
