// The debug menu's own sections (docs/DEBUG.md, ROADMAP R-10), registered into the section registry (./registry.js)
// when the lazy menu loads. Every action goes through the game's own code paths (the join scenes' joinPoe / joinShihtzu /
// joinGolden, prepareJoin, G.tierDebug, G.zoneDebug, G.enterDungeon, G.lantern, the actions API, Story), never a
// hand-poked save where a real path exists. Each run(G, value) returns its toast.
import { Events } from '../core/events.js';
import { registerDebug } from './registry.js';
import { CLASSES, HERO_IDS } from '../rpg/classes.js';
import { newHeroState, POTION_CAP } from '../rpg/actions.js';
import { LEVEL_CAP } from '../rpg/stats.js';
import { SKILLS, MAX_SKILL_LVL } from '../rpg/skills.js';
import { UNIQUES, UNIQUE_IDS, makeUnique, generateItem, makeGem, GEM_TYPES, EQUIP_SLOTS, EQUIP_SLOT_ITEM } from '../rpg/items.js';
import { MATERIAL_KEYS } from '../rpg/loot.js';
import { ZONE_IDS, zoneOf, tierRecord, recordDungeonClear, TIER_DUNGEONS, spiritMax, spiritOpen } from '../rpg/zones.js';
import { zoneUnlockOnClear } from '../rpg/zoneProgress.js';
import { ZONE_MODS, MOD_IDS } from '../rpg/zoneMods.js';
import { DUNGEONS, ZONE_DUNGEON } from '../dungeon/defs.js';
import { MONSTERS } from '../dungeon/monsters.js';
import { Monster } from '../dungeon/monster.js';
import { REGIONS } from '../regions/index.js';
import { villageReady, VILLAGES } from '../regions/village/data.js';
import { QUESTS } from '../world/story.js';
import { GUIDE_IDS } from '../world/guides.js';
import { PANTRY_IDS, PANTRY } from '../life/pantry.js';
import { RECIPE_IDS as COOK_IDS } from '../life/cooking.js';
import { RECIPE_IDS as CRAFT_IDS, learnRecipe as learnCraft } from '../home/recipes.js';
import { FURNITURE_IDS, SURFACE_IDS, storable } from '../home/furniture.js';
import { T as TOG, killAll } from './debugToggles.js';

const frame = () => new Promise(r => requestAnimationFrame(r));
/** wait (in game frames) until test() holds, then fn(); false after ms */
async function when(test, fn, ms = 30000) { const t0 = performance.now(); while (!test()) { if (performance.now() - t0 > ms) return false; await frame(); } fn?.(); return true; }
const idle = G => !G.ui?.iris?.active && !G.leavingDungeon && !G.heroSwitching;
/** before a trip: let a transition, a hero switch or a victory moment finish (a second iris over a running one is lost) */
const settle = G => when(() => idle(G) && !G.housing?.busy, null, 15000);
const heroName = id => CLASSES[id]?.name || id;
const zoneName = id => REGIONS[id]?.name || id;
const CHAIN = (() => { const out = []; for (let id = 'welcome'; id && QUESTS[id] && !out.includes(id); id = QUESTS[id].next) out.push(id); return out; })(); // the main story, in order

/** put the hero (and Shadow) somewhere on the current floor, the camera with them */
function teleport(G, x, z) {
  const P = G.player, W = G.world;
  if (W?.walkable && !W.walkable(x, z)) { // (nudge onto open ground)
    for (let r = 0.5; r < 6; r += 0.5) for (let a = 0; a < 12; a++) { const tx = x + Math.cos(a / 12 * Math.PI * 2) * r, tz = z + Math.sin(a / 12 * Math.PI * 2) * r; if (W.walkable(tx, tz)) { x = tx; z = tz; r = 99; break; } }
  }
  P.setPos(x, z); P.moveTarget = null; P.interactTarget = null;
  G.companion?.setPos(x + 0.8, z + 0.6);
  const rig = G.engine.rig; rig.focus.copy(P.pos); rig.snap();
}

// ------------------------------------------------------------------ heroes
const joined = (G, id) => G.heroes?.joined(id);
/** a hero joins at once, skipping their scene (the same calls the scenes end in) */
function joinHero(G, id) {
  const H = G.heroes; if (!H || joined(G, id)) return false;
  if (id === 'poe') H.joinPoe();
  else if (id === 'shihtzu') H.joinShihtzu();
  else if (id === 'golden') H.joinGolden();
  else if (id === 'moka') { // (her scene is a dialogue: the same steps without it)
    G.actions.prepareJoin?.('moka');
    G.state.flags.mokaJoined = true;
    const v = H.villagers.moka; if (v) { v.frozen = false; v.waitingToJoin = false; v.warm = true; }
    Events.emit('hero:joined', { id: 'moka' });
  }
  return joined(G, id);
}
function joinAll(G) {
  const ui = G.ui, banner = ui?.banner; if (ui) ui.banner = () => {}; // (one toast, not four banners)
  const got = [];
  try { for (const id of HERO_IDS) if (id !== 'chewy' && joinHero(G, id)) got.push(heroName(id)); } finally { if (ui) ui.banner = banner; }
  G.save?.();
  return got.length ? `Joined the pack: ${got.join(', ')}` : 'Everyone has joined already';
}
/** a hero's level, up (with the points that level brings) or down (a fresh start at that level, gear kept) */
function setLevel(G, id, L) {
  const h = G.state.heroes?.[id]; if (!h) return;
  const P = h.player, old = P.lvl || 1; L = Math.max(1, Math.min(LEVEL_CAP, L));
  if (L >= old) { P.statPts += 5 * (L - old); P.skillPts += L - old; }
  else {
    const f = newHeroState(id).player;
    P.stats = { ...CLASSES[id].base }; P.skills = { ...f.skills }; P.hotbar = [...f.hotbar]; P.mouseSets = f.mouseSets.map(p => [...p]); P.chargePerks = {};
    P.statPts = 5 * (L - 1); P.skillPts = f.skillPts + L - 1;
  }
  P.lvl = L; P.xp = 0; P.life = null; P.zoom = null;
}
function refreshHero(G) {
  G.actions.recompute(); G.actions.restoreAll?.(); G.companion?.recalc?.();
  Events.emit('stats:changed', G.derived); Events.emit('hotbar:changed', { hotbar: G.state.player.hotbar }); Events.emit('skill:learned', { id: null });
  G.save?.();
}
/** a hero's join scene can play again: not joined, out of town, the rumour unsaid (their level and gear are kept) */
function rearm(G, id) {
  const F = G.state.flags, H = G.heroes;
  if (id === 'chewy' || G.state.activeHero === id) return false;
  F[`${id}Joined`] = false;
  const hint = { poe: 'poeRumour', shihtzu: 'stzRumour', golden: 'gldRumour' }[id]; if (hint && F.hints) delete F.hints[hint];
  H.removeVillager(id);
  if (id === 'moka' && G.mode === 'village') H.spawnBench(); // (she waits by the fountain again)
  return true;
}

// ------------------------------------------------------------------ world and story
function unlockZones(G) { for (const id of ZONE_IDS) zoneOf(G.state, id).unlocked = true; G.ui?.panels?.travel?.refresh?.(); return 'Every zone is open on the Travel Map'; }
function saveVillages(G) {
  const n = ZONE_IDS.filter(z => villageReady(z) && G.state.zones[z].village !== 'saved').map(z => { G.zoneDebug?.saveVillage?.(z); return VILLAGES[z]?.name || z; });
  const here = G.dungeon?.isRegion ? ' (leave and come back to see it)' : '';
  return n.length ? `Saved: ${n.join(', ')}${here}` : 'Every village is saved already';
}
function clearDungeons(G) {
  const st = G.state, out = [];
  for (const [zone, id] of Object.entries(ZONE_DUNGEON)) {
    const d = tierRecord(st, id);
    if (d.cleared === 0) { recordDungeonClear(st, id, 0); out.push(DUNGEONS[id].name); }
    zoneUnlockOnClear(st, zone);
  }
  const D = st.dungeon ||= { deepest: 0, waypoints: [1] };
  if ((D.deepest || 0) < 21) { D.deepest = 21; out.push('the Burrow (floor 20, Tamamo)'); }
  D.waypoints = [...new Set([...(D.waypoints || [1]), 1, 6, 11, 16])].sort((a, b) => a - b);
  tierRecord(st, 'burrowDeep'); // (the Deep Burrow's Lantern wakes: its T1 opens)
  Events.emit('quest:update');
  return out.length ? `Cleared: ${out.join(', ')}` : 'Everything is cleared already';
}
const mainQuest = G => G.state.quests.active.find(q => CHAIN.includes(q.id) || (QUESTS[q.id] && !G.story.def(q.id)?.request));
function storyTo(G, id) {
  const Q = G.state.quests, S = G.story, i = CHAIN.indexOf(id);
  Q.active = Q.active.filter(q => !CHAIN.includes(q.id));
  Q.done = Q.done.filter(x => !CHAIN.includes(x)).concat(CHAIN.slice(0, i < 0 ? CHAIN.length : i));
  if (i >= 0) Q.active.unshift({ id, step: 0, prog: 0 });
  Events.emit('quest:update'); S.progress('any'); G.save?.();
  return i < 0 ? 'The story is finished (every chapter done)' : `Story: chapter ${i + 1}, ${QUESTS[id].title}`;
}
function nextStep(G) {
  const q = mainQuest(G); if (!q) return 'No story quest running';
  const S = G.story, d = S.def(q.id);
  q.step++; q.prog = 0;
  if (q.step >= d.steps.length) { S.complete(q, d); return `Completed: ${d.title}`; }
  Events.emit('quest:update'); G.save?.();
  return `Next step: ${d.steps[q.step].text}`;
}
function completeQuest(G) {
  const q = mainQuest(G) || G.state.quests.active[0]; if (!q) return 'No quest running';
  const d = G.story.def(q.id); G.story.complete(q, d);
  return `Completed: ${d.title}`;
}
function guides(G, done) {
  const T = G.tutorials; if (!T) return 'No guides here';
  T.stop?.();
  const S = G.state.flags.tutorials = {};
  if (done) for (const id of GUIDE_IDS) S[id] = { done: true, offered: true };
  else T.pastAtLoad = {};
  G.save?.();
  return done ? 'Every guide is marked done' : 'Guides reset: they start again when their moment comes';
}

// ------------------------------------------------------------------ tiers
function openTiers(G) { for (const id of TIER_DUNGEONS) { G.tierDebug.unlock(id, 5); const z = DUNGEONS[id]?.zone; if (z) zoneUnlockOnClear(G.state, z); } return 'Tiers 1–5 are open at every Spirit Lantern'; }
function setSpirit(G, n) {
  if (!spiritOpen(G.state)) G.tierDebug.clearAll(5);
  for (const id of TIER_DUNGEONS) tierRecord(G.state, id).spirit.best = 0;
  tierRecord(G.state, 'bambooDepths').spirit.best = Math.max(0, n - 1);
  return `Spirit is open up to Spirit ${spiritMax(G.state)}`;
}
const RUN_TIERS = [['T1', { tier: 1 }], ['T3', { tier: 3 }], ['T5', { tier: 5 }], ['Spirit 1', { spirit: 1 }], ['Spirit 9', { spirit: 9 }], ['Spirit 10', { spirit: 10 }]];

// ------------------------------------------------------------------ travel
async function toVillage(G) {
  await settle(G);
  if (G.mode === 'dungeon') { G.returnToVillage(); await when(() => G.mode === 'village' && idle(G)); return 'Home to Blossom Hollow'; }
  if (G.mode === 'interior') { G.housing?.exit?.(); await when(() => G.mode === 'village' && idle(G), null, 15000); return 'Out into Blossom Hollow'; }
  return 'Already in Blossom Hollow';
}
async function toHome(G) {
  if (G.mode === 'interior') return 'Already at home';
  if (G.mode === 'dungeon') await toVillage(G);
  await when(() => G.mode === 'village' && idle(G) && !G.housing?.busy, null, 15000);
  G.openHome?.();
  return (await when(() => G.mode === 'interior' && idle(G), null, 15000)) ? "Into Chewy's Cottage" : "Couldn't get into the cottage just now";
}
async function toZone(G, id, where) {
  await settle(G);
  if (G.mode === 'interior') await toVillage(G);
  zoneOf(G.state, id).unlocked = true;
  if (where === 'gate') G._zoneArrive = { zone: id, gate: true };
  G.enterRegion(id);
  const here = () => G.mode === 'dungeon' && G.dungeon?.regionId === id && idle(G);
  if (!(await when(here, null, 45000))) return `Couldn't reach ${zoneName(id)}`;
  const D = G.dungeon;
  if (where === 'village') { if (D.villagePos) teleport(G, D.villagePos.x, D.villagePos.z + 2); else return `${zoneName(id)}: no village here`; }
  if (where === 'wild') { const w = (D.wildAreas || D.layout?.wild || [])[0]; if (w) teleport(G, w.x, w.z); else return `${zoneName(id)}: no wild areas yet (ROADMAP CZ-3)`; }
  return `${zoneName(id)}: ${where === 'gate' ? 'at the dungeon gate' : where === 'village' ? 'in the village' : where === 'wild' ? 'in the wild' : 'the trail'}`;
}
async function toDungeon(G, run, arena = false) {
  await settle(G);
  if (G.mode === 'interior') await toVillage(G);
  G.state.flags.burrowTut = true; // (no first-visit tip over the test)
  G.enterDungeon(run);
  const id = typeof run === 'object' ? run.id : 'burrow', floor = typeof run === 'object' ? run.floor : run;
  const here = () => G.mode === 'dungeon' && !G.dungeon?.isRegion && (G.dungeon?.def?.id || 'burrow') === id && G.dungeon.floor === floor && idle(G);
  if (!(await when(here, null, 60000))) return `Couldn't reach ${DUNGEONS[id]?.name || id}`;
  if (arena) {
    const L = G.dungeon.layout, A = L.arena, m = L.arenaMouth;
    if (m) teleport(G, m.x - (m.ux || 0) * 3, m.z - (m.uz || 0) * 3); else if (A) teleport(G, A.x, A.z + (A.r || 8) * 0.6);
    return `${DUNGEONS[id].name}: the boss arena`;
  }
  return `${DUNGEONS[id]?.name || 'The Burrow'} floor ${floor}`;
}

// ------------------------------------------------------------------ village and economy
function setRank(G, r) {
  const V = G.state.village, sim = G.sim;
  V.rankFloor = r > 1 ? r : 0;
  sim?.simulate?.(); sim?.checkRings?.(true);
  Events.emit('village:changed');
  const now = sim?.stats?.rank || r;
  return now > r ? `Village rank ${now} (the villagers already make it ${now})` : `Village rank ${now}: its districts and buildings are open`;
}
function unlockBuildings(G) {
  setRank(G, 5);
  const st = G.state, day = st.day || 1;
  let n = 0; for (const id of CRAFT_IDS) if (learnCraft(st, id, day)) n++;
  let c = 0; for (const id of COOK_IDS) if (G.actions.learnRecipe(id, { src: 'debug' })) c++;
  G.ui?.panels?.craft?.refresh?.(); G.ui?.panels?.cook?.refresh?.();
  return `Every building open (rank 5), ${n} workbench and ${c} cooking recipes learned`;
}
function giveFurniture(G) {
  let n = 0;
  for (const id of [...FURNITURE_IDS, ...SURFACE_IDS]) if (storable(id)) { G.actions.addFurniture(id, FURNITURE_IDS.includes(id) ? 2 : 1, { silent: true, src: 'debug' }); n++; }
  Events.emit('furniture:changed', { src: 'debug' });
  return `${n} kinds of furniture, wallpaper and floors in storage`;
}
function fillPantry(G, what) {
  let n = 0;
  for (const id of PANTRY_IDS) {
    const k = PANTRY[id].kind;
    if (what === 'seeds' && k !== 'seed') continue;
    if (what === 'meals' && k !== 'dish') continue;
    G.actions.addPantry(id, k === 'dish' ? 10 : 20, { silent: true, src: 'debug' }); n++;
  }
  Events.emit('pantry:changed', { src: 'debug' });
  return what === 'seeds' ? `${n} kinds of seeds ×20` : what === 'meals' ? `${n} meals ×10` : `The pantry is full: ${n} kinds`;
}

// ------------------------------------------------------------------ items
const give = (G, it) => G.story?.giveItem ? G.story.giveItem(it) : G.actions.pickup(it);
function gearSet(G, lvl, rarity) {
  const st = G.state, id = st.activeHero, wt = CLASSES[id].weapons, E = st.equipment;
  const made = [];
  for (const slot of EQUIP_SLOTS) {
    const it = EQUIP_SLOT_ITEM[slot];
    if (slot === 'weaponAlt' && wt.length < 2) continue;
    const item = generateItem({ ilvl: lvl, slot: it, rarity, wtype: it === 'weapon' ? (slot === 'weaponAlt' ? wt[1] : wt[0]) : undefined });
    const old = E[slot]; E[slot] = item; if (old) give(G, old);
    made.push(item);
  }
  G.actions.recompute(); G.actions.restoreAll?.();
  Events.emit('equip:changed', { slot: 'weapon' }); Events.emit('inv:changed', { c: 'inv' });
  return `${heroName(id)} wears a level ${lvl} ${rarity} set (${made.length} pieces; old gear to the bag)`;
}

// ------------------------------------------------------------------ monsters
function spawnPack(G, kind, n, rank) {
  const D = G.mode === 'dungeon' ? G.dungeon : null; if (!D) return 'Only in a dungeon or a zone';
  const P = G.player, W = G.world, lvl = D.layout?.mlvl || P.lvl || 1;
  D.warmMonsters?.([kind]);
  let cx = P.pos.x + 5, cz = P.pos.z;
  for (let k = 0; k < 40; k++) { const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 4, x = P.pos.x + Math.cos(a) * r, z = P.pos.z + Math.sin(a) * r; if (W.walkable(x, z)) { cx = x; cz = z; break; } }
  const one = o => { if (D.spawnMonster) return D.spawnMonster(kind, o); const m = new Monster(D, kind, o); D.monsters.push(m); G.combat.add(m); return m; };
  for (let i = 0; i < n; i++) {
    let x = cx + Math.cos(i * 2.4) * (0.6 + i * 0.22), z = cz + Math.sin(i * 2.4) * (0.6 + i * 0.22);
    if (!W.walkable(x, z)) { x = cx; z = cz; }
    const m = one({ level: lvl, rank: i === 0 && rank !== 'normal' ? rank : 'normal', variant: (Math.random() * 3) | 0, x, z });
    if (rank === 'champion' && i > 0) { m.rank = 'champion'; m.lifeMax = m.life = Math.round(m.lifeMax * 2); m.eliteColor = '#6aa8ff'; }
    m.alert?.();
  }
  return `${n} × ${MONSTERS[kind]?.name || kind}${rank !== 'normal' ? ` (${rank})` : ''}`;
}

// ------------------------------------------------------------------ time and weather
function setHour(G, h) {
  const D = G.day; if (!D) return '';
  D.hour = h; D._lastHour = h; if (G.mode === 'village') D.apply();
  G.state.hour = h;
  return `It's ${fmtHour(h)}`;
}
const fmtHour = h => `${((Math.floor(h) + 11) % 12) + 1}:${String(Math.round((h % 1) * 60)).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
function nextDay(G, keepHour) {
  const D = G.day; if (!D) return '';
  const h = keepHour ? D.hour : 6.5;
  D.hour = 5.99; D._lastHour = 5.98; D.tick(1); // (through 6:00: the new day, the crops and the village's morning)
  return setHour(G, h).replace("It's", `Day ${D.day},`);
}
let wx = null; // the debug weather field (one at a time)
function weather(G, kind) {
  const W = G.dungeon?.isRegion ? G.world?.weather : null; if (!W) return 'Only in a zone (the regions have the weather kit)';
  if (wx) { wx.mesh?.removeFromParent(); wx.mesh?.geometry?.dispose(); wx.mesh?.material?.dispose(); W.fields.splice(W.fields.indexOf(wx), 1); wx = null; }
  const own = W.fields.concat(W.puffs || []);
  if (kind === 'clear') { for (const f of own) f.setVisible?.(false); return 'Clear skies (until you leave the zone)'; }
  for (const f of own) f.setVisible?.(true);
  if (kind === 'own') return "The zone's own weather";
  wx = kind === 'snow' ? W.snow() : kind === 'petals' ? W.petals({ count: 600 }) : kind === 'leaves' ? W.leaves({ count: 500 }) : kind === 'fireflies' ? W.fireflies({ count: 160 }) : W.mist({ auto: 18 });
  return `Weather: ${kind} (until you leave the zone)`;
}

// ------------------------------------------------------------------ the sections
export function registerCoreSections(G, api) {
  registerDebug('heroes', [
    { label: 'Join every hero', hint: () => `${HERO_IDS.filter(id => id !== 'chewy').map(heroName).join(', ')}, skipping their scenes`, run: joinAll },
    { label: 'Switch to', closes: true, choices: () => HERO_IDS.map(id => ({ label: heroName(id), value: id })), run: async (G, id) => {
      if (id === G.state.activeHero) return `Already playing ${heroName(id)}`;
      if (!joined(G, id)) joinHero(G, id);
      G.heroes.cd = 0; await frame();
      const why = G.heroes.canSwitch(id); if (why) return `Can't switch now: ${why}`;
      G.heroes.switchTo(id, { quiet: true }); return `Switching to ${heroName(id)}…`;
    } },
    { label: 'Set level', fields: [{ key: 'hero', label: 'Hero', choices: () => [{ label: 'Active', value: 'active' }, { label: 'All', value: 'all' }, ...HERO_IDS.map(id => ({ label: heroName(id), value: id }))], value: 'active' }, { key: 'lvl', label: 'Level', choices: [1, 10, 20, 30, 45, 60], value: 30 }], go: 'Set',
      run: (G, v) => { const ids = v.hero === 'all' ? HERO_IDS : [v.hero === 'active' ? G.state.activeHero : v.hero]; for (const id of ids) setLevel(G, id, v.lvl); refreshHero(G); return `${v.hero === 'all' ? 'Every hero' : heroName(ids[0])}: level ${v.lvl}`; } },
    { group: 'Points and skills (the active hero)', label: 'Skill points', choices: [1, 10, 50].map(n => ({ label: `+${n}`, value: n })), run: (G, n) => { G.actions.addSkillPts(n); return `+${n} skill points`; } },
    { label: 'Stat points', choices: [5, 50, 250].map(n => ({ label: `+${n}`, value: n })), run: (G, n) => { G.actions.addStatPts(n); return `+${n} stat points`; } },
    { label: 'Max every skill', hint: 'All the active hero\'s skills at 20', run: G => { const P = G.state.player, cls = G.state.activeHero; let n = 0; for (const [id, d] of Object.entries(SKILLS)) if ((d.cls || 'chewy') === cls && !d.training) { P.skills[id] = MAX_SKILL_LVL; n++; } refreshHero(G); return `${heroName(cls)}: ${n} skills at ${MAX_SKILL_LVL}`; } },
    { label: 'Reset skills', confirm: true, hint: 'Every skill and stat point back (the Forget-Me-Not Tea)', run: G => { const r = G.actions.respec(); refreshHero(G); return `Refunded ${r.skillPts} skill and ${r.statPts} stat points`; } },
    { group: 'Shadow', label: "Shadow's whelp outfit", choices: [{ label: 'With Foosy', value: 'auto' }, { label: 'On', value: 'on' }, { label: 'Off', value: 'off' }], run: (G, v) => { const w = G.companion?.whelp; if (!w) return 'No whelp outfit'; w.forced = v === 'auto' ? undefined : v === 'on'; return v === 'auto' ? 'Shadow dresses up only with Foosy again' : `Whelp outfit ${v} (this session)`; } },
  ], { title: 'Heroes', icon: 'paw', order: 10 });

  registerDebug('world', [
    { label: 'Open every zone', hint: 'All the Travel Map', run: unlockZones },
    { label: 'Save every village', hint: 'Sieges done, buildings open', run: saveVillages },
    { label: 'Clear every dungeon', hint: 'The four zone dungeons and the Burrow to floor 20', run: clearDungeons },
    { group: 'Story', label: 'Jump to chapter', choices: () => [...CHAIN.map((id, i) => ({ label: `${i + 1}. ${QUESTS[id].title}`, value: id })), { label: 'All done', value: 'done' }], run: storyTo },
    { label: 'Next quest step', run: nextStep },
    { label: 'Complete the quest', hint: 'The story quest running now, rewards and all', run: completeQuest },
    { group: 'Joining scenes', label: 'Play again', hint: 'Not joined, out of town; level and gear kept', choices: () => HERO_IDS.filter(id => id !== 'chewy').map(id => ({ label: heroName(id), value: id })).concat([{ label: 'All', value: 'all' }]),
      run: (G, v) => { const ids = v === 'all' ? HERO_IDS.filter(id => id !== 'chewy') : [v]; const ok = ids.filter(id => rearm(G, id)); G.save?.(); return ok.length ? `Ready to meet again: ${ok.map(heroName).join(', ')}` : "Can't re-arm the hero you're playing"; } },
    { group: 'Guides', label: 'Reset every guide', run: G => guides(G, false) },
    { label: 'Mark every guide done', run: G => guides(G, true) },
  ], { title: 'World', icon: 'map', order: 20 });

  registerDebug('tiers', [
    { label: 'Open T1–T5 everywhere', run: openTiers },
    { label: 'Spirit tier', hint: 'Opens the Spirit endgame up to this tier', choices: [1, 9, 10, 20].map(n => ({ label: `Spirit ${n}`, value: n })), run: setSpirit },
    { label: 'Tier run', closes: true, fields: [
      { key: 'id', label: 'Dungeon', choices: TIER_DUNGEONS.map(id => ({ label: DUNGEONS[id].name, value: id })), value: 'bambooDepths' },
      { key: 'run', label: 'Tier', choices: RUN_TIERS.map(([label, value]) => ({ label, value })), value: RUN_TIERS[2][1] },
      { key: 'mods', label: 'Modifiers', multi: true, choices: MOD_IDS.map(id => ({ label: ZONE_MODS[id].name, value: id })), value: [] },
    ], go: 'Set off', run: async (G, v) => { await settle(G); G.state.flags.burrowTut = true; G.tierDebug.run(v.id, v.run.tier || 5, v.mods, v.run.spirit || 0); await when(() => G.dungeon?.def?.id === v.id && idle(G), null, 60000); return `${DUNGEONS[v.id].name}: ${v.run.spirit ? `Spirit ${v.run.spirit}` : `Tier ${v.run.tier}`}${v.mods.length ? ' + ' + v.mods.map(m => ZONE_MODS[m].name).join(', ') : ''}`; } },
    { label: 'Open the Lantern', closes: true, choices: TIER_DUNGEONS.map(id => ({ label: DUNGEONS[id].name, value: id })), run: (G, id) => { if (!(tierRecord(G.state, id).tier.unlocked > 0)) G.tierDebug.unlock(id, 1); G.lantern.open(id); return `${DUNGEONS[id].name}'s Spirit Lantern`; } },
    { label: 'The pinnacle', hint: 'Spirit 10: the Four Seasons', closes: true, choices: ['bambooDepths', 'burrowDeep'].map(id => ({ label: DUNGEONS[id].name, value: id })), run: async (G, id) => { await settle(G); if (spiritMax(G.state) < 10) setSpirit(G, 10); G.state.flags.burrowTut = true; G.tierDebug.run(id, 5, [], 10, 2); await when(() => G.dungeon?.tr?.pin && idle(G), null, 60000); return 'The pinnacle: the Four Seasons'; } },
  ], { title: 'Tiers', icon: 'lantern', order: 30 });

  const zoneRows = ZONE_IDS.map(id => ({ label: zoneName(id), closes: true, choices: () => {
    const c = [{ label: 'Trail', value: 'trail' }];
    if (villageReady(id)) c.push({ label: 'Village', value: 'village' });
    if (DUNGEONS[ZONE_DUNGEON[id]]?.gate) c.push({ label: 'Dungeon gate', value: 'gate' });
    if (REGIONS[id]?.layout?.wild || REGIONS[id]?.wild) c.push({ label: 'Wild areas', value: 'wild' });
    return c;
  }, run: (G, where) => toZone(G, id, where) }));
  registerDebug('travel', [
    { label: 'Blossom Hollow', closes: true, run: toVillage },
    { label: "Chewy's Cottage", hint: 'The house, inside', closes: true, run: toHome },
    { group: 'Zones', note: 'The wild areas join these rows once the cozy path adds them (ROADMAP CZ-3).' },
    ...zoneRows,
    { group: 'Dungeons', label: 'The Burrow', closes: true, choices: Array.from({ length: 20 }, (_, i) => ({ label: `B${i + 1}`, value: i + 1 })), run: (G, f) => toDungeon(G, f) },
    ...Object.values(DUNGEONS).filter(d => d.kind === 'zone').map(d => ({ label: d.name, closes: true, choices: [{ label: 'Floor 1', value: 1 }, { label: 'Floor 2', value: 2 }, { label: 'Boss arena', value: 'arena' }],
      run: (G, f) => toDungeon(G, { id: d.id, floor: f === 'arena' ? 2 : f }, f === 'arena') })),
    { label: 'The Deep Burrow', hint: 'Tier 1', closes: true, choices: [{ label: 'Floor 1', value: 1 }, { label: 'Floor 2', value: 2 }], run: (G, f) => toDungeon(G, { id: 'burrowDeep', floor: f, tier: 1 }) },
  ], { title: 'Travel', icon: 'torii', order: 40 });

  registerDebug('village', [
    { label: 'Coins', choices: [{ label: '+1k', value: 1000 }, { label: '+100k', value: 100000 }], run: (G, n) => { G.actions.addCoins(n); return `+${n.toLocaleString('en-US')} coins`; } },
    { label: 'Every material', choices: [{ label: '+100', value: 100 }, { label: '+999', value: 999 }], run: (G, n) => { for (const k of MATERIAL_KEYS) G.actions.addMaterial(k, n); return `+${n} of all ${MATERIAL_KEYS.length} materials`; } },
    { label: 'Unlock every building and recipe', hint: 'Rank 5 plots, the workbench and cooking recipes', run: unlockBuildings },
    { label: 'Village rank', hint: 'At least this rank (the villagers can push it higher)', choices: [1, 2, 3, 4, 5].map(n => ({ label: `Rank ${n}`, value: n })), run: setRank },
    { label: 'All furniture and decor', run: giveFurniture },
    { label: 'Pantry', choices: [{ label: 'Fill it all', value: 'all' }, { label: 'Seeds', value: 'seeds' }, { label: 'Meals', value: 'meals' }], run: fillPantry },
  ], { title: 'Village', icon: 'home', order: 50 });

  const U = id => ({ label: UNIQUES[id].name, value: id });
  const plainU = UNIQUE_IDS.filter(id => !UNIQUES[id].zone), zoneU = UNIQUE_IDS.filter(id => UNIQUES[id].zone && UNIQUES[id].zone !== 'spirit'), spiritU = UNIQUE_IDS.filter(id => UNIQUES[id].zone === 'spirit');
  const uniq = (G, id) => { const u = UNIQUES[id]; give(G, makeUnique(id, Math.max(u.lvl, G.state.player.lvl || 1))); return `${u.name} → the bag`; };
  registerDebug('items', [
    { label: 'Gear set', hint: 'Equipped on the active hero', fields: [{ key: 'lvl', label: 'Level', choices: [1, 10, 20, 30, 45, 60], value: 30 }, { key: 'rarity', label: 'Rarity', choices: ['magic', 'rare', 'unique', 'set'].map(r => ({ label: r[0].toUpperCase() + r.slice(1), value: r })), value: 'rare' }], go: 'Equip', run: (G, v) => gearSet(G, v.lvl, v.rarity) },
    { label: 'Potions', hint: 'A full belt', run: G => { for (const k in POTION_CAP) G.actions.addPotion(k, POTION_CAP[k]); return 'The belt is full'; } },
    { label: 'Gems', hint: 'Three of each kind, perfect', run: G => { for (const t of GEM_TYPES) { const g = makeGem(t, 2); g.qty = 3; give(G, g); } return `${GEM_TYPES.length} kinds of perfect gems ×3 → the bag`; } },
    { note: 'Identify all: nothing to do. Pawhaven has no unidentified items; every drop shows its stats.' },
    { group: 'Uniques (to the bag)', label: 'Endgame and pinnacle', wide: true, choices: spiritU.map(U), run: uniq },
    { label: 'Zone bosses', wide: true, choices: zoneU.map(U), run: uniq },
    { label: 'Everything else', wide: true, choices: plainU.map(U), run: uniq },
  ], { title: 'Items', icon: 'gift', order: 60 });

  const kinds = Object.entries(MONSTERS).filter(([, d]) => !d.boss && !d.ally && !d.captain).map(([id, d]) => ({ label: d.name || id, value: id }));
  registerDebug('combat', [
    { note: 'This session only: none of these are saved.' },
    { label: 'God mode', hint: 'Nothing hurts the hero', toggle: true, get: () => TOG.god, run: (G, on) => { TOG.god = on; return `God mode ${on ? 'on' : 'off'}`; } },
    { label: 'One-hit kills', toggle: true, get: () => TOG.oneHit, run: (G, on) => { TOG.oneHit = on; return `One-hit kills ${on ? 'on' : 'off'}`; } },
    { label: 'No cooldowns', toggle: true, get: () => TOG.noCd, run: (G, on) => { TOG.noCd = on; return `No cooldowns ${on ? 'on' : 'off'}`; } },
    { label: 'Endless zoom', hint: 'Zoom (mana) never runs out', toggle: true, get: () => TOG.infZoom, run: (G, on) => { TOG.infZoom = on; return `Endless zoom ${on ? 'on' : 'off'}`; } },
    { label: 'Hero speed ×2', toggle: true, get: () => TOG.speed2, run: (G, on) => { TOG.speed2 = on; return `Speed ×${on ? 2 : 1}`; } },
    { label: 'Freeze monsters', toggle: true, get: () => TOG.freeze, run: (G, on) => { TOG.freeze = on; if (!on) for (const m of G.dungeon?.monsters || []) if (m.status) m.status.freeze = 0; return `Monsters ${on ? 'frozen' : 'free'}`; } },
    { label: 'FPS and draw calls', toggle: true, noMark: true, get: () => TOG.perf, run: (G, on) => { TOG.perf = on; return `Perf overlay ${on ? 'on' : 'off'}`; } },
    { label: 'Kill every monster here', run: G => { const n = killAll(G); return n ? `${n} monsters down` : 'No monsters here'; } },
    { label: 'Spawn a pack', closes: true, fields: [{ key: 'kind', label: 'Kind', choices: kinds, value: kinds[0]?.value }, { key: 'n', label: 'Count', choices: [3, 8, 16, 30], value: 8 }, { key: 'rank', label: 'Leader', choices: [{ label: 'None', value: 'normal' }, { label: 'Champion', value: 'champion' }, { label: 'Unique', value: 'unique' }], value: 'normal' }], go: 'Spawn',
      run: (G, v) => spawnPack(G, v.kind, v.n, v.rank) },
  ], { title: 'Combat', icon: 'swords', order: 70 });

  registerDebug('time', [
    { label: 'Time of day', choices: [6, 9, 12, 15, 18, 21, 0].map(h => ({ label: fmtHour(h), value: h })), run: setHour },
    { label: 'Skip to the next morning', run: G => nextDay(G, false) },
    { label: 'Skip a whole day', hint: 'Same time tomorrow', run: G => nextDay(G, true) },
    { group: 'Weather (in a zone)', label: 'Weather', choices: [['Clear', 'clear'], ['Snow', 'snow'], ['Petals', 'petals'], ['Leaves', 'leaves'], ['Fireflies', 'fireflies'], ['Mist', 'mist'], ["The zone's own", 'own']].map(([label, value]) => ({ label, value })), run: weather },
  ], { title: 'Time', icon: 'sun', order: 80 });

  // the cozy path (ROADMAP CZ-*, docs/COZY.md) registers its own actions here: registerDebug('cozy', [...]) from src/cozy
  registerDebug('cozy', [], { title: 'Cozy', icon: 'leaf', order: 90, note: 'Nothing here yet. The cozy path (ROADMAP CZ-1…CZ-12, docs/COZY.md) adds its own actions with registerDebug(\'cozy\', […]): the world clock, time away, expeditions, the Adventurers\' Guild and its hires, scavenging.' });

  registerDebug('save', [
    { label: 'Back up this save', noMark: true, hint: () => backupHint(), run: () => api.backup() },
    { label: 'Restore the backup', noMark: true, confirm: true, hint: () => backupHint(), run: () => api.restore() },
    { label: 'Turn debug tools off', noMark: true, confirm: true, hint: 'Forgets the password on this device', run: G => { G.debug?.disable(); return ''; } },
  ], { title: 'Save', icon: 'save', order: 100 });
  const backupHint = () => { const b = api.backupInfo(); return b ? `Backup from ${new Date(b.at).toLocaleString()}` : 'No backup yet'; };
}
