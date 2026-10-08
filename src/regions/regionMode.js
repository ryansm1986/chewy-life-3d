// RegionMode: one visit to an outdoor region (docs/REGIONS.md §1, §3). A DungeonMode underneath — monsters, flow-field
// chasing, boss intro / framing / victory, loot, chests and shrines all run unchanged — with an open-air world
// (RegionWorld), a region layout (layoutGen) and the region's own flow: arrival at the Wayfarer's Stone, camps whose
// level rises toward the boss, the boss unlocking the next region.
// Game code sees G.mode === 'dungeon' ("a combat world") and G.dungeon.isRegion === true (G.dungeon.kind === 'region';
// zoneId = the region id: the regions are the zones, docs/ZONES.md).
import * as THREE from 'three';
import { DungeonMode } from '../dungeon/dungeonMode.js';
import { Monster } from '../dungeon/monster.js';
import { MONSTERS } from '../dungeon/monsters.js';
import './monsters/index.js'; // registers the region monsters + bosses
import { GroundLoot } from '../combat/groundLoot.js';
import { REGIONS, REGION_IDS, regionState, regionLevel } from './index.js';
import { generateRegion } from './layoutGen.js';
import { RegionWorld } from './regionWorld.js';
import { RNG, TAU, rand } from '../core/util.js';
import { Events } from '../core/events.js';
import { packMods, monsterMods } from '../rpg/zoneMods.js';
import { ZoneVillage } from './village/village.js'; // the zone's village: hub, siege, villagers, quests (docs/ZONES.md §2)
import { installGate } from './dungeonGate.js'; // the zone dungeon's gate at the trail's end (its boss moved inside: docs/ZONES.md §8.2)

export class RegionMode extends DungeonMode {
  constructor(G, id) {
    super(G);
    this.regionId = id; this.region = REGIONS[id]; this.isRegion = true;
    this.kind = 'region'; this.zoneId = id; this.def = null; this.tier = 0; this.mods = []; // (DungeonMode's where() / hasDeeper())
  }
  /** the monsters this visit can field: the region's own where they exist, Burrow stand-ins otherwise */
  roster() {
    const d = this.region, own = d.monsters.filter(id => MONSTERS[id]);
    return own.length ? own : d.fallback.monsters.filter(id => MONSTERS[id]);
  }
  bossId() { const d = this.region; return MONSTERS[d.boss] ? d.boss : d.fallback.boss; }
  build() {
    const G = this.G, def = this.region, R = regionState(G.state);
    const visit = R.visits[def.id] = (R.visits[def.id] || 0) + 1;
    this.visit = visit; this.floor = 0;
    const heroLvl = G.state.player?.lvl || 1;
    const layout = this.layout = generateRegion(def, { visit, mlvl: regionLevel(def, heroLvl) });
    layout.boss = this.bossId();
    for (const sp of layout.spawns) if (sp.boss) sp.boss = layout.boss;
    this.village = ZoneVillage.for(this); // (sets layout.hooks: the village's static pieces go in while the world builds)
    const world = this.world = new RegionWorld(G.engine, layout, def);
    // the bits of a Burrow theme that DungeonMode / the game read
    this.theme = { name: def.name, monsters: this.roster(), grade: def.mood?.grade, wall: ['#6a5a4a'], light: '#ffd8a8', accent: def.color };
    this.monsters = [];
    this.loot = new GroundLoot(G, world);
    this.rng = new RNG(visit * 977 + REGION_IDS.indexOf(def.id) * 131 + 7);
    this.flow = new Int16Array(layout.W * layout.H); this.flowT = 0;
    this.buildInteractables();
    this.village?.attach(world); // (overlays, cages, villagers, the buildings' doors, mode.villagePos)
    this.gate = installGate(this); // (no outdoor boss in a gated zone; mode.gatePos)
    return world;
  }
  start() {
    const G = this.G, L = this.layout, def = this.region;
    this.startPos = this.world.cellToWorld(L.start.x, L.start.y);
    // a saved village: travel arrives at its Waypoint Shrine, a knock-out wakes at its inn (G.zoneRespawn in game.js)
    const arrive = G._zoneArrive?.zone === this.regionId ? G._zoneArrive : {}; G._zoneArrive = null;
    const vp = this.village?.arrival(arrive); if (vp) { this.campAnchor = this.startPos; this.startPos = vp; } // (the cooking campfire stays by the Wayfarer's Stone)
    if (arrive.gate && this.gate) this.startPos = this.gate.arrival.clone(); // (back out of the zone dungeon: in front of its gate)
    for (const sp of L.spawns) this.spawnPack(sp);
    this.village?.start(arrive); // (the siege camps and the captain)
    // dusk / night regions: a warm lantern glow follows the hero (daylight regions don't need it). Hung 4 m up like the
    // Burrow's (dungeonMode.js, ROADMAP R-9) and softer than it: at 1.8 m and 5 it turned Foosy's emerald mint in the
    // Onsen, and over snow anything past ~4 lifts the white ground over the bloom threshold, which washes the hero again
    if ((def.mood?.night || 0) > 0.3) this.playerLight = this.world.lightPool.addSource({ pos: new THREE.Vector3(), color: new THREE.Color('#ffd8a8'), intensity: 3.5, radius: 9, priority: 10, lift: 4 });
    G.ui?.banner?.(def.name, `${def.jp} · Lv ${def.levels[0]}–${def.levels[1]}`, { style: 'area' });
    const b = MONSTERS[L.boss];
    if (b) setTimeout(() => { if (G.dungeon === this && this.boss?.alive && !this.boss.introDone) G.ui?.toast?.(`${b.name} waits at the end of the trail…`, { icon: 'oni', color: '#ff8a9a' }); }, 3200);
    this.world.applyMood(G);
  }
  // camps carry their own level (rising toward the boss); packs mix the region's monsters
  spawnPack(sp) {
    sp = packMods(this, sp); // (zone modifiers: phase E, rpg/zoneMods.js)
    const lvl = sp.lvl ?? this.layout.mlvl, c = this.world.cellToWorld(sp.x, sp.y);
    if (sp.boss) {
      const b = monsterMods(this, new Monster(this, sp.boss, { level: lvl, x: c.x, z: c.z, rng: () => this.rng.next() }));
      this.monsters.push(b); this.combat.add(b); this.boss = b;
      return;
    }
    // camp kinds rotate through the roster (from a random start each visit) so a visit never ends up all one kind
    const kinds = this.theme.monsters;
    if (this._packN == null) this._packN = this.rng.int(0, kinds.length - 1);
    const kind = kinds[this._packN++ % kinds.length], variant = this.rng.int(0, 3);
    let leader = null;
    if (sp.rank !== 'normal') { leader = monsterMods(this, new Monster(this, kind, { level: lvl, rank: sp.rank, variant, x: c.x, z: c.z, rng: () => this.rng.next() })); this.monsters.push(leader); this.combat.add(leader); }
    const n = Math.max(1, Math.round(sp.count * (MONSTERS[kind].pack || 1)));
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + rand(0, 0.5), r = rand(0.8, 2.2);
      let x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (!this.world.walkable(x, z)) { x = c.x; z = c.z; }
      // a mixed pack: mostly the camp's kind, now and then a neighbour from the same region
      const k2 = kinds.length > 1 && this.rng.chance(0.25) ? this.rng.pick(kinds) : kind;
      const m = new Monster(this, k2, { level: lvl, rank: 'normal', variant: sp.rank === 'champion' ? variant : this.rng.int(0, 3), x, z, leader, rng: () => this.rng.next() });
      if (sp.rank === 'champion') { m.rank = 'champion'; m.lifeMax = m.life = Math.round(m.life * 2); m.name = leader.name; m.eliteColor = '#6aa8ff'; }
      monsterMods(this, m);
      this.monsters.push(m); this.combat.add(m);
    }
  }
  buildInteractables() {
    super.buildInteractables(); // exit portal by the start, chests, shrines (no stairs / waypoints in a region)
    const G = this.G, W = this.world, inter = W.interactables;
    // the portal by the start is the Wayfarer's Stone: home, or on to another open region
    const exit = inter.find(it => it.label === 'Return to Blossom Hollow');
    if (exit) { exit.label = "Touch the Wayfarer's Stone"; exit.onInteract = () => (G.openTravel ? G.openTravel({ from: this.regionId }) : G.returnToVillage()); }
    this.region.interactables?.({ G, mode: this, world: W, layout: this.layout, add: it => inter.push(it) });
  }
  update(dt, t) { super.update(dt, t); this.village?.update(dt, t); }
  onBossDefeated(b, xp = 0) {
    if (b.siegeCaptain && this.village) return this.village.captainDefeated(b, xp); // (the village's captain: it saves the village)
    super.onBossDefeated(b, xp); // victory beat + a return portal where it fell (DungeonMode skips the stairs in regions)
    const G = this.G, R = regionState(G.state), id = this.regionId;
    R.cleared[id] = (R.cleared[id] || 0) + 1;
    const next = REGION_IDS.find(k => REGIONS[k].unlock?.after === id);
    if (next && !R.unlocked[next]) {
      R.unlocked[next] = true;
      setTimeout(() => G.ui?.toast?.(`New region on the Travel Map: ${REGIONS[next].name}!`, { icon: 'map', color: REGIONS[next].color }), 4200);
    }
    Events.emit('region:cleared', { id, times: R.cleared[id] });
    // the zone's climax today (until phase C moves this boss into the zone dungeon): its count is zones[id].regionBoss
    Events.emit('dungeon:cleared', { id, kind: 'region', tier: 0, floor: 0, zone: id, boss: b.id, first: R.cleared[id] === 1 });
    G.save?.();
  }
  dispose() { this.village?.dispose(); super.dispose(); this.world.dispose?.(); }
}
