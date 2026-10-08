// Game orchestrator: boot, village <-> dungeon modes, input routing, combat input, death, main loop.
import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { Actions } from './core/actions.js';
import { Touch } from './core/touch.js';
import { FPS_CAPS, PRESET, liteOf } from './core/deck.js';
import { PARTICLE_BUDGET } from './gfx/particles.js';
import { PadAim } from './combat/padAim.js';
import { Events } from './core/events.js';
import { VillageWorld } from './world/villageWorld.js';
import { DayNight } from './gfx/sky.js';
import { Player } from './actors/player.js';
import { Companion } from './actors/companion.js';
import { Villager } from './actors/npc.js';
import { CAST, REFINED_CAST, prebuildHumanoid } from './actors/charKit.js';
import { loadRefinedRigs } from './actors/refinedRigs.js';
import { chewyStyle, setChewyStyle } from './actors/disneyChewy.js';
import { loadHeroModels, chewyModel, setChewyModel, CHEWY_MODELS, heroModelReady, buildHeroModel } from './actors/heroModels.js';
import { VILLAGERS, randomVillagerSpec } from './actors/roster.js';
import { U } from './gfx/materials.js';
import { glowTexture } from './gfx/textures.js';
import { VFX } from './gfx/vfx.js';
import { Ambient } from './gfx/ambient.js';
import { Combat } from './combat/combat.js';
import { SkillRunner } from './combat/skillRunner.js';
import { pupPrewarmRig } from './combat/allies.js';
import { DungeonMode } from './dungeon/dungeonMode.js';
import { RegionMode } from './regions/regionMode.js';
import { REGIONS, REGION_IDS, regionState, regionUnlocked } from './regions/index.js';
import { normRun, dungeonDef } from './dungeon/defs.js';
import { normalizeZones, recordDungeonClear, TIER_DUNGEONS } from './rpg/zones.js';
import { installTierDebug } from './dungeon/tierRun.js';
import { installLanternApi, installBurrowLantern } from './regions/spiritLantern.js';
import { villageReady, VILLAGES } from './regions/village/data.js';
import { zoneNpcRig } from './actors/zoneVillagers.js';
import { soakChip } from './rpg/zoneBuffs.js';
import { addTravelPost } from './world/travelPost.js';
import { installGateDebug, gateDef } from './regions/dungeonGate.js';
import { MONSTERS } from './dungeon/monsters.js';
import { GroundLoot } from './combat/groundLoot.js';
import { newGameState, createActions, normalizeHeroes, saveableState } from './rpg/actions.js';
import { CLASSES } from './rpg/classes.js';
import { HeroManager } from './actors/heroes.js';
import { loadWhelp, dressWings } from './actors/whelp.js';
import { loadGoldenProps } from './actors/goldenGear.js';
import { skillRuntime } from './rpg/skills.js';
import { disposeScene } from './gfx/dispose.js';
import { VillageSim } from './world/village.js';
import { BuildMode } from './world/buildMode.js';
import { Story } from './world/story.js';
import { Portraits } from './gfx/portraits.js';
import { BuildingThumbs } from './gfx/thumbs.js';
import { installServices } from './world/services.js';
import { Waterfall } from './world/waterfall.js';
import { VillageMinimap, DungeonMinimap, RegionMinimap } from './world/minimap.js';
import { prewarmWorld } from './world/prewarm.js';
import { WORLD } from './world/layout.js';
import { installLife } from './life/index.js';
import { Tutorials } from './world/tutorials.js';
import { installHousing } from './home/housing.js';
import { installDebugAccess } from './debug/access.js';

// UI and audio load in parallel with the world. The import() paths must be literal so Vite bundles them for the
// production build (a variable path with @vite-ignore worked on the dev server but 404'd in dist: no UI, no sound).
async function tryImport(name, load) { try { return await load(); } catch (e) { console.warn('[boot] optional module missing', name, e.message); return null; } }

export async function boot() {
  const engine = new Engine();
  Input.init(engine.renderer.domElement);
  Actions.init(); // the action layer over Input + the gamepad (core/actions.js, docs/CONTROLS.md)
  const P = engine.params;
  const G = window.G = { engine, input: Input, controls: Actions, events: Events, THREE, mode: 'village', ui: null, audio: null, playerDead: false };

  // ---- persistent state + actions
  const saved = !P.has('fresh') && loadSave();
  G.state = normalizeZones(normalizeHeroes(saved || newGameState())); // one progression per hero, state.player = the active hero (docs/HEROES.md); state.zones, migrated from state.regions (rpg/zones.js)
  if (P.has('hero') && G.state.heroes[P.get('hero')]) { // debug / tests: start as another hero (?hero=moka)
    const id = P.get('hero'); G.state.activeHero = id; G.state.player = G.state.heroes[id].player; G.state.equipment = G.state.heroes[id].equipment;
    if (id !== 'chewy') G.state.flags[`${id}Joined`] = true;
  }
  if (G.state.player.life === 0) G.state.player.life = null;
  // dungeon layouts reroll per entry (dungeon/defs.js beginRun); ?dseed=N pins them for the tab (the QA's fixed floors:
  // dseed=1 is the old fixed Burrow), ?dseed=off lets them roll again
  {
    let ds = P.get('dseed');
    try { if (ds === 'off') sessionStorage.removeItem('chewy3d.dseed'); else if (ds != null) sessionStorage.setItem('chewy3d.dseed', ds); else ds = sessionStorage.getItem('chewy3d.dseed'); } catch (e) { /* storage unavailable */ }
    G.dseed = ds != null && ds !== 'off' && Number.isFinite(+ds) ? +ds : null;
  }
  G.actions = createActions(G);
  G.actions.recompute();
  G.skillParams = (id) => skillRuntime(id, G.state, G.derived)?.params;

  // Blender-refined skins for Chewy and Shadow must be in memory before their rigs (and portraits) are built
  const [uiMod, audioMod] = await Promise.all([P.has('noui') ? null : tryImport('ui', () => import('./ui/ui.js')), P.has('noaudio') ? null : tryImport('audio', () => import('./audio/audio.js')), loadRefinedRigs(REFINED_CAST), loadHeroModels(['chewy', 'moka', 'poe', 'shihtzu', 'golden', 'shadow', 'rosie']), loadWhelp()]); // (loadWhelp: Shadow's dragon whelp outfit and its wing prop, worn while the dragoon is played: actors/whelp.js)
  loadGoldenProps(); // (the dragoon's lance and javelin props: actors/goldenGear.js; procedural stand-ins until they land) // (poe: while her model is pending, heroModels.js fetches nothing)
  G.audio = audioMod?.Audio || null;
  try { G.audio?.init?.(); } catch (e) { console.warn('[audio] init failed', e); }

  // ---- village
  const village = new VillageWorld(engine, { rank: G.state.village?.ringRank || 1 }); // (ring streets already unlocked are paved)
  const day = G.day = new DayNight(village, engine.post);
  day.hour = P.has('hour') ? +P.get('hour') : (G.state.hour ?? 8.5);
  day.day = G.state.day || 1;
  const vVfx = new VFX(engine, village.scene); vVfx.setLightPool(village.lightPool);
  G.vfx = vVfx;
  const ambient = new Ambient(G, village, vVfx);
  setTimeout(() => vVfx.prewarm(engine.renderer, engine.camera), 200);
  const waterfall = new Waterfall(village, vVfx); // (at LANDMARKS.waterfall)
  const vCombat = new Combat(G, village);
  const vLoot = new GroundLoot(G, village);
  G.villageLoot = vLoot;
  const sim = G.sim = new VillageSim(G, village);
  G.village = { world: village, vfx: vVfx, ambient, combat: vCombat }; // before init: buildings register chimney smoke with the ambient
  sim.init();
  village.onNewDay = d => { sim.flushDigest(); sim.onNewDay(d); G.life?.onNewDay(d); }; // (+ the homestead: crops grow overnight)
  const buildMode = G.build = new BuildMode(G, sim);
  G.village = { world: village, vfx: vVfx, ambient, combat: vCombat };
  G.world = village; G.combat = vCombat;
  engine.setWorld(village);

  // ---- actors
  const L = village.landmarks;
  const player = G.player = new Player(village, G, G.state.activeHero);
  player.setPos(L.spawn.x, L.spawn.z); player.faceTarget = player.facing = Math.PI * 0.25;
  player.setWeapon(G.derived.weaponType || 'sword');
  const shadow = G.companion = new Companion(village, G);
  shadow.setPos(L.spawn.x + 1, L.spawn.z - 0.8); shadow.recalc();
  const npcs = G.npcs = [];
  // Rosie minds her shop from the front (camera side of the door) so she's always visible
  const shopRec = sim.list.find(r => r.data.type === 'rosieShop');
  const rosieAnchor = shopRec ? { x: shopRec.door.x + 0.9, z: shopRec.door.z + 0.9 } : { x: L.rosieShop.x - 2.4, z: L.rosieShop.z + 0.5 };
  const rosie = new Villager(village, G, CAST.rosie, { id: 'rosie', anchor: rosieAnchor, wander: 1.4, role: 'shop', rig: heroModelReady('rosie') ? buildHeroModel('rosie') : null }); // the Toybox Rosie when it's loaded
  rosie.speed = 1.8; npcs.push(rosie);
  for (const v of VILLAGERS) npcs.push(new Villager(village, G, v.spec, { id: v.id, anchor: v.anchor, wander: v.wander || 5 }));
  const skills = G.skills = new SkillRunner(G);
  // the heroes nobody is playing live in town (Moka waits by the fountain until she joins)
  const heroes = G.heroes = new HeroManager(G);
  heroes.spawnBench();
  // townsfolk move in as homes fill up (capped for performance)
  const folk = [], FOLK_MAX = 16;
  // Building a villager costs ~20 ms: a visible hitch if it happens mid-play. Newcomers' rigs are pre-built while
  // nobody can see a hitch (boot, title, dialogue, menus, the Burrow) and move in from this pool; newcomers arrive
  // one per check, and only wait when the pool is empty and the village is on screen.
  const folkPool = [];
  const hitchHidden = () => G.titleActive || (G.mode !== 'village' && G.mode !== 'interior') || (G.ui?.hidesHitches ? G.ui.hidesHitches() : G.ui?.dlg?.active || G.ui?.anyModal?.()); // (an interior is on screen: no hitches there either; a menu only once it has finished opening: ui.js hidesHitches)
  const stockFolk = () => { if (folk.length + folkPool.length < FOLK_MAX) folkPool.push(prebuildHumanoid(randomVillagerSpec())); };
  for (let i = 0; i < 6; i++) stockFolk(); // behind the boot splash
  setInterval(() => { if (hitchHidden()) stockFolk(); }, 350);
  function syncTownsfolk() {
    const homes = sim.list.filter(r => r.data.type === 'home' && (r.data.residents || 0) > 0);
    const want = Math.min(FOLK_MAX, Math.max(0, Math.round(sim.stats.population * 0.6) - 4));
    if (folk.length < want && homes.length) {
      if (!folkPool.length && !hitchHidden()) return; // wait for a pre-built rig rather than hitch on screen
      const h = homes[folk.length % homes.length];
      const spec = folkPool.shift() || randomVillagerSpec();
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

  addTravelPost(G, village); // the Wayfarer's Post: the Travel Map to the outdoor regions
  // fallback gate interaction if the Burrow landmark is missing
  if (!sim.S.buildings.some(b => b.type === 'dungeonGate')) village.interactables.push({ pos: new THREE.Vector3(L.dungeon.x, village.heightAt(L.dungeon.x, L.dungeon.z), L.dungeon.z + 1.6), radius: 1.8, label: 'Enter the Burrow', onInteract: () => G.openBurrowMenu() });

  // ---- 3D portraits (also replace the UI's SVG busts so the HUD/title/paper doll show the real characters)
  const portraits = new Portraits(engine);
  for (const v of VILLAGERS) portraits.register(v.id, v.spec);
  portraits.register('moka', CAST.moka);
  portraits.register('poe', CAST.poe);
  portraits.register('shihtzu', CAST.shihtzu);
  portraits.register('golden', CAST.golden);
  portraits.dresser('shadowWhelp', dressWings); // (the whelp's bust: his wings peek over his shoulders)
  // Shadow's face is the whelp's while the dragoon is played (his tips, the HUD's companion card: actors/whelp.js)
  G.portrait = (id) => portraits.get(id === 'shadow' && G.companion?.whelp?.on ? 'shadowWhelp' : id);
  G.registerPortrait = (id, spec) => { if (!portraits.specs.has(id)) portraits.register(id, spec); }; // (zone villagers: src/regions/village)
  G.zoneNpcBuilder = (id) => zoneNpcRig(id); // a fresh Toybox rig of a zone villager (phase C's dungeon cages; the caller disposes it)
  G.thumbs = new BuildingThumbs(engine);
  try {
    const pm = await import('./ui/portraits.js');
    for (const id of ['chewy', 'shadow', 'rosie', 'moka', 'poe', 'shihtzu', 'golden']) { const url = portraits.get(id); if (url) pm.PORTRAITS[id] = () => `<img class="p3d" src="${url}" alt="" draggable="false" style="width:100%;height:100%;object-fit:cover;display:block">`; }
    { // Shadow's bust follows his outfit (the whelp while the dragoon is played); a swap re-renders the HUD's companion face
      const img = url => (url ? `<img class="p3d" src="${url}" alt="" draggable="false" style="width:100%;height:100%;object-fit:cover;display:block">` : '');
      const plain = pm.PORTRAITS.shadow;
      pm.PORTRAITS.shadow = () => (G.companion?.whelp?.on ? img(G.portrait('shadow')) || plain?.() : plain?.() || '');
      Events.on('whelp:swap', () => { for (const el of document.querySelectorAll('.pal-face')) el.innerHTML = pm.PORTRAITS.shadow(); });
    }
    G.refreshChewyPortrait = () => { // after a model swap: re-render the bust and update the HUD face
      portraits.cache.delete('chewy'); const url = portraits.get('chewy'); if (!url) return;
      pm.PORTRAITS.chewy = () => `<img class="p3d" src="${url}" alt="" draggable="false" style="width:100%;height:100%;object-fit:cover;display:block">`;
      for (const el of document.querySelectorAll('.pc-face')) el.innerHTML = pm.PORTRAITS.chewy();
    };
  } catch (e) { console.warn('[portraits] ui override failed', e); }

  // ---- UI
  if (uiMod?.UI) { G.ui = uiMod.UI; try { G.ui.init(G); G.ui.setMode?.('village'); } catch (e) { console.error('[ui] init failed', e); G.ui = null; } }
  if (G.ui) { // Settings > Disney style: the sculpted cast (Disney Chewy + disneyKit villagers) or the classic toon kit.
    // Every character is built at boot, so switching saves and reloads (the save keeps all progress).
    G.ui.settings.disneyChewy = chewyStyle() === 'disney';
    G.ui.settings.heroModel = Math.max(0, CHEWY_MODELS.indexOf(chewyModel())); // Hero models: the samurai Chewy, the Toybox one or the Storybook heroes (all need the Disney style)
    G.ui.onSetting((k, v) => {
      if (k === 'heroModel') {
        const m = CHEWY_MODELS[v] || 'samurai'; setChewyModel(m);
        G.ui.toast?.(m === 'samurai' ? 'Switching to the samurai Chewy…' : m === 'toy' ? 'Switching to the Toybox heroes…' : 'Switching to the Storybook heroes…');
        setTimeout(() => { try { G.save?.(); } catch (e) { console.warn('[style] save failed', e); } location.reload(); }, 450);
        return;
      }
      if (k !== 'disneyChewy') return;
      setChewyStyle(v ? 'disney' : 'classic');
      G.ui.toast?.(v ? 'Switching to the Disney style…' : 'Switching to the classic style…');
      setTimeout(() => { try { G.save?.(); } catch (e) { console.warn('[style] save failed', e); } location.reload(); }, 450);
    });
  }
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
  let fpsOn = P.has('fps'), capMs = 0, capT = 0, settingsBooted = false; // capMs: Settings › Frame cap (frame() below)
  if (G.ui) {
    G.ui.setSkillProvider?.({ cooldown: id => skills.cooldownFrac(id), remaining: id => skills.cooldown(id) });
    const applySetting = (k, v, all) => {
      if (k === 'music') G.audio?.setVolume?.('music', v);
      if (k === 'sfx') { G.audio?.setVolume?.('sfx', v); G.audio?.setVolume?.('ambience', v * 0.8); }
      if (k === 'shake') engine.rig.shakeMul = v ? 1 : 0;
      if (k === 'quality') { // (core/deck.js: 3 is the Steam Deck preset, 4 Mobile)
        engine.applyPreset(v);
        PARTICLE_BUDGET.scale = liteOf(v)?.particles ?? 1; G.particleBudget = PARTICLE_BUDGET; // (G: for the QA)
        const tier = v === PRESET.DECK ? PRESET.MED : v === PRESET.MOBILE ? PRESET.LOW : v; // (the density the worlds build with: R-2, at the next start)
        if (settingsBooted && tier !== engine.quality) G.ui.toast?.('Grass and scenery detail change at the next start', { icon: 'eye', color: '#ffe0a8' });
      }
      if (k === 'fpsCap') capMs = FPS_CAPS[v] ? 1000 / FPS_CAPS[v] : 0;
      if (k === 'showFps') fpsOn = !!v;
    };
    G.ui.onSetting?.(applySetting);
    for (const [k, v] of Object.entries(G.ui.settings || {})) applySetting(k, v, G.ui.settings);
    settingsBooted = true;
    G.ui.onMenu?.({ save: () => { save(); G.ui.toast?.('Game saved ♡', { color: '#8fe0c0' }); }, quit: () => { save(); location.reload(); } });
  }
  const BUFF_INFO = { howl: ['War Banner', 'music', '#ff9a6a'], frenzy: ['Flowing Water', 'bolt', '#ffd84a'], shrineZoom: ['Zoomies Shrine', 'bolt', '#8fe0c0'], shrineLuck: ['Lucky Cat', 'clover', '#ffd84a'], shrineXp: ['Sparkle Shrine', 'sparkle', '#b8a8ff'], cursed: ['Cursed', 'skull', '#b88aff'], shadowPower: ['Pack Call', 'shadowDog', '#8ab8ff'], moonlit: ['Moonlit Rally', 'moon', '#ffb080'] };
  function syncBuffs() {
    const B = G.combat?.buffs || {}; const list = [];
    for (const [k, b] of Object.entries(B)) { const inf = BUFF_INFO[k]; if (!inf || (k === 'frenzy' && !b.stacks)) continue; list.push({ id: k, name: k === 'frenzy' ? `${inf[0]} ×${b.stacks}` : inf[0], glyph: inf[1], color: inf[2], time: b.t > 0 ? b.t : 0 }); }
    const meal = G.life?.kitchen?.mealBuff(); if (meal) list.unshift(meal); // Well Fed (life/meals.js)
    const soak = soakChip(G); if (soak) list.unshift(soak); // Onsen Glow (rpg/zoneBuffs.js)
    G.ui?.setBuffs?.(list);
  }

  // ---- audio routing
  const SFX_ALIAS = { block: ['ball_bounce', { pitch: 0.7 }], ball_catch: ['pickup_item', { vol: 0.5 }], squeak: ['slime_bounce', { pitch: 1.9 }], pot_break: ['explosion_small', { pitch: 1.6, vol: 0.6 }], villager_greet: ['villager_chatter', {}] };
  Events.on('sfx', (name, o = {}) => {
    const a = SFX_ALIAS[name];
    if (a) { const [n, extra] = a; if (n === 'villager_chatter') G.audio?.babble?.('hello!', { pitch: o.pitch || 1, pos: o.pos, vol: 0.5 }); else G.audio?.play?.(n, { ...o, ...extra }); return; }
    G.audio?.play?.(name, o);
  });
  const stepSound = () => { if (G.mode === 'interior') return 'footstep_wood'; if (G.mode !== 'dungeon') return 'footstep_grass'; if (G.dungeon?.isRegion) return G.dungeon.region.footstep?.(G.player.pos, G.world) || 'footstep_grass'; const th = G.dungeon?.layout?.theme; return th === 'shrine' || th === 'moon' || th === 'kitchen' ? 'footstep_wood' : 'footstep_stone'; };
  Events.on('footstep', (p) => { G.audio?.play?.(stepSound(), { vol: 0.35 }); if (Math.random() < 0.5) G.vfx.dust(p, { n: 1, size: 0.18 }); });
  Events.on('emote', ({ actor, kind }) => G.vfx.emote(actor, kind));
  Events.on('player:levelup', ({ lvl }) => { G.vfx.levelUp(player.pos.clone()); G.ui?.banner?.('Level Up!', `${player.name} is now level ${lvl}`, { style: 'levelup' }); G.audio?.play?.('ui_levelup'); G.actions.restoreAll(); shadow.recalc(); });
  Events.on('player:dead', () => onPlayerDeath());
  Events.on('item:drop', ({ item }) => {
    if (!item) return;
    if (G.mode === 'interior') { if (!G.actions.pickup(item)) G.story?.giveItem?.(item); G.ui?.toast?.('No dropping things indoors — it went back in your bag', { color: '#ffd8a8' }); return; } // (houses have no ground loot)
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
  G.swapWorld = swapWorld; // (housing: the interiors swap in and out the same way)
  // tear down a finished floor completely (entities, loot, lights, GPU resources) so nothing leaks between visits
  function disposeDungeon(d = dungeon) {
    if (!d) return;
    const dc = G.combat === vCombat ? null : G.combat;
    dc?.clear();
    d.dispose();
    d.world.lightPool.clear();
    if (G.vfx !== vVfx) G.vfx.clear();
    pupPrewarmRig().root.removeFromParent(); // the session-long prewarm pup must never be disposed with a floor
    disposeScene(d.world.scene, [d.world.mask, d.world.decoTex]); // data textures held in uniforms
    for (const k of [...vCombat.entities]) if (k.breakable || k.mode === d) vCombat.remove(k);
    player.interactTarget = null; player.pendingLoot = null; player.moveTarget = null;
    skills.queued = null;
    if (d === dungeon) dungeon = G.dungeon = null;
  }
  // A combat world: a Burrow floor (DungeonMode) or an outdoor region (RegionMode, docs/REGIONS.md) — same entry sequence.
  function enterCombatWorld(makeMode, buildArg, { location, sub, floor = null, region = null, tip = true }) {
    const go = () => {
      if (G.mode === 'interior') G.housing?.goOut(); // (only reachable from debug / tests: houses have no Burrow door)
      skills.clearAll();
      disposeDungeon();
      dungeon = G.dungeon = makeMode();
      // the floor's combat must exist BEFORE build(): breakable pots register themselves with G.combat
      const combat = new Combat(G, null);
      G.combat = combat;
      const world = dungeon.build(buildArg);
      combat.world = world;
      const vfx = new VFX(engine, world.scene); vfx.setLightPool(world.lightPool);
      swapWorld(world, vfx, combat);
      G.mode = 'dungeon';
      if (G.playerDead) { player.anim.stop(); G.playerDead = false; G.actions.restoreAll(); shadow.fainted = 0; shadow.untargetable = false; shadow.anim.stop(); shadow.life = shadow.lifeMax; } // (a zone respawn: G.zoneRespawn)
      dungeon.start();
      vfx.prewarm(engine.renderer, engine.camera);
      // every projectile look (ball, blaze, fireball, foxfire, pots...) is compiled AND drawn below the floor for the same
      // few frames as the pup below (vfx.prewarm does the same for rings / slashes / decals), so the first Chomp / Blaze
      // doesn't pay for the driver's shader finish and texture uploads
      const looks = combat.projectileLooks(); for (const m of looks) { m.position.set(0, -60, 0); m.traverse(o => { o.frustumCulled = false; }); world.scene.add(m); }
      // the prewarm pup is also DRAWN for a few real frames (culling off, far below the floor, behind the transition):
      // compile() only links programs — the GPU driver builds the final shader and uploads the skinned geometry / bone
      // texture at the first real draw, which otherwise lands on the first Pack Call as a 35-50 ms frame
      const pup = pupPrewarmRig(); pup.root.position.set(0, -60, 0); world.scene.add(pup.root);
      pup.root.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
      try { engine.renderer.compile(world.scene, engine.camera); } catch (e) { /* ignore */ }
      let pupFrames = 0; const pupOut = () => { if (++pupFrames < 3 && pup.root.parent === world.scene) requestAnimationFrame(pupOut); else world.scene.remove(pup.root, ...looks); };
      requestAnimationFrame(pupOut);
      const s = dungeon.startPos;
      player.setPos(s.x, s.z); player.moveTarget = null; shadow.setPos(s.x + 0.8, s.z + 0.8);
      combat.add(shadow); shadow.recalc();
      rig.distTarget = region ? 24 : 27; rig.focus.copy(player.pos); rig.snap();
      G.ui?.setMode?.('dungeon');
      G.ui?.setLocation?.(location(), sub);
      G.ui?.minimap?.setProvider?.(region ? new RegionMinimap(G, dungeon) : new DungeonMinimap(G, dungeon));
      G.audio?.music?.(dungeon.layout.boss && !region ? 'boss' : 'dungeon'); G.audio?.ambience?.('dungeon');
      Events.emit('mode:changed', { mode: 'dungeon', floor: floor == null ? null : dungeon.floor, region, ...dungeon.where() }); // (+ zone, dungeon, tier: docs/ZONES.md §8)
      save();
      // first visit: one short, non-blocking tip from Shadow; the rest arrive when they become useful (see hints())
      if (tip && !G.state.flags.burrowTut) { G.state.flags.burrowTut = true; setTimeout(() => G.mode === 'dungeon' && hint('fight', player.hero === 'moka' ? '*Yip!* Click a monster to zap it — right-click for Splash Bolt!' : player.hero === 'poe' ? '*Yip!* Click a monster to slash it — right-click to throw your fūma (it comes back)!' : player.hero === 'shihtzu' ? '*Yip!* Click a monster to wallop it with your flail — right-click for Woeful Wallop, 1 for a Dripping Paw hex!' : player.hero === 'golden' ? '*Rawr!* (a very small rawr) Click a monster to poke it with your lance — right-click for Sunbeam Thrust, 1 to toss a Bonk Dart!' : '*Yip!* Click a monster to slice it — right-click for Crescent Chomp!'), 1800); }
    };
    if (G.ui?.transition) G.ui.transition(go); else go();
  }
  // A dungeon floor: G.enterDungeon({ id, floor, tier, mods }) (dungeon/defs.js DUNGEONS: 'burrow', the zone dungeons), or
  // G.enterDungeon(n), the Burrow's floor n as before
  G.enterDungeon = (arg = 1) => {
    const run = normRun(arg), def = dungeonDef(run.id);
    enterCombatWorld(() => new DungeonMode(G), run, { location: () => (def.kind !== 'burrow' ? def.name : dungeon.theme.name), sub: `B${run.floor}F`, floor: run.floor });
  };
  G.enterRegion = (id) => {
    const def = REGIONS[id]; if (!def) return;
    enterCombatWorld(() => new RegionMode(G, id), undefined, { location: () => def.name, sub: def.jp, region: id });
  };
  // The Travel Map (ui/travel.js) reads places from here: Blossom Hollow + the four regions (docs/REGIONS.md §1)
  // a gated zone's Travel Map card: its dungeon (cleared stamp, the boss inside) instead of the outdoor boss (docs/ZONES.md §8.2)
  const zoneCard = id => { const gd = gateDef(id); if (!gd) return {}; const n = G.state.zones?.[id]?.dungeon?.cleared || 0; return { cleared: n, dungeon: { name: gd.name, cleared: n, boss: MONSTERS[gd.boss]?.name || null } }; };
  G.travel = {
    list: () => {
      const R = regionState(G.state), here = G.mode === 'village' ? 'village' : G.dungeon?.regionId;
      const home = { id: 'village', name: 'Blossom Hollow', short: 'Blossom Hollow', jp: 'さくら村', sub: "Home: the cottage, Rosie's treats and a nap by the fountain.", color: '#ff8fb0', unlocked: G.mode !== 'dungeon' || G.dungeon?.kind === 'region', here: here === 'village', why: 'Use a portal to leave the Burrow' };
      return [home, ...REGION_IDS.map(id => {
        const d = REGIONS[id], u = regionUnlocked(G.state, id), mon = id => MONSTERS[id]?.name;
        return { id, name: d.name, short: d.name.split(' ').slice(-2).join(' '), jp: d.jp, sub: d.sub, color: d.color, levels: d.levels, unlocked: u.ok, why: u.why,
          here: here === id, visits: R.visits[id] || 0, cleared: R.cleared[id] || 0, boss: mon(d.boss) || null, monsters: d.monsters.map(mon).filter(Boolean),
          ...zoneCard(id), village: villageReady(id) ? { name: VILLAGES[id].name, jp: VILLAGES[id].jp, saved: G.state.zones?.[id]?.village === 'saved' } : null };
      })];
    },
    go: (id) => {
      G.ui?.close?.('travel', true);
      if (id === 'village') { if (G.mode === 'dungeon') G.returnToVillage(); return; }
      if (!regionUnlocked(G.state, id).ok) return;
      regionState(G.state).unlocked[id] = true;
      G.enterRegion(id);
    },
  };
  G.openTravel = (opts = {}) => { if (G.ui?.open) G.ui.open('travel', opts); else G.enterRegion(opts.select || 'bamboo'); };
  G.returnToVillage = (dead = false) => {
    G.leavingDungeon = true;
    const go = () => {
      G.leavingDungeon = false;
      // a Burrow-only conversation (Shadow's combat tutorial) must not follow Chewy home
      if (G.ui?.dlg?.active && G.tutorialOpen) { G.ui.dlg.finish(-1); G.state.flags.burrowTut = false; }
      skills.clearAll();
      const old = dungeon, fromRegion = !!old?.isRegion;
      swapWorld(village, vVfx, vCombat);
      disposeDungeon(old);
      G.mode = 'village';
      const home = dead ? { x: L.chewyHouse.x + 2.2, z: L.chewyHouse.z } : fromRegion && L.travel ? { x: L.travel.x + 1.6, z: L.travel.z + 1.2 } : { x: L.dungeon.x, z: L.dungeon.z + 3.2 };
      player.setPos(home.x, home.z); shadow.setPos(home.x + 0.8, home.z + 0.6);
      player.anim.stop(); G.playerDead = false; G.actions.restoreAll(); shadow.fainted = 0; shadow.untargetable = false; shadow.anim.stop(); shadow.recalc(); shadow.life = shadow.lifeMax;
      G.ui?.lootLabel?.clear?.();
      rig.distTarget = 22; rig.focus.copy(player.pos); rig.snap();
      G.ui?.setMode?.('village'); G.ui?.setBoss?.(null);
      engine.post.grade.uniforms.get('uVigColor').value.set(0.55, 0.45, 0.65); engine.post.grade.uniforms.get('uVignette').value = 1.0; day.apply();
      G.ui?.minimap?.setProvider?.(vMap);
      G.audio?.music?.(day.isNight() ? 'village_night' : 'village_day'); G.audio?.ambience?.(day.isNight() ? 'night' : 'village');
      Events.emit('mode:changed', { mode: 'village' });
      if (dead) setTimeout(() => G.ui?.dialogue?.({ speaker: 'Rosie', portrait: G.portrait('rosie'), lines: [`${player.name}! Shadow dragged you all the way home by your ${CLASSES[player.hero]?.garment || 'scarf'}!`, "Let's patch you up. Maybe bring more Heart Treats next time, okay?"] }), 900);
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
    G.ui?.banner?.('Oof!', `${player.name} needs a nap… Shadow will drag ${CLASSES[player.hero]?.pron.obj || 'him'} home.`, { style: 'area' });
    G.audio?.play?.('player_die');
    const lost = Math.floor(G.state.coins * 0.1); if (lost > 0) { G.state.coins -= lost; Events.emit('coins:changed', { coins: G.state.coins }); }
    setTimeout(() => { engine.timeScale = 1; if (!G.zoneRespawn()) G.returnToVillage(true); }, 2600);
  }
  // A knock-out in a zone or its dungeon whose village is saved wakes at that village's inn, not at home
  // (src/regions/village; docs/ZONES.md §2): the zone is rebuilt and RegionMode.start puts the hero at the inn door.
  G.zoneRespawn = () => {
    const zone = G.mode === 'dungeon' ? G.dungeon?.zoneId : null;
    if (!zone || !REGIONS[zone] || !villageReady(zone) || G.state.zones?.[zone]?.village !== 'saved') return false;
    G._zoneArrive = { zone, respawn: true };
    G.enterRegion(zone);
    return true;
  };

  // ---- interaction helpers
  G.story = new Story(G);
  installGateDebug(G, P); // (?villagesaved=1 | =bamboo,…; G.zoneDebug.saveVillage(zone): the zone dungeon gates, regions/dungeonGate.js)
  installTierDebug(G, P, { recordDungeonClear, TIER_DUNGEONS }); // (?run=bambooDepths:5:swarming,teeming; G.tierDebug: the tier runs, dungeon/tierRun.js)
  installLanternApi(G); installBurrowLantern(G, village, { x: L.dungeon.x + 3.1, z: L.dungeon.z + 2.2, yaw: 0 }); // (the Spirit Lanterns: regions/spiritLantern.js, the panel ui/lantern.js)
  G.ui?.setQuestProvider?.(() => G.story.uiList());
  G.questTarget = () => (G.titleActive || G.playerDead ? null : G.tutorials?.target() || (G.mode === 'interior' ? null : G.story.target())); // (a guide's pointer first; indoors only a guide points)
  installServices(G);
  installLife(G, village); // farming, the pantry, the Seed Stall (docs/HOMESTEAD.md)
  installHousing(G); // enterable houses, the cottage's bed / chest / stove, decorating (docs/HOUSING.md)
  // guided tutorials (docs/TUTORIALS.md). They start on their own unless ?notut — and the QA's ?nointro sessions count
  // as notut (unless ?tut), remembered for the tab, so a QA reload of its own save stays quiet too.
  {
    let off = P.has('notut') || (P.has('nointro') && !P.has('tut'));
    try { if (P.has('tut')) sessionStorage.removeItem('chewy3d.notut'); else if (off) sessionStorage.setItem('chewy3d.notut', '1'); else off = !!sessionStorage.getItem('chewy3d.notut'); } catch (e) { /* storage unavailable */ }
    G.tutorials = new Tutorials(G, { enabled: !off });
  }
  installDebugAccess(G); // debug tools: off by default; the password prompt, F10 / ` / the bug / Select+Start, the lazy menu (src/debug, docs/DEBUG.md)
  const vMap = G.villageMinimap = new VillageMinimap(G);
  Events.on('village:changed', () => { vMap.dirty = true; });
  Events.on('garden:till', () => { vMap.dirty = true; }); // (Chewy's bed turns from lawn to soil on the map)
  G.ui?.minimap?.setProvider?.(vMap);
  G.talkTo = (npc) => {
    if (npc.talking) return;
    npc.talking = true; player.controlLocked = true;
    const done = () => { npc.talking = false; player.controlLocked = false; G.interactCooldown = performance.now() + 350; Actions.consume('interact'); };
    (npc.hero ? heroes.talk(npc) : G.story.talk(npc)).then(done, (e) => { console.error(e); done(); }); // the other hero: chat / switch / join
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
  function pickInteractAt(x, y, r = 56) {
    const cam = engine.camera;
    let best = null, bd = r;
    const list = G.mode === 'village' ? npcs.filter(n => n.visible).map(n => n.interact).concat(G.world.interactables) : G.world.interactables;
    for (const it of list) {
      _v.copy(it.pos).setY(it.pos.y + 0.6).project(cam);
      const sx = (_v.x * 0.5 + 0.5) * innerWidth, sy = (-_v.y * 0.5 + 0.5) * innerHeight;
      const d = Math.hypot(sx - x, sy - y);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }
  const pickInteractAtMouse = () => pickInteractAt(Input.mouse.x, Input.mouse.y);
  // a touch tap on the world (CT-5, docs/CONTROLS.md §12): a foe is locked (the attack and skills go at it), someone or
  // something to use is walked to and used (as a click does), anything else is walked to
  function touchTap(tp) {
    const foe = G.mode === 'dungeon' ? G.combat.pickAtScreen(tp.x, tp.y, engine.camera, 60) : null;
    if (foe) { if (padAim.target(foe)) { hoverEnemy = foe; G.audio?.play?.('ui_click', { vol: 0.45 }); G.ui?.touch?.ping?.(tp.x, tp.y, 'foe'); } return; }
    const it = pickInteractAt(tp.x, tp.y, 64);
    if (it) { player.interactTarget = it; player.moveTarget = it.pos.clone(); G.ui?.touch?.ping?.(tp.x, tp.y, 'use'); return; }
    player.interactTarget = null;
    player.moveTarget = engine.mouseGround(tp.x / innerWidth * 2 - 1, -(tp.y / innerHeight) * 2 + 1, (x, z) => G.world.heightAt(x, z));
    G.ui?.touch?.ping?.(tp.x, tp.y, 'walk');
  }
  /** a melee skill whose target is beyond its reach (the touch attack then walks up first) */
  function meleeFar(id, L) {
    const R = skillRuntime(id, G.state, G.derived);
    if (!R || !skills.isMelee?.(id, R) || L.breakable) return false;
    return Math.hypot(L.pos.x - player.pos.x, L.pos.z - player.pos.z) > skills.reach(R, L);
  }
  // which action holds each hotbar slot (for channeling and hold-to-charge, on every device: core/actions.js)
  const SLOT_ACTS = ['attack', 'skillAlt', 'skill1', 'skill2', 'skill3', 'skill4'];
  const slotHeld = i => !!SLOT_ACTS[i] && Actions.held(SLOT_ACTS[i]);
  const skillInput = { holding(id) { const hb = G.state.player.hotbar; return hb.some((s, i) => s === id && slotHeld(i)); } };
  skills.charge.bindKeys(slotHeld); // hold-to-charge polls the hotbar buttons (combat/charge.js, docs/CHARGE.md)

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
    const dark = G.mode === 'dungeon' ? 1 : G.mode === 'interior' ? (G.housing?.world?.night || 0) * 0.3 : day.out.night;
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
    // the cut is a person-sized hole: 15% of the screen height at the gameplay distances (22-27), shrinking as the camera
    // pulls back so it stays the same size in the world (a fixed screen radius sliced whole crowns into wedges in the
    // title, build and overview views)
    const occR = innerHeight * pr * 0.15 * Math.min(1, 26 / Math.max(1, rig.dist + rig.distBias));
    U.uOccl.value.set((_o.x * 0.5 + 0.5) * innerWidth * pr, (_o.y * 0.5 + 0.5) * innerHeight * pr, occR, depth);
  }

  // ---- per-frame input
  let hoverEnemy = null, padA = false; // padA: the pad's A press went to an interactable (no swing until A comes up)
  // the gamepad's aim, soft lock and target ring (combat/padAim.js, docs/CONTROLS.md §2)
  const padAim = G.padAim = new PadAim(G);
  Events.on('input:device', p => { if (p?.device !== 'pad') padAim.clear(); });
  Actions.isBuilding = () => !!(buildMode.active || G.housing?.decor?.active);
  function handleInput(dt) {
    const taps = Touch.takeTaps(); // (touch taps on the world since the last frame: ui/touch.js; dropped in build mode and menus)
    if (G.mode === 'village' && Actions.pressed('build') && !player.controlLocked && !G.ui?.isPaused?.() && !G.ui?.anyModal?.()) { buildMode.active ? buildMode.exit() : buildMode.enter(); }
    else if (G.mode === 'interior' && Actions.pressed('build') && (!player.controlLocked || G.housing?.decor.active) && !G.ui?.isPaused?.() && !G.ui?.anyModal?.()) G.housing?.decor.toggle(); // (indoors B decorates: docs/HOUSING.md §2; the player is held still while decorating)
    if (G.housing?.decor.active) { padAim.clear(); return; } // (decorate mode reads the mouse and WASD itself: home/decorate.js)
    if (buildMode.active) {
      padAim.clear();
      if (Input.mouse.wheel) rig.zoom(Input.mouse.wheel);
      if (!G.buildFocus) G.buildFocus = player.pos.clone();
      const { f, r } = rig.groundAxes(); const d = new THREE.Vector3();
      if (Input.down('w')) d.add(f); if (Input.down('s')) d.sub(f); if (Input.down('d')) d.add(r); if (Input.down('a')) d.sub(r);
      G.buildFocus.addScaledVector(d, dt * 16);
      G.buildFocus.x = Math.max(10, Math.min(WORLD - 10, G.buildFocus.x)); G.buildFocus.z = Math.max(10, Math.min(WORLD - 10, G.buildFocus.z));
      if (Input.hit('q')) { rig.yawTarget += Math.PI / 2; Events.emit('sfx', 'ui_tab'); }
      if (Input.hit('e')) { rig.yawTarget -= Math.PI / 2; Events.emit('sfx', 'ui_tab'); }
      return;
    }
    if (G.buildFocus) { G.buildFocus = null; }
    const modal = G.ui?.anyModal?.() || (Actions.device === 'pad' && G.ui?.tutorial?.offering); // (the pad answers a guide's offer card with A / B: ui/padNav.js)
    if (modal || player.controlLocked || G.playerDead) { G.ui?.setInteract?.(null); padAim.clear(); padA = Actions.held('attack', 'pad') || Actions.held('attack', 'touch'); return; }
    // Tab / LB: a tap switches to the next hero, holding it opens the hero wheel (heroes.js); the wheel takes the input while open
    if (heroes.tabInput(dt)) { G.ui?.setInteract?.(null); return; }
    // touch (CT-5, docs/CONTROLS.md §12) plays like the pad: its stick and drag-to-aim feed padAim, the attack button is A
    const hb = G.state.player.hotbar, dev = Actions.device, pad = dev === 'pad' || dev === 'touch';
    // the gamepad aims with the sticks and a soft lock (combat/padAim.js); the mouse with the cursor, as before
    if (pad) padAim.update(dt);
    if (taps && dev === 'touch') for (const tp of taps) touchTap(tp); // (a foe: lock it; someone or something: go and use it; else walk there)
    const aim = pad ? padAim.point.clone() : engine.mouseGround(Input.mouse.nx, Input.mouse.ny, (x, z) => G.world.heightAt(x, z));
    hoverEnemy = pad ? padAim.lock : G.mode === 'dungeon' && !Input.mouse.overUI ? G.combat.pickAtScreen(Input.mouse.x, Input.mouse.y, engine.camera) : null;
    // LMB: attack enemies under the cursor (or Alt+click: attack in place, at the cursor), otherwise walk / interact.
    // (Shift is the sprint now: actors/sprint.js, docs/ZONES.md §9)
    const lmbCharge = skills.charge.owns(0); // (a charge held on LMB stays a skill press even off the monster / over the HUD)
    const indoors = G.mode === 'interior'; // (no skills indoors: nothing to fight, and the furniture is fragile)
    // the pad's A (CONTROLS §2): interacts when an interactable is highlighted and no foe is near, else the basic attack
    // at the soft-locked foe (or along the aim); a melee attack steps in to a lock only from close by (short magnetism)
    const padIt = pad ? padAim.pickInteract(G.mode === 'village' ? [...npcs.filter(n => n.visible).map(n => n.interact), ...G.world.interactables] : G.world.interactables) : null;
    const aCtx = !!padIt && !padAim.foeNear();
    // where a pad cast goes: at the lock, but a melee skill (the attack, Chomp) only steps in from close by (reach + 1.8 m);
    // a lock further off gets a swing in place toward it, never a walk across the room (CONTROLS §2: short magnetism)
    const padCast = id => {
      const L = hoverEnemy; if (!L) return [aim, null];
      const R = skillRuntime(id, G.state, G.derived);
      if (!R || !skills.isMelee?.(id, R) || L.breakable) return [L.pos, L];
      const reach = skills.reach(R, L), dx = L.pos.x - player.pos.x, dz = L.pos.z - player.pos.z, d = Math.hypot(dx, dz);
      if (d <= reach + 1.8) return [L.pos, L];
      const k = Math.min(d, reach * 0.8) / d;
      return [new THREE.Vector3(player.pos.x + dx * k, player.pos.y, player.pos.z + dz * k), null];
    };
    if (pad) {
      if (Actions.pressed('attack', dev) && aCtx && performance.now() > (G.interactCooldown || 0)) { padA = true; Actions.consume('attack', dev); padIt.onInteract(); }
      else if (!Actions.held('attack', dev)) padA = false;
      else if (!padA && !indoors && (G.mode === 'dungeon' || lmbCharge)) {
        const id0 = hb[0] || 'attack';
        // a foe tapped on purpose (touch): the attack walks up to it and swings, as a mouse click does
        if (dev === 'touch' && hoverEnemy && hoverEnemy === padAim.manual && !lmbCharge && meleeFar(id0, hoverEnemy)) skills.approachTo(id0, hoverEnemy);
        else { const [t, tg] = padCast(id0); skills.charge.feed(0, id0, t, tg); } // (tap, hold to charge, or repeat while held)
      }
    }
    if (Actions.held('attack', 'kbm') && (!Input.mouse.overUI || lmbCharge)) {
      if (hoverEnemy || (Actions.held('attackInPlace') && G.mode === 'dungeon') || lmbCharge) {
        const tgt = hoverEnemy ? hoverEnemy.pos : aim;
        const R = skillRuntime(hb[0] || 'attack', G.state, G.derived);
        const melee = R && !R.params?.projectile && !(R.params?.speed) && (R.params?.radius || 0) < 3;
        const reach = (R?.params?.radius || 1.8) + (hoverEnemy?.radius || 0.3) - 0.2;
        if (!lmbCharge && hoverEnemy && melee && Math.hypot(tgt.x - player.pos.x, tgt.z - player.pos.z) > reach) { skills.approachTo(hb[0] || 'attack', hoverEnemy); } // D2-style: one click walks up and swings
        else { player.moveTarget = null; skills.charge.feed(0, hb[0] || 'attack', tgt, hoverEnemy); } // (a chargeable skill: tap casts, hold charges)
      } else {
        const hit = Input.mouseHit(0), it = hit ? pickInteractAtMouse() : null;
        // a click walks to the spot under the cursor at the press; holding steers once the cursor moves or after a
        // moment (so the camera following Chewy doesn't drag a short click's destination along with it)
        if (hit) player.pressAt = { x: Input.mouse.x, y: Input.mouse.y, t: performance.now() };
        const p0 = player.pressAt, steer = !p0 || performance.now() - p0.t > 250 || Math.hypot(Input.mouse.x - p0.x, Input.mouse.y - p0.y) > 4;
        if (it) { player.interactTarget = it; player.moveTarget = it.pos.clone(); }
        else if (!player.interactTarget && (hit || steer)) player.moveTarget = aim;
      }
    }
    // RMB / 1-4 (pad: X, Y, RB, RT, LT): a tap casts; holding a chargeable skill charges it (Settings > Charge on hold), others repeat as held
    const slotAim = id => (pad ? padCast(id) : [hoverEnemy ? hoverEnemy.pos : aim, hoverEnemy]);
    if (!indoors && hb[1] && ((Actions.held('skillAlt', 'kbm') && (!Input.mouse.overUI || skills.charge.owns(1))) || Actions.held('skillAlt', 'pad') || Actions.held('skillAlt', 'touch'))) skills.charge.feed(1, hb[1], ...slotAim(hb[1]));
    if (!indoors) for (let k = 1; k <= 4; k++) if (Actions.held(SLOT_ACTS[k + 1]) && hb[k + 1]) skills.charge.feed(k + 1, hb[k + 1], ...slotAim(hb[k + 1]));
    if (Actions.pressed('potionHeart')) usePotion('heart');
    if (Actions.pressed('potionZoom')) usePotion('zoom');
    if (Actions.pressed('potionR')) usePotion('rejuv');
    if (Actions.pressed('meal')) G.life?.kitchen?.quickEat(); // the quick meal (docs/HOMESTEAD.md §4)
    if (Actions.pressed('swap')) { G.actions.swapWeapons(); player.setWeapon(G.derived.weaponType || 'sword'); G.audio?.play?.('ui_equip'); G.vfx.sparkle(player.pos.clone().setY(0.8), { n: 6 }); }
    if (Actions.pressed('home') && G.mode === 'dungeon') G.returnToVillage();
    const it = pad ? padIt : nearestInteract();
    G.ui?.setInteract?.(it ? it.label : null, dev === 'touch' && it ? { key: null } : pad && it ? { act: aCtx ? 'interact' : 'interactAlt' } : undefined); // (the pad's prompt: A, or the D-pad when A would swing; touch: no key, the prompt is tapped: ui/touch.js)
    if (it && Actions.pressed('interact') && performance.now() > (G.interactCooldown || 0)) it.onInteract();
    if (Input.mouse.wheel) rig.zoom(Input.mouse.wheel);
    // target frame
    if (hoverEnemy && !hoverEnemy.breakable && hoverEnemy !== G.dungeon?.boss) G.ui?.setTarget?.( // the boss already has its big bar
      { name: hoverEnemy.name, hp: hoverEnemy.life, max: hoverEnemy.lifeMax, rarity: hoverEnemy.rank, mods: (hoverEnemy.stats.mods || []).map(m => m) });
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
  // one tip at a time, and only in a quiet moment: never over a banner, a boss fight (intro to victory), a big
  // scuffle, a dialogue, an open panel, a screen transition or a busy toast stack (the life-saving potion tip only
  // waits for dialogue / transitions). A tip that has to wait keeps its flag unset: hints() offers it again while its
  // condition holds, and one-off tips (retry) stay pending for up to 30 s in the same mode.
  let hintBusyUntil = 0, hintBannerT = -1e9;
  const hintPending = new Map();
  // a live boss that is fighting, introducing itself or about to (Chewy is in its chamber)
  const bossFight = () => { const b = G.mode === 'dungeon' ? G.dungeon?.boss : null; return !!(b?.alive && (b.aggro || b.introDone || b.pos.distanceTo(player.pos) < 14)); };
  function hintHold(urgent) {
    const ui = G.ui;
    if (G.titleActive || G.playerDead || ui?.dlg?.active || ui?.iris?.active) return true;
    if (urgent) return false;
    if (G.tutorials?.busy || ui?.tutorial?.offering) return true; // (a guide is talking: Shadow's tips wait)
    if (G.life?.fishing?.s) return true; // (a cast, a bite or a reel: tips wait for the catch; on a phone a tip covers the reel bar)
    const now = performance.now();
    if (ui?.banners?.busy) hintBannerT = now; // (a beat of calm after a banner, e.g. the victory, before any tip)
    if (ui?.anyModal?.() || now - hintBannerT < 3000 || ui?.toasts?.busy) return true;
    if (G.mode === 'dungeon' && G.dungeon) {
      if (bossFight()) return true;
      let n = 0;
      for (const m of G.dungeon.monsters) if (m.alive && m.aggro && m.pos.distanceTo(player.pos) < 10 && ++n >= 4) return true;
    }
    return false;
  }
  function hint(id, text, retry = true) {
    if (H()[id] || !G.ui?.toast) return;
    const now = performance.now();
    if (now < hintBusyUntil || hintHold(id === 'potion')) {
      if (retry && !hintPending.has(id)) hintPending.set(id, { text, mode: G.mode, until: now + 30000 });
      return;
    }
    hintPending.delete(id);
    H()[id] = true; hintBusyUntil = now + 7500;
    const o = { color: '#9fd0ff', iconURL: G.portrait('shadow'), duration: 7, sub: 'Shadow', priority: id === 'potion' ? 'high' : 'low' };
    text = Actions.resolve(text); // ({roll} → Space / B; on the pad "Press Q" names the D-pad: core/actions.js)
    if (G.ui.toasts?.show) G.ui.toasts.show(text.replace(/\*/g, ''), o); else G.ui.toast(text.replace(/\*/g, ''), o); // straight to the queue: a shown tip is never rate-dropped
    G.audio?.play?.('bark_small', { vol: 0.5 });
  }
  G.hint = hint;
  let hintT = 0, sprintWalkT = 0;
  function hints(dt) {
    hintT -= dt; if (hintT > 0 || G.playerDead) return; hintT = 0.5;
    if (G.ui?.dlg?.active) return;
    if (bossFight()) G.ui?.toasts?.retire?.(0); // a tip still up when the boss wakes steps aside (the potion tip stays)
    const now = performance.now();
    for (const [id, p] of hintPending) { // one-off tips that had to wait (e.g. the first-visit fight tip)
      if (now > p.until || p.mode !== G.mode || H()[id]) hintPending.delete(id);
      else { hint(id, p.text); break; }
    }
    const D = G.derived, st = G.state, tip = (id, text) => hint(id, text, false); // condition tips re-offer themselves
    if (G.mode === 'dungeon' && G.dungeon) {
      if (G.actions.life() < D.lifeMax * 0.5 && st.potions.heart > 0) tip('potion', 'Ouch! Press Q to munch a Heart Treat.');
      if (st.player.skillPts > 0 && st.player.lvl >= 2) tip('skills', 'You have a skill point! Press K to learn something new.');
      if (st.player.statPts > 0 && st.player.lvl >= 2 && H().skills) tip('stats', 'Stat points too! Press C to get stronger.');
      const sp = G.dungeon.stairsPos; if (sp && sp.distanceTo(player.pos) < 7) tip('stairs', 'Stairs! Press F to burrow deeper.');
      if (player.hero === 'chewy' && G.dungeon.monsters.some(m => m.alive && m.aggro && m.def.attack?.type === 'ranged' && m.pos.distanceTo(player.pos) < 9)) tip('ball', 'They throw things! Press {swap} to swap to your tennis ball — {roll} to roll away.');
      if (player.hero === 'moka' && G.dungeon.monsters.some(m => m.alive && m.aggro && m.pos.distanceTo(player.pos) < 2.5)) tip('mokaRange', 'Too close! Moka is squishy — {roll} to roll away and splash them from afar.');
      if ((G.dungeon.loot?.list || []).some(e => e.d.type === 'item' && e.to.distanceTo(player.pos) < 5)) tip('loot', 'Shiny! Walk over loot to grab it. Press I to see your bag.');
      // a long walk outdoors without sprinting: Shadow mentions Shift (actors/sprint.js)
      sprintWalkT = G.dungeon.isRegion && player.anim.speed > 3.5 && !player.sprint.on ? sprintWalkT + 0.5 : 0;
      if (sprintWalkT >= 6) tip('sprint', Actions.device === 'touch' ? 'Push the stick out to its glowing edge to sprint! Don\'t worry, I can keep up.' : Actions.device === 'pad' ? 'Click {sprint} to sprint! It stays on while you move. Don\'t worry, I can keep up.' : 'Hold Shift to sprint! Don\'t worry, I can keep up.');
    } else if (G.mode === 'village' && !G.titleActive) {
      if (st.quests.done.includes('burrow1') && !G.buildMode && Actions.device !== 'pad') tip('build', 'Press B to plan the village — paint zones and friends will build there!'); // (the pad builds with CT-2's virtual cursor)
      if (regionUnlocked(st, 'bamboo').ok) tip('travel', "The Wayfarer's Post by the bamboo points to new lands! Walk the west trail to find it.");
      if (heroes.joined('moka') && !heroes.T && heroes.cd <= 0 && !G.tutorials?.covers('switch')) tip('tabSwitch', `Press Tab to play as ${heroes.name(heroes.next())} — ${heroes.name()} will hang out in town.`);
    }
  }

  // ---- save / load
  function save() { if (G.saveBlocked) return; /* (the debug menu's Restore is reloading onto the backup) */ try { if (G.playerDead || G.state.player.life === 0) G.state.player.life = null; /* never persist a knocked-out Chewy */ G.state.hour = day.hour; G.state.day = day.day; localStorage.setItem('chewy3d.save', JSON.stringify(saveableState(G.state))); } catch (e) { /* storage unavailable */ } }
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
  const showTitle = G.ui?.setMode && !skip && !P.has('fresh') && !P.has('floor') && !P.has('region') && !P.has('notitle');
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
  } else if (skip === 'new' || (P.has('fresh') && !P.has('floor') && !P.has('region') && !P.has('nointro'))) setTimeout(() => intro(), 1200);
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
    await G.ui.dialogue({ speaker: 'Rosie', portrait: pr, lines: ['Walk with *WASD* or click the ground, and hold *Shift* to sprint. Press *F* near friends to chat.', 'Press *B* to plan the village — paint zones for homes, shops and workshops, then watch it grow!', "And… there's something squeaky in *the Burrow* on the shrine hill. Take your Bone Katana — and your red tennis ball!"] });
    G.introFocus = null; rig.distTarget = prevDist; shadow.hold = null;
    rosie.talking = false; rosie.faceBias = 0; rosie.greeted = 30; rosie.state = 'idle'; rosie.t = 4;
    player.controlLocked = false;
    G.story.markTalk('rosie');
    G.ui?.toast?.(Actions.device === 'touch' ? 'Tip: the bag and menu buttons are by the map · tap a friend to chat' : Actions.device === 'pad' ? `Tip: ${Actions.text('menu')} opens the bag, skills and journal · ${Actions.text('swap')} swaps weapons` : 'Tip: I bag · K skills · C character · J quests · X swap weapon', { color: '#8fd0ff' });
    G.introJoinPending = true; // (the house tour waits for Moka's arrival scene)
    setTimeout(async () => { try { await heroes.introJoin(); } finally { G.introJoinPending = false; } }, 2600); // …and a bookish spaniel mage has been waiting to meet Chewy
  }

  // ---- floating quest markers over NPCs ('!' something for you, '?' quest giver, gift = friendship reward)
  const markers = new Map();
  let markerT = 0;
  function updateMarkers(dt) {
    markerT -= dt;
    if (markerT <= 0) {
      markerT = 0.5;
      for (const [n, m] of markers) if (!npcs.includes(n)) { village.scene.remove(m); m.material.dispose(); markers.delete(n); } // (a hero who left town to be played)
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
  function frame(now) {
    // Settings › Frame cap (60 / 40): skip display frames until the next slot is due; the slots advance by the cap's
    // interval (not to now), so 40 on a 60 Hz screen alternates one and two refreshes and averages 40
    if (capMs) {
      if (now - capT < capMs - 2) { requestAnimationFrame(frame); return; }
      capT = now - capT > capMs * 2 ? now : capT + capMs;
    }
    const rdt = engine.tick();
    Actions.poll(); // the gamepad's buttons and sticks for this frame (core/actions.js)
    G.debug?.frame(rdt); // (debug tools: Select+Start, the menu's session toggles: src/debug)
    // pause gameplay for the pause menu, and in the Burrow while reading dialogue (nothing should hit Chewy mid-sentence)
    const paused = G.ui?.isPaused?.() || (G.mode === 'dungeon' && G.ui?.dlg?.active);
    const dt = paused ? 0 : rdt;
    if (G.mode === 'village') day.update(dt);
    else if (G.mode === 'interior') day.tick(dt); // (time passes inside; home/housing.js lights the room for the hour)
    if (G.titleActive) { rig.yawTarget += dt * 0.06; rig.yaw = rig.yawTarget; }
    else handleInput(dt);
    G.actions.tickRegen(dt);
    player.update(dt);
    G.life?.update(dt);
    G.tutorials?.update(rdt);
    shadow.update(dt);
    skills.update(dt, skillInput);
    G.combat.update(dt);
    if (G.mode === 'village') for (const n of npcs) n.update(dt);
    heroes.update(rdt);
    // camera follows with a little look-ahead
    if (G.heroFocus) rig.focus.set(G.heroFocus.x, (G.heroFocus.y || player.pos.y) + 0.6, G.heroFocus.z); // hero switch: the camera glides between them
    else if (G.introFocus) rig.focus.set(G.introFocus.x, player.pos.y + 0.6, G.introFocus.z);
    else if (buildMode.active && G.buildFocus) rig.focus.set(G.buildFocus.x, player.pos.y + 0.6, G.buildFocus.z);
    else if (G.decorFocus) rig.focus.set(G.decorFocus.x, 0.6, G.decorFocus.z); // (decorate mode pans over the room)
    else if (!G.titleActive) {
      const lead = new THREE.Vector3(Math.sin(player.facing), 0, Math.cos(player.facing)).multiplyScalar(Math.min(1, player.anim.speed / 4) * 1.2);
      rig.focus.set(player.pos.x + lead.x, player.pos.y + 0.6, player.pos.z + lead.z);
    }
    if (G.mode === 'interior') { if (!G.decorFocus) G.housing.biasFocus(rig.focus); G.housing.clampFocus(rig.focus, G.decorFocus ? -1.2 : 1.2); } // (the camera leans to the back walls and stays over the room)
    rig.update(dt);
    updateOcclusion();
    updateHero(rdt);
    if (G.mode === 'village') {
      village.updateSun(rig.target, day.sunDir);
      village.lightPool.update(dt, rig.target, engine.time, day.night);
      village.update(dt, engine.time);
      sim.update(dt, engine.time);
      G.housing?.ext?.update(dt); // (an upgrade's scaffold: home/exteriors.js)
      buildMode.update(dt);
      ambient.update(dt, engine.time);
      if (Math.hypot(player.pos.x - L.waterfall.x, player.pos.z - L.waterfall.z) < 70) waterfall.update(dt, engine.time, day); // (mist + spray only nearby)
      villageAmbience(dt);
      G.burrowLantern?.update(dt, engine.time, vVfx, player.pos); // (the Deep Burrow's Spirit Lantern by the Burrow door)
      vLoot.update(dt);
      updateMarkers(rdt);
    } else if (G.mode === 'interior') {
      G.housing.update(dt, engine.time, rdt); // (the room, its light, the guests, decorate mode)
      sim.update(dt, engine.time); // (the village and its economy keep ticking while you're inside)
    } else {
      dungeon.update(dt, engine.time);
      G.world.updateSun(rig.target);
      G.world.lightPool.update(dt, rig.target, engine.time, dungeon?.isRegion ? (dungeon.region.mood?.night ?? 0) : 1);
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
  if (!P.has('floor') && !P.has('region')) prewarmWorld(engine, village.scene); // draw the whole village once behind the boot splash: no first zoom-out hitch
  requestAnimationFrame(frame);
  if (P.has('floor')) setTimeout(() => G.enterDungeon(+P.get('floor')), 100);
  else if (P.has('region') && REGIONS[P.get('region')]) setTimeout(() => G.enterRegion(P.get('region')), 100);
  setTimeout(() => { window.__ready = true; const b = document.getElementById('boot'); if (b) { b.classList.add('gone'); setTimeout(() => b.remove(), 700); } }, P.has('floor') || P.has('region') ? 2500 : 400);
}

function loadSave() {
  try { const s = localStorage.getItem('chewy3d.save'); if (!s) return null; const st = JSON.parse(s); return st?.version ? st : null; } catch { return null; }
}
