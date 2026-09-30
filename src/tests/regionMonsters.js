// Region monster stage: /?test=regionMonsters
//   &biome=bamboo|maple|tidepool|onsen   model sheet of that biome's three monsters (rows = variants)      [default: all 12, variant 0]
//   &id=<id>                             one monster, all its variants side by side
//   &act=<pose>                          hold a pose (wind, spin, dash, roll, …; whatever the model's animate knows), &move=1 walk cycle
//   &spin=<rad/s>                        turntable speed (default 0.35; 0 = fixed, &yaw=<rad> start angle)
//   &fight=1[&n=3][&walk=1][&lvl=10]     live AI vs a dummy Chewy (takes the hits but never dies): telegraphs, projectiles, zones
//   &rank=champion|unique                elite contour / scale on the fight monsters
// window.advance(t) runs the sim t seconds and freezes it (mid-telegraph screenshots); window.freeze(); window.mons.
import * as THREE from 'three';
import { makeStage } from './_stage.js';
import { MONSTERS, buildMonster, MonsterAnim } from '../dungeon/monsters.js';
import { REGION_MONSTER_MODULES } from '../regions/monsters/index.js';
import { contactShadow, buildHumanoid, CAST } from '../actors/charKit.js';
import { Animator } from '../actors/animator.js';
import { VFX } from '../gfx/vfx.js';
import { Combat } from '../combat/combat.js';
import { Monster } from '../dungeon/monster.js';
import { Collision } from '../world/collision.js';
import { computeStats } from '../rpg/stats.js';
import { Events } from '../core/events.js';

const BIOMES = { bamboo: ['takenoko', 'kodama', 'kamaitachi'], maple: ['kuri', 'kakashi', 'momijiWisp'], tidepool: ['kappa', 'heikegani', 'kurage'], onsen: ['yukiwarashi', 'yukidaruma', 'tsurara'] };

export default function () {
  const Q = new URLSearchParams(location.search);
  const id = Q.get('id'), biome = Q.get('biome'), fight = Q.has('fight');
  const ids = id ? [id] : biome ? BIOMES[biome] : Object.values(BIOMES).flat();
  const avail = ids.filter(k => MONSTERS[k]);
  const ground = { bamboo: '#8cbc6a', maple: '#c8a068', tidepool: '#e8d8b0', onsen: '#e8eef6' }[biome || Object.keys(BIOMES).find(b => BIOMES[b].includes(id)) || 'bamboo'] || '#8cbc6a';
  const S = makeStage({ ground: 80, hour: +(Q.get('hour') ?? 10.5), dist: +(Q.get('dist') ?? (fight ? 16 : id ? 7 : biome ? 13 : 24)), groundColor: ground });
  document.getElementById('boot')?.remove();
  const spin = +(Q.get('spin') ?? (fight ? 0 : 0.35)), yaw0 = +(Q.get('yaw') ?? 0.5);
  window.mons = [];
  if (!fight) sheet(S, avail, { id, biome, spin, yaw0, pose: Q.get('act'), move: Q.has('move') });
  else arena(S, avail, Q);
  const info = document.createElement('div');
  info.style.cssText = 'position:fixed;left:10px;top:8px;font:13px system-ui;color:#3a2230;background:#fff8eecc;padding:4px 8px;border-radius:8px';
  info.textContent = `${avail.join(', ')}${avail.length < ids.length ? '  (missing: ' + ids.filter(k => !MONSTERS[k]).join(', ') + ')' : ''}`;
  if (!Q.has('clean')) document.body.appendChild(info);
  window.__info = { ids: avail, tris: fight ? null : window.mons.map(o => ({ id: o.id, v: o.v, tris: tris(o.m.root) })) };
  S.ready();
}
function tris(root) {
  let n = 0; root.traverse(o => { if (o.isMesh && o.material?.type !== 'MeshBasicMaterial' && !o.material?.side) { const g = o.geometry; n += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
  return Math.round(n);
}
// ---------------------------------------------------------------- model sheet (MonsterAnim only, poses on demand)
function sheet(S, ids, { id, biome, spin, yaw0, pose, move }) {
  const rows = id ? 1 : biome ? 3 : 1, list = [];
  const cols = id ? (MONSTERS[id]?.variants?.length || 1) : ids.length, gapX = id ? 1.9 : biome ? 2.3 : 2.1;
  ids.forEach((mid, ci) => {
    const def = MONSTERS[mid], nv = def.variants?.length || 1;
    const vs = id ? [...Array(nv).keys()] : biome ? [0, 1, 2].filter(v => v < nv) : [0];
    vs.forEach((vi, ri) => {
      const m = buildMonster(mid, vi);
      const col = id ? vi : ci, row = id ? 0 : ri;
      const x = (col - (cols - 1) / 2) * gapX, z = (row - (rows - 1) / 2) * -2.4;
      m.root.position.set(x, 0, z); m.root.rotation.y = yaw0;
      S.scene.add(m.root);
      const sh = contactShadow((def.vr || def.radius) * 1.2); sh.position.set(x, 0.02, z); S.scene.add(sh);
      const anim = new MonsterAnim(m, def);
      if (pose) { m.act = pose; m.actT = 0; }
      list.push({ m, anim, def, id: mid, v: vi });
      window.mons.push({ id: mid, v: vi, m });
    });
  });
  // cycle a pose every few seconds when &act=cycle
  const cycle = pose === 'cycle' ? ['idle', 'wind', 'idle', 'strike'] : null;
  let ct = 0;
  S.onUpdate((dt) => {
    ct += dt;
    for (const o of list) {
      if (spin) o.m.root.rotation.y += dt * spin;
      if (cycle) { const want = cycle[Math.floor(ct / 1.6) % cycle.length]; if (o.m.act !== want) { o.m.act = want; o.m.actT = 0; } }
      else if (pose && pose !== 'cycle' && o.m.actT > 3.5 && /wind|pop|dig|spin|shoot|nip|strike|slam|caw|burst|throw|zap|blink|grab|splash/.test(pose)) o.m.actT = 0; // replay one-shots
      o.anim.update(dt, move, 1);
    }
  });
  window.setAct = (p) => { for (const o of list) { o.m.act = p; o.m.actT = 0; } };
}
// ---------------------------------------------------------------- live fight vs a dummy Chewy
function arena(S, ids, Q) {
  const engine = S.engine, scene = S.scene, world = S.world;
  S.freeCam = false;
  world.collision = new Collision(); world.collision.blockFn = (x, z) => Math.abs(x) > 17 || Math.abs(z) > 17; // a walled 34 m yard
  world.walkable = (x, z) => Math.abs(x) < 17 && Math.abs(z) < 17;
  world.cellToWorld = (cx, cy) => new THREE.Vector3(cx * 2 + 1, 0, cy * 2 + 1);
  if (Q.has('pool')) world.waterAt = (x, z) => (Math.hypot(x + 7, z + 5) < 3 ? 0.4 : 0); // a pond for the kappa
  const vfx = new VFX(engine, scene); vfx.setLightPool(S.lightPool);
  const lvl = +(Q.get('lvl') ?? 12);
  const state = { version: 1, activeHero: 'chewy', heroes: {}, flags: {}, player: { cls: 'chewy', name: 'Chewy', lvl, xp: 0, stats: { str: 20, dex: 20, vit: 30, ene: 10 }, statPts: 0, skillPts: 0, skills: {}, hotbar: [], mouseSets: [['attack', 'attack'], ['attack', 'attack']], life: null, zoom: null, activeWeapon: 0 }, equipment: {}, coins: 0, potions: {}, materials: {}, inventory: [], stash: [], quests: { active: [], done: [] }, dungeon: { deepest: 0, waypoints: [1] } };
  let hurt = 0;
  const G = window.G = { engine, state, world, vfx, mode: 'dungeon', ui: null, playerDead: false };
  G.derived = computeStats(state);
  G.actions = { spendZoom: () => true, restoreZoom: () => 0, heal: () => 0, damage: (n) => { hurt += n; return {}; }, recompute() { G.derived = computeStats(state); } };
  G.combat = new Combat(G, world);
  const rig = buildHumanoid(CAST.chewy); scene.add(rig.root);
  const shadow = contactShadow(0.34); scene.add(shadow);
  const walk = Q.has('walk');
  const P = G.player = { hero: 'chewy', name: 'Chewy', pos: new THREE.Vector3(0, 0, 0), facing: 0, radius: 0.3, rig, anim: new Animator(rig), team: 'ally', alive: true, invuln: false, slowT: 0, knock: null, world,
    sync() { rig.root.position.set(this.pos.x, this.pos.y, this.pos.z); rig.root.rotation.y = this.facing; shadow.position.set(this.pos.x, 0.02, this.pos.z); } };
  const mode = { G, world, monsters: [], combat: G.combat, layout: { mlvl: lvl, at: () => 1 }, los: () => true, flowDir: () => null, bossEngaged() {}, bossIntro() {}, fireNova() {}, sporeCloud() {}, bossTelegraph() {},
    explodeAt(pos, r, dmg, el, src) { vfx.ring(pos, { r1: r }); if (Math.hypot(P.pos.x - pos.x, P.pos.z - pos.z) < r + 0.3) G.combat.hitPlayer(dmg, { element: el, level: lvl, from: pos, src }); },
    summonAround(boss, mid, n) { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; spawn(mid, boss.pos.x + Math.cos(a) * 2.5, boss.pos.z + Math.sin(a) * 2.5, 'normal').aggro = true; } },
    onMonsterDeath(m) { const i = mode.monsters.indexOf(m); if (i >= 0) mode.monsters.splice(i, 1); G.combat.remove(m); (mode.dying ||= []).push(m); if (!Q.has('mortal')) setTimeout(() => spawn(m.id, m.home.x, m.home.z, m.rank0), 1500); } };
  G.dungeon = mode;
  const rank = Q.get('rank') || 'normal';
  function spawn(mid, x, z, rk = rank) {
    const m = new Monster(mode, mid, { level: lvl, rank: rk, variant: +(Q.get('v') ?? mode.monsters.length) % 3, x, z });
    m.home = new THREE.Vector3(x, 0, z); m.rank0 = rk; m.aggro = !Q.has('calm');
    mode.monsters.push(m); G.combat.add(m);
    return m;
  }
  const n = +(Q.get('n') ?? 3);
  for (let i = 0; i < n; i++) { const mid = ids[i % ids.length], a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.7, r = 6.5 + (i % 2); spawn(mid, Math.cos(a) * r, Math.sin(a) * r); }
  engine.rig.focus.set(0, 0.8, -2.5); engine.rig.snap();
  let audio = null;
  if (!Q.has('mute')) import('../audio/audio.js').then(mod => { audio = mod.Audio; try { audio.init?.(); } catch (e) { /* ignore */ } }).catch(() => {});
  Events.on('sfx', (name, o = {}) => { try { audio?.play?.(name, o); } catch (e) { /* ignore */ } });
  let simT = 0, frozen = false, runLeft = -1, runDone = null;
  window.advance = t => new Promise(res => { frozen = false; runLeft = t; runDone = () => requestAnimationFrame(() => requestAnimationFrame(() => res(simT))); });
  window.freeze = () => { frozen = true; }; window.unfreeze = () => { frozen = false; };
  window.mons = mode.monsters; window.P = P; window.hurt = () => hurt;
  S.onUpdate((rdt) => {
    let dt = frozen ? 0 : rdt;
    if (runLeft >= 0 && !frozen) { dt = Math.min(dt, runLeft); runLeft -= dt; if (runLeft <= 1e-6) { runLeft = -1; frozen = true; runDone?.(); runDone = null; } }
    simT += dt;
    if (walk) { const a = simT * 0.35; P.pos.set(Math.cos(a) * 3, 0, Math.sin(a) * 3 - 1); P.facing = a + Math.PI; }
    if (P.knock && P.knock.lengthSq() > 0.01) { P.pos.addScaledVector(P.knock, dt); P.knock.multiplyScalar(Math.exp(-10 * dt)); }
    P.slowT = Math.max(0, (P.slowT || 0) - dt);
    P.anim.update(dt, P.pos); P.sync();
    G.combat.update(dt);
    for (const m of [...mode.monsters]) m.update(dt);
    mode.dying = (mode.dying || []).filter(m => !m.disposed); for (const m of mode.dying) m.update(dt);
    vfx.update(dt);
  });
  vfx.prewarm(engine.renderer, engine.camera);
}
