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
import { glowTexture } from './gfx/textures.js';
import { VFX } from './gfx/vfx.js';
import { Ambient } from './gfx/ambient.js';
import { Combat } from './combat/combat.js';
import { SkillRunner } from './combat/skillRunner.js';
import { pupPrewarmRig } from './combat/allies.js';
import { DungeonMode } from './dungeon/dungeonMode.js';
import { GroundLoot } from './combat/groundLoot.js';
import { newGameState, createActions } from './rpg/actions.js';
import { skillRuntime } from './rpg/skills.js';
import { disposeScene } from './gfx/dispose.js';
import { VillageSim } from './world/village.js';
import { BuildMode } from './world/buildMode.js';
import { Story } from './world/story.js';
import { Portraits } from './gfx/portraits.js';
import { BuildingThumbs } from './gfx/thumbs.js';
import { installServices } from './world/services.js';
import { Waterfall } from './world/waterfall.js';
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
  if (G.state.player.life === 0) G.state.player.life = null;
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
  setTimeout(() => vVfx.prewarm(engine.renderer, engine.camera), 200);
  const waterfall = new Waterfall(village, vVfx, { x: village.landmarks.waterfall.x });
  const vCombat = new Combat(G, village);
  const vLoot = new GroundLoot(G, village);
  G.villageLoot = vLoot;
  const sim = G.sim = new VillageSim(G, village);
  G.village = { world: village, vfx: vVfx, ambient, combat: vCombat }; // before init: buildings register chimney smoke with the ambient
  sim.init();
  village.onNewDay = d => { sim.flushDigest(); sim.onNewDay(d); };
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
  // Rosie minds her shop from the front (camera side of the door) so she's always visible
  const shopRec = sim.list.find(r => r.data.type === 'rosieShop');
  const rosieAnchor = shopRec ? { x: shopRec.door.x + 0.9, z: shopRec.door.z + 0.9 } : { x: L.rosieShop.x - 2.4, z: L.rosieShop.z + 0.5 };
  const rosie = new Villager(village, G, CAST.rosie, { id: 'rosie', anchor: rosieAnchor, wander: 1.4, role: 'shop' });
  rosie.speed = 1.8; npcs.push(rosie);
  for (const v of VILLAGERS) npcs.push(new Villager(village, G, v.spec, { id: v.id, anchor: v.anchor, wander: v.wander || 5 }));
  const skills = G.skills = new SkillRunner(G);
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

  // ---- 3D portraits (also replace the UI's SVG busts so the HUD/title/paper doll show the real characters)
  const portraits = new Portraits(engine);
  for (const v of VILLAGERS) portraits.register(v.id, v.spec);
  G.portrait = (id) => portraits.get(id);
  G.thumbs = new BuildingThumbs(engine);
  try {
    const pm = await import('./ui/portraits.js');
    for (const id of ['chewy', 'shadow', 'rosie']) { const url = portraits.get(id); if (url) pm.PORTRAITS[id] = () => `<img class="p3d" src="${url}" alt="" draggable="false" style="width:100%;height:100%;object-fit:cover;display:block">`; }
  } catch (e) { console.warn('[portraits] ui override failed', e); }

  // ---- UI
  if (uiMod?.UI) { G.ui = uiMod.UI; try { G.ui.init(G); G.ui.setMode?.('village'); } catch (e) { console.error('[ui] init failed', e); G.ui = null; } }
  // defensive rate limit: collapse duplicate toasts and cap bursts
  if (G.ui?.toast) {
    const raw = G.ui.toast.bind(G.ui); const recent = new Map(); let bucket = 3, lastT = performance.now();
    G.ui.toast = (text, o) => {
      const now = performance.now(); bucket = Math.min(3, bucket + (now - lastT) / 700); lastT = now;
      if ((recent.get(text) || 0) > now - 2500 || bucket < 1) return;
      recent.set(text, now); bucket -= 1; if (recent.size > 40) recent.clear();
      return raw(text, o);
    };
  }

  // ---- UI hooks: cooldowns, settings, pause-menu save/quit, buffs
  let fpsOn = P.has('fps');
  if (G.ui) {
    G.ui.setSkillProvider?.({ cooldown: id => skills.cooldownFrac(id), remaining: id => skills.cooldown(id) });
    const applySetting = (k, v, all) => {
      if (k === 'music') G.audio?.setVolume?.('music', v);
      if (k === 'sfx') { G.audio?.setVolume?.('sfx', v); G.audio?.setVolume?.('ambience', v * 0.8); }
      if (k === 'shake') engine.rig.shakeMul = v ? 1 : 0;
      if (k === 'quality') {
        engine.renderer.setPixelRatio(Math.min(devicePixelRatio, v >= 2 ? 1.5 : 1));
        engine.post.ao.enabled = v >= 1; engine.post.ao.configuration.halfRes = v < 2; engine.post.tiltPass.enabled = v >= 1;
        engine.resize();
      }
      if (k === 'showFps') fpsOn = !!v;
    };
    G.ui.onSetting?.(applySetting);
    for (const [k, v] of Object.entries(G.ui.settings || {})) applySetting(k, v, G.ui.settings);
    G.ui.onMenu?.({ save: () => { save(); G.ui.toast?.('Game saved ♡', { color: '#8fe0c0' }); }, quit: () => { save(); location.reload(); } });
  }
  const BUFF_INFO = { howl: ['Howl', 'music', '#ff9a6a'], frenzy: ['Zoomies Frenzy', 'bolt', '#ffd84a'], shrineZoom: ['Zoomies Shrine', 'bolt', '#8fe0c0'], shrineLuck: ['Lucky Cat', 'clover', '#ffd84a'], shrineXp: ['Sparkle Shrine', 'sparkle', '#b8a8ff'], cursed: ['Cursed', 'skull', '#b88aff'], shadowPower: ['Pack Call', 'shadowDog', '#8ab8ff'] };
  function syncBuffs() {
    const B = G.combat?.buffs || {}; const list = [];
    for (const [k, b] of Object.entries(B)) { const inf = BUFF_INFO[k]; if (!inf || (k === 'frenzy' && !b.stacks)) continue; list.push({ id: k, name: k === 'frenzy' ? `${inf[0]} ×${b.stacks}` : inf[0], glyph: inf[1], color: inf[2], time: b.t > 0 ? b.t : 0 }); }
    G.ui?.setBuffs?.(list);
  }

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
  Events.on('item:drop', ({ item }) => {
    if (!item) return;
    const loot = G.mode === 'dungeon' ? G.dungeon?.loot : vLoot;
    const p = player.pos.clone();
    loot?.drop(p, [item.kind === 'gem' ? { type: 'gem', item } : { type: 'item', item }]);
    // don't instantly re-grab what we just dropped
    setTimeout(() => { for (const e of loot?.list || []) if (e.d.item === item) e.triedAuto = true; }, 700);
  });
  Events.on('equip:changed', () => player.setWeapon(G.derived.weaponType || 'sword'));
  Events.on('stats:changed', () => shadow.recalc());
  G.audio?.music?.('village_day'); G.audio?.ambience?.('village');

  // ---- camera
  const rig = engine.rig;
  rig.distTarget = 22; rig.focus.copy(player.pos); rig.snap();

  // ---- modes
  let dungeon = null;
  const swapWorld = (world, vfx, combat) => {
    G.world = world; G.vfx = vfx; G.combat = combat;
    engine.setWorld(world);
    player.changeWorld(world); shadow.changeWorld(world);
  };
  // tear down a finished floor completely (entities, loot, lights, GPU resources) so nothing leaks between visits
  function disposeDungeon(d = dungeon) {
    if (!d) return;
    const dc = G.combat === vCombat ? null : G.combat;
    dc?.clear();
    d.dispose();
    d.world.lightPool.clear();
    if (G.vfx !== vVfx) G.vfx.clear();
    disposeScene(d.world.scene, [d.world.mask]);
    for (const k of [...vCombat.entities]) if (k.breakable || k.mode === d) vCombat.remove(k);
    player.interactTarget = null; player.pendingLoot = null; player.moveTarget = null;
    skills.queued = null;
    if (d === dungeon) dungeon = G.dungeon = null;
  }
  G.enterDungeon = (floor = 1) => {
    const go = () => {
      skills.clearAll();
      disposeDungeon();
      dungeon = G.dungeon = new DungeonMode(G);
      // the floor's combat must exist BEFORE build(): breakable pots register themselves with G.combat
      const combat = new Combat(G, null);
      G.combat = combat;
      const world = dungeon.build(floor);
      combat.world = world;
      const vfx = new VFX(engine, world.scene); vfx.setLightPool(world.lightPool);
      swapWorld(world, vfx, combat);
      G.mode = 'dungeon';
      dungeon.start();
      vfx.prewarm(engine.renderer, engine.camera);
      // compile every projectile / decal material now (behind the transition) so the first skill burst doesn't hitch
      for (const kind of ['ball', 'blaze', 'fireball', 'foxfire', 'spark', 'acorn', 'firepot', 'bone', 'moonball']) combat.spawn({ team: 'ally', kind, pos: new THREE.Vector3(0, -60, 0), dir: new THREE.Vector3(1, 0, 0), speed: 1, range: 0.001 });
      vfx.decal(new THREE.Vector3(0, -60, 0), { life: 0.05 }); vfx.decal(new THREE.Vector3(0, -60, 0), { life: 0.05, additive: true });
      const pup = pupPrewarmRig(); pup.root.position.set(0, -60, 0); world.scene.add(pup.root);
      try { engine.renderer.compile(world.scene, engine.camera); } catch (e) { /* ignore */ }
      world.scene.remove(pup.root);
      const s = dungeon.startPos;
      player.setPos(s.x, s.z); player.moveTarget = null; shadow.setPos(s.x + 0.8, s.z + 0.8);
      combat.add(shadow); shadow.recalc();
      rig.distTarget = 27; rig.focus.copy(player.pos); rig.snap();
      G.ui?.setMode?.('dungeon');
      G.ui?.setLocation?.(dungeon.theme.name, `B${floor}F`);
      G.ui?.minimap?.setProvider?.(new DungeonMinimap(G, dungeon));
      G.audio?.music?.(dungeon.layout.boss ? 'boss' : 'dungeon'); G.audio?.ambience?.('dungeon');
      Events.emit('mode:changed', { mode: 'dungeon', floor });
      save();
      // first visit: one short, non-blocking tip from Shadow; the rest arrive when they become useful (see hints())
      if (!G.state.flags.burrowTut) { G.state.flags.burrowTut = true; setTimeout(() => G.mode === 'dungeon' && hint('fight', '*Yip!* Click a monster to bonk it — right-click for Chomp Slash!'), 1800); }
    };
    if (G.ui?.transition) G.ui.transition(go); else go();
  };
  G.returnToVillage = (dead = false) => {
    G.leavingDungeon = true;
    const go = () => {
      G.leavingDungeon = false;
      // a Burrow-only conversation (Shadow's combat tutorial) must not follow Chewy home
      if (G.ui?.dlg?.active && G.tutorialOpen) { G.ui.dlg.finish(-1); G.state.flags.burrowTut = false; }
      skills.clearAll();
      const old = dungeon;
      swapWorld(village, vVfx, vCombat);
      disposeDungeon(old);
      G.mode = 'village';
      const home = dead ? { x: L.chewyHouse.x + 2.2, z: L.chewyHouse.z } : { x: L.dungeon.x, z: L.dungeon.z + 3.2 };
      player.setPos(home.x, home.z); shadow.setPos(home.x + 0.8, home.z + 0.6);
      player.anim.stop(); G.playerDead = false; G.actions.restoreAll(); shadow.fainted = 0; shadow.untargetable = false; shadow.anim.stop(); shadow.recalc(); shadow.life = shadow.lifeMax;
      G.ui?.lootLabel?.clear?.();
      rig.distTarget = 22; rig.focus.copy(player.pos); rig.snap();
      G.ui?.setMode?.('village'); G.ui?.setBoss?.(null);
      engine.post.grade.uniforms.get('uVigColor').value.set(0.55, 0.45, 0.65); engine.post.grade.uniforms.get('uVignette').value = 1.0; day.apply();
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
    G.ui?.banner?.('Oof!', 'Chewy needs a nap… Shadow will drag him home.', { style: 'area' });
    G.audio?.play?.('player_die');
    const lost = Math.floor(G.state.coins * 0.1); if (lost > 0) { G.state.coins -= lost; Events.emit('coins:changed', { coins: G.state.coins }); }
    setTimeout(() => { engine.timeScale = 1; G.returnToVillage(true); }, 2600);
  }

  // ---- interaction helpers
  G.story = new Story(G);
  G.ui?.setQuestProvider?.(() => G.story.uiList());
  G.questTarget = () => (G.titleActive || G.playerDead ? null : G.story.target());
  installServices(G);
  const vMap = new VillageMinimap(G);
  Events.on('village:changed', () => { vMap.dirty = true; });
  G.ui?.minimap?.setProvider?.(vMap);
  G.talkTo = (npc) => {
    if (npc.talking) return;
    npc.talking = true; player.controlLocked = true;
    const done = () => { npc.talking = false; player.controlLocked = false; G.interactCooldown = performance.now() + 350; Input.consume('f'); };
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
  // hero readability: a soft warm light + glow ring that follow Chewy (and a small one for Shadow) at night and
  // in the Burrow, and a stronger rim so the pair never sink into dark scenes
  const heroRing = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#ffd9a0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  heroRing.rotation.x = -Math.PI / 2; heroRing.renderOrder = 7;
  const pupRing = heroRing.clone(); pupRing.material = heroRing.material.clone(); pupRing.material.color.set('#a8c8ff'); pupRing.scale.setScalar(0.6);
  let heroLight = null, heroWorld = null;
  function updateHero(dt) {
    const w = G.world;
    if (heroWorld !== w) {
      heroWorld = w; w.scene.add(heroRing, pupRing);
      heroLight = w._heroLight ||= w.lightPool.addSource({ pos: new THREE.Vector3(), color: new THREE.Color('#ffe2b8'), intensity: 0, radius: 7, priority: 8, noPool: true });
    }
    const dark = G.mode === 'dungeon' ? 1 : day.out.night;
    heroLight.pos.set(player.pos.x, player.pos.y + 2.2, player.pos.z);
    heroLight.intensity = G.mode === 'dungeon' ? 0 : 3.6 * dark; // the Burrow already has its own lantern light on Chewy
    heroRing.position.set(player.pos.x, player.pos.y + 0.05, player.pos.z);
    heroRing.material.opacity = 0.2 * dark * (0.9 + 0.1 * Math.sin(engine.time * 2));
    pupRing.position.set(shadow.pos.x, shadow.pos.y + 0.05, shadow.pos.z);
    pupRing.material.opacity = 0.18 * dark;
    const rim = 0.55 + 0.75 * dark;
    for (const r of [player.rig, shadow.rig]) { const u = r.mat.userData.u; if (u) u.uRimStr.value = r === shadow.rig ? Math.max(1.25, rim + 0.4) : rim; }
  }

  function updateOcclusion() {
    const cam = engine.camera; cam.updateMatrixWorld();
    _o.copy(player.pos).setY(player.pos.y + 0.55);
    const depth = -_o.clone().applyMatrix4(cam.matrixWorldInverse).z;
    _o.project(cam);
    const pr = engine.renderer.getPixelRatio();
    U.uOccl.value.set((_o.x * 0.5 + 0.5) * innerWidth * pr, (_o.y * 0.5 + 0.5) * innerHeight * pr, innerHeight * pr * 0.15, depth);
  }

  // ---- per-frame input
  let hoverEnemy = null;
  function handleInput(dt) {
    if (G.mode === 'village' && Input.hit('b') && !player.controlLocked && !G.ui?.isPaused?.() && !G.ui?.anyModal?.()) { buildMode.active ? buildMode.exit() : buildMode.enter(); }
    if (buildMode.active) {
      if (Input.mouse.wheel) rig.zoom(Input.mouse.wheel);
      if (!G.buildFocus) G.buildFocus = player.pos.clone();
      const { f, r } = rig.groundAxes(); const d = new THREE.Vector3();
      if (Input.down('w')) d.add(f); if (Input.down('s')) d.sub(f); if (Input.down('d')) d.add(r); if (Input.down('a')) d.sub(r);
      G.buildFocus.addScaledVector(d, dt * 16);
      G.buildFocus.x = Math.max(10, Math.min(102, G.buildFocus.x)); G.buildFocus.z = Math.max(10, Math.min(102, G.buildFocus.z));
      if (Input.hit('q')) { rig.yawTarget += Math.PI / 2; Events.emit('sfx', 'ui_tab'); }
      if (Input.hit('e')) { rig.yawTarget -= Math.PI / 2; Events.emit('sfx', 'ui_tab'); }
      return;
    }
    if (G.buildFocus) { G.buildFocus = null; }
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
        if (hoverEnemy && melee && Math.hypot(tgt.x - player.pos.x, tgt.z - player.pos.z) > reach) { skills.approachTo(hb[0] || 'attack', hoverEnemy); } // D2-style: one click walks up and swings
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
    if (it && Input.hit('f') && performance.now() > (G.interactCooldown || 0)) it.onInteract();
    if (Input.mouse.wheel) rig.zoom(Input.mouse.wheel);
    // target frame
    if (hoverEnemy && !hoverEnemy.breakable) G.ui?.setTarget?.({ name: hoverEnemy.name, hp: hoverEnemy.life, max: hoverEnemy.lifeMax, rarity: hoverEnemy.rank, mods: (hoverEnemy.stats.mods || []).map(m => m) });
    else G.ui?.setTarget?.(null);
  }
  function usePotion(key) {
    const eff = G.actions.usePotion(key);
    if (!eff) return;
    if (!player.anim.busy() && !player.leap && !player.dash && !skills.channel) player.anim.play('drink'); // never interrupt an attack or leap
    G.audio?.play?.('potion_drink');
    if (key === 'zoom') G.vfx.sparkle(player.pos.clone().setY(0.8), { n: 12, color: '#8fc8ff' }); else G.vfx.heal(player.pos.clone());
  }

  // ---- contextual hints: one-line tips from Shadow, each shown once, never blocking play
  const H = () => (G.state.flags.hints ||= {});
  // one tip on screen at a time, none mid boss fight except the life-saving potion tip; a tip that has to wait is
  // simply offered again on a later check (its flag is only set once it is shown)
  let hintBusyUntil = 0;
  function hint(id, text) {
    if (H()[id] || !G.ui?.toast) return;
    const now = performance.now();
    if (now < hintBusyUntil) return;
    if (id !== 'potion' && G.mode === 'dungeon' && G.dungeon?.boss?.alive && G.dungeon.boss.aggro) return;
    H()[id] = true; hintBusyUntil = now + 7500;
    G.ui.toast(text.replace(/\*/g, ''), { color: '#9fd0ff', iconURL: G.portrait('shadow'), duration: 7, sub: 'Shadow' });
    G.audio?.play?.('bark_small', { vol: 0.5 });
  }
  G.hint = hint;
  let hintT = 0;
  function hints(dt) {
    hintT -= dt; if (hintT > 0 || G.playerDead) return; hintT = 0.5;
    if (G.ui?.dlg?.active) return;
    const D = G.derived, st = G.state;
    if (G.mode === 'dungeon' && G.dungeon) {
      if (G.actions.life() < D.lifeMax * 0.5 && st.potions.heart > 0) hint('potion', 'Ouch! Press Q to munch a Heart Treat.');
      if (st.player.skillPts > 0 && st.player.lvl >= 2) hint('skills', 'You have a skill point! Press K to learn something new.');
      if (st.player.statPts > 0 && st.player.lvl >= 2 && H().skills) hint('stats', 'Stat points too! Press C to get stronger.');
      const sp = G.dungeon.stairsPos; if (sp && sp.distanceTo(player.pos) < 7) hint('stairs', 'Stairs! Press F to burrow deeper.');
      if (G.dungeon.monsters.some(m => m.alive && m.aggro && m.def.attack?.type === 'ranged' && m.pos.distanceTo(player.pos) < 9)) hint('ball', 'They throw things! Press X to swap to your tennis ball — Space to roll away.');
      if ((G.dungeon.loot?.list || []).some(e => e.d.type === 'item' && e.to.distanceTo(player.pos) < 5)) hint('loot', 'Shiny! Walk over loot to grab it. Press I to see your bag.');
    } else if (G.mode === 'village' && !G.titleActive) {
      if (st.quests.done.includes('burrow1') && !G.buildMode) hint('build', 'Press B to plan the village — paint zones and friends will build there!');
    }
  }

  // ---- save / load
  function save() { try { if (G.playerDead || G.state.player.life === 0) G.state.player.life = null; /* never persist a knocked-out Chewy */ G.state.hour = day.hour; G.state.day = day.day; localStorage.setItem('chewy3d.save', JSON.stringify(G.state)); } catch (e) { /* storage unavailable */ } }
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
      rig.yawTarget = Math.PI / 4; rig.yaw = rig.yawTarget; rig.distTarget = 22;
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
    rosie.talking = true; rosie.state = 'idle';
    // side by side across the screen, both turned a little toward the camera so faces read, with Shadow in front of the
    // pair. Pick the nearest spot where all three stand on open ground: no benches, lamps, walls or trees in the shot.
    { const { f, r } = rig.groundAxes();
      const clear = (x, z, rad) => {
        for (let a = 0; a < 8; a++) for (const d of [0, rad * 0.5, rad]) {
          const px = x + Math.cos(a * 0.785) * d, pz = z + Math.sin(a * 0.785) * d;
          if (!G.world.walkable(px, pz) || G.world.collision.solidAt(px, pz, 0.1) || G.sim.buildingAt(px, pz)) return false;
        }
        return true;
      };
      const spots = (c) => ({ chewy: c.clone().addScaledVector(r, -0.8), rosie: c.clone().addScaledVector(r, 0.8).addScaledVector(f, 0.35), shadow: c.clone().addScaledVector(f, -1.0) });
      let best = null;
      for (let ring = 0; ring <= 8 && !best; ring++) for (let k = 0; k < Math.max(1, ring * 6) && !best; k++) {
        const a = k / Math.max(1, ring * 6) * Math.PI * 2, c = player.pos.clone().add(new THREE.Vector3(Math.cos(a) * ring * 0.9, 0, Math.sin(a) * ring * 0.9));
        const s = spots(c);
        if (clear(s.chewy.x, s.chewy.z, 1.1) && clear(s.rosie.x, s.rosie.z, 1.1) && clear(s.shadow.x, s.shadow.z, 0.8)) best = s;
      }
      best ||= spots(player.pos.clone().addScaledVector(r, 0.8));
      player.setPos(best.chewy.x, best.chewy.z); rosie.setPos(best.rosie.x, best.rosie.z);
      shadow.setPos(best.shadow.x, best.shadow.z); shadow.hold = { x: best.shadow.x, z: best.shadow.z, face: Math.atan2(-f.x, -f.z) }; }
    rosie.faceTo(player.pos.x, player.pos.z); player.faceTo(rosie.pos.x, rosie.pos.z);
    rosie.faceBias = 0.5; player.faceTarget -= 0.5; player.facing = player.faceTarget;
    rosie.anim.play('wave'); G.vfx.emote(rosie, 'heart', 2.2);
    // frame both of them
    const prevDist = rig.distTarget; G.introFocus = player.pos.clone().lerp(rosie.pos, 0.5); rig.distTarget = 20;
    const pr = G.portrait('rosie');
    await G.ui.dialogue({ speaker: 'Rosie', portrait: pr, lines: ["Good morning, Chewy! ♡ Did you sleep well? Shadow did. He snored like a tiny tractor.", "Welcome to *Blossom Hollow*! The sakura are blooming and everyone is so happy you're here."] });
    await G.ui.dialogue({ speaker: 'Rosie', portrait: pr, lines: ['Walk with *WASD* or click the ground. Press *F* near friends to chat.', 'Press *B* to plan the village — paint zones for homes, shops and workshops, then watch it grow!', "And… there's something squeaky in *the Burrow* on the shrine hill. Take your Bone Sword — and your red tennis ball!"] });
    G.introFocus = null; rig.distTarget = prevDist; shadow.hold = null;
    rosie.talking = false; rosie.faceBias = 0; rosie.greeted = 30; rosie.state = 'idle'; rosie.t = 4;
    player.controlLocked = false;
    G.story.markTalk('rosie');
    G.ui?.toast?.('Tip: I bag · K skills · C character · J quests · X swap weapon', { color: '#8fd0ff' });
  }

  // ---- floating quest markers over NPCs ('!' something for you, '?' quest giver, gift = friendship reward)
  const markers = new Map();
  let markerT = 0;
  function updateMarkers(dt) {
    markerT -= dt;
    if (markerT <= 0) {
      markerT = 0.5;
      for (const n of npcs) {
        const kind = G.mode === 'village' && n.visible ? G.story.markerFor(n.id) : null;
        let m = markers.get(n);
        if (!kind) { if (m) m.visible = false; continue; }
        if (!m) { m = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false, toneMapped: false })); m.renderOrder = 25; village.scene.add(m); markers.set(n, m); }
        if (m.userData.kind !== kind) { m.material.map = vVfx.emoteTexture(kind === 'gift' ? 'gift' : kind); m.material.needsUpdate = true; m.userData.kind = kind; }
        m.visible = !n.talking;
      }
    }
    const t = engine.time;
    for (const [n, m] of markers) if (m.visible) { m.position.set(n.pos.x, n.pos.y + (n.rig.height || 1.2) + 0.75 + Math.sin(t * 3 + n.pos.x) * 0.08, n.pos.z); m.scale.setScalar(0.62 + Math.sin(t * 6) * 0.02); }
  }

  // ---- main loop
  let fpsAcc = 0, fpsN = 0; const fpsEl = Object.assign(document.body.appendChild(document.createElement('div')), { style: 'position:fixed;left:8px;bottom:8px;color:#fff;font:12px monospace;z-index:99;text-shadow:0 1px 2px #000' });
  function frame() {
    const rdt = engine.tick();
    // pause gameplay for the pause menu, and in the Burrow while reading dialogue (nothing should hit Chewy mid-sentence)
    const paused = G.ui?.isPaused?.() || (G.mode === 'dungeon' && G.ui?.dlg?.active);
    const dt = paused ? 0 : rdt;
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
    if (G.introFocus) rig.focus.set(G.introFocus.x, player.pos.y + 0.6, G.introFocus.z);
    else if (buildMode.active && G.buildFocus) rig.focus.set(G.buildFocus.x, player.pos.y + 0.6, G.buildFocus.z);
    else if (!G.titleActive) {
      const lead = new THREE.Vector3(Math.sin(player.facing), 0, Math.cos(player.facing)).multiplyScalar(Math.min(1, player.anim.speed / 4) * 1.2);
      rig.focus.set(player.pos.x + lead.x, player.pos.y + 0.6, player.pos.z + lead.z);
    }
    rig.update(dt);
    updateOcclusion();
    updateHero(rdt);
    if (G.mode === 'village') {
      village.updateSun(rig.target, day.sunDir);
      village.lightPool.update(dt, rig.target, engine.time, day.night);
      village.update(dt, engine.time);
      sim.update(dt, engine.time);
      buildMode.update(dt);
      ambient.update(dt, engine.time);
      if (player.pos.z < 40) waterfall.update(dt, engine.time, day);
      villageAmbience(dt);
      vLoot.update(dt);
      updateMarkers(rdt);
    } else {
      dungeon.update(dt, engine.time);
      G.world.updateSun(rig.target);
      G.world.lightPool.update(dt, rig.target, engine.time, 1);
    }
    G.vfx.update(dt);
    syncBuffs();
    hints(rdt);
    G.audio?.update?.(dt, { pos: player.pos, camera: engine.camera });
    G.ui?.update?.(rdt);
    engine.render();
    Input.endFrame();
    if (fpsEl) { fpsEl.style.display = fpsOn ? '' : 'none'; fpsAcc += dt; fpsN++; if (fpsAcc > 0.5) { fpsEl.textContent = `${Math.round(fpsN / fpsAcc)} fps`; fpsAcc = 0; fpsN = 0; } }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  if (P.has('floor')) setTimeout(() => G.enterDungeon(+P.get('floor')), 100);
  setTimeout(() => { window.__ready = true; const b = document.getElementById('boot'); if (b) { b.classList.add('gone'); setTimeout(() => b.remove(), 700); } }, P.has('floor') ? 2500 : 400);
}

function loadSave() {
  try { const s = localStorage.getItem('chewy3d.save'); if (!s) return null; const st = JSON.parse(s); return st?.version ? st : null; } catch { return null; }
}
