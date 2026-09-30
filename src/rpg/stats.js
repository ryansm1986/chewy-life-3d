// Derived stats, monster scaling, hit rolls and mitigation.
//
// computeStats(state) → derived. Every key from docs/ARCHITECTURE.md is present:
//   str dex vit ene          total attributes (base + items + set bonuses)
//   lifeMax zoomMax          maximum life / zoom (mana)
//   lifeRegen zoomRegen      FINAL regeneration in points PER SECOND
//   dmgMin dmgMax            FINAL rolled weapon damage range (weapon base + flat adds, × (1 + (dmgPct + str/dex bonus)/100))
//   dmgPct                   total "+% damage" from items, sets and masteries (str/dex bonus is separate: statDmgPct)
//   aspd                     FINAL attacks per second (weapon aspd × diminishing IAS)
//   atkSpeed castSpeed       % increased attack speed / % faster cast rate (raw sums; see atkMul/castMul for multipliers)
//   moveSpeed                % faster run (raw sum; moveMul is the clamped multiplier to apply to base walk speed)
//   crit                     % chance to crit (cap 75). critDmg = % bonus damage on crit (base 50 → crits deal ×1.5; see critMul)
//   def block                total defense; % chance to block (cap 60)
//   resFire resFrost resZap resStink   % resistances, clamped to [-100, 75]
//   lifeSteal zoomSteal      % of damage dealt returned as life / zoom
//   fireDmg frostDmg zapDmg stinkDmg   [min,max] added elemental damage per hit (scaled by the skill's dmgPct)
//   mf gf thorns xpBonus     % magic find, % extra coins, flat damage returned to melee attackers, % xp
//   allSkills treeSkills:{bone,fetch,spirit}   +skill levels
//   pierce                   extra enemies a thrown ball passes through (count)
//   cdr                      % cooldown reduction (cap 50)
//   lifeOnKill               life restored per kill
//   shadowDmg shadowLife     % bonus damage / life for Shadow (and spirit pups)
//   weaponType               'sword' | 'ball' (unarmed counts as 'sword')
// Extras (safe to ignore): lvl, resAll, skillBonus{id:n}, statDmgPct, critMul, atkMul, castMul, moveMul, ballSpeed (mult),
//   unarmed, weaponSlot, skillLevels{id:effLvl}, synergy{id:mult}, frenzy{perStack,maxStacks,duration}|null,
//   auras[{id,lvl,radius,...}], setCounts{setId:n}, dmgAvg.
//
// Affix value semantics (item affixes add into these; only computeStats interprets them):
//   dmgMin/dmgMax = flat added to weapon base damage; def = flat defense (enhanced-defense affixes are pre-converted
//   to flat by items.js); zoomRegen = % increased zoom regeneration; lifeRegen = flat life/s; resAll adds to all 4 resists;
//   'treeSkills.bone' / 'skillBonus.packcall' dotted keys add into the nested objects.
import { SKILLS, SKILL_IDS, effectiveLevel, synergyMult } from './skills.js';
import { SETS, EQUIP_SLOTS } from './items.js';
import { CLASSES } from './classes.js';
import { mokaPassives } from './skillsMoka.js';

export const LEVEL_CAP = 60;
export const RES_CAP = 75;
export const ELEMENTS = ['phys', 'fire', 'frost', 'zap', 'stink', 'holy'];
export const RES_KEY = { fire: 'resFire', frost: 'resFrost', zap: 'resZap', stink: 'resStink' };
export const ELEM_DMG_KEY = { fire: 'fireDmg', frost: 'frostDmg', zap: 'zapDmg', stink: 'stinkDmg' };
export const ELEMENT_COLORS = { phys: '#fff6e8', fire: '#ff9a3c', frost: '#8fd0ff', zap: '#ffe44a', stink: '#9ee05a', holy: '#fff0a8' };
export const ELEMENT_NAMES = { phys: 'Physical', fire: 'Fire', frost: 'Frost', zap: 'Zap', stink: 'Stink', holy: 'Holy' };

/** Keys required by the contract (docs/ARCHITECTURE.md). */
export const DERIVED_KEYS = ['str', 'dex', 'vit', 'ene', 'lifeMax', 'zoomMax', 'lifeRegen', 'zoomRegen', 'dmgMin', 'dmgMax', 'dmgPct', 'aspd',
  'atkSpeed', 'castSpeed', 'moveSpeed', 'crit', 'critDmg', 'def', 'block', 'resFire', 'resFrost', 'resZap', 'resStink', 'lifeSteal',
  'zoomSteal', 'fireDmg', 'frostDmg', 'zapDmg', 'stinkDmg', 'mf', 'gf', 'thorns', 'allSkills', 'treeSkills', 'xpBonus', 'pierce', 'cdr',
  'lifeOnKill', 'shadowDmg', 'shadowLife', 'weaponType'];
const ARRAY_STATS = new Set(['fireDmg', 'frostDmg', 'zapDmg', 'stinkDmg']);
const NOT_AFFIXABLE = new Set(['aspd', 'treeSkills', 'weaponType']);
/** Stat keys an item affix may use. */
export const AFFIX_STATS = [...DERIVED_KEYS.filter(k => !NOT_AFFIXABLE.has(k)), 'resAll'];
export function isAffixStat(k) {
  if (AFFIX_STATS.includes(k)) return true;
  const [a, b] = String(k).split('.');
  if (a === 'treeSkills') return ['bone', 'fetch', 'spirit'].includes(b);
  if (a === 'skillBonus') return !!SKILLS[b];
  return false;
}
export const isArrayStat = k => ARRAY_STATS.has(k);

// ------------------------------------------------------------------ helpers
const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const toRand = rng => (!rng ? Math.random : typeof rng === 'function' ? rng : () => rng.next());

function newAcc() {
  const a = { treeSkills: { bone: 0, fetch: 0, spirit: 0 }, skillBonus: {} };
  for (const k of AFFIX_STATS) a[k] = ARRAY_STATS.has(k) ? [0, 0] : 0;
  return a;
}
/** Add one stat into an accumulator (supports arrays and dotted keys). */
export function addStat(acc, stat, value) {
  if (value == null) return;
  if (stat.includes('.')) {
    const [a, b] = stat.split('.');
    acc[a] = acc[a] || {};
    acc[a][b] = (acc[a][b] || 0) + value;
    return;
  }
  if (Array.isArray(value)) {
    const t = acc[stat] || (acc[stat] = [0, 0]);
    t[0] += value[0]; t[1] += value[1];
  } else acc[stat] = (acc[stat] || 0) + value;
}

/** Effective IAS / FCR / FRW with D2-style diminishing returns. */
const diminish = (v, k) => (v > 0 ? (k * v) / (k + v) : v);

// ------------------------------------------------------------------ player
export const BASE_ATTR = { str: 10, dex: 10, vit: 12, ene: 8 };
export const lifeFormula = (vit, lvl) => 40 + vit * 4 + lvl * 6;
export const zoomFormula = (ene, lvl) => 20 + ene * 2.5 + lvl * 2;

export function computeStats(state) {
  const P = state.player;
  const CL = CLASSES[P.cls || 'chewy'] || CLASSES.chewy;
  const eq = state.equipment || {};
  const lvl = P.lvl || 1;
  const weaponSlot = P.activeWeapon === 1 ? 'weaponAlt' : 'weapon';
  const acc = newAcc();
  let itemDef = 0;
  const setCounts = {};
  for (const slot of EQUIP_SLOTS) {
    if ((slot === 'weapon' || slot === 'weaponAlt') && slot !== weaponSlot) continue;
    const it = eq[slot];
    if (!it) continue;
    if (it.def) itemDef += it.def;
    for (const a of it.affixes || []) addStat(acc, a.stat, a.value);
    if (it.setId) setCounts[it.setId] = (setCounts[it.setId] || 0) + 1;
  }
  // set bonuses (partial thresholds + full set)
  for (const sid in setCounts) {
    const S = SETS[sid];
    if (!S) continue;
    for (const b of setBonusesActive(sid, setCounts[sid])) addStat(acc, b.stat, b.value);
  }

  const d = {};
  d.lvl = lvl;
  d.str = P.stats.str + acc.str;
  d.dex = P.stats.dex + acc.dex;
  d.vit = P.stats.vit + acc.vit;
  d.ene = P.stats.ene + acc.ene;
  d.allSkills = acc.allSkills;
  d.cls = CL.id;
  d.treeSkills = {};
  for (const t of ['bone', 'fetch', 'spirit', 'tide', 'star', 'duck']) d.treeSkills[t] = acc.treeSkills[t] || 0;
  d.skillBonus = { ...acc.skillBonus };

  // skill levels & synergies
  d.skillLevels = {};
  d.synergy = {};
  for (const id of SKILL_IDS) {
    d.skillLevels[id] = effectiveLevel(id, state, d);
    d.synergy[id] = synergyMult(id, state);
  }
  const L = id => d.skillLevels[id] || 0;
  const SP = id => SKILLS[id].params(L(id), d);

  // weapon
  const w = eq[weaponSlot];
  d.weaponSlot = weaponSlot;
  d.unarmed = !w;
  d.weaponType = w ? w.wtype : (CL.weapons[0] === 'staff' ? 'staff' : 'sword'); // bare paws: the class's own style
  let masteryPct = 0, masteryCrit = 0;
  d.ballSpeed = 1;
  let extraPierce = 0;
  if (d.weaponType === 'sword' && L('boneMastery') > 0) {
    const p = SP('boneMastery'); masteryPct += p.dmgPct; masteryCrit += p.crit;
  }
  if (d.weaponType === 'ball' && L('fetchMastery') > 0) {
    const p = SP('fetchMastery'); masteryPct += p.dmgPct; masteryCrit += p.crit; d.ballSpeed = 1 + p.ballSpeed / 100; extraPierce += p.pierce;
  }
  d.dmgPct = acc.dmgPct + masteryPct;
  d.statDmgPct = d[CL.dmgStat[d.weaponType] || 'str'] || 0; // 1% per point, like D2 (Str sword, Dex ball, Ene staff)
  const wd = w ? w.dmg : [1, 3];
  const mult = Math.max(0.1, 1 + (d.dmgPct + d.statDmgPct) / 100);
  d.dmgMin = Math.max(1, Math.round((wd[0] + acc.dmgMin) * mult));
  d.dmgMax = Math.max(d.dmgMin + 1, Math.round((wd[1] + acc.dmgMax) * mult));
  d.dmgAvg = (d.dmgMin + d.dmgMax) / 2;

  d.atkSpeed = acc.atkSpeed;
  d.atkMul = r2(Math.max(0.4, 1 + diminish(d.atkSpeed, 120) / 100));
  d.aspd = r2((w ? w.aspd : 1.2) * d.atkMul);
  d.castSpeed = acc.castSpeed;
  d.castMul = r2(Math.max(0.5, 1 + diminish(d.castSpeed, 120) / 100));
  d.moveSpeed = acc.moveSpeed;
  d.moveMul = r2(clamp(1 + diminish(d.moveSpeed, 150) / 100, 0.5, 2));

  d.crit = r1(clamp(5 + d.dex * 0.1 + acc.crit + masteryCrit, 0, 75));
  d.critDmg = 50 + acc.critDmg;
  d.critMul = r2(1 + d.critDmg / 100);

  // defense & block (Stubborn Guard)
  let defPct = 0, block = acc.block;
  if (L('guard') > 0) { const g = SP('guard'); defPct += g.defPct; block += g.block; }
  d.def = Math.round((itemDef + acc.def + d.dex / 4) * (1 + defPct / 100));
  d.block = r1(clamp(block, 0, 60));

  // resistances (+ Good Boy Aura)
  d.auras = [];
  let auraRes = 0, auraRegen = 0;
  if (L('goodboy') > 0) {
    const g = SP('goodboy');
    auraRes = g.resAll; auraRegen = g.lifeRegen;
    d.auras.push({ id: 'goodboy', lvl: L('goodboy'), radius: g.radius, resAll: g.resAll, lifeRegen: g.lifeRegen, color: '#fff0a8' });
  }
  d.resAll = acc.resAll + auraRes;
  for (const e of ['Fire', 'Frost', 'Zap', 'Stink']) d['res' + e] = Math.round(clamp(acc['res' + e] + d.resAll, -100, RES_CAP));

  // life / zoom
  d.lifeMax = Math.round(CL.life(d.vit, lvl) + acc.lifeMax);
  d.zoomMax = Math.round(CL.zoom(d.ene, lvl) + acc.zoomMax);
  d.lifeRegen = r1(d.vit * 0.03 + acc.lifeRegen + auraRegen);
  d.zoomRegen = r2((d.zoomMax * 0.025 + 0.5) * Math.max(0, 1 + acc.zoomRegen / 100));

  d.lifeSteal = r1(clamp(acc.lifeSteal, 0, 30));
  d.zoomSteal = r1(clamp(acc.zoomSteal, 0, 30));
  for (const k of ARRAY_STATS) {
    const v = acc[k];
    d[k] = [Math.round(v[0]), Math.round(Math.max(v[0], v[1]))];
  }
  d.mf = acc.mf;
  d.gf = acc.gf;
  d.thorns = acc.thorns;
  d.xpBonus = acc.xpBonus;
  d.pierce = acc.pierce + extraPierce;
  d.cdr = clamp(acc.cdr, 0, 50);
  d.lifeOnKill = acc.lifeOnKill;
  d.shadowDmg = acc.shadowDmg;
  d.shadowLife = acc.shadowLife;
  if (L('packcall') > 0) { const p = SP('packcall'); d.shadowDmg += p.shadowDmg; d.shadowLife += p.shadowLife; }
  d.frenzy = L('frenzy') > 0 ? SP('frenzy') : null;
  d.setCounts = setCounts;
  d.treeDmgPct = { tide: 0, star: 0, duck: 0 };
  if (CL.id === 'moka') mokaPassives(d, L, state);
  return d;
}

/** Active set bonus stat list for a set with `count` pieces equipped. */
export function setBonusesActive(setId, count) {
  const S = SETS[setId];
  const out = [];
  if (!S) return out;
  for (const tier of S.bonuses) {
    const need = tier.n === 'full' ? S.pieces.length : tier.n;
    if (count >= need) for (const s of tier.stats) out.push(s);
  }
  return out;
}

// ------------------------------------------------------------------ xp curve
/** XP needed to go from `lvl` to `lvl+1`. */
export function xpToNext(lvl) {
  if (lvl >= LEVEL_CAP) return Infinity;
  return Math.round(60 * Math.pow(lvl, 1.9) + 40 * lvl);
}
/** XP awarded for a kill, with D2-style level-difference penalty. */
export function xpForKill(baseXp, monsterLevel, playerLevel) {
  const diff = playerLevel - monsterLevel;
  let m = 1;
  if (diff > 5) m = Math.max(0.05, 1 - (diff - 5) * 0.12);
  else if (diff < -5) m = Math.max(0.3, playerLevel / monsterLevel);
  return Math.max(1, Math.round(baseXp * m));
}

// ------------------------------------------------------------------ monsters
export const MONSTER_KINDS = {
  mochi: { name: 'Mochi Slime', life: 1.0, dmg: 0.8, def: 0.8, speed: 0.85, xp: 1.0, element: 'phys', res: { frost: 20 } },
  dust: { name: 'Dust Bunny', life: 0.6, dmg: 0.7, def: 0.5, speed: 1.35, xp: 0.8, element: 'phys', res: { stink: 25 } },
  lantern: { name: 'Lantern Ghost', life: 0.75, dmg: 1.1, def: 0.6, speed: 1.0, xp: 1.2, element: 'fire', res: { fire: 50, frost: -10 }, ranged: true },
  kasa: { name: 'Kasa-obake', life: 1.0, dmg: 1.0, def: 1.0, speed: 1.1, xp: 1.1, element: 'frost', res: { frost: 40, zap: -20 } },
  kinoko: { name: 'Kinoko', life: 1.2, dmg: 0.9, def: 1.0, speed: 0.8, xp: 1.1, element: 'stink', res: { stink: 60, fire: -25 } },
  oni: { name: 'Oni Imp', life: 1.1, dmg: 1.35, def: 1.2, speed: 1.05, xp: 1.3, element: 'phys', res: { fire: 30 } },
  tanuki: { name: 'Tanuki Bandit', life: 1.0, dmg: 1.1, def: 1.1, speed: 1.15, xp: 1.2, element: 'phys', res: { zap: 25 } },
  kitsune: { name: 'Fox Fire', life: 0.85, dmg: 1.2, def: 0.8, speed: 1.2, xp: 1.25, element: 'fire', res: { fire: 40, holy: -20 }, ranged: true },
};
export const RANKS = {
  normal: { life: 1, dmg: 1, def: 1, xp: 1, speed: 1, res: 0 },
  champion: { life: 3, dmg: 1.5, def: 1.2, xp: 3, speed: 1.1, res: 0 },
  unique: { life: 4.5, dmg: 1.7, def: 1.35, xp: 5, speed: 1.05, res: 10 },
  boss: { life: 18, dmg: 2.0, def: 1.5, xp: 30, speed: 1, res: 15 },
};
export const monsterLifeBase = L => 14 * (1 + 0.28 * (L - 1)) * Math.pow(1.04, L - 1);
export const monsterDmgBase = L => 3 * (1 + 0.16 * (L - 1)) * Math.pow(1.03, L - 1);

/**
 * Monster stats for a level/rank/kind.
 * → { level, rank, kind, name, life, dmg:[a,b], def, xp, speedMul, element, ranged, res:{phys,fire,frost,zap,stink,holy},
 *     mods:[], lifeSteal:0, ...mod flags }
 */
export function monsterStats(level, rank = 'normal', kind) {
  const L = Math.max(1, Math.round(level));
  const R = RANKS[rank] || RANKS.normal;
  const K = MONSTER_KINDS[kind] || { name: 'Yokai', life: 1, dmg: 1, def: 1, speed: 1, xp: 1, element: 'phys', res: {} };
  const avg = monsterDmgBase(L) * K.dmg * R.dmg;
  const res = { phys: 0, fire: 0, frost: 0, zap: 0, stink: 0, holy: 0 };
  for (const e in K.res) res[e] = K.res[e];
  if (R.res) for (const e of ['fire', 'frost', 'zap', 'stink', 'holy']) res[e] += R.res;
  return {
    level: L, rank, kind: kind || null, name: K.name,
    life: Math.round(monsterLifeBase(L) * K.life * R.life),
    dmg: [Math.max(1, Math.round(avg * 0.75)), Math.max(2, Math.round(avg * 1.25))],
    def: Math.round((4 + L * 4.5) * K.def * R.def),
    xp: Math.round((8 * Math.pow(L, 1.35) + 4) * K.xp * R.xp),
    speedMul: r2(K.speed * R.speed),
    element: K.element, ranged: !!K.ranged,
    res, mods: [], lifeSteal: 0,
  };
}

/**
 * Champion / unique modifiers (D2 style). apply(stats) mutates & returns the stats object and pushes the id into stats.mods.
 * Behaviour flags the game loop should read: stats.onDeath ('fireNova'), stats.aura ({element, radius, slow, dps}),
 * stats.onHit ('zapBurst' | 'curse' | 'knockback'), stats.teleport (seconds between blinks), stats.multishot (projectiles),
 * stats.lifeSteal (% of damage dealt), stats.curse ({dmgTakenPct, duration}), stats.knockback (m), stats.dmgFire ([a,b] extra).
 */
export const MONSTER_MODS = {
  fast: { name: 'Extra Fast', desc: 'Moves and attacks much faster.', color: '#8fe0c0',
    apply(s) { s.speedMul = r2(s.speedMul * 1.5); s.atkMul = (s.atkMul || 1) * 1.3; s.mods.push('fast'); return s; } },
  fireEnchanted: { name: 'Fire Enchanted', desc: 'Adds fire to its attacks and explodes when it dies.', color: '#ff9a3c',
    apply(s) { s.dmgFire = [Math.round(s.dmg[0] * 0.5), Math.round(s.dmg[1] * 0.8)]; s.res.fire = 75; s.life = Math.round(s.life * 1.1); s.onDeath = 'fireNova'; s.mods.push('fireEnchanted'); return s; } },
  frostAura: { name: 'Frosty Aura', desc: 'A chilly aura slows and nips everything nearby.', color: '#8fd0ff',
    apply(s) { s.aura = { element: 'frost', radius: 4, slow: 0.35, dps: Math.round(s.dmg[1] * 0.12) }; s.res.frost = 75; s.mods.push('frostAura'); return s; } },
  zapBurst: { name: 'Zappy', desc: 'Releases crackling sparks whenever it is hit.', color: '#ffe44a',
    apply(s) { s.onHit = 'zapBurst'; s.zapBurst = { count: 5, dmg: [1, Math.round(s.dmg[1] * 1.2)] }; s.res.zap = 75; s.mods.push('zapBurst'); return s; } },
  stoneskin: { name: 'Stone Skin', desc: 'Tough as a garden gnome. Greatly increased defense.', color: '#d9d0c8',
    apply(s) { s.def = Math.round(s.def * 3); s.res.phys = 30; s.mods.push('stoneskin'); return s; } },
  teleport: { name: 'Teleporting', desc: 'Blinks around the room in a puff of leaves.', color: '#c9b8ff',
    apply(s) { s.teleport = 3.5; s.mods.push('teleport'); return s; } },
  multishot: { name: 'Multishot', desc: 'Ranged attacks fire extra projectiles.', color: '#ffcf4a',
    apply(s) { s.multishot = 3; s.mods.push('multishot'); return s; } },
  vampiric: { name: 'Vampiric', desc: 'Steals life with every hit.', color: '#e8475c',
    apply(s) { s.lifeSteal = 35; s.mods.push('vampiric'); return s; } },
  cursed: { name: 'Cursed', desc: 'Its hits curse you: you take extra damage for a while.', color: '#b88aff',
    apply(s) { s.onHit = s.onHit || 'curse'; s.curse = { dmgTakenPct: 25, duration: 4 }; s.mods.push('cursed'); return s; } },
  extraStrong: { name: 'Extra Strong', desc: 'Hits really, really hard.', color: '#ff6a5a',
    apply(s) { s.dmg = s.dmg.map(v => Math.round(v * 1.75)); s.mods.push('extraStrong'); return s; } },
  bouncy: { name: 'Bouncy', desc: 'Its hits send you flying backwards. Boing!', color: '#ff8fb0',
    apply(s) { s.knockback = 3; s.onHit = s.onHit || 'knockback'; s.life = Math.round(s.life * 1.15); s.mods.push('bouncy'); return s; } },
};
export const MONSTER_MOD_IDS = Object.keys(MONSTER_MODS);

/** Roll modifiers for an elite (champion: 1, unique: 1–3 by level, others: 0) and apply them. Returns stats. */
export function applyRandomMods(stats, rng) {
  const r = toRand(rng);
  let n = stats.rank === 'champion' ? 1 : stats.rank === 'unique' ? 1 + (stats.level >= 20 ? 1 : 0) + (stats.level >= 40 ? 1 : 0) : 0;
  const pool = MONSTER_MOD_IDS.slice();
  if (!stats.ranged) pool.splice(pool.indexOf('multishot'), 1);
  while (n-- > 0 && pool.length) {
    const id = pool.splice(Math.floor(r() * pool.length), 1)[0];
    MONSTER_MODS[id].apply(stats);
  }
  return stats;
}

// ------------------------------------------------------------------ combat math
/** Fraction of physical damage a target's defense removes (player attacking monster). */
export const monsterPhysDR = (def, attackerLevel) => Math.min(0.5, def / (def + 60 + 16 * attackerLevel));
/** Fraction of physical damage the player's defense removes. */
export const playerPhysDR = (def, attackerLevel) => Math.min(0.6, def / (def + 50 + 15 * attackerLevel));

/**
 * Roll one hit from the player.
 * @param {object} o { derived, skillDmgPct=100, element='phys', target:{def,res,level}, rng, bonusPct=0 (buffs like Howl), noCrit }
 * @returns {{dmg:number, crit:boolean, element:string, parts:object, heal:number, zoom:number}}
 *   heal/zoom = life/zoom stolen from this hit (lifeSteal/zoomSteal applied).
 */
export function rollHit({ derived, skillDmgPct = 100, element = 'phys', target = {}, rng, bonusPct = 0, noCrit = false }) {
  const r = toRand(rng);
  const d = derived;
  const k = skillDmgPct / 100;
  const parts = { phys: 0, fire: 0, frost: 0, zap: 0, stink: 0, holy: 0 };
  const base = (d.dmgMin + (d.dmgMax - d.dmgMin) * r()) * k;
  parts[ELEMENTS.includes(element) ? element : 'phys'] += base;
  for (const e in ELEM_DMG_KEY) {
    const a = d[ELEM_DMG_KEY[e]];
    if (a && a[1] > 0) parts[e] += (a[0] + (a[1] - a[0]) * r()) * k;
  }
  const crit = !noCrit && r() * 100 < d.crit;
  const mul = (crit ? d.critMul || 1.5 : 1) * (1 + bonusPct / 100);
  const res = target.res || {};
  const tdef = target.def || 0;
  let total = 0, best = 'phys', bestV = -1;
  for (const e of ELEMENTS) {
    let v = parts[e] * mul;
    if (v <= 0) continue;
    if (e === 'phys') v *= 1 - monsterPhysDR(tdef, d.lvl || 1) - Math.min(0.9, (res.phys || 0) / 100);
    else v *= 1 - clamp(res[e] || 0, -100, 95) / 100;
    v = Math.max(0, v);
    parts[e] = v;
    total += v;
    if (v > bestV) { bestV = v; best = e; }
  }
  const dmg = Math.max(1, Math.round(total));
  return {
    dmg, crit, element: element !== 'phys' ? element : best, parts,
    heal: r1((dmg * (d.lifeSteal || 0)) / 100), zoom: r1((dmg * (d.zoomSteal || 0)) / 100),
  };
}

/** Damage the player actually takes from a raw hit after defense (phys) or resistance (elemental). Holy is unmitigated. */
export function playerDamageTaken(derived, rawDmg, element = 'phys', attackerLevel = 1) {
  let v = rawDmg;
  if (element === 'phys') v *= 1 - playerPhysDR(derived.def || 0, attackerLevel);
  else if (RES_KEY[element]) v *= 1 - clamp(derived[RES_KEY[element]] || 0, -100, RES_CAP) / 100;
  return Math.max(1, Math.round(v));
}
/** Block roll (derived.block %). Blocked hits should deal 0 and play a cute "boop!" reaction. */
export const rollBlock = (derived, rng) => toRand(rng)() * 100 < (derived.block || 0);
