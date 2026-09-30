// Moka's spell stage: /?test=spells[&cast=<id>][&lvl=12][&n=8][&aim=x,z][&loop=1][&ai=1][&dark=1][&clean][&icons]
// Moka (baked model if present, else the kit spec) with a staff, a crescent of dummy yokai, the real SkillRunner /
// Combat / VFX, and a row of spell buttons. window.cast(id, x, z) casts; window.hold(ms) keeps Moonbeam held.
// &cast=<id> fires once at load (and every ~3 s with &loop); &icons shows the skill + staff icon sheet instead.
import * as THREE from 'three';
import { makeStage } from './_stage.js';
import { VFX } from '../gfx/vfx.js';
import { Combat } from '../combat/combat.js';
import { SkillRunner } from '../combat/skillRunner.js';
import { Monster } from '../dungeon/monster.js';
import { Collision } from '../world/collision.js';
import { computeStats } from '../rpg/stats.js';
import { SKILLS, getSkill } from '../rpg/skills.js';
import { MOKA_SKILLS } from '../rpg/skillsMoka.js';
import { buildHumanoid, CAST, contactShadow } from '../actors/charKit.js';
import { loadHeroModel, buildHeroModel, heroModelReady } from '../actors/heroModels.js';
import { makeStaff, attachStaff, tickStaff } from '../actors/heroGear.js';
import { Animator } from '../actors/animator.js';
import { skillIcon, itemIcon } from '../rpg/icons.js';
import { dampAngle } from '../core/util.js';
import { Events } from '../core/events.js';

const IDS = Object.keys(MOKA_SKILLS);

function iconSheet() {
  document.getElementById('boot')?.remove();
  document.body.style.cssText = 'margin:0;background:#fdeedd;font:13px system-ui;color:#4a2c2a;padding:14px';
  const row = (title, cells) => `<h3 style="margin:10px 0 4px">${title}</h3><div style="display:flex;flex-wrap:wrap;gap:8px">${cells.join('')}</div>`;
  const cell = (url, name) => `<div style="width:92px;text-align:center"><img src="${url}" style="width:64px;height:64px;image-rendering:auto"><div>${name}</div></div>`;
  let html = row('Basic attack', [cell(skillIcon('attack_staff'), 'attack_staff')]);
  for (const t of ['tide', 'star', 'duck']) html += row(t, IDS.filter(id => MOKA_SKILLS[id].tree === t).sort((a, b) => MOKA_SKILLS[a].row - MOKA_SKILLS[b].row).map(id => cell(skillIcon(id), MOKA_SKILLS[id].name)));
  const staffs = [['drift', ['#b89a74', '#5ce0d0', '#4a8adf']], ['duck', ['#c98f5e', '#ffe070', '#ff9a3a']], ['coral', ['#e8d8c8', '#ff9ad0', '#ff7a8a']], ['star', ['#5a4a8a', '#fff0a0', '#b89aff']], ['sun', ['#f4f0e8', '#ffd84a', '#e8503a']], ['moon', ['#3a3a6a', '#e0e8ff', '#c8c8ff']]];
  html += row('Staffs', staffs.flatMap(([v, c], i) => [cell(itemIcon({ kind: 'gear', rarity: ['normal', 'magic', 'rare', 'unique', 'set', 'rare'][i], icon: { shape: 'staff', variant: v, colors: c } }), v)]));
  document.body.innerHTML = html;
  setTimeout(() => { window.__ready = true; }, 300);
}

export default async function () {
  const Q = new URLSearchParams(location.search);
  if (Q.has('icons')) return iconSheet();
  const dark = Q.has('dark');
  const S = makeStage({ ground: 70, hour: dark ? 21 : 10.5, dist: +(Q.get('dist') ?? 26), groundColor: dark ? '#7a6a78' : '#8cc46a' });
  const engine = S.engine, scene = S.scene;
  S.freeCam = false;
  // ---- world + G
  const world = S.world;
  world.collision = new Collision();
  world.walkable = () => true;
  const vfx = new VFX(engine, scene); vfx.setLightPool(S.lightPool);
  const lvl = +(Q.get('lvl') ?? 12);
  const staffItem = { uid: 'test-staff', kind: 'gear', base: 'starlightStaff', name: 'Starlight Staff', slot: 'weapon', wtype: 'staff', rarity: 'rare', dmg: [12, 27], aspd: 1.15, affixes: [], icon: { shape: 'staff', variant: Q.get('staff') || 'drift', colors: ['#b89a74', '#5ce0d0', '#4a8adf'] } };
  const skills = {}; for (const id of IDS) skills[id] = lvl;
  const state = { version: 1, activeHero: 'moka', heroes: { moka: {} }, flags: { mokaJoined: true },
    player: { cls: 'moka', name: 'Moka', lvl: 30, xp: 0, stats: { str: 8, dex: 10, vit: 20, ene: 60 }, statPts: 0, skillPts: 0, skills, hotbar: ['attack', 'splash', 'moonbeam', null, null, null], mouseSets: [['attack', 'splash'], ['attack', 'splash']], life: null, zoom: null, activeWeapon: 0 },
    equipment: { weapon: staffItem, weaponAlt: null }, coins: 0, potions: {}, materials: {}, inventory: [], stash: [], quests: { active: [], done: [] }, dungeon: { deepest: 0, waypoints: [1] } };
  const G = window.G = { engine, state, world, vfx, mode: 'dungeon', ui: null, playerDead: false };
  G.derived = computeStats(state);
  G.actions = { spendZoom: () => true, restoreZoom: () => 0, heal: () => 0, damage: () => ({}), swapWeapons() {}, recompute() { G.derived = computeStats(state); } };
  G.combat = new Combat(G, world);
  // ---- Moka
  try { if (!heroModelReady('moka')) await loadHeroModel('moka'); } catch (e) { /* the kit fallback */ }
  let rig; try { rig = heroModelReady('moka') ? buildHeroModel('moka') : buildHumanoid(CAST.moka); } catch (e) { rig = buildHumanoid(CAST.moka); }
  scene.add(rig.root);
  const shadow = contactShadow(0.34); scene.add(shadow);
  const staff = attachStaff(makeStaff(staffItem.icon), rig.parts.handR);
  const P = G.player = {
    hero: 'moka', name: 'Moka', pos: new THREE.Vector3(0, 0, 0), facing: 0.6, faceTarget: 0.6, radius: 0.3, rig, anim: new Animator(rig), staff,
    moveTarget: null, invuln: false, canMoveWhileActing: false, weaponType: 'staff', world,
    setWeapon() {}, busyAction() { return false; },
    sync() { rig.root.position.set(this.pos.x, this.pos.y + (rig.offsetY || 0), this.pos.z); rig.root.rotation.y = this.facing; shadow.position.set(this.pos.x, 0.02, this.pos.z); },
    update(dt) { this.facing = dampAngle(this.facing, this.faceTarget, 14, dt); this.anim.update(dt, this.pos); tickStaff(staff, dt); this.sync(); },
  };
  P.sync();
  G.skills = new SkillRunner(G);
  // ---- dummies
  const mode = { G, world, monsters: [], combat: G.combat, los: () => true, flowDir: () => null, bossEngaged() {}, bossIntro() {}, summonAround() {}, fireNova() {}, sporeCloud() {}, explodeAt() {}, bossTelegraph() {},
    onMonsterDeath(m) { const i = mode.monsters.indexOf(m); if (i >= 0) mode.monsters.splice(i, 1); G.combat.remove(m); setTimeout(() => spawn(m.id, m.home.x, m.home.z), 1500); } };
  const ai = Q.has('ai'), mortal = Q.has('mortal');
  function spawn(id, x, z) {
    const m = new Monster(mode, id, { level: 20, x, z });
    m.home = new THREE.Vector3(x, 0, z);
    if (!ai) { m.speed = 0; }
    if (!mortal) { m.lifeMax = m.life = 1e6; }
    m.facing = Math.atan2(-x, -z);
    mode.monsters.push(m); G.combat.add(m);
    return m;
  }
  const kinds = ['mochi', 'dustbunny', 'kinoko', 'oni', 'tanuki', 'kasa', 'lantern', 'mochi', 'kinoko', 'dustbunny', 'oni', 'tanuki'];
  // the dummies stand in a crescent in front of Moka, away from the camera (default iso yaw)
  const { f: FWD, r: RIGHT } = engine.rig.groundAxes(), n = +(Q.get('n') ?? 8);
  const center = FWD.clone().multiplyScalar(6.2);
  for (let i = 0; i < n; i++) {
    const u = n > 1 ? i / (n - 1) - 0.5 : 0, a = u * 1.7, r = 5.6 + (i % 2) * 1.5;
    const d = FWD.clone().multiplyScalar(Math.cos(a) * r).addScaledVector(RIGHT, Math.sin(a) * r);
    spawn(kinds[i % kinds.length], d.x, d.z);
  }
  P.facing = P.faceTarget = Math.atan2(FWD.x, FWD.z);
  const aimQ = (Q.get('aim') || '').split(',').map(Number);
  const aim0 = aimQ.length === 2 && !aimQ.some(isNaN) ? new THREE.Vector3(aimQ[0], 0, aimQ[1]) : center.clone();
  if (Q.has('focus')) engine.rig.focus.set(0, 0.8, 0); else engine.rig.focus.copy(center).multiplyScalar(0.42).setY(0.8);
  engine.rig.snap();
  // ---- input for channels
  // simulation clock: shootAt / advance run the sim for exactly t seconds and then freeze it (for mid-effect screenshots)
  let held = null, heldUntil = 0, simT = 0, frozen = false, runLeft = -1, runDone = null;
  const input = { holding: id => id === held && simT < heldUntil };
  const nearest = (p) => { let b = null, bd = 1e9; for (const m of mode.monsters) { if (!m.alive) continue; const d = Math.hypot(m.pos.x - p.x, m.pos.z - p.z); if (d < bd) { bd = d; b = m; } } return bd < 2.5 ? b : null; };
  window.cast = (id, x = aim0.x, z = aim0.z) => {
    const aim = new THREE.Vector3(x, 0, z);
    G.skills.cds = {}; P.anim.stop();
    if (getSkill(id)?.kind === 'channel') { held = id; heldUntil = simT + 2.6; G.skills.aimOverride = aim.clone(); }
    return G.skills.tryCast(id, aim, nearest(aim));
  };
  window.hold = (sec = 2.5) => { heldUntil = simT + sec; };
  const runFor = t => new Promise(res => { frozen = false; runLeft = t; runDone = () => requestAnimationFrame(() => requestAnimationFrame(() => res(simT))); });
  window.shootAt = (id, t, x, z) => { window.cast(id, x, z); return runFor(t); };
  window.advance = t => runFor(t);
  window.freeze = () => { frozen = true; };
  window.monsters = mode.monsters; window.P = P;
  // sounds (headless-safe): route sfx events to the audio engine when one is running
  let audio = null;
  if (!Q.has('mute')) import('../audio/audio.js').then(m => { audio = m.Audio; try { audio.init?.(); } catch (e) { /* ignore */ } }).catch(() => {});
  Events.on('sfx', (name, o = {}) => { try { audio?.play?.(name === 'squeak' ? 'slime_bounce' : name, name === 'squeak' ? { ...o, pitch: 1.9 } : o); } catch (e) { /* ignore */ } });
  // ---- buttons
  if (!Q.has('clean')) {
    const bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;left:50%;bottom:10px;transform:translateX(-50%);display:flex;gap:4px;z-index:9;flex-wrap:wrap;justify-content:center;max-width:96vw';
    for (const id of ['attack', ...IDS]) {
      const d = getSkill(id); if (!d || d.kind === 'passive') continue;
      const b = document.createElement('img'); b.src = skillIcon(id === 'attack' ? 'attack_staff' : id); b.title = d.name || id;
      b.style.cssText = 'width:48px;height:48px;cursor:pointer;border-radius:10px';
      b.onclick = () => window.cast(id, aim0.x, aim0.z);
      bar.appendChild(b);
    }
    document.body.appendChild(bar);
  }
  // ---- loop
  let sweep = 0;
  S.onUpdate((rdt) => {
    let dt = frozen ? 0 : rdt;
    if (runLeft >= 0 && !frozen) { dt = Math.min(dt, runLeft); runLeft -= dt; if (runLeft <= 1e-6) { runLeft = -1; frozen = true; runDone?.(); runDone = null; } }
    simT += dt;
    if (G.skills.aimOverride && held && input.holding(held)) { sweep += dt; G.skills.aimOverride.set(aim0.x + Math.sin(sweep * 1.3) * 2.5, 0, aim0.z + Math.cos(sweep * 0.9) * 1.2); }
    P.update(dt);
    G.skills.update(dt, input);
    G.combat.update(dt);
    for (const m of mode.monsters) { if (!ai) m.cd = 99; m.update(dt); }
    vfx.update(dt);
  });
  vfx.prewarm(engine.renderer, engine.camera); // (SpellFX prewarms with it: this state has Moka)
  const first = Q.get('cast');
  if (Q.has('frozen')) frozen = true;
  if (first) {
    setTimeout(() => window.cast(first), 700);
    if (Q.has('loop')) setInterval(() => window.cast(first), +(Q.get('loop') > 1 ? Q.get('loop') : 3200));
  }
  window.__info = { derived: { dmg: [G.derived.dmgMin, G.derived.dmgMax], castMul: G.derived.castMul, tree: G.derived.treeDmgPct }, rig: heroModelReady('moka') ? 'baked' : 'kit' };
  S.ready();
}
