// RPG data/logic self-test: node tools/test-rpg.mjs [--quiet]
// Validates schemas & invariants, simulates leveling 1→60, prints sample items/tooltips and drop-rate tables, and
// tests the homestead's pure math (docs/HOMESTEAD.md): the pantry, recipes and mixes, Well Fed in computeStats, the
// garden's growth rules, the fish tables and the reel sim; and housing's (docs/HOUSING.md): the furniture catalog, the
// room shells, the placement rules and the default furnishings.
import { RNG } from '../src/core/util.js';
import { Events } from '../src/core/events.js';
import { SKILLS, SKILL_IDS, TREES, ATTACK, synergyMult, effectiveLevel, canLearn, skillRuntime, usable, ROW_REQ } from '../src/rpg/skills.js';
import {
  ITEM_BASES, GEAR_BASE_IDS, AFFIX_FAMILIES, AFFIXES, UNIQUES, UNIQUE_IDS, SETS, SET_ITEMS, SET_ITEM_IDS, GEMS, GEM_TYPES, RARITY,
  generateItem, rollRarity, makeUnique, makeSetItem, makeGem, socketGem, rareName, itemValue, itemTooltip, shopStock, starterItems, EQUIP_SLOTS, EQUIP_SLOT_ITEM,
} from '../src/rpg/items.js';
import {
  computeStats, DERIVED_KEYS, isAffixStat, monsterStats, xpToNext, xpForKill, rollHit, playerDamageTaken, MONSTER_MODS, MONSTER_MOD_IDS,
  applyRandomMods, LEVEL_CAP, RES_CAP, monsterPhysDR, playerPhysDR,
} from '../src/rpg/stats.js';
import { rollDrops, chestDrops, MATERIAL_KEYS } from '../src/rpg/loot.js';
import { createActions, newGameState, normalizeHeroes, saveableState } from '../src/rpg/actions.js';
import { CLASSES, HERO_IDS, WEAPON_CLASS, canWield, heroText } from '../src/rpg/classes.js';
import { PANTRY, PANTRY_IDS, KINDS as PKINDS, CROPS, CROP_IDS, LOVED, sellPrice, seedDrops, forageDrops, pantryHas, pantryList } from '../src/life/pantry.js';
import { RECIPES, RECIPE_IDS, STATIONS, STARTERS, COOKBOOK, cookbookOf, knows, learn, spendFor, maxCook, haveOf, matchMix, fallbackMix, cookableAt, hintFor, teachesOf } from '../src/life/cooking.js';
import { BUFFS, mealFor, mealActive } from '../src/life/meals.js';
import { growNight, harvestCrop, isRipe, SPRINKLE } from '../src/life/gardenRules.js';
import { FISH, FISH_IDS, SPOTS, biters, rollFish, rollSize, recordCatch, timeOf, MILESTONES } from '../src/life/fishData.js';
import { ReelSim } from '../src/life/reelSim.js';
import { table as fishTable, tierMeans, TARGETS as FISH_TARGETS } from './fishing-sim.mjs';
import { reelParams, RODS } from '../src/life/fishData.js';
import { FURNITURE, FURNITURE_IDS, SURFACES, SURFACE_IDS, SETS as FSETS, CATS as FCATS, TABS as FTABS, CELL as FCELL, footprint, storable, itemDef, storageList, tabOf, STARTER_STORAGE } from '../src/home/furniture.js';
import { LAYOUTS, shellOf, layoutFor, isBack, WALL_H } from '../src/home/rooms.js';
import { canPlace, poseOf, boxOf, cellsOf, wallSpan, frontCell, nextK } from '../src/home/placement.js';
import { defaultInterior } from '../src/home/defaults.js';

const quiet = process.argv.includes('--quiet');
let fails = 0, checks = 0;
const errs = new Map();
function ok(cond, msg) {
  checks++;
  if (!cond) { fails++; errs.set(msg, (errs.get(msg) || 0) + 1); }
  return cond;
}
const fin = v => typeof v === 'number' && Number.isFinite(v);
const log = (...a) => console.log(...a);
const hr = t => log('\n' + '='.repeat(12) + ' ' + t + ' ' + '='.repeat(Math.max(4, 70 - t.length)));
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

// ------------------------------------------------------------------ skills
hr('SKILLS');
// five heroes (docs/HEROES.md, docs/POE.md, docs/SHIHTZU.md, docs/GOLDEN.md): Chewy's three trees (bone / fetch / spirit),
// Moka's (tide / star / duck), Poe's (shuriken / jutsu / shadow), the Shih Tzu's (flail / hex / tome) and Foosy's (lance /
// javelin / whelp), 21 skills each
ok(SKILL_IDS.length === 105 && TREES.length === 15, 'exactly 105 skills in 15 trees');
for (const h of HERO_IDS) ok(SKILL_IDS.filter(id => SKILLS[id].cls === h).length === 21, `${h} has 21 skills`);
for (const t of TREES) {
  const ids = SKILL_IDS.filter(id => SKILLS[id].tree === t.id);
  ok(ids.length === 7, `tree ${t.id} has 7 skills`);
  const cells = new Set(ids.map(id => SKILLS[id].row + ':' + SKILLS[id].col));
  ok(cells.size === 7, `tree ${t.id} cells unique`);
}
for (const id of ['chomp', 'boneMastery', 'whirl', 'dig', 'frenzy', 'bonestorm', 'throw', 'fetchMastery', 'ricochet', 'multi', 'blaze', 'fetchstorm', 'woof', 'goodboy', 'zoom', 'packcall', 'howl', 'moonhowl'])
  ok(!!SKILLS[id], `ported skill ${id} exists`);
const KINDS = ['active', 'passive', 'channel', 'aura', 'summon'], ELS = ['phys', 'fire', 'frost', 'zap', 'stink', 'holy', 'gloom'];
for (const id of [...SKILL_IDS, 'attack']) {
  const s = id === 'attack' ? ATTACK : SKILLS[id];
  ok(id === 'attack' || (s.row >= 0 && s.row <= 5 && s.col >= 0 && s.col <= 2), `${id} row/col in range`);
  ok(id === 'attack' || s.req === ROW_REQ[s.row], `${id} req matches row`);
  ok(KINDS.includes(s.kind), `${id} kind valid`);
  ok(ELS.includes(s.element), `${id} element valid`);
  ok([null, 'sword', 'ball', 'staff', 'fuma', 'flail', 'lance'].includes(s.wep) && (id === 'attack' || !s.wep || WEAPON_CLASS[s.wep] === s.cls), `${id} wep valid`);
  for (const p of s.pre) ok(SKILLS[p] && SKILLS[p].tree === s.tree && SKILLS[p].row < s.row, `${id} prereq ${p} valid`);
  for (const y of s.syn) ok(!!SKILLS[y.id] && fin(y.p), `${id} synergy ${y.id} valid`);
  for (let l = 1; l <= 30; l++) {
    const fake = { dmgMin: 10, dmgMax: 20, lifeMax: 300, weaponType: 'ball', pierce: 1, ballSpeed: 1.2, synergy: { [id]: 1.5 } };
    ok(fin(s.cost(l)) && s.cost(l) >= 0, `${id} cost finite`);
    ok(fin(s.cd(l)) && s.cd(l) >= 0, `${id} cd finite`);
    const p = s.params(l, fake);
    for (const k in p) ok(typeof p[k] === 'boolean' || fin(p[k]), `${id} params.${k} finite`);
    const p0 = s.params(l);
    for (const k in p0) ok(typeof p0[k] === 'boolean' || fin(p0[k]), `${id} params(no derived).${k} finite`);
    const inf = s.info(l, fake);
    ok(Array.isArray(inf) && inf.every(x => typeof x === 'string' && x.length && !/NaN|undefined/.test(x)), `${id} info strings`);
  }
}
if (!quiet) for (const t of TREES) {
  log(`\n[${t.name}]`);
  for (const id of SKILL_IDS.filter(i => SKILLS[i].tree === t.id).sort((a, b) => SKILLS[a].row - SKILLS[b].row))
    log(`  r${SKILLS[id].row}c${SKILLS[id].col} L${pad(SKILLS[id].req, 3)} ${pad(SKILLS[id].name, 18)} ${pad(SKILLS[id].kind, 8)} ${pad(SKILLS[id].element, 6)} | L1: ${SKILLS[id].info(1).join(' · ')}`);
}

// ------------------------------------------------------------------ bases / affixes
hr('BASES & AFFIXES');
const tierCount = [0, 0, 0];
for (const id of GEAR_BASE_IDS) {
  const b = ITEM_BASES[id];
  tierCount[b.tier]++;
  ok(['weapon', 'hat', 'outfit', 'collar', 'charm', 'boots', 'paws'].includes(b.slot), `base ${id} slot`);
  ok(b.icon && b.icon.shape && b.icon.variant && b.icon.colors.length === 3, `base ${id} icon`);
  if (b.slot === 'weapon') ok(['sword', 'ball', 'staff', 'fuma', 'flail', 'lance'].includes(b.wtype) && fin(b.dmg[0]) && b.dmg[1] > b.dmg[0] && fin(b.aspd), `weapon ${id} stats`);
  if (['hat', 'outfit', 'boots', 'paws'].includes(b.slot)) ok(b.def && b.def[1] >= b.def[0], `armor ${id} def`);
  ok(b.tier === 0 ? b.lvl < 20 : b.tier === 1 ? b.lvl >= 20 && b.lvl < 40 : b.lvl >= 40, `base ${id} tier/lvl consistent`);
}
for (const slot of ['weapon', 'hat', 'outfit', 'collar', 'charm', 'boots', 'paws'])
  for (const t of [0, 1, 2]) ok(GEAR_BASE_IDS.some(id => ITEM_BASES[id].slot === slot && ITEM_BASES[id].tier === t), `slot ${slot} has tier ${t}`);
for (const wt of ['sword', 'ball', 'staff', 'fuma', 'flail', 'lance']) for (const t of [0, 1, 2]) ok(GEAR_BASE_IDS.some(id => ITEM_BASES[id].wtype === wt && ITEM_BASES[id].tier === t), `${wt} has tier ${t}`);
const prefixes = AFFIXES.filter(a => a.type === 'prefix').length, suffixes = AFFIXES.filter(a => a.type === 'suffix').length;
ok(AFFIXES.length >= 45, '>=45 named affixes');
ok(new Set(AFFIXES.map(a => a.id)).size === AFFIXES.length, 'affix ids unique');
for (const f of AFFIX_FAMILIES) {
  ok(isAffixStat(f.stat), `affix family ${f.id} stat ${f.stat} valid`);
  for (const t of f.tiers) ok(Array.isArray(t[3]) ? t[3][0] <= t[3][1] && t[4][0] <= t[4][1] && t[3][1] < t[4][1] + 1 : t[3] <= t[4], `affix ${t[0]} range ordered`);
}
log(`bases: ${GEAR_BASE_IDS.length} (normal ${tierCount[0]}, exceptional ${tierCount[1]}, elite ${tierCount[2]}) · affix families ${AFFIX_FAMILIES.length} · named affixes ${AFFIXES.length} (${prefixes} prefixes, ${suffixes} suffixes)`);
log(`uniques: ${UNIQUE_IDS.length} · sets: ${Object.keys(SETS).length} (${SET_ITEM_IDS.length} pieces) · gem types: ${GEM_TYPES.length} x 3 tiers`);
ok(UNIQUE_IDS.length >= 24, '>=24 uniques');
ok(Object.keys(SETS).length === 3, '3 sets');

// ------------------------------------------------------------------ item validation
function validateItem(it, where) {
  ok(typeof it.uid === 'string' && it.uid.length > 3, `${where}: uid`);
  ok(['gear', 'gem', 'material', 'gift', 'key'].includes(it.kind), `${where}: kind`);
  ok(!!ITEM_BASES[it.base], `${where}: base exists`);
  ok(typeof it.name === 'string' && it.name.length > 0 && !/undefined|NaN/.test(it.name), `${where}: name`);
  ok(RARITY[it.rarity], `${where}: rarity`);
  ok(fin(it.ilvl) && it.ilvl >= 1, `${where}: ilvl`);
  ok(it.req && Number.isInteger(it.req.lvl) && it.req.lvl >= 1 && it.req.lvl <= 60, `${where}: req.lvl`);
  ok(fin(it.value) && it.value > 0, `${where}: value`);
  ok(it.icon && typeof it.icon.shape === 'string' && Array.isArray(it.icon.colors), `${where}: icon`);
  ok(Array.isArray(it.affixes) && Array.isArray(it.gems) && Number.isInteger(it.sockets), `${where}: arrays`);
  if (it.kind === 'gear') {
    const b = ITEM_BASES[it.base];
    ok(it.slot === b.slot, `${where}: slot matches base`);
    ok(it.sockets <= (b.sockets || 0), `${where}: sockets <= base max`);
    if (b.slot === 'weapon') ok(it.wtype === b.wtype && fin(it.dmg[0]) && fin(it.dmg[1]) && fin(it.aspd), `${where}: weapon fields`);
    if (b.def) ok(Number.isInteger(it.def) && it.def >= b.def[0] && it.def <= b.def[1], `${where}: def in base range`);
    if (it.rarity === 'normal') ok(it.affixes.filter(a => !a.gem).length === 0, `${where}: normal has no affixes`);
    if (it.rarity === 'magic') ok(it.affixes.length >= 1 && it.affixes.length <= 2, `${where}: magic 1-2 affixes`);
    if (it.rarity === 'rare') ok(it.affixes.length >= 3 && it.affixes.length <= 6, `${where}: rare 3-6 affixes`);
    if (it.rarity === 'magic' || it.rarity === 'rare') {
      const pre = it.affixes.filter(a => a.type === 'prefix').length, suf = it.affixes.filter(a => a.type === 'suffix').length;
      ok(pre <= 3 && suf <= 3, `${where}: <=3 prefixes/suffixes`);
      const groups = it.affixes.map(a => AFFIX_FAMILIES.find(f => f.tiers.some(t => t[0] === a.id))?.group);
      ok(new Set(groups).size === groups.length, `${where}: no duplicate affix groups`);
    }
    if (it.slot === 'collar' || it.slot === 'charm') ok(it.rarity !== 'normal', `${where}: jewelry never normal`);
  }
  for (const a of it.affixes) {
    ok(isAffixStat(a.stat), `${where}: affix stat '${a.stat}' is a derived key`);
    ok(Array.isArray(a.value) ? a.value.length === 2 && fin(a.value[0]) && fin(a.value[1]) && a.value[0] <= a.value[1] : fin(a.value), `${where}: affix value finite`);
    ok(typeof a.text === 'string' && a.text.length > 3 && !/undefined|NaN/.test(a.text), `${where}: affix text`);
    ok(typeof a.id === 'string', `${where}: affix id`);
  }
}
hr('ITEM GENERATION (2000 items)');
const rng = new RNG(12345);
const rarCount = {}, slotCount = {}, tierDrop = [0, 0, 0];
const gen = [];
for (let i = 0; i < 2000; i++) {
  const ilvl = 1 + (i % 60);
  const it = generateItem({ ilvl, mf: (i % 5) * 60, rank: ['normal', 'champion', 'unique', 'boss'][i % 4], rng });
  gen.push(it);
  validateItem(it, 'gen');
  ok(ITEM_BASES[it.base].lvl <= Math.max(ilvl, it.ilvl), 'gen: base level <= ilvl');
  rarCount[it.rarity] = (rarCount[it.rarity] || 0) + 1;
  slotCount[it.slot] = (slotCount[it.slot] || 0) + 1;
  tierDrop[it.tier]++;
}
// forced rarities
for (const r of ['normal', 'magic', 'rare', 'unique', 'set']) for (let i = 0; i < 100; i++) {
  const it = generateItem({ ilvl: 1 + (i % 60), rarity: r, rng });
  validateItem(it, `forced-${r}`);
}
for (const slot of ['weapon', 'hat', 'outfit', 'collar', 'charm', 'boots', 'paws']) for (let i = 0; i < 20; i++) {
  const it = generateItem({ ilvl: 1 + i * 3, slot, rng });
  ok(it.slot === slot, `slot filter ${slot}`);
}
for (let i = 0; i < 20; i++) ok(generateItem({ ilvl: 30, slot: 'weapon', wtype: 'ball', rng }).wtype === 'ball', 'wtype filter');
log('rarity mix (mixed ranks/mf):', JSON.stringify(rarCount));
log('slot mix:', JSON.stringify(slotCount), ' tier mix:', tierDrop.join('/'));
// determinism
{
  const a = generateItem({ ilvl: 33, rng: new RNG(99) }), b = generateItem({ ilvl: 33, rng: new RNG(99) });
  ok(a.name === b.name && JSON.stringify(a.affixes) === JSON.stringify(b.affixes), 'seeded generation deterministic');
}

// uniques / sets / gems
for (const id of UNIQUE_IDS) {
  const u = UNIQUES[id];
  ok(!!ITEM_BASES[u.base], `unique ${id} base exists`);
  ok(ITEM_BASES[u.base].lvl <= u.lvl, `unique ${id} base lvl <= unique lvl`);
  const it = makeUnique(id, u.lvl, rng);
  validateItem(it, 'unique:' + id);
  ok(it.flavor && it.uniqueId === id, `unique ${id} flavor/id`);
}
for (const id of SET_ITEM_IDS) {
  const it = makeSetItem(id, rng);
  validateItem(it, 'set:' + id);
  ok(SETS[it.setId].pieces.includes(id), `set piece ${id} in set`);
}
for (const sid in SETS) for (const b of SETS[sid].bonuses) for (const s of b.stats) ok(isAffixStat(s.stat) && fin(s.value), `set ${sid} bonus stat valid`);
for (const t of GEM_TYPES) for (const tier of [0, 1, 2]) {
  const g = makeGem(t, tier);
  validateItem(g, 'gem');
  ok(isAffixStat(GEMS[t].weapon.stat) && isAffixStat(GEMS[t].armor.stat), `gem ${t} stats valid`);
}
{
  const it = generateItem({ ilvl: 10, base: 'boneSword', rarity: 'normal', rng });
  it.sockets = 2;
  ok(socketGem(it, makeGem('ruby', 1)).ok, 'socket ruby into sword');
  ok(it.affixes.some(a => a.stat === 'fireDmg'), 'ruby in weapon adds fire');
  ok(socketGem(it, makeGem('topaz', 0)).ok, 'socket 2nd gem');
  ok(!socketGem(it, makeGem('topaz', 0)).ok, 'no 3rd socket');
  const hat = generateItem({ ilvl: 10, base: 'knitBeanie', rarity: 'normal', rng }); hat.sockets = 1;
  socketGem(hat, makeGem('ruby', 2));
  ok(hat.affixes.some(a => a.stat === 'lifeMax' && a.value === 35), 'perfect ruby in hat = +35 life');
  validateItem(it, 'socketed');
}
ok(/\w+ \w+/.test(rareName(rng, 'sword')), 'rareName');
{
  const st = starterItems();
  ok(st.sword.base === 'boneSword' && st.sword.rarity === 'normal' && st.ball.base === 'redTennisBall', 'starter items');
}
for (let s = 1; s < 8; s++) {
  const shop = shopStock(1 + s * 7, s);
  ok(shop.length >= 10, 'shop has stock');
  for (const it of shop) { validateItem(it, 'shop'); ok(fin(it.price) && it.price > it.value, 'shop price > sell value'); }
  const again = shopStock(1 + s * 7, s);
  ok(again.map(i => i.name).join() === shop.map(i => i.name).join(), 'shop deterministic per seed');
}

// ------------------------------------------------------------------ computeStats
hr('COMPUTE STATS');
function validateDerived(d, where) {
  for (const k of DERIVED_KEYS) ok(k in d, `${where}: derived has ${k}`);
  for (const k of DERIVED_KEYS) {
    const v = d[k];
    if (k === 'weaponType') ok(v === 'sword' || v === 'ball', `${where}: weaponType`);
    else if (k === 'treeSkills') ok(['bone', 'fetch', 'spirit'].every(t => fin(v[t])), `${where}: treeSkills`);
    else if (Array.isArray(v)) ok(v.length === 2 && fin(v[0]) && fin(v[1]) && v[0] <= v[1], `${where}: ${k} range`);
    else ok(fin(v), `${where}: ${k} finite (${v})`);
  }
  for (const r of ['resFire', 'resFrost', 'resZap', 'resStink']) ok(d[r] <= RES_CAP && d[r] >= -100, `${where}: ${r} capped`);
  ok(d.crit <= 75 && d.block <= 60 && d.cdr <= 50, `${where}: caps`);
  ok(d.dmgMax > d.dmgMin && d.dmgMin >= 1, `${where}: dmg order`);
  ok(d.lifeMax > 0 && d.zoomMax > 0 && d.aspd > 0 && d.moveMul > 0, `${where}: positives`);
}
const fresh = newGameState();
const d0 = computeStats(fresh);
validateDerived(d0, 'fresh');
log('fresh char:', JSON.stringify({ life: d0.lifeMax, zoom: d0.zoomMax, dmg: [d0.dmgMin, d0.dmgMax], aspd: d0.aspd, crit: d0.crit, def: d0.def, wt: d0.weaponType, lifeRegen: d0.lifeRegen, zoomRegen: d0.zoomRegen }));
fresh.player.activeWeapon = 1;
const d0b = computeStats(fresh);
ok(d0b.weaponType === 'ball', 'swap → ball');
log('fresh (ball):', JSON.stringify({ dmg: [d0b.dmgMin, d0b.dmgMax], aspd: d0b.aspd }));

function randomLoadout(lvl, r, mf = 0) {
  const st = newGameState();
  const P = st.player;
  P.lvl = lvl;
  const pts = (lvl - 1) * 5;
  const build = r.pick(['bone', 'fetch', 'spirit']);
  const main = build === 'fetch' ? 'dex' : 'str';
  P.stats[main] += Math.round(pts * 0.4); P.stats.vit += Math.round(pts * 0.4); P.stats.dex += Math.round(pts * 0.1); P.stats.ene += pts - Math.round(pts * 0.4) * 2 - Math.round(pts * 0.1);
  P.skills = {};
  // A sensible-but-not-optimal bot: main skill & mastery to 20, prerequisites/synergies to ~5, the rest anywhere legal.
  let sp = lvl + Math.floor(lvl / 5);
  const prio = { bone: [['chomp', 20], ['boneMastery', 20], ['dig', 8], ['whirl', 4], ['guard', 5], ['frenzy', 5], ['bonestorm', 20]],
    fetch: [['throw', 20], ['fetchMastery', 20], ['multi', 8], ['ricochet', 4], ['decoy', 3], ['blaze', 5], ['fetchstorm', 20]],
    spirit: [['woof', 20], ['goodboy', 10], ['zoom', 2], ['packcall', 10], ['treat', 3], ['howl', 10], ['moonhowl', 20]] }[build];
  const learnable = id => { const s = SKILLS[id]; return P.lvl >= s.req + (P.skills[id] || 0) && (P.skills[id] || 0) < 20 && s.pre.every(p => P.skills[p]); };
  while (sp > 0) {
    const pickS = prio.find(([id, cap]) => (P.skills[id] || 0) < cap && learnable(id)) || prio.find(([id]) => learnable(id));
    if (!pickS) break;
    P.skills[pickS[0]] = (P.skills[pickS[0]] || 0) + 1; sp--;
  }
  const wt = build === 'fetch' ? 'ball' : 'sword';
  const eq = st.equipment;
  const pick = (slot, wtype) => generateItem({ ilvl: lvl, slot, wtype, rarity: r.pick(['magic', 'magic', 'rare', 'normal', 'rare']), mf, rng: r });
  eq.weapon = pick('weapon', wt); eq.weaponAlt = pick('weapon', wt === 'ball' ? 'sword' : 'ball');
  for (const s of ['hat', 'outfit', 'collar', 'boots', 'paws']) eq[s] = pick(s);
  eq.charm1 = pick('charm'); eq.charm2 = pick('charm');
  // respect requirements loosely: drop items we couldn't wear
  for (const k of EQUIP_SLOTS) { const it = eq[k]; if (it && (it.req.lvl > lvl)) eq[k] = null; }
  return { st, build };
}
const rl = new RNG(777);
for (let i = 0; i < 400; i++) {
  const lvl = 1 + (i % 60);
  const { st } = randomLoadout(lvl, rl, (i % 3) * 100);
  const d = computeStats(st);
  validateDerived(d, 'loadout');
  // effective levels respect base>0
  for (const id of SKILL_IDS) ok((st.player.skills[id] > 0) === (d.skillLevels[id] > 0), 'effLvl>0 iff base>0');
}
// uniques & sets on a loadout
{
  const st = newGameState(); st.player.lvl = 60;
  const eq = st.equipment;
  eq.weapon = makeSetItem('ronBlade'); eq.hat = makeSetItem('ronKasa'); eq.outfit = makeSetItem('ronHaori'); eq.paws = makeSetItem('ronTekko'); eq.boots = makeSetItem('ronWaraji');
  eq.collar = makeUnique('goodestTag', 60); eq.charm1 = makeUnique('darumaPersist', 60); eq.charm2 = makeUnique('borrowedCat', 60);
  const d = computeStats(st);
  validateDerived(d, 'fullset');
  ok(d.setCounts.moonlitRonin === 5, 'set count 5');
  ok(d.treeSkills.bone === 2 && d.allSkills === 2, 'set + unique skill bonuses applied');
  log('full Moonlit Ronin + uniques @60:', JSON.stringify({ life: d.lifeMax, dmg: [d.dmgMin, d.dmgMax], crit: d.crit, critDmg: d.critDmg, aspd: d.aspd, def: d.def, res: [d.resFire, d.resFrost, d.resZap, d.resStink], lifeSteal: d.lifeSteal, allSkills: d.allSkills }));
}
// skill runtime & usable
{
  const st = newGameState();
  const d = computeStats(st);
  const rt = skillRuntime('chomp', st, d);
  ok(rt && rt.lvl === 1 && fin(rt.params.dmgPct), 'skillRuntime chomp');
  ok(usable('chomp', st, d).ok, 'chomp usable with sword');
  st.player.activeWeapon = 1;
  ok(!usable('chomp', st, computeStats(st)).ok, 'chomp not usable with ball');
  ok(skillRuntime('attack', st, d).params.dmgPct === 100, 'attack runtime');
  st.player.skills.boneMastery = 3; st.player.skills.dig = 2;
  ok(Math.abs(synergyMult('chomp', st) - (1 + 0.18 + 0.10)) < 1e-9, 'synergy math');
  ok(effectiveLevel('whirl', st, { allSkills: 2 }) === 0, 'effLvl 0 without base');
  ok(effectiveLevel('chomp', st, { allSkills: 2, treeSkills: { bone: 1 } }) === 4, 'effLvl adds bonuses');
}

// ------------------------------------------------------------------ actions
hr('ACTIONS');
{
  const toasts = [], evs = {};
  for (const e of ['inv:changed', 'equip:changed', 'stats:changed', 'coins:changed', 'materials:changed', 'potions:changed', 'player:levelup', 'skill:learned', 'item:pickup', 'item:drop', 'player:dead', 'hotbar:changed'])
    Events.on(e, p => { evs[e] = (evs[e] || 0) + 1; evs[e + ':last'] = p; });
  Events.on('toast', t => toasts.push(t.text));
  const G = { state: newGameState() };
  const A = createActions(G);
  for (const k of ['equip', 'unequip', 'swapWeapons', 'moveItem', 'dropItem', 'pickup', 'usePotion', 'sellItem', 'buyItem', 'learnSkill', 'addStat', 'setHotbar', 'addXp', 'addCoins', 'spendCoins', 'addMaterial', 'hasMaterials', 'spendMaterials', 'recompute'])
    ok(typeof A[k] === 'function', `action ${k} exists`);
  ok(G.derived && G.derived.lifeMax > 0, 'derived set on create');
  const S = G.state;
  // state shape
  ok(S.version === 2 && S.inventory.length === 40 && S.stash.length === 60 && S.player.hotbar.length === 6, 'state shape');
  ok(S.activeHero === 'chewy' && HERO_IDS.every(h => S.heroes[h]?.player?.cls === h) && S.player === S.heroes.chewy.player && S.equipment === S.heroes.chewy.equipment, 'state shape: one progression per hero, live aliases');
  ok(S.heroes.moka.equipment.weapon?.wtype === 'staff' && !('player' in saveableState(S)) && !('equipment' in saveableState(S)), 'state shape: Moka starts with a staff; the aliases are not saved');
  { const v1 = JSON.parse(JSON.stringify(saveableState(S))); delete v1.heroes; v1.player = JSON.parse(JSON.stringify(S.player)); v1.equipment = JSON.parse(JSON.stringify(S.equipment)); v1.version = 1;
    const n = normalizeHeroes(v1); ok(n.version === 2 && n.player === n.heroes.chewy.player && !!n.heroes.moka, 'a v1 save normalises to v2'); }
  ok(S.equipment.weapon.base === 'boneSword' && S.equipment.weaponAlt.base === 'redTennisBall', 'starter equipped');
  ok(JSON.parse(JSON.stringify(S)).equipment.weapon.name === 'Bone Katana', 'state JSON-serialisable');
  { // a save from before the samurai re-flavour: its sword items take the bases' new names (items.js renameLegacyItem)
    const old = JSON.parse(JSON.stringify(S)); old.equipment.weapon.name = 'Crunchy Bone Sword of Zoomies'; old.inventory[0] = { ...old.equipment.weapon, base: 'ribSabre', name: 'Rib Sabre' };
    const N = normalizeHeroes(old);
    ok(N.equipment.weapon.name === 'Crunchy Bone Katana of Zoomies' && N.inventory[0].name === 'Rib Wakizashi', 'old saves: renamed sword bases follow (Bone Sword → Bone Katana, Rib Sabre → Rib Wakizashi)');
  }
  // pickup & stacking
  const hat = generateItem({ ilvl: 1, slot: 'hat', rarity: 'magic', rng });
  ok(A.pickup(hat) && S.inventory[0] === hat, 'pickup gear');
  ok(A.pickup({ type: 'gem', item: makeGem('ruby', 0) }) && A.pickup(makeGem('ruby', 0)), 'pickup gems');
  ok(S.inventory[1].qty === 2 && !S.inventory[2], 'gems stack');
  A.pickup(makeGem('ruby', 1));
  ok(S.inventory[2] && S.inventory[2].gemTier === 1, 'different tier does not stack');
  const c0 = S.coins; A.pickup({ type: 'coins', n: 33 }); ok(S.coins === c0 + 33, 'pickup coins');
  { const s0 = S.materials.silk || 0; A.pickup({ type: 'material', key: 'silk', n: 3 }); ok(S.materials.silk === s0 + 3, 'pickup material'); }
  A.pickup({ type: 'potion', key: 'rejuv' }); ok(S.potions.rejuv === 1, 'pickup potion');
  // equip
  const lifeBefore = G.derived.lifeMax;
  ok(A.equip(0) && S.equipment.hat === hat && !S.inventory[0], 'equip hat');
  ok(evs['equip:changed'] > 0 && evs['stats:changed'] > 0, 'equip events');
  ok(A.unequip('hat') && S.inventory[0] === hat, 'unequip hat');
  ok(G.derived.lifeMax === lifeBefore, 'stats restored after unequip');
  // requirement gating
  const big = generateItem({ ilvl: 50, base: 'kaijuFemur', rarity: 'normal', rng });
  A.pickup(big);
  const bi = S.inventory.indexOf(big);
  ok(!A.equip(bi) && toasts.some(t => /Requires/.test(t)), 'req blocks equip');
  // moveItem
  ok(A.moveItem({ c: 'inv', i: bi }, { c: 'stash', i: 5 }) && S.stash[5] === big, 'move to stash');
  ok(!A.moveItem({ c: 'inv', i: 0 }, { c: 'equip', i: 'boots' }), 'hat cannot go in boots');
  ok(A.moveItem({ c: 'inv', i: 0 }, { c: 'equip', i: 'hat' }) && S.equipment.hat === hat, 'move to equip slot');
  ok(A.moveItem({ c: 'equip', i: 'hat' }, { c: 'inv', i: 10 }) && S.inventory[10] === hat, 'move equip → inv');
  // weapon targeting keeps sword+ball pair
  {
    const newBall = generateItem({ ilvl: 1, base: 'squeakyBall', rarity: 'normal', rng }); newBall.req = { lvl: 1 };
    S.inventory[20] = newBall;
    ok(A.equip(20) && S.equipment.weaponAlt === newBall && S.equipment.weapon.wtype === 'sword', 'new ball replaces the ball, not the active sword');
  }
  { const { info } = SKILLS.chomp; ok(Array.isArray(info(1)), 'destructured skill info works'); }
  // swap weapons
  ok(A.swapWeapons() === 'ball' && G.derived.weaponType === 'ball' && A.swapWeapons() === 'sword', 'swapWeapons');
  // drop & sell
  const dropped = A.dropItem({ c: 'inv', i: 10 });
  ok(dropped === hat && evs['item:drop'] > 0, 'dropItem');
  const cBefore = S.coins; const sv = A.sellItem({ c: 'inv', i: 1 });
  ok(sv > 0 && S.coins === cBefore + sv, 'sellItem stack');
  // buy
  const shop = shopStock(5, 3);
  const cb = S.coins; S.coins = 99999;
  ok(A.buyItem(shop[0], shop[0].price) && S.coins === 99999 - shop[0].price, 'buyItem');
  ok(A.buyItem({ kind: 'potion', key: 'heart' }, 25) && S.potions.heart === 4, 'buy potion');
  S.coins = 3; ok(!A.buyItem(shop[1], shop[1].price) && toasts.includes('Not enough coins!'), 'buy needs coins'); S.coins = cb;
  // bag full
  for (let i = 0; i < 45; i++) A.pickup(generateItem({ ilvl: 5, rarity: 'normal', rng }));
  ok(S.inventory.every(Boolean), 'bag filled');
  ok(!A.pickup(generateItem({ ilvl: 5, rng })) && toasts.includes('Bag is full!'), 'bag full → false + toast');
  // potions & regen
  ok(A.usePotion('heart') === null && toasts.some(t => /Already/.test(t)), 'no potion at full life');
  A.damage(G.derived.lifeMax * 0.6);
  const lf0 = A.life();
  const fx = A.usePotion('heart');
  ok(fx && fx.life > 0 && fx.over > 0 && S.potions.heart === 3, 'heart potion effect');
  for (let i = 0; i < 30; i++) A.tickRegen(0.1);
  ok(A.life() > lf0 + fx.life * 0.95, 'HoT applied over time');
  ok(A.activeHots().length === 0, 'HoT expired');
  const fxr = A.usePotion('rejuv');
  ok(fxr && fxr.over === 0, 'rejuv instant');
  ok(A.spendZoom(5) && S.player.zoom != null, 'spendZoom');
  const dd = A.damage(1e6); ok(dd.dead && evs['player:dead'] === 1, 'death event');
  A.restoreAll(); ok(S.player.life === null, 'restoreAll');
  // skills
  ok(!A.learnSkill('whirl') || true, 'learn attempt');
  S.player.skillPts = 0;
  ok(!canLearn('chomp', S).ok, 'no points → cannot learn');
  S.player.skillPts = 5;
  ok(!canLearn('whirl', S).ok && /level 6/.test(canLearn('whirl', S).why), 'whirl needs lvl 6');
  ok(!canLearn('chomp', S).ok && /level 2/.test(canLearn('chomp', S).why), 'D2 gate: 2nd point needs lvl 2');
  // xp
  const gained = A.addXp(xpToNext(1) + xpToNext(2) + xpToNext(3) + 10);
  ok(S.player.lvl === 4 && S.player.statPts === 15 && S.player.skillPts === 8, 'multi-level-up grants points');
  ok(evs['player:levelup'] === 1 && evs['player:levelup:last'].lvl === 4, 'single levelup event with final lvl');
  ok(A.learnSkill('chomp') && S.player.skills.chomp === 2 && evs['skill:learned'] === 1, 'learnSkill');
  ok(A.learnSkill('woof') && S.player.hotbar.includes('woof'), 'active auto-assigned to hotbar');
  ok(A.setHotbar(5, 'woof') && S.player.hotbar[5] === 'woof' && S.player.hotbar.filter(h => h === 'woof').length === 1, 'setHotbar moves/swaps');
  ok(!A.setHotbar(2, 'whirl'), 'cannot hotbar unlearned');
  ok(A.addStat('str') && S.player.stats.str === 11 && S.player.statPts === 14, 'addStat');
  // materials
  ok(A.hasMaterials({ wood: 5, coins: 10 }) && !A.hasMaterials({ crystal: (S.materials.crystal || 0) + 1 }), 'hasMaterials');
  { const w0 = S.materials.wood, s0 = S.materials.stone;
    ok(A.spendMaterials({ wood: 5, stone: 2 }) && S.materials.wood === w0 - 5 && S.materials.stone === s0 - 2, 'spendMaterials'); }
  ok(!A.spendMaterials({ lantern: (S.materials.lantern || 0) + 1 }), 'spendMaterials fails when short');
  // socket via action
  S.inventory.fill(null);
  const sw = generateItem({ ilvl: 10, base: 'boneSword', rarity: 'normal', rng }); sw.sockets = 1;
  A.pickup(sw); A.pickup(makeGem('lemon', 1)); A.pickup(makeGem('lemon', 1));
  ok(A.socket({ c: 'inv', i: 0 }, { c: 'inv', i: 1 }) && S.inventory[1].qty === 1 && sw.gems.length === 1, 'socket action consumes one gem');
  // respec
  const before = S.player.skillPts + Object.values(S.player.skills).reduce((a, b) => a + b, 0);
  A.respec();
  ok(S.player.skillPts === before && Object.keys(S.player.skills).length === 0, 'respec refunds skills');
  // level cap
  A.addXp(1e12); ok(S.player.lvl === LEVEL_CAP && S.player.xp === 0, 'level cap 60');
  ok(A.addXp(100) === 0, 'no xp past cap');
}

// ------------------------------------------------------------------ monsters / combat math
hr('MONSTERS & COMBAT');
for (const rank of ['normal', 'champion', 'unique', 'boss']) for (let L = 1; L <= 70; L += 3) {
  const m = monsterStats(L, rank, 'oni');
  ok(fin(m.life) && m.life > 0 && fin(m.dmg[0]) && m.dmg[1] >= m.dmg[0] && fin(m.def) && fin(m.xp) && fin(m.speedMul), 'monsterStats finite');
  applyRandomMods(m, rng);
  ok(fin(m.life) && fin(m.dmg[1]), 'mods keep finite');
}
for (const id of MONSTER_MOD_IDS) { const m = MONSTER_MODS[id].apply(monsterStats(20, 'champion', 'lantern')); ok(m.mods.includes(id) && MONSTER_MODS[id].name && MONSTER_MODS[id].color, `mod ${id}`); }
ok(MONSTER_MOD_IDS.length === 11, '11 monster mods');
{
  const d = computeStats(newGameState());
  let crits = 0;
  for (let i = 0; i < 2000; i++) { const h = rollHit({ derived: d, skillDmgPct: 150, target: { def: 10, res: {}, level: 1 }, rng }); ok(fin(h.dmg) && h.dmg >= 1, 'rollHit finite'); if (h.crit) crits++; }
  ok(crits > 40 && crits < 220, `crit rate plausible (${crits}/2000)`);
  const h = rollHit({ derived: { ...d, fireDmg: [5, 10] }, skillDmgPct: 100, element: 'fire', target: { def: 0, res: { fire: 50 } }, rng });
  ok(h.element === 'fire' && h.parts.phys === 0, 'element conversion');
  ok(playerDamageTaken({ ...d, resFire: 75 }, 100, 'fire', 10) === 25, 'fire res 75 → 25 dmg');
  ok(playerDamageTaken(d, 100, 'phys', 10) < 100, 'defense mitigates');
}

// ------------------------------------------------------------------ leveling simulation
hr('LEVELING 1 → 60 (typical gear at ilvl = clvl)');
{
  log(pad('lvl', 5) + pad('xpToNext', 10) + pad('mXP', 7) + pad('kills', 7) + pad('cumKills', 9) + pad('life', 6) + pad('dmg', 12) + pad('mLife', 7) + pad('hits(1)', 8) + pad('hits(sk)', 9) + pad('mHit', 6) + pad('taken', 7) + 'hitsToDie');
  let cum = 0;
  const rr = new RNG(4242);
  const sums = [];
  for (let L = 1; L < 60; L++) {
    const need = xpToNext(L);
    const m = monsterStats(L, 'normal', 'mochi');
    const kills = Math.ceil(need / m.xp);
    cum += kills;
    if (L === 1 || L % 5 === 0 || L === 59) {
      // average over a few random loadouts
      let life = 0, avg = 0, taken = 0, hits1 = 0, hitsSk = 0, n = 12;
      for (let k = 0; k < n; k++) {
        const { st, build } = randomLoadout(L, rr);
        const d = computeStats(st);
        life += d.lifeMax;
        const dmgAvg = (d.dmgMin + d.dmgMax) / 2 * (1 - monsterPhysDR(m.def, L)) * (1 + d.crit / 100 * (d.critMul - 1));
        avg += dmgAvg;
        const main = build === 'bone' ? 'chomp' : build === 'fetch' ? 'throw' : d.skillLevels.moonhowl ? 'moonhowl' : 'woof';
        const sk = SKILLS[main].params(Math.max(1, d.skillLevels[main] || 1), d).dmgPct / 100;
        hits1 += m.life / dmgAvg;
        hitsSk += m.life / (dmgAvg * sk);
        taken += playerDamageTaken(d, (m.dmg[0] + m.dmg[1]) / 2, 'phys', L);
      }
      life /= n; avg /= n; taken /= n; hits1 /= n; hitsSk /= n;
      const row = { L, need, mxp: m.xp, kills, cum, life: Math.round(life), dmg: Math.round(avg), mlife: m.life, hits1: hits1.toFixed(1), hitsSk: hitsSk.toFixed(1), mhit: Math.round((m.dmg[0] + m.dmg[1]) / 2), taken: Math.round(taken), die: (life / taken).toFixed(0) };
      sums.push(row);
      log(pad(L, 5) + pad(need, 10) + pad(m.xp, 7) + pad(kills, 7) + pad(cum, 9) + pad(row.life, 6) + pad(row.dmg, 12) + pad(m.life, 7) + pad(row.hits1, 8) + pad(row.hitsSk, 9) + pad(row.mhit, 6) + pad(row.taken, 7) + row.die);
      ok(hitsSk < 12 && hitsSk > 0.3, `L${L}: time-to-kill sane (${hitsSk.toFixed(1)} skill hits)`);
      ok(life / taken > 4, `L${L}: survivability sane (${(life / taken).toFixed(1)} hits to die)`);
    }
  }
  let tot = 0; for (let L = 1; L < 60; L++) tot += xpToNext(L);
  log(`total xp 1→60: ${tot.toLocaleString()} · total same-level normal kills ≈ ${cum.toLocaleString()} (champions ×3 xp, uniques ×5, bosses ×30)`);
}

// ------------------------------------------------------------------ drop tables
hr('DROP RATES (20k kills each)');
{
  const dr = new RNG(2024);
  log(pad('rank', 10) + pad('mlvl', 6) + pad('mf', 5) + pad('items/kill', 11) + pad('magic%', 8) + pad('rare%', 7) + pad('set%', 6) + pad('uniq%', 7) + pad('coins', 7) + pad('potion', 7) + pad('mat', 6) + 'gem');
  for (const [rank, mlvl, mf] of [['normal', 5, 0], ['normal', 30, 0], ['normal', 30, 100], ['normal', 30, 300], ['normal', 55, 0], ['champion', 30, 0], ['unique', 30, 0], ['unique', 30, 200], ['boss', 30, 0], ['boss', 55, 200]]) {
    const N = rank === 'boss' ? 4000 : 20000;
    const c = { items: 0, magic: 0, rare: 0, set: 0, unique: 0, normal: 0, coins: 0, potion: 0, material: 0, gem: 0 };
    let bossMinRare = true;
    for (let i = 0; i < N; i++) {
      const drops = rollDrops({ mlvl, rank, mf, gf: 0, rng: dr });
      let best = 0;
      for (const x of drops) {
        if (x.type === 'item') { c.items++; c[x.item.rarity]++; validateItem(x.item, 'drop'); best = Math.max(best, ['normal', 'magic', 'rare', 'set', 'unique'].indexOf(x.item.rarity)); }
        else if (x.type === 'coins') { c.coins += x.n; ok(fin(x.n) && x.n > 0, 'coins finite'); }
        else if (x.type === 'potion') { c.potion++; ok(['heart', 'zoom', 'rejuv'].includes(x.key), 'potion key'); }
        else if (x.type === 'material') { c.material += x.n; ok(MATERIAL_KEYS.includes(x.key) && x.n > 0, 'material key'); }
        else if (x.type === 'gem') { c.gem++; validateItem(x.item, 'gemdrop'); }
      }
      if (rank === 'boss' && best < 2) bossMinRare = false;
    }
    if (rank === 'boss') ok(bossMinRare, 'boss always drops rare+');
    const pc = k => (100 * c[k] / Math.max(1, c.items)).toFixed(1);
    log(pad(rank, 10) + pad(mlvl, 6) + pad(mf, 5) + pad((c.items / N).toFixed(3), 11) + pad(pc('magic'), 8) + pad(pc('rare'), 7) + pad(pc('set'), 6) + pad(pc('unique'), 7) + pad((c.coins / N).toFixed(1), 7) + pad((c.potion / N).toFixed(2), 7) + pad((c.material / N).toFixed(2), 6) + (c.gem / N).toFixed(3));
  }
  // uniques per 1000 normal kills at mlvl 30
  const r0 = new RNG(5);
  let u0 = 0, u3 = 0;
  for (let i = 0; i < 40000; i++) { if (rollRarity(30, 0, 'normal', r0) === 'unique') u0++; if (rollRarity(30, 300, 'normal', r0) === 'unique') u3++; }
  log(`unique chance per item (mlvl30): mf0 ${(u0 / 400).toFixed(2)}% · mf300 ${(u3 / 400).toFixed(2)}% (diminishing: ×${(u3 / u0).toFixed(2)})`);
  for (let q = 0; q < 3; q++) {
    let items = 0, best = 0;
    for (let i = 0; i < 2000; i++) for (const x of chestDrops(20, q, r0)) if (x.type === 'item') { items++; validateItem(x.item, 'chest'); }
    log(`chest q${q} @20: ${(items / 2000).toFixed(2)} items/chest`);
  }
}

// ------------------------------------------------------------------ samples
if (!quiet) {
  hr('SAMPLE ITEMS & TOOLTIPS');
  const st = newGameState(); st.player.lvl = 30; st.player.stats.str = 60; st.player.stats.dex = 50;
  const d = computeStats(st);
  const sr = new RNG(31337);
  const samples = [
    generateItem({ ilvl: 8, rarity: 'magic', slot: 'weapon', rng: sr }), generateItem({ ilvl: 30, rarity: 'rare', rng: sr }), generateItem({ ilvl: 45, rarity: 'rare', slot: 'collar', rng: sr }),
    generateItem({ ilvl: 25, rarity: 'magic', slot: 'boots', rng: sr }), makeUnique('mrSqueakers', 7, sr), makeUnique('moonfang', 44, sr), makeSetItem('gbSweater', sr), makeGem('diamond', 2),
  ];
  for (const it of samples) {
    const t = itemTooltip(it, st, d);
    log(`\n  ${t.title}  [${t.titleColor}]`);
    log(`  ${t.subtitle}`);
    for (const l of t.lines) log(`    ${l.text}`);
    for (const r of t.req) log(`    ${r.met ? '✓' : '✗'} ${r.text}`);
    if (t.compare.length) log('    vs equipped: ' + t.compare.map(c => c.text).join(', '));
  }
}

// ------------------------------------------------------------------ homestead (docs/HOMESTEAD.md)
hr('HOMESTEAD');
{
  const seq = seed => { const r = new RNG(seed); return () => r.next(); };
  // ---- the pantry
  const byKind = k => PANTRY_IDS.filter(id => PANTRY[id].kind === k).length;
  ok(PANTRY_IDS.length === 50 && byKind('seed') === 8 && byKind('crop') === 8 && byKind('fish') === 15 && byKind('forage') === 4 && byKind('dish') === 15, 'pantry: 50 goods (8 seeds, 8 crops, 15 fish, 4 forage, 15 dishes)');
  for (const id of PANTRY_IDS) {
    const d = PANTRY[id];
    ok(PKINDS.includes(d.kind) && d.name && d.jp && d.desc && fin(d.value) && d.value > 0, `pantry ${id} complete`);
    if (d.kind === 'seed') ok(!!CROPS[d.crop] && fin(d.price) && d.price > 0, `seed ${id} grows a crop, has a price`);
    if (d.kind === 'dish') ok(d.food && d.food.heal > 0 && d.food.heal <= 1 && !!BUFFS[d.food.buff] && d.food.tier >= 1 && d.food.tier <= 3 && d.food.mins >= 5, `dish ${id} food valid`);
  }
  for (const id of CROP_IDS) { const C = CROPS[id]; ok(C.days >= 1 && C.rank >= 1 && C.yield[0] >= 1 && C.yield[1] >= C.yield[0] && (!C.regrow || C.regrow < C.days) && !!PANTRY[id + 'Seed'], `crop ${id} rules`); }
  for (const [who, id] of Object.entries(LOVED)) ok(PANTRY[id]?.kind === 'dish' && PANTRY[id].lovedBy.includes(who), `${who} loves ${id}`);
  ok(PANTRY.koi.likedBy.includes('kero') && PANTRY.carrot.likedBy.includes('usagi'), 'liked: fish for Kero, carrots for Usagi');
  ok(sellPrice('grilledFish', 'rosie') === Math.round(PANTRY.grilledFish.value * 1.25) && sellPrice('koi', 'kero') === Math.round(PANTRY.koi.value * 1.3) && sellPrice('turnip', 'usagi') === Math.round(PANTRY.turnip.value * 1.25), 'sell prices: each specialist pays a premium');
  ok(sellPrice('koi') === PANTRY.koi.value && sellPrice('grilledFish', 'kero') < sellPrice('grilledFish', 'rosie') && sellPrice('nope') === 0, 'sell prices: plain worth elsewhere; unknown ids are worth nothing');
  { const st = { pantry: { turnip: 3, koi: 1, onigiri: 2, carrotSeed: 1 } };
    ok(pantryHas(st, { turnip: 3, koi: 1 }) && !pantryHas(st, { turnip: 4 }) && !pantryHas(st, { melon: 1 }), 'pantryHas: all or nothing');
    ok(pantryList(st).map(e => e.id).join() === 'carrotSeed,turnip,koi,onigiri' && pantryList(st, 'fish').length === 1, 'pantryList: by kind, filterable'); }
  { const r = seq(7); let n = 0, ids = new Set(); for (let i = 0; i < 3000; i++) for (const d of seedDrops(8, 'boss', r)) { n += d.n; ids.add(d.key); ok(d.type === 'pantry' && PANTRY[d.key]?.kind === 'seed' && d.n >= 1 && d.n <= 3, 'seed drop shape'); }
    ok(n > 1000 && ids.size >= 6, 'seed drops: bosses drop seeds often, of many kinds');
    const r2 = seq(8); let m = 0; for (let i = 0; i < 3000; i++) m += seedDrops(1, 'normal', r2).length; ok(m > 40 && m < 220, 'seed drops: a normal kill rarely drops one');
    const r3 = seq(9); const fk = new Set(); for (let i = 0; i < 400; i++) for (const d of forageDrops('tidepool', 'boss', r3)) fk.add(d.key);
    ok([...fk].every(k => PANTRY[k].kind === 'forage') && fk.has('seaweed') && forageDrops('nowhere', 'boss', seq(1)).length === 0, 'forage drops: the region\'s own finds (none outside the regions)'); }

  // ---- recipes and mixes
  ok(RECIPE_IDS.length === 16 && RECIPE_IDS.every(id => PANTRY[id]?.kind === 'dish' || RECIPES[id].out?.mat) && PANTRY_IDS.filter(id => PANTRY[id].kind === 'dish').every(id => RECIPES[id]), 'recipes: one per dish (and Pound Mochi, which makes a material)');
  ok(STARTERS.join() === 'grilledFish,roastedVeggies,onigiri,poundMochi', 'recipes: the three starters, and Pound Mochi (COZY §7.2)');
  const MATS = new Set(MATERIAL_KEYS);
  for (const id of RECIPE_IDS) {
    const R = RECIPES[id], L = R.learn;
    ok(R.at.length && R.at.every(s => STATIONS[s]) && R.ing.length && R.ing.every(x => x.n >= 1 && (x.k === 'fish' || x.k === 'crop' || (x.k.startsWith('mat:') ? MATS.has(x.k.slice(4)) : !!PANTRY[x.k] && PANTRY[x.k].kind !== 'dish'))), `recipe ${id} stations + ingredients valid`);
    ok(L === 'starter' || !!(L.from || L.quest || L.book || L.request), `recipe ${id} can be learned`);
    ok(L === 'starter' || hintFor(id).how.length > 5, `recipe ${id} has a hint`);
    ok(!R.at.includes('oven') || R.at.length === 1 || !!R.out, `recipe ${id}: baked goods only at the oven (Pound Mochi: the stove or Rosie's)`);
  }
  ok(RECIPE_IDS.filter(id => cookableAt(id, 'campfire')).sort().join() === 'grilledFish,grilledTrout,roastedVeggies', 'campfires cook simple recipes only');
  ok(COOKBOOK.every(p => p.price > 0 && !RECIPES[p.id].learn.from || RECIPES[p.id].learn.book) && teachesOf('kuma').hearts.includes('honeyCake') && teachesOf('usagi').request.includes('cabbageRolls'), 'cookbook pages, villager teachers');
  { const st = {}; const c = cookbookOf(st); ok(STARTERS.every(id => knows(st, id)) && !knows(st, 'sushiPlatter') && learn(st, 'sushiPlatter', 3) && !learn(st, 'sushiPlatter', 4) && c.known.sushiPlatter === 3 && !learn(st, 'nope'), 'cookbook: starters known, learning once'); }
  { const st = { pantry: { rice: 2, salmon: 1, crucian: 2, loach: 1, moonKoi: 1, carrot: 3, turnip: 1 }, materials: { mochi: 1 } };
    const sp = spendFor(st, 'sushiPlatter', 1);
    ok(sp && sp.pantry.rice === 1 && sp.pantry.loach === 1 && sp.pantry.crucian === 2 && !sp.pantry.moonKoi && !sp.pantry.salmon, 'spendFor: wildcards take the cheapest fish first, never the Moon Koi');
    ok(maxCook(st, 'sushiPlatter') === 1 && maxCook(st, 'grilledFish') === 4 && maxCook(st, 'salmonOnigiri') === 1 && maxCook(st, 'roastedVeggies') === 3 && maxCook(st, 'melonBread') === 0, 'maxCook counts what the pantry allows (rice is a crop too)');
    const both = spendFor({ pantry: { rice: 1, salmon: 1, crucian: 1 } }, 'salmonOnigiri', 1); ok(both && both.pantry.salmon === 1 && !both.pantry.crucian, 'spendFor: a named fish is reserved for its own slot');
    ok(spendFor({ pantry: { salmon: 1 } }, 'salmonOnigiri', 1) === null && spendFor(st, 'grilledFish', 99) === null, 'spendFor: null when short');
    ok(haveOf(st, 'fish') === 4 && haveOf(st, 'crop') === 6 && haveOf(st, 'mat:mochi') === 1 && haveOf(st, 'rice') === 2, 'haveOf: wildcards, materials, named goods'); }
  // every recipe's exact ingredients (wildcards as plain crucian carp / turnips) make it back at its own station
  const concrete = R => { const out = {}; for (const { k, n } of R.ing) { const id = k === 'fish' ? 'crucian' : k === 'crop' ? 'turnip' : k; out[id] = (out[id] || 0) + n; } return out; };
  for (const id of RECIPE_IDS) ok(matchMix(concrete(RECIPES[id]), RECIPES[id].at[0]) === id, `mix: ${id}'s own ingredients make it`);
  ok(matchMix({ salmon: 1, rice: 1 }) === 'salmonOnigiri' && matchMix({ trout: 1 }) === 'grilledTrout' && matchMix({ koi: 1 }) === 'grilledFish', 'mix: the most specific recipe wins');
  ok(matchMix({ strawberry: 1, 'mat:mochi': 1 }) === null && matchMix({ strawberry: 1, 'mat:mochi': 1 }, 'oven') === 'strawberryMochi' && matchMix({ salmon: 1, rice: 1 }, 'campfire') === null, 'mix: stations matter');
  ok(matchMix({ carrot: 2, turnip: 1 }) === null && matchMix({}) === null && matchMix({ moonKoi: 1 }) === null, 'mix: extras or a lone Moon Koi make no recipe');
  ok(fallbackMix({ crucian: 1, turnip: 2 }) === 'grilledFish' && fallbackMix({ rice: 1, turnip: 1 }) === 'onigiri' && fallbackMix({ turnip: 1, carrot: 1, honey: 1 }) === 'roastedVeggies' && fallbackMix({ turnip: 1 }) === null && fallbackMix({ honey: 2 }) === null, 'mix fallbacks: fish, rice, two crops; else nothing');

  // ---- Well Fed in computeStats
  const st0 = newGameState(), d0 = computeStats(st0);
  const fed = (buff, tier, left = 100) => { const s = newGameState(); s.player.meal = { dish: 'x', buff, tier, left, dur: 600 }; return computeStats(s); };
  ok(!d0.meal, 'no meal: no Well Fed');
  ok(fed('strong', 1).dmgPct === d0.dmgPct + 10 && fed('strong', 2).dmgPct === d0.dmgPct + 16 && fed('strong', 3).dmgPct === d0.dmgPct + 25 && fed('strong', 3).dmgMax > d0.dmgMax, 'Strong I-III: +10/16/25% damage');
  ok(fed('swift', 1).moveSpeed === d0.moveSpeed + 8 && fed('swift', 1).atkSpeed === d0.atkSpeed + 8 && fed('swift', 3).moveMul > d0.moveMul, 'Swift: move and attack speed');
  ok(fed('hearty', 1).lifeMax === Math.round(d0.lifeMax * 1.08) && fed('hearty', 3).lifeMax === Math.round(d0.lifeMax * 1.18) && fed('hearty', 2).lifeRegen > d0.lifeRegen, 'Hearty: max life and regen');
  ok(fed('lucky', 2).mf === d0.mf + 35 && fed('lucky', 2).gf === d0.gf + 35, 'Lucky: magic find and coins');
  ok(fed('zen', 1).zoomRegen > d0.zoomRegen && fed('zen', 3).cdr === d0.cdr + 12, 'Zen: zoom regen and cooldowns');
  ok(!fed('strong', 3, 0).meal && fed('strong', 3, 0).dmgPct === d0.dmgPct && fed('strong', 2).meal.buff === 'strong' && fed('strong', 2).meal.tier === 2, 'a spent meal counts for nothing; derived.meal says what is active');
  { const s = newGameState(); s.activeHero = 'moka'; s.player = s.heroes.moka.player; s.equipment = s.heroes.moka.equipment; const dm = computeStats(s); s.player.meal = { dish: 'x', buff: 'strong', tier: 1, left: 9 }; ok(computeStats(s).dmgPct === dm.dmgPct + 10 && !s.heroes.chewy.player.meal, 'Well Fed per hero (Moka\'s own)'); }
  for (const b of Object.keys(BUFFS)) for (const t of [1, 2, 3]) ok(!/NaN|undefined/.test(BUFFS[b].text(t)), `buff ${b} ${t} text`);
  { const m = mealFor('grilledFish', PANTRY.grilledFish.food); ok(m.left === 480 && m.dur === 480 && m.buff === 'strong' && m.tier === 1 && mealActive(m) && !mealActive({ ...m, left: 0 }), 'mealFor: minutes to seconds of play'); }

  // ---- eating and cooking through the actions
  { const G = { state: newGameState() }, A = createActions(G), S = G.state, ev = [];
    const off = ['meal:eaten', 'meal:expired', 'dish:cooked', 'recipe:learned'].map(e => Events.on(e, p => ev.push(e)));
    A.addPantry('crucian', 2); A.addPantry('rice', 1); A.addPantry('salmon', 1);
    A.damage(Math.round(G.derived.lifeMax * 0.6));
    const l0 = A.life(), c = A.cook('grilledFish', 2);
    ok(c && c.n === 2 && S.pantry.grilledFish === 2 && !S.pantry.crucian && S.cookbook.cooked.grilledFish === 2, 'cook ×2: spends two fish, adds two dishes');
    ok(A.cook('grilledFish', 2) === null && S.pantry.grilledFish === 2 && S.pantry.salmon === 1, 'cook: nothing happens when short (one fish left, the salmon)');
    const r = A.eat('grilledFish');
    ok(r && Math.abs(A.life() - l0 - Math.round(G.derived.lifeMax * 0.35)) <= 1 && S.player.meal.buff === 'strong' && G.derived.dmgPct === 10 && S.cookbook.quick === 'grilledFish' && S.pantry.grilledFish === 1, 'eat: the heal, Well Fed in the stats, the quick meal');
    const m = A.cook('salmonOnigiri', 1, { picks: { rice: 1, salmon: 1 }, learn: true });
    ok(m && S.pantry.salmonOnigiri === 1 && knows(S, 'salmonOnigiri') && !S.pantry.rice, 'cook a mix: spends the picks, learns the recipe');
    A.eat('salmonOnigiri'); ok(S.player.meal.tier === 2 && G.derived.dmgPct === 16, 'a new dish replaces the buff');
    ok(!A.tickMeal(30) && S.player.meal.left === 570 && A.tickMeal(600) && !S.player.meal && G.derived.dmgPct === 0, 'tickMeal: counts down, expiry restores the stats');
    ok(!A.spendMix({ rice: 1 }) && !A.learnRecipe('grilledFish') && A.learnRecipe('misoSoup'), 'spendMix all-or-nothing; learnRecipe only new ones');
    ok(['dish:cooked', 'meal:eaten', 'recipe:learned', 'meal:expired'].every(e => ev.includes(e)), 'cooking events');
    off.forEach(f => f?.()); }

  // ---- the garden's growth rules
  { const r = { till: true, crop: 'turnip', stage: 0, wet: true };
    ok(growNight(r).step === 'grew' && r.stage === 1 && !r.wet, 'a watered crop grows a stage; the soil dries');
    ok(growNight(r).step === 'thirsty' && r.stage === 1, 'a dry night pauses it (nothing dies)');
    r.wet = true; const g = growNight(r); ok(g.ripe && r.stage === 2 && isRipe(r), 'ripe after its days (turnips: 2)');
    r.wet = true; ok(growNight(r).step === null && r.stage === 2, 'a ripe crop stays ripe');
    const n = harvestCrop(r, () => 0.99); ok(n === 2 && r.crop === null && r.stage === 0 && !isRipe(r), 'harvest: its yield, then tilled soil');
    const s = { crop: 'strawberry', stage: 4, wet: true }; ok(harvestCrop(s, () => 0) === 2 && s.crop === 'strawberry' && s.stage === 2 && !s.wet, 'strawberries step back two days and keep fruiting');
    const w = { till: true, wet: true }; ok(growNight(w).step === null && !w.wet, 'bare soil just dries');
    ok(SPRINKLE.length === 8 && !SPRINKLE.some(([x, z]) => !x && !z), 'a sprinkler waters its 8 neighbours'); }
  { // a whole crop cycle per crop, watered every day
    for (const id of CROP_IDS) { const r = { crop: id, stage: 0 }; let nights = 0; while (!isRipe(r) && nights < 20) { r.wet = true; growNight(r); nights++; } ok(nights === CROPS[id].days, `${id} ripens in ${CROPS[id].days} watered nights`); } }

  // ---- fish tables
  ok(FISH_IDS.length === 15 && FISH_IDS.every(id => PANTRY[id]?.kind === 'fish'), 'fish: 15, all in the pantry');
  for (const id of FISH_IDS) { const f = FISH[id]; ok(Object.keys(f.spots).every(s => SPOTS[s]) && f.d > 0 && f.d < 1 && f.size[1] > f.size[0] && ['smooth', 'darter', 'sinker', 'floater'].includes(f.beh), `fish ${id} valid`); }
  for (const s of Object.keys(SPOTS)) for (const h of [10, 19, 23]) ok(biters(s, h).length >= 1, `something bites at ${s} at ${h}:00`);
  ok(timeOf(6) === 'day' && timeOf(16.9) === 'day' && timeOf(17) === 'evening' && timeOf(21) === 'night' && timeOf(3) === 'night', 'times of day');
  { const r = seq(5); const c = {}; for (let i = 0; i < 4000; i++) { const f = rollFish('pond', 23, 1, r); c[f] = (c[f] || 0) + 1; }
    ok(c.moonKoi > 0 && c.moonKoi < c.goldKoi && c.goldKoi < c.crucian && !c.koi, 'the pond at night: crucian, rarer gold koi, a rare Moon Koi, no white koi');
    const r2 = seq(6); let m2 = 0; for (let i = 0; i < 4000; i++) if (rollFish('pond', 23, 2, r2) === 'moonKoi') m2++; ok(m2 > c.moonKoi, 'the Moonlit Rod favours rare fish');
    const r3 = seq(4); let lo = 1e9, hi = 0, big = 0; for (let i = 0; i < 3000; i++) { const z = rollSize('koi', r3); lo = Math.min(lo, z); hi = Math.max(hi, z); if (z > 66) big++; }
    ok(lo >= 30 && hi <= 70 && big > 20 && big < 400, 'sizes: in range, now and then a whopper'); }
  { const st = {}; const a = recordCatch(st, 'koi', 40, { spot: 'pond', hour: 10, day: 3 }), b = recordCatch(st, 'koi', 45);
    ok(a.first && !a.record && b.record && !b.first && st.fishLog.koi.best === 45 && st.fishLog.koi.n === 2 && st.fishLog.koi.day === 3 && st.fishLog.koi.time === 'day', 'records: first, record, best, count');
    let ms = []; for (const id of FISH_IDS) { const r = recordCatch(st, id, 20); if (r.milestone) ms.push(r.milestone); } ok(ms.join() === MILESTONES.join(), 'milestones at 5, 10 and 15 kinds'); }

  // ---- the reel sim
  const bot = (d, beh, zone, drain, seed, cap = 40) => { // the s15 bot: hold while the fish is above the zone's middle
    const s = new ReelSim({ d, beh, zone, drain, rng: seq(seed) }); let t = 0;
    while (!s.done && t < cap) { s.step(1 / 60, s.f > s.z + s.zh * 0.5 + s.v * 0.28); t += 1 / 60; }
    return { done: s.done, t };
  };
  { let ok1 = 0, tt = 0; for (let k = 0; k < 60; k++) { const r = bot(0.18, 'smooth', 0.28, 1, 100 + k); if (r.done === 'catch') { ok1++; tt += r.t; } }
    ok(ok1 >= 57 && tt / ok1 > 2.5 && tt / ok1 < 6, `reel: an easy fish is caught in a few seconds (${ok1}/60, ${(tt / Math.max(1, ok1)).toFixed(1)}s)`); }
  // R-12, the cozy retune (tools/fishing-sim.mjs: a bot with a human's 0.28-0.36 s reaction plays the real ReelSim)
  { const t1 = tierMeans(fishTable({ rod: 1, N: 200 })), t2 = tierMeans(fishTable({ rod: 2, N: 200 })), tx = tierMeans(fishTable({ rod: 1, relaxed: true, N: 200 })), pc = v => v.map(x => Math.round(x * 100) + '%').join(' / ');
    ok(t1.every((v, i) => v >= FISH_TARGETS.rod1[i]), `reel balance, the Bamboo Rod: a beginner lands common / uncommon / rare / legendary ${pc(t1)} (targets ${pc(FISH_TARGETS.rod1)})`);
    ok(t2.every((v, i) => v >= FISH_TARGETS.rod2[i]) && t2[2] - t1[2] > 0.15 && t2[3] - t1[3] > 0.25, `reel balance, the Moonlit Rod helps noticeably: ${pc(t2)}`);
    ok(t1[2] < 0.85 && t1[3] < 0.5, `reel balance: the rare and legendary fish still ask for care with the Bamboo Rod (${pc(t1)})`);
    ok(tx.every((v, i) => v >= t1[i]) && tx[0] >= 0.97 && tx[2] >= 0.9, `reel balance, Relaxed (Settings › Fishing): easier still, ${pc(tx)}`);
    const r1 = reelParams(1), r2 = reelParams(2), rx = reelParams(1, { relaxed: true });
    ok(r1.zone === RODS[1].zone && r2.zone > r1.zone && r2.drain < r1.drain && r2.window > r1.window && rx.zone > r1.zone && rx.drain === r1.drain / 2 && rx.window === 1.5 && r1.window >= 0.9, `reel params: the rods and Relaxed (${JSON.stringify({ r1, r2, rx })})`);
    const order = id => FISH[id].d, tier = id => PANTRY[id].rare || 0; ok(FISH_IDS.every(a => FISH_IDS.every(b => tier(a) <= tier(b) || order(a) > order(b))), 'fish difficulty rises with rarity (the rare fish in the Fish Log are the hard ones)'); }
  { const s = new ReelSim({ d: 0.3, rng: seq(4) }); ok(s.f >= s.z && s.f <= s.z + s.zh, 'reel: the zone starts on the fish');
    s.f = s.ft = 0.97; s.z = 0; s.tt = 99; const m0 = s.m; for (let i = 0; i < 60; i++) s.step(1 / 60, false); ok(s.m === m0 && !s.done, 'reel: no drain in the first second (the grace)'); }
  { const s = new ReelSim({ d: 0.5, floor: 0.04, rng: seq(5) }); s.f = s.ft = 0.97; s.tt = 99; for (let i = 0; i < 1200; i++) s.step(1 / 60, false); ok(!s.done && s.m === 0.04, 'reel: a floor (the guide, the first catch) never lets it escape'); }
  { const s = new ReelSim({ d: 0.4, rng: seq(2) }); s.f = s.ft = 0.95; s.tt = 99; let t = 0; while (!s.done && t < 10) { s.step(1 / 60, false); t += 1 / 60; }
    ok(s.done === 'escape' && s.m === 0 && t < 3, 'reel: letting go loses the fish within a couple of seconds');
    ok(s.step(1 / 60, true) === 'escape', 'reel: done is final'); }
  { const s = new ReelSim({ rng: seq(3) }); for (let i = 0; i < 600; i++) s.step(1 / 60, true); ok(s.z === 1 - s.zh && s.z + s.zh <= 1, 'reel: the zone stops at the top'); }
  { const s = new ReelSim({ rng: seq(3) }); s.step(10, false); ok(Math.abs(s.t - 0.05) < 1e-9, 'reel: a long frame is clamped'); }
}

// ------------------------------------------------------------------ housing (docs/HOUSING.md)
hr('HOUSING');
{
  // ---- the furniture catalog
  const TAGS = ['cozy', 'warm', 'nature', 'water', 'lantern', 'bookish', 'sweet', 'music', 'retro', 'festive', 'elegant', 'cute'];
  const MOUNTS = ['floor', 'rug', 'table', 'wall', 'ceiling'];
  ok(FURNITURE_IDS.length >= 40, `furniture: at least 40 items (${FURNITURE_IDS.length})`);
  ok(new Set(FURNITURE_IDS.map(id => FURNITURE[id].cat)).size === Object.keys(FCATS).length, 'furniture: every category has items');
  ok(Object.keys(FSETS).every(s => FURNITURE_IDS.some(id => FURNITURE[id].set === s)), 'furniture: every set has items');
  for (const id of FURNITURE_IDS) {
    const d = FURNITURE[id];
    ok(d.id === id && d.name && d.jp && d.desc && FCATS[d.cat] && FSETS[d.set] && MOUNTS.includes(d.mount), `furniture ${id}: complete`);
    ok(Array.isArray(d.size) && d.size.length === 2 && d.size.every(n => Number.isInteger(n) && n >= 1 && n <= 4) && fin(d.h) && d.h > 0 && d.h <= 2, `furniture ${id}: size in cells, height`);
    ok(d.tags.length >= 1 && d.tags.every(t => TAGS.includes(t)), `furniture ${id}: tags`);
    ok(fin(d.price) && d.price > 0, `furniture ${id}: price`);
    if (d.surface != null) ok(d.mount === 'floor' && d.surface > 0 && d.surface <= d.h + 0.05 && (Math.abs(d.surface - d.h) < 0.05 || d.use === 'craft'), `furniture ${id}: a surface is a floor piece's top (the workbench's pegboard stands above its top)`);
    if (d.cat === 'tabletop') ok(d.mount === 'table' && d.size[0] === 1 && d.size[1] === 1, `furniture ${id}: tabletop items are 1x1 on a table`);
    if (d.cat === 'rug') ok(d.mount === 'rug' && d.h <= 0.05, `furniture ${id}: rugs lie flat`);
    if (d.cat === 'wall') ok(d.mount === 'wall' && d.size[1] * FCELL <= 1, `furniture ${id}: wall items hang`);
    if (d.light) ok(fin(d.light.y) && /^#[0-9a-f]{6}$/i.test(d.light.color) && d.light.intensity > 0 && d.light.radius > 0, `furniture ${id}: light`);
    if (d.use) ok(['sleep', 'stash', 'cook', 'craft'].includes(d.use) && d.mount === 'floor', `furniture ${id}: a household job on a floor piece`);
    ok(storable(id) && itemDef(id) === d && FTABS.some(t => t.id === tabOf(d)), `furniture ${id}: storable, on a palette tab`);
  }
  ok(['sleep', 'stash', 'cook'].every(u => FURNITURE_IDS.some(id => FURNITURE[id].use === u)), 'furniture: a bed, a chest and a stove do the household jobs');
  ok(SURFACE_IDS.filter(id => SURFACES[id].kind === 'wall').length >= 6 && SURFACE_IDS.filter(id => SURFACES[id].kind === 'floor').length >= 4, 'surfaces: wallpapers and floors');
  ok(SURFACE_IDS.filter(id => SURFACES[id].free).length === 2 && !storable('wp_plaster') && storable('wp_sakura') && !storable('nope') && tabOf(SURFACES.fl_tatami) === 'surface', 'surfaces: the free plaster and planks are never stored; the rest are');
  ok(footprint(FURNITURE.futonBed, 0).join() === '4,3' && footprint(FURNITURE.futonBed, 1).join() === '3,4' && footprint(FURNITURE.futonBed, 2).join() === '4,3', 'footprint: a quarter turn swaps the sides');
  ok(Object.keys(STARTER_STORAGE).every(storable), 'starter storage: real, storable items');
  { const st = { furniture: { chabudai: 2, wp_sakura: 1, teaSet: 3 } }; const all = storageList(st), tt = storageList(st, 'tabletop');
    ok(all.length === 3 && all[all.length - 1].id === 'wp_sakura' && tt.length === 1 && tt[0].n === 3, 'storageList: catalog order, surfaces last, by tab'); }
  // ---- the room shells
  for (const [id, L] of Object.entries(LAYOUTS)) {
    const S = shellOf(L);
    ok(S.W > 0 && S.D > 0 && S.walls.length >= 4 && S.walls.some(isBack) && S.walls.some(r => !isBack(r)), `room ${id}: walls, back and front`);
    ok(S.door && S.doorCells.length === L.door.w && S.doorCells.every(([x, z]) => S.isFloor(x, z)) && [...S.doorKeep].every(k => S.isFloor(...k.split(',').map(Number))), `room ${id}: the door and its kept-clear cells are on the floor`);
    ok(S.windows.length && S.windows.every(w => w.side === 'n' || w.side === 'w') && S.winCells.size === S.windows.reduce((a, w) => a + w.w, 0), `room ${id}: windows on back walls`);
    ok(S.slots.n.size > 0 && S.slots.w.size > 0, `room ${id}: wall slots on both back walls`);
    // every floor cell edge that faces outside has a wall, except the door gap
    let open = 0; for (let z = 0; z < S.D; z++) for (let x = 0; x < S.W; x++) if (S.isFloor(x, z)) for (const [dx, dz, side] of [[0, -1, 'n'], [0, 1, 's'], [-1, 0, 'w'], [1, 0, 'e']]) {
      if (S.isFloor(x + dx, z + dz)) continue;
      const hx = side === 'e' ? x + 1 : x, hz = side === 's' ? z + 1 : z;
      if (!S.walls.some(r => r.side === side && (side === 'n' || side === 's' ? r.z0 === hz && hx >= r.x0 && hx < r.x1 : r.x0 === hx && hz >= r.z0 && hz < r.z1))) open++;
    }
    ok(open === L.door.w, `room ${id}: closed but for the door (${open} open edges)`);
  }
  ok(layoutFor('chewyHouse', 1).id === 'cottage1' && layoutFor('home', 2).id === 'home2' && layoutFor('home', 9).id === 'home3', 'layoutFor: the cottage has its own, homes by level (capped at 3)');
  { const S = shellOf(LAYOUTS.home1); ok(S.W * FCELL === 6 && S.D * FCELL === 5, 'room home1: 6 x 5 m'); }
  { const S = shellOf(LAYOUTS.home3); ok(S.partitions.length === 2 && S.partitions.every(p => p.x0 === 10), 'room home3: a partition with a doorway between the two rooms'); }
  // ---- placement rules (cottage1: 12 x 10 cells, the door at x 7-8 on the south wall)
  const L = LAYOUTS.cottage1, bed = { k: 1, id: 'futonBed', mount: 'floor', x: 0, z: 0, rot: 0 }, tbl = { k: 2, id: 'chabudai', mount: 'floor', x: 5, z: 5, rot: 0 };
  const P = (it, items = [bed, tbl], o) => canPlace(L, items, it, o);
  ok(P({ id: 'sideTable', mount: 'floor', x: 9, z: 6, rot: 0 }).ok, 'place: an open floor cell');
  ok(/door/i.test(P({ id: 'sideTable', mount: 'floor', x: 7, z: 9, rot: 0 }).why) && /door/i.test(P({ id: 'sideTable', mount: 'floor', x: 8, z: 8, rot: 0 }).why), "place: the door mat and the row inside it stay clear");
  ok(/already/i.test(P({ id: 'sideTable', mount: 'floor', x: 5, z: 6, rot: 0 }).why), 'place: no overlapping');
  ok(/outside/i.test(P({ id: 'woodTable', mount: 'floor', x: 10, z: 3, rot: 0 }).why) && P({ id: 'woodTable', mount: 'floor', x: 10, z: 3, rot: 1 }).ok, 'place: inside the room (a quarter turn can make it fit)');
  ok(P({ id: 'zabutonBlue', mount: 'floor', x: 4, z: 5, rot: 0 }, [bed, tbl, { k: 3, id: 'ragRug', mount: 'rug', x: 4, z: 4, rot: 0 }]).ok && P({ id: 'tileMat', mount: 'rug', x: 4, z: 4, rot: 0 }).ok, 'place: furniture stands on rugs, rugs go under furniture');
  ok(!P({ id: 'tatamiMat', mount: 'rug', x: 5, z: 5, rot: 0 }, [bed, tbl, { k: 3, id: 'ragRug', mount: 'rug', x: 4, z: 4, rot: 0 }]).ok && !P({ id: 'tatamiMat', mount: 'rug', x: 6, z: 8, rot: 0 }).ok, "place: rugs don't overlap rugs or cover the door mat");
  ok(P({ id: 'teaSet', mount: 'table', on: 2, x: 6, z: 6, rot: 0 }).ok && /fall/i.test(P({ id: 'teaSet', mount: 'table', on: 2, x: 7, z: 6, rot: 0 }).why) && /table/i.test(P({ id: 'teaSet', mount: 'table', on: 1, x: 1, z: 1, rot: 0 }).why), 'place: tabletop items sit inside a surface, never on a bed');
  ok(/room/i.test(P({ id: 'daruma', mount: 'table', on: 2, x: 6, z: 6, rot: 0 }, [bed, tbl, { k: 3, id: 'teaSet', mount: 'table', on: 2, x: 6, z: 6, rot: 0 }]).why), 'place: one tabletop item per cell');
  ok(P({ id: 'packPhoto', mount: 'wall', side: 'n', x: 7, z: 0, y: 1 }).ok && P({ id: 'packPhoto', mount: 'wall', side: 'w', x: 0, z: 7, y: 1 }).ok, 'place: wall items on both back walls');
  ok(/window/i.test(P({ id: 'packPhoto', mount: 'wall', side: 'n', x: 4, z: 0, y: 1 }).why) && P({ id: 'packPhoto', mount: 'wall', side: 'n', x: 4, z: 0, y: 1.85 }).ok === false, 'place: wall items keep off windows');
  { const shelf = [bed, tbl, { k: 3, id: 'bookshelf', mount: 'floor', x: 7, z: 0, rot: 0 }];
    ok(/bookshelf/i.test(P({ id: 'packPhoto', mount: 'wall', side: 'n', x: 7, z: 0, y: 1 }, shelf).why) && P({ id: 'packPhoto', mount: 'wall', side: 'n', x: 1, z: 0, y: 1 }).ok, 'place: a wall item clears the furniture in front of it'); }
  ok(/high|low/i.test(P({ id: 'cuckooClock', mount: 'wall', side: 'n', x: 7, z: 0, y: 1.75 }).why) && /high|low/i.test(P({ id: 'packPhoto', mount: 'wall', side: 'n', x: 7, z: 0, y: 0.5 }).why) && !P({ id: 'packPhoto', mount: 'wall', side: 'n', x: 7, z: 2, y: 1 }).ok, 'place: wall items stay on the wall, between the wainscot rail and the head rail');
  ok(/window/i.test(P({ id: 'bookshelf', mount: 'floor', x: 4, z: 0, rot: 0 }).why) && P({ id: 'pupBasket', mount: 'floor', x: 4, z: 0, rot: 0 }).ok, 'place: tall furniture never covers a window (low things may)');
  ok(P({ id: 'paperPendant', mount: 'ceiling', x: 5, z: 5, rot: 0 }).ok && /bump/i.test(P({ id: 'paperPendant', mount: 'ceiling', x: 10, z: 5, rot: 0 }, [bed, tbl, { k: 3, id: 'wardrobe', mount: 'floor', x: 10, z: 5, rot: 0 }]).why), 'place: ceiling lamps over the floor, clear of tall furniture');
  { // sealing the bed off with screens fails; leaving a gap is fine
    const wall = [bed, { k: 3, id: 'byobu', mount: 'floor', x: 0, z: 3, rot: 0 }, { k: 4, id: 'byobu', mount: 'floor', x: 3, z: 3, rot: 0 }, { k: 5, id: 'tansu', mount: 'floor', x: 4, z: 0, rot: 1 }];
    ok(/reach/i.test(P({ id: 'sideTable', mount: 'floor', x: 4, z: 2, rot: 0 }, wall).why), "place: the bed can't be walled in");
    ok(P({ id: 'sideTable', mount: 'floor', x: 9, z: 6, rot: 0 }, wall).ok, 'place: ...one free cell beside it is enough');
  }
  ok(/standing/i.test(P({ id: 'sideTable', mount: 'floor', x: 9, z: 6, rot: 0 }, [bed, tbl], { player: { x: 9, z: 6 } }).why) && /someone/i.test(P({ id: 'sideTable', mount: 'floor', x: 9, z: 6, rot: 0 }, [bed, tbl], { guests: [{ x: 9, z: 6 }] }).why), "place: never on the player or a guest");
  ok(P({ id: 'zabutonBlue', mount: 'floor', x: 9, z: 6, rot: 0 }, [bed, tbl], { player: { x: 9, z: 6 } }).ok, 'place: cushions you can stand on are fine');
  ok(P({ id: 'chabudai', mount: 'floor', x: 6, z: 5, rot: 0 }, [bed, tbl], { skip: tbl }).ok, 'place: a piece being moved ignores where it was');
  { const p = poseOf(bed, [bed]), b = boxOf(bed, [bed]); ok(p.x === 1 && p.z === 0.75 && p.y === 0 && p.yaw === 0 && b[0] === 0 && b[3] === 2 && b[5] === 1.5 && b[4] === FURNITURE.futonBed.h, 'poseOf / boxOf: a 4 x 3 bed in the corner'); }
  { const t = { k: 9, id: 'teaSet', mount: 'table', on: 2, x: 5, z: 5 }; ok(poseOf(t, [bed, tbl, t]).y === FURNITURE.chabudai.surface, 'poseOf: a tabletop item stands on its host'); }
  { const w = { k: 9, id: 'cuckooClock', mount: 'wall', side: 'w', x: 0, z: 2, y: 1 }, s = wallSpan(w), p = poseOf(w); ok(s.side === 'w' && s.u0 === 2 && s.u1 === 3 && s.y1 === 2 && p.x === 0 && p.z === 1.25 && Math.abs(p.yaw - Math.PI / 2) < 1e-9, 'wallSpan / poseOf: a west-wall clock faces into the room'); }
  ok(cellsOf({ id: 'futonBed', x: 2, z: 3, rot: 1 }).length === 12 && cellsOf({ id: 'futonBed', x: 2, z: 3, rot: 1 }).every(([x, z]) => x >= 2 && x < 5 && z >= 3 && z < 7), 'cellsOf: a turned bed');
  ok(frontCell({ id: 'treasureChest', x: 1, z: 3, rot: 0 }).join() === '1,4' && frontCell({ id: 'treasureChest', x: 0, z: 4, rot: 3 }).join() === '1,4', 'frontCell: where you stand to use a piece');
  ok(nextK([bed, tbl]) === 3 && nextK([]) === 1, 'nextK');
  // ---- the default furnishings fit their rooms (every piece placeable in order)
  for (const [type, lv] of [['chewyHouse', 1], ['home', 1]]) {
    const I = defaultInterior(type, lv), Ly = LAYOUTS[I.layout], placed = [];
    let bad = null; for (const it of I.items) { const c = canPlace(Ly, placed, it); if (!c.ok && !bad) bad = `${it.id}: ${c.why}`; placed.push(it); }
    ok(!bad && new Set(I.items.map(i => i.k)).size === I.items.length && I.items.every(i => FURNITURE[i.id]), `defaults ${type}: every piece fits (${bad || 'ok'})`);
  }
  { const I = defaultInterior('chewyHouse', 1); ok(['futonBed', 'treasureChest', 'kitchenStove', 'chabudai', 'zabutonPink', 'ragRug', 'andonLamp'].every(id => I.items.some(i => i.id === id)) && I.items.some(i => i.mount === 'table' && I.items.find(h => h.k === i.on)?.id === 'chabudai'), 'defaults: the cottage has its bed, chest, stove, table, cushions, rug, lantern, and a tea set on the table'); }
  // ---- furniture storage through the actions
  { const G = { state: newGameState() }, A = createActions(G), ev = [];
    const off = Events.on('furniture:changed', e => ev.push(e));
    ok(A.addFurniture('chabudai', 2) === 2 && A.addFurniture('wp_sakura') === 1 && A.addFurniture('wp_plaster') === 0 && A.addFurniture('nope') === 0, 'addFurniture: furniture and stored surfaces, never the free ones');
    ok(ev[0].first && ev[0].delta === 2 && ev[1].first && G.state.furnitureFound.chabudai === 1, 'addFurniture: furniture:changed with a first-discovery flag');
    ok(A.hasFurniture({ chabudai: 2 }) && !A.hasFurniture({ chabudai: 3 }) && !A.spendFurniture({ chabudai: 1, teaSet: 1 }) && A.furnitureCount('chabudai') === 2, 'spendFurniture: all or nothing');
    ok(A.spendFurniture({ chabudai: 2 }) && !('chabudai' in G.state.furniture) && ev[ev.length - 1].spend, 'spendFurniture: spends, emits, drops empty counters');
    off(); }
}

// icons module must import without a DOM
{
  const icons = await import('../src/rpg/icons.js');
  ok(typeof icons.itemIcon === 'function' && icons.itemIcon(makeGem('ruby', 0)) === '', 'icons.js imports & no-ops without DOM');
}
hr('HOMES & RATING');
// docs/HOUSING.md §1, §4 (phase 2): saved owners (home/owners.js), the villagers' default homes (home/defaults.js),
// the Home Rating and request needs (home/rating.js)
{
  const O = await import('../src/home/owners.js'), Rt = await import('../src/home/rating.js'), D = await import('../src/home/defaults.js');
  const { VILLAGERS } = await import('../src/actors/roster.js');
  // ---- owners: a toy village (homes in a row, Kuma's bakery on the street), anchors next to some of them
  const mkB = () => [
    { id: 'h1', type: 'home', x: 10, z: 10 }, { id: 'h2', type: 'home', x: 20, z: 10 }, { id: 'h3', type: 'home', x: 30, z: 10 }, { id: 'h4', type: 'home', x: 40, z: 10 },
    { id: 'h5', type: 'home', x: 50, z: 10 }, { id: 'h6', type: 'home', x: 60, z: 10 }, { id: 'h7', type: 'home', x: 70, z: 10 }, { id: 's1', type: 'shop', x: 24, z: 30 },
    { id: 'p1', type: 'park', x: 5, z: 5 },
  ];
  const anchors = { mochi: { x: 11, z: 11 }, usagi: { x: 21, z: 11 }, kuma: { x: 25, z: 28 }, kitsune: { x: 41, z: 12 }, pan: { x: 51, z: 11 }, tanu: { x: 61, z: 11 }, kero: { x: 31, z: 11 } };
  const B1 = mkB(), got = O.assignOwners(B1, anchors);
  const own = Object.fromEntries(B1.filter(b => b.owner).map(b => [b.owner, b.id]));
  ok(got.length === 7 && O.CAST.every(id => B1.filter(b => b.owner === id).length === 1), 'owners: each of the seven gets exactly one building');
  ok(own.kuma === 's1' && own.mochi === 'h1' && own.usagi === 'h2' && own.kero === 'h3' && own.kitsune === 'h4', `owners: Kuma's bakery, everyone else the nearest home to their anchor (${JSON.stringify(own)})`);
  ok(!B1.find(b => b.type === 'park').owner && O.homeOf(B1, 'pan')?.id === 'h5', 'owners: only homes and shops; homeOf finds a villager\'s home');
  ok(O.assignOwners(B1, anchors).length === 0 && JSON.stringify(Object.fromEntries(B1.filter(b => b.owner).map(b => [b.owner, b.id]))) === JSON.stringify(own), 'owners: idempotent (a second pass changes nothing)');
  { const B2 = mkB(); O.assignOwners(B2, anchors); ok(JSON.stringify(Object.fromEntries(B2.filter(b => b.owner).map(b => [b.owner, b.id]))) === JSON.stringify(own), 'owners: deterministic — an old save without owners gets the same ones'); }
  { const B3 = mkB(); B3[0].owner = 'kuma'; B3[1].owner = 'kuma'; B3[2].owner = 'nobody'; O.assignOwners(B3, anchors); ok(B3.filter(b => b.owner === 'kuma').length === 1 && !B3.some(b => b.owner === 'nobody'), 'owners: one home each; stray owners are dropped'); }
  { const B4 = mkB().filter(b => b.id !== 'h1'); O.assignOwners(B4, anchors); ok(B4.filter(b => b.owner).length === 7 && B4.find(b => b.owner === 'mochi'), 'owners: a demolished home: its owner moves into a free one'); }
  { const B5 = [{ id: 'a', type: 'home', x: 0, z: 0 }, { id: 'b', type: 'home', x: 100, z: 0 }]; O.assignOwners(B5, anchors); ok(B5.filter(b => b.owner).length === 2, 'owners: fewer homes than villagers: as many as fit, the rest wait'); }
  // ---- the villagers' default homes: personality layouts that fit every level
  const TASTE = Object.fromEntries(VILLAGERS.map(v => [v.id, v.home]));
  ok(O.CAST.every(id => TASTE[id]?.style?.length && TASTE[id].likesFurniture.every(x => FURNITURE[x])), 'roster: every owner has a style and favourite pieces (real catalog ids)');
  const starsAt = [];
  for (const lv of [1, 2, 3]) for (const id of O.CAST) {
    const I = D.defaultInterior('home', lv, id), Ly = LAYOUTS[I.layout], placed = [], bad = [];
    for (const it of I.items) { const c = canPlace(Ly, placed, it); if (!c.ok) bad.push(`${it.id}: ${c.why}`); placed.push(it); }
    const tops = I.items.filter(i => i.mount === 'table'), cellsTaken = new Set(tops.map(i => `${i.on}:${i.x},${i.z}`));
    ok(!bad.length, `default home ${id} L${lv}: every piece fits${bad.length ? ' — ' + bad.join(' | ') : ''}`);
    ok(tops.every(t => I.items.some(h => h.k === t.on && FURNITURE[h.id].surface)) && cellsTaken.size === tops.length, `default home ${id} L${lv}: tabletop pieces stand on a table, one per cell`);
    ok(I.items.every(i => i.own === 1) && I.wall && I.floor && SURFACES[I.wall] && SURFACES[I.floor], `default home ${id} L${lv}: their own pieces (own), their wallpaper and floor`);
    ok(TASTE[id].likesFurniture.some(x => I.items.some(i => i.id === x)), `default home ${id} L${lv}: at least one piece they love`);
    starsAt.push(Rt.homeRating(I, TASTE[id]).stars);
  }
  ok(starsAt.every(s => s >= 2 && s <= 4) && starsAt.filter(s => s === 3).length >= starsAt.length / 2, `default homes rate 2-4 stars, mostly 3 (${starsAt.join('')}): there's always something to do`);
  ok(D.defaultInterior('home', 1, null).items.every(i => !i.own) && D.defaultInterior('chewyHouse', 1).items.every(i => !i.own), 'defaults: the cottage and an ownerless home have no "own" pieces');
  // ---- the Home Rating
  const empty = Rt.homeRating({ layout: 'home1', items: [] }, TASTE.kuma);
  ok(empty.stars === 1 && empty.score < 25 && empty.tips.includes('a lamp') && empty.tips.includes('a rug'), `rating: an empty room is one star, with tips (${empty.score})`);
  const cot = Rt.homeRating(D.defaultInterior('chewyHouse', 1), Rt.COTTAGE_TASTE);
  ok(cot.stars === 3 && Object.values(cot.parts).every(v => Number.isFinite(v) && v >= 0), `rating: Chewy's cottage starts at three stars (${cot.score})`);
  const base = { layout: 'home1', wall: 'wp_plaster', floor: 'fl_planks', items: [{ k: 1, id: 'chabudai', mount: 'floor', x: 4, z: 4, rot: 0 }, { k: 2, id: 'zabutonPink', mount: 'floor', x: 3, z: 4, rot: 0 }] };
  const plus = (I, ...its) => ({ ...I, items: [...I.items, ...its.map((it, i) => ({ k: 100 + i, mount: 'floor', rot: 0, ...it }))] });
  const r0 = Rt.homeRating(base, TASTE.kuma), r1 = Rt.homeRating(plus(base, { id: 'andonLamp', x: 0, z: 8 }), TASTE.kuma), r2 = Rt.homeRating(plus(base, { id: 'andonLamp', x: 0, z: 8 }, { id: 'mushroomLamp', mount: 'table', on: 1, x: 4, z: 4 }), TASTE.kuma);
  ok(r1.parts.lighting === 6 && r2.parts.lighting === 10 && r1.score > r0.score, 'rating: a lamp lights it up (a second one for full points)');
  const rugd = Rt.homeRating(plus(base, { id: 'ragRug', mount: 'rug', x: 4, z: 4 }), TASTE.kuma);
  ok(rugd.has.rug && rugd.parts.finish === 4 && !rugd.tips.includes('a rug'), 'rating: a rug counts for variety and finish');
  const papered = Rt.homeRating({ ...base, wall: 'wp_stripes' }, TASTE.kuma);
  ok(papered.parts.finish === r0.parts.finish + 2, 'rating: your own wallpaper or floor finishes it');
  const liked = Rt.homeRating(plus(base, { id: 'breadShelf', x: 4, z: 0 }, { id: 'flourSacks', x: 6, z: 0 }), TASTE.kuma), plain = Rt.homeRating(plus(base, { id: 'bookshelf', x: 4, z: 0 }, { id: 'tansu', x: 6, z: 0 }), TASTE.kuma);
  ok(liked.parts.taste > plain.parts.taste && liked.has.loved === 2, 'rating: the owner\'s favourite pieces and style raise taste');
  ok(Rt.homeRating(plus(base, { id: 'byobu', x: 0, z: 0 }, { id: 'ikebana', x: 3, z: 0 }, { id: 'bonsaiStand', x: 4, z: 0 }), TASTE.kitsune).parts.sets >= 8, 'rating: three pieces from one themed set give a set bonus');
  { const crowd = { layout: 'home1', items: [] }; let k = 1; for (let z = 0; z < 8; z += 2) for (let x = 0; x < 12; x += 2) if (!(x >= 4 && x <= 7 && z >= 6)) crowd.items.push({ k: k++, id: 'chabudai', mount: 'floor', x, z, rot: 0 });
    const rc = Rt.homeRating(crowd, TASTE.kuma); ok(rc.has.cover > 0.55 && rc.parts.filled < Rt.RATING_PARTS.filled && rc.tips.some(t => /cluttered/.test(t)), `rating: past 55% floor cover it feels cluttered (cover ${rc.has.cover})`); }
  ok(Rt.starsOf(0) === 1 && Rt.starsOf(24.9) === 1 && Rt.starsOf(25) === 2 && Rt.starsOf(50) === 3 && Rt.starsOf(70) === 4 && Rt.starsOf(88) === 5 && Rt.starText(3) === '★★★☆☆', 'rating: star thresholds and the star text');
  ok(Object.values(Rt.RATING_PARTS).reduce((a, v) => a + v, 0) === 100, 'rating: the parts add up to 100');
  // ---- request needs (story.js 'decorate' steps)
  const warm2 = plus(base, { id: 'kitchenStove', x: 0, z: 0 }, { id: 'ragRug', mount: 'rug', x: 4, z: 4 });
  ok(!Rt.meetsNeed(base, { tag: 'warm', n: 3, rug: true }).ok && Rt.meetsNeed(warm2, { tag: 'warm', n: 2, rug: true }).ok, 'needs: "2 warm things and a rug"');
  ok(Rt.meetsNeed(base, { tag: 'warm', n: 3, rug: true }).missing.length === 2 && Rt.meetsNeed(base, { ids: ['breadShelf'] }).missing[0] === 'a bread shelf', 'needs: what is still missing, in words');
  ok(Rt.meetsNeed(base, { light: true }).ok === false && Rt.meetsNeed(r1 && plus(base, { id: 'andonLamp', x: 0, z: 8 }), { light: true }).ok, 'needs: a lamp');
  ok(!Rt.meetsNeed(base, { stars: 4 }, TASTE.kuma).ok && Rt.meetsNeed(base, { stars: 1 }, TASTE.kuma).ok, 'needs: a star rating');
}
hr('EXTERIORS & GROWTH');
// docs/HOUSING.md §5-6 (phase 3): the exterior styles (world/buildings/styles.js) and interiors growing with the house
// (home/grow.js)
{
  const S = await import('../src/world/buildings/styles.js'), Gr = await import('../src/home/grow.js'), D = await import('../src/home/defaults.js');
  const { canPlace: cp } = await import('../src/home/placement.js');
  // ---- styles
  ok(S.STYLE_SET_IDS.join() === 'machiya,cottage,teaHouse,seaside', 'styles: the four style sets');
  for (const id of S.STYLE_SET_IDS) {
    const set = S.STYLE_SETS[id], st = S.setStyle(id);
    ok(set.name && set.jp && set.desc && set.cost?.coins > 0 && set.rank >= 1, `style set ${id}: complete`);
    ok(Object.entries(set.style).every(([k, v]) => S.FIELDS[k]?.opts[v]) && st.set === id && Object.keys(set.style).every(k => st[k] === set.style[k]), `style set ${id}: every field a real option`);
    ok(['roof', 'roofType', 'wall', 'trim', 'door', 'window', 'fence'].every(k => set.style[k]), `style set ${id}: sets the main parts`);
  }
  ok(new Set(S.STYLE_SET_IDS.map(id => S.styleKey(S.setStyle(id)))).size === 4, 'styles: each set has its own template key');
  ok(Object.keys(S.ROOF_COLORS).length >= 10 && Object.keys(S.WALLS).length >= 8 && Object.keys(S.TRIMS).length >= 5 && Object.keys(S.DOORS).join() === 'shoji,round,wood,lattice' && Object.keys(S.WINDOWS).join() === 'shoji,round,lattice', 'styles: ~10 roofs, ~8 walls, ~5 trims, the doors and windows');
  ok(Object.keys(S.FENCES).join() === 'picket,bamboo,rail,rope,hedge' && S.NOREN.none.c === null, 'styles: the fences; a noren can be none');
  ok(S.cleanStyle(null) === null && S.cleanStyle({}) === null && S.cleanStyle({ roof: 'nope', wall: 'mint' }).wall === 'mint' && !('roof' in S.cleanStyle({ roof: 'nope', wall: 'mint' })), 'styles: cleanStyle drops unknown ids');
  ok(S.styleKey(null) === '' && S.styleKey({ wall: 'mint', roof: 'plum' }) === S.styleKey({ roof: 'plum', wall: 'mint' }) && S.styleKey({ roof: 'plum' }) !== S.styleKey({ roof: 'teal' }), 'styles: the key is stable, order-free and distinct');
  { const m = S.setStyle('machiya'), w = S.withField(m, 'roof', 'plum'); ok(w.roof === 'plum' && !w.set && w.trim === 'dark' && S.withField(m, 'roof', 'charcoal').set === 'machiya' && !('door' in S.withField(m, 'door', null)), 'styles: a changed part takes the house off its set (the same value keeps it)'); }
  { const c0 = S.remodelCost(null, S.setStyle('cottage')), c1 = S.remodelCost(null, { roof: 'plum' }), c2 = S.remodelCost({ roof: 'plum' }, { roof: 'plum', door: 'round' }), c3 = S.remodelCost(S.setStyle('cottage'), S.setStyle('cottage'));
    ok(c0.coins === S.STYLE_SETS.cottage.cost.coins && c1.coins === S.FIELDS.roof.cost.coins && c2.coins === S.FIELDS.door.cost.coins && !Object.keys(c3).length, 'styles: a set costs its price; a part its own; nothing changed is free'); }
  ok(S.lockOf('roofType', 'irimoya') === 2 && S.lockOf('roof', 'plum') === 1, 'styles: some options unlock with the village rank');
  { const s = S.styleOf({ style: S.setStyle('seaside') }), n = S.styleOf({ style: null }); ok(s.roof('#000') === S.ROOF_COLORS.sea.c && s.door('x') === 'wood' && s.noren('#123') === null && n.roof('#abc') === '#abc' && !n.any && s.any, 'styles: styleOf resolves a style with the variant\'s fallbacks'); }
  // ---- interiors grow with the house
  ok(Gr.pathOf('home1', 'home3').join() === 'home1,home2,home3' && Gr.pathOf('cottage2', 'cottage3').join() === 'cottage2,cottage3' && Gr.pathOf('home3', 'home1') === null, 'grow: the layouts grow home1 → home2 → home3, cottage1 → 2 → 3');
  const check = (I, to, label) => {
    const r = Gr.migrateInterior(I, to), L = LAYOUTS[to], placed = [];
    let bad = 0; for (const it of r.interior.items) { if (!cp(L, placed, it).ok) bad++; placed.push(it); }
    ok(r.interior.layout === to && !bad && r.moved + r.stored.length === I.items.length, `grow ${label}: every piece fits its new room or is handed back (${r.moved} kept, ${r.stored.length} back)`);
    return r;
  };
  { const I = D.defaultInterior('chewyHouse', 1), r2 = check(I, 'cottage2', 'cottage L1 → L2'), r3 = check(r2.interior, 'cottage3', 'cottage L2 → L3');
    ok(!r2.stored.length && !r3.stored.length && ['futonBed', 'treasureChest', 'kitchenStove', 'workbench'].every(id => r3.interior.items.some(i => i.id === id)), 'grow: the cottage keeps everything as it grows, the bed, chest, stove and workbench too');
    const k = r3.interior.items.find(i => i.id === 'teaSet'), h = r3.interior.items.find(i => i.k === k.on); ok(h?.id === 'chabudai', 'grow: the tea set stays on its chabudai'); }
  for (const id of ['kuma', 'mochi', 'usagi', 'kitsune', 'pan', 'tanu', 'kero']) { const r = check(D.defaultInterior('home', 1, id), 'home3', `${id}'s home L1 → L3`); ok(!r.stored.length, `grow: ${id}'s own things all come along`); }
  { const I = { layout: 'home1', items: [] }; let k = 1; for (let z = 0; z < 8; z++) for (let x = 0; x < 12; x++) if (!(x >= 4 && x <= 7 && z >= 6)) I.items.push({ k: k++, id: 'zabutonBlue', mount: 'floor', x, z, rot: 0 }); const r = check(I, 'home2', 'a room packed with cushions'); ok(r.moved > 50, 'grow: a packed room mostly comes along'); }
}
hr('FURNITURE SOURCES');
// docs/HOUSING.md §3: Tanu's Trinkets (home/trinkets.js), the workbench (home/recipes.js), the finds (home/finds.js)
{
  const T = await import('../src/home/trinkets.js'), Rc = await import('../src/home/recipes.js'), Fd = await import('../src/home/finds.js');
  const { shopRank } = await import('../src/home/furniture.js');
  // ---- Tanu's daily stock
  const st = newGameState();
  const a = T.trinketStock(st, 5, 2), b = T.trinketStock(st, 5, 2), c = T.trinketStock(st, 6, 2);
  ok(JSON.stringify(a) === JSON.stringify(b), 'trinketStock: the same day and rank give the same stock');
  ok(JSON.stringify(a.map(e => e.id)) !== JSON.stringify(c.map(e => e.id)), 'trinketStock: the next day restocks');
  ok(T.ALWAYS.length >= 6 && T.ALWAYS.every(id => storable(id) && a.some(e => e.id === id && e.always && e.stock == null)), 'trinketStock: the basics are always there, with no limit');
  ok(['zabutonPink', 'zabutonBlue', 'sideTable', 'packPhoto'].every(id => T.ALWAYS.includes(id)) && T.ALWAYS.some(id => SURFACES[id]?.kind === 'wall') && T.ALWAYS.some(id => SURFACES[id]?.kind === 'floor'), 'trinketStock: basics = both cushions, the side table, the pack photo, wallpapers and floors');
  const rot = a.filter(e => e.kind === 'furniture' && !e.always);
  ok(rot.length === T.DAILY && new Set(rot.map(e => e.id)).size === rot.length && rot.every(e => !T.ALWAYS.includes(e.id)), 'trinketStock: ~8 different rotating pieces a day, none of them basics');
  ok(rot.every(e => e.stock >= 1 && e.stock <= 2 && e.price === itemDef(e.id).price), 'trinketStock: 1-2 of each, at the catalog price');
  for (const rank of [1, 2, 3, 5]) {
    let bad = 0, n = 0;
    for (let d = 1; d <= 80; d++) for (const e of T.trinketStock(st, d, rank)) if (e.kind === 'furniture') { n++; const r = shopRank(itemDef(e.id)); if (!(r > 0 && r <= rank) && !e.always) bad++; if (itemDef(e.id).shop === false) bad++; }
    ok(!bad && n > 0, `trinketStock: rank ${rank} stocks only pieces with 0 < shopRank <= ${rank}, never a craft- or find-only piece`);
  }
  ok(T.trinketPool(1).every(id => (itemDef(id).set === 'basics' || itemDef(id).shop === 1)) && T.trinketPool(3).length > T.trinketPool(2).length && T.trinketPool(2).length > T.trinketPool(1).length, 'trinketPool: higher ranks open more sets');
  { // cheaper pieces turn up more often
    const pool = T.trinketPool(3), avgPool = pool.reduce((s, id) => s + itemDef(id).price, 0) / pool.length;
    let sum = 0, n = 0; for (let d = 1; d <= 300; d++) for (const e of T.trinketStock(st, d, 3)) if (e.kind === 'furniture' && !e.always) { sum += e.price; n++; }
    ok(sum / n < avgPool * 0.92, `trinketStock: weighted toward cheaper pieces (avg ${Math.round(sum / n)} vs pool ${Math.round(avgPool)})`);
  }
  const scrolls = a.filter(e => e.kind === 'scroll');
  ok(scrolls.length === T.DAILY_SCROLLS && scrolls.every(e => Rc.RECIPES[e.recipe]?.learn === 'shop' && (Rc.RECIPES[e.recipe].rank || 1) <= 2 && e.id === 'recipe:' + e.recipe && e.price > 0), 'trinketStock: a couple of recipe scrolls a day (shop recipes up to the rank)');
  { const s2 = newGameState(); for (const id of Rc.RECIPE_IDS) Rc.learnRecipe(s2, id, 1); ok(T.trinketStock(s2, 5, 5).every(e => e.kind !== 'scroll'), 'trinketStock: no scrolls for recipes you already know'); }
  { // state.trinkets: what's sold today stays sold (and survives a save); a new day restocks
    const s3 = newGameState(), T1 = T.trinketsOf(s3, 3, 1), e = T1.list.find(x => x.kind === 'furniture' && !x.always), basic = T1.list.find(x => x.always);
    const left0 = T.stockLeft(T1, e);
    ok(T.sellOne(T1, e.id) && T.stockLeft(T1, e) === left0 - 1 && T.sellOne(T1, basic.id) && T.stockLeft(T1, basic) === Infinity, 'trinkets: selling one takes it from today\'s stock (the basics never run out)');
    while (T.stockLeft(T1, e) > 0) T.sellOne(T1, e.id);
    ok(!T.sellOne(T1, e.id), 'trinkets: a sold-out piece can\'t be bought');
    const s4 = JSON.parse(JSON.stringify(s3)), T2 = T.trinketsOf(s4, 3, 1);
    ok(T2.sold[e.id] === e.stock && T.stockLeft(T2, T2.list.find(x => x.id === e.id)) === 0 && JSON.stringify(T2.list) === JSON.stringify(T1.list), 'trinkets: the stock and what was sold survive a save and reload');
    const T3 = T.trinketsOf(s4, 4, 1);
    ok(T3.day === 4 && !Object.keys(T3.sold).length && s4.trinkets === T3, 'trinkets: a new day restocks (nothing sold yet)');
    const T4 = T.trinketsOf(s4, 4, 2); ok(T4.rank === 2 && T4.day === 4, 'trinkets: a new village rank restocks the same day');
  }
  ok(T.buyBackPrice('chabudai') === Math.floor(FURNITURE.chabudai.price / 2) && T.buyBackPrice('wp_sakura') === 120 && T.buyBackPrice('wp_plaster') === 0 && T.buyBackPrice('nope') === 0, 'trinkets: Tanu buys back at half price (never the free surfaces)');
  ok(['greet', 'thanks', 'sold', 'poor'].every(k => Array.isArray(T.TANU[k]) && T.TANU[k].length >= 2) && typeof T.TANU.soldOut === 'string', "trinkets: Tanu's lines");
  // ---- the workbench recipes
  const learns = new Set(['start', 'shop', 'reward']);
  ok(Rc.RECIPE_IDS.length >= 12 && Rc.RECIPE_IDS.length <= 15, `recipes: ${Rc.RECIPE_IDS.length} workbench recipes`);
  for (const id of Rc.RECIPE_IDS) {
    const r = Rc.RECIPES[id], ing = Rc.ingredientsOf(id);
    ok(!!FURNITURE[r.out] && r.n >= 1 && learns.has(r.learn), `recipe ${id}: makes a catalog piece, learn valid`);
    ok(ing.length >= 1 && ing.every(e => e.n > 0 && Number.isInteger(e.n) && (e.kind === 'mat' ? MATERIAL_KEYS.includes(e.k) : !!PANTRY[e.k])), `recipe ${id}: ingredients are real materials / pantry goods`);
    if (r.learn === 'shop') ok(r.price > 0 && (r.rank || 1) >= 1, `recipe ${id}: a scroll price and rank`);
    if (r.learn === 'reward') ok(!!r.from, `recipe ${id}: who gives it`);
  }
  ok(new Set(Rc.RECIPE_IDS.map(id => Rc.RECIPES[id].out)).size === Rc.RECIPE_IDS.length, 'recipes: one recipe per piece');
  ok(['melonStool', 'catTower', 'pumpkinLamp'].every(id => FURNITURE[id].shop === false && Rc.recipeFor(id)), 'recipes: every craft-only piece has a recipe');
  ok(Rc.RECIPES.melonStool.pantry.melon && Rc.RECIPES.melonStool.mats.wood && Rc.RECIPES.catTower.mats.wood && Rc.RECIPES.catTower.mats.silk && Rc.RECIPES.pumpkinLamp.pantry.pumpkin && Rc.RECIPES.pumpkinLamp.mats.lantern, 'recipes: melon + wood, wood + silk, pumpkin + lantern');
  ok(Rc.START_RECIPES.length >= 4 && Rc.SCROLLS.length >= 4 && Rc.RECIPE_IDS.some(id => Rc.RECIPES[id].learn === 'reward'), 'recipes: some known from the start, some sold as scrolls, some given as thanks');
  ok(FURNITURE_IDS.filter(id => FURNITURE[id].shop === false && !FURNITURE[id].trophy).every(id => Rc.recipeFor(id) || Fd.FIND_WHERE.some(w => Fd.FIND_TABLES[w].includes(id))), 'every never-sold piece can be crafted or found (the keepsakes come from crews: COZY §4.6)');
  { // the workbench state and the craft math
    const s = newGameState(); delete s.workbench;
    ok(!Rc.knowsRecipe(s, 'andonLamp') && Rc.knowsRecipe(s, 'woodChair') && Rc.knownRecipes(s).length === Rc.START_RECIPES.length, 'workbench: the start recipes are known from the beginning');
    const w = Rc.workbenchOf(s); ok(w.known && w.crafted && Rc.START_RECIPES.every(id => id in w.known), 'workbench: state.workbench is lazy { known, crafted }');
    ok(Rc.learnRecipe(s, 'andonLamp', 4) && !Rc.learnRecipe(s, 'andonLamp', 5) && s.workbench.known.andonLamp === 4 && !Rc.learnRecipe(s, 'nope'), 'workbench: learnRecipe → true once');
    s.materials = { wood: 13, stone: 2, petal: 0, silk: 0, lantern: 0 }; s.pantry = { melon: 3 };
    ok(Rc.maxCraft(s, 'sideTable') === 2 && Rc.maxCraft(s, 'woodChair') === 2 && Rc.maxCraft(s, 'flowerVase') === 0 && Rc.maxCraft(s, 'melonStool') === 3, 'workbench: maxCraft = the scarcest ingredient');
    ok(Rc.canCraft(s, 'sideTable', 2) && !Rc.canCraft(s, 'sideTable', 3) && !Rc.canCraft(s, 'melonStool') && Rc.maxCraft(s, 'melonStool') === 3, 'workbench: canCraft needs the recipe and the ingredients');
    const cc = Rc.craftCost('melonStool', 3); ok(cc.mats.wood === 9 && cc.pantry.melon === 3, 'workbench: craftCost scales with the count');
    let toasts = 0; const G = { state: s, ui: { toast: () => toasts++ }, day: { day: 7 } };
    ok(Rc.teachRecipe(G, 'melonStool', { from: 'tanu' }) && !Rc.teachRecipe(G, 'melonStool') && toasts === 1 && s.workbench.known.melonStool === 7 && Rc.canCraft(s, 'melonStool', 3), 'workbench: teachRecipe learns once, with a toast');
    ok(Rc.recipeHint('ragRug').how === 'Tanu sells this recipe' && /thank-you/.test(Rc.recipeHint('catTower', { mochi: 'Mochi' }).how) && Rc.recipeHint('catTower', { mochi: 'Mochi' }).who === 'mochi', 'workbench: hints for unknown recipes');
  }
  // ---- finds
  const tbl = Fd.FIND_TABLES, all = Fd.FIND_WHERE.flatMap(w => tbl[w]);
  ok(['bamboo', 'maple', 'tidepool', 'onsen', 'burrow'].every(w => tbl[w]?.length) && all.every(id => storable(id)), 'finds: a table for every region and the Burrow, every piece real');
  ok(['pandaPlush', 'hangingPlanter'].every(id => tbl.bamboo.includes(id)) && tbl.maple.includes('wp_maple') && ['frogFountain', 'lilyTub', 'wp_waves'].every(id => tbl.tidepool.includes(id)) && ['wp_wood', 'fl_stone'].every(id => tbl.onsen.includes(id)), 'finds: each region\'s set plus its extras');
  ok(['luckyCat', 'yokaiLantern'].every(id => tbl.burrow.includes(id) && Fd.FIND_WHERE.filter(w => tbl[w].includes(id)).length === 1 && !Rc.recipeFor(id) && FURNITURE[id].shop === false), 'finds: the lucky cat and the yokai lantern come only from the Burrow');
  ok(!all.some(id => FURNITURE[id] && FURNITURE[id].shop === false && Rc.recipeFor(id)), 'finds: craft-only pieces never drop');
  { // odds: low per monster, better per chest, good per boss; never two from one roll
    let x = 12345; const rng = () => (x = (x * 16807) % 2147483647) / 2147483647;
    const rate = (kind, n = 40000) => { let k = 0, two = 0; for (let i = 0; i < n; i++) { const d = Fd.rollFind('maple', kind, { rng }); k += d.length; if (d.length > 1) two++; } return { r: k / n, two }; };
    const mn = rate('normal'), ch0 = rate('chest0'), ch2 = rate('chest2'), bs = rate('boss', 8000);
    ok(mn.r > 0.006 && mn.r < 0.022 && !mn.two, `finds: ~1-2% per monster (${(mn.r * 100).toFixed(2)}%)`);
    ok(ch0.r > 0.07 && ch2.r < 0.2 && (ch0.r + ch2.r) / 2 > 0.1 && (ch0.r + ch2.r) / 2 < 0.15, `finds: ~12% per chest (${(ch0.r * 100).toFixed(1)}% / ${(ch2.r * 100).toFixed(1)}%)`);
    ok(bs.r > 0.3 && bs.r < 0.4 && !bs.two, `finds: ~35% per boss (${(bs.r * 100).toFixed(1)}%)`);
    ok(Fd.findChance('champion') > Fd.findChance('normal') && Fd.findChance('boss') > Fd.findChance('chest2'), 'finds: tougher foes, better odds');
    const got = {}; for (let i = 0; i < 3000; i++) for (const d of Fd.rollFind('bamboo', 'normal', { rng, force: true })) { ok(d.type === 'furniture' && d.n === 1, 'finds: a furniture loot entry'); got[d.key] = (got[d.key] || 0) + 1; }
    ok(Object.keys(got).every(id => tbl.bamboo.includes(id)) && tbl.bamboo.every(id => got[id] > 0) && got.pandaPlush > got.bambooBench, 'finds: a region drops its own pieces (the find-only ones more often)');
    const bur = {}; for (let i = 0; i < 4000; i++) { const id = Fd.pickFind('burrow', 2, rng); bur[id] = (bur[id] || 0) + 1; }
    const odd = (bur.luckyCat || 0) + (bur.yokaiLantern || 0), other = Object.keys(bur).filter(id => !tbl.burrow.includes(id));
    ok(odd > 2400 && odd < 3200 && other.length > 5 && other.every(id => { const r = shopRank(itemDef(id)); return FURNITURE[id] && r > 0 && r <= 2; }), `finds: the Burrow's oddities, now and then any piece up to the rank (${odd}/4000 oddities)`);
    const G = { finds: { force: 2 }, sim: { stats: { rank: 1 } } };
    ok(Fd.findDrops(G, { isRegion: true, regionId: 'onsen' }).length === 1 && Fd.findDrops(G, {}).length === 1 && G.finds.force === 0 && tbl.onsen.length, 'finds: G.finds.force makes the next rolls sure finds');
  }
}

hr('POE (the third hero, docs/POE.md)');
{
  // the class, the trees, the starter kit
  const C = CLASSES.poe;
  ok(HERO_IDS.slice(0, 3).join() === 'chewy,moka,poe' && C.weapons.join() === 'fuma' && C.dmgStat.fuma === 'dex' && C.starter.skills.fumaThrow === 1, 'poe: the third class (fūma, Dex, starts with Fūma Throw)');
  ok(['shuriken', 'jutsu', 'shadow'].every(t => TREES.some(x => x.id === t && x.cls === 'poe')) && C.trees.join() === 'shuriken,jutsu,shadow', 'poe: three trees');
  for (const t of C.trees) {
    const ids = SKILL_IDS.filter(id => SKILLS[id].tree === t), rows = ids.map(id => SKILLS[id].row).sort().join('');
    ok(ids.length === 7 && rows === '0112345'.slice(0, 7) && ids.filter(id => SKILLS[id].kind === 'passive').length === 1, `poe ${t}: 7 skills on rows 0-5 with one passive (${rows})`);
    for (const id of ids) for (const y of SKILLS[id].syn) ok(SKILLS[y.id].tree === t, `poe ${id}: synergy ${y.id} in its own tree`);
  }
  ok(canWield('poe', 'fuma') && !canWield('poe', 'sword') && !canWield('chewy', 'fuma') && !canWield('moka', 'fuma'), 'poe: the fūma is hers alone');
  ok(heroText("Chewy's bone and Chewy", { player: { cls: 'poe' } }) === "Poe's bone and Poe" && heroText('Chewy', { player: { cls: 'chewy' } }) === 'Chewy', 'heroText addresses the active hero');
  const st = newGameState(), h = st.heroes.poe;
  ok(h && h.player.cls === 'poe' && h.equipment.weapon?.base === 'boneFuma' && h.equipment.weapon.wtype === 'fuma' && !h.equipment.weaponAlt && h.player.mouseSets.every(m => m.join() === 'attack,fumaThrow') && !st.flags.poeJoined, 'poe: a fresh game has her (Bone Fūma, attack + Fūma Throw on both sets), not yet joined');
  // old saves (v1 single hero, v2 with two heroes) gain her through normalizeHeroes
  { const v2 = JSON.parse(JSON.stringify(saveableState(st))); delete v2.heroes.poe; v2.flags.mokaJoined = true; const n = normalizeHeroes(v2);
    ok(n.heroes.poe?.player?.cls === 'poe' && n.heroes.poe.player.lvl === 1 && n.heroes.moka && n.player === n.heroes.chewy.player && !n.flags.poeJoined, 'poe: a two-hero save migrates (Poe is new, not joined)'); }
  { const v1 = JSON.parse(JSON.stringify(saveableState(st))); delete v1.heroes; v1.player = newGameState().player; v1.player.lvl = 9; v1.equipment = newGameState().equipment; v1.version = 1;
    const n = normalizeHeroes(v1); ok(n.heroes.chewy.player.lvl === 9 && n.heroes.poe?.equipment.weapon?.wtype === 'fuma', 'poe: a v1 save migrates to three heroes'); }
  // her derived stats
  const S = { player: h.player, equipment: h.equipment, flags: {} }, d = computeStats(S);
  ok(d.weaponType === 'fuma' && d.dodge === C.dodge && d.statDmgPct === h.player.stats.dex && Math.abs(d.jutsuMul - (100 + h.player.stats.ene) / (100 + h.player.stats.dex)) < 0.01, `poe: fūma + Dex, class dodge ${C.dodge}%, jutsu ×${d.jutsuMul}`);
  ok(computeStats(newGameState()).dodge === 0, 'poe: the other heroes have no dodge');
  const chewyLife = computeStats(newGameState()).lifeMax, mokaS = newGameState().heroes.moka, mokaLife = computeStats({ player: mokaS.player, equipment: mokaS.equipment }).lifeMax;
  ok(d.lifeMax < chewyLife && d.lifeMax > mokaLife, `poe: fragile — life between Moka and Chewy (${mokaLife} < ${d.lifeMax} < ${chewyLife})`);
  // masteries and Swift as Wind
  S.player.lvl = 30; S.player.skills = { fumaThrow: 10, shurikenMastery: 5, smokeBomb: 5, ninjutsuMastery: 8, puffBall: 5, swiftWind: 10, shadowStep: 5 };
  const d2 = computeStats(S), sk = SKILLS;
  ok(d2.treeDmgPct.shuriken === sk.shurikenMastery.params(5).dmgPct && d2.treeDmgPct.jutsu === sk.ninjutsuMastery.params(8).dmgPct && d2.treeCostCut.jutsu === sk.ninjutsuMastery.params(8).costCut, 'poe: masteries fill her tree bonuses');
  ok(Math.abs(d2.dodge - (C.dodge + sk.swiftWind.params(10).dodge)) < 0.11 && d2.moveMul > d.moveMul, `poe: Swift as Wind adds dodge (${d2.dodge}%) and speed (×${d2.moveMul})`);
  const rP = skillRuntime('puffBall', S, d2);
  ok(rP.cost < sk.puffBall.cost(5) && rP.params.dmgPct > sk.puffBall.params(5).dmgPct, 'poe: Ninjutsu Mastery: cheaper, stronger jutsu');
  ok(usable('fumaThrow', S, d2).ok && !usable('chomp', S, d2).ok && !usable('splash', S, d2).ok, 'poe: her skills, not the others\'');
  const A = skillRuntime('attack', S, d2);
  ok(A.params.fuma && !A.params.projectile && A.params.dmgPct > 80, 'poe: the basic attack is a fūma slash (Shuriken Mastery helps)');
  for (const id of SKILL_IDS.filter(i => SKILLS[i].cls === 'poe')) { S.player.skills[id] = S.player.skills[id] || 3; const r = skillRuntime(id, S, computeStats(S)); ok(r && Object.values(r.params).every(v => typeof v === 'boolean' || fin(v)) && fin(r.cost), `poe ${id}: runtime finite`); }
  // crit options (Shadow Step's backstab, Vanish's double crit)
  { let c = 0; for (let i = 0; i < 400; i++) if (rollHit({ derived: d2, skillDmgPct: 100, target: { def: 0, res: {} }, critAdd: 100, rng }).crit) c++;
    const a = rollHit({ derived: { ...d2, dmgMin: 10, dmgMax: 10 }, skillDmgPct: 100, target: { def: 0, res: {} }, forceCrit: true, rng: () => 0.5 }), b = rollHit({ derived: { ...d2, dmgMin: 10, dmgMax: 10 }, skillDmgPct: 100, target: { def: 0, res: {} }, forceCrit: true, critX: 2, rng: () => 0.5 });
    ok(c === 400 && a.crit && b.dmg === Math.round(10 * (1 + 2 * (d2.critMul - 1))) && b.dmg > a.dmg, 'poe: critAdd / forceCrit / critX (double crit)'); }
  // her bases and her loot
  const fb = GEAR_BASE_IDS.filter(id => ITEM_BASES[id].wtype === 'fuma');
  ok(fb.length >= 12 && fb.every(id => ITEM_BASES[id].icon.shape === 'fuma') && [0, 1, 2].every(t => fb.some(id => ITEM_BASES[id].tier === t)), `poe: ${fb.length} fūma bases over three tiers`);
  for (let i = 0; i < 30; i++) { const it = generateItem({ ilvl: 1 + i * 2, slot: 'weapon', wtype: 'fuma', rng }); validateItem(it, 'fuma'); ok(it.wtype === 'fuma' && /Slash Damage/.test(itemTooltip(it, S, d2).lines[0].text), 'poe: fūma items generate with a slash line'); }
  const G = { state: newGameState() }, Ac = createActions(G), fm = generateItem({ ilvl: 3, slot: 'weapon', wtype: 'fuma', rarity: 'normal', rng });
  G.state.inventory[0] = fm; ok(!Ac.equip(0) && /Poe/.test(Ac.equipProblem(fm, 'weapon')), "poe: Chewy can't equip her fūma");
  // ---- hero balance (tools/hero-balance.mjs): her Fūma Throw build vs Chewy's Chomp and Moka's Splash, same level and gear
  const HB = await import('./hero-balance.mjs'), band = HB.poeBand([6, 15, 30, 45]);
  for (const b of band) ok(b.dps >= 0.85 && b.dps <= 1.2 && b.ehp >= 0.9 && b.ehp <= 1.15 && b.life < 1.02, `poe: level ${b.lvl} clear speed ×${b.dps.toFixed(2)} and eHP ×${b.ehp.toFixed(2)} of the Chewy–Moka mean (life ×${b.life.toFixed(2)}: fragile, but she dodges)`); for (const b of band) ok(b.step.clear >= 0.6 && b.step.single >= 1.15 && b.step.single <= 1.6, `poe: level ${b.lvl} Shadow Step build: clear ×${b.step.clear.toFixed(2)}, single target ×${b.step.single.toFixed(2)} of the mean (a single-target opener)`);
  { const { POE_TRAINING } = await import('../src/rpg/skillsPoe.js'), { canLearn } = await import('../src/rpg/skills.js'); const S2 = { player: { ...S.player, skillPts: 5, skills: { ...S.player.skills } } }; const before = canLearn('vanish', S2).ok; POE_TRAINING.add('vanish'); const lk = canLearn('vanish', S2), us = usable('vanish', { player: { ...S2.player, skills: { ...S2.player.skills, vanish: 3 } } }, d2); POE_TRAINING.delete('vanish'); ok(before && !lk.ok && /training/.test(lk.why) && !us.ok && POE_TRAINING.size === 0, `poe: a skill still in training can't be learned or cast ("${lk.why}"); none are in training now`); }
  ok(HB.fumaFlight(sk.fumaThrow.params(1, d2)) < 1.05 && Math.abs(HB.fumaFlight(sk.fumaThrow.params(20, d2)) - HB.fumaFlight(sk.fumaThrow.params(1, d2))) < 0.08, 'poe: a Fūma Throw round trip stays under ~1 s at every level');
}

hr('THE SHIH TZU (the fourth hero, docs/SHIHTZU.md)');
{
  const HB = await import('./hero-balance.mjs'), { SHIHTZU_TRAINING, DR_CAP } = await import('../src/rpg/skillsShihtzu.js');
  ok(SHIHTZU_TRAINING.size === 0 && Object.values(SKILLS).filter(s => s.cls === 'shihtzu').every(s => !s.training), 'shihtzu: all 21 skills are built (none in training)');
  const fl = GEAR_BASE_IDS.filter(id => ITEM_BASES[id].wtype === 'flail');
  ok(fl.length >= 12 && [0, 1, 2].every(t => fl.some(id => ITEM_BASES[id].tier === t)) && fl.every(id => ITEM_BASES[id].icon.colors?.length >= 2), `shihtzu: ${fl.length} flail bases over three tiers, each with its ball and rope colours`);
  // ---- hero balance (tools/hero-balance.mjs): the tank (Woeful Wallop) and the hex build vs the Chewy–Moka–Poe mean, same level and gear
  const sb = HB.stzBand([6, 15, 30, 45]);
  for (const b of sb) ok(b.dps >= 0.85 && b.dps <= 1.05 && b.ehp >= 1.15 && b.ehp <= 1.4, `shihtzu: level ${b.lvl} Woeful Wallop build: clear ×${b.dps.toFixed(2)}, eHP ×${b.ehp.toFixed(2)} of the mean (the tank)`);
  for (const b of sb) ok(b.hex.clear >= 0.85 && b.hex.clear <= 1.05, `shihtzu: level ${b.lvl} hex build (Dripping Paw, Grumble Cloud, Mournful Awoo, Everlasting Gloom): clear ×${b.hex.clear.toFixed(2)} of the mean (single ×${b.hex.single.toFixed(2)})`);
  const { st, d } = HB.buildHero('shihtzu', 45);
  ok(d.dmgReduce > 0 && d.dmgReduce <= DR_CAP, `shihtzu: damage reduction ${d.dmgReduce}% (capped at ${DR_CAP}%)`);
}

hr('FOOSY THE DRAGOON (the fifth hero, docs/GOLDEN.md)');
{
  const HB = await import('./hero-balance.mjs'), { GOLDEN_TRAINING } = await import('../src/rpg/skillsGolden.js');
  // (checkpoint 2: all 21 are built: none left "in training")
  const gt = Object.values(SKILLS).filter(s => s.cls === 'golden');
  ok(gt.length === 21 && GOLDEN_TRAINING.size === 0 && gt.every(s => !s.training), `golden: all ${gt.length} skills are built (none in training)`);
  const { WHELP_ACTIVES } = await import('../src/rpg/skillsGolden.js');
  ok(WHELP_ACTIVES.size === 5 && [...WHELP_ACTIVES].every(id => SKILLS[id]?.tree === 'whelp' && SKILLS[id].kind === 'active'), 'golden: the Whelp Bond has 5 actives, each waiting on Shadow (castBlocked)');
  const ln = GEAR_BASE_IDS.filter(id => ITEM_BASES[id].wtype === 'lance');
  ok(ln.length >= 12 && [0, 1, 2].every(t => ln.some(id => ITEM_BASES[id].tier === t)) && ln.every(id => ITEM_BASES[id].icon.colors?.length === 3), `golden: ${ln.length} lance bases over three tiers, each with its head, shaft and pommel colours`);
  // ---- hero balance (tools/hero-balance.mjs): the lance build and the javelin build vs the Chewy–Moka–Poe–Shih Tzu mean
  const gb = HB.gldBand([6, 15, 30, 45]);
  for (const b of gb) ok(b.dps >= 0.85 && b.dps <= 1.05 && b.ehp >= 1.0 && b.stzEhp < 1, `golden: level ${b.lvl} lance build (Sunbeam Thrust): clear ×${b.dps.toFixed(2)}, eHP ×${b.ehp.toFixed(2)} of the mean (×${b.stzEhp.toFixed(2)} the Shih Tzu's: solid, below the tank)`);
  for (const b of gb) ok(b.jav.clear >= 0.85 && b.jav.clear <= 1.05, `golden: level ${b.lvl} javelin build (Bonk Dart, Tailwag Volley): clear ×${b.jav.clear.toFixed(2)} of the mean (single ×${b.jav.single.toFixed(2)})`);
  for (const b of gb) ok(b.whelp.clear >= 0.85 && b.whelp.clear <= 1.05, `golden: level ${b.lvl} Whelp Bond build (Ember Breath): clear ×${b.whelp.clear.toFixed(2)} of the mean (single ×${b.whelp.single.toFixed(2)})`);
  { // Warm Heart: Shadow wakes sooner and mends faster (companion.js reads derived.shadowRevive / shadowRegen; 10 s and 1%/s untrained)
    const w = HB.buildHero('golden·whelp', 30), d0 = w.d, st2 = w.st; st2.player.skills.warmHeart = 10; const d1 = computeStats(st2);
    ok(d0.shadowRevive === 10 && d0.shadowRegen === 1 && d1.shadowRevive < 10 && d1.shadowRevive >= 3 && d1.shadowRegen > 1 && d1.treeCostCut.whelp > 0, `golden: Warm Heart 10 wakes Shadow after ${d1.shadowRevive}s (10s untrained), mends ${d1.shadowRegen}%/s, the Bond costs ${d1.treeCostCut.whelp}% less`);
  }
  const { d } = HB.buildHero('golden', 30);
  ok(d.weaponType === 'lance' && d.shadowLife >= 20 && d.shadowDmg >= 20 && d.javMul > 0 && d.whelpMul > 0, `golden: Shadow's bond (+${d.shadowLife}% life, +${d.shadowDmg}% damage), javMul ×${d.javMul}, whelpMul ×${d.whelpMul}`);
  const h1 = HB.buildHero('golden', 1), R = skillRuntime('attack', h1.st, h1.d);
  ok(R.params.lance && R.params.radius > 2.6 && R.params.radius > (ATTACK.params(1, { weaponType: 'flail' }).radius || 0), `golden: the reach combo reaches ${R.params.radius} m (the longest melee reach)`);
}

hr('CHARGED ABILITIES');
// docs/CHARGE.md: the tables, the rules (stage times, costs, gating), the balance layer and the DPS-band sim
{
  const Ch = await import('../src/rpg/charge.js');
  const Sim = await import('./charge-sim.mjs');
  const { CHARGE } = Ch, r1 = v => Math.round(v * 10) / 10;
  const ids = Object.keys(CHARGE);
  // ---- every active skill of both heroes charges, with a full table
  const actives = SKILL_IDS.filter(id => !['passive', 'aura'].includes(SKILLS[id].kind));
  // (all four heroes: Poe's 18 tables are rpg/chargePoe.js, the Shih Tzu's 15 rpg/chargeShihtzu.js, merged into the table by charge.js)
  // (and Foosy's 15: rpg/chargeGolden.js)
  ok(actives.every(id => CHARGE[id]) && ids.every(id => actives.includes(id)), `charge: a table for every active skill (${ids.length})`);
  ok(ids.filter(id => SKILLS[id].cls === 'poe').length === 18 && ids.filter(id => SKILLS[id].cls === 'poe').every(id => CHARGE[id].pose.startsWith('poe')), 'charge: Poe has 18 tables, each with one of her wind-up poses');
  ok(ids.filter(id => SKILLS[id].cls === 'shihtzu').length === 15 && ids.filter(id => SKILLS[id].cls === 'shihtzu').every(id => CHARGE[id].pose.startsWith('stz')), 'charge: the Shih Tzu has 15 tables, each with one of his wind-up poses');
  ok(ids.filter(id => SKILLS[id].cls === 'golden').length === 15 && ids.filter(id => SKILLS[id].cls === 'golden').every(id => CHARGE[id].pose.startsWith('gld')), 'charge: Foosy has 15 tables, each with one of his wind-up poses');
  for (const id of ids) {
    const c = CHARGE[id];
    ok(c.ready === true && SKILLS[id].charge === c, `charge ${id}: ready and attached to its skill`);
    ok(typeof c.apply === 'function' && typeof c.lines === 'function' && c.title && c.blurb && c.pose && /^#[0-9a-f]{6}$/i.test(c.color), `charge ${id}: apply, lines, title, blurb, pose, colour`);
    ok(c.perks.stages?.ranks === 2 && c.perks.quick?.ranks === 3 && Object.keys(c.perks).length === 4, `charge ${id}: Deeper Charge, Quick Wind-up + 2 more perks`);
    for (const p of Object.values(c.perks)) ok(p.req.length >= 1 && p.req.every((v, i) => v >= 1 && (!i || v >= p.req[i - 1])) && p.ranks >= 1 && p.name && p.desc && typeof p.info === 'function', `charge ${id}.${p.id}: gating + text`);
    if (c.tune) ok(c.tune.dmg.length === 3 && c.tune.dmg.every(v => v > 0 && v < 3) && c.tune.shape.length === 3 && c.tune.shape.every((v, i) => v >= 0 && v <= 1 && (!i || v >= c.tune.shape[i - 1])), `charge ${id}: tune (dmg > 0, shape 0..1 non-decreasing)`);
  }
  // ---- stage times, Quick Wind-up, costs, Efficient Focus
  const t0 = Ch.stageTimes(CHARGE.chomp), t3 = Ch.stageTimes(CHARGE.chomp, { quick: 3 });
  ok(t0[0] > Ch.GRACE && t0[0] < t0[1] && t0[1] < t0[2] && t0[2] < 2.5, `charge: stage times rise (${t0.map(v => v.toFixed(2)).join(' / ')} s)`);
  ok(t3.every((v, i) => Math.abs(v - t0[i] * (1 - 3 * Ch.QUICK_PER_RANK)) < 1e-9), 'charge: Quick Wind-up 3 trims every stage by 45%');
  ok(Ch.chargeCost(10, 1) === r1(10 * (1 + Ch.SURCHARGE)) && Ch.chargeCost(10, 3) === r1(10 * (1 + 3 * Ch.SURCHARGE)), `charge: each stage costs +${Ch.SURCHARGE * 100}% zoom (Ⅲ ×${1 + 3 * Ch.SURCHARGE})`);
  ok(Ch.chargeCost(10, 3, { focus: 2 }) === r1(10 * (1 + 3 * (Ch.SURCHARGE - 2 * Ch.FOCUS_PER_RANK))) && Ch.chargeCost(10, 3, { focus: 2 }) > 10, 'charge: Efficient Focus lowers the surcharge, never under a tap');
  ok(Ch.stageAt(0, t0) === 0 && Ch.stageAt(t0[0], t0) === 1 && Ch.stageAt(t0[2] + 1, t0, 1) === 1 && Ch.stageAt(t0[2], t0) === 3, 'charge: stageAt (capped at the hero\'s max)');
  // ---- gating, buying, respec (a level-12 Chewy)
  const st = newGameState(); st.player.lvl = 30; st.player.skillPts = 6; st.player.skills.chomp = 4;
  ok(Ch.maxStage('chomp', st) === 1 && !Ch.canLearnPerk('chomp', 'stages', st).ok && /level 5/.test(Ch.canLearnPerk('chomp', 'stages', st).why), 'charge: Deeper Charge gated by the skill\'s level (Ⅱ at 5)');
  ok(Ch.canLearnPerk('chomp', 'quick', st).ok && Ch.learnPerk(st, 'chomp', 'quick').ok && st.player.skillPts === 5, 'charge: buying a perk spends one skill point');
  ok(!Ch.canLearnPerk('splash', 'quick', st).ok && /Another hero/.test(Ch.canLearnPerk('splash', 'quick', st).why), "charge: Moka's perks are hers");
  st.player.skills.chomp = 10; Ch.learnPerk(st, 'chomp', 'stages'); Ch.learnPerk(st, 'chomp', 'stages');
  ok(Ch.maxStage('chomp', st) === 3 && !Ch.canLearnPerk('chomp', 'stages', st).ok && Ch.perkPoints(st) === 3, 'charge: Deeper Charge 2 → Stage Ⅲ, then mastered; 3 points in perks');
  st.player.skillPts = 0; ok(/No skill points/.test(Ch.canLearnPerk('chomp', 'wide', st).why), 'charge: no points, no perk');
  // ---- chargeRuntime + the balance layer
  const d = computeStats(st);
  const R0 = skillRuntime('chomp', st, d), R1 = Ch.chargeRuntime('chomp', st, d, 1), R3 = Ch.chargeRuntime('chomp', st, d, 3), R9 = Ch.chargeRuntime('chomp', st, d, 9);
  ok(R1.charge.stage === 1 && R3.charge.stage === 3 && R9.charge.stage === 3 && R3.cost === Ch.chargeCost(R0.cost, 3, Ch.perksOf(st, 'chomp')), 'charge: chargeRuntime (stage clamp, cost)');
  ok(R3.params.dmgPct > R1.params.dmgPct && R1.params.dmgPct >= R0.params.dmgPct * 0.999 && R3.params.radius >= R1.params.radius, 'charge: a charged Chomp hits harder and wider than a tap, more at Ⅲ');
  const sx = Sim.simHero('chewy'), sm = Sim.simHero('moka'), sp = Sim.simHero('poe'), sz = Sim.simHero('shihtzu'), sg = Sim.simHero('golden');
  for (const id of ids) {
    const H = SKILLS[id].cls === 'moka' ? sm : SKILLS[id].cls === 'poe' ? sp : SKILLS[id].cls === 'shihtzu' ? sz : SKILLS[id].cls === 'golden' ? sg : sx, S = H.st;
    S.player.chargePerks = {}; const T0 = skillRuntime(id, S, H.d);
    S.player.chargePerks = { [id]: Object.fromEntries(Object.entries(CHARGE[id].perks).map(([k, p]) => [k, p.ranks])) };
    const Rs = [1, 2, 3].map(s => Ch.chargeRuntime(id, S, H.d, s));
    if (T0.params.dmgPct) ok(Rs.every((R, i) => R.params.dmgPct >= T0.params.dmgPct * 0.995 && (!i || R.params.dmgPct >= Rs[i - 1].params.dmgPct * 0.995)), `charge ${id}: a charged hit never hits softer than a tap or the stage before`);
    for (const key of ['radius', 'count', 'bounces', 'strikes', 'links', 'duration', 'distance']) if (typeof T0.params[key] === 'number') ok(Rs.every((R, i) => R.params[key] >= T0.params[key] - 1e-9 && (!i || R.params[key] >= Rs[i - 1].params[key] - 1e-9)), `charge ${id}: ${key} never shrinks with the charge`);
    for (const key of ['count', 'bounces', 'strikes', 'links']) if (typeof Rs[2].params[key] === 'number') ok(Number.isInteger(Rs[2].params[key]), `charge ${id}: ${key} stays whole`);
    ok(Rs.every(R => R.cost > T0.cost && R.params && Ch.chargeInfo(id, S, H.d).length === 3), `charge ${id}: costs more than a tap; tooltip lines for Ⅰ Ⅱ Ⅲ`);
    ok(Ch.chargeInfo(id, S, H.d).every(x => x.lines.every(l => typeof l === 'string' && !/NaN|undefined/.test(l))), `charge ${id}: tooltip numbers are real`);
  }
  // perk bonus damage grows with the charge
  const fake = s => ({ id: 'dig', def: SKILLS.dig, charge: { stage: s, perks: { aftershock: 1 } } });
  ok(Ch.perkAt(fake(1), 'aftershock').pct === CHARGE.dig.perks.aftershock.pct * Ch.PERK_STAGE[0] && Ch.perkAt(fake(3), 'aftershock').pct === CHARGE.dig.perks.aftershock.pct && Ch.perkAt(fake(3), 'wide') === null, 'charge: perkAt scales a perk\'s damage by stage (and is null when not taken)');
  // ---- the DPS-band sim (tools/charge-sim.mjs): sustained gain of a full charge, every perk, a skill build, 60 s
  const rows = [];
  for (const id of ids) {
    const r = [1, 2, 3].map(s => Sim.chargeBand(id, { stage: s })), b = r.map(Sim.blendOf);
    rows.push({ id, kind: r[2].kind, b, pack: r[2].pack, single: r[2].single, burst: r[2].burst });
    if (r[2].kind === 'utility') { ok(b.every(x => x > 0.6 && x < 1.6), `charge band ${id}: a summon / buff stays sane (${b.join(' / ')})`); continue; }
    ok(b[2] >= Sim.BAND[0] && b[2] <= Sim.BAND[1], `charge band ${id}: a full charge is +10–30% sustained (×${b[2]})`);
    ok(b[0] >= Sim.STAGE_OK[0] && b[0] <= Sim.STAGE_OK[1] && b[1] >= Sim.STAGE_OK[0] && b[1] <= Sim.STAGE_OK[1], `charge band ${id}: Ⅰ and Ⅱ are sane too (×${b[0]} / ×${b[1]})`);
    ok(r[2].burst > 1.2, `charge band ${id}: the burst is much higher (×${r[2].burst})`);
  }
  const dm = rows.filter(r => r.kind !== 'utility'), med = [...dm].sort((a, b) => a.b[2] - b.b[2])[dm.length >> 1].b[2];
  ok(med >= 1.15 && med <= 1.25, `charge band: the median skill sits mid-band (×${med})`);
  if (!quiet) {
    log(`  ${pad('skill', 16)} ${pad('kind', 8)} ${pad('Ⅰ / Ⅱ / Ⅲ (blend)', 22)} ${pad('Ⅲ pack', 8)} ${pad('single', 8)} burst`);
    for (const r of rows) log(`  ${pad(r.id, 16)} ${pad(r.kind, 8)} ${pad(r.b.map(v => '×' + v).join(' / '), 22)} ${pad('×' + r.pack, 8)} ${pad('×' + r.single, 8)} ×${r.burst}`);
  }
}

// ------------------------------------------------------------------ zones phase A (docs/ZONES.md §8; ROADMAP Z-A2 to Z-A5)
hr('ZONES: DUNGEON DEFS, SEEDS, STATE, QUEST STEPS');
{
  const D = await import('../src/dungeon/defs.js'), Gn = await import('../src/dungeon/gen.js'), Z = await import('../src/rpg/zones.js'), Q = await import('../src/world/questSteps.js');
  const { REGION_IDS, REGIONS } = await import('../src/regions/index.js');
  // ---- DungeonDef: the Burrow is unchanged
  const B = D.DUNGEONS.burrow;
  ok(B.kind === 'burrow' && B.floors === Infinity && B.waypoints, 'defs: DUNGEONS.burrow is endless with waypoints');
  let same = true;
  for (let f = 1; f <= 40; f++) {
    const p = D.floorPlan(B, f);
    if (p.theme !== Gn.themeFor(f) || p.boss !== Gn.bossFor(f) || p.mlvl !== f + 1 || p.waypoint !== (f % 5 === 1 && f > 1)) same = false;
    for (const seed of [1 + f * 17, 4242 + f]) { const a = Gn.generate({ floor: f, seed }), b = Gn.generate({ floor: f, seed, plan: p }); if (JSON.stringify([a.rooms, a.spawns, a.chests, a.waypoint, a.stairs, a.theme, a.mlvl, a.boss]) !== JSON.stringify([b.rooms, b.spawns, b.chests, b.waypoint, b.stairs, b.theme, b.mlvl, b.boss])) same = false; }
  }
  ok(same, 'defs: the Burrow plan reproduces the old generator floor for floor (theme every 20, bosses every 5, mlvl floor + 1, waypoints)');
  // the four zone dungeons: stubs, 2 floors, the zone's own monsters and boss
  ok(Object.keys(D.ZONE_DUNGEON).join() === REGION_IDS.join() && Object.values(D.ZONE_DUNGEON).join() === 'bambooDepths,mapleRoots,tideCaves,onsenCaverns', 'defs: one zone dungeon per zone (bambooDepths, mapleRoots, tideCaves, onsenCaverns)');
  for (const id of Object.values(D.ZONE_DUNGEON)) {
    const d = D.DUNGEONS[id], R = REGIONS[d.zone];
    ok(d.kind === 'zone' && d.floors === 2 && (d.stub || d.gate) && !d.waypoints && Gn.THEMES[d.theme] && d.monsters.join() === R.monsters.join() && d.boss === R.boss && d.levels.join() === R.levels.join(), `defs: ${id} is a 2-floor zone dungeon (${d.gate ? 'built, gated' : 'stub'}) with ${d.zone}'s monsters, boss and level band`);
    const p1 = D.floorPlan(d, 1, { heroLvl: 1 }), p2 = D.floorPlan(d, 2, { heroLvl: 99 }), pt = D.floorPlan(d, 2, { heroLvl: 99, tier: 5 });
    ok(!p1.boss && p2.boss === d.boss && !p1.waypoint && p1.mlvl === d.levels[0] && p2.mlvl === d.levels[1] + 1 && pt.mlvl === Math.min(60, d.levels[1] + 1 + 20), `defs: ${id} floor 1 has no boss, floor 2 has it; levels from its band, +1 a floor, +4 a tier (cap 60)`);
    let bad = 0;
    for (let s = 1; s <= 60; s++) for (const f of [1, 2]) {
      const L = Gn.generate({ floor: f, seed: s * 13 + f, plan: D.floorPlan(d, f, { heroLvl: 10 }) });
      if (L.rooms.length < 2 || !!L.waypoint || (f === 1 ? (!L.stairs || L.boss) : (L.stairs || L.boss !== d.boss || !L.bossRoom)) || L.theme !== d.theme) bad++;
    }
    ok(!bad, `defs: ${id} generates (60 seeds × 2 floors): stairs on floor 1, the boss room on floor 2, never a waypoint (${bad} bad)`);
  }
  // normRun: the old numeric API, clamping
  const n1 = D.normRun(7), n2 = D.normRun({ id: 'mapleRoots', floor: 9, tier: 2, mods: ['swarming'] }), n3 = D.normRun({ id: 'nope', floor: 0 });
  ok(n1.id === 'burrow' && n1.floor === 7 && n1.tier === 0 && n2.id === 'mapleRoots' && n2.floor === 2 && n2.tier === 2 && n2.mods[0] === 'swarming' && n3.id === 'burrow' && n3.floor === 1, 'defs: normRun takes a Burrow floor number or { id, floor, tier, mods } (floors clamped, unknown ids → the Burrow)');
  // ---- seeds: pinned = the old formula; unpinned rerolls per entry
  const st0 = { dungeon: { deepest: 0, waypoints: [1] } };
  const pinned = [1, 5, 12].map(f => D.beginRun(st0, f, { fixedSeed: 1 }));
  ok(pinned.every(r => r.seed === 1 + r.floor * 17 && r.packSeed === r.floor * 999) && !st0.dungeon.runs, 'seeds: ?dseed=1 is exactly the old (seed || 1) + floor * 17, packs floor * 999, and leaves runs alone');
  const rr = new RNG(9), rolls = [0, 1, 2, 3].map(() => D.beginRun(st0, 1, { rand: () => rr.next() }));
  ok(st0.dungeon.runs === 4 && st0.dungeon.seed > 0 && new Set(rolls.map(r => r.seed)).size === 4 && new Set(rolls.map(r => r.packSeed)).size === 4, 'seeds: each unpinned entry bumps state.dungeon.runs and gets its own layout and pack seeds');
  const lays = new Set(rolls.map(r => JSON.stringify(Gn.generate({ floor: 1, seed: r.seed }).rooms)));
  ok(lays.size === 4, 'seeds: …so the same floor lays out differently each visit');
  ok(D.beginRun(st0, { id: 'burrow', floor: 3, seed: 77 }).seed === 77 && D.beginRun({}, { id: 'tideCaves', floor: 1 }, { fixedSeed: 1 }).seed !== D.beginRun({}, 1, { fixedSeed: 1 }).seed, 'seeds: an explicit seed wins; each dungeon has its own layouts for the same pin');
  // ---- state.zones and the migration from state.regions
  const fresh = Z.normalizeZones({});
  ok(Z.ZONE_IDS.join() === REGION_IDS.join() && Z.ZONE_IDS.every(id => { const z = fresh.zones[id]; return z.unlocked === false && z.visits === 0 && z.regionBoss === 0 && z.village === 'besieged' && Array.isArray(z.siegeCamps) && z.dungeon.cleared === 0 && z.dungeon.bestFloor === 0 && z.dungeon.tier.unlocked === 0 && z.dungeon.tier.cleared.length === 0 && z.dungeon.spirit.best === 0 && typeof z.quests === 'object'; }), 'zones: a fresh state gets the §8 record for all four zones');
  const old = { regions: { unlocked: { bamboo: true, maple: true }, cleared: { bamboo: 3 }, visits: { bamboo: 7, maple: 2 } } };
  Z.normalizeZones(old);
  ok(old.zones.bamboo.unlocked && old.zones.bamboo.regionBoss === 3 && old.zones.bamboo.visits === 7 && old.zones.maple.unlocked && old.zones.maple.visits === 2 && !old.zones.onsen.unlocked && old.zones.bamboo.dungeon.cleared === 0, 'zones: an old save migrates (unlocked, the boss count → regionBoss, visits); the dungeon record starts fresh');
  const Rv = old.regions;
  ok(Rv.unlocked.bamboo === true && Rv.cleared.bamboo === 3 && Rv.visits.maple === 2 && (Rv.cleared.onsen || 0) === 0 && Object.keys(Rv.visits).length === 4, 'zones: state.regions reads as the old shape (a live view)');
  Rv.cleared.maple = (Rv.cleared.maple || 0) + 1; Rv.visits.onsen = (Rv.visits.onsen || 0) + 1; Rv.unlocked.tidepool = true; Rv.visits.newZone = 2;
  ok(old.zones.maple.regionBoss === 1 && old.zones.onsen.visits === 1 && old.zones.tidepool.unlocked && old.zones.newZone?.visits === 2, 'zones: …and writes through it land in state.zones (a new id makes a zone)');
  const json = JSON.parse(JSON.stringify(old)), spread = { ...old };
  ok(!('regions' in json) && json.zones.bamboo.regionBoss === 3 && !('regions' in spread), 'zones: the view is not saved (JSON and the save spread keep state.zones only)');
  const again = Z.normalizeZones(Z.normalizeZones(json));
  ok(again.zones.bamboo.regionBoss === 3 && again.regions.cleared.bamboo === 3 && again.zones.maple.regionBoss === 1, 'zones: normalizing a reloaded save is idempotent');
  const both = Z.normalizeZones({ zones: { bamboo: { unlocked: false, visits: 9, regionBoss: 1 } }, regions: { unlocked: { bamboo: true }, cleared: { bamboo: 4 }, visits: { bamboo: 2 } } });
  ok(both.zones.bamboo.unlocked && both.zones.bamboo.regionBoss === 4 && both.zones.bamboo.visits === 9, 'zones: a save with both shapes keeps the best of each (a max-merge never loses progress)');
  const junk = Z.normalizeZones({ zones: { bamboo: { dungeon: 'x', village: 'ruined', siegeCamps: 3, visits: 'abc' } } });
  ok(junk.zones.bamboo.dungeon.tier.unlocked === 0 && junk.zones.bamboo.village === 'besieged' && Array.isArray(junk.zones.bamboo.siegeCamps) && junk.zones.bamboo.visits === 0, 'zones: a damaged zone record is repaired');
  // regionUnlocked still follows the old rules through the view
  const { regionUnlocked } = await import('../src/regions/index.js');
  const lu = Z.normalizeZones({ player: { lvl: 1 }, heroes: {} });
  ok(!regionUnlocked(lu, 'maple').ok && (lu.regions.cleared.bamboo = 1) && regionUnlocked(lu, 'maple').ok && regionUnlocked(lu, 'bamboo').ok === false, 'zones: regionUnlocked (level, or the previous zone\'s boss) works through the view');
  // dungeon clears and tiers
  const ts = Z.normalizeZones({});
  const c0 = Z.recordDungeonClear(ts, 'bamboo', 0), c0b = Z.recordDungeonClear(ts, 'bamboo', 0), c1 = Z.recordDungeonClear(ts, 'bamboo', 1);
  ok(c0.first && c0.tierUnlocked === 1 && !c0b.first && c0b.tierUnlocked === null && c1.tierUnlocked === 2 && ts.zones.bamboo.dungeon.cleared === 3 && ts.zones.bamboo.dungeon.tier.cleared.join() === '0,1', 'zones: the first clear opens T1; clearing the highest open tier opens the next; repeats open nothing');
  for (let t = 2; t <= 6; t++) Z.recordDungeonClear(ts, 'bamboo', Math.min(t, 5));
  ok(ts.zones.bamboo.dungeon.tier.unlocked === Z.TIER_MAX && Z.tierCleared(ts, 'bamboo', 5) && !Z.tierCleared(ts, 'maple', 1), 'zones: tiers stop at T5; tierCleared reads per zone');
  ok(Z.saveVillage(ts, 'maple') && !Z.saveVillage(ts, 'maple') && Z.villageSaved(ts, 'maple') && !Z.villageSaved(ts, 'bamboo'), 'zones: saveVillage marks it once');
  ok(Z.noteFloor(ts, 'onsen', 2) === 2 && Z.noteFloor(ts, 'onsen', 1) === 2, 'zones: noteFloor keeps the best floor');
  // ---- quest steps: filters and the new types
  const kill = (s, e) => Q.stepGain(s, 'kill', e);
  const eB = { id: 'mochi', floor: 3, zone: null, dungeon: 'burrow', tier: 0 }, eZ = { id: 'kodama', floor: 1, zone: 'bamboo', dungeon: 'bambooDepths', tier: 2 }, eR = { id: 'kodama', floor: 0, zone: 'bamboo', dungeon: null, tier: 0 };
  ok(kill({ type: 'kill', n: 8 }, eB) === 1 && kill({ type: 'kill', n: 8 }, eZ) === 1 && kill({ type: 'kill', n: 8 }, eR) === 1 && kill({ type: 'kill', monster: 'mochi' }, eZ) === 0, 'steps: an unfiltered kill counts anywhere (as before); monster filters still work');
  ok(kill({ type: 'kill', dungeon: 'bambooDepths' }, eZ) === 1 && kill({ type: 'kill', dungeon: 'bambooDepths' }, eR) === 0 && kill({ type: 'kill', dungeon: 'bambooDepths' }, eB) === 0 && kill({ type: 'kill', zone: 'bamboo' }, eR) === 1 && kill({ type: 'kill', zone: 'bamboo' }, eZ) === 1 && kill({ type: 'kill', zone: 'maple' }, eZ) === 0, 'steps: kill with a dungeon filter counts only there; a zone filter counts in the zone and its dungeon');
  ok(kill({ type: 'kill', dungeon: 'bambooDepths', floor: 1 }, eZ) === 1 && kill({ type: 'kill', dungeon: 'bambooDepths', floor: 2 }, eZ) === 0 && kill({ type: 'kill', tier: 2 }, eZ) === 1 && kill({ type: 'kill', tier: 3 }, eZ) === 0, 'steps: floor (exact) and tier (at least) filters');
  ok(Q.stepGain({ type: 'boss', id: 'mochiKing' }, 'boss', { id: 'mochiKing', dungeon: 'burrow' }) === 'set' && Q.stepGain({ type: 'boss', id: 'mochiKing' }, 'boss', { id: 'kasaLord' }) === 0 && Q.stepGain({ type: 'boss', dungeon: 'bambooDepths' }, 'boss', { id: 'tenguMaster', dungeon: 'bambooDepths' }) === 'set' && Q.stepGain({ type: 'boss', dungeon: 'bambooDepths' }, 'boss', { id: 'tenguMaster', dungeon: null, zone: 'bamboo' }) === 0 && Q.stepGain({ type: 'boss' }, 'boss', { id: 'x' }) === 0, 'steps: boss by id (as before) or by dungeon; an empty boss step matches nothing');
  ok(Q.stepGain({ type: 'find', item: 'lostBell', dungeon: 'mapleRoots' }, 'find', { item: 'lostBell', n: 2, dungeon: 'mapleRoots' }) === 2 && Q.stepGain({ type: 'find', item: 'lostBell' }, 'find', { item: 'other' }) === 0 && Q.stepGain({ type: 'find', item: 'lostBell', dungeon: 'mapleRoots' }, 'find', { item: 'lostBell', dungeon: 'burrow' }) === 0, 'steps: find counts the right item (n at a time) where its filters say');
  ok(Q.stepGain({ type: 'rescue', npc: 'hana' }, 'rescue', { npc: 'hana', dungeon: 'tideCaves' }) === 'set' && Q.stepGain({ type: 'rescue', npc: 'hana' }, 'rescue', { npc: 'ken' }) === 0 && Q.stepGain({ type: 'kill' }, 'rescue', { npc: 'hana' }) === 0, 'steps: rescue completes on that captive');
  const qs = Z.normalizeZones({ dungeon: { deepest: 12 } });
  ok(Q.zoneStepDone({ type: 'dungeonFloor', dungeon: 'burrow', n: 10 }, qs) && !Q.zoneStepDone({ type: 'dungeonFloor', dungeon: 'bambooDepths', n: 2 }, qs) && (Z.noteFloor(qs, 'bamboo', 2), Q.zoneStepDone({ type: 'dungeonFloor', dungeon: 'bambooDepths', n: 2 }, qs)) && Q.zoneStepHave({ type: 'dungeonFloor', dungeon: 'burrow', n: 20 }, qs) === 12, 'steps: dungeonFloor reads the Burrow\'s deepest or the zone dungeon\'s best floor');
  ok(!Q.zoneStepDone({ type: 'tier', dungeon: 'tideCaves', n: 1 }, qs) && (Z.recordDungeonClear(qs, 'tidepool', 1), Q.zoneStepDone({ type: 'tier', dungeon: 'tideCaves', n: 1 }, qs)) && !Q.zoneStepDone({ type: 'tier', dungeon: 'tideCaves', n: 2 }, qs), 'steps: tier n is done by a clear at tier n or higher');
  ok(!Q.zoneStepDone({ type: 'villageSaved', zone: 'onsen' }, qs) && (Z.saveVillage(qs, 'onsen'), Q.zoneStepDone({ type: 'villageSaved', zone: 'onsen' }, qs)) && Q.zoneStepDone({ type: 'kill' }, qs) === null, 'steps: villageSaved follows the zone; other types are not state steps');
  const dst = s => JSON.stringify(Q.destOf(s));
  ok(dst({ type: 'kill', n: 3 }) === JSON.stringify({ dungeon: 'burrow', zone: null }) && dst({ type: 'floor', n: 5 }) === JSON.stringify({ dungeon: 'burrow', zone: null, floor: 5 }) && Q.destOf({ type: 'collect', mat: 'wood' }) === null && Q.destOf({ type: 'collect', mat: 'mochi' }).dungeon === 'burrow', 'steps: destOf keeps the old Burrow targets (kills, floors, bosses, Mochi Jelly)');
  const dF = Q.destOf({ type: 'dungeonFloor', dungeon: 'mapleRoots', n: 2 }), dT = Q.destOf({ type: 'tier', dungeon: 'onsenCaverns', n: 3 }), dV = Q.destOf({ type: 'villageSaved', zone: 'tidepool' }), dK = Q.destOf({ type: 'kill', zone: 'bamboo' });
  ok(dF.dungeon === 'mapleRoots' && dF.zone === 'maple' && dF.floor === 2 && dT.floor === 2 && dT.boss && dV.zone === 'tidepool' && dV.village && dK.zone === 'bamboo' && !dK.dungeon, 'steps: destOf points zone steps at the zone, its gate, a floor or its boss');
  // the reach step (ROADMAP R-17: "Follow Shadow to …", polled by Story.reachTick): where it points and when it's here
  const rH = Q.destOf({ type: 'reach', at: 'home', x: 1, z: 2 }), rZ = Q.destOf({ type: 'reach', at: 'bamboo', x: 1, z: 2 }), rD = Q.destOf({ type: 'reach', at: 'bambooDepths', floor: 2, x: 1, z: 2 });
  ok(rH.home && rH.reach && rZ.zone === 'bamboo' && rZ.reach && !rZ.dungeon && rD.dungeon === 'bambooDepths' && rD.zone === 'bamboo' && rD.floor === 2 && rD.reach && Q.REACH_R > 2, 'steps: a reach step points at its spot at home, in a zone or on a dungeon floor');
  const here = (s, w) => Q.reachIsHere({ type: 'reach', x: 0, z: 0, ...s }, w);
  ok(here({ at: 'home' }, { home: true }) && !here({ at: 'home' }, { zone: 'bamboo' }) && here({ at: 'bamboo' }, { zone: 'bamboo', dungeon: null }) && !here({ at: 'bamboo' }, { zone: 'bamboo', dungeon: 'bambooDepths', floor: 1 })
    && here({ at: 'bambooDepths', floor: 2 }, { zone: 'bamboo', dungeon: 'bambooDepths', floor: 2 }) && !here({ at: 'bambooDepths', floor: 2 }, { zone: 'bamboo', dungeon: 'bambooDepths', floor: 1 }) && !Q.reachIsHere({ type: 'kill' }, { home: true }), 'steps: a reach step is "here" only in its own world (home, the zone outdoors, that floor)');
}

hr('HORDES: THE CROWD GRID (ROADMAP Z-B3)');
{
  // A query must return every entity the caller's exact test could accept (within r of the point), after inserts, moves,
  // removals and rebuilds; Combat / the monster pass then run the same tests the old scans did (src/combat/grid.js).
  const { Grid } = await import('../src/combat/grid.js');
  const { crowdOf } = await import('../src/dungeon/crowd.js');
  const rng = new RNG(4242), R = () => rng.next();
  const mk = n => Array.from({ length: n }, (_, i) => ({ id: i, pos: { x: R() * 120 - 20, y: R() * 3, z: R() * 120 - 20 }, radius: 0.2 + R() * 1.1, bodyR: 0.3 + R() * 0.5, height: 1 }));
  const covers = (g, ents, x, z, r) => { const got = new Set(g.near(x, z, r)); g.release(); return ents.every(e => !(e._in ?? true) || (e.pos.x - x) ** 2 + (e.pos.z - z) ** 2 >= r * r || got.has(e)); };
  for (const cell of [2, 4]) {
    const g = new Grid(cell), ents = mk(400);
    for (const e of ents) g.insert(e);
    let good = 0, n = 0;
    for (let q = 0; q < 300; q++) { n++; if (covers(g, ents, R() * 130 - 25, R() * 130 - 25, R() * 9)) good++; }
    for (const e of ents) { e.pos.x += (R() - 0.5) * 12; e.pos.z += (R() - 0.5) * 12; g.move(e); } // (every mover re-bucketed)
    for (let q = 0; q < 300; q++) { n++; if (covers(g, ents, R() * 130 - 25, R() * 130 - 25, R() * 9)) good++; }
    for (const e of ents.slice(0, 100)) { g.remove(e); e._in = false; }
    for (let q = 0; q < 200; q++) { n++; const x = R() * 130 - 25, z = R() * 130 - 25, got = g.near(x, z, 6); g.release(); if (covers(g, ents, x, z, 6) && !got.some(e => e._in === false)) good++; }
    ok(good === n, `grid (${cell} m cells): queries cover every entity in range after inserts, moves and removals (${good}/${n})`);
    const half = ents.slice(200); g.rebuild(half);
    const all = g.near(50, 50, 500); g.release();
    ok(all.length === half.length && half.every(e => all.includes(e)) && g.n === half.length, 'grid: a rebuild holds exactly the new list (the old entries are forgotten)');
    ok(g.maxR >= Math.max(...half.map(e => e.radius)) - 1e-9 && g.maxY >= Math.max(...half.map(e => e.pos.y + 0.5)) - 1e-9, 'grid: tracks the largest radius and the mid-height range of what it holds');
  }
  { // nesting: a query inside a query keeps both buffers intact
    const g = new Grid(4), ents = mk(200); for (const e of ents) g.insert(e);
    const a = g.near(40, 40, 8), snap = [...a]; const b = g.near(10, 70, 5); const bs = [...b]; g.release();
    ok(a.length === snap.length && a.every((e, i) => e === snap[i]) && bs.length >= 0, 'grid: nested queries use separate buffers');
    g.release();
    ok(g.depth === 0, 'grid: released buffers return the depth to zero');
  }
  { // the floor's crowd: big bodies (bosses) sit in a side list that every query adds
    const mode = { monsters: [] }, C = crowdOf(mode);
    const small = mk(120).map(e => ({ ...e, alive: true, def: {} })), boss = { pos: { x: 60, y: 0, z: 60 }, bodyR: 1.7, alive: true, def: { boss: true } };
    mode.monsters.push(...small, boss); C.rebuild(mode.monsters);
    const near = C.near(5, 5, 2), hasBoss = near.includes(boss); C.release();
    ok(hasBoss && C.maxR <= 0.8 + 1e-9 && !C.grid.near(60, 60, 0.1).includes(boss), 'crowd: a boss is in every query (side list) and does not widen the grid radius');
    C.grid.release();
  }
}

hr('HORDES: SAFE RIG CLONE (Poe smoke copies; ARCHITECTURE "Hordes")');
{
  // three's SkeletonUtils.clone deep-copies userData through JSON: a three object in it (hero ear joints' `tip`, Moka's
  // staff `orb`, Poe's fuma holders' `mat`) runs toJSON -> Matrix4.toArray() into plain arrays, which turns V8's
  // keyed-store feedback in toArray generic for the session (Skeleton.update 10-20x slower). cloneSkinnedSafe must
  // never call it with a plain array, restore the source, and give the copy its own nodes.
  const THREE = await import('three');
  const { clone: cloneSU } = await import('three/examples/jsm/utils/SkeletonUtils.js');
  const { cloneSkinnedSafe } = await import('../src/actors/safeClone.js');
  const rig = () => {
    const root = new THREE.Group(); root.name = 'root';
    const hip = new THREE.Bone(); hip.name = 'hip'; const ear = new THREE.Bone(); ear.name = 'ear_L'; const tip = new THREE.Bone(); tip.name = 'earTip_L';
    hip.add(ear); ear.add(tip); ear.position.set(0.1, 0.5, 0); tip.position.set(0, 0.2, 0);
    const g = new THREE.BoxGeometry(0.2, 0.2, 0.2), n = g.attributes.position.count;
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4), 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n * 4).map((v, i) => (i % 4 ? 0 : 1)), 4));
    const skin = new THREE.SkinnedMesh(g, new THREE.MeshBasicMaterial()); skin.name = 'body_skin'; skin.add(hip); skin.bind(new THREE.Skeleton([hip, ear, tip]));
    const holder = new THREE.Group(); holder.name = 'fuma_hand'; const mat = new THREE.MeshBasicMaterial(); holder.userData.mat = mat; holder.userData.kind = 'proc';
    ear.userData.tip = tip; ear.userData.gain = [1, 2]; root.add(skin, holder);
    return { root, ear, tip, holder, mat };
  };
  const plainCalls = fn => { const P = THREE.Matrix4.prototype, raw = P.toArray; let n = 0; P.toArray = function (a, o) { if (!a || !ArrayBuffer.isView(a)) n++; return raw.call(this, a, o); }; try { fn(); } finally { P.toArray = raw; } return n; };
  const A = rig(); const viaSU = plainCalls(() => cloneSU(A.root));
  ok(viaSU > 0, 'safe clone: the test sees three\'s clone call Matrix4.toArray with plain arrays (the trap is real)');
  const B = rig(); let C = null; const viaSafe = plainCalls(() => { C = cloneSkinnedSafe(B.root); });
  ok(viaSafe === 0, 'safe clone: cloneSkinnedSafe never calls Matrix4.toArray with a plain array');
  ok(B.ear.userData.tip === B.tip && B.holder.userData.mat === B.mat && Object.keys(B.ear.userData).join() === 'tip,gain', 'safe clone: the source rig keeps its userData (same objects, same keys)');
  const find = (r, name) => r.getObjectByName(name);
  const cEar = find(C, 'ear_L'), cTip = find(C, 'earTip_L'), cHolder = find(C, 'fuma_hand'), cSkin = find(C, 'body_skin');
  ok(cEar && cTip && cEar.userData.tip === cTip && cTip !== B.tip, 'safe clone: the copy\'s ear points at its own tip node');
  ok(cHolder.userData.mat === B.mat && cHolder.userData.kind === 'proc', 'safe clone: a material in userData is shared by reference; plain values copied');
  ok(Array.isArray(cEar.userData.gain) && cEar.userData.gain !== B.ear.userData.gain && cEar.userData.gain.join() === '1,2', 'safe clone: plain userData is still deep-copied');
  ok(cSkin.skeleton !== B.root.getObjectByName('body_skin').skeleton && cSkin.skeleton.bones.every(b => C.getObjectById(b.id) === b), 'safe clone: the copy\'s skeleton is its own, bound to its own bones');
  const D = new THREE.Group(); D.add(new THREE.Mesh()); D.userData.n = 3; const E = cloneSkinnedSafe(D);
  ok(E !== D && E.userData.n === 3 && E.children.length === 1, 'safe clone: a tree without three objects in userData clones as before');
}

// ------------------------------------------------------------------ zone villages (docs/ZONES.md §2–§3; ROADMAP Z-D1 to Z-D5)
hr('ZONE VILLAGES: DATA, QUESTS, THE DUNGEON PROVIDER');
{
  const VD = await import('../src/regions/village/data.js'), ZQ = await import('../src/world/zoneQuests.js'), Q = await import('../src/world/questSteps.js'), Z = await import('../src/rpg/zones.js');
  const { FURNITURE } = await import('../src/home/furniture.js'), { PANTRY } = await import('../src/life/pantry.js'), { DUNGEONS, ZONE_DUNGEON } = await import('../src/dungeon/defs.js');
  // ---- the villages' data
  ok(['bamboo', 'maple', 'tidepool', 'onsen'].every(z => VD.VILLAGES[z]?.name && VD.VILLAGES[z].jp && VD.VILLAGES[z].zone === z), 'villages: every zone has a named village (names in data)');
  ok(VD.VILLAGES.bamboo.name === 'Takemori Village' && VD.VILLAGES.maple.name === 'Akane Hamlet' && VD.VILLAGES.tidepool.name === 'Shiokaze Port' && VD.VILLAGES.onsen.name === 'Yukimi Spa Village', 'villages: the director\'s default names');
  const TK = VD.VILLAGES.bamboo, kinds = TK.buildings.map(b => b.kind);
  ok(TK.ready && TK.buildings.length >= 5 && TK.buildings.length <= 7 && VD.STANDARD.every(k => kinds.includes(k)) && kinds.includes('dojo') && kinds.includes('craft'), 'villages: Takemori has 5–7 buildings — the 4 standard ones, the Ninja Dojo and the Bamboo Craftshop');
  ok(TK.buildings.filter(b => b.kind !== 'waypoint').every(b => Math.abs(b.a) <= 85), 'villages: the tall buildings stand on the far side of the square (|a| ≤ 85°: the camera side stays low)');
  const named = TK.villagers.filter(v => !v.rescue);
  ok(named.length >= 3 && named.length <= 5 && TK.villagers.every(v => v.id && v.name && v.spec?.species && v.role), 'villages: 3–5 named villagers (each with an id, a name, a species and a role), plus one rescued from the dungeon');
  ok(TK.camps.length >= 2 && TK.camps.length <= 3 && TK.camps.every(c => TK.villagers.some(v => v.id === c.cage && v.camp === c.id)), 'villages: 2–3 siege camps, each caging one villager');
  ok(VD.ZONE_NPCS.tk_sasa?.zone === 'bamboo' && VD.zoneNpc('tk_kome')?.rescue && VD.zoneNpc('nobody') === null, 'villages: ZONE_NPCS indexes every zone villager with its zone');
  const site = { x: 55, z: 58 };
  let rt = true; for (let a = -170; a <= 170; a += 17) { const s = VD.slotAt(site, a, 9), b = VD.slotOf(site, s.x, s.z); if (Math.abs(b.a - a) > 1e-6 || Math.abs(b.d - 9) > 1e-6) rt = false; }
  const up = VD.slotAt(site, 0, 10), right = VD.slotAt(site, 90, 10);
  ok(rt && up.x < site.x && up.z < site.z && right.x > site.x && right.z < site.z, 'villages: screen-polar slots round-trip (slotAt ↔ slotOf); a = 0 is screen-up (−x, −z), 90 screen-right (+x, −z)');
  const fr = VD.slotAt(site, 30, 8); ok(Math.abs(Math.sin(fr.rot) * 8 + (fr.x - site.x)) < 1e-6 && Math.abs(Math.cos(fr.rot) * 8 + (fr.z - site.z)) < 1e-6, 'villages: a slot\'s yaw turns a +z front toward the square');
  // ---- the quests
  const ids = ZQ.zoneQuestsIn('bamboo');
  ok(ids.length >= 4 && ids.length <= 6, `quests: Takemori has 4–6 quests (${ids.length})`);
  const dungeon = ZONE_DUNGEON?.bamboo || 'bambooDepths';
  ok(ids.every(id => ZQ.ZONE_QUESTS[id].steps.some(s => s.dungeon === dungeon) && DUNGEONS[dungeon]), 'quests: every one has an objective in the zone\'s dungeon');
  ok(ids.every(id => { const q = ZQ.ZONE_QUESTS[id], last = q.steps[q.steps.length - 1]; return TK.villagers.some(v => v.id === q.giver) && last.type === 'talk' && last.npc === q.giver && q.offer && q.thanks; }), 'quests: each has a Takemori giver, an offer and thanks, and ends by talking to them');
  const types = new Set(ids.flatMap(id => ZQ.ZONE_QUESTS[id].steps.map(s => s.type)));
  ok(['kill', 'find', 'rescue', 'dungeonFloor', 'boss'].every(t => types.has(t)), 'quests: kill, find, rescue, reach-the-floor and boss objectives are all used');
  ok(ids.every(id => { const r = ZQ.ZONE_QUESTS[id].reward; return r.coins > 0 && r.xp > 0 && r.hearts > 0 && (!r.furniture || FURNITURE[r.furniture]) && Object.keys(r.pantry || {}).every(k => PANTRY[k]); }), 'quests: rewards are coins, xp, friendship, and real furniture / pantry goods');
  ok(ids.every(id => (ZQ.ZONE_QUESTS[id].prereq || []).every(p => ZQ.ZONE_QUESTS[p])) && ids.every(id => ZQ.ZONE_QUESTS[id].steps.every(s => s.type !== 'find' || ZQ.QUEST_ITEMS[s.item]) && ZQ.ZONE_QUESTS[id].steps.every(s => s.type !== 'rescue' || VD.ZONE_NPCS[s.npc])), 'quests: prereqs, quest items and rescued villagers all exist');
  ok(ids.every(id => ZQ.ZONE_QUESTS[id].steps.every(s => Q.destOf(s) !== undefined)), 'quests: every step has a pointer destination rule (questSteps.destOf)');
  { const all = ZQ.ZONE_QUEST_IDS, led = all.filter(id => ZQ.ZONE_QUESTS[id].steps.some(s => s.lead)); // (ROADMAP R-17: the text says Shadow leads, the step says lead)
    ok(led.length === 4 && led.every(id => ZQ.ZONE_QUESTS[id].steps[0].type === 'rescue' && /Shadow (already )?has (her|his) scent: follow him!/.test(ZQ.ZONE_QUESTS[id].desc)) && all.every(id => led.includes(id) || !/Shadow has|follow him/i.test(ZQ.ZONE_QUESTS[id].desc)), 'quests: the four rescues say Shadow has the scent, and only they lead (lead: true)'); }
  // ---- offers (only once the village is saved; prereqs gate the later ones)
  const st = Z.normalizeZones({ quests: { active: [], done: [] } });
  ok(ZQ.offersFor(st, 'tk_sasa', false).length === 0, 'quests: nothing is offered while the village is besieged');
  ok(ZQ.offersFor(st, 'tk_sasa', true).join() === 'tk_roots' && ZQ.offersFor(st, 'tk_kazemaru', true).length === 0, 'quests: once saved, Grandma Sasa offers Roots of the Grove; the sensei waits for it');
  st.quests.done.push('tk_roots');
  ok(ZQ.offersFor(st, 'tk_sasa', true).join() === 'tk_tengu' && ZQ.offersFor(st, 'tk_kazemaru', true).join() === 'tk_windScroll', 'quests: finishing it opens the Tengu quest and the Wind Scroll');
  st.quests.active.push({ id: 'tk_tengu', step: 0, prog: 0 });
  ok(ZQ.offersFor(st, 'tk_sasa', true).length === 0, 'quests: a quest already taken is not offered again');
  // ---- phase C's provider: dungeonObjectives
  const ps = { quests: { active: [{ id: 'tk_ledger', step: 0, prog: 0 }, { id: 'tk_kome', step: 0, prog: 0 }, { id: 'tk_heartwood', step: 0, prog: 1 }, { id: 'tk_windScroll', step: 0, prog: 0 }], done: [] } };
  const f1 = ZQ.dungeonObjectives(ps, { dungeon, floor: 1, zone: 'bamboo' }), f2 = ZQ.dungeonObjectives(ps, { dungeon, floor: 2, zone: 'bamboo' });
  ok(f1.length === 1 && f1[0].kind === 'drop' && f1[0].item === 'tk_ledger' && f1[0].from === 'champion' && f1[0].n === 1 && f1[0].label === "Chiku's Ledger", 'provider: floor 1 asks for the ledger drop (from a champion)');
  ok(f2.length === 2 && f2.some(o => o.kind === 'cage' && o.npc === 'tk_kome' && o.label === 'Free Kome') && f2.some(o => o.kind === 'drop' && o.item === 'tk_heartwood' && o.n === 2 && o.from === 'chest'), 'provider: floor 2 asks for Kome\'s cage and the 2 heartwood still missing (the Wind Scroll waits behind its kill step)');
  ok(ZQ.dungeonObjectives(ps, { dungeon: 'mapleRoots', floor: 1, zone: 'maple' }).length === 0 && ZQ.dungeonObjectives({ quests: { active: [] } }, { dungeon, floor: 1 }).length === 0, 'provider: another dungeon, or no quests, asks for nothing');
  ps.quests.active[3].step = 1;
  ok(ZQ.dungeonObjectives(ps, { dungeon, floor: 2, zone: 'bamboo' }).some(o => o.item === 'tk_windScroll' && o.from === 'unique'), 'provider: the Wind Scroll appears once its kill step is done');
  // ---- the steps count the events phase C emits (questSteps)
  const led = ZQ.ZONE_QUESTS.tk_ledger.steps[0], kom = ZQ.ZONE_QUESTS.tk_kome.steps[0];
  ok(Q.stepGain(led, 'find', { item: 'tk_ledger', n: 1, dungeon, floor: 1, zone: 'bamboo' }) === 1 && Q.stepGain(led, 'find', { item: 'tk_ledger', dungeon, floor: 2 }) === 0, 'steps: quest:find counts on the right floor only');
  ok(Q.stepGain(kom, 'rescue', { npc: 'tk_kome', dungeon, floor: 2, zone: 'bamboo' }) === 'set' && Q.stepGain(kom, 'rescue', { npc: 'tk_kome', dungeon: null, floor: 0, zone: 'bamboo' }) === 0, 'steps: a dungeon rescue counts; a siege-cage rescue (no dungeon) does not');
  // ---- the other three villages: the same rules, their own specials, quests into their own dungeons (phase D, part 2)
  const SPECIALS = { maple: ['teaHouse'], tidepool: ['fishmonger', 'boatwright'], onsen: ['bathhouse', 'smith'] };
  for (const [zone, sp] of Object.entries(SPECIALS)) {
    const Vz = VD.VILLAGES[zone], kz = Vz.buildings.map(b => b.kind), dz = ZONE_DUNGEON?.[zone];
    ok(Vz.ready && Vz.buildings.length >= 5 && Vz.buildings.length <= 7 && VD.STANDARD.every(k => kz.includes(k)) && sp.every(k => kz.includes(k)), `villages: ${Vz.name} has 5–7 buildings — the 4 standard ones and ${sp.join(' + ')}`);
    ok(Vz.buildings.filter(b => b.kind !== 'waypoint').every(b => Math.abs(b.a) <= 100) && Vz.buildings.every(b => b.name && b.jp), `villages: ${Vz.name}'s buildings are named and stand round the far side`);
    const nz = Vz.villagers.filter(v => !v.rescue);
    ok(nz.length >= 3 && nz.length <= 5 && Vz.villagers.filter(v => v.rescue).length === 1 && Vz.villagers.every(v => v.id && v.name && v.spec?.species && v.role && v.bio), `villages: ${Vz.name} has ${nz.length} named villagers and one to rescue from its dungeon`);
    ok(Vz.camps.length >= 2 && Vz.camps.length <= 3 && Vz.camps.every(c => Vz.villagers.some(v => v.id === c.cage && v.camp === c.id) && c.saved), `villages: ${Vz.name} has 2–3 siege camps, each caging a villager, each with its saved dressing`);
    ok(Vz.captain?.id && Vz.folk.n > 0 && Vz.villagers.every(v => Vz.buildings.some(b => b.id === v.home)), `villages: ${Vz.name} has a siege captain, townsfolk, and every villager a home building`);
    const qz = ZQ.zoneQuestsIn(zone);
    ok(qz.length >= 4 && qz.length <= 6 && dz && DUNGEONS[dz] && qz.every(id => ZQ.ZONE_QUESTS[id].steps.some(s => s.dungeon === dz)), `quests: ${Vz.name} has ${qz.length} quests, every one with an objective in ${DUNGEONS[dz]?.name}`);
    ok(qz.every(id => { const q = ZQ.ZONE_QUESTS[id], last = q.steps[q.steps.length - 1]; return Vz.villagers.some(v => v.id === q.giver) && last.type === 'talk' && last.npc === q.giver && q.offer && q.thanks; }), `quests: ${Vz.name}'s quests come from its villagers and end with a talk back to the giver`);
    const tz = new Set(qz.flatMap(id => ZQ.ZONE_QUESTS[id].steps.map(s => s.type)));
    ok(['kill', 'find', 'rescue', 'dungeonFloor', 'boss'].every(t => tz.has(t)), `quests: ${Vz.name} uses kill, find, rescue, reach-the-floor and boss objectives`);
    ok(qz.every(id => { const r = ZQ.ZONE_QUESTS[id].reward; return r.coins > 0 && r.xp > 0 && r.hearts > 0 && (!r.furniture || FURNITURE[r.furniture]) && Object.keys(r.pantry || {}).every(k => PANTRY[k]); }) && qz.every(id => ZQ.ZONE_QUESTS[id].steps.every(s => s.type !== 'find' || ZQ.QUEST_ITEMS[s.item]?.zone === zone) && (ZQ.ZONE_QUESTS[id].prereq || []).every(p => ZQ.ZONE_QUESTS[p]?.zone === zone)), `quests: ${Vz.name}'s rewards and quest items are real`);
    const rescueQ = qz.find(id => ZQ.ZONE_QUESTS[id].steps[0].type === 'rescue'), rq = ZQ.ZONE_QUESTS[rescueQ];
    const pz = { quests: { active: [{ id: rescueQ, step: 0, prog: 0 }], done: [] } };
    const o2 = ZQ.dungeonObjectives(pz, { dungeon: dz, floor: rq.steps[0].floor || 1, zone });
    ok(o2.length === 1 && o2[0].kind === 'cage' && o2[0].npc === rq.steps[0].npc && Vz.villagers.find(v => v.id === o2[0].npc)?.rescue && ZQ.dungeonObjectives(pz, { dungeon: 'bambooDepths', floor: 2, zone: 'bamboo' }).length === 0, `provider: ${Vz.name}'s rescue quest asks ${DUNGEONS[dz]?.name} for ${o2[0]?.label} (and no other dungeon)`);
    const so = Z.normalizeZones({ quests: { active: [], done: [] } }), first = qz.find(id => !(ZQ.ZONE_QUESTS[id].prereq || []).length);
    ok(ZQ.offersFor(so, ZQ.ZONE_QUESTS[first].giver, false).length === 0 && ZQ.offersFor(so, ZQ.ZONE_QUESTS[first].giver, true).length >= 1, `quests: ${Vz.name} offers nothing while besieged, then its first quests`);
  }
  // ---- the bathhouse's soak (rpg/zoneBuffs.js): on the hero beside the meal, folded into the stats, ticks out
  {
    const ZB = await import('../src/rpg/zoneBuffs.js'), P = {};
    const rec = ZB.startSoak(P, 20), acc = {}; ZB.soakAcc(P.soak, (k, v) => { acc[k] = (acc[k] || 0) + v; });
    const d = { lifeMax: 100 }; ZB.soakPost(P.soak, d);
    ok(rec.left === 1200 && acc.lifeRegen === ZB.SOAK.regen && acc.resFrost === ZB.SOAK.frost && d.lifeMax === 100 + ZB.SOAK.lifePct && d.soak, 'soak: Onsen Glow adds regen and frost resist, and raises max life');
    const G0 = { state: { player: P }, actions: { recompute() { this.n = (this.n || 0) + 1; } } };
    const e1 = ZB.tickSoak(G0, 600), e2 = ZB.tickSoak(G0, 700), d2 = { lifeMax: 100 }; ZB.soakPost(P.soak, d2);
    ok(!e1 && e2 && P.soak === null && G0.actions.n === 1 && d2.lifeMax === 100 && !ZB.soakChip(G0), 'soak: it ticks down with play and runs out (one recompute), leaving the stats as they were');
  }
}

// ------------------------------------------------------------------ zone dungeons (docs/ZONES.md §8.2; ROADMAP Z-C1 to Z-C4)
hr('ZONE DUNGEONS: GENERATOR, PROGRESSION, FIRST-CLEAR UNIQUE');
{
  const D = await import('../src/dungeon/defs.js'), Gn = await import('../src/dungeon/gen.js'), ZP = await import('../src/rpg/zoneProgress.js'), Z = await import('../src/rpg/zones.js');
  const { regionUnlocked } = await import('../src/regions/index.js');
  // ---- the zone floors (dungeon/zoneGen.js through gen.js): density, elites, slots, the arena
  const def = D.DUNGEONS.bambooDepths;
  ok(def.kind === 'zone' && def.gate && def.floors === 2 && def.theme === 'bambooCave' && def.tank === 'iwabozu' && !def.stub, 'defs: the Bamboo Depths is a gated two-floor zone dungeon on its own cave kit, with its dungeon-only monster');
  let dens = true, arenaOk = true, slotOk = true, eliteOk = true, stairsOk = true, n = 0, lo = 1e9, hi = 0;
  for (const floor of [1, 2]) for (let seed = 1; seed <= 40; seed++) {
    const plan = D.floorPlan(def, floor, { heroLvl: 8 }), L = Gn.generate({ floor, seed: seed * 7 + floor, plan });
    n++; lo = Math.min(lo, L.packTotal); hi = Math.max(hi, L.packTotal);
    if (!L.zone || L.packTotal < plan.density[0] || L.packTotal > plan.density[1] || L.spawns.some(s => !s.boss && (s.count < 1 || s.count > 16))) dens = false;
    const packs = L.spawns.filter(s => !s.boss);
    if (packs.filter(s => s.rank === 'champion').length > 2 || packs.filter(s => s.rank === 'unique').length !== 1) eliteOk = false;
    if ((L.slots || []).length !== 2 || L.slots.some(s => !(s.guard >= 0) || L.spawns[s.guard]?.guard !== L.slots.indexOf(s))) slotOk = false;
    if (floor === 1 ? (!L.stairs || L.arena || L.boss) : (L.stairs || !L.arena || L.arena.r !== 17 || L.boss !== 'tenguMaster' || !L.arenaMouth)) stairsOk = false;
    if (floor === 2) { const b = L.spawns.find(s => s.boss); if (!b || Math.hypot((b.x + 0.5) * Gn.CELL - L.arena.x, (b.y + 0.5) * Gn.CELL - L.arena.z) > 3 || packs.some(s => Math.hypot((s.x + 0.5) * Gn.CELL - L.arena.x, (s.y + 0.5) * Gn.CELL - L.arena.z) < L.arena.r + 1)) arenaOk = false; }
  }
  ok(dens, `zone floors: ${n} layouts, ${lo}–${hi} monsters a floor (the plan's 120–160), packs of at most 16`);
  ok(eliteOk, 'zone floors: elites stay rare (at most 2 champion packs, exactly 1 unique pack a floor)');
  ok(slotOk, 'zone floors: two objective slots a floor, each with its guard pack');
  ok(stairsOk, 'zone floors: floor 1 has the stairs and no arena; floor 2 the 17 m arena with Master Tengu, its mouth, and no stairs');
  ok(arenaOk, 'zone floors: the boss stands at the arena centre and no pack waits inside the ring');
  // ---- progression: the order, the unlock on first clear, migrated saves
  ok(ZP.nextZone('bamboo') === 'maple' && ZP.nextZone('onsen') === null && ZP.prevZone('maple') === 'bamboo' && ZP.prevZone('bamboo') === null, 'progression: Bamboo → Maple → Tidepool → Onsen');
  const st = Z.normalizeZones({ player: { lvl: 5 } });
  ok(!ZP.openedByPrev(st, 'maple') && !regionUnlocked(st, 'maple').ok && /clear the Bamboo Depths/.test(regionUnlocked(st, 'maple').why || ''), 'progression: Momiji Hollow starts locked ("Reach level N or clear the Bamboo Depths")');
  Z.zoneOf(st, 'bamboo').dungeon.cleared = 1;
  ok(ZP.openedByPrev(st, 'maple') && regionUnlocked(st, 'maple').ok && !ZP.openedByPrev(st, 'tidepool'), 'progression: the Bamboo Depths cleared once opens Momiji Hollow (and only it)');
  ok(ZP.zoneUnlockOnClear(st, 'bamboo') === 'maple' && st.zones.maple.unlocked && ZP.zoneUnlockOnClear(st, 'bamboo') === null && ZP.zoneUnlockOnClear(st, 'onsen') === null, 'progression: the first clear marks the next zone unlocked once (none after Onsen)');
  const mig = Z.normalizeZones({ player: { lvl: 5 }, regions: { unlocked: { bamboo: true }, cleared: { bamboo: 1 }, visits: { bamboo: 2 } } });
  ok(ZP.openedByPrev(mig, 'maple') && regionUnlocked(mig, 'maple').ok, 'progression: a save that beat the region boss outdoors (zones.bamboo.regionBoss 1) keeps Momiji Hollow open');
  // ---- the zone boss uniques: real, tagged with their zone, never in the random pool
  const ZU = Object.entries(ZP.ZONE_UNIQUE);
  ok(ZU.length >= 1 && ZU.every(([z, id]) => UNIQUES[id] && UNIQUES[id].zone === z && ITEM_BASES[UNIQUES[id].base]), `uniques: each zone boss unique exists and is tagged with its zone (${ZU.map(([, id]) => id).join(', ')})`);
  let leak = 0; const rng = new RNG(5);
  for (let i = 0; i < 3000; i++) { const it = generateItem({ ilvl: 60, rarity: 'unique', rng }); if (ZU.some(([, id]) => it.uniqueId === id)) leak++; }
  const fu = makeUnique('tenguGaleFeather', 12);
  ok(leak === 0 && fu.rarity === 'unique' && fu.uniqueId === 'tenguGaleFeather', `uniques: 3000 random unique rolls never give a zone boss unique (${leak}); the first-clear chest's makeUnique does`);
}

// ------------------------------------------------------------------ zone tiers and modifiers (docs/ZONES.md §5.1; ROADMAP Z-E1, Z-E2)
hr('ZONE TIERS: SCALING, MODIFIERS, REWARDS, SAVE');
{
  const T = await import('../src/rpg/tiers.js'), ZM = await import('../src/rpg/zoneMods.js'), D = await import('../src/dungeon/defs.js'), Gn = await import('../src/dungeon/gen.js'), Z = await import('../src/rpg/zones.js'), Q = await import('../src/world/questSteps.js');
  // ---- the tier table and the level
  ok(T.TIERS.length === 6 && T.TIERS.map(t => t.slots).join() === '0,1,2,2,3,3' && T.TIERS.every((t, i) => i === 0 || (t.pack > T.TIERS[i - 1].pack && t.champ > T.TIERS[i - 1].champ && t.qty > T.TIERS[i - 1].qty && t.rarity > T.TIERS[i - 1].rarity && t.xp > T.TIERS[i - 1].xp)), 'tiers: T0–T5, slots 0/1/2/2/3/3, and pack size, rare chance and every reward rise each tier');
  const bd = D.DUNGEONS.bambooDepths, os = D.DUNGEONS.onsenCaverns;
  ok([0, 1, 2, 3, 4, 5].every(t => D.floorPlan(bd, 1, { tier: t, heroLvl: 8 }).mlvl === 8 + 4 * t) && D.floorPlan(bd, 2, { tier: 5, heroLvl: 8 }).mlvl === 29 && D.floorPlan(os, 2, { tier: 5, heroLvl: 50 }).mlvl === 56 && T.runLevel([40, 50], 2, { tier: 5 }, 50) === 60, 'tiers: monsters are the band (the hero clamped to it) + 1 a floor + 4 a tier, capped at 60');
  ok(D.floorPlan(bd, 1, { tier: 5, spirit: 3, heroLvl: 4 }).mlvl === 60 && D.floorPlan(D.DUNGEONS.burrowDeep, 2, { spirit: 9 }).mlvl === 60, 'tiers: a Spirit run is level 60 in every dungeon');
  const S1 = T.spiritInfo(1), S5 = T.spiritInfo(5), S10 = T.spiritInfo(10), S20 = T.spiritInfo(20);
  ok(S1.slots === 4 && T.spiritInfo(4).slots === 4 && S5.slots === 5 && T.spiritInfo(9).slots === 5 && S10.slots === 6 && S20.slots === 6, 'spirit: 4 slots, 5 from Spirit 5, 6 from Spirit 10');
  ok(S10.life > S5.life && S5.life > S1.life && S10.dmg > S1.dmg && S10.qty > S1.qty && S10.qty > T.TIERS[5].qty && S10.pinnacle && S20.pinnacle && !S5.pinnacle && S10.pack <= 1.5 && S20.pack <= 1.5, 'spirit: life, damage and rewards stack per tier (above T5); the pack size has a ceiling; the pinnacle every 10th');
  // ---- the modifiers: the catalogue and the cleaning
  const mods = ZM.MOD_IDS;
  ok(mods.length === 17 && ['swarming', 'teeming', 'rally', 'uniqueHunt', 'fierce', 'stout', 'quick', 'elementalFire', 'elementalFrost', 'elementalZap', 'warded', 'haunted', 'nightMarch', 'hardGround', 'bossWrath', 'treasureTrove', 'cursedShrines'].every(id => ZM.ZONE_MODS[id]), 'mods: the first 15 of ZONES §5 (Elemental as fire / frost / zap) are data');
  ok(mods.every(id => { const m = ZM.ZONE_MODS[id]; return m.name && m.desc && m.icon && m.color && m.jp && Number.isFinite(m.risk) && (m.layout || m.monster || m.run || m.boss) && Object.keys(m.reward).every(k => ZM.REWARD_KEYS.includes(k)); }), 'mods: each has a name, kanji, icon, colour, effect text, risk, a hook and a reward');
  ok(ZM.cleanMods(['swarming', 'swarming', 'nope', 'elementalFire', 'elementalZap', 'stout', 'quick'], { tier: 5 }).join() === 'swarming,elementalFire,stout' && ZM.cleanMods(['haunted', 'stout'], { tier: 1 }).join() === 'haunted' && ZM.cleanMods(['haunted'], { tier: 0 }).length === 0 && ZM.cleanMods(mods, { spirit: 10 }).length === 6, 'mods: cleaned to known ids, no repeats, one Elemental, at most the run\'s slots (T0 none)');
  const n5 = D.normRun({ id: 'tideCaves', floor: 2, tier: 9, mods: ['fierce', 'quick', 'stout', 'warded'] }), nS = D.normRun({ id: 'mapleRoots', tier: 2, spirit: 4, mods: mods }), nB = D.normRun({ id: 'burrow', floor: 3, tier: 3, mods: ['fierce'] });
  ok(n5.tier === 5 && n5.mods.length === 3 && nS.tier === 5 && nS.spirit === 4 && nS.mods.length === 4 && nB.tier === 0 && nB.spirit === 0 && nB.mods.length === 0, 'runs: normRun caps the tier at 5, a Spirit run is T5, the endless Burrow has no tiers (its tier runs are the Deep Burrow\'s)');
  // ---- the rewards, summed
  const rw = ZM.rewardTotals({ tier: 3, mods: ['swarming', 'haunted'] }), rwB = ZM.rewardTotals({ tier: 5, mods: ['bossWrath', 'rally', 'treasureTrove'] }), rw0 = ZM.rewardTotals({});
  ok(rw.qty === 0.57 && rw.rarity === 0.18 && rw.xp === 0.34 && rw.boss === 0 && rwB.boss === 0.2 && rwB.rarity === 0.4 && rwB.qty === 0.5 && rw0.qty === 0 && rw0.xp === 0, 'rewards: the tier\'s bonus plus every modifier\'s, summed (T3 + Swarming + Haunted: +57% quantity, +18% rarity, +34% xp)');
  ok(ZM.rewardText(rw) === '+57% item quantity, +18% item rarity, +34% experience' && ZM.rewardText({}) === '', 'rewards: the Lantern\'s reward line');
  let ex1 = 0, ex2 = 0; const rr = new RNG(77);
  for (let i = 0; i < 40; i++) { ex1 += ZM.extraItems(50, 0.5, () => rr.next()); ex2 += ZM.extraItems(50, 1.25, () => rr.next()); }
  ok(Math.abs(ex1 / 2000 - 0.5) < 0.05 && Math.abs(ex2 / 2000 - 1.25) < 0.05 && ZM.extraItems(10, 0) === 0 && ZM.extraItems(0, 3) === 0, `rewards: the quantity bonus adds that share of extra items (+50%: ${(ex1 / 2000).toFixed(3)}, +125%: ${(ex2 / 2000).toFixed(3)} a drop)`);
  // ---- the merged run and the monster hook
  const Rr = ZM.resolveRun({ tier: 5, spirit: 10, mods: ['swarming', 'stout', 'fierce', 'quick', 'elementalFrost', 'bossWrath'] });
  ok(Rr.active && Rr.mods.length === 6 && Rr.layout.pack === 2.1 && Rr.monster.life === 2.8 && Rr.monster.dmg === 1.95 && Rr.monster.speed === 1.25 && Rr.monster.atk === 1.25 && Rr.monster.el === 'frost' && Rr.boss.life === 1.5 && Rr.boss.wrath === 0.4 && !ZM.resolveRun({}).active, 'mods: a run resolves once (Spirit 10, six slots: life ×2 × Stout 1.4; pack ×1.5 (its ceiling) × Swarming 1.4; damage ×1.5 × Fierce 1.3; Quick; Frost; the boss\'s wrath)');
  const mk = (boss = false) => ({ def: { boss }, lifeMax: 100, life: 100, speed: 3, stats: { life: 100, dmg: [10, 20], speedMul: 1, res: { fire: 0 }, atkMul: 1 } });
  const mode = { runMods: ZM.resolveRun({ tier: 2, mods: ['stout', 'warded'] }) }, m1 = ZM.monsterMods(mode, mk()), m2 = ZM.monsterMods(mode, m1);
  ok(m1.lifeMax === 140 && m1.life === 140 && m1.stats.res.fire === 20 && m1.stats.res.frost === 20 && m2.lifeMax === 140 && ZM.monsterMods({}, mk()).lifeMax === 100, 'mods: monsterMods applies life and resistances once (a second pass changes nothing; no run, no change)');
  const bm = ZM.monsterMods({ runMods: ZM.resolveRun({ tier: 5, mods: ['bossWrath', 'fierce'] }) }, mk(true)), mm = ZM.monsterMods({ runMods: ZM.resolveRun({ tier: 5, mods: ['bossWrath', 'fierce'] }) }, mk(false));
  ok(bm.lifeMax === 150 && bm.stats.dmg.join() === '16,31' && mm.lifeMax === 100 && mm.stats.dmg.join() === '13,26', "mods: Boss's Wrath lifts only the boss (+50% life, +20% damage on top of Fierce)");
  const qm = ZM.monsterMods({ runMods: ZM.resolveRun({ tier: 1, mods: ['quick'] }) }, mk()), em = ZM.monsterMods({ runMods: ZM.resolveRun({ tier: 1, mods: ['elementalZap'] }) }, mk());
  ok(qm.speed === 3.75 && qm.stats.atkMul === 1.25 && em._el?.el === 'zap' && em._el.pct === 0.35, 'mods: Quick speeds moves and attacks; Elemental marks the monster for the extra element');
  // ---- the generator hook (gen.js generate → layoutMods)
  let same = true;
  for (const s of [3, 11, 29]) for (const f of [1, 2]) { const p = D.floorPlan(bd, f, { heroLvl: 9 }), a = Gn.generate({ floor: f, seed: s, plan: p }), b = Gn.generate({ floor: f, seed: s, plan: { ...p, tier: 0, mods: [] } }); if (JSON.stringify(a.spawns) !== JSON.stringify(b.spawns) || a.modded || b.modded) same = false; }
  ok(same, 'layout: a story run (no tier, no mods) is the same floor exactly');
  const stat = (run, id = 'bambooDepths', N = 24) => {
    const o = { tot: 0, champ: 0, uniq: 0, chests: 0, gold: 0, shrines: 0, extra: 0, rooms: 0, maxCount: 0, maxCap: 0, bad: 0, capped: 0 };
    for (let s = 1; s <= N; s++) for (const f of [1, 2]) {
      const def = D.DUNGEONS[id], L = Gn.generate({ floor: f, seed: s * 7 + f, plan: D.floorPlan(def, f, { heroLvl: 9, ...run }) }), P = L.spawns.filter(x => !x.boss);
      o.tot += P.reduce((a, x) => a + x.count + (x.rank === 'normal' ? 0 : 1), 0); o.champ += P.filter(x => x.rank === 'champion').length; o.uniq += P.filter(x => x.rank === 'unique').length;
      o.chests += L.chests.length; o.gold += L.chests.filter(c => c.quality === 'gold').length; o.shrines += L.shrines.length; o.extra += L.modded?.extra || 0; o.capped += L.modded?.capped ? 1 : 0;
      o.rooms += L.rooms.filter(r => r.kind !== 'start' && r.kind !== 'boss' && !r.arena).length;
      for (const x of P) { o.maxCount = Math.max(o.maxCount, x.count); o.maxCap = Math.max(o.maxCap, x.cap || 16); if (x.cap && x.count + 1 > x.cap + 1) o.bad++; }
      // nothing the hook added may stand in the arena ring, at the arrival or on a chest
      for (const x of P.filter(q => q.extra)) { if (L.arena && Math.hypot((x.x + 0.5) * 2 - L.arena.x, (x.y + 0.5) * 2 - L.arena.z) < L.arena.r + 2) o.bad++; if (Math.hypot(x.x - L.start.x, x.y - L.start.y) < 5) o.bad++; }
      for (const c of L.chests.filter(q => q.trove)) if (!L.at(c.x, c.y) || L.chests.some(q => q !== c && q.x === c.x && q.y === c.y)) o.bad++;
    }
    for (const k of Object.keys(o)) if (!['maxCount', 'maxCap', 'bad', 'capped'].includes(k)) o[k] /= N * 2;
    return o;
  };
  const s0 = stat({}), sSw = stat({ tier: 1, mods: ['swarming'] }), sTe = stat({ tier: 1, mods: ['teeming'] }), sRa = stat({ tier: 1, mods: ['rally'] }), sUh = stat({ tier: 1, mods: ['uniqueHunt'] }), sTt = stat({ tier: 2, mods: ['treasureTrove', 'cursedShrines'] }), sBig = stat({ tier: 5, mods: ['swarming', 'teeming', 'rally'] });
  ok(sSw.tot / s0.tot > 1.38 && sSw.tot / s0.tot < 1.62 && sSw.maxCap >= 22 && !sSw.bad, `layout: Swarming (+ T1) makes packs ~×1.48 bigger (${s0.tot.toFixed(0)} → ${sSw.tot.toFixed(0)} a floor; pack cap ${sSw.maxCap})`);
  ok(sTe.extra / sTe.rooms > 0.7 && sTe.tot > s0.tot * 1.25 && !sTe.bad, `layout: Teeming adds a pack in most rooms (${sTe.extra.toFixed(1)} of ${sTe.rooms.toFixed(1)}), never in the arena or at the arrival`);
  ok(Math.abs(s0.champ - 2) < 0.01 && sRa.champ >= 4 && Math.abs(s0.uniq - 1) < 0.01 && Math.abs(sUh.uniq - 3) < 0.01, `layout: Rally doubles the champion packs (2 → ${sRa.champ.toFixed(1)}); Unique Hunt adds two unique packs (1 → ${sUh.uniq.toFixed(1)})`);
  ok(Math.abs(sTt.gold - s0.gold - 2) < 0.05 && Math.abs(sTt.shrines - s0.shrines - 1) < 0.05 && !sTt.bad, `layout: Treasure Trove adds two golden chests a floor, Cursed Shrines one more shrine (${s0.gold.toFixed(2)} → ${sTt.gold.toFixed(2)} gold chests)`);
  ok(sBig.tot <= ZM.FLOOR_CAP.zone + 1 && sBig.tot > 280 && !sBig.bad, `layout: T5 + Swarming + Teeming + Rally fills a floor to ~${sBig.tot.toFixed(0)} (the ${ZM.FLOOR_CAP.zone} ceiling; capped on ${sBig.capped} floors of 48)`);
  const dB0 = stat({ tier: 1 }, 'burrowDeep', 12), dB = stat({ tier: 5, mods: ['swarming', 'teeming'] }, 'burrowDeep', 12);
  ok(dB.tot > dB0.tot * 1.5 && dB.tot <= ZM.FLOOR_CAP.burrow && !dB.bad, `layout: the Deep Burrow's rooms-and-corridors floors take the same hooks (${dB0.tot.toFixed(0)} → ${dB.tot.toFixed(0)})`);
  // ---- the Deep Burrow
  const deep = D.DUNGEONS.burrowDeep, dp1 = D.floorPlan(deep, 1, { tier: 2, heroLvl: 30 }), dp2 = D.floorPlan(deep, 2, { tier: 2, heroLvl: 30 });
  ok(deep.kind === 'deep' && deep.floors === 2 && !deep.waypoints && dp1.theme === 'crystal' && !dp1.boss && dp2.theme === 'moon' && dp2.boss === 'nineTails' && dp1.mlvl === 21 + 8 && dp2.mlvl === 22 + 8 && !dp1.layout, 'deep: the Deep Burrow is 2 Burrow floors (the Crystal Grotto, then the Moonlit Sanctum with Tamamo) at the band of floors 16–20, +4 a tier');
  // ---- the save: records, the migration, clears, Spirit
  const sv = Z.normalizeZones({ dungeon: { deepest: 25, waypoints: [1] }, zones: { maple: { dungeon: { cleared: 2, tier: { unlocked: 0, cleared: [] } } }, tidepool: { dungeon: { cleared: 0 } } } });
  ok(sv.zones.maple.dungeon.tier.unlocked === 1 && sv.zones.maple.dungeon.tier.cleared.join() === '0' && sv.zones.tidepool.dungeon.tier.unlocked === 0 && sv.dungeon.deep.tier.unlocked === 1 && sv.dungeon.deep.tier.cleared.join() === '0' && Z.normalizeZones({ dungeon: { deepest: 12, waypoints: [1] } }).dungeon.deep.tier.unlocked === 0, 'save: old saves start at T0 cleared where the story clear exists (a zone dungeon beaten; the Burrow past floor 20) and T1 opens');
  ok(Z.tierRecord(sv, 'maple') === Z.tierRecord(sv, 'mapleRoots') && Z.tierRecord(sv, 'burrowDeep') === sv.dungeon.deep && Z.tierRecord(sv, 'burrow') === null && Z.tierOpen(sv, 'mapleRoots') === 1, 'save: a tier record by zone or dungeon id; the Deep Burrow keeps its own; the endless Burrow has none');
  const again2 = Z.normalizeZones(JSON.parse(JSON.stringify(sv)));
  ok(again2.zones.maple.dungeon.tier.unlocked === 1 && again2.dungeon.deep.tier.unlocked === 1 && Z.fillTiers({ tier: { cleared: [3, 3, 9, -1, 'x'] }, lantern: { tier: 2, mods: ['swarming', 7] } }).tier.cleared.join() === '3' && Z.fillTiers({ lantern: { tier: 2, mods: ['swarming', 7] } }).lantern.mods.join() === 'swarming', 'save: normalizing is idempotent; a damaged record is repaired (tiers deduped and in range; the Lantern\'s memory cleaned)');
  const sp = Z.normalizeZones({ dungeon: { deepest: 0, waypoints: [1] } });
  ok(!Z.spiritOpen(sp) && Z.spiritMax(sp) === 0, 'spirit: closed on a fresh save');
  for (const z of Z.ZONE_IDS.slice(0, 3)) for (let t = 0; t <= 5; t++) Z.recordDungeonClear(sp, z, t);
  ok(!Z.spiritOpen(sp), 'spirit: three zone dungeons at T5 are not enough');
  for (let t = 0; t <= 4; t++) Z.recordDungeonClear(sp, 'onsenCaverns', t);
  const last = Z.recordDungeonClear(sp, 'onsenCaverns', 5);
  ok(last.firstTier && last.tierUnlocked === null && Z.spiritOpen(sp) && Z.spiritMax(sp) === 1 && Z.tierOpen(sp, 'burrowDeep') === 0, 'spirit: all four zone dungeons at T5 open Spirit 1 everywhere (the Deep Burrow is optional)');
  const sc = Z.recordDungeonClear(sp, 'burrowDeep', 5, 1), sc2 = Z.recordDungeonClear(sp, 'tideCaves', 5, 3), sc3 = Z.recordDungeonClear(sp, 'tideCaves', 5, 2);
  ok(sc.firstTier && sc2.firstTier && !sc3.firstTier && Z.spiritBest(sp) === 3 && Z.spiritMax(sp) === 4 && Z.tierRecord(sp, 'tideCaves').spirit.best === 3 && Z.tierCleared(sp, 'burrowDeep', 5), 'spirit: a Spirit clear in any dungeon opens the next in all; a Spirit clear counts as T5 there');
  // ---- the quest tier step, the Lantern's memory
  ok(Q.zoneStepDone({ type: 'tier', dungeon: 'burrowDeep', n: 5 }, sp) && !Q.zoneStepDone({ type: 'tier', dungeon: 'burrowDeep', n: 1 }, sv) && !Q.zoneStepDone({ type: 'tier', dungeon: 'mapleRoots', n: 2 }, sv), 'steps: the tier step reads the Deep Burrow as well as the zone dungeons');
  const ls = Z.normalizeZones({}); Z.rememberSetup(ls, 'mapleRoots', { tier: 3, spirit: 0, mods: ['stout', 'rally'] });
  ok(Z.lastSetup(ls, 'maple').tier === 3 && Z.lastSetup(ls, 'mapleRoots').mods.join() === 'stout,rally' && Z.lastSetup(ls, 'bambooDepths') === null, 'save: the Lantern remembers each dungeon\'s last setup');
  // ---- the clear chest
  const c1 = T.clearChest({ tier: 1 }), c1f = T.clearChest({ tier: 1 }, true), c5f = T.clearChest({ tier: 5 }, true), c5 = T.clearChest({ tier: 5 }), cS3 = T.clearChest({ spirit: 3 }), cS10 = T.clearChest({ spirit: 10 }, true);
  ok(c1.rares === 1 && c1f.rares === 2 && c1f.coinMul > c1.coinMul && c5.rares === 3 && c5.gem && !c5.zoneUnique && c5f.zoneUnique && !c1f.zoneUnique, 'chest: rares, a gem from T3, coins by tier; the first clear of a tier adds a rare and doubles the coins; the first T5 clear gives the zone unique again');
  ok(cS3.endgameChance === T.spiritInfo(3).unique && cS3.rares >= 3 && cS10.pinnacle && cS10.endgameChance === 0, 'chest: a Spirit run\'s chest has a chance at an endgame unique; the pinnacle\'s brings its own');
  // ---- the pinnacle (Spirit 10, 20, ...): the Four Seasons in the last boss's ring; the endgame uniques
  const PL = await import('../src/dungeon/pinnacleLayout.js'), IT = await import('../src/rpg/items.js');
  const pinOk = D.DUNGEON_IDS.filter(id => D.DUNGEONS[id].kind !== 'burrow').every(id => { const def = D.DUNGEONS[id], f = def.floors; return [10, 20].every(sp => { const L = Gn.generate({ floor: f, seed: 31 + sp, plan: D.floorPlan(def, f, { tier: 5, spirit: sp }) }); return L.pinnacle && L.boss === 'tenguMaster' && L.spawns.filter(s => s.boss).every(s => s.boss === 'tenguMaster') && L.arena?.r >= 12; }) && !Gn.generate({ floor: f, seed: 5, plan: D.floorPlan(def, f, { tier: 5, spirit: 9 }) }).pinnacle && !Gn.generate({ floor: 1, seed: 5, plan: D.floorPlan(def, 1, { tier: 5, spirit: 10 }) }).pinnacle; });
  ok(pinOk && PL.SEASONS.map(s => s.boss).join() === 'tenguMaster,umibozu,danzaburo,yukiOnna' && PL.SEASON_LIFE.length === 4, 'pinnacle: every 10th Spirit tier\'s boss floor (every tier dungeon, the Deep Burrow too) holds the Four Seasons in a ring, Spring first; no other floor or tier does');
  const eg = Object.values(IT.UNIQUES).filter(u => u.spirit), egIds = eg.filter(u => !u.pinnacle).map(u => u.id), pinU = IT.UNIQUES[PL.PINNACLE_UNIQUE];
  let rolled = 0; for (let i = 0; i < 3000; i++) { const it = IT.generateItem({ ilvl: 62, rarity: 'unique', rng: i + 1 }); if (IT.UNIQUES[it.uniqueId]?.spirit) rolled++; }
  ok(egIds.length === 4 && pinU?.pinnacle && pinU.spirit && eg.every(u => u.zone === 'spirit' && u.lvl >= 58) && eg.every(u => { const it = IT.makeUnique(u.id, 62, 7); return it.uniqueId === u.id && it.affixes.length === u.stats.length; }) && rolled === 0, 'endgame uniques: four for the Spirit chests and leaders and the pinnacle\'s own, all level 58+, never rolled at random');
  // ---- the Lantern's picks
  ok([1, 2, 3, 4, 5].every(t => { const r = ZM.recommendMods({ tier: t }), s = ZM.surpriseMods({ tier: t }, Math.random); return r.length === T.TIERS[t].slots && s.length === T.TIERS[t].slots && ZM.cleanMods(r, { tier: t }).length === r.length && ZM.cleanMods(s, { tier: t }).length === s.length; }) && ZM.recommendMods({ tier: 2 }).every(id => ZM.ZONE_MODS[id].risk <= 2), 'lantern: the recommended pick and "surprise me" fill the slots with a valid set (the recommended ones gentle)');
}

// ------------------------------------------------------------------ render health (ROADMAP R-7: the black flashes)
hr('RENDER HEALTH: NaN-SAFE NORMALS (ARCHITECTURE "Render health")');
{
  // one NaN pixel in the HDR buffer is a black block after the bloom: the normals that fed it must never be NaN. The
  // Horde's per-instance normal matrix (the cofactor form) must turn normals like three's getNormalMatrix, and stay
  // finite for a part squashed flat (a dying monster); merged geometry must not keep a zero vertex normal.
  const THREE = await import('three');
  const { normalMatrixInto, repairNormals, merge } = await import('../src/gfx/geom.js');
  const rng = new RNG(24), r = () => rng.next(), A = new Float32Array(9), N = new THREE.Matrix3(), M3 = new THREE.Matrix3(), m = new THREE.Matrix4();
  let worst = 0;
  for (let t = 0; t < 3000; t++) {
    m.compose(new THREE.Vector3(r(), r(), r()), new THREE.Quaternion(r() - 0.5, r() - 0.5, r() - 0.5, r() - 0.5).normalize(), new THREE.Vector3((r() < 0.5 ? -1 : 1) * (0.05 + 3 * r()), 0.05 + 3 * r(), 0.05 + 3 * r()));
    if (t % 3 === 0) m.multiply(new THREE.Matrix4().makeShear(r(), 0, r(), 0, 0, r()));
    N.getNormalMatrix(m); normalMatrixInto(m.elements, A, 0); M3.fromArray(A);
    for (let k = 0; k < 3; k++) { const v = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(); worst = Math.max(worst, v.clone().applyMatrix3(N).normalize().distanceTo(v.clone().applyMatrix3(M3).normalize())); }
  }
  ok(worst < 1e-5, `render health: the Horde's cofactor normal matrix turns normals like getNormalMatrix (3000 transforms incl. mirrored and sheared; worst ${worst.toExponential(1)})`);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 1.1, -0.2)), flat = new THREE.Matrix4().compose(new THREE.Vector3(1, 2, 3), q, new THREE.Vector3(1.6, 0, 1.6));
  const okFlat = normalMatrixInto(flat.elements, A, 0), up = new THREE.Vector3(0, 1, 0).applyMatrix3(M3.fromArray(A)).normalize();
  ok(okFlat && A.every(Number.isFinite) && up.dot(new THREE.Vector3(0, 1, 0).applyQuaternion(q)) > 0.9999 && new THREE.Matrix3().getNormalMatrix(flat).elements.every(v => v === 0), 'render health: a part squashed flat keeps a finite normal matrix (its normals along the squashed axis), where getNormalMatrix gives all zeros');
  ok(!normalMatrixInto(new THREE.Matrix4().makeScale(1, 0, 0).elements, A, 0) && A.every(Number.isFinite), 'render health: a transform collapsed to a line reports nothing to draw (the Horde hides that instance)');
  // a fin whose front and back share vertices (normals cancel to zero) and a zero-area sliver
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 0, 0, 2, 0, 0, 2, 0, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(27).fill(0), 3));
  const fixed = repairNormals(g), Nn = g.attributes.normal;
  const n = i => new THREE.Vector3(Nn.getX(i), Nn.getY(i), Nn.getZ(i));
  ok(fixed === 9 && Math.abs(n(0).z - 1) < 1e-6 && Math.abs(n(3).z + 1) < 1e-6 && n(6).y === 1 && [...Nn.array].every(Number.isFinite), 'render health: repairNormals gives each zero normal its own face normal (front +z, back −z) and a degenerate sliver straight up');
  const box = new THREE.BoxGeometry(1, 1, 1), card = new THREE.PlaneGeometry(1, 1); card.attributes.normal.array.fill(0);
  const merged = merge([box, card]), MN = merged.attributes.normal; let zeros = 0;
  for (let i = 0; i < MN.count; i++) if (MN.getX(i) ** 2 + MN.getY(i) ** 2 + MN.getZ(i) ** 2 < 1e-12) zeros++;
  ok(zeros === 0, 'render health: geom.merge() never returns a zero vertex normal (the building / prop kit merges through it)');
}

hr('CONTROLS: THE ACTION LAYER (docs/CONTROLS.md §1, core/actions.js)');
{
  const { Actions, ACTIONS } = await import('../src/core/actions.js');
  const { Input } = await import('../src/core/input.js');
  const A = Actions;
  // the defaults are the old raw keys
  const want = { attack: 'LMB', skillAlt: 'RMB', skill1: '1', skill2: '2', skill3: '3', skill4: '4', roll: 'Space', sprint: 'Shift', attackInPlace: 'Alt', interact: 'F', potionHeart: 'Q', potionZoom: 'E', potionR: 'R', meal: 'G', swap: 'X', hero: 'Tab', lootLabels: 'Z', home: 'T', inventory: 'I', pantry: 'P', character: 'C', skills: 'K', quests: 'J', map: 'M', build: 'B', menu: 'Esc' };
  ok(Object.entries(want).every(([a, k]) => A.label(a, 'kbm') === k), 'controls: every keyboard binding is the old key (LMB, RMB, 1-4, Space, Shift, Alt, F, Q, E, R, G, X, Tab, Z, T, I, P, C, K, J, M, B, Esc)');
  const padWant = { attack: 'A', skillAlt: 'X', skill1: 'Y', skill2: 'RB', skill3: 'RT', skill4: 'LT', roll: 'B', sprint: 'L3', hero: 'LB', interact: 'DDown', potionHeart: 'DLeft', potionZoom: 'DRight', meal: 'DUp', map: 'View', menu: 'Menu', swap: 'L3+R3' };
  ok(Object.entries(padWant).every(([a, t]) => A.binds(a, 'pad')[0] === t), 'controls: the console-ARPG pad mapping (A attack, X / Y / RB / RT / LT skills, B roll, L3 sprint, LB hero, the D-pad, View, Menu, L3+R3 swap)');
  // keys → the move vector (unit, exactly the old WASD direction) and held / pressed through Input
  Input.keys.add('w'); Input.keys.add('d'); const m = A.move();
  ok(Math.abs(m.x - Math.SQRT1_2) < 1e-9 && Math.abs(m.y - Math.SQRT1_2) < 1e-9 && m.mag === 1 && !m.pad, 'controls: W+D move diagonally at full speed (a unit vector, as before)');
  Input.keys.clear();
  Input.keys.add('1'); Input.pressed.add('1');
  ok(A.held('skill1') && A.pressed('skill1') && A.held('skill1', 'kbm') && !A.held('skill1', 'pad'), 'controls: a held key reads as its action (any device and the keyboard; not the pad)');
  A.consume('skill1'); ok(!A.pressed('skill1') && A.held('skill1'), 'controls: consume() takes the press, the hold stays');
  Input.keys.clear(); Input.pressed.clear();
  // the pad, polled from a stub
  const pad = { id: 'Xbox Wireless Controller', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  const gp0 = navigator.getGamepads; navigator.getGamepads = () => [pad];
  const poll = () => { A._t = performance.now() - 16; A.poll(); };
  poll(); ok(A.device === 'kbm', 'controls: an idle pad leaves the keyboard the active device');
  pad.axes = [0.1, -0.12, 0, 0]; poll(); ok(A.move().mag === 0 && A.device === 'kbm', "controls: the left stick's dead zone (a small drift moves nothing, switches nothing)");
  const mags = [0.3, 0.5, 0.7, 0.9, 1].map(v => { pad.axes = [0, -v, 0, 0]; poll(); return A.move().mag; });
  ok(mags.every((v, i) => i === 0 || v > mags[i - 1]) && mags[0] > 0.1 && mags[0] < 0.3 && mags[4] === 1 && A.move().y === 1 && A.device === 'pad', `controls: the response curve rises with the tilt to full speed, up = forward, and a push makes the pad active (${mags.map(v => v.toFixed(2)).join(' ')})`);
  pad.axes = [0, 0, 0, 0]; pad.buttons[0].pressed = true; pad.buttons[0].value = 1; poll();
  ok(A.pressed('attack') && A.held('attack', 'pad') && !A.held('attack', 'kbm'), 'controls: A pressed and held reads as attack on the pad');
  A.consume('interact'); ok(!A.pressed('attack', 'pad') && A.held('attack'), "controls: consuming interact takes the pad's A press too (A is the context interact)");
  poll(); ok(!A.pressed('attack') && A.held('attack') && A.heldTime('attack') > 0, 'controls: a press is one frame; the hold time grows');
  pad.buttons[0].pressed = false; pad.buttons[0].value = 0; poll(); ok(A.released('attack') && !A.held('attack'), 'controls: letting go reads as released');
  pad.buttons[7].value = 0.3; poll(); const t1 = A.held('skill3'); pad.buttons[7].value = 0.4; poll(); const t2 = A.held('skill3'); pad.buttons[7].value = 0.25; poll(); const t3 = A.held('skill3'); pad.buttons[7].value = 0.1; poll(); const t4 = A.held('skill3');
  ok(!t1 && t2 && t3 && !t4, 'controls: an analogue trigger presses past 0.35 and lets go under 0.22 (hysteresis)');
  pad.buttons[10].pressed = true; pad.buttons[11].pressed = true; poll(); ok(A.pressed('swap') && A.held('sprint', 'pad'), 'controls: L3 + R3 together read as the swap chord');
  pad.buttons[10].pressed = false; pad.buttons[11].pressed = false; poll();
  // names, text, rebinding
  A.setDevice('pad');
  ok(A.text('interact') === 'A' && A.text('interactAlt') === 'D-pad ▼' && A.text('skills') === 'Menu' && A.resolve('Press {potionHeart} now') === 'Press D-pad ◀ now' && A.resolve('Face water and press F to fish.') === 'Face water and press A to fish.' && A.resolve('Press K to learn') === 'Press Menu to learn', "controls: text names the pad's buttons ({tokens}, \"press F\" → A, a panel → Menu)");
  A.setDevice('kbm');
  ok(A.resolve('Press {roll} to roll') === 'Press Space to roll' && A.resolve('Press F to fish.') === 'Press F to fish.', 'controls: on the keyboard old text is left alone and {tokens} name the keys');
  // touch (CT-5, docs/CONTROLS.md §12): the third device
  {
    const { Touch } = await import('../src/core/touch.js');
    const tp = () => { A._t = performance.now() - 16; A.poll(); };
    A.setDevice('touch');
    Touch.hold('skill2'); tp();
    ok(A.pressed('skill2') && A.held('skill2') && A.held('skill2', 'touch') && !A.held('skill2', 'pad') && !A.held('skill2', 'kbm'), 'controls: touch: a touch button held reads as its action (pressed on the first frame)');
    tp(); ok(!A.pressed('skill2') && A.held('skill2') && A.heldTime('skill2') > 0, 'controls: touch: a press is one frame; the hold time grows');
    Touch.release('skill2'); tp(); ok(A.released('skill2') && !A.held('skill2'), 'controls: touch: letting go reads as released');
    Touch.pulse('roll'); tp(); const p1 = A.pressed('roll') && A.held('roll'); tp(); ok(p1 && !A.held('roll') && A.released('roll'), 'controls: touch: a pulse is held for one frame');
    Touch.hold('attack'); tp(); A.consume('interact'); ok(!A.pressed('attack', 'touch') && A.held('attack'), "controls: touch: consuming interact takes the attack button's press (its context interact)"); Touch.release('attack'); tp();
    Object.assign(Touch.stick, { on: true, x: 0, y: 1, mag: 0.5 }); const tm = { ...A.move() }; Touch.stick.on = false;
    ok(tm.y === 1 && tm.mag === 0.5 && tm.pad, 'controls: touch: the stick is the move vector (analogue)');
    Object.assign(Touch.aim, { on: true, x: 1, y: 0, mag: 0.8 }); const ta = { ...A.aim() }; Touch.aim.on = false;
    ok(ta.x === 1 && ta.mag === 0.8, 'controls: touch: a drag off a skill is the aim (as the right stick)');
    ok(A.text('roll') === 'the roll button' && A.resolve('Ouch! Press Q to munch a Heart Treat.') === 'Ouch! Tap the heart potion to munch a Heart Treat.' && A.resolve('Tap Tab for the next hero · hold Tab to pick') === 'Tap the hero button for the next hero · hold the hero button to pick', 'controls: touch: text names the on-screen controls ("Press Q" → "Tap the heart potion")');
    Touch.hold('skill1'); A.setDevice('kbm'); ok(!Touch.down.size && !Touch.stick.on, 'controls: another device lets every touch button go');
    tp();
  }
  const r0 = A.forKey('R'); A.isBuilding = () => true; const rB = A.forKey('R'); A.isBuilding = () => false;
  ok(r0 === 'potionR' && rB === 'rotate' && A.forKey('Tab') === 'hero', 'controls: R in text is the Rejuv potion, or Rotate while building; Tab is the hero button');
  const r1 = A.rebind('skill1', 'pad', 'RB');
  ok(r1?.swapped === 'skill2' && A.binds('skill1', 'pad')[0] === 'RB' && A.binds('skill2', 'pad')[0] === 'Y', 'controls: rebinding Skill 1 to RB swaps Skill 2 onto Y');
  ok(A.rebind('attack', 'kbm', 'h') === null && A.rebind('menu', 'pad', 'Y') === null && A.rebind('move', 'kbm', 'h') === null, 'controls: LMB attack, Esc / Menu and the sticks are fixed');
  const r2 = A.rebind('interact', 'pad', 'DDown'); ok(!r2?.swapped && A.binds('lootLabels', 'pad')[0] === 'DDown', 'controls: interact and the loot labels may share D-pad ▼');
  A.rebind('skill1', 'pad', 'Y'); ok(!Object.keys(A.over.pad).length, 'controls: binding back to the defaults leaves no overrides');
  A.rebind('potionHeart', 'kbm', 'h'); ok(A.isKey('potionHeart', 'h') && !A.isKey('potionHeart', 'q'), "controls: a keyboard rebind moves the action's key");
  A.resetBindings(); ok(A.label('potionHeart', 'kbm') === 'Q' && !Object.keys(A.over.kbm).length, 'controls: reset restores the defaults');
  ok(Object.values(ACTIONS).every(x => x.label && x.group && Array.isArray(x.kbm) && Array.isArray(x.pad)), 'controls: every action has a label, a group and both bindings');
  navigator.getGamepads = gp0; A.axes.fill(0); A.cur.clear(); A.prev.clear(); A.setDevice('kbm');
}

hr('CONTROLS: THE STEAM DECK PROFILE (docs/CONTROLS.md §10, core/deck.js)');
{
  const D = await import('../src/core/deck.js');
  const Q = q => D.bootGraphics(new URLSearchParams(q));
  const d3 = Q('q=3'), d0 = Q('q=0');
  ok(d3.preset === 3 && d3.quality === 1 && d3.deck && d0.preset === 0 && d0.quality === 0 && !d0.deck && Q('q=4').preset === 4 && Q('q=4').quality === 0 && !Q('q=4').deck && Q('q=9').preset === 4 && Q('q=x').preset === 2, 'deck: ?q= picks the preset (3: the Deck, built at Medium density; 4: Mobile, built at Low; clamped; junk is High)');
  const ls0 = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), store = { 'chewy3d.settings': JSON.stringify({ quality: 1 }) };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: { getItem: k => store[k] ?? null } });
  const s1 = Q(''), sq = Q('q=2'); delete store['chewy3d.settings']; const s0 = Q('');
  if (ls0) Object.defineProperty(globalThis, 'localStorage', ls0); else delete globalThis.localStorage;
  ok(s1.preset === 1 && s1.quality === 1 && sq.preset === 2 && s0.preset === 2, 'deck: R-2, the saved Graphics preset applies at boot; ?q= wins; nothing saved off a Deck screen is High');
  const dpr0 = globalThis.devicePixelRatio; globalThis.devicePixelRatio = 2;
  ok(D.pixelRatioFor(2) === 1.5 && D.pixelRatioFor(1) === 1 && D.pixelRatioFor(0) === 1 && D.pixelRatioFor(3) === 0.85 && D.pixelRatioFor(4) === 1, 'deck: the pixel ratio (High up to 1.5, Medium and Low 1, the Deck 0.85, Mobile 1)');
  globalThis.devicePixelRatio = dpr0;
  ok(!D.deckLike() && !D.mobileLike() && D.FPS_CAPS.join() === '0,60,40,30' && D.PRESET_NAMES.join() === 'Low,Medium,High,Deck,Mobile' && D.DECK.uiScale === 1.15 && D.DECK.shadowMap <= 2048 && D.MOBILE.pixelRatio === 1 && D.MOBILE.shadowMap === 1024 && D.MOBILE.particles === 0.5 && D.liteOf(4) === D.MOBILE && D.liteOf(3) === D.DECK && D.liteOf(2) === null && D.MOBILE_TEX === 1024 && D.capTexture(null, 1024) === null, 'deck: no screen is not a Deck or a phone; the frame caps, the preset names, the Deck and Mobile numbers');
}

hr('CONTROLS: AUTO TARGETING (docs/CONTROLS.md §13, combat/autoTarget.js)');
{
  const AT = await import('../src/combat/autoTarget.js');
  const { scoreFoe: S, bestCluster, bestLine, bestCone, aimSpec, AIM, AIM_KINDS, TARGETING: TG } = AT;
  // the lock's score (lower wins)
  ok(S({ d: 3 }) < S({ d: 5 }) && S({ d: 4, cos: 1 }) < S({ d: 4, cos: -1 }) && S({ d: 4, cos: -1 }) < S({ d: 4.6, cos: 1 }), 'autotarget: nearer wins; the facing only breaks ties (a foe behind at 4 m beats one ahead at 4.6 m)');
  ok(S({ d: 5, lock: true }) < S({ d: 4.2 }) && S({ d: 7, lock: true }) > S({ d: 3 }), 'autotarget: sticky: the current lock holds against a slightly nearer foe, not a much nearer one');
  ok(S({ d: 2.6, threat: true }) < S({ d: 2 }), 'autotarget: a foe hitting you outranks a slightly nearer idle one');
  ok(S({ d: 4, elite: true }) < S({ d: 3.7 }) && S({ d: 2, threat: true }) < S({ d: 4, elite: true }) && S({ d: 2.5 }) < S({ d: 4, elite: true }), 'autotarget: elites and bosses get a small bias only: an add hitting you at 2 m (or idle at 2.5 m) beats a boss at 4 m');
  ok(S({ d: 2, warded: true }) > S({ d: 5 }) && S({ d: 3, sight: false }) > S({ d: 5 }) && S({ d: 3, sight: true }) === S({ d: 3 }), 'autotarget: a warded captain and a foe behind a wall score worse than an open foe further off');
  // clusters: the big group over the lone foe (even the lock), the range, the members' middle
  const lone = { x: 3, z: 0, r: 0.4, w: AT.foeWeight(true, false, false) }, grp = [0, 1, 2, 3, 4].map(i => ({ x: 8 + Math.cos(i * 1.3) * 0.9, z: 4 + Math.sin(i * 1.3) * 0.9, r: 0.4, w: 1 }));
  const c1 = bestCluster([lone, ...grp], 2.5, { ox: 0, oz: 0, range: 14, lock: lone });
  ok(c1 && c1.n === 5 && Math.hypot(c1.x - 8, c1.z - 4) < 1.2, `autotarget: a ground skill lands on the group of 5, not the lone locked foe (${c1 && [c1.x.toFixed(2), c1.z.toFixed(2), c1.n]})`);
  const far = grp.map(q => ({ ...q, x: q.x + 4.5 })), c2 = bestCluster(far, 2.5, { ox: 0, oz: 0, range: 12 }); // (the group 13 m off, a 12 m skill)
  ok(c2 && Math.hypot(c2.x, c2.z) <= 12 + 1e-6 && c2.n >= 3, 'autotarget: the cluster centre stays within the skill\'s range (on its edge, still covering most of a group just past it)');
  const row = [{ x: 5, z: -1.8, r: 0.3 }, { x: 5, z: 0, r: 0.3 }, { x: 5, z: 1.8, r: 0.3 }], c3 = bestCluster(row, 2.2, { ox: 0, oz: 0, range: 12 });
  ok(c3 && c3.n === 3 && Math.abs(c3.z) < 0.3, 'autotarget: the centre is nudged to the middle of its members (a row of 3 all inside)');
  const two = [{ x: 4, z: 0, r: 0.3 }, { x: 4.6, z: 0.4, r: 0.3 }, { x: -4, z: 0, r: 0.3, w: AT.foeWeight(true) }, { x: -4.6, z: 0.4, r: 0.3 }], c4 = bestCluster(two, 1.5, { ox: 0, oz: 0, range: 10 });
  ok(c4 && c4.x < 0, 'autotarget: between two equal pairs, the one with the lock');
  const c5 = bestCluster([...grp, lone], 2.5, { ox: 0, oz: 0, range: 14, near: { x: 3.4, z: 0.2, r: 1.5 } });
  ok(c5 && Math.hypot(c5.x - 3.4, c5.z - 0.2) <= 1.5 + 1e-6 && c5.n === 1, "autotarget: Assist's snap: the cluster within 1.5 m of the cursor, not the bigger group elsewhere");
  ok(bestCluster([], 2, {}) === null && bestLine([], {}) === null && bestCone([], {}) === null, 'autotarget: no foes, no pick');
  // lines and cones
  const east = [3, 5, 7, 9].map(x => ({ x, z: 0.2, r: 0.3 })), north = [{ x: 0, z: 4, r: 0.3 }, { x: 0.2, z: 6, r: 0.3 }];
  const l1 = bestLine([...north, ...east], { ox: 0, oz: 0, length: 12, width: 1 });
  ok(l1 && l1.n === 4 && l1.dx > 0.95, 'autotarget: a line goes through the row of 4, not the pair');
  const near2 = [{ x: 0, z: 3, r: 0.3 }, { x: 0.2, z: 3.8, r: 0.3 }], l2 = bestLine([...near2, ...east], { ox: 0, oz: 0, length: 4, width: 1 });
  ok(l2 && l2.n === 2 && l2.dz > 0.9, 'autotarget: a short line only counts what it reaches (the close pair north, not the long row east)');
  const fan = [{ x: 4, z: 1, r: 0.3 }, { x: 4, z: -1, r: 0.3 }, { x: 5, z: 0, r: 0.3 }, { x: -4, z: 0, r: 0.3 }], k1 = bestCone(fan, { ox: 0, oz: 0, range: 8, half: 0.5 });
  ok(k1 && k1.n === 3 && k1.dx > 0.9, 'autotarget: a fan covers the three ahead, not the one behind');
  // the aim table: every active skill of every hero, a known kind, finite numbers
  const act = SKILL_IDS.filter(id => !['passive', 'aura'].includes(SKILLS[id].kind));
  const miss = act.filter(id => !AIM[id] || !AIM_KINDS.includes(AIM[id].kind)), extra = Object.keys(AIM).filter(id => !SKILLS[id]);
  ok(!miss.length && !extra.length, `autotarget: the aim table covers every active skill (${act.length}) with a known kind${miss.length ? '; missing ' + miss.join(',') : ''}${extra.length ? '; unknown ' + extra.join(',') : ''}`);
  const bad = act.filter(id => { const d = SKILLS[id], s = aimSpec(id, { params: d.params(5, { weaponType: d.wep, lifeMax: 100, synergy: {} }) }); return !(s.range > 0 && s.radius > 0 && s.width > 0 && s.half > 0) || (s.kind === 'dash' && !s.idle); });
  ok(!bad.length, `autotarget: every skill's aim resolves to finite ranges, radii and widths; every dash has its idle form${bad.length ? ': ' + bad.join(',') : ''}`);
  const atk = w => aimSpec('attack', skillRuntime('attack', { player: { skills: {} } }, { weaponType: w })).kind;
  ok(atk('sword') === 'melee' && atk('flail') === 'melee' && atk('lance') === 'melee' && atk('fuma') === 'melee' && atk('ball') === 'target' && atk('staff') === 'target', 'autotarget: the basic attack: melee with a katana, flail, lance or fūma; a target with the ball or the staff');
  ok(['dig', 'sunfallJump', 'heaviestSigh'].every(id => AIM[id].kind === 'leap') && ['zoom', 'puddleHop', 'afterimageDash', 'gallantCharge', 'substitution', 'caltropFlip'].every(id => AIM[id].kind === 'dash'), 'autotarget: attack-leaps always go at the cluster; the movement dashes are escape-first');
  ok(['meteor', 'fetchstorm', 'pawRune', 'whirlpool', 'starfallLance', 'grumbleCloud', 'shurikenRain'].every(id => AIM[id].kind === 'ground') && ['greatWave', 'tugOfWoe', 'smokeDragon', 'trueFlight'].every(id => AIM[id].kind === 'line') && ['multi', 'feathers', 'kunaiFan', 'tailwagVolley'].every(id => AIM[id].kind === 'cone'), 'autotarget: the ground AoEs, the lines and the fans are classed as such');
  // the setting: per device, its defaults and the migration
  ok(AT.targetingOf({}, 'kbm') === TG.ASSIST && AT.targetingOf({}, 'pad') === TG.AUTO && AT.targetingOf({}, 'touch') === TG.AUTO, 'autotarget: the defaults: Assist with the mouse, Auto on the pad and on touch');
  ok(AT.targetingOf({ touchAim: 1 }, 'touch') === TG.OFF && AT.targetingOf({ touchAim: 0 }, 'touch') === TG.AUTO && AT.targetingOf({ aimAssist: 0 }, 'pad') === TG.OFF && AT.targetingOf({ aimAssist: 0.7 }, 'pad') === TG.AUTO, "autotarget: the migration: the old touch Drag is Off, its Auto Auto; Aim assist 0 makes the pad Off");
  ok(AT.targetingOf({ targetTouch: 1, touchAim: 1 }, 'touch') === TG.ASSIST && AT.targetingOf({ targetKbm: 2 }, 'kbm') === TG.AUTO && AT.targetingOf({ targetPad: 0 }, 'pad') === TG.OFF, 'autotarget: a saved choice wins over the old settings');
  const mg = AT.migrateTargeting({ targetPad: 1, touchAim: 1 });
  ok(mg.targetPad === undefined && mg.targetTouch === TG.OFF && mg.targetKbm === TG.ASSIST, 'autotarget: migrateTargeting fills only the missing keys');
  ok([0, 1, 2].every(v => ['kbm', 'pad', 'touch'].every(d => AT.targetingHint(d, v).length > 20)), 'autotarget: every device and choice has its line under the Targeting row');
  // the words (checkpoint 2): a skill's "cursor" in the words of the device and its Targeting
  const W = (id, dev, mode, o = {}) => AT.aimWords(SKILLS[id]?.desc || o.text, id, { dev, mode, ...o });
  ok(W('dig', 'kbm', TG.ASSIST) === SKILLS.dig.desc && W('dig', 'kbm', TG.OFF) === SKILLS.dig.desc, 'autotarget words: the mouse in Assist or Off keeps "the cursor"');
  ok(/toward the biggest group/.test(W('dig', 'pad', TG.AUTO)) && /toward the biggest group/.test(W('dig', 'kbm', TG.AUTO)) && /after the biggest group/.test(W('moonbeam', 'touch', TG.AUTO)), 'autotarget words: in Auto a leap and a ground skill go at "the biggest group"');
  ok(/away from your target/.test(W('substitution', 'pad', TG.AUTO)) && /where you're heading/.test(W('puddleHop', 'touch', TG.AUTO)), "autotarget words: a dash in Auto goes where you're heading (Substitution: or away from your target)");
  ok(/your aim/.test(W('dig', 'pad', TG.ASSIST)) && /your aim/.test(W('substitution', 'touch', TG.OFF)), 'autotarget words: the pad and touch in Assist or Off say "your aim"');
  ok(AT.aimWords('The spin-out drifts after your cursor at 2.5 m/s.', 'whirlpool', { dev: 'pad', mode: TG.AUTO, kind: 'target' }) === 'The spin-out drifts after your target at 2.5 m/s.', 'autotarget words: a charge perk\'s drift follows your target');
  ok(Object.keys(SKILLS).every(id => !/cursor/.test(AT.aimWords(SKILLS[id].desc || '', id, { dev: 'pad', mode: TG.AUTO }))), 'autotarget words: no skill says "cursor" on the pad in Auto');
  ok(AT.aimLine('whirl', { dev: 'pad', mode: TG.AUTO }) === '' && /biggest group/.test(AT.aimLine('meteor', { dev: 'pad', mode: TG.AUTO })) && /drag off/.test(AT.aimLine('meteor', { dev: 'touch', mode: TG.OFF })) && AT.aimLine('meteor', { dev: 'kbm', mode: TG.OFF }) === '', 'autotarget words: the tooltip line (none for a self skill, none with the mouse in Off)');
  // the AoE marker by a drop: draped on the ground, faded where the ground drops, rises or is not walkable
  {
    const m = { geometry: AT.markerGeometry(), userData: {} }, W = { heightAt: (x, z) => x > 1.5 ? -3 : z > 1.5 ? 0.25 * (z - 1.5) : 0, walkable: (x, z) => !(x < -2) };
    AT.drapeMarker(m, W, 0, 0, 0, 3, 0);
    const P = m.geometry.attributes.position.array, C = m.geometry.attributes.color.array, n = P.length / 3, v = [];
    for (let i = 0; i < n; i++) v.push({ x: P[i * 3], y: P[i * 3 + 1], z: P[i * 3 + 2], a: C[i * 4 + 3] });
    const drop = v.filter(q => q.x > 1.6), wall = v.filter(q => q.x < -2.1), flat = v.filter(q => Math.abs(q.x) < 1.4 && q.z < 1.4), slope = v.filter(q => q.z > 2.2 && Math.abs(q.x) < 1.4);
    ok(drop.length && drop.every(q => q.a === 0 && q.y === 0) && wall.length && wall.every(q => q.a === 0) && flat.every(q => q.a === 1 && q.y === 0), 'autotarget marker: over a 3 m drop and off walkable ground its edge fades out (and stays level); on flat ground it is whole');
    ok(slope.length && slope.every(q => q.a > 0 && Math.abs(q.y - 0.25 * (q.z - 1.5)) < 1e-6), 'autotarget marker: on a gentle slope it lies on the ground (draped, not floating)');
    const key = m.userData.key; AT.drapeMarker(m, W, 0.01, 0, 0, 3, 1); ok(m.userData.key === key, 'autotarget marker: the heights are sampled again only when the centre moves (the spin only turns the UVs)');
  }
}

hr('DEBUG TOOLS: THE REGISTRY AND THE PASSWORD (docs/DEBUG.md, src/debug/registry.js)');
{
  const R = await import('../src/debug/registry.js');
  const { DEBUG_PASS: PW, skipNote } = await import('./qa/debug-pass.mjs'); // (the repo is public: the word comes from the env or a git-ignored file)
  if (PW) ok(await R.checkPassword(PW) && await R.checkPassword(`  ${PW} `) && !(await R.checkPassword(PW.toUpperCase())) && !(await R.checkPassword('')), 'debug: the password matches its SHA-256 (trimmed, case kept); others are refused');
  else skipNote('debug: the password matches its SHA-256');
  ok(!(await R.checkPassword('not-the-password')) && !(await R.checkPassword('')), 'debug: a wrong password is refused');
  const real = globalThis.crypto; Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
  const jsA = await R.sha256Hex('pawhaven test'), e0 = await R.sha256Hex(''), jsP = PW ? await R.sha256Hex(PW) : null;
  Object.defineProperty(globalThis, 'crypto', { value: real, configurable: true });
  ok(jsA === await R.sha256Hex('pawhaven test') && e0 === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' && (!PW || jsP === R.PASS_HASH), 'debug: the JS SHA-256 fallback (no Web Crypto, e.g. a LAN dev server) gives the same hashes');
  if (PW) {
    const fs = await import('node:fs'), src = ['access.js', 'registry.js', 'debugMenu.js', 'debugActions.js', 'debugToggles.js'].map(f => fs.readFileSync(new URL('../src/debug/' + f, import.meta.url), 'utf8')).join('');
    ok(!src.includes(PW), 'debug: no plaintext password in the source');
  }
  const v0 = R.registryVersion();
  R.registerDebug('qaTest', [{ label: 'One', run: () => 'a' }, { note: 'hi' }], { title: 'QA', order: 999 });
  R.registerDebug('qaTest', [{ label: 'One', run: () => 'b' }, { label: 'Two', choices: [1, 2], run: () => '' }]);
  const S = R.DEBUG_SECTIONS.get('qaTest');
  ok(S.title === 'QA' && S.actions.length === 3 && S.actions[0].run() === 'b' && R.registryVersion() === v0 + 2 && R.debugSections().at(-1) === S, 'debug: registerDebug adds to a section, replaces an action of the same label, keeps the order');
  R.DEBUG_SECTIONS.delete('qaTest');
}

hr('COZY: THE WORLD CLOCK, TIME AWAY, STATE, OBJECTIVES, EXPEDITIONS (docs/COZY.md, src/cozy)');
{
  const K = await import('../src/cozy/clock.js'), CS = await import('../src/cozy/state.js'), O = await import('../src/cozy/objectives.js'), X = await import('../src/cozy/expeditions.js');
  const Z = await import('../src/rpg/zones.js');
  const fresh = () => CS.normalizeCozy(Z.normalizeZones(normalizeHeroes(newGameState())));
  // ---- the clock
  { const st = fresh();
    ok(K.SECS_PER_HOUR === 35 && K.OFFLINE_CAP_H === 8, 'cozy clock: 35 real s per world hour (the day clock rate), an 8 h cap per absence');
    K.tickClock(st, 35); ok(Math.abs(st.cozy.clock.h - 1) < 1e-9, 'cozy clock: 35 s of play is one world hour');
    K.tickClock(st, 0); K.addHours(st, -5); K.addHours(st, NaN); ok(Math.abs(st.cozy.clock.h - 1) < 1e-9, 'cozy clock: only ever goes up (a paused dt of 0, negatives and NaN add nothing)');
    ok(K.worldDay(23.9) === 0 && K.worldDay(24) === 1 && K.worldDay(49) === 2, 'cozy clock: a world day is 24 world hours');
    ok(K.sleepHours(22) === 8.5 && K.sleepHours(2) === 4.5 && K.sleepHours(6.5) === 24 && K.sleepHours(13) === 17.5, 'cozy clock: sleep adds the hours to 6:30 the next morning');
    ok(K.aboutHours(6) === 'about 6 h' && K.aboutHours(2.6) === 'about 2½ h' && K.aboutHours(0.3) === 'under an hour' && K.backIn(0) === 'any minute now' && K.backIn(2) === 'back in about 2 h', "cozy clock: the board's words");
    ok(K.backBy(9, 6) === 'back by afternoon' && K.backBy(20, 10) === 'back by tomorrow morning', 'cozy clock: "back by …" from the village hour');
    ok(K.realSpan(3 * 3600e3 + 12 * 60e3) === '3 h 12 min' && K.realSpan(20e3) === 'a few seconds' && K.realSpan(4 * 60e3) === '4 min', "cozy clock: the away card's real time");
  }
  // ---- time away and the tamper guards (COZY §4.4.1)
  { const st = fresh(), T0 = 1.8e12;
    const a0 = K.catchUp(st, T0);
    ok(a0.first && a0.hours === 0 && st.cozy.clock.wall === T0 && st.cozy.clock.h === 0, 'time away: an old save (no mark) counts nothing and sets the mark');
    const a1 = K.catchUp(st, T0 + 70e3);
    ok(Math.abs(a1.hours - 2) < 1e-9 && !a1.capped && st.cozy.clock.wall === T0 + 70e3 && Math.abs(st.cozy.clock.h - 2) < 1e-9, 'time away: 70 s away = 2 world hours, the mark moves up');
    const a2 = K.catchUp(st, T0 + 70e3 + 86400e3);
    ok(a2.hours === 8 && a2.capped && Math.abs(st.cozy.clock.h - 10) < 1e-9, 'time away: a day away counts the cap (8 world hours)');
    const wall = st.cozy.clock.wall, a3 = K.catchUp(st, wall - 3600e3);
    ok(a3.hours === 0 && a3.backwards && st.cozy.clock.wall === wall && Math.abs(st.cozy.clock.h - 10) < 1e-9, 'time away: a clock set backwards counts 0 and the mark stays');
    const a4 = K.catchUp(st, wall + 365 * 86400e3), a5 = K.catchUp(st, wall + 60e3);
    ok(a4.hours === 8 && a5.hours === 0 && a5.backwards && st.cozy.clock.wall === wall + 365 * 86400e3 && Math.abs(st.cozy.clock.h - 18) < 1e-9, 'time away: a clock set far forwards gives only the cap, and setting it back afterwards gives nothing');
    const a6 = K.catchUp(st, wall + 365 * 86400e3 + 3e3);
    ok(a6.hours > 0 && a6.hours < 0.1, 'time away: a quick reload counts only seconds');
    ok(K.awayHours(st, wall + 365 * 86400e3 + 38e3).hours > 0.9 && st.cozy.clock.wall === wall + 365 * 86400e3 + 3e3, 'time away: awayHours only measures (no change)');
  }
  // ---- state.cozy: lazy, idempotent, migrates old saves (COZY §9)
  { const old = normalizeHeroes(newGameState()); delete old.cozy;
    const st = CS.normalizeCozy(old), j1 = JSON.stringify(st.cozy);
    ok(st.cozy.v === CS.COZY_V && st.cozy.clock.h === 0 && st.cozy.clock.wall === 0 && Array.isArray(st.cozy.exp.active) && st.cozy.exp.errands.day === -1 && st.cozy.sightings.day === -1, 'cozy state: an old save gets an empty cozy state (no mark: 0 hours away on its first load)');
    CS.normalizeCozy(st); ok(JSON.stringify(st.cozy) === j1, 'cozy state: normalizeCozy is idempotent');
    const bad = { cozy: { clock: { h: -4, wall: 'x' }, exp: { active: [{ uid: 'x1', obj: 'errand:0:home:drift', crew: ['hero:moka', 'nope', 7], start: 2, hours: 2 }, { uid: 'x1', obj: 'dup', crew: ['hero:poe'] }, { obj: 'no uid' }, { uid: 'x9', obj: 'o', crew: [] }], reports: [{ uid: 'r', result: 'success' }, { uid: 's', result: 'weird' }], done: { a: '3', b: -2 }, tired: { 'hero:moka': 5, nonsense: 9, 'hero:poe': -1 }, seq: 0 } } };
    CS.normalizeCozy(bad); const E = bad.cozy.exp;
    ok(bad.cozy.clock.h === 0 && bad.cozy.clock.wall === 0 && E.active.length === 1 && E.active[0].crew.join() === 'hero:moka' && E.reports.length === 1 && E.done.b === 0 && E.tired['hero:moka'] === 5 && !('nonsense' in E.tired) && !('hero:poe' in E.tired) && E.seq === 1, 'cozy state: a broken cozy state is type-checked (bad crews, duplicate uids, odd results and timers dropped)');
    ok(JSON.stringify(saveableState(st)).includes('"cozy"'), 'cozy state: saved with the household');
    ok(CS.parseMember('hero:moka')?.id === 'moka' && CS.parseMember('hire:h3')?.type === 'hire' && !CS.parseMember('pet:x') && !CS.parseMember(''), 'cozy state: crew member keys are hero: or hire: (hire-ready)');
  }
  // ---- the zone records: savedBy, celebrate, dungeon.crew (rpg/zones.js)
  { const st = Z.normalizeZones({ zones: { bamboo: { village: 'saved' }, maple: { village: 'besieged', savedBy: 'crew', celebrate: true } } });
    ok(st.zones.bamboo.savedBy === 'hero' && st.zones.bamboo.celebrate === false && st.zones.maple.savedBy === null && st.zones.maple.celebrate === false && st.zones.bamboo.dungeon.crew === 0, 'zones: an old saved village counts as saved by a hero; besieged ones have no savedBy; dungeon.crew 0');
    ok(Z.saveVillage(st, 'maple', 'crew') && st.zones.maple.savedBy === 'crew' && Z.zoneOf(st, 'maple').savedBy === 'crew' && !Z.saveVillage(st, 'maple', 'hero') && st.zones.maple.savedBy === 'crew', 'zones: saveVillage(…, "crew") records the crew, and only the first save counts');
  }
  // ---- objectives (COZY §3.2, §4.2, §4.7)
  { const st = fresh();
    const ids0 = O.errandIds('home', 5), ids1 = O.errandIds('home', 5);
    ok(ids0.length === 3 && ids0.join() === ids1.join() && new Set(ids0).size === 3 && O.errandIds('burrow', 5).length === 3, 'errands: 3 a day per area, the same all day (seeded by the world day)');
    let differ = 0; for (let d = 0; d < 20; d++) if (O.errandIds('home', d).join() !== O.errandIds('home', d + 1).join()) differ++;
    ok(differ >= 12, 'errands: they re-roll with the world day');
    ok(O.openAreas(st).join() === 'home,burrow' && O.errandsFor(st, 3).length === 6, 'errands: Blossom Hollow and the Burrow from day 1');
    Z.saveVillage(st, 'bamboo'); ok(O.openAreas(st).includes('bamboo') && O.errandsFor(st, 3).length === 9, 'errands: a saved zone opens its errands');
    const e = O.objective(st, O.errandIds('burrow', 2)[0]);
    ok(e && e.kind === 'errand' && e.level === 4 && e.power === 24 && [2, 3].includes(e.hours) && e.gates.length === 0 && e.supplies.mealSure && e.rewards.kills === 15 && e.rewards.find === 0.08, 'errands: power 6 × level, 2–3 h, no gates, lunches make them a sure thing, ~15 kills of XP, a find at 8%');
    ok(O.objective(st, 'errand:99:home:drift')?.name && !O.objective(st, 'errand:1:home:nope') && !O.objective(st, 'relief:nowhere') && !O.objective(st, 'banana'), "objectives: any day's errand rebuilds from its id; unknown ones are null");
    const st2 = fresh(), R = O.objective(st2, 'relief:bamboo');
    ok(R && R.kind === 'siege' && R.level === 6 && R.power === 84 && R.hours === 6 && R.binds.village === 'bamboo' && R.supplies.meals === 1 && R.rewards.items.join() === 'magic,rare' && R.rewards.kills > 40, 'relief: Takemori is level 6 (the band + 2), power 84, 6 h, a lunch each, a magic and a rare');
    ok(O.storyObjectives(st2).length === 0, 'relief: not offered while Bamboo is closed');
    st2.heroes.moka.player.lvl = 4; st2.flags.mokaJoined = true;
    ok(O.storyObjectives(st2).map(o => o.id).join() === 'relief:bamboo', "relief: offered once Bamboo opens (a crew's levels count: any hero at level 4)");
    ok(O.objectivePower(st2, R) === 84 && O.campsStanding(st2, 'bamboo') === 3, 'relief: all three camps standing → the full 84');
    const Zb = Z.zoneOf(st2, 'bamboo'); Zb.siegeCamps = [{ id: 'west', cleared: true }, { id: 'east', cleared: true }, { id: 'south', cleared: false }];
    ok(O.objectivePower(st2, R) === 42 && O.campsStanding(st2, 'bamboo') === 1, 'relief: each broken camp takes 25% off (the captain is the last 25%)');
    Z.saveVillage(st2, 'bamboo'); ok(!O.storyObjectives(st2).some(o => o.kind === 'siege') && !O.objectiveOpen(st2, R), 'relief: gone once the village is saved');
  }
  // ---- power, odds, gates (COZY §4.2)
  { const st = fresh(); st.flags.mokaJoined = st.flags.poeJoined = true;
    st.heroes.moka.player.lvl = 6;
    const g0 = X.gearPoints(st.heroes.moka.equipment);
    ok(g0 === 1 && Math.abs(X.heroPower(st, 'moka') - 60 * 1.02) < 1e-9, 'power: 10 × level × (1 + 0.02 × gear points): Moka L6 with her starter staff = 61.2');
    ok(X.gearPoints({ weapon: { rarity: 'unique' }, hat: { rarity: 'rare' }, boots: { rarity: 'magic' }, paws: { rarity: 'set' } }) === 13, 'power: gear points normal 1, magic 2, rare 3, unique / set 4');
    ok(Math.abs(X.chance(0.6) - 1 / 6) < 1e-9 && Math.abs(X.chance(0.85) - 0.35 / 0.6) < 1e-9 && X.chance(1.1) === 1 && X.chance(0.4) === 0, 'odds: p = clamp((r − 0.5) / 0.6): r 0.6 → 17%, 0.85 → 58%, 1.1 → 100%');
    ok(X.oddsOf(0.59).key === 'nope' && X.oddsOf(0.6).key === 'risky' && X.oddsOf(0.85).key === 'good' && X.oddsOf(1.1).key === 'sure' && X.oddsOf(0.59).p === 0, 'odds: Too risky < 0.6 ≤ Risky < 0.85 ≤ Good odds < 1.1 ≤ Sure thing');
    const er = O.objective(st, 'errand:0:home:drift');
    ok(X.oddsOf(0.7, er, true).key === 'sure' && X.oddsOf(0.7, er, false).key === 'risky' && X.oddsOf(0.5, er, true).key === 'nope', 'odds: an errand with lunches packed is a sure thing (once it can be sent at all)');
    st.pantry = { cabbageRolls: 2, onigiri: 5 };
    const P2 = X.crewPower(st, ['hero:moka', 'hero:poe'], er, { meals: { cabbageRolls: 2 }, potions: 3 });
    ok(P2.fed && P2.potions === 3 && Math.abs(P2.mul - 1.19) < 1e-9 && Math.abs(P2.total - P2.base * 1.19) < 1e-9, 'power: fed (every lunch tier 2+) +10%, heart potions +3% each');
    ok(!X.crewPower(st, ['hero:moka', 'hero:poe'], er, { meals: { cabbageRolls: 1, onigiri: 1 } }).fed, 'power: a plain lunch for one of them: not fed');
    ok(JSON.stringify(X.pickMeals(st.pantry, 2)) === '{"cabbageRolls":2}' && JSON.stringify(X.pickMeals(st.pantry, 3)) === '{"onigiri":3}' && JSON.stringify(X.pickMeals({}, 2)) === '{}', 'supplies: lunches pick tier 2+ dishes when there are enough for everyone, else the plainest');
    const R = O.objective(st, 'relief:bamboo'), town = { rank: 1, pop: 5, built: {}, guild: 0 };
    ok(/Playing now/.test(X.canSend(st, R, ['hero:chewy'], {}, town).why), "canSend: the hero being played can't go");
    ok(/Not met yet/.test(X.canSend(st, R, ['hero:shihtzu'], {}, town).why), "canSend: a hero who hasn't joined can't go");
    ok(/lunch/.test(X.canSend(st, R, ['hero:moka'], {}, town).why) && X.canSend(st, R, ['hero:moka'], { meals: { onigiri: 1 } }, town).checks[0].ok, 'canSend: Takemori takes the Guild, a crew of 2, or one hero with packed lunches (the cozy route with only Moka benched)');
    ok(!X.gateCheck(R.gates[0], st, town, ['hero:moka'], {}).ok && X.gateCheck(R.gates[0], st, town, ['hero:moka', 'hero:poe'], {}).ok && X.gateCheck(R.gates[0], st, { guild: 1 }, ['hero:moka'], {}).ok, 'gates: the relief gate is data (any of: guild, crew of 2, lunches)');
    ok(/Pack 2 lunches/.test(X.canSend(st, R, ['hero:moka', 'hero:poe'], {}, town).why), 'canSend: a siege needs a lunch each');
    st.heroes.poe.player.lvl = 1; st.heroes.moka.player.lvl = 1;
    ok(/never make it/.test(X.canSend(st, R, ['hero:moka', 'hero:poe'], { meals: { onigiri: 2 } }, town).why), "canSend: below r 0.6 it's too risky to send");
    st.heroes.moka.player.lvl = 6; st.heroes.poe.player.lvl = 5;
    const c = X.canSend(st, R, ['hero:moka', 'hero:poe'], { meals: { onigiri: 2 } }, town);
    ok(c.ok && c.need === 84 && c.odds.key === 'sure' && c.checks.every(x => x.ok), 'canSend: Moka L6 + Poe L5 with lunches: a sure thing for Takemori');
    ok(!X.canSend(st, R, ['hero:moka', 'hero:poe', 'hero:chewy', 'hero:golden', 'hero:shihtzu'], {}, town).ok, 'canSend: at most 4 in a crew');
  }
  // ---- resolve, rewards, the trip (COZY §4.3, §4.6)
  { const st = fresh(), R = O.objective(st, 'relief:bamboo'), er = O.objective(st, 'errand:0:burrow:patrol'), seq = a => { let i = 0; return () => a[i++ % a.length]; };
    ok(X.resolve(1.0, seq([0.5]), R).result === 'success' && X.resolve(0.9, seq([0.9]), R).result === 'partial' && X.resolve(0.7, seq([0.9]), R).result === 'setback', 'resolve: a roll under p succeeds; a miss at r ≥ 0.75 is a partial, below a setback');
    ok(X.partialProgress(st, R, 0.8).camps === 1 && X.partialProgress(st, R, 1.0).camps === 2 && X.partialProgress(st, { kind: 'dungeon' }, 0.8).floor === 2, 'resolve: a partial siege breaks round(3r) − 1 camps (at least 1); a dungeon gets to floor 2');
    let s = 7; const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const L1 = X.rollLoot(R, 'success', rng), L2 = X.rollLoot(R, 'partial', rng), L3 = X.rollLoot(R, 'setback', rng), L4 = X.rollLoot(R, 'recalled', rng);
    const nm = L => Object.values(L.mats).reduce((a, b) => a + b, 0);
    ok(L1.items.map(i => i.rarity).join() === 'magic,rare' && L1.items.every(i => i.ilvl === 6) && nm(L1) >= 10 && nm(L1) <= 20 && L1.coins >= R.rewards.coins[0], 'rewards: a relief brings a magic and a rare, 10–20 materials, the coins');
    ok(L2.items.map(i => i.rarity).join() === 'rare' && nm(L2) <= 10 && L3.items.length === 0 && nm(L3) <= 7 && L4.coins === 0 && !L4.items.length, 'rewards: half on a partial (the rare kept), a third on a setback, nothing when called home');
    ok(!L1.items.some(i => i.rarity === 'unique' || i.rarity === 'set') && !JSON.stringify(L1).includes('gem'), 'rewards: never a unique or a gem from a crew');
    const xs = X.xpFor(er, 3, 'success'), xp = X.xpFor(er, 3, 'partial'), xb = X.xpFor(er, 3, 'setback'), xh = X.xpFor(er, 20, 'success');
    ok(xs === Math.round(X.XP_SHARE.errand * xpToNext(3)) && xp === xs && Math.abs(xb - xs / 2) <= 1 && xh < X.XP_SHARE.errand * xpToNext(4) * 0.2 && xh >= 1, "rewards: XP is a share of a level (an errand 0.15 of the hero's own level up to the errand's), full on a partial, half on a setback, small for a hero far above it (CZ-9)");
    ok(X.xpLevelMul(4, 4) === 1 && X.xpLevelMul(2, 4) === 1 && X.xpLevelMul(6, 4) === 0.5 && X.xpLevelMul(40, 4) === 0.1, 'rewards: above the objective\'s level the XP diminishes (1 / (1 + 0.5 × the levels above), at least a tenth)');
    const dg = { kind: 'dungeon', level: 8, rewards: {} };
    ok(X.xpFor(dg, 8, 'success') === xpToNext(8) && X.xpFor(dg, 6, 'success') === xpToNext(6), 'rewards: a dungeon clear is about one level (no more "level 10 in one trip")');
    st.flags.mokaJoined = true; st.heroes.moka.player.lvl = 3; st.cozy.clock.h = 10;
    const e = X.startExpedition(st, er, ['hero:moka'], { meals: {}, potions: 0 }, { r: 1.3, need: 24, power: 31, odds: 'sure', p: 1, seed: 5 });
    ok(CS.heroAway(st, 'moka') === e && st.cozy.exp.errands.day === 0 && st.cozy.exp.errands.taken.includes(er.id) && X.hoursLeft(st, e) === er.hours, 'trip: a crew on the road (the hero is away, the errand taken for the day)');
    ok(X.memberWhy(st, 'hero:moka') === 'Away on an expedition', "trip: an away hero can't be sent again");
    const rep = X.finishExpedition(st, e, er, { result: 'partial', xp: { 'hero:moka': 50 }, lines: [{ who: 'hero:moka', text: 'hi' }] });
    ok(!CS.heroAway(st, 'moka') && rep.result === 'partial' && !rep.read && CS.unreadReports(st) === 1 && CS.tiredLeft(st, 'hero:moka') === 6 && /Resting/.test(X.memberWhy(st, 'hero:moka')), 'trip: home again; a partial leaves the crew resting 6 world hours, the report unread');
    st.cozy.clock.h += 6.5; ok(X.memberWhy(st, 'hero:moka') === '', 'trip: rested again after 6 world hours');
    const e2 = X.startExpedition(st, er, ['hero:moka'], {}, { r: 1, need: 24, power: 24, odds: 'good', p: 0.8 }); X.finishExpedition(st, e2, er, { result: 'success' });
    ok(st.cozy.exp.done[er.id] === 1 && CS.tiredLeft(st, 'hero:moka') === 0, 'trip: a success counts as done, no rest needed');
    st.activeHero = 'moka'; const e3 = X.startExpedition(st, er, ['hero:moka'], {}, { r: 1, need: 1, power: 1, odds: 'good', p: 1 });
    ok(X.brokenExpeditions(st, id => O.objective(st, id)).some(b => b.e === e3), 'load: an expedition with the hero being played comes home (COZY §9)');
    const e4 = X.startExpedition(st, { ...er, id: 'gone:1' }, ['hero:poe'], {}, { r: 1, need: 1, power: 1, odds: 'good', p: 1 });
    ok(X.brokenExpeditions(st, id => O.objective(st, id)).filter(b => b.e === e4).length === 1, "load: an expedition whose objective is gone or whose hero isn't joined comes home");
    ok(X.crewLines(st, ['hero:poe', 'hero:moka'], 'success', () => 0).length === 2 && X.crewLines(st, ['hero:poe'], 'beaten', () => 0)[0].text.includes('beat'), 'report: a line from each member in their voice');
  }
  // ---- XP for benched heroes (rpg/actions.js addXpTo: COZY §3.3)
  { const G = { state: fresh() }, A = createActions(G), st = G.state, ev = [];
    st.flags.mokaJoined = true;
    const off = Events.on('hero:levelup', e => ev.push(e)), off2 = Events.on('player:levelup', e => ev.push({ player: e }));
    st.heroes.chewy.player.lvl = 10;
    const g = A.addXpTo('moka', xpToNext(1) * 0.6);
    ok(g.gained === Math.round(xpToNext(1) * 1.2) && g.from === 1 && g.lvl === 2 && st.heroes.moka.player.statPts === 5 && st.heroes.moka.player.skillPts === 2 && ev.length === 1 && ev[0].id === 'moka' && ev[0].lvl === 2, 'addXpTo: a benched hero far behind gets double XP and levels (points, a hero:levelup, no player banner)');
    ok(st.player === st.heroes.chewy.player && st.player.lvl === 10, 'addXpTo: the hero being played is untouched');
    const g2 = A.addXpTo('chewy', 10); ok(g2.gained >= 10 && g2.from === 10, 'addXpTo: the active hero goes through addXp');
    ok(A.addXpTo('nobody', 50).gained === 0 && A.addXpTo('moka', 0).gained === 0, 'addXpTo: nothing for an unknown hero or 0 XP');
    if (typeof off === 'function') off(); if (typeof off2 === 'function') off2();
  }
}

hr('COZY: THE PEACEFUL OVERWORLD AND THE WILD AREAS (docs/COZY.md §6, cozy/peaceful.js)');
{
  const PZ = await import('../src/cozy/peaceful.js'), LG = await import('../src/regions/layoutGen.js'), Z = await import('../src/rpg/zones.js');
  const { REGION_IDS, REGIONS } = await import('../src/regions/index.js');
  const D2 = (a, x, z) => Math.hypot(a.x - x, a.z - z);
  // ---- the recipe data: 2 named wild areas a zone, as data the terrain rework (Z-F) carries
  for (const id of REGION_IDS) {
    const def = REGIONS[id], raw = def.layout.wild || [], A = PZ.wildAreas(def), P = LG.regionPlan(def);
    ok(raw.length === 2 && A.length === 2 && A.every(a => a.name && a.jp && a.r >= 12 && a.r <= 16 && a.packs >= 2 && a.packs <= 3) && new Set(A.map(a => a.id)).size === 2, `wild: ${id} has 2 named wild areas (r 12–16, 2–3 packs) in its recipe`);
    ok(P.wild.length === 2 && !P.wildIssues.length, `wild: ${id}'s plan keeps both areas with no issues (${JSON.stringify(P.wildIssues)})`);
    // the hard rule: every main-trail point at least r + 3 m from each disc (the walk to the village and the gate never crosses one)
    const worst = Math.min(...P.wild.map(a => Math.min(...P.trail.map(([x, z]) => D2(a, x, z) - a.r))));
    ok(worst >= PZ.WILD.trailGap, `wild: ${id}'s main trail stays ≥ r + ${PZ.WILD.trailGap} m from both areas (closest ${worst.toFixed(1)} m)`);
    ok(P.wild.every(a => a.entry && Math.abs(D2(a, a.entry[0], a.entry[1]) - a.r) < 1.6) && P.spurs.length >= 2 + P.pois.length, `wild: ${id}: a side path reaches each area, its entry on the rim`);
    ok(P.camps.every(c => P.wild.every(a => D2(a, c.x, c.z) > a.r + c.r)) && P.pois.every(p => P.wild.every(a => D2(a, p.x, p.z) > a.r + p.r)), `wild: ${id}: camp sites and POIs keep out of the wild areas`);
    ok(P.discs.filter(d => d.kind === 'wild').length === 2, `wild: ${id}: the areas are 'wild' discs in the plan (flattened, kept clear)`);
    // per visit: the packs inside the discs, hotter, at the band's top + 1; a wild cache in each
    let packs = 0, inside = 0, uniq = 0, champ = 0, lvlOk = true, caches = 0, campSame = true;
    for (let v = 1; v <= 40; v++) {
      const L = LG.generateRegion(def, { visit: v, mlvl: def.levels[0] });
      for (const sp of L.spawns.filter(s => s.wild)) { packs++; const a = P.wild.find(w => w.id === sp.wild); if (a && D2(a, (sp.x + 0.5) * 2, (sp.y + 0.5) * 2) < a.r + 1.5) inside++; if (sp.rank === 'unique') uniq++; if (sp.rank === 'champion') champ++; if (sp.lvl !== def.levels[0] + 2) lvlOk = false; }
      caches += L.chests.filter(c => c.wild && c.quality === 'gold').length;
      if (v === 1) campSame = L.spawns.filter(s => !s.wild && !s.boss).length === Math.min(def.layout.camps ?? 7, P.camps.length);
    }
    const want = P.wild.reduce((n, a) => n + a.packs, 0) * 40;
    ok(packs === want && inside === packs && lvlOk, `wild: ${id}: ${want / 40} wild packs a visit, all inside their discs, level ${def.levels[0] + 2} for a level-1 hero (${inside}/${packs})`);
    { const hi = LG.generateRegion(def, { visit: 1, heroLvl: 99 }).spawns.filter(s => s.wild), mid = LG.generateRegion(def, { visit: 1, heroLvl: def.levels[0] + 3 }).spawns.filter(s => s.wild);
      ok(hi.every(s => s.lvl === def.levels[1] + 1) && mid.every(s => s.lvl === def.levels[0] + 5), `wild: ${id}: the packs sit a step above the strongest hero (hero + 2), capped at the band's top + 1`); }
    ok(uniq / packs > 0.08 && uniq / packs < 0.3 && champ / packs > 0.18 && champ / packs < 0.45, `wild: ${id}: ranks run hot (unique ${(uniq / packs * 100).toFixed(0)}%, champion ${(champ / packs * 100).toFixed(0)}%)`);
    ok(caches === 80 && campSame, `wild: ${id}: a golden wild cache in each area every visit; the trail camps still roll`);
  }
  // ---- the check is enforced: an area on the trail is dropped and reported
  { const def = REGIONS.bamboo, P0 = LG.regionPlan(def), [tx, tz] = P0.trail[Math.round(P0.trail.length * 0.15)];
    const bad = { ...def, layout: { ...def.layout, wild: [...def.layout.wild, { id: 'onTheTrail', name: 'the bad idea', jp: '', at: [tx, tz], r: 12 }] } };
    const P = LG.regionPlan(bad);
    ok(P.wild.length === 2 && !P.wild.some(a => a.id === 'onTheTrail') && P.wildIssues.some(e => e.id === 'onTheTrail' && e.kind === 'trail'), 'wild: layoutGen drops an area that sits on the trail (and lists why)');
    ok(PZ.areaIssues({ id: 'x', x: 56, z: 56, r: 12 }, { trail: [[56, 56], [60, 60]] }).some(e => e.kind === 'trail') && !PZ.areaIssues({ id: 'y', x: 20, z: 20, r: 12 }, { trail: [[80, 80], [90, 90]] }).length, 'wild: areaIssues flags a disc on the trail, passes one far off it'); }
  // ---- the helpers (the interface for CZ-5's scavenging)
  { const A = [{ id: 'a', x: 20, z: 20, r: 12 }, { id: 'b', x: 80, z: 80, r: 14 }];
    ok(PZ.wildAt(A, 25, 22)?.id === 'a' && PZ.wildAt(A, 80, 93)?.id === 'b' && PZ.wildAt(A, 50, 50) === null && PZ.inWild(A, 33, 20, 2) && !PZ.inWild(A, 33, 20), 'wild: wildAt / inWild find the disc at a point (pad grows it)');
    ok(PZ.pastLeash(A[0], 20 + 12 + PZ.WILD.leash + 0.5, 20) && !PZ.pastLeash(A[0], 20 + 12 + PZ.WILD.leash - 0.5, 20), `wild: the leash is r + ${PZ.WILD.leash} m`);
    ok(PZ.wildRank(0.1) === 'unique' && PZ.wildRank(0.3) === 'champion' && PZ.wildRank(0.6) === 'normal' && PZ.wildLevel([4, 12], 4) === 6 && PZ.wildLevel([4, 12], 1) === 6 && PZ.wildLevel([4, 12], 8) === 10 && PZ.wildLevel([4, 12], 30) === 13, 'wild: ranks 18% unique / 30% champion; level = clamp(hero + 2, band low + 2, band top + 1)');
    ok(PZ.titled('the Kamaitachi Thicket') === 'The Kamaitachi Thicket' && PZ.normArea({ at: [1, 2], r: 40 }).r === 16 && PZ.normArea({ at: ['x'] }) === null, 'wild: titled() and normArea clamp / reject'); }
  // ---- the spawn rule (COZY §6.1)
  { const st = Z.normalizeZones(normalizeHeroes(newGameState()));
    const L = { spawns: [{ rank: 'normal' }, { rank: 'champion' }, { rank: 'normal', wild: 'thicket' }, { rank: 'boss', boss: 'tenguMaster' }, { rank: 'unique', keep: true }] };
    ok(!PZ.isPeaceful(st, 'bamboo') && PZ.peacefulFilter(st, 'bamboo', L).length === 5, 'peaceful: a besieged zone spawns everything (the trail camps too)');
    Z.saveVillage(st, 'bamboo');
    const kept = PZ.peacefulFilter(st, 'bamboo', L);
    ok(PZ.isPeaceful(st, 'bamboo') && kept.length === 3 && kept.every(s => s.wild || s.boss || s.keep) && !PZ.isPeaceful(st, 'maple'), 'peaceful: a saved zone keeps only its wild packs (and a boss / a kept sighting); other zones stay as they are');
    PZ.setPeacefulOverride('maple', true); PZ.setPeacefulOverride('bamboo', false);
    ok(PZ.isPeaceful(st, 'maple') && !PZ.isPeaceful(st, 'bamboo') && PZ.peacefulOverride('maple') === true, 'peaceful: the debug override wins');
    PZ.setPeacefulOverride('maple', null); PZ.setPeacefulOverride('bamboo', null);
    ok(!PZ.isPeaceful(st, 'maple') && PZ.isPeaceful(st, 'bamboo') && PZ.peacefulOverride('maple') === null, 'peaceful: clearing the override follows the save again'); }
}

hr('COZY: SCAVENGING (docs/COZY.md §7, §8, cozy/scavenge.js)');
{
  const SC = await import('../src/cozy/scavenge.js'), K = await import('../src/cozy/clock.js'), CS = await import('../src/cozy/state.js'), Z = await import('../src/rpg/zones.js');
  const ZQ = await import('../src/world/zoneQuests.js');
  const fresh = () => CS.normalizeCozy(Z.normalizeZones(normalizeHeroes(newGameState())));
  const seqr = seed => { const r = new RNG(seed); return () => r.next(); };
  // ---- the tables (COZY §7.2)
  ok(SC.SCAV_AREAS.join() === 'home,bamboo,maple,tidepool,onsen' && SC.SCAV_AREAS.every(a => SC.AREA_DEFS[a]), 'scavenge: Blossom Hollow and the four zones');
  ok(SC.nodeCount('home') >= 10 && SC.nodeCount('home') <= 12 && ['bamboo', 'maple', 'tidepool', 'onsen'].every(a => SC.nodeCount(a) >= 14 && SC.nodeCount(a) <= 18), 'scavenge: 10–12 nodes at home, 14–18 a zone');
  ok(Object.values(SC.AREA_DEFS).every(A => Object.keys(A.nodes).every(k => SC.NODE_KINDS[k]) && A.dig.every(o => o.w > 0) && ['loam', 'leafy', 'sand', 'snow'].includes(A.ground)), 'scavenge: every area names real node kinds, a dig table and a ground');
  const MATS = new Set(MATERIAL_KEYS);
  ok(Object.values(SC.NODE_KINDS).every(K2 => K2.verb && K2.model && Object.keys(K2.mats || {}).every(m => MATS.has(m)) && (!K2.pantry || K2.pantry.pool.every(id => PANTRY[id]?.kind === 'forage'))), 'scavenge: node kinds give real materials and forage');
  // the combat-only materials all come from scavenging (COZY §0.5, §8)
  const from = new Set(); for (const A of Object.values(SC.AREA_DEFS)) { for (const k of Object.keys(A.nodes)) for (const m of Object.keys(SC.NODE_KINDS[k].mats || {})) from.add(m); for (const o of A.dig) for (const m of Object.keys(o.mats || {})) from.add(m); }
  ok(['petal', 'bone', 'silk', 'crystal', 'lantern', 'wood', 'stone'].every(m => from.has(m)), `scavenge: petal, bone, silk, crystal and lantern come without a fight (${[...from].join(', ')})`);
  // ---- yields
  { const r = seqr(3); let lo = 99, hi = 0; for (let i = 0; i < 400; i++) { const y = SC.gatherYield('driftwood', r); lo = Math.min(lo, y.mats.wood); hi = Math.max(hi, y.mats.wood); }
    ok(lo === 2 && hi === 4, 'gather: driftwood gives 2–4 wood');
    const b = SC.gatherYield('driftwood', () => 0, { basket: true }), f = SC.gatherYield('shoots', () => 0, { basket: true });
    ok(b.mats.wood === 3 && f.pantry.bamboo === 2, "gather: the Forager's Basket adds one");
    ok(Object.keys(SC.gatherYield('nope', r).mats).length === 0, 'gather: an unknown kind gives nothing'); }
  { const r = seqr(5); let one = 0, two = 0, finds2 = 0;
    for (let i = 0; i < 2000; i++) { const a = SC.digYield('bamboo', r), b = SC.digYield('bamboo', r, { perfect: true }); one += Object.values(a.mats).reduce((s, n) => s + n, 0) + (a.coins ? 1 : 0); two += Object.values(b.mats).reduce((s, n) => s + n, 0) + (b.coins ? 1 : 0); }
    ok(two > one * 1.6, `dig: a Perfect dig rolls twice (${(two / 2000).toFixed(2)} vs ${(one / 2000).toFixed(2)} finds a dig)`);
    for (let i = 0; i < 3000; i++) { const y = SC.digYield('home', () => 0.999, { perfect: true }); if (y.find) finds2++; }
    ok(finds2 === 3000, 'dig: never two furniture finds from one dig (the second roll falls back)'); }
  ok(SC.digResult(0.69) === 'normal' && SC.digResult(0.7) === 'perfect' && SC.digResult(0.85) === 'perfect' && SC.digResult(0.86) === 'normal' && SC.digResult(1) === 'normal' && SC.DIG_SECS === 1.4, 'dig: the golden band is 70–85% of a 1.4 s ring; anywhere else is a good dig (never a fail)');
  // ---- the state, the day's refill, time away
  { const st = fresh(); st.cozy.scav = { home: { day: 0, taken: ['home:1', 7], dug: 'x' }, tools: { basket: 1 }, stats: { streak: -3 } };
    const S = SC.scavState(st);
    ok(S.home.taken.join() === 'home:1' && Array.isArray(S.home.dug) && S.tools.basket === true && S.tools.bandana === false && S.stats.streak === 0 && S.cheat.perfect === 0, 'scav state: a type-checked fill');
    CS.normalizeCozy(st); ok(st.cozy.scav.home.taken.join() === 'home:1', 'scav state: normalizeCozy keeps it');
    ok(SC.takeNode(st, 'home', 'home:2') && !SC.takeNode(st, 'home', 'home:2') && SC.nodeTaken(st, 'home', 'home:2') && SC.scavState(st).stats.gathered === 1, 'scav: a node is gathered once a day');
    K.addHours(st, 23.5); ok(SC.nodeTaken(st, 'home', 'home:2'), 'scav: still gathered later the same world day');
    K.addHours(st, 0.6); ok(!SC.nodeTaken(st, 'home', 'home:2') && SC.areaRec(st, 'home').day === 1, 'scav: a new world day refills every node');
    SC.takeNode(st, 'bamboo', 'bamboo:4'); ok(SC.staleAreas(st, 2).includes('bamboo') && !SC.staleAreas(st, 1).includes('bamboo'), "scav: staleAreas names what a crossed day refilled (the away card's line)");
    // time away counts toward the refill (COZY §4.4.1: node refills only)
    const st2 = fresh(); st2.cozy.clock.wall = 1e12; st2.cozy.clock.h = 20; SC.takeNode(st2, 'maple', 'maple:3');
    K.catchUp(st2, 1e12 + 8 * 35e3); ok(st2.cozy.clock.h === 28 && !SC.nodeTaken(st2, 'maple', 'maple:3'), 'scav: an absence that crosses a world day refills the nodes'); }
  { const st = fresh();
    ok(SC.findSpot(st, 'home', 's1') && !SC.findSpot(st, 'home', 's1') && SC.spotFound(st, 'home', 's1'), 'dig spots: Shadow finds a spot once');
    let k = SC.digSpot(st, 'home', 's1', true); ok(SC.spotDug(st, 'home', 's1') && !SC.spotFound(st, 'home', 's1') && k.streak === 1, 'dig spots: digging it clears the paw mark');
    k = SC.digSpot(st, 'home', 's2', true); ok(k.streak === 2 && k.best === 2, 'dig: perfect digs build a streak');
    k = SC.digSpot(st, 'home', 's3', false); ok(k.streak === 0 && k.best === 2 && st.cozy.scav.stats.perfect === 2 && st.cozy.scav.stats.dug === 3, 'dig: a good dig ends the streak; the best stays');
    st.cozy.scav.cheat.perfect = 2; ok(SC.cheatPerfect(st) && SC.cheatPerfect(st) && !SC.cheatPerfect(st), 'dig: the debug streak spends its digs'); }
  { const days = Array.from({ length: 60 }, (_, d) => SC.spotCount('bamboo', d));
    ok(days.every(n => n === 2 || n === 3) && days.includes(2) && days.includes(3) && SC.spotCount('bamboo', 4, { bandana: true }) === SC.spotCount('bamboo', 4) + 1, "dig spots: 2–3 a day (one more with Shadow's Bandana)");
    const cands = Array.from({ length: 12 }, (_, i) => ({ x: (i % 4) * 20, z: Math.floor(i / 4) * 20 }));
    const a = SC.pickSpots('maple', 7, cands, 3), b = SC.pickSpots('maple', 7, cands, 3), c = SC.pickSpots('maple', 8, cands, 3);
    ok(a.join() === b.join() && a.length === 3 && new Set(a).size === 3 && a.join() !== c.join(), 'dig spots: picked by the day (the same all day, moved the next)');
    ok(a.every((i, k) => a.every((j, l) => k === l || Math.hypot(cands[i].x - cands[j].x, cands[i].z - cands[j].z) >= 14)), 'dig spots: spread at least 14 m apart'); }
  // ---- quest items from dig spots (COZY §7.2)
  { const st = fresh(); st.quests.active = [{ id: 'tk_heartwood', step: 0, prog: 1 }];
    const q = SC.questFind(st, 'bamboo', ZQ.ZONE_QUESTS, ZQ.QUEST_ITEMS);
    ok(q && q.item === 'tk_heartwood' && SC.questFind(st, 'maple', ZQ.ZONE_QUESTS, ZQ.QUEST_ITEMS) === null && SC.questFind(st, 'home', ZQ.ZONE_QUESTS, ZQ.QUEST_ITEMS) === null, "quest digs: an active find step's item turns up in its own zone's dig spots");
    SC.markQuestDig(st, 'bamboo'); ok(SC.questFind(st, 'bamboo', ZQ.ZONE_QUESTS, ZQ.QUEST_ITEMS) === null, 'quest digs: one a world day');
    K.addHours(st, 24); ok(!!SC.questFind(st, 'bamboo', ZQ.ZONE_QUESTS, ZQ.QUEST_ITEMS), 'quest digs: another the next day');
    st.quests.active[0].prog = 3; ok(SC.questFind(st, 'bamboo', ZQ.ZONE_QUESTS, ZQ.QUEST_ITEMS) === null, 'quest digs: none once the step has all it needs'); }
  // ---- the pace (COZY §7.3; tools/scavenge-sim.mjs checks the whole table)
  { const sw = area => { const A = SC.AREA_DEFS[area], o = {}; for (const [k, n] of Object.entries(A.nodes)) for (const [m, v] of Object.entries(SC.meanGather(k))) o[m] = (o[m] || 0) + v * n; return o; };
    const b = sw('bamboo'), h = sw('home');
    ok(Math.abs(b.wood - 18) <= 3 && Math.abs(b.stone - 12) <= 3 && b.silk >= 4 && b.silk <= 6 && Math.abs(b.forage - 5) <= 1.5, `pace: a Bamboo sweep ≈ 18 wood, 12 stone, 4–6 silk, 5 forage (${b.wood}, ${b.stone}, ${b.silk}, ${b.forage})`);
    ok(h.wood <= b.wood * 0.6 && h.stone <= b.stone * 0.6 && h.petal >= 3, `pace: Blossom Hollow's round about half (${h.wood} wood, ${h.stone} stone, ${h.petal} petal)`); }
  // ---- Pound Mochi (COZY §7.2)
  { const G = { state: newGameState() }, A = createActions(G), st = G.state; st.pantry = { rice: 4 }; st.materials.mochi = 0;
    ok(RECIPES.poundMochi?.out?.mat === 'mochi' && cookableAt('poundMochi', 'kitchen') && cookableAt('poundMochi', 'oven') && !cookableAt('poundMochi', 'campfire') && knows({ cookbook: cookbookOf({}) }, 'poundMochi'), "Pound Mochi: a starter recipe at the stove or Rosie's");
    const r = A.cook('poundMochi', 2);
    ok(r && st.materials.mochi === 4 && !st.pantry.rice && !st.pantry.poundMochi, 'Pound Mochi: 2 rice → 2 Mochi (a material, not a dish)');
    ok(matchMix({ rice: 2 }) === 'poundMochi' && matchMix({ rice: 1 }) === 'onigiri', 'Pound Mochi: two rice in "Try a mix" pound into mochi'); }
}

hr('COZY: THE SIGHTINGS BOARD (docs/COZY.md §6.3, cozy/sightings.js)');
{
  const SG = await import('../src/cozy/sightings.js'), CS = await import('../src/cozy/state.js'), Z = await import('../src/rpg/zones.js');
  const zones = [
    { zone: 'bamboo', lvl: 6, areas: [{ id: 'thicket', name: 'the Kamaitachi Thicket' }, { id: 'fallenShrine', name: 'the Fallen Shrine' }], monsters: [{ id: 'kamaitachi', name: 'Kamaitachi' }, { id: 'kodama', name: 'Kodama' }] },
    { zone: 'maple', lvl: 13, areas: [{ id: 'scarecrowFields', name: 'the Scarecrow Fields' }, { id: 'oldRoot', name: 'Old Root Hollow' }], monsters: [{ id: 'kuri', name: 'Kuri' }] },
  ];
  const a = SG.rollSightings(4, zones), b = SG.rollSightings(4, zones), c = SG.rollSightings(5, zones);
  ok(a.length === 3 && JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a) !== JSON.stringify(c), 'sightings: 3 a world day, the same all day (seeded by the day), new ones the next');
  ok(new Set(a.map(s => s.zone + s.area)).size === 3 && new Set(a.map(s => s.zone)).size === 2 && a.map(s => s.kind).sort().join() === 'champion,swarm,unique', 'sightings: each in a different wild area, spread over the open zones; a unique, a champion pack and a swarm');
  ok(a.every(s => s.name && s.line && s.areaName && s.lvl === zones.find(z => z.zone === s.zone).lvl && s.renown === SG.KINDS[s.kind].renown && !s.done), 'sightings: named, a line for the board, the zone\'s wild level, renown by kind');
  ok(a.every(s => s.bounty.coins === Math.round(1.5 * SG.packCoins(s.kind, s.lvl, s.count)) && Object.values(s.bounty.mats).reduce((n, v) => n + v, 0) >= 4 && Object.keys(s.bounty.mats).every(k => SG.ZONE_MATS[s.zone].includes(k))), 'sightings: the bounty is 1.5 × the pack\'s own coins, plus the zone\'s materials');
  let gems = 0, n = 0; for (let d = 0; d < 400; d++) for (const s of SG.rollSightings(d, zones)) { n++; if (s.bounty.gem) gems++; }
  ok(Math.abs(gems / n - SG.GEM_P) < 0.05, `sightings: a gem in about 1 bounty in 4 (${(gems / n * 100).toFixed(0)}%)`);
  ok(SG.rollSightings(1, []).length === 0 && SG.rollSightings(1, [zones[0]]).length === 2, 'sightings: none with no zone open; one zone with two areas gives two');
  { const four = ['bamboo', 'maple', 'tidepool', 'onsen'].map(z => ({ ...zones[0], zone: z })); let bad = 0; for (let d = 0; d < 300; d++) { const r = SG.rollSightings(d, four); if (r.length !== 3 || r.some(s => !s.kind || !s.bounty)) bad++; }
    ok(bad === 0, 'sightings: with all four zones open every day rolls three whole sightings (the kinds shuffle stays in its 3)', bad); }
  // the state: today's list, the world day, clearing, renown, the save
  const st = CS.normalizeCozy(Z.normalizeZones(normalizeHeroes(newGameState())));
  ok(st.cozy.sightings.day === -1 && st.cozy.sightings.renown === 0, 'sightings: a new save has no sightings and no renown');
  const L1 = SG.sightingsToday(st, 2, zones), L2 = SG.sightingsToday(st, 2, zones);
  ok(L1 === L2 && L1.length === 3 && st.cozy.sightings.day === 2, 'sightings: today\'s list is rolled once a world day');
  const s0 = SG.clearSighting(st, L1[0].id), again = SG.clearSighting(st, L1[0].id);
  ok(s0 && s0.done && !again && st.cozy.sightings.renown === s0.renown && st.cozy.sightings.total === 1 && SG.liveIn(st, s0.zone).every(s => s.id !== s0.id), 'sightings: clearing one pays its renown once and marks it done');
  st.cozy.sightings.renown = 12; CS.normalizeCozy(st);
  ok(st.cozy.sightings.renown === 12 && st.cozy.sightings.total === 1 && st.cozy.sightings.list.length === 3, 'sightings: normalizeCozy keeps the list, the renown and the count');
  ok(SG.renownTitle(0) === 'Wanderer' && SG.renownTitle(12) === 'Bounty Hunter' && SG.renownTitle(99) === 'Legend of the Wilds' && SG.nextTitle(12).title === 'Wild Warden' && SG.nextTitle(60) === null, 'sightings: renown titles');
  const L3 = SG.sightingsToday(st, 3, zones);
  ok(L3 !== L1 && L3.every(s => !s.done && s.day === 3) && st.cozy.sightings.renown === 12, 'sightings: the next world day brings three new ones; renown stays');
}

hr('COZY: THE ADVENTURERS\' GUILD AND HIRES (docs/COZY.md §5, cozy/guild.js)');
{
  const GD = await import('../src/cozy/guild.js'), CS = await import('../src/cozy/state.js'), X = await import('../src/cozy/expeditions.js'), O = await import('../src/cozy/objectives.js'), Z = await import('../src/rpg/zones.js');
  const { BUILDINGS } = await import('../src/world/buildings/catalog.js'), PL = await import('../src/world/plots.js');
  const fresh = () => CS.normalizeCozy(Z.normalizeZones(normalizeHeroes(newGameState())));
  // ---- the building (COZY §5.1)
  { const B = BUILDINGS.guild, COMBAT = ['bone', 'silk', 'crystal', 'lantern', 'mochi'];
    ok(B && B.cat === 'special' && B.unique && B.levels === 3 && B.size.join() === '4,3' && 'glb' in B, 'guild: a unique special building, 4x3, three levels, a glb slot');
    ok(JSON.stringify(B.cost) === JSON.stringify({ coins: 400, wood: 30, stone: 16, petal: 4 }) && Object.keys(B.cost).every(k => !COMBAT.includes(k)), 'guild: level 1 costs 400 coins, 30 wood, 16 stone, 4 petal (no combat-only material)');
    ok(JSON.stringify(B.levelCost[1]) === JSON.stringify({ coins: 900, wood: 40, stone: 30, silk: 4, lantern: 2 }) && JSON.stringify(B.levelCost[2]) === JSON.stringify({ coins: 1800, wood: 60, stone: 40, crystal: 4, lantern: 4 }), 'guild: levels 2 and 3 cost as COZY §5.1');
    ok(GD.GUILD_RANK.join() === '0,2,3,4', 'guild: built at village rank 2, level 2 at 3, level 3 at 4');
    const civic = PL.PLOTS.filter(p => p.allows.includes('guild')).map(p => p.id).sort();
    ok(civic.join() === 'civic-e,civic-w' && PL.PLOT_TYPES.has('guild'), 'guild: stands on the civic plots (civic-e, civic-w) and only on a plot');
    ok(civic.every(id => { const p = PL.PLOT_BY_ID[id], r = PL.DOOR_ROT[p.door] % 2; return !!PL.plotSpot(p, r ? 3 : 4, r ? 4 : 3); }), 'guild: fits both civic plots (the footprint stays 4x3 on every level)');
  }
  // ---- the state and migration (COZY §9)
  { const old = normalizeHeroes(newGameState()); delete old.cozy;
    const st = CS.normalizeCozy(old), g = st.cozy.guild;
    ok(g.level === 0 && g.hires.length === 0 && g.seq === 1 && g.cand.day === -1 && g.wages.day === -1 && !g.met, 'guild state: an old save gets an empty Guild (not built, no hires)');
    const j = JSON.stringify(st.cozy.guild); CS.normalizeCozy(st); ok(JSON.stringify(st.cozy.guild) === j, 'guild state: normalizeCozy is idempotent');
    const bad = { cozy: { guild: { level: 9, hires: [{ id: 'h2', name: 'Kenta', cls: 'wizard', lvl: -3, morale: 7, owed: -5 }, { id: 'h2', name: 'dup' }, { nope: 1 }, 'x'], seq: 0, cand: { day: 3, list: [{ i: 0, cls: 'scout', name: 'A', lvl: 2, seed: 7 }, { cls: 'bard' }] }, wages: { day: 'x', short: -1 }, extra: 'kept' } } };
    CS.normalizeCozy(bad); const B = bad.cozy.guild;
    ok(B.level === 3 && B.hires.length === 1 && B.hires[0].cls === 'guard' && B.hires[0].lvl === 1 && B.hires[0].morale === GD.MORALE_MAX && B.hires[0].owed === 0 && B.seq === 3 && B.cand.list.length === 1 && B.wages.day === -1 && B.extra === 'kept', 'guild state: a broken Guild is type-checked (bad classes, levels, morale, duplicates; seq past the ids; other fields kept)');
    ok(JSON.stringify(saveableState(st)).includes('"guild"'), 'guild state: saved with the household');
  }
  // ---- candidates and sign-on (COZY §5.2)
  { const st = fresh();
    const a = GD.rollCandidates(5, 4, 1), b = GD.rollCandidates(5, 4, 1), c = GD.rollCandidates(6, 4, 1);
    ok(a.length === 3 && JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a) !== JSON.stringify(c), 'candidates: three a world day, seeded by the day');
    ok(new Set(a.map(x => x.cls)).size === 3 && a.every(x => GD.CLASS_IDS.includes(x.cls) && x.lvl >= 3 && x.lvl <= 5 && x.name) && new Set(a.map(x => x.name)).size === 3, 'candidates: three different classes, three names, a level near the crew\'s − 2');
    ok(GD.rollCandidates(1, 60, 1).every(x => x.lvl === 20) && GD.rollCandidates(1, 60, 3).every(x => x.lvl <= 40), 'candidates: capped at the Guild\'s hire level cap (20 / 30 / 40)');
    st.heroes.chewy.player.lvl = 9; ok(GD.candidateLevel(st) === 7, 'candidates: two below the strongest joined hero (CZ-9)');
    { const s2 = fresh(); s2.flags.mokaJoined = true; s2.heroes.moka.player.lvl = 4; s2.cozy.guild.level = 1;
      const lv = GD.candidateLevel(s2), C = GD.rollCandidates(3, lv, 1), weakest = Math.min(...C.map(x => x.lvl));
      const h = GD.signOn(s2, { ...C.find(x => x.lvl === weakest), taken: false }, 0), er = O.objective(s2, O.errandIds('burrow', 3)[0]);
      const c = X.canSend(s2, er, ['hire:' + h.id], {}, { rank: 2, guild: 1 });
      ok(lv === 3 && weakest >= 3 && c.ok && ['risky', 'good', 'sure'].includes(c.odds.key), 'candidates: a fresh rank-2 Guild\'s weakest candidate (Chewy L1, Moka L4) takes a Burrow errand alone, at Risky or better (CZ-9)', { lv, weakest, odds: c.odds.key, r: c.r }); }
    const L = GD.candidatesToday(st, 2);
    ok(L === GD.candidatesToday(st, 2) && st.cozy.guild.cand.day === 2 && L.length === 3, 'candidates: today\'s list is rolled once a world day and kept');
    ok(!GD.canHire(st, L[0], 9999).ok && /isn't built/.test(GD.canHire(st, L[0], 9999).why), 'hire: nobody signs on before the Guild is built');
    st.cozy.guild.level = 1;
    ok(!GD.canHire(st, L[0], 0).ok && GD.canHire(st, L[0], 9999).ok && GD.canHire(st, L[0], 0).fee === 40 * L[0].lvl, 'hire: the sign-on fee is 40 × level');
    const h = GD.signOn(st, L[0], 2 * 24 + 5);
    ok(h.id === 'h1' && h.since === 2 && h.morale === 1 && h.lvl === L[0].lvl && L[0].taken && !GD.canHire(st, L[0], 9999).ok, 'hire: signed on (h1, since world day 2, morale 1), the candidate taken');
    GD.signOn(st, L[1], 50); GD.signOn(st, L[2], 50);
    const more = GD.rollCandidates(9, 4, 1)[0];
    ok(st.cozy.guild.hires.length === 3 && /roster is full/.test(GD.canHire(st, more, 9999).why), 'hire: the roster cap is 3 at level 1');
    st.cozy.guild.level = 2; ok(GD.canHire(st, more, 9999).ok && GD.rosterCap(2) === 6 && GD.rosterCap(3) === 9, 'hire: 6 at level 2, 9 at level 3');
    ok(GD.dismiss(st, 'h2')?.id === 'h2' && st.cozy.guild.hires.length === 2 && !GD.dismiss(st, 'h2'), 'dismiss: a kind goodbye takes them off the roster');
  }
  // ---- wages on the world clock (COZY §5.2, §4.4.1)
  { const st = fresh(); st.cozy.guild.level = 1;
    const c = GD.rollCandidates(0, 3, 1).map(x => ({ ...x, lvl: 3 }));
    const h1 = GD.signOn(st, c[0], 0), h2 = GD.signOn(st, c[1], 0);
    let o = GD.settleWages(st, 0, 100);
    ok(o.days === 0 && o.paid === 0 && st.cozy.guild.wages.day === 0, 'wages: the first settle starts the clock (no pay)');
    o = GD.settleWages(st, 1, 100);
    ok(o.days === 1 && o.paid === 24 && h1.morale === 1.02 && h2.morale === 1.02 && st.cozy.guild.wages.banner === 24, 'wages: a world day pays 4 × level each, a paid day lifts morale, the morning banner hears of it');
    ok(GD.dailyWages(st) === 24 && GD.wageOf(5) === 20, 'wages: 4 × level coins a world day');
    o = GD.settleWages(st, 3, 30);
    ok(o.days === 2 && o.paid === 30 && o.short === 18 && h1.owed === 6 && h2.owed === 12 && h2.unpaid === 1 && h2.morale < 1, 'wages: time away counts (two world days at once); short coins leave a hire owed and glum');
    GD.settleWages(st, 4, 0); GD.settleWages(st, 5, 0); GD.settleWages(st, 6, 0); GD.settleWages(st, 7, 0);
    ok(h2.morale === GD.MORALE_MIN && h2.onBreak && h1.morale === GD.MORALE_MIN && h1.onBreak, 'wages: three days at the morale floor and they take a break (benched, not gone)');
    ok(X.memberWhy(st, 'hire:' + h2.id).startsWith('On a break'), 'wages: a hire on a break can\'t join a crew');
    const owed = h2.owed, p = GD.payBack(st, h2.id, 9999);
    ok(p.paid === owed && p.back && !h2.onBreak && h2.owed === 0 && h2.morale >= 0.9, 'wages: paying back their wages brings them back from the break');
    o = GD.settleWages(st, 8, 9999);
    ok(!h1.onBreak && h1.owed === 0 && o.perHire[h1.id].back, 'wages: the next pay day settles the back pay first and ends the break');
    const st2 = fresh(); st2.cozy.guild.level = 1; GD.settleWages(st2, 4, 0); const nh = GD.signOn(st2, c[2], 4 * 24 + 1);
    ok(GD.settleWages(st2, 4, 99).paid === 0 && GD.settleWages(st2, 5, 99).paid === GD.wageOf(nh.lvl), 'wages: a hire\'s first wage is the day after they sign on');
  }
  // ---- crews: power, classes, perks (COZY §4.2, §5.2)
  { const st = fresh(); st.cozy.guild.level = 1;
    const mk = (cls, lvl = 4) => GD.signOn(st, { i: 0, seed: 1, name: cls, cls, lvl, taken: false }, 0);
    const g = mk('guard'), a = mk('archer'), s = mk('scout');
    const m = X.memberInfo(st, 'hire:' + g.id);
    ok(m.type === 'hire' && Math.abs(m.power - 6 * 4 * 1 * 1.05) < 1e-9 && m.cls === 'guard' && m.name === 'guard', 'hires: power = 6 × level × morale × (1 + 0.05 × the Guild\'s level)');
    g.morale = 1.15; ok(Math.abs(X.memberInfo(st, 'hire:' + g.id).power - 6 * 4 * 1.15 * 1.05) < 1e-9, 'hires: morale scales their power');
    st.flags.mokaJoined = true; st.heroes.moka.player.lvl = 4;
    ok(Math.abs(X.heroPower(st, 'moka') / X.memberInfo(st, 'hire:' + a.id).power - 1.59) < 0.05, 'hires: level for level a hero is about 1.5× a hire');
    const siege = O.objective(st, 'relief:bamboo'), errand = O.errandsFor(st, 0)[0];
    ok(GD.classSuits('guard', siege) && GD.classSuits('scout', errand) && GD.classSuits('porter', errand) && GD.classSuits('archer', { kind: 'dungeon' }) && GD.classSuits('healer', { kind: 'quest', tags: ['rescue'] }) && GD.classSuits('scout', { kind: 'quest', tags: ['find'] }) && !GD.classSuits('archer', siege), 'classes: Guard sieges, Archer dungeon clears, Scout finds and errands, Healer rescues, Porter errands');
    const P0 = X.crewPower(st, ['hire:' + a.id], siege), P1 = X.crewPower(st, ['hire:' + a.id, 'hire:' + g.id], siege), P2 = X.crewPower(st, ['hire:' + g.id, 'hire:' + mk('guard').id], siege);
    ok(P0.mul === 1 && Math.abs(P1.mul - 1.15) < 1e-9 && Math.abs(P2.mul - 1.15) < 1e-9 && P1.cls.cls === 'guard', 'classes: a class that suits the job adds 15% to the crew, once');
    ok(X.tripHours(errand, ['hire:' + s.id], st) === Math.round(errand.hours * 0.85 * 100) / 100 && X.tripHours(errand, ['hire:' + g.id], st) === errand.hours, 'classes: a Scout takes 15% off the trip');
    ok(X.resolve(0.6, () => 0.99, siege, false, true).result === 'partial' && X.resolve(0.6, () => 0.99, siege, false, false).result === 'setback', 'classes: a Healer turns a setback into a partial');
    ok(JSON.stringify(GD.porterMats({ wood: 8, stone: 3 }, true)) === JSON.stringify({ wood: 10, stone: 4 }), 'classes: a Porter brings 25% more materials');
    ok(X.maxCrew(st) === 4 && GD.crewCap(3) === 5, 'crews: 4 a crew, 5 at Guild level 3');
    const five = ['hero:moka', ...['guard', 'archer', 'scout', 'healer'].map(c => 'hire:' + mk(c, 9).id)];
    st.cozy.guild.level = 1; ok(/At most 4/.test(X.canSend(st, errand, five, {}, {}).why), 'crews: five can\'t go at Guild level 1');
    st.cozy.guild.level = 3; ok(X.canSend(st, errand, five, {}, { guild: 3 }).ok, 'crews: five go at Guild level 3');
    ok(X.crewLines(st, ['hire:' + g.id], 'success', () => 0)[0].text === GD.HIRE_CLASSES.guard.lines[0], 'reports: a hire speaks in their class\'s voice');
  }
  // ---- leveling and morale from expeditions (COZY §4.6, §5.2)
  { const st = fresh(); st.cozy.guild.level = 1;
    const h = GD.signOn(st, { i: 0, seed: 3, name: 'Rin', cls: 'scout', lvl: 1, taken: false }, 0);
    ok(GD.hireXpToNext(1) === Math.round(xpToNext(1) * 0.8) && GD.hireXpToNext(10) === Math.round(xpToNext(10) * 0.8), 'leveling: the hero curve × 0.8');
    let r = GD.hireReturn(st, h.id, { xp: GD.hireXpToNext(1) + 1, result: 'success', fed: true });
    ok(r.from === 1 && r.to === 2 && Math.abs(h.morale - 1.08) < 1e-9 && h.trips === 1 && h.wins === 1, 'leveling: a trip\'s XP levels a hire; a success and a fed lunch lift morale');
    r = GD.hireReturn(st, h.id, { xp: 1e9, result: 'setback' });
    ok(r.to === 20 && h.lvl === 20 && h.xp < GD.hireXpToNext(20) && Math.abs(h.morale - 1.03) < 1e-9, 'leveling: capped at 10 + 10 × the Guild\'s level; a setback lowers morale');
    st.cozy.guild.level = 2; GD.hireReturn(st, h.id, { xp: 1e9, result: 'success' }); ok(h.lvl === 30, 'leveling: a bigger Guild trains them further (30 at level 2)');
    for (let i = 0; i < 9; i++) GD.hireReturn(st, h.id, { result: 'success', fed: true }); ok(h.morale === GD.MORALE_MAX, 'morale: never above 1.15');
    for (let i = 0; i < 9; i++) GD.hireReturn(st, h.id, { result: 'setback' }); ok(h.morale === GD.MORALE_MIN && GD.moraleHearts(h.morale) === 1 && GD.moraleHearts(1) === 2 && GD.moraleHearts(1.1) === 3, 'morale: never below 0.85; 1–3 hearts');
    GD.hireReturn(st, h.id, { xp: 50, result: 'recalled' }); ok(h.trips === 21, 'morale: a recalled crew counts no trip');
  }
  // ---- the load audit: a dismissed hire's crew comes home (COZY §9)
  { const st = fresh(); st.cozy.guild.level = 1;
    const h = GD.signOn(st, { i: 0, seed: 3, name: 'Rin', cls: 'scout', lvl: 3, taken: false }, 0), o = O.errandsFor(st, 0)[0];
    const e = X.startExpedition(st, o, ['hire:' + h.id], {}, { r: 1, need: 10, power: 10, odds: 'good', p: 0.8 });
    ok(!X.brokenExpeditions(st, id => O.objective(st, id)).length, 'load: a hire\'s expedition resumes');
    GD.dismiss(st, h.id); ok(X.brokenExpeditions(st, id => O.objective(st, id)).some(b => b.e === e && /hire/.test(b.why)), 'load: a crew whose hire left the roster comes home');
  }
  // ---- upgrades and tools (COZY §5.1, §7.1)
  { const lc = BUILDINGS.guild.levelCost;
    ok(!GD.upgradeCheck(0, lc, 4).ok && GD.upgradeCheck(1, lc, 2).why === 'Needs village rank 3' && GD.upgradeCheck(1, lc, 3).ok && GD.upgradeCheck(2, lc, 3).why === 'Needs village rank 4' && GD.upgradeCheck(3, lc, 5).max, 'upgrades: level 2 at rank 3, level 3 at rank 4, then it is the grandest');
    ok(GD.upgradeCheck(1, lc, 3, () => false).poor && JSON.stringify(GD.upgradeCheck(2, lc, 4).cost) === JSON.stringify(lc[2]), 'upgrades: the cost is the catalog\'s');
    const P = [1, 2, 3].map(GD.levelPerks);
    ok(P.map(p => p.roster).join() === '3,6,9' && P.map(p => p.crew).join() === '4,4,5' && P.map(p => p.levelCap).join() === '20,30,40' && P.map(p => p.power).join() === '5,10,15', 'upgrades: each level: the roster, the crew size, the hire level cap, the power bonus');
    ok(Object.keys(GD.GUILD_TOOLS).join() === 'basket,bandana' && Object.values(GD.GUILD_TOOLS).every(t => t.cost.coins > 0 && !t.cost.bone && !t.cost.crystal && !t.cost.lantern), 'tools: the Forager\'s Basket and Shadow\'s Bandana, no combat-only material');
  }
}

hr('COZY: THE STORY REROUTED (docs/COZY.md §3, ROADMAP CZ-9)');
{
  const CS = await import('../src/cozy/state.js'), O = await import('../src/cozy/objectives.js'), X = await import('../src/cozy/expeditions.js');
  const Z = await import('../src/rpg/zones.js'), ZP = await import('../src/rpg/zoneProgress.js'), F = await import('../src/home/furniture.js');
  const fresh = () => CS.normalizeCozy(Z.normalizeZones(normalizeHeroes(newGameState())));
  const town = { rank: 1, pop: 5, built: {}, guild: 0 };
  ok(['bamboo', 'maple', 'tidepool', 'onsen'].every(z => O.STORY_READY.has(`relief:${z}`)), 'sieges: all four reliefs are on the Board (phase A offered Takemori only)');
  // ---- the Blossom Hollow story's fights (COZY §3.1)
  { const st = fresh(); st.flags.mokaJoined = true;
    st.quests = { active: [{ id: 'burrow1', step: 0, prog: 0 }], done: ['welcome'], requests: {} };
    const L = O.storyObjectives(st), b1 = L.find(o => o.id === 'quest:burrow1');
    ok(b1 && b1.kind === 'quest' && b1.power === 12 && b1.hours === 2 && b1.binds.quest === 'burrow1' && b1.supplies.freeLunch && b1.rewards.mochi === 3, 'burrow1: "Peek into the Burrow" on the Board: power 12, 2 h, Rosie packs the lunch, the 3 Mochi Jelly come home');
    const c = X.canSend(st, b1, ['hero:moka'], {}, town);
    ok(c.ok && c.crewPower.fed && c.odds.key === 'good', 'burrow1: Moka at level 1 alone, fed by Rosie\'s lunch: good odds', { r: c.r, odds: c.odds.key });
    st.quests.active[0].prog = 4; ok(O.objectivePower(st, b1) === 6, 'burrow1: your kills count (4 of 8 made: half the need)');
    st.quests.active[0] = { id: 'burrow1', step: 1, prog: 0 }; ok(O.objectivePower(st, b1) === 3 && O.objectiveOpen(st, b1), 'burrow1: only the Mochi Jelly left: a quarter of the need');
    let s = 3; const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const L1 = X.rollLoot(b1, 'success', rng), L2 = X.rollLoot(b1, 'partial', rng);
    ok(L1.mats.mochi >= 3 && L2.mats.mochi >= 2 && !L1.trophy, 'burrow1: the crew brings the Mochi Jelly (half of it on a partial)');
    st.quests.active = [{ id: 'homes', step: 0, prog: 0 }]; ok(!O.storyObjectives(st).some(o => o.binds?.quest), 'routes: a quest with nothing to fight (homes) has no crew route');
    st.quests = { active: [{ id: 'king', step: 0, prog: 0 }], done: ['welcome', 'burrow1', 'homes', 'lights'], requests: {} };
    const K = O.objective(st, 'quest:king');
    ok(K.kind === 'burrowBoss' && K.power === 60 && K.hours === 6 && K.rewards.trophy === 'trophyMochiCrown' && K.rewards.items.join() === 'magic,magic,rare' && K.boss === 'mochiKing' && K.supplies.meals === 1, 'king: power 60 (floor 5 × 12), 6 h, a lunch each; brings King Mochi\'s crown cushion, 2 magic and a rare (no unique, no gem)');
    ok(X.gateCheck(K.gates[0], st, town, [], {}).ok && !X.gateCheck(K.gates[0], { quests: { done: [] } }, town, [], {}).ok, 'king: its gate is "A Home for Everyone" done (a quest gate)');
    st.quests.active[0].step = 1; ok(O.objectivePower(st, K) === 42, 'king: once the floor is reached (by you or a crew), 30% less');
    ok(X.partialProgress(st, K, 0.8).quest === 'king', 'king: a partial keeps the quest\'s progress (Story.crewResult: the floor reached)');
    const T = O.objective(st, 'quest:tails'), U = O.objective(st, 'quest:umbrella'), N = O.objective(st, 'quest:oni');
    ok(U.power === 120 && N.power === 180 && T.power === 240 && T.hours === 10 && T.deep && N.gates.some(g => g.kind === 'pop' && g.n === 30) && T.gates.some(g => g.kind === 'guild' && g.n === 2) && T.gates.some(g => g.kind === 'rank' && g.n === 4), 'umbrella / oni / tails: powers 120 / 180 / 240, the Hot Spring and 30 villagers, Guild L2 and rank 4; Tamamo wakes the Deep Burrow');
    const Lk = X.rollLoot(K, 'success', rng), Lp = X.rollLoot(K, 'partial', rng);
    ok(Lk.trophy === 'trophyMochiCrown' && !Lp.trophy && !JSON.stringify(Lk).includes('unique') && !JSON.stringify(Lk).includes('gem'), 'trophies: a full success brings the keepsake; never a unique or a gem');
  }
  // ---- the zone dungeons' first clears (COZY §3.2)
  { const st = fresh(); st.flags.mokaJoined = st.flags.poeJoined = true; st.heroes.moka.player.lvl = 8;
    ok(!O.storyObjectives(st).some(o => o.kind === 'dungeon'), 'dungeon: no clear on offer while Takemori is besieged');
    Z.saveVillage(st, 'bamboo', 'crew');
    const D = O.storyObjectives(st).find(o => o.id === 'dungeon:bamboo');
    ok(D && D.power === 144 && D.hours === 10 && D.level === 8 && D.rewards.trophy === 'trophyTenguFan' && D.supplies.potionsNeed === 2 && D.gates[0].kind === 'rank', 'dungeon: "Clear the Bamboo Depths" once Takemori is saved: level 8, power 144, 10 h, rank 2, a lunch each and 2 Heart Treats; the Tengu\'s fan');
    st.pantry = { onigiri: 2 }; st.heroes.poe.player.lvl = 7;
    ok(/Heart Treats/.test(X.canSend(st, D, ['hero:moka', 'hero:poe'], { meals: { onigiri: 2 } }, { rank: 2 }).why) && X.canSend(st, D, ['hero:moka', 'hero:poe'], { meals: { onigiri: 2 }, potions: 2 }, { rank: 2 }).ok, 'dungeon: it needs the 2 Heart Treats packed');
    Z.noteFloor(st, 'bamboo', 2); ok(O.objectivePower(st, D) === 101, 'dungeon: floor 2 reached (your run, or a crew\'s partial): 30% less');
    const r = Z.recordCrewClear(st, 'bambooDepths'), d = st.zones.bamboo.dungeon;
    ok(r.tierUnlocked === 1 && d.crew === 1 && d.cleared === 0 && d.tier.cleared.includes(0) && Z.tierOpen(st, 'bambooDepths') === 1, 'dungeon: a crew\'s clear counts dungeon.crew, wakes the Lantern (T1), and leaves dungeon.cleared at 0');
    ok(ZP.openedByPrev(st, 'maple') && !O.storyObjectives(st).some(o => o.id === 'dungeon:bamboo'), 'dungeon: it opens the next zone (openedByPrev reads dungeon.crew) and leaves the Board');
    const rc = Z.recordDungeonClear(st, 'bambooDepths', 0);
    ok(rc.first === true && d.cleared === 1, 'dungeon: your own first clear afterwards is still the first (the boss unique: dungeon/zoneRun.js)');
    const st2 = Z.normalizeZones({ zones: { maple: { dungeon: { crew: 1 } } } });
    ok(st2.zones.maple.dungeon.tier.unlocked === 1 && st2.zones.maple.dungeon.tier.cleared.includes(0), 'dungeon: a saved crew clear keeps its Lantern awake on load (fillTiers)');
    const dp = Z.recordCrewClear(st, 'burrowDeep'); ok(dp.tierUnlocked === 1 && Z.tierOpen(st, 'burrowDeep') === 1 && (st.dungeon.deepest || 0) < 21, 'Tamamo by a crew: the Deep Burrow\'s Lantern wakes (T1), the Burrow\'s deepest floor untouched');
  }
  // ---- the zone villagers' quests (COZY §3.2)
  { const st = fresh(); st.heroes.moka.player.lvl = 6; st.flags.mokaJoined = true; Z.saveVillage(st, 'bamboo');
    st.quests = { active: [{ id: 'tk_ledger', step: 0, prog: 0 }, { id: 'tk_windScroll', step: 0, prog: 4 }, { id: 'tk_kome', step: 0, prog: 0 }, { id: 'tk_roots', step: 0, prog: 0 }, { id: 'tk_tengu', step: 0, prog: 0 }], done: [], requests: {} };
    const L = O.villageObjectives(st), ids = L.map(o => o.id);
    ok(ids.join() === 'zq:tk_ledger:0,zq:tk_windScroll:0,zq:tk_kome:0,zq:tk_roots:0', 'village quests: one route per step in the dungeon (a find, a kill count, a rescue, a floor); the boss waits for the dungeon\'s own clear route', ids);
    const Fd = L[0], K = L[1], Rs = L[2];
    ok(Fd.kind === 'quest' && Fd.level === 7 && Fd.power === 63 && Fd.hours === 4 && Fd.tags.includes('find') && Fd.rewards.questItem === 'tk_ledger' && Fd.name === "Find Chiku's Ledger", 'village quests: "Find Chiku\'s Ledger": level 7 (the band + 3), power 63, 4 h, a Scout suits it');
    ok(Rs.tags.includes('rescue') && Rs.rewards.rescue === 'tk_kome' && Rs.name === 'Bring Kome home', 'village quests: "Bring Kome home" (a Healer suits it)');
    ok(O.objectivePower(st, K) === Math.round(63 * (1 - 4 / 12)) && K.name === 'Teach 12 Kamaitachi some manners', 'village quests: your kills count (4 of 12: two thirds of the need)');
    const D = O.objective(st, 'dungeon:bamboo'); void D;
    st.zones.bamboo.dungeon.crew = 1; ok(O.villageObjectives(st).some(o => o.id === 'zq:tk_tengu:0' && o.kind === 'dungeon' && o.power === 144), 'village quests: once the dungeon is cleared, a boss step gets its own route (dungeon power)');
    st.quests.active[0].step = 1; ok(!O.objectiveOpen(st, Fd) && !O.villageObjectives(st).some(o => o.id === 'zq:tk_ledger:0'), 'village quests: the turn-in talk is yours (no route), and a step done takes its route off the Board');
    const tr = { ...Rs, trail: true }; ok(X.oddsOf(0.92, tr).key === 'sure' && X.oddsOf(0.8, tr).key === 'risky', 'village quests: a partial finds the trail: the next try is a sure thing at r ≥ 0.9');
    ok(X.partialProgress(st, Rs, 0.8).trail === true, 'village quests: a rescue\'s partial finds the trail');
  }
  // ---- homestead XP (COZY §3.3)
  { const H = await import('../src/cozy/homesteadXp.js');
    ok(H.homeXpBase('harvest', { crop: 'turnip', n: 1 }) === 6 && H.homeXpBase('harvest', { crop: 'carrot', n: 2 }) === 18, 'homestead XP: a harvest pays 3 × the crop\'s days (each)');
    ok(H.homeXpBase('cook', { n: 2 }) === 8 && H.homeXpBase('build', { free: false }) === 8 && H.homeXpBase('build', { free: true }) === 0 && H.homeXpBase('gather') === 1 && H.homeXpBase('dig') === 4, 'homestead XP: a dish 4, a building you place 8 (the town\'s own growth 0), a gather 1, a dig 4');
    ok(H.homeXpBase('fish', { id: 'crucian' }) === 4 && H.homeXpBase('fish', { id: 'moonKoi' }) === 12, 'homestead XP: a fish 4–12 by its rarity');
    ok(H.homeXp(4, 1) === 4 && H.homeXp(4, 10) === 8 && H.homeXp(4, 30) === 16 && H.homeXp(0, 9) === 0, 'homestead XP: × (1 + level / 10)');
  }
  // ---- the sieges' trophies and the keepsakes (COZY §4.6)
  { const st = fresh();
    ok(['bamboo', 'maple', 'tidepool', 'onsen'].every(z => F.FURNITURE[O.objective(st, `relief:${z}`).rewards.trophy]?.mount === 'wall'), 'trophies: every relief brings its captain\'s torn banner (a wall piece)');
    ok(Object.values(O.DUNGEON_ROUTES).every(R => F.FURNITURE[R.trophy]) && Object.values(O.BURROW_ROUTES).filter(B => B.trophy).every(B => F.FURNITURE[B.trophy]), 'trophies: every Burrow boss and zone boss has its keepsake');
    ok(F.TROPHY_IDS.length === 12 && F.TROPHY_IDS.every(id => F.FURNITURE[id].shop === false && F.FURNITURE[id].set === 'trophy' && F.shopRank(F.FURNITURE[id]) === 0 && F.storable(id)), 'trophies: 12 keepsakes (4 Burrow bosses, 4 zone bosses, 4 captains), never sold, kept in storage like furniture');
  }
}

hr('RESULT');
if (fails) {
  log(`FAILED ${fails}/${checks} checks:`);
  for (const [m, n] of [...errs].slice(0, 60)) log(`  ✗ ${m}${n > 1 ? ` (x${n})` : ''}`);
  process.exit(1);
}
log(`ALL ${checks} CHECKS PASSED`);
