// Game orchestrator: boot, village <-> dungeon modes, input routing, combat input, death, main loop.
import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { Events } from './core/events.js';
import { VillageWorld } from './world/villageWorld.js';
import { DayNight } from './gfx/sky.js';
import { Player } from './actors/player.js';
import { Companion } from './actors/companion.js';
import { Villager } from './actors/npc.js';
import { CAST } from './actors/charKit.js';
import { VILLAGERS, randomVillagerSpec } from './actors/roster.js';
import { U } from './gfx/materials.js';
import { VFX } from './gfx/vfx.js';
import { Ambient } from './gfx/ambient.js';
import { Combat } from './combat/combat.js';
import { SkillRunner } from './combat/skillRunner.js';
import { DungeonMode } from './dungeon/dungeonMode.js';
import { newGameState, createActions } from './rpg/actions.js';
import { skillRuntime } from './rpg/skills.js';
import { VillageSim } from './world/village.js';
import { BuildMode } from './world/buildMode.js';
import { Story } from './world/story.js';
import { Portraits } from './gfx/portraits.js';
import { installServices } from './world/services.js';
import { VillageMinimap, DungeonMinimap } from './world/minimap.js';

async function tryImport(path) { try { return await import(/* @vite-ignore */ path); } catch (e) { console.warn('[boot] optional module missing', path, e.message); return null; } }

export async function boot() {
  const engine = new Engine();
  Input.init(engine.renderer.domElement);
  const P = engine.params;
  const G = window.G = { engine, input: Input, events: Events, THREE, mode: 'village', ui: null, audio: null, playerDead: false };

  // ---- persistent state + actions
  const saved = !P.has('fresh') && loadSave();
  G.state = saved || newGameState();
  G.actions = createActions(G);
  G.actions.recompute();
  G.skillParams = (id) => skillRuntime(id, G.state, G.derived)?.params;

  const [uiMod, audioMod] = await Promise.all([P.has('noui') ? null : tryImport('./ui/ui.js'), P.has('noaudio') ? null : tryImport('./audio/audio.js')]);
  G.audio = audioMod?.Audio || null;
  try { G.audio?.init?.(); } catch (e) { console.warn('[audio] init failed', e); }

  // ---- village
  const village = new VillageWorld(engine);
  const day = G.day = new DayNight(village, engine.post);
  day.hour = P.has('hour') ? +P.get('hour') : (G.state.hour ?? 8.5);
  day.day = G.state.day || 1;
  const vVfx = new VFX(engine, village.scene); vVfx.setLightPool(village.lightPool);
  G.vfx = vVfx;
  const ambient = new Ambient(G, village, vVfx);
  const vCombat = new Combat(G, village);
  const sim = G.sim = new VillageSim(G, village);
  sim.init();
  village.onNewDay = d => sim.onNewDay(d);
  const buildMode = G.build = new BuildMode(G, sim);
  G.village = { world: village, vfx: vVfx, ambient, combat: vCombat };
  G.world = village; G.combat = vCombat;
  engine.setWorld(village);

  // ---- actors
  const L = village.landmarks;
  const player = G.player = new Player(village, G);
  player.setPos(L.spawn.x, L.spawn.z); player.faceTarget = player.facing = Math.PI * 0.25;
  player.setWeapon(G.derived.weaponType || 'sword');
  const shadow = G.companion = new Companion(village, G);
  shadow.setPos(L.spawn.x + 1, L.spawn.z - 0.8); shadow.recalc();
  const npcs = G.npcs = [];
  const rosie = new Villager(village, G, CAST.rosie, { id: 'rosie', anchor: { x: L.rosieShop.x - 2.4, z: L.rosieShop.z + 0.5 }, wander: 2.2, role: 'shop' });
  rosie.speed = 1.8; npcs.push(rosie);
  for (const v of VILLAGERS) npcs.push(new Villager(village, G, v.spec, { id: v.id, anchor: v.anchor, wander: v.wander || 5 }));
  const skills = G.skills = new SkillRunner(G);
  const portraits = new Portraits(engine);
  for (const v of VILLAGERS) portraits.register(v.id, v.spec);
  G.portrait = (id) => portraits.get(id);
  // townsfolk move in as homes fill up (capped for performance)
  const folk = [];
  function syncTownsfolk() {
    const homes = sim.list.filter(r => r.data.type === 'home' && (r.data.residents || 0) > 0);
    const want = Math.min(16, Math.max(0, Math.round(sim.stats.population * 0.6) - 4));
    while (folk.length < want && homes.length) {
      const h = homes[folk.length % homes.length];
      const spec = randomVillagerSpec();
      const anchors = [L.plaza, ...sim.list.filter(r => r.data.type === 'shop').map(r => ({ x: r.door.x, z: r.door.z }))];
      const a = anchors[Math.floor(Math.random() * anchors.length)];
      const v = new Villager(village, G, spec, { id: 'folk' + folk.length, anchor: { x: a.x, z: a.z }, home: h.door.clone(), wander: 6 });
      v.setPos(h.door.x, h.door.z); v.folk = true; portraits.register(v.id, spec);
      v.interact.label = `Chat with ${spec.name}`;
      folk.push(v); npcs.push(v);
      if (G.mode === 'village') G.vfx.emote(v, 'heart', 2);
    }
  }
  setInterval(syncTownsfolk, 8000); setTimeout(syncTownsfolk, 1500);

  // fallback gate interaction if the Burrow landmark is missing
  if (!sim.S.buildings.some(b => b.type === 'dungeonGate')) village.interactables.push({ pos: new THREE.Vector3(L.dungeon.x, village.heightAt(L.dungeon.x, L.dungeon.z), L.dungeon.z + 1.6), radius: 1.8, label: 'Enter the Burrow', onInteract: () => G.openBurrowMenu() });

  // ---- UI
  if (uiMod?.UI) { G.ui = uiMod.UI; try { G.ui.init(G); G.ui.setMode?.('village'); } catch (e) { console.error('[ui] init failed', e); G.ui = null; } }

  // ---- audio routing
  const SFX_ALIAS = { block: ['ball_bounce', { pitch: 0.7 }], ball_catch: ['pickup_item', { vol: 0.5 }], squeak: ['slime_bounce', { pitch: 1.9 }], pot_break: ['explosion_small', { pitch: 1.6, vol: 0.6 }], villager_greet: ['villager_chatter', {}] };
  Events.on('sfx', (name, o = {}) => {
    const a = SFX_ALIAS[name];
    if (a) { const [n, extra] = a; if (n === 'villager_chatter') G.audio?.babble?.('hello!', { pitch: o.pitch || 1, pos: o.pos, vol: 0.5 }); else G.audio?.play?.(n, { ...o, ...extra }); return; }
    G.audio?.play?.(name, o);
  });
  Events.on('footstep', (p) => { G.audio?.play?.(G.mode === 'dungeon' ? 'footstep_stone' : 'footstep_grass', { vol: 0.35 }); if (Math.random() < 0.5) G.vfx.dust(p, { n: 1, size: 0.18 }); });
  Events.on('emote', ({ actor, kind }) => G.vfx.emote(actor, kind));
  Events.on('player:levelup', ({ lvl }) => { G.vfx.levelUp(player.pos.clone()); G.ui?.banner?.('Level Up!', `Chewy is now level ${lvl}`, { style: 'levelup' }); G.audio?.play?.('ui_levelup'); G.actions.restoreAll(); shadow.recalc(); });
  Events.on('player:dead', () => onPlayerDeath());
  Events.on('equip:changed', () => player.setWeapon(G.derived.weaponType || 'sword'));
  Events.on('stats:changed', () => shadow.recalc());
  G.audio?.music?.('village_day'); G.audio?.ambience?.('village');

  // ---- camera
  const rig = engine.rig;
  rig.focus.copy(player.pos); rig.snap();

  // ---- modes
  let dungeon = null;
  const swapWorld = (world, vfx, combat) => {
    G.world = world; G.vfx = vfx; G.combat = combat;
    engine.setWorld(world);
    player.changeWorld(world); shadow.changeWorld(world);
  };
  G.enterDungeon = (floor = 1) => {
    const go = () => {
      skills.clearAll();
      if (dungeon) { G.combat.clear(); dungeon.dispose(); dungeon.world.lightPool.clear(); }
      dungeon = G.dungeon = new DungeonMode(G);
      const world = dungeon.build(floor);
      const vfx = new VFX(engine, world.scene); vfx.setLightPool(world.lightPool);
      const combat = new Combat(G, world);
      swapWorld(world, vfx, combat);
      G.mode = 'dungeon';
      dungeon.start();
      const s = dungeon.startPos;
      player.setPos(s.x, s.z); player.moveTarget = null; shadow.setPos(s.x + 0.8, s.z + 0.8);
      combat.add(shadow); shadow.recalc();
      rig.focus.copy(player.pos); rig.snap();
      G.ui?.setMode?.('dungeon');
      G.ui?.minimap?.setProvider?.(new DungeonMinimap(G, dungeon));
      G.audio?.music?.(dungeon.layout.boss ? 'boss' : 'dungeon'); G.audio?.ambience?.('dungeon');
      Events.emit('mode:changed', { mode: 'dungeon', floor });
      save();
    };
    if (G.ui?.transition) G.ui.transition(go); else go();
  };
  G.returnToVillage = (dead = false) => {
    const go = () => {
      skills.clearAll();
      if (dungeon) { G.combat.clear(); dungeon.dispose(); dungeon = G.dungeon = null; }
      swapWorld(village, vVfx, vCombat);
      G.mode = 'village';
      const home = dead ? { x: L.chewyHouse.x + 2.2, z: L.chewyHouse.z } : { x: L.dungeon.x, z: L.dungeon.z + 3.2 };
      player.setPos(home.x, home.z); shadow.setPos(home.x + 0.8, home.z + 0.6);
      player.anim.stop(); G.playerDead = false; G.actions.restoreAll(); shadow.fainted = 0; shadow.untargetable = false; shadow.anim.stop();
      rig.focus.copy(player.pos); rig.snap();
      G.ui?.setMode?.('village'); G.ui?.setBoss?.(null);
      G.ui?.minimap?.setProvider?.(vMap);
      G.audio?.music?.(day.isNight() ? 'village_night' : 'village_day'); G.audio?.ambience?.(day.isNight() ? 'night' : 'village');
      Events.emit('mode:changed', { mode: 'village' });
      if (dead) setTimeout(() => G.ui?.dialogue?.({ speaker: 'Rosie', portrait: G.portrait('rosie'), lines: ['Chewy! Shadow dragged you all the way home by your scarf!', "Let's patch you up. Maybe bring more Heart Treats next time, okay?"] }), 900);
      save();
    };
    if (G.ui?.transition) G.ui.transition(go); else go();
  };
  G.openBurrowMenu = () => {
    const wps = [...(G.state.dungeon.waypoints || [1])].sort((a, b) => a - b);
    if (!G.ui?.dialogue || wps.length <= 1) return G.enterDungeon(wps[wps.length - 1] || 1);
    G.ui.dialogue({ speaker: 'The Burrow', lines: ['A warm breeze drifts up from the burrow… Shadow wiggles with excitement!'], choices: wps.map(f => ({ text: `Floor ${f}` })).concat([{ text: 'Not yet' }]) })
      .then(i => { if (i != null && i < wps.length) G.enterDungeon(wps[i]); });
  };
  G.openWaypoints = () => {
    const wps = [...(G.state.dungeon.waypoints || [1])].sort((a, b) => a - b);
    if (!G.ui?.dialogue) return;
    G.ui.dialogue({ speaker: 'Waypoint', lines: ['The paw rune hums softly. Where to?'], choices: wps.map(f => ({ text: `Floor ${f}` })).concat([{ text: 'Blossom Hollow' }, { text: 'Stay' }]) })
      .then(i => { if (i == null) return; if (i < wps.length) G.enterDungeon(wps[i]); else if (i === wps.length) G.returnToVillage(); });
  };
  function onPlayerDeath() {
    if (G.playerDead) return;
    G.playerDead = true; skills.clearAll();
    player.anim.play('die'); engine.timeScale = 0.4; engine.post.pulse('#3a2040', 0.3);
    G.ui?.banner?.('Oof!', 'Chewy needs a nap…', { style: 'boss' });
    G.audio?.play?.('player_die');
    const lost = Math.floor(G.state.coins * 0.1); if (lost > 0) { G.state.coins -= lost; Events.emit('coins:changed', { coins: G.state.coins }); }
    setTimeout(() => { engine.timeScale = 1; G.returnToVillage(true); }, 2600);
  }

  // ---- interaction helpers
  G.story = new Story(G);
  G.ui?.setQuestProvider?.(() => G.story.uiList());
  installServices(G);
  const vMap = new VillageMinimap(G);
  Events.on('village:changed', () => { vMap.dirty = true; });
  G.ui?.minimap?.setProvider?.(vMap);
  G.talkTo = (npc) => {
    if (npc.talking) return;
    npc.talking = true; player.controlLocked = true;
    const done = () => { npc.talking = false; player.controlLocked = false; };
    G.story.talk(npc).then(done, (e) => { console.error(e); done(); });
  };
  function nearestInteract() {
    let best = null, bd = 1e9;
    const list = G.mode === 'village' ? [...npcs.filter(n => n.visible).map(n => n.interact), ...G.world.interactables] : G.world.interactables;
    for (const it of list) {
      const d = Math.hypot(it.pos.x - player.pos.x, it.pos.z - player.pos.z);
      if (d < (it.radius || 1.4) + 0.4 && d < bd) { bd = d; best = it; }
    }
    return best;
  }
  const _v = new THREE.Vector3();
  function pickInteractAtMouse() {
    const cam = engine.camera;
    let best = null, bd = 56;
    const list = G.mode === 'village' ? npcs.filter(n => n.visible).map(n => n.interact).concat(G.world.interactables) : G.world.interactables;
    for (const it of list) {
      _v.copy(it.pos).setY(it.pos.y + 0.6).project(cam);
      const sx = (_v.x * 0.5 + 0.5) * innerWidth, sy = (-_v.y * 0.5 + 0.5) * innerHeight;
      const d = Math.hypot(sx - Input.mouse.x, sy - Input.mouse.y);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }
  // which key/button holds a skill (for channeling)
  const SLOT_KEYS = [() => Input.mouseDown(0), () => Input.mouseDown(2), () => Input.down('1'), () => Input.down('2'), () => Input.down('3'), () => Input.down('4')];
  const skillInput = { holding(id) { const hb = G.state.player.hotbar; return hb.some((s, i) => s === id && SLOT_KEYS[i]()); } };

  // occlusion fade: tell shaders where Chewy is on screen
  const _o = new THREE.Vector3();
  function updateOcclusion() {
    const cam = engine.camera; cam.updateMatrixWorld();
    _o.copy(player.pos).setY(player.pos.y + 0.55);
    const depth = -_o.clone().applyMatrix4(cam.matrixWorldInverse).z;
    _o.project(cam);
    const pr = engine.renderer.getPixelRatio();
    U.uOccl.value.set((_o.x * 0.5 + 0.5) * innerWidth * pr, (_o.y * 0.5 + 0.5) * innerHeight * pr, innerHeight * pr * 0.13, depth);
  }

  // ---- per-frame input
  let hoverEnemy = null;
  function handleInput(dt) {
    if (G.mode === 'village' && Input.hit('b') && !player.controlLocked) { buildMode.active ? buildMode.exit() : buildMode.enter(); }
    if (buildMode.active) { if (Input.mouse.wheel) rig.zoom(Input.mouse.wheel); const d = player.readMoveInput(); if (d.lengthSq()) rig.focus.addScaledVector(d, 0); return; }
    const modal = G.ui?.anyModal?.();
    if (modal || player.controlLocked || G.playerDead) { G.ui?.setInteract?.(null); return; }
    const hb = G.state.player.hotbar;
    const aim = engine.mouseGround(Input.mouse.nx, Input.mouse.ny, (x, z) => G.world.heightAt(x, z));
    hoverEnemy = G.mode === 'dungeon' && !Input.mouse.overUI ? G.combat.pickAtScreen(Input.mouse.x, Input.mouse.y, engine.camera) : null;
    // LMB: attack enemies under the cursor (or Shift+click), otherwise walk / interact
    if (Input.mouseDown(0) && !Input.mouse.overUI) {
      if (hoverEnemy || (Input.down('shift') && G.mode === 'dungeon')) {
        const tgt = hoverEnemy ? hoverEnemy.pos : aim;
        const R = skillRuntime(hb[0] || 'attack', G.state, G.derived);
        const melee = R && !R.params?.projectile && !(R.params?.speed) && (R.params?.radius || 0) < 3;
        const reach = (R?.params?.radius || 1.8) + (hoverEnemy?.radius || 0.3) - 0.2;
        if (hoverEnemy && melee && Math.hypot(tgt.x - player.pos.x, tgt.z - player.pos.z) > reach) { player.moveTarget = tgt.clone(); player.interactTarget = null; }
        else { player.moveTarget = null; skills.tryCast(hb[0] || 'attack', tgt, hoverEnemy); }
      } else {
        const it = Input.mouseHit(0) ? pickInteractAtMouse() : null;
        if (it) { player.interactTarget = it; player.moveTarget = it.pos.clone(); }
        else if (!player.interactTarget) player.moveTarget = aim;
      }
    }
    if (Input.mouseDown(2) && !Input.mouse.overUI && hb[1]) skills.tryCast(hb[1], hoverEnemy ? hoverEnemy.pos : aim, hoverEnemy);
    for (let k = 1; k <= 4; k++) if (Input.down(String(k)) && hb[k + 1]) skills.tryCast(hb[k + 1], hoverEnemy ? hoverEnemy.pos : aim, hoverEnemy);
    if (Input.hit('q')) usePotion('heart');
    if (Input.hit('e')) usePotion('zoom');
    if (Input.hit('r')) usePotion('rejuv');
    if (Input.hit('x')) { G.actions.swapWeapons(); player.setWeapon(G.derived.weaponType || 'sword'); G.audio?.play?.('ui_equip'); G.vfx.sparkle(player.pos.clone().setY(0.8), { n: 6 }); }
    if (Input.hit('t') && G.mode === 'dungeon') G.returnToVillage();
    const it = nearestInteract();
    G.ui?.setInteract?.(it ? it.label : null);
    if (it && Input.hit('f')) it.onInteract();
    if (Input.mouse.wheel) rig.zoom(Input.mouse.wheel);
    // target frame
    if (hoverEnemy && !hoverEnemy.breakable) G.ui?.setTarget?.({ name: hoverEnemy.name, hp: hoverEnemy.life, max: hoverEnemy.lifeMax, rarity: hoverEnemy.rank, mods: (hoverEnemy.stats.mods || []).map(m => m) });
    else G.ui?.setTarget?.(null);
  }
  function usePotion(key) {
    const eff = G.actions.usePotion(key);
    if (!eff) return;
    player.anim.play('drink');
    G.audio?.play?.('potion_drink');
    if (key === 'zoom') G.vfx.sparkle(player.pos.clone().setY(0.8), { n: 12, color: '#8fc8ff' }); else G.vfx.heal(player.pos.clone());
  }

  // ---- save / load
  function save() { try { G.state.hour = day.hour; G.state.day = day.day; localStorage.setItem('chewy3d.save', JSON.stringify(G.state)); } catch (e) { /* storage unavailable */ } }
  G.save = save;
  setInterval(save, 30000);
  addEventListener('beforeunload', save);

  // ambience: water proximity + day/night music swaps (village only)
  let ambT = 0, wasNight = day.isNight();
  function villageAmbience(dt) {
    ambT -= dt; if (ambT > 0) return; ambT = 0.5;
    let near = 99; const p = player.pos;
    for (let a = 0; a < 12; a++) for (const r of [2, 4, 7, 10]) { const x = p.x + Math.cos(a / 12 * Math.PI * 2) * r, z = p.z + Math.sin(a / 12 * Math.PI * 2) * r; if (village.terrain.heightAt(x, z) < 0) { near = Math.min(near, r); break; } }
    G.audio?.setAmbienceMix?.({ water: near < 99 ? Math.max(0, 1 - near / 11) : 0 });
    const n = day.isNight();
    if (n !== wasNight && !G.ui?.isOpen?.('shop')) { wasNight = n; G.audio?.music?.(n ? 'village_night' : 'village_day', { fade: 4 }); G.audio?.ambience?.(n ? 'night' : 'village', { fade: 4 }); }
  }

  // ---- title screen & intro
  const skip = sessionStorage.getItem('chewy3d.skipTitle');
  sessionStorage.removeItem('chewy3d.skipTitle');
  G.titleActive = false;
  const showTitle = G.ui?.setMode && !skip && !P.has('fresh') && !P.has('floor') && !P.has('notitle');
  if (showTitle) {
    G.titleActive = true; player.controlLocked = true;
    G.ui.setMode('title');
    G.audio?.music?.('title');
    rig.distTarget = 52; rig.focus.set(L.plaza.x, 1, L.plaza.z); rig.snap();
    G.ui.onTitle({
      hasSave: () => !!localStorage.getItem('chewy3d.save'),
      newGame: () => { try { localStorage.removeItem('chewy3d.save'); } catch (e) { /* */ } sessionStorage.setItem('chewy3d.skipTitle', 'new'); location.reload(); },
      continue: () => startGame(false),
    });
  } else if (skip === 'new' || (P.has('fresh') && !P.has('floor') && !P.has('nointro'))) setTimeout(() => intro(), 1200);
  function startGame(isNew) {
    const go = () => {
      G.titleActive = false; player.controlLocked = false;
      G.ui?.setMode?.('village');
      rig.yawTarget = Math.PI / 4; rig.yaw = rig.yawTarget; rig.distTarget = 34;
      rig.focus.copy(player.pos); rig.snap();
      G.audio?.music?.(day.isNight() ? 'village_night' : 'village_day');
      if (isNew) setTimeout(() => intro(), 900);
    };
    if (G.ui?.transition) G.ui.transition(go); else go();
  }
  async function intro() {
    if (!G.ui?.dialogue) return;
    const rosie = npcs[0];
    player.controlLocked = true;
    rosie.setPos(player.pos.x + 1.6, player.pos.z + 1.2); rosie.faceTo(player.pos.x, player.pos.z); player.faceTo(rosie.pos.x, rosie.pos.z);
    rosie.anim.play('wave'); G.vfx.emote(rosie, 'heart', 2.2);
    const pr = G.portrait('rosie');
    await G.ui.dialogue({ speaker: 'Rosie', portrait: pr, lines: ["Good morning, Chewy! ♡ Did you sleep well? Shadow did. He snored like a tiny tractor.", "Welcome to *Blossom Hollow*! The sakura are blooming and everyone is so happy you're here."] });
    await G.ui.dialogue({ speaker: 'Rosie', portrait: pr, lines: ['Walk with *WASD* or click the ground. Press *F* near friends to chat.', 'Press *B* to plan the village — paint zones for homes, shops and workshops, then watch it grow!', "And… there's something squeaky in *the Burrow* on the shrine hill. Take your Bone Sword — and your red tennis ball!"] });
    player.controlLocked = false;
    G.ui?.toast?.('Tip: I bag · K skills · C character · J quests · X swap weapon', { color: '#8fd0ff' });
    G.story.progress('any');
  }

  // ---- main loop
  let fpsAcc = 0, fpsN = 0; const fpsEl = P.has('fps') ? Object.assign(document.body.appendChild(document.createElement('div')), { style: 'position:fixed;left:8px;bottom:8px;color:#fff;font:12px monospace;z-index:99;text-shadow:0 1px 2px #000' }) : null;
  function frame() {
    const dt = engine.tick();
    if (G.mode === 'village') day.update(dt);
    if (G.titleActive) { rig.yawTarget += dt * 0.06; rig.yaw = rig.yawTarget; }
    else handleInput(dt);
    G.actions.tickRegen(dt);
    player.update(dt);
    shadow.update(dt);
    skills.update(dt, skillInput);
    G.combat.update(dt);
    if (G.mode === 'village') for (const n of npcs) n.update(dt);
    // camera follows with a little look-ahead
    if (!G.titleActive) {
      const lead = new THREE.Vector3(Math.sin(player.facing), 0, Math.cos(player.facing)).multiplyScalar(Math.min(1, player.anim.speed / 4) * 1.2);
      rig.focus.set(player.pos.x + lead.x, player.pos.y + 0.6, player.pos.z + lead.z);
    }
    rig.update(dt);
    updateOcclusion();
    if (G.mode === 'village') {
      village.updateSun(rig.target, day.sunDir);
      village.lightPool.update(dt, rig.target, engine.time, day.night);
      village.update(dt, engine.time);
      sim.update(dt, engine.time);
      buildMode.update(dt);
      ambient.update(dt, engine.time);
      villageAmbience(dt);
    } else {
      dungeon.update(dt, engine.time);
      G.world.updateSun(rig.target);
      G.world.lightPool.update(dt, rig.target, engine.time, 1);
    }
    G.vfx.update(dt);
    G.audio?.update?.(dt, { pos: player.pos, camera: engine.camera });
    G.ui?.update?.(dt);
    engine.render();
    Input.endFrame();
    if (fpsEl) { fpsAcc += dt; fpsN++; if (fpsAcc > 0.5) { fpsEl.textContent = `${Math.round(fpsN / fpsAcc)} fps`; fpsAcc = 0; fpsN = 0; } }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  if (P.has('floor')) setTimeout(() => G.enterDungeon(+P.get('floor')), 100);
  setTimeout(() => { window.__ready = true; }, P.has('floor') ? 2500 : 400);
}

function loadSave() {
  try { const s = localStorage.getItem('chewy3d.save'); if (!s) return null; const st = JSON.parse(s); return st?.version ? st : null; } catch { return null; }
}
