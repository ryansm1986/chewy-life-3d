// The zone dungeon run (docs/ZONES.md §4, §8.2 as built; ROADMAP Z-C2 to Z-C4). A DungeonMode of kind 'zone' owns one
// (mode.zr) and hands it the parts of a floor the Burrow doesn't have:
//  - packs (Z-C3): every pack is a cluster formation (zoneGen's spawn.r: a filled disc 4–8 m wide, sometimes two
//    clumps), mostly the camp's kind with a quarter mixed in; normal members are lighter (DENSITY.life / dmg) and pay
//    less per kill (DENSITY.xp, the drop thinning), so a floor of ~140 clears fast without flooding the ground;
//    champion packs are 3 champions with their fodder, a unique pack a named leader with its own.
//  - objectives (phase D's interface, docs/ZONES.md §8.2): at build, G.story.dungeonObjectives({ dungeon, floor, zone,
//    tier }) → [{ kind: 'cage', npc, label } | { kind: 'drop', item, label, from: 'champion' | 'unique' | 'chest' }].
//    A cage stands in an objective slot (zoneGen) with a captured villager (G.zoneNpcBuilder(npc), else a kit
//    villager); F opens it once its guard pack is dead → 'villager:rescued' { npc, zone, dungeon, floor }. A drop is a
//    guaranteed quest item on the marked pack's leader (or the marked chest) → a 'quest' ground drop; picking it up
//    emits 'quest:find' { item, n, zone, dungeon, floor } (combat/groundLoot.js) and it never enters the bag.
//    mode.questMark(step) → where the step's cage / marked pack / dropped item is (the quest pointer).
//  - the arena (floor 2): crossing into the ring lights the lanterns round it one by one and wakes the boss (its
//    intro); the seal (a curtain of light and paper charms) rises across the mouth until the boss falls.
//  - the way out: the portals lead back to the zone outdoors, in front of its gate (G._zoneArrive = { zone, gate: true }).
//  - the first clear (Z-C4): a treasure chest rises where the boss fell (the zone's boss unique + a guaranteed rare),
//    a banner, and the next zone opens on the Travel Map (rpg/zoneProgress.js zoneUnlockOnClear).
import * as THREE from 'three';
import { Monster } from './monster.js';
import { MONSTERS } from './monsters.js';
import { monsterMods } from '../rpg/zoneMods.js';
import { zoneUnlockOnClear, ZONE_UNIQUE } from '../rpg/zoneProgress.js';
import { makeUnique, generateItem } from '../rpg/items.js';
import { REGIONS } from '../regions/index.js';
import { buildHumanoid } from '../actors/charKit.js';
import { randomVillagerSpec } from '../actors/roster.js';
import { Animator } from '../actors/animator.js';
import { makeToon } from '../gfx/materials.js';
import { glowTexture } from '../gfx/textures.js';
import { tube } from '../gfx/geom.js';
import { Events } from '../core/events.js';
import { RNG, TAU, rand, clamp, mulberry32 } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
/** pack tuning for the density (ZONES §4, ROADMAP Z-C3): normal members' life / damage / xp, champions' life */
export const DENSITY = { life: 0.7, dmg: 0.85, xp: 0.42, champLife: 1.6, champXp: 0.8, keep: 0.4, coinMul: 1.5 };

export class ZoneRun {
  constructor(mode) {
    this.mode = mode; this.G = mode.G; this.def = mode.def; this.L = mode.layout;
    this.zone = mode.zoneId; this.region = REGIONS[this.zone] || null;
    this.packs = []; this.cages = []; this.drops = []; this.packN = null;
    this.rng = new RNG(mode.run.packSeed * 7 + 11);
    this.objectives = [];
  }
  get where() { return { zone: this.zone, dungeon: this.def.id, floor: this.mode.floor, tier: this.mode.tier || 0 }; }
  /** the zone outdoors: where both portals lead */
  exit() {
    const G = this.G, z = this.zone, name = this.region?.name || 'the zone';
    return { label: `Return to the ${name.replace(/^The /, '')}`, go: () => { G._zoneArrive = { zone: z, gate: true }; if (G.enterRegion) G.enterRegion(z); else G.returnToVillage(); } }; // (RegionMode.start puts the hero at the gate)
  }
  // ------------------------------------------------------------------ build: objectives, cages, the arena seal
  build() {
    const G = this.G, M = this.mode, L = this.L, W = M.world;
    let list = [];
    try { list = G.story?.dungeonObjectives?.({ dungeon: this.def.id, floor: M.floor, zone: this.zone, tier: M.tier || 0 }) || []; }
    catch (e) { console.warn('[zone] dungeonObjectives failed', e); }
    if (!Array.isArray(list)) list = [];
    const slots = (L.slots || []).slice();
    for (const o of list) {
      if (!o || typeof o !== 'object') continue;
      if (o.kind === 'cage') {
        const s = slots.shift() || this.spareSlot();
        if (!s) { console.warn('[zone] no room for cage', o.npc); continue; }
        this.cages.push(this.makeCage(o, s));
      } else if (o.kind === 'drop' && o.item) {
        const rec = { kind: 'drop', item: o.item, label: o.label || 'A quest item', n: Math.max(1, Math.floor(+o.n || 1)), from: o.from || 'champion', taken: false, dropped: null }; // (n: how many the step still needs; one pickup carries them all)
        if (rec.from === 'chest') { rec.chest = L.chests.find(c => c.mark && !c.quest) || L.chests.find(c => !c.quest) || null; if (rec.chest) rec.chest.quest = rec; }
        else { rec.sp = L.spawns.find(s => s.mark === rec.from && !s.quest) || L.spawns.find(s => !s.boss && s.rank !== 'normal' && !s.quest) || null; if (rec.sp) rec.sp.quest = rec; }
        if (!rec.chest && !rec.sp) { console.warn('[zone] no holder for drop', o.item); continue; }
        this.drops.push(rec);
      }
      this.objectives.push(o);
    }
    if (L.boss) M.warmMonsters?.([...(MONSTERS[L.boss]?.adds || ['karasuKozo']), ...(this.def.monsters || []), this.def.tank].filter(id => MONSTERS[id])); // (the boss's adds: def.adds)
    if (L.arenaMouth) this.makeSeal();
  }
  spareSlot() { // a cage spot in any camp chamber (more cages than slots)
    const L = this.L, W = this.mode.world;
    for (const rm of L.rooms) {
      if (rm.kind !== 'camp') continue;
      for (let t = 0; t < 40; t++) {
        const x = rm.x + 1 + Math.floor(this.rng.next() * (rm.w - 2)), y = rm.y + 1 + Math.floor(this.rng.next() * (rm.h - 2)), p = W.cellToWorld(x, y);
        if (W.walkable(p.x, p.z) && !W.collision.solidAt(p.x, p.z, 0.9) && !W.keepClear(p.x, p.z)) {
          const g = L.spawns.filter(s => s.room === rm.id && !s.boss).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
          return { room: rm.id, x, y, guard: g ? L.spawns.indexOf(g) : -1 };
        }
      }
    }
    return null;
  }
  // ------------------------------------------------------------------ packs (cluster formations)
  spawnPack(sp) {
    const M = this.mode, L = this.L, G = this.G, lvl = L.mlvl, c = M.world.cellToWorld(sp.x, sp.y), kinds = M.theme.monsters;
    if (this.packN == null) this.packN = this.rng.int(0, kinds.length - 1);
    const main = kinds[this.packN++ % kinds.length], alt = kinds.length > 1 ? kinds[(kinds.indexOf(main) + 1 + this.rng.int(0, kinds.length - 2)) % kinds.length] : main;
    const pack = { sp, members: [], leader: null, index: L.spawns.indexOf(sp) };
    this.packs.push(pack);
    const add = (id, o) => { const m = monsterMods(M, new Monster(M, id, { level: lvl, rng: () => M.rng.next(), ...o })); m._pack = pack; M.monsters.push(m); M.combat.add(m); pack.members.push(m); return m; };
    // (a floor shows two variants of each kind, not all three: every variant x part is its own instanced batch, so this
    // keeps a zone fight's draw calls near the Burrow's; packs still differ, the third variant turns up on other floors)
    const varsOf = id => { const nv = MONSTERS[id]?.variants?.length || 1; if (nv <= 2) return [...Array(nv).keys()]; const F = (this.floorVars ||= {}); return (F[id] ||= [0, 1 + this.rng.int(0, nv - 2)]); };
    const pickVar = (id, prefer = null) => { const vs = varsOf(id); return prefer != null && vs.includes(prefer) && this.rng.chance(0.8) ? prefer : vs[this.rng.int(0, vs.length - 1)]; };
    const variant = pickVar(main);
    if (sp.rank !== 'normal') { pack.leader = add(main, { rank: sp.rank, variant, x: c.x, z: c.z }); }
    // the formation: a jittered sunflower disc of radius sp.r, or (40%) two clumps either side of the centre
    const n = Math.max(1, Math.min(16 - (pack.leader ? 1 : 0), Math.round(sp.count * (1 + ((MONSTERS[main].pack || 1) - 1) * 0.5)))), /* (a kind's pack factor at half strength: big kinds come fewer, the floor keeps its density) */ R = sp.r || 2.6, rot = this.rng.next() * TAU; // (ZONES §4: packs of 8–16)
    const two = n >= 9 && this.rng.chance(0.4), ax = Math.cos(rot), az = Math.sin(rot);
    const pts = [];
    for (let i = 0; i < n; i++) {
      let x, z;
      if (two) { const side = i % 2 ? 1 : -1, k = Math.floor(i / 2), m2 = Math.ceil(n / 2), rr = R * 0.55 * Math.sqrt((k + 0.5) / m2), a = k * 2.39996 + rot; x = c.x + ax * side * R * 0.42 + Math.cos(a) * rr; z = c.z + az * side * R * 0.42 + Math.sin(a) * rr; } // (two clumps span ~1.9 R: a pack stays 4–8 m wide)
      else { const rr = R * Math.sqrt((i + 0.5) / n), a = i * 2.39996 + rot; x = c.x + Math.cos(a) * rr; z = c.z + Math.sin(a) * rr; }
      x += (this.rng.next() - 0.5) * 0.5; z += (this.rng.next() - 0.5) * 0.5;
      if (!M.world.walkable(x, z) || M.world.collision.solidAt(x, z, 0.25)) { x = c.x + (x - c.x) * 0.45; z = c.z + (z - c.z) * 0.45; if (!M.world.walkable(x, z)) { x = c.x + rand(-0.4, 0.4); z = c.z + rand(-0.4, 0.4); } }
      pts.push([x, z]);
    }
    let champs = sp.rank === 'champion' ? 3 : 0;
    const tank = MONSTERS[this.def.tank] ? this.def.tank : null; // (the dungeon-only monster: a slow tank sprinkled through the packs)
    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i];
      // (the big slow tank stands in the pack's inner part: its bulk would push the formation wide from the rim)
      const kind = tank && champs <= 0 && i < pts.length * 0.65 && this.rng.chance(0.16) ? tank : this.rng.chance(0.25) ? alt : main;
      const champ = champs-- > 0;
      const m = add(champ ? main : kind, { rank: 'normal', variant: champ ? variant : pickVar(kind, kind === main ? variant : null), x, z, leader: pack.leader });
      if (champ) { m.rank = 'champion'; m.lifeMax = m.life = Math.round(m.life * DENSITY.champLife); m.name = pack.leader?.name || m.name; m.eliteColor = '#6aa8ff'; m._xpMul = DENSITY.champXp; }
      else { m.lifeMax = m.life = Math.max(1, Math.round(m.life * DENSITY.life)); m.stats.dmg = m.stats.dmg.map(v => Math.max(1, Math.round(v * DENSITY.dmg))); m._xpMul = DENSITY.xp; m._thin = true; }
    }
    if (sp.quest) sp.quest.pack = pack;
    return pack;
  }
  // ------------------------------------------------------------------ kill pacing and quest drops (DungeonMode.onMonsterDeath)
  xpMul(m) { return m._xpMul ?? 1; }
  /** thin a normal member's drops (keep a share; coins come in fewer, fuller piles) and add a carried quest item */
  filterDrops(m, drops) {
    if (m._thin) {
      for (let i = drops.length - 1; i >= 0; i--) { const d = drops[i]; if (d.type === 'gem' || d.type === 'furniture') continue; if (this.rng.next() > DENSITY.keep) drops.splice(i, 1); else if (d.type === 'coins') d.n = Math.round(d.n * DENSITY.coinMul); }
    }
    const q = m._pack?.sp?.quest;
    if (q && !q.dropped && (m === m._pack.leader || (!m._pack.leader && !m._pack.members.some(o => o.alive && o !== m)))) {
      q.dropped = true;
      drops.push({ type: 'quest', item: q.item, label: q.label, n: q.n || 1, where: this.where, quest: q });
    }
  }
  /** a marked chest's quest item (DungeonMode.makeChest) */
  chestDrops(chest) {
    const q = chest.rec?.quest; if (!q || q.dropped) return [];
    q.dropped = true; return [{ type: 'quest', item: q.item, label: q.label, n: q.n || 1, where: this.where, quest: q }];
  }
  /** a quest drop landed / was picked up (groundLoot) */
  onQuestLoot(d, e, taken) { const q = d.quest; if (!q) return; if (taken) { q.taken = true; q.ground = null; } else q.ground = e; }
  // ------------------------------------------------------------------ cages (phase D's rescues)
  makeCage(o, s) {
    const M = this.mode, W = M.world, G = this.G, p = W.cellToWorld(s.x, s.y);
    const g = new THREE.Group(); g.position.copy(p); g.rotation.y = Math.PI / 4 + (this.rng.next() - 0.5) * 0.4;
    const kit = W.kit?.seal || {}, mat = makeToon({ vertexColors: true, rim: 0.4, brush: 0.14 });
    // a bamboo cage: a slatted floor, eight bars lashed to two rings, a little roof, a padlock on the door
    const parts = [], bar = '#a8b868', node = '#6e8a48', dark = '#5a4a3a';
    const pole = (a, b, r, c = bar) => { const t = tube([{ p: a, r }, { p: b, r: r * 0.95 }], 6, false); paintC(t, c); parts.push(t); };
    const R = 0.62, H = 1.5;
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; pole(V(Math.cos(a) * R, 0, Math.sin(a) * R), V(Math.cos(a) * R, H, Math.sin(a) * R), 0.035); }
    for (const y of [0.08, 0.75, H - 0.05]) { const ring = []; for (let k = 0; k <= 20; k++) { const a = k / 20 * TAU; ring.push({ p: V(Math.cos(a) * (R + 0.02), y, Math.sin(a) * (R + 0.02)), r: 0.03 }); } const t = tube(ring, 5, false); paintC(t, y > 1 ? node : '#c8a868'); parts.push(t); }
    const roofG = new THREE.ConeGeometry(R + 0.22, 0.42, 10, 1); roofG.translate(0, H + 0.2, 0); paintC(roofG, '#8a6a44'); parts.push(roofG);
    const knob = new THREE.SphereGeometry(0.07, 8, 6); knob.translate(0, H + 0.44, 0); paintC(knob, '#e8b848'); parts.push(knob);
    const base = new THREE.CylinderGeometry(R + 0.06, R + 0.1, 0.1, 12); base.translate(0, 0.05, 0); paintC(base, dark); parts.push(base);
    const lock = new THREE.BoxGeometry(0.14, 0.16, 0.06); lock.translate(0, 0.78, R + 0.05); paintC(lock, '#d8b040'); parts.push(lock);
    const shackle = new THREE.TorusGeometry(0.05, 0.015, 4, 10, Math.PI); shackle.translate(0, 0.86, R + 0.05); paintC(shackle, '#8a8a90'); parts.push(shackle);
    const ofuda = new THREE.PlaneGeometry(0.12, 0.3); ofuda.translate(0.22, 1.05, R + 0.05); paintC(ofuda, '#fff6e0'); parts.push(ofuda);
    const geo = mergeGeos(parts);
    const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh);
    // the door: three bars on a hinge that swings open
    const doorG = []; for (let i = -1; i <= 1; i++) { const t = tube([{ p: V(i * 0.14, 0.05, 0), r: 0.035 }, { p: V(i * 0.14, H - 0.08, 0), r: 0.033 }], 6, false); paintC(t, '#b8c470'); doorG.push(t); }
    for (const y of [0.3, 1.1]) { const t = tube([{ p: V(-0.22, y, 0), r: 0.03 }, { p: V(0.22, y, 0), r: 0.03 }], 5, false); paintC(t, '#c8a868'); doorG.push(t); }
    const door = new THREE.Mesh(mergeGeos(doorG), mat); door.castShadow = true;
    const hinge = new THREE.Group(); hinge.position.set(-0.22, 0, R + 0.08); door.position.set(0.22, 0, 0); hinge.add(door); g.add(hinge);
    W.scene.add(g);
    W.collision.addCircle(p.x, p.z, R + 0.12);
    // the captive: phase D's villager builder, or a kit villager
    let rig = null; try { rig = G.zoneNpcBuilder?.(o.npc) || null; } catch (e) { console.warn('[zone] zoneNpcBuilder failed', e); }
    if (!rig) rig = buildHumanoid({ ...randomVillagerSpec(mulberry32((hash(o.npc || 'npc') + 7) >>> 0)) });
    rig.root.position.set(0, 0.1, 0); rig.root.rotation.y = 0; g.add(rig.root);
    rig.root.traverse(x => { if (x.isMesh) x.castShadow = true; });
    const anim = new Animator(rig);
    const name = o.label || o.npc || 'a villager';
    const cage = { kind: 'cage', npc: o.npc, label: name, pos: p.clone(), group: g, door: hinge, rig, anim, open: false, t: 0, guard: s.guard ?? -1, slot: s, waveT: 2 + rand(0, 2) };
    // the "!" bubble over it while locked, a soft light
    cage.light = W.lightPool.addSource({ pos: V(p.x, 1.6, p.z), color: new THREE.Color(kit.color || '#ffe8a0'), intensity: 3, radius: 4.5, flicker: 0.3 });
    const zr = this, it = { pos: p.clone(), radius: 1.4, get label() { return cage.open ? '' : zr.guarded(cage) ? `${name} is locked in (defeat the guards!)` : `Free ${name}`; }, onInteract: () => this.openCage(cage, it) };
    W.interactables.push(it); cage.it = it;
    return cage;
  }
  /** is the cage's guard pack (its slot's spawn) still standing? */
  guarded(c) { if (c.guard < 0) return false; const pk = this.packs.find(q => q.index === c.guard); return !!pk && pk.members.some(m => m.alive); }
  openCage(cage, it) {
    const G = this.G, W = this.mode.world;
    if (cage.open) return;
    if (this.guarded(cage)) { G.ui?.toast?.('The guards are still about! Clear them first.', { color: '#ffb0a0', icon: 'oni' }); Events.emit('sfx', 'ui_deny'); return; }
    cage.open = true; cage.t = 0;
    const i = W.interactables.indexOf(it); if (i >= 0) W.interactables.splice(i, 1);
    Events.emit('sfx', 'chest_open'); setTimeout(() => Events.emit('sfx', 'ui_quest'), 300);
    G.vfx?.sparkle?.(cage.pos.clone().setY(1.0), { n: 26, color: '#fff2b0', r: 0.8, rise: 1.4 });
    cage.anim.play('happy');
    G.ui?.toast?.(`${cage.label} is free! "Thank you, thank you!"`, { color: '#b8f08a', icon: 'heart' });
    Events.emit('villager:rescued', { npc: cage.npc, ...this.where });
  }
  // ------------------------------------------------------------------ the arena seal
  makeSeal() {
    const M = this.mode, W = M.world, A = this.L.arena, m = this.L.arenaMouth, kit = W.kit?.seal || {};
    const ux = (m.x - A.x), uz = (m.z - A.z), ul = Math.hypot(ux, uz) || 1, nx = ux / ul, nz = uz / ul, px = -nz, pz = nx;
    const cx = A.x + nx * (A.r + 0.7), cz = A.z + nz * (A.r + 0.7);
    // how wide the opening is here: walk out along the line until rock
    let half = 0.5; while (half < 6 && W.walkable(cx + px * half, cz + pz * half) && W.walkable(cx - px * half, cz - pz * half)) half += 0.25;
    const w = half * 2 + 0.6, h = 3.2, c = new THREE.Color(kit.color || '#d6ff9a');
    const mat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uK: { value: 0 }, uC: { value: c } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      vertexShader: 'varying vec2 vU; void main() { vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`uniform float uT, uK; uniform vec3 uC; varying vec2 vU;
        float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          float y = vU.y, x = vU.x;
          float side = smoothstep(0.0, 0.08, x) * smoothstep(1.0, 0.92, x);
          float top = smoothstep(uK, uK - 0.18, y);
          float bands = 0.55 + 0.45 * sin(y * 18.0 - uT * 3.0 + sin(x * 9.0 + uT) * 1.2);
          vec2 g = vec2(x * 22.0, y * 8.0 - uT * 0.8); vec2 gi = floor(g); float sp = step(0.86, h1(gi)) * smoothstep(0.35, 0.0, length(fract(g) - 0.5));
          float a = side * top * (0.18 + 0.22 * bands * (1.0 - y)) + sp * side * top * 0.9;
          gl_FragColor = vec4(uC * a * 0.8, 0.0);
        }`,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    plane.position.set(cx, h / 2, cz); plane.rotation.y = Math.atan2(px, pz) - Math.PI / 2; plane.renderOrder = 9; plane.visible = false;
    W.scene.add(plane);
    // the rope across the top, hung with shide (shown with the curtain)
    const rope = []; for (let k = 0; k <= 16; k++) { const t = k / 16 - 0.5; rope.push({ p: V(cx + px * t * w, h - 0.2 - Math.cos(t * Math.PI) * 0.35 + 0.35, cz + pz * t * w), r: 0.06 }); }
    const rg = tube(rope, 6, false); paintC(rg, kit.rope || '#ecd8a0');
    const ropeM = new THREE.Mesh(rg, makeToon({ vertexColors: true, rim: 0.3 })); ropeM.visible = false; W.scene.add(ropeM);
    this.seal = { plane, rope: ropeM, mat, cx, cz, px, pz, half, k: 0, want: 0, cols: [] };
  }
  setSeal(on) {
    const S = this.seal; if (!S) return;
    S.want = on ? 1 : 0;
    const C = this.mode.world.collision;
    if (on && !S.cols.length) for (let t = -S.half - 0.3; t <= S.half + 0.3; t += 0.45) S.cols.push(C.addCircle(S.cx + S.px * t, S.cz + S.pz * t, 0.42));
    if (!on) { for (const o of S.cols) C.remove(o); S.cols.length = 0; }
  }
  // ------------------------------------------------------------------ per frame
  update(dt, t) {
    const G = this.G, M = this.mode, P = G.player;
    for (const c of this.cages) this.updateCage(c, dt, P);
    const S = this.seal;
    if (S) {
      S.k += (S.want - S.k) * Math.min(1, dt * (S.want ? 2.2 : 1.4));
      S.mat.uniforms.uK.value = S.k * 1.15; S.mat.uniforms.uT.value = t;
      S.plane.visible = S.rope.visible = S.k > 0.01;
      S.rope.position.y = (1 - S.k) * 3.4;
      if (S.want && Math.random() < dt * 6 * S.k) G.vfx?.spark?.spawn?.({ x: S.cx + S.px * rand(-S.half, S.half), y: rand(0.2, 3), z: S.cz + S.pz * rand(-S.half, S.half), vy: 0.6, life: 1, size: 0.18, color: '#eaffc0', alpha: 0.9, alpha1: 0 });
    }
    // the arena: the hero steps into the ring → the lanterns flare one by one, the seal rises, the boss wakes
    const A = this.L.arena, b = M.boss;
    if (A && b?.alive && !this.arenaOn && P && !G.playerDead && Math.hypot(P.pos.x - A.x, P.pos.z - A.z) < A.r - 2.2) this.enterArena(b);
    if (this.arenaOn && (!b || !b.alive) && S?.want) this.setSeal(false);
  }
  enterArena(b) {
    const G = this.G, W = this.mode.world; this.arenaOn = true;
    this.setSeal(true);
    Events.emit('sfx', 'portal');
    const lan = W.arenaLanterns || [];
    lan.forEach((p, i) => setTimeout(() => { if (G.dungeon !== this.mode) return; G.vfx?.light?.(p.clone().setY(1.3), '#ffd08a', 7, 6, 0.8); G.vfx?.sparkle?.(p.clone().setY(1.0), { n: 8, color: '#ffe0a0', r: 0.3, rise: 1 }); }, 120 + i * 90));
    setTimeout(() => { if (G.dungeon === this.mode && b.alive && !b.introDone) b.alert(); }, 120 + lan.length * 90 + 150);
  }
  updateCage(c, dt, P) {
    c.anim.update(dt, c.pos);
    if (c.open) {
      c.t += dt;
      c.door.rotation.y = -Math.min(1.9, c.t * 5);
      if (c.t > 1.4 && !c.left) { // hops out and heads home (a sparkle: phase D's villager walks back in the village)
        c.left = true; const p = c.pos.clone(); c.rig.root.position.set(0, 0.1, 1.1);
        setTimeout(() => { if (this.G.dungeon !== this.mode) return; this.G.vfx?.sparkle?.(p.clone().add(V(0, 0.9, 0)), { n: 20, color: '#fff6c8', r: 0.6, rise: 1.6 }); this.G.vfx?.poof?.(p.clone().setY(0.6), { color: '#fff4fa', n: 8, size: 0.5 }); c.rig.root.visible = false; }, 1300);
      }
      if (c.light && c.t > 2.5) { this.mode.world.lightPool.removeSource(c.light); c.light = null; }
      return;
    }
    if (P) { // locked: faces the hero, waves when they come close, a "!" now and then
      const dx = P.pos.x - c.pos.x, dz = P.pos.z - c.pos.z, d = Math.hypot(dx, dz);
      c.rig.root.rotation.y = Math.atan2(dx, dz) - c.group.rotation.y;
      c.waveT -= dt;
      if (c.waveT <= 0 && d < 14) { c.waveT = rand(2.6, 4.2); c.anim.play('wave'); if (Math.random() < 0.5) this.G.vfx?.emote?.({ pos: c.pos, rig: { height: 1.6 } }, this.guarded(c) ? '!' : 'heart', 1.1); }
    }
  }
  // ------------------------------------------------------------------ the quest pointer (Story.placeFor → mode.questMark)
  questMark(step) {
    if (!step) return null;
    if (step.type === 'rescue') { const c = this.cages.find(q => !q.open && (!step.npc || q.npc === step.npc)); return c ? c.pos : null; }
    if (step.type === 'find') {
      const q = this.drops.find(d => d.item === step.item && !d.taken); if (!q) return null;
      if (q.ground) return q.ground.to;
      const ld = q.pack?.leader || q.pack?.members?.find(m => m.alive);
      if (ld?.alive) return ld.pos;
      if (q.chest) return this.mode.world.cellToWorld(q.chest.x, q.chest.y);
      return null;
    }
    return null;
  }
  // ------------------------------------------------------------------ the boss falls (DungeonMode.onBossDefeated)
  onBossDefeated(b, clear) {
    const G = this.G, M = this.mode, z = this.zone;
    this.setSeal(false);
    if (!clear?.first) return;
    // the first clear: a treasure chest rises by the fallen boss, the zone opens on, a banner
    const p = M.openSpotNear(b.pos.clone(), 3.2, 1.2);
    setTimeout(() => {
      if (G.dungeon !== M) return;
      const chest = M.makeChest(p, 'gold');
      chest.firstClear = { zone: z, boss: b.id };
      G.vfx?.pillar?.(p, { color: '#ffe070', life: 1.6, r: 1.0, h: 7 }); G.vfx?.sparkle?.(p.clone().setY(1), { n: 30, color: '#fff2a0', r: 1 });
      M.world.interactables.push({ pos: p, radius: 1.3, label: 'Open the treasure chest', onInteract() { if (chest.opened) return; chest.open(); M.world.interactables.splice(M.world.interactables.indexOf(this), 1); } });
      M.world.collision.addCircle(p.x, p.z, 0.5);
    }, 2300);
    const opened = zoneUnlockOnClear(G.state, z);
    setTimeout(() => {
      if (G.dungeon !== M) return;
      G.ui?.banner?.(`${this.def.name} cleared!`, opened ? `${REGIONS[opened]?.name || 'A new zone'} is open on the Travel Map` : 'A treasure chest appears…', { style: 'quest' });
      if (opened) G.ui?.toast?.(`New zone on the Travel Map: ${REGIONS[opened]?.name}!`, { icon: 'map', color: REGIONS[opened]?.color || '#8fd0ff' });
    }, 4300);
  }
  /** the first-clear chest's contents: the zone's boss unique and a guaranteed rare on top of a golden chest */
  firstClearDrops(chest) {
    const fc = chest.firstClear; if (!fc) return [];
    const lvl = this.L.mlvl + 2, out = [];
    const uid = ZONE_UNIQUE[fc.zone];
    if (uid) { try { out.push({ type: 'item', item: makeUnique(uid, lvl) }); } catch (e) { console.warn('[zone] unique', e); } }
    out.push({ type: 'item', item: generateItem({ ilvl: lvl, rarity: 'rare' }) });
    return out;
  }
  dispose() {
    for (const c of this.cages) { try { c.rig.root.removeFromParent(); c.rig.dispose?.(); } catch (e) { /* rig gone */ } }
    this.cages.length = 0;
  }
}
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function paintC(g, hex) { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
function mergeGeos(list) {
  const ng = list.map(g => { const q = g.index ? g.toNonIndexed() : g; if (!q.attributes.normal) q.computeVertexNormals(); return q; });
  let n = 0; for (const g of ng) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3); let o = 0;
  for (const g of ng) { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); C.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3)); out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  return out;
}
