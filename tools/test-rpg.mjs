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
import { CLASSES, HERO_IDS } from '../src/rpg/classes.js';
import { PANTRY, PANTRY_IDS, KINDS as PKINDS, CROPS, CROP_IDS, LOVED, sellPrice, seedDrops, forageDrops, pantryHas, pantryList } from '../src/life/pantry.js';
import { RECIPES, RECIPE_IDS, STATIONS, STARTERS, COOKBOOK, cookbookOf, knows, learn, spendFor, maxCook, haveOf, matchMix, fallbackMix, cookableAt, hintFor, teachesOf } from '../src/life/cooking.js';
import { BUFFS, mealFor, mealActive } from '../src/life/meals.js';
import { growNight, harvestCrop, isRipe, SPRINKLE } from '../src/life/gardenRules.js';
import { FISH, FISH_IDS, SPOTS, biters, rollFish, rollSize, recordCatch, timeOf, MILESTONES } from '../src/life/fishData.js';
import { ReelSim } from '../src/life/reelSim.js';
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
// two heroes (docs/HEROES.md): Chewy's three trees (bone / fetch / spirit) and Moka's (tide / star / duck), 21 skills each
ok(SKILL_IDS.length === 42 && TREES.length === 6, 'exactly 42 skills in 6 trees');
for (const h of HERO_IDS) ok(SKILL_IDS.filter(id => SKILLS[id].cls === h).length === 21, `${h} has 21 skills`);
for (const t of TREES) {
  const ids = SKILL_IDS.filter(id => SKILLS[id].tree === t.id);
  ok(ids.length === 7, `tree ${t.id} has 7 skills`);
  const cells = new Set(ids.map(id => SKILLS[id].row + ':' + SKILLS[id].col));
  ok(cells.size === 7, `tree ${t.id} cells unique`);
}
for (const id of ['chomp', 'boneMastery', 'whirl', 'dig', 'frenzy', 'bonestorm', 'throw', 'fetchMastery', 'ricochet', 'multi', 'blaze', 'fetchstorm', 'woof', 'goodboy', 'zoom', 'packcall', 'howl', 'moonhowl'])
  ok(!!SKILLS[id], `ported skill ${id} exists`);
const KINDS = ['active', 'passive', 'channel', 'aura', 'summon'], ELS = ['phys', 'fire', 'frost', 'zap', 'stink', 'holy'];
for (const id of [...SKILL_IDS, 'attack']) {
  const s = id === 'attack' ? ATTACK : SKILLS[id];
  ok(id === 'attack' || (s.row >= 0 && s.row <= 5 && s.col >= 0 && s.col <= 2), `${id} row/col in range`);
  ok(id === 'attack' || s.req === ROW_REQ[s.row], `${id} req matches row`);
  ok(KINDS.includes(s.kind), `${id} kind valid`);
  ok(ELS.includes(s.element), `${id} element valid`);
  ok([null, 'sword', 'ball', 'staff'].includes(s.wep) && (id === 'attack' || !s.wep || (s.wep === 'staff') === (s.cls === 'moka')), `${id} wep valid`);
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
  if (b.slot === 'weapon') ok(['sword', 'ball', 'staff'].includes(b.wtype) && fin(b.dmg[0]) && b.dmg[1] > b.dmg[0] && fin(b.aspd), `weapon ${id} stats`);
  if (['hat', 'outfit', 'boots', 'paws'].includes(b.slot)) ok(b.def && b.def[1] >= b.def[0], `armor ${id} def`);
  ok(b.tier === 0 ? b.lvl < 20 : b.tier === 1 ? b.lvl >= 20 && b.lvl < 40 : b.lvl >= 40, `base ${id} tier/lvl consistent`);
}
for (const slot of ['weapon', 'hat', 'outfit', 'collar', 'charm', 'boots', 'paws'])
  for (const t of [0, 1, 2]) ok(GEAR_BASE_IDS.some(id => ITEM_BASES[id].slot === slot && ITEM_BASES[id].tier === t), `slot ${slot} has tier ${t}`);
for (const wt of ['sword', 'ball', 'staff']) for (const t of [0, 1, 2]) ok(GEAR_BASE_IDS.some(id => ITEM_BASES[id].wtype === wt && ITEM_BASES[id].tier === t), `${wt} has tier ${t}`);
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
  ok(JSON.parse(JSON.stringify(S)).equipment.weapon.name === 'Bone Sword', 'state JSON-serialisable');
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
  ok(RECIPE_IDS.length === 15 && RECIPE_IDS.every(id => PANTRY[id]?.kind === 'dish') && PANTRY_IDS.filter(id => PANTRY[id].kind === 'dish').every(id => RECIPES[id]), 'recipes: one per dish');
  ok(STARTERS.join() === 'grilledFish,roastedVeggies,onigiri', 'recipes: the three starters');
  const MATS = new Set(MATERIAL_KEYS);
  for (const id of RECIPE_IDS) {
    const R = RECIPES[id], L = R.learn;
    ok(R.at.length && R.at.every(s => STATIONS[s]) && R.ing.length && R.ing.every(x => x.n >= 1 && (x.k === 'fish' || x.k === 'crop' || (x.k.startsWith('mat:') ? MATS.has(x.k.slice(4)) : !!PANTRY[x.k] && PANTRY[x.k].kind !== 'dish'))), `recipe ${id} stations + ingredients valid`);
    ok(L === 'starter' || !!(L.from || L.quest || L.book || L.request), `recipe ${id} can be learned`);
    ok(L === 'starter' || hintFor(id).how.length > 5, `recipe ${id} has a hint`);
    ok(!R.at.includes('oven') || R.at.length === 1, `recipe ${id}: baked goods only at the oven`);
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
  { let r1 = 0, r2 = 0; for (let k = 0; k < 80; k++) { if (bot(0.78, 'darter', 0.28, 1, 300 + k).done === 'catch') r1++; if (bot(0.78, 'darter', 0.36, 0.82, 300 + k).done === 'catch') r2++; }
    ok(r1 < 72 && r2 > r1, `reel: the Moon Koi is hard, easier with the Moonlit Rod (${r1} vs ${r2} of 80)`); }
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
  ok(FURNITURE_IDS.filter(id => FURNITURE[id].shop === false).every(id => Rc.recipeFor(id) || Fd.FIND_WHERE.some(w => Fd.FIND_TABLES[w].includes(id))), 'every never-sold piece can be crafted or found');
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

hr('CHARGED ABILITIES');
// docs/CHARGE.md: the tables, the rules (stage times, costs, gating), the balance layer and the DPS-band sim
{
  const Ch = await import('../src/rpg/charge.js');
  const Sim = await import('./charge-sim.mjs');
  const { CHARGE } = Ch, r1 = v => Math.round(v * 10) / 10;
  const ids = Object.keys(CHARGE);
  // ---- every active skill of both heroes charges, with a full table
  const actives = SKILL_IDS.filter(id => !['passive', 'aura'].includes(SKILLS[id].kind));
  ok(actives.every(id => CHARGE[id]) && ids.every(id => actives.includes(id)), `charge: a table for every active skill (${ids.length})`);
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
  const sx = Sim.simHero('chewy'), sm = Sim.simHero('moka');
  for (const id of ids) {
    const H = SKILLS[id].cls === 'moka' ? sm : sx, S = H.st;
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

hr('RESULT');
if (fails) {
  log(`FAILED ${fails}/${checks} checks:`);
  for (const [m, n] of [...errs].slice(0, 60)) log(`  ✗ ${m}${n > 1 ? ` (x${n})` : ''}`);
  process.exit(1);
}
log(`ALL ${checks} CHECKS PASSED`);
