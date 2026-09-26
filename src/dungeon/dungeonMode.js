// Runs one Burrow floor: world + monsters + combat + loot + interactables + flow-field pathing.
import * as THREE from 'three';
import { generate, CELL, THEMES } from './gen.js';
import { DungeonWorld } from './dungeonWorld.js';
import { Monster } from './monster.js';
import { MONSTERS } from './monsters.js';
import { GroundLoot } from '../combat/groundLoot.js';
import { rollDrops, chestDrops } from '../rpg/loot.js';
import { xpForKill } from '../rpg/stats.js';
import { makeToon, makeOutline } from '../gfx/materials.js';
import { paint, merge, RoundedBox } from '../gfx/geom.js';
import { glowTexture } from '../gfx/textures.js';
import { Events } from '../core/events.js';
import { rand, randInt, TAU, dist, RNG, clamp, pick } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class DungeonMode {
  constructor(G) { this.G = G; this.monsters = []; }
  build(floor) {
    const G = this.G;
    this.floor = floor;
    const layout = this.layout = generate({ floor, seed: (G.state.dungeon.seed || 1) + floor * 17 + (G.state.dungeon.runs || 0) * 101 });
    const world = this.world = new DungeonWorld(G.engine, layout);
    this.theme = THEMES[layout.theme];
    this.monsters = [];
    this.loot = new GroundLoot(G, world);
    this.rng = new RNG(floor * 999 + (G.state.dungeon.runs || 0));
    this.flow = new Int16Array(layout.W * layout.H); this.flowT = 0;
    this.buildInteractables();
    return world;
  }
  get combat() { return this.G.combat; }
  start() {
    const G = this.G, L = this.layout;
    const s = this.world.cellToWorld(L.start.x, L.start.y);
    this.startPos = s;
    // monsters
    for (const sp of L.spawns) this.spawnPack(sp);
    // player light (warm lantern glow that follows Chewy)
    this.playerLight = this.world.lightPool.addSource({ pos: new THREE.Vector3(), color: new THREE.Color('#ffd8a8'), intensity: 7, radius: 11, priority: 10 });
    G.ui?.banner?.(`Floor ${this.floor}`, `The Burrow — ${this.theme.name}`, { style: 'area' });
    if (L.boss) setTimeout(() => G.ui?.banner?.(MONSTERS[L.boss].name, 'awaits in the deepest chamber…', { style: 'boss' }), 2600);
    G.state.dungeon.deepest = Math.max(G.state.dungeon.deepest || 0, this.floor);
    // dungeon colour grade (the village day/night grade doesn't run down here)
    const post = G.engine.post, gr = post.grade.uniforms;
    gr.get('uLift').value.set(0.012, 0.004, 0.02); gr.get('uGain').value.set(1.05, 1.0, 0.95); gr.get('uSat').value = 1.1;
    gr.get('uVigColor').value.set(0.16, 0.1, 0.16); gr.get('uVignette').value = 1.25;
    post.bloom.intensity = 1.15; post.bloom.luminanceMaterial.threshold = 0.6;
  }
  spawnPack(sp) {
    const L = this.layout, G = this.G;
    const lvl = L.mlvl;
    const c = this.world.cellToWorld(sp.x, sp.y);
    if (sp.boss) {
      const b = new Monster(this, sp.boss, { level: lvl + 2, x: c.x, z: c.z, rng: () => this.rng.next() });
      this.monsters.push(b); this.combat.add(b); this.boss = b;
      return;
    }
    const kinds = this.theme.monsters;
    const kind = this.rng.pick(kinds);
    const variant = this.rng.int(0, 3);
    let leader = null;
    if (sp.rank !== 'normal') { leader = new Monster(this, kind, { level: lvl, rank: sp.rank, variant, x: c.x, z: c.z, rng: () => this.rng.next() }); this.monsters.push(leader); this.combat.add(leader); }
    const n = Math.round(sp.count * (MONSTERS[kind].pack || 1));
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + rand(0, 0.5), r = rand(0.8, 2.2);
      let x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (!this.world.walkable(x, z)) { x = c.x; z = c.z; }
      const m = new Monster(this, kind, { level: lvl, rank: 'normal', variant: sp.rank === 'champion' ? variant : this.rng.int(0, 3), x, z, leader, rng: () => this.rng.next() });
      if (sp.rank === 'champion') { m.rank = 'champion'; m.lifeMax = m.life = Math.round(m.life * 2); m.name = leader.name; m.eliteColor = '#6aa8ff'; }
      this.monsters.push(m); this.combat.add(m);
    }
  }
  bossIntro(b) {
    const G = this.G, E = G.engine, rig = E.rig;
    Events.emit('boss:spawn', { id: b.id, name: b.name, floor: this.floor });
    const prevDist = rig.distTarget;
    rig.distTarget = Math.max(rig.minDist, prevDist * 0.72);
    E.timeScale = 0.35;
    b.anim.wind = 1; b.anim.lunge = 1;
    G.vfx.ring(b.pos, { color: '#ff6a8a', r0: 0.5, r1: 7, life: 0.9 });
    G.vfx.dustRing(b.pos, 5, 26);
    rig.shake(0.9); E.post.pulse('#ff9ab0', 0.25); E.post.hitAberration(1);
    Events.emit('sfx', 'boss_roar'); G.audio?.music?.('boss', { fade: 0.5 });
    G.ui?.banner?.(b.name, ['The squishiest royal in the Burrow!', 'Rain or shine, he hops to fight!', 'Something smells delicious… and dangerous!', 'Nine tails, one very bad mood.'][[5, 10, 15, 20].indexOf(this.floor % 20 || 20)] || 'appears!', { style: 'boss' });
    setTimeout(() => { E.timeScale = 1; b.anim.wind = 0; }, 900);
    setTimeout(() => { rig.distTarget = prevDist; }, 2200);
  }
  summonAround(boss, id, n) {
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU; const x = boss.pos.x + Math.cos(a) * 2.5, z = boss.pos.z + Math.sin(a) * 2.5;
      if (!this.world.walkable(x, z)) continue;
      const m = new Monster(this, id, { level: this.layout.mlvl, x, z, rng: () => this.rng.next() }); m.aggro = true;
      this.monsters.push(m); this.combat.add(m);
      this.G.vfx.poof(V(x, 0.4, z), { color: '#e0d0ff', n: 10 });
    }
  }
  // ------------------------------------------------------------------ interactables
  buildInteractables() {
    const G = this.G, L = this.layout, W = this.world;
    const inter = W.interactables;
    // exit portal near the start
    const s = W.cellToWorld(L.start.x, L.start.y);
    const exitPos = s.clone().add(V(-1.6, 0, -1.6));
    this.makePortal(exitPos, '#b89aff');
    inter.push({ pos: exitPos, radius: 1.2, label: 'Return to Blossom Hollow', onInteract: () => G.returnToVillage() });
    // stairs down
    if (L.stairs) {
      const p = W.cellToWorld(L.stairs.x, L.stairs.y);
      this.makeStairs(p);
      inter.push({ pos: p, radius: 1.3, label: `Burrow deeper (Floor ${this.floor + 1})`, onInteract: () => G.enterDungeon(this.floor + 1) });
      this.stairsPos = p;
    }
    // waypoint
    if (L.waypoint) {
      const p = W.cellToWorld(L.waypoint.x, L.waypoint.y); this.makeWaypoint(p);
      const wps = G.state.dungeon.waypoints; if (!wps.includes(this.floor)) { wps.push(this.floor); setTimeout(() => G.ui?.toast?.(`Waypoint unlocked: Floor ${this.floor}`, { color: '#8fd0ff' }), 3000); }
    }
    // chests
    for (const c of L.chests) {
      const p = W.cellToWorld(c.x, c.y); const chest = this.makeChest(p, c.quality);
      const it = { pos: p, radius: 1.2, label: c.quality === 'gold' ? 'Open golden chest' : 'Open chest', onInteract: () => { if (chest.opened) return; chest.open(); inter.splice(inter.indexOf(it), 1); } };
      inter.push(it);
      W.collision.addCircle(p.x, p.z, 0.5);
    }
    // pots (breakable entities)
    this.pots = [];
    for (const c of L.pots) {
      const p = W.cellToWorld(c.x, c.y).add(V(rand(-0.4, 0.4), 0, rand(-0.4, 0.4)));
      this.pots.push(this.makePot(p));
    }
    // shrines
    for (const c of L.shrines) {
      const p = W.cellToWorld(c.x, c.y); const sh = this.makeShrine(p, c.type);
      const it = { pos: p, radius: 1.3, label: `Touch ${sh.name}`, onInteract: () => { if (sh.used) return; sh.use(); inter.splice(inter.indexOf(it), 1); } };
      inter.push(it); W.collision.addCircle(p.x, p.z, 0.45);
    }
  }
  makePortal(p, color) {
    const W = this.world;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.12, 10, 32), makeToon({ color: '#6a5a8a', rim: 0.5 })); ring.position.copy(p).setY(1.1); ring.castShadow = true;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.85, 32), new THREE.MeshBasicMaterial({ map: glowTexture(), color: new THREE.Color(color), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    disc.position.copy(ring.position);
    W.scene.add(ring, disc);
    W.lightPool.addSource({ pos: p.clone().setY(1.2), color: new THREE.Color(color), intensity: 6, radius: 6, flicker: 0.5 });
    (this.spinners ||= []).push((dt, t) => { disc.rotation.z += dt; disc.scale.setScalar(1 + Math.sin(t * 3) * 0.05); ring.lookAt(this.G.engine.camera.position.x, ring.position.y, this.G.engine.camera.position.z); disc.quaternion.copy(ring.quaternion); if (Math.random() < 0.4) this.G.vfx.spark.spawn({ x: p.x + rand(-0.6, 0.6), y: rand(0.4, 1.8), z: p.z + rand(-0.6, 0.6), vy: 0.8, life: 0.8, size: 0.2, color, alpha: 1, alpha1: 0 }); });
  }
  makeStairs(p) {
    const W = this.world;
    const hole = new THREE.Mesh(new THREE.CircleGeometry(1.0, 28), new THREE.MeshBasicMaterial({ color: '#0e0a14' })); hole.rotation.x = -Math.PI / 2; hole.position.copy(p).setY(0.03);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.18, 8, 28), makeToon({ color: this.theme.wall[0], rim: 0.3 })); rim.rotation.x = Math.PI / 2; rim.position.copy(p).setY(0.08); rim.castShadow = true;
    const ladder = new THREE.Group();
    for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), makeToon({ color: '#b07a4a' })); r.position.set(s * 0.25, 0.3, 0); ladder.add(r); }
    for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), makeToon({ color: '#c98f5e' })); r.rotation.z = Math.PI / 2; r.position.set(0, -0.3 + i * 0.35, 0); ladder.add(r); }
    ladder.position.copy(p).add(V(0, 0, -0.5)); ladder.rotation.x = -0.4;
    W.scene.add(hole, rim, ladder);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color('#8fd0ff'), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); glow.position.copy(p).setY(0.6); glow.scale.setScalar(2.2); W.scene.add(glow);
    W.lightPool.addSource({ pos: p.clone().setY(1), color: new THREE.Color('#8fd0ff'), intensity: 4, radius: 5 });
  }
  makeWaypoint(p) {
    const W = this.world, G = this.G;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.25, 0.2, 24), makeToon({ color: '#7a7890', rim: 0.3, brush: 0.3 })); base.position.copy(p).setY(0.1); base.receiveShadow = true;
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; const st = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.5 + (i % 2) * 0.3, 6), makeToon({ color: '#9a98b0', rim: 0.3 })); st.position.set(p.x + Math.cos(a) * 1.4, 0.25, p.z + Math.sin(a) * 1.4); st.castShadow = true; W.scene.add(st); }
    const rune = new THREE.Mesh(new THREE.CircleGeometry(0.8, 24), new THREE.MeshBasicMaterial({ map: glowTexture(), color: new THREE.Color('#8fd0ff'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); rune.rotation.x = -Math.PI / 2; rune.position.copy(p).setY(0.22);
    W.scene.add(base, rune);
    W.lightPool.addSource({ pos: p.clone().setY(0.8), color: new THREE.Color('#8fd0ff'), intensity: 5, radius: 6, flicker: 0.2 });
    W.interactables.push({ pos: p, radius: 1.4, label: 'Use Waypoint', onInteract: () => G.openWaypoints?.() });
    (this.spinners ||= []).push((dt, t) => { rune.material.opacity = 0.6 + Math.sin(t * 2) * 0.3; });
  }
  makeChest(p, quality) {
    const W = this.world, G = this.G;
    const gold = quality === 'gold';
    const body = new RoundedBox(0.9, 0.5, 0.6, 2, 0.08); body.translate(0, 0.25, 0); paint(body, (q, n, o) => { o.set(gold ? '#d8a040' : '#a0683a'); if (Math.abs(q.x) > 0.38) o.set(gold ? '#ffe070' : '#6a4a30'); });
    const lidG = new RoundedBox(0.92, 0.25, 0.62, 2, 0.1); lidG.translate(0, 0.12, 0.31); paint(lidG, (q, n, o) => { o.set(gold ? '#e8b050' : '#b07a4a'); if (Math.abs(q.x) > 0.38) o.set(gold ? '#ffe070' : '#6a4a30'); });
    const mat = makeToon({ vertexColors: true, rim: 0.5 });
    const g = new THREE.Group(); const b = new THREE.Mesh(body, mat); const lid = new THREE.Mesh(lidG, mat); lid.position.set(0, 0.5, -0.31);
    b.castShadow = lid.castShadow = true; g.add(b, lid); g.position.copy(p); g.rotation.y = rand(-0.5, 0.5) + Math.PI / 4;
    W.scene.add(g);
    const chest = { opened: false, open: () => {
      chest.opened = true; Events.emit('sfx', 'chest_open');
      let t = 0; (this.spinners ||= []).push((dt) => { t += dt; lid.rotation.x = -Math.min(1.9, t * 7); });
      G.vfx.sparkle(p.clone().setY(0.7), { n: 20, color: gold ? '#ffe070' : '#fff4d8', r: 0.5 }); G.vfx.light(p.clone().setY(1), '#ffe0a0', 10, 6, 0.8);
      const drops = chestDrops(this.layout.mlvl, gold ? 'golden' : 'plain', undefined, G.derived.mf || 0);
      setTimeout(() => this.loot.drop(p.clone().setY(0.5), drops), 250);
    } };
    return chest;
  }
  makePot(p) {
    const G = this.G, W = this.world;
    const g = new THREE.SphereGeometry(0.3, 12, 10); g.scale(1, 1.1, 1); g.translate(0, 0.32, 0);
    const colA = this.layout.theme === 'crystal' ? '#8a80b0' : '#b07a54';
    paint(g, (q, n, o) => { o.set(colA); if (q.y > 0.55) o.set('#6a4a3a'); if (Math.abs(q.y - 0.35) < 0.04) o.set('#e8d0a0'); });
    const mesh = new THREE.Mesh(g, makeToon({ vertexColors: true, rim: 0.4 })); mesh.position.copy(p); mesh.castShadow = true;
    const ol = new THREE.Mesh(g, makeOutline('#3a2230', 0.012)); mesh.add(ol);
    W.scene.add(mesh);
    const col = W.collision.addCircle(p.x, p.z, 0.3);
    const pot = { team: 'enemy', breakable: true, alive: true, pos: p.clone(), radius: 0.32, height: 0.6, life: 1, lifeMax: 1, stats: { def: 0, res: {}, level: 1 }, status: {}, name: 'Pot',
      takeDamage: () => {
        if (!pot.alive) return; pot.alive = false; this.combat.remove(pot); W.collision.remove(col); mesh.parent?.remove(mesh);
        G.vfx.poof(p.clone().setY(0.3), { color: '#e8d0b0', n: 8, size: 0.4 });
        for (let i = 0; i < 8; i++) G.vfx.dot.spawn({ x: p.x, y: 0.4, z: p.z, vx: rand(-3, 3), vy: rand(2, 4), vz: rand(-3, 3), life: 0.6, size: 0.12, color: colA, alpha: 1, alpha1: 1, grav: 12 });
        Events.emit('sfx', 'pot_break');
        const r = Math.random();
        if (r < 0.35) this.loot.drop(p, [{ type: 'coins', n: randInt(1, 4) * this.layout.mlvl }]);
        else if (r < 0.5) this.loot.drop(p, [{ type: 'potion', key: Math.random() < 0.6 ? 'heart' : 'zoom' }]);
      }, applyStatus() {}, heal() {} };
    this.combat.add(pot);
    return pot;
  }
  makeShrine(p, type) {
    const G = this.G, W = this.world;
    const INFO = {
      zoomies: { name: 'Zoomies Shrine', color: '#8fe0c0', text: '+35% move & attack speed for 45s' },
      goodboy: { name: 'Good Boy Shrine', color: '#ffb0d0', text: 'Fully healed! Such a good boy.' },
      lucky: { name: 'Lucky Cat Shrine', color: '#ffd84a', text: '+60% magic find for 60s' },
      sparkle: { name: 'Sparkle Shrine', color: '#b8a8ff', text: '+50% experience for 60s' },
      snack: { name: 'Snack Shrine', color: '#ff9a6a', text: 'Potion belt refilled!' },
    }[type];
    const base = new RoundedBox(0.8, 1.1, 0.8, 2, 0.12); base.translate(0, 0.55, 0); paint(base, (q, n, o) => o.set('#b8b0c4').lerp(new THREE.Color('#e0d8e8'), Math.max(0, n.y)));
    const roof = new THREE.ConeGeometry(0.7, 0.45, 4); roof.rotateY(Math.PI / 4); roof.translate(0, 1.32, 0); paint(roof, (q, n, o) => o.set('#6a5a8a'));
    const mesh = new THREE.Mesh(merge([base, roof]), makeToon({ vertexColors: true, rim: 0.4 })); mesh.position.copy(p); mesh.castShadow = true; W.scene.add(mesh);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), makeToon({ color: INFO.color, emissive: INFO.color, emissiveIntensity: 1.5 })); orb.position.copy(p).add(V(0, 0.8, 0.42)); W.scene.add(orb);
    const light = W.lightPool.addSource({ pos: orb.position.clone(), color: new THREE.Color(INFO.color), intensity: 5, radius: 5, flicker: 0.3 });
    const sh = { ...INFO, used: false, use: () => {
      sh.used = true; orb.material.emissiveIntensity = 0.1; W.lightPool.removeSource(light);
      G.vfx.pillar(p, { color: INFO.color, life: 1.4, r: 0.8, h: 6 }); G.vfx.sparkle(p.clone().setY(1), { n: 30, color: INFO.color, r: 1 });
      Events.emit('sfx', 'buff'); G.ui?.banner?.(INFO.name, INFO.text, { style: 'quest' });
      const B = this.combat.buffs;
      if (type === 'zoomies') B.shrineZoom = { t: 45 };
      if (type === 'goodboy') { G.actions.restoreAll(); G.vfx.heal(G.player.pos); }
      if (type === 'lucky') B.shrineLuck = { t: 60 };
      if (type === 'sparkle') B.shrineXp = { t: 60 };
      if (type === 'snack') { G.actions.addPotion('heart', 5); G.actions.addPotion('zoom', 5); }
    } };
    (this.spinners ||= []).push((dt, t) => { if (!sh.used) orb.position.y = p.y + 0.8 + Math.sin(t * 2.5) * 0.06; });
    return sh;
  }
  // ------------------------------------------------------------------ combat helpers used by monsters
  explodeAt(pos, r, dmg, element, src, big = false) {
    const G = this.G;
    G.vfx.ring(pos, { color: element === 'fire' ? '#ff9a3c' : '#ffd0e0', r0: 0.2, r1: r, life: 0.4 });
    if (element === 'fire') G.vfx.fire(pos, 24, { spread: r * 0.4, size: 0.7 }); else G.vfx.dustRing(pos, r);
    G.vfx.flash(pos.clone().setY(0.5), element === 'fire' ? '#ffae5a' : '#ffffff', r * 1.2, 0.2);
    Events.emit('sfx', 'explosion_small', { pos });
    if (big) G.engine.rig.shake(0.6);
    const P = G.player;
    if (!G.playerDead && dist(P.pos.x, P.pos.z, pos.x, pos.z) < r + P.radius) this.combat.hitPlayer(dmg, { element, level: src?.level || 1, from: pos, knock: 0.8, src });
    for (const e of this.combat.entities) if (e.alive && e.team === 'ally' && dist(e.pos.x, e.pos.z, pos.x, pos.z) < r) this.combat.hitAlly(e, dmg, { element });
  }
  sporeCloud(pos, r, dmg, src) {
    const G = this.G, P = G.player;
    G.vfx.stink(pos, 8); Events.emit('sfx', 'stink', { pos });
    for (let i = 0; i < 10; i++) G.vfx.spark.spawn({ x: pos.x + rand(-r, r) * 0.7, y: rand(0.2, 1), z: pos.z + rand(-r, r) * 0.7, vy: rand(0.2, 0.6), life: rand(1, 2), size: rand(0.12, 0.22), color: '#f0ff9a', alpha: 0.9, alpha1: 0, spin: rand(-2, 2) });
    this.combat.addZone({ pos: pos.clone(), radius: r, life: 2.6, tick: 0.6, update: (dt) => { if (Math.random() < 0.12) G.vfx.stink(pos.clone().add(V(rand(-r, r) * 0.6, 0, rand(-r, r) * 0.6)), 1); },
      onTick: () => { if (!G.playerDead && dist(P.pos.x, P.pos.z, pos.x, pos.z) < r) this.combat.hitPlayer(Math.round(dmg * 0.35), { element: 'stink', level: src.level, src }); } });
  }
  fireNova(m) {
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; this.combat.spawn({ team: 'enemy', kind: 'fireball', pos: m.pos.clone().setY(0.5), dir: V(Math.cos(a), 0, Math.sin(a)), speed: 6, range: 5, radius: 0.3, onHit: (e) => { const d = randInt(...(m.stats.dmgFire || m.stats.dmg)); if (e === this.G.player) this.combat.hitPlayer(d, { element: 'fire', level: m.level, src: m }); else this.combat.hitAlly(e, d, { element: 'fire' }); } }); }
  }
  onMonsterDeath(m) {
    const G = this.G, D = G.derived;
    const i = this.monsters.indexOf(m); if (i >= 0) this.monsters.splice(i, 1);
    (this.dying ||= []).push(m);
    this.combat.remove(m);
    // xp
    let xp = xpForKill(m.stats.xp, m.level, G.state.player.lvl);
    if (this.combat.buffs.shrineXp) xp = Math.round(xp * 1.5);
    xp = Math.round(xp * (1 + (D.xpBonus || 0) / 100));
    G.actions.addXp(xp);
    // batch xp into one floating number above Chewy instead of one per kill
    this.xpAcc = (this.xpAcc || 0) + xp;
    if (!this.xpTimer) this.xpTimer = setTimeout(() => { this.xpTimer = null; if (this.xpAcc > 0 && this.G.player) this.G.ui?.float?.(this.G.player.pos.clone().setY(this.G.player.pos.y + 2.0), `+${this.xpAcc} xp`, { kind: 'xp' }); this.xpAcc = 0; }, 550);
    if (D.lifeOnKill) G.actions.heal(D.lifeOnKill);
    // drops
    const mf = (D.mf || 0) + (this.combat.buffs.shrineLuck ? 60 : 0);
    const drops = rollDrops({ mlvl: m.level, rank: m.rank, mf, gf: D.gf || 0, kind: m.stats.kind });
    if (drops.length) this.loot.drop(m.pos.clone().setY(0.3), drops);
    Events.emit('monster:killed', { id: m.id, rank: m.rank, floor: this.floor });
    if (m === this.boss) this.onBossDefeated(m);
  }
  onBossDefeated(b) {
    const G = this.G;
    G.ui?.setBoss?.(null);
    G.engine.timeScale = 0.35; setTimeout(() => { G.engine.timeScale = 1; }, 1400);
    G.engine.post.pulse('#fff4d8', 0.6);
    G.vfx.levelUp(b.pos.clone());
    G.ui?.banner?.('Victory!', `${b.name} was defeated!`, { style: 'levelup' });
    Events.emit('boss:dead', { id: b.id, floor: this.floor });
    Events.emit('sfx', 'ui_levelup');
    // stairs appear where the boss fell + a return portal
    const p = b.pos.clone();
    setTimeout(() => {
      if (G.dungeon !== this) return;
      // stairs and portal go to open floor near where the boss fell (never inside rock, even against a wall)
      const sp = this.openSpotNear(p, 2, 1.3), pp = this.openSpotNear(p, 2, 1.2, sp);
      this.makeStairs(sp);
      this.world.interactables.push({ pos: sp, radius: 1.3, label: `Burrow deeper (Floor ${this.floor + 1})`, onInteract: () => G.enterDungeon(this.floor + 1) });
      this.makePortal(pp, '#ffe070');
      this.world.interactables.push({ pos: pp, radius: 1.2, label: 'Return to Blossom Hollow', onInteract: () => G.returnToVillage() });
    }, 1500);
    this.boss = null;
  }
  // nearest point about `d` away from `c` whose surroundings (radius r) are open floor; avoids `avoid`
  openSpotNear(c, d = 2, r = 1.2, avoid = null) {
    const W = this.world;
    const clear = (x, z) => { for (let a = 0; a < 8; a++) if (!W.walkable(x + Math.cos(a / 8 * TAU) * r, z + Math.sin(a / 8 * TAU) * r)) return false; return W.walkable(x, z); };
    for (let ring = d; ring <= d + 8; ring += 0.75) for (let k = 0; k < 16; k++) {
      const a = k / 16 * TAU, x = c.x + Math.cos(a) * ring, z = c.z + Math.sin(a) * ring;
      if (avoid && Math.hypot(x - avoid.x, z - avoid.z) < 2.6) continue;
      if (clear(x, z)) return V(x, 0, z);
    }
    return this.startPos ? this.startPos.clone().add(V(avoid ? -1.6 : 1.6, 0, 1.6)) : c.clone();
  }
  // ------------------------------------------------------------------ pathing
  cellOf(p) { return [Math.floor(p.x / CELL), Math.floor(p.z / CELL)]; }
  los(a, b) {
    const L = this.layout;
    let [x0, y0] = this.cellOf(a); const [x1, y1] = this.cellOf(b);
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, n = 0;
    while (n++ < 200) {
      if (!L.at(x0, y0)) return false;
      if (x0 === x1 && y0 === y1) return true;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
    return true;
  }
  updateFlow() {
    const L = this.layout, W = L.W, H = L.H, F = this.flow;
    F.fill(32000);
    const [px, py] = this.cellOf(this.G.player.pos);
    if (!L.at(px, py)) return;
    const q = new Int32Array(W * H); let h = 0, t = 0;
    F[py * W + px] = 0; q[t++] = py * W + px;
    while (h < t) {
      const i = q[h++], x = i % W, y = (i / W) | 0, d = F[i];
      if (d > 60) continue;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + ox, ny = y + oy; if (!L.at(nx, ny)) continue;
        const j = ny * W + nx; if (F[j] > d + 1) { F[j] = d + 1; q[t++] = j; }
      }
    }
  }
  flowDir(pos) {
    const L = this.layout, W = L.W, F = this.flow;
    const [cx, cy] = this.cellOf(pos);
    let best = F[cy * W + cx], bx = 0, by = 0;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const nx = cx + ox, ny = cy + oy; if (!L.at(nx, ny)) continue;
      if (ox && oy && (!L.at(cx + ox, cy) || !L.at(cx, cy + oy))) continue;
      const v = F[ny * W + nx]; if (v < best) { best = v; bx = ox; by = oy; }
    }
    if (!bx && !by) return null;
    const target = V((cx + bx + 0.5) * CELL, 0, (cy + by + 0.5) * CELL);
    return target.sub(pos).setY(0).normalize();
  }
  update(dt, t) {
    const G = this.G;
    this.flowT -= dt; if (this.flowT <= 0) { this.flowT = 0.4; this.updateFlow(); }
    for (const m of [...this.monsters]) m.update(dt);
    this.dying = (this.dying || []).filter(m => !m.disposed);
    for (const m of this.dying) m.update(dt); // death squash / poof animation
    this.loot.update(dt);
    for (const s of this.spinners || []) s(dt, t);
    if (this.playerLight) this.playerLight.pos.copy(G.player.pos).setY(G.player.pos.y + 1.8);
    // boss bar
    if (this.boss?.alive && this.boss.aggro) G.ui?.setBoss?.({ name: this.boss.name, hp: this.boss.life, max: this.boss.lifeMax });
    this.world.update(dt, t, G.vfx, G.player.pos);
  }
  dispose() { this.loot.clear(); this.monsters.length = 0; }
}
