// Zone modifiers (docs/ZONES.md §5, §5.1 as built; ROADMAP Z-E2): the player-picked run modifiers for tier and Spirit runs
// (Swarming, Stout, Haunted…), as DATA, plus the pure hook bodies. Pure (no three.js): node-tested in tools/test-rpg.mjs.
//
// Where each kind of effect acts:
//   layout   gen.js generate() → layoutMods(L, plan, rng): pack sizes (the tier's and Swarming's), extra packs (Teeming),
//            promotions (the tier's champion chance, Rally, Unique Hunt), extra chests (Treasure Trove) and shrines
//            (Cursed Shrines). Deterministic from the floor's seed, so gen-fuzz and the tests see what the game sees.
//   monster  monsterMods(mode, m) on every run monster as it is built (packs, bosses, boss adds, summons, ghosts): life,
//            damage, move and attack speed, resistances, the Elemental conversion (m._el); a boss also takes Boss's
//            Wrath's life and damage. The Spirit tier's stacking life / damage multipliers come in here too.
//   run      dungeon/tierRun.js reads R.run: Haunted (ghosts rise from the fallen), Night March (the dark grade, the
//            wider alert radius), Hard Ground (G.regenMul), Boss's Wrath's phase, Cursed Shrines (the shrine's curse), the
//            Elemental hit (combat.hitPlayer folds the extra element in) and every reward (rewardTotals).
// A run's picked mods are run.mods (dungeon/defs.js beginRun), resolved once per floor into mode.runMods (resolveRun).
import { RNG } from '../core/util.js';
import { runInfo, slotsFor } from './tiers.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/**
 * id → { name, jp, icon, color, desc (the effect), reward: { qty?, rarity?, xp?, boss? } (fractions), risk (0–3: how much
 *   harder it makes the run: the Lantern's "recommended" picks the gentle ones), group? (only one per group),
 *   layout?: { pack (× pack size), extraPacks (per room), champX (× champion packs), uniques (+ unique packs),
 *              chests (+ golden chests), shrines (+ shrines) },
 *   monster?: { life, dmg, speed, atk (multipliers), res (+ to every resistance), el, elPct (the Elemental conversion) },
 *   boss?: { life, dmg, wrath (the life fraction its wrath phase starts at) },
 *   run?: { haunted: { normal, elite, cap }, night, alertR, regen, curse: { pct, t } } }
 */
export const ZONE_MODS = {
  swarming: { name: 'Swarming', jp: '群れ', icon: 'swarm', color: '#ff9a5a', desc: 'Packs are 40% bigger', reward: { qty: 0.15, xp: 0.10 }, risk: 2, layout: { pack: 1.4 } },
  teeming: { name: 'Teeming', jp: '満員', icon: 'teem', color: '#ffb84a', desc: 'One extra pack in every room', reward: { qty: 0.10 }, risk: 2, layout: { extraPacks: 1 } },
  rally: { name: 'Rally', jp: '集結', icon: 'rally', color: '#6aa8ff', desc: 'Twice as many champion packs', reward: { rarity: 0.10 }, risk: 2, layout: { champX: 2 } },
  uniqueHunt: { name: 'Unique Hunt', jp: '大物', icon: 'crown', color: '#ffb030', desc: 'Two more unique packs on every floor', reward: { rarity: 0.15 }, risk: 2, layout: { uniques: 2 } },
  fierce: { name: 'Fierce', jp: '猛者', icon: 'fang', color: '#ff5a5a', desc: 'Monsters deal 30% more damage', reward: { xp: 0.10 }, risk: 3, monster: { dmg: 1.3 } },
  stout: { name: 'Stout', jp: '頑丈', icon: 'stout', color: '#c89a6a', desc: 'Monsters have 40% more life', reward: { qty: 0.10 }, risk: 2, monster: { life: 1.4 } },
  quick: { name: 'Quick', jp: '疾風', icon: 'quick', color: '#8fe0c0', desc: 'Monsters move and attack 25% faster', reward: { xp: 0.10 }, risk: 3, monster: { speed: 1.25, atk: 1.25 } },
  elementalFire: { name: 'Elemental: Fire', short: 'Fire-touched', jp: '火', icon: 'fire', color: '#ff8a3c', group: 'elemental', desc: 'Monsters deal 35% extra damage as fire', reward: { rarity: 0.08 }, risk: 2, monster: { el: 'fire', elPct: 0.35 } },
  elementalFrost: { name: 'Elemental: Frost', short: 'Frost-touched', jp: '氷', icon: 'frost', color: '#8fd0ff', group: 'elemental', desc: 'Monsters deal 35% extra damage as frost, and their hits chill', reward: { rarity: 0.08 }, risk: 2, monster: { el: 'frost', elPct: 0.35 } },
  elementalZap: { name: 'Elemental: Zap', short: 'Zap-touched', jp: '雷', icon: 'zap', color: '#ffe44a', group: 'elemental', desc: 'Monsters deal 35% extra damage as zap', reward: { rarity: 0.08 }, risk: 2, monster: { el: 'zap', elPct: 0.35 } },
  warded: { name: 'Warded', jp: '結界', icon: 'ward', color: '#b8a8ff', desc: 'Monsters have +20% to every resistance', reward: { qty: 0.08 }, risk: 1, monster: { res: 20 } },
  haunted: { name: 'Haunted', jp: '幽霊', icon: 'ghost', color: '#cfe8ff', desc: 'Spirit ghosts rise from fallen monsters', reward: { qty: 0.12 }, risk: 2, run: { haunted: { normal: 0.2, elite: 1, cap: 24 } } },
  nightMarch: { name: 'Night March', jp: '夜行', icon: 'night', color: '#7a6ae8', desc: 'Darker halls; monsters spot you from further off and fight harder', reward: { xp: 0.10 }, risk: 2, monster: { atk: 1.12, speed: 1.08 }, run: { night: true, alertR: 14 } },
  hardGround: { name: 'Hard Ground', jp: '荒地', icon: 'ground', color: '#b88a5a', desc: 'You regenerate life and zoom 30% slower', reward: { rarity: 0.10 }, risk: 1, run: { regen: 0.7 } },
  bossWrath: { name: "Boss's Wrath", jp: '怒髪', icon: 'wrath', color: '#ff4a6a', desc: 'The boss has 50% more life, hits 20% harder and gains a wrath phase', reward: { boss: 0.20 }, risk: 2, boss: { life: 1.5, dmg: 1.2, wrath: 0.4 } },
  treasureTrove: { name: 'Treasure Trove', jp: '宝の山', icon: 'chest', color: '#ffd84a', desc: 'Two more golden chests on every floor', reward: {}, risk: 0, layout: { chests: 2 } },
  cursedShrines: { name: 'Cursed Shrines', jp: '祟り', icon: 'curse', color: '#c88aff', desc: 'Shrines also curse you (+25% damage taken for 20 s); one more shrine a floor', reward: { rarity: 0.10 }, risk: 1, layout: { shrines: 1 }, run: { curse: { pct: 25, t: 20 } } },
};
export const MOD_IDS = Object.keys(ZONE_MODS);
export const REWARD_KEYS = ['qty', 'rarity', 'xp', 'boss'];
export const REWARD_NAMES = { qty: 'item quantity', rarity: 'item rarity', xp: 'experience', boss: 'boss loot' };
/** "+15% item quantity, +10% experience" (a mod's or a total's reward line; '' when there is none) */
export function rewardText(rw = {}, names = REWARD_NAMES) {
  return REWARD_KEYS.filter(k => rw[k] > 0).map(k => `+${Math.round(rw[k] * 100)}% ${names[k]}`).join(', ');
}

/** The picked modifiers made valid for the run: known ids, no repeats, one per group, at most the run's slots. */
export function cleanMods(ids, run = {}) {
  const out = [], groups = new Set(), max = slotsFor(run);
  for (const id of Array.isArray(ids) ? ids : []) {
    const m = ZONE_MODS[id]; if (!m || out.includes(id)) continue;
    if (m.group && groups.has(m.group)) continue;
    if (out.length >= max) break;
    out.push(id); if (m.group) groups.add(m.group);
  }
  return out;
}
/** the summed reward bonus of a run: the tier's (or Spirit tier's) own plus every modifier's → { qty, rarity, xp, boss } */
export function rewardTotals(run = {}) {
  const I = runInfo(run), out = { qty: I.qty, rarity: I.rarity, xp: I.xp, boss: 0 };
  for (const id of cleanMods(run.mods, run)) for (const k of REWARD_KEYS) out[k] += ZONE_MODS[id].reward[k] || 0;
  for (const k of REWARD_KEYS) out[k] = Math.round(out[k] * 1000) / 1000;
  return out;
}
/** Everything the run's modifiers and tier do, merged once (DungeonMode keeps it as mode.runMods). active: anything to do. */
export function resolveRun(run = {}) {
  const tier = Math.max(0, Math.floor(run.tier || 0)), spirit = Math.max(0, Math.floor(run.spirit || 0));
  const I = runInfo({ tier, spirit }), mods = cleanMods(run.mods, { tier, spirit });
  const R = {
    tier, spirit, mods, info: I, active: tier > 0 || spirit > 0 || mods.length > 0,
    layout: { pack: I.pack, champ: I.champ, extraPacks: 0, champX: 1, uniques: 0, chests: 0, shrines: 0 },
    monster: { life: I.life, dmg: I.dmg, speed: 1, atk: 1, res: 0, el: null, elPct: 0 },
    boss: { life: 1, dmg: 1, wrath: 0 },
    run: { haunted: null, night: false, alertR: 0, regen: 1, curse: null },
    rewards: rewardTotals({ tier, spirit, mods }),
  };
  for (const id of mods) {
    const m = ZONE_MODS[id], Lo = m.layout || {}, Mo = m.monster || {}, Bo = m.boss || {}, Ru = m.run || {};
    if (Lo.pack) R.layout.pack *= Lo.pack;
    if (Lo.extraPacks) R.layout.extraPacks += Lo.extraPacks;
    if (Lo.champX) R.layout.champX *= Lo.champX;
    if (Lo.uniques) R.layout.uniques += Lo.uniques;
    if (Lo.chests) R.layout.chests += Lo.chests;
    if (Lo.shrines) R.layout.shrines += Lo.shrines;
    for (const k of ['life', 'dmg', 'speed', 'atk']) if (Mo[k]) R.monster[k] *= Mo[k];
    if (Mo.res) R.monster.res += Mo.res;
    if (Mo.el) { R.monster.el = Mo.el; R.monster.elPct = Mo.elPct || 0.35; }
    if (Bo.life) R.boss.life *= Bo.life;
    if (Bo.dmg) R.boss.dmg *= Bo.dmg;
    if (Bo.wrath) R.boss.wrath = Math.max(R.boss.wrath, Bo.wrath);
    if (Ru.haunted) R.run.haunted = { ...Ru.haunted };
    if (Ru.night) R.run.night = true;
    if (Ru.alertR) R.run.alertR = Math.max(R.run.alertR, Ru.alertR);
    if (Ru.regen) R.run.regen *= Ru.regen;
    if (Ru.curse) R.run.curse = { ...Ru.curse };
  }
  for (const k of ['pack']) R.layout[k] = Math.round(R.layout[k] * 1000) / 1000;
  for (const k of ['life', 'dmg', 'speed', 'atk']) R.monster[k] = Math.round(R.monster[k] * 1000) / 1000;
  return R;
}

// ------------------------------------------------------------------ the generator hook
/** the most monsters a modded floor may hold (a zone floor at T5 + Swarming + Teeming lands near here: ZONES §5.1) */
export const FLOOR_CAP = { zone: 340, burrow: 210 };
/**
 * Apply a run's layout effects to a freshly generated floor (gen.js generate, both the Burrow's and the zone's layouts).
 * plan: dungeon/defs.js floorPlan (tier, spirit, mods); rng: the floor's own mod RNG. Mutates and returns L; records
 * what it did as L.modded = { extra, champs, uniques, chests, shrines, mul, capped }.
 */
export function layoutMods(L, plan = {}, rng = new RNG(1)) {
  const R = plan.runMods || resolveRun(plan);
  if (!R.active || !L?.spawns) return L;
  const Lo = R.layout, zone = !!L.zone, at = L.at, W = L.W;
  const packs = () => L.spawns.filter(s => !s.boss);
  const done = { extra: 0, champs: 0, uniques: 0, chests: 0, shrines: 0, mul: Lo.pack, capped: false };
  // ---- free spots: open floor (a ring of open cells round it), inside a room, clear of the arrival, the stairs, the arena
  // ring, the objective slots, the centrepieces, chests, shrines and other packs
  const props = new Set((L.props || []).map(p => p.y * W + p.x));
  const keep = [[L.start.x, L.start.y, 5.5]];
  if (L.stairs) keep.push([L.stairs.x, L.stairs.y, 3]);
  if (L.waypoint) keep.push([L.waypoint.x, L.waypoint.y, 3]);
  if (L.arena) keep.push([L.arena.x / 2 - 0.5, L.arena.z / 2 - 0.5, L.arena.r / 2 + 2]);
  if (L.arenaMouth) keep.push([L.arenaMouth.cx, L.arenaMouth.cy, 4]);
  if (L.bossRoom && !L.arena) keep.push([L.bossRoom.cx, L.bossRoom.cy, Math.max(L.bossRoom.w, L.bossRoom.h) / 2 + 1]);
  for (const s of L.slots || []) keep.push([s.x, s.y, 2.5]);
  for (const c of L.centers || []) keep.push([c.x, c.y, 3.5]);
  const objs = () => [...L.chests, ...L.shrines];
  const open = (x, y, r) => { for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) if (!at(x + ox, y + oy)) return false; return true; };
  const spot = (room, { r = 1, sep = 4.5, objSep = 2.5 } = {}) => {
    for (let t = 0; t < 120; t++) {
      const x = room.x + Math.floor(rng.next() * room.w), y = room.y + Math.floor(rng.next() * room.h);
      if (L.roomId[y * W + x] !== room.id || !open(x, y, r) || props.has(y * W + x)) continue;
      if (keep.some(([kx, ky, kr]) => Math.hypot(x - kx, y - ky) < kr)) continue;
      if (L.spawns.some(s => Math.hypot(s.x - x, s.y - y) < sep)) continue;
      if (objs().some(c => Math.hypot(c.x - x, c.y - y) < objSep)) continue;
      return { x, y };
    }
    return null;
  };
  const fightRooms = L.rooms.filter(r => r.id && r.kind !== 'start' && r.kind !== 'boss' && !r.arena);
  // ---- Teeming: one more pack in every room
  for (let k = 0; k < Lo.extraPacks; k++) for (const room of fightRooms) {
    const c = spot(room, { r: 1, sep: zone ? 3.8 : 3.5 }) || (zone ? spot(room, { r: 1, sep: 3.2 }) : null); if (!c) continue; // (a crowded chamber: closer to its packs, the clusters touch)
    L.spawns.push({ x: c.x, y: c.y, rank: 'normal', count: zone ? rng.int(9, 12) : rng.int(3, 5), room: room.id, kind: room.kind, extra: true });
    done.extra++;
  }
  // ---- promotions: plain room packs (not a slot's guards, not a corridor pack, no quest mark) become elites
  const plain = () => rng.shuffle(packs().filter(s => s.rank === 'normal' && s.guard == null && s.kind !== 'corridor' && !s.mark && s.room !== 0));
  const promote = (s, rank) => { s.rank = rank; if (zone) s.count = Math.max(8, s.count - (rank === 'champion' ? 2 : 1)); s.promoted = rank; };
  if (Lo.uniques > 0) for (const s of plain().slice(0, Lo.uniques)) { promote(s, 'unique'); done.uniques++; }
  if (Lo.champX > 1) { const have = packs().filter(s => s.rank === 'champion').length, want = Math.max(1, have) * Lo.champX - have; for (const s of plain().slice(0, want)) { promote(s, 'champion'); done.champs++; } }
  if (Lo.champ > 0) for (const s of plain()) if (rng.chance(Lo.champ)) { promote(s, 'champion'); done.champs++; }
  // ---- pack size (the tier's × Swarming's): zone packs keep their cluster shape (a wider disc), the cap grows with them
  if (Lo.pack !== 1) for (const s of packs()) {
    s.count = Math.max(1, Math.round(s.count * Lo.pack));
    if (zone) s.cap = Math.round(16 * Lo.pack);
  }
  // ---- a ceiling on the floor's total (the horde budget, ZONES §7): every pack shrinks in proportion
  const cap = zone ? FLOOR_CAP.zone : FLOOR_CAP.burrow;
  const total = () => packs().reduce((a, s) => a + s.count + (s.rank === 'normal' ? 0 : 1), 0);
  const tot = total();
  if (tot > cap) { const k = cap / tot; for (const s of packs()) s.count = Math.max(zone ? 6 : 2, Math.floor(s.count * k)); done.capped = tot; }
  if (zone) for (const s of packs()) s.r = clamp(0.62 * Math.sqrt(s.count + 1), 2, 4.8);
  // ---- Treasure Trove: golden chests; Cursed Shrines: one more shrine
  const roomsBy = () => rng.shuffle(fightRooms.slice());
  for (let k = 0; k < Lo.chests; k++) for (const room of roomsBy()) { const c = spot(room, { r: 1, sep: 2.5, objSep: 4 }); if (c) { L.chests.push({ x: c.x, y: c.y, quality: 'gold', trove: true }); done.chests++; break; } }
  for (let k = 0; k < Lo.shrines; k++) for (const room of roomsBy()) { const c = spot(room, { r: 1, sep: 3, objSep: 5 }); if (c) { L.shrines.push({ x: c.x, y: c.y, type: rng.pick(['zoomies', 'goodboy', 'lucky', 'sparkle', 'snack']), extra: true }); done.shrines++; break; } }
  if (zone) L.packTotal = packs().reduce((a, s) => a + s.count + (s.rank === 'normal' ? 0 : 1), 0);
  L.modded = done;
  return L;
}

// ------------------------------------------------------------------ the spawn hooks
/** DungeonMode.spawnPack, before a pack spawns (the layout already carries its size and rank: layoutMods) */
export function packMods(mode, sp) { return sp; }
const ELEMS = ['fire', 'frost', 'zap', 'stink', 'holy', 'gloom'];
/** Right after a run's monster is built (bosses, boss adds, summons and ghosts too; once per monster): life, damage,
 *  speed, attack rate, resistances, the Elemental conversion; Boss's Wrath's life / damage on a boss. */
export function monsterMods(mode, m) {
  const R = mode?.runMods;
  if (!m || !R?.active || m._zm) return m;
  m._zm = true;
  const M = R.monster, boss = !!m.def?.boss;
  const life = M.life * (boss ? R.boss.life : 1), dmg = M.dmg * (boss ? R.boss.dmg : 1), S = m.stats;
  if (life !== 1) { m.lifeMax = Math.max(1, Math.round(m.lifeMax * life)); m.life = m.lifeMax; S.life = m.lifeMax; }
  if (dmg !== 1) {
    S.dmg = S.dmg.map(v => Math.max(1, Math.round(v * dmg)));
    if (S.dmgFire) S.dmgFire = S.dmgFire.map(v => Math.max(0, Math.round(v * dmg)));
    if (S.aura) S.aura.dps = Math.max(1, Math.round(S.aura.dps * dmg));
  }
  if (M.speed !== 1) { m.speed *= M.speed; S.speedMul = Math.round(S.speedMul * M.speed * 100) / 100; }
  if (M.atk !== 1) S.atkMul = (S.atkMul || 1) * M.atk;
  if (M.res) { S.res ||= {}; for (const e of ELEMS) S.res[e] = (S.res[e] || 0) + M.res; S.res.phys = (S.res.phys || 0) + M.res / 2; }
  if (M.el) m._el = { el: M.el, pct: M.elPct };
  return m;
}

// ------------------------------------------------------------------ rewards
/** how many extra items `n` dropped items earn at a quantity bonus q (each: floor(q) more, and one more with the rest's chance) */
export function extraItems(n, q, rng = Math.random) {
  if (!(q > 0) || !(n > 0)) return 0;
  const r = typeof rng === 'function' ? rng : () => rng.next(), whole = Math.floor(q), frac = q - whole;
  let out = 0; for (let i = 0; i < n; i++) out += whole + (r() < frac ? 1 : 0);
  return out;
}

// ------------------------------------------------------------------ the Lantern's helpers (ui/lantern.js)
/** a gentle set for the run: the lowest-risk modifiers with the best reward, one per group, filling the slots */
export function recommendMods(run = {}) {
  const max = slotsFor(run), score = id => { const m = ZONE_MODS[id], rw = m.reward; return (rw.qty || 0) + (rw.rarity || 0) * 1.1 + (rw.xp || 0) * 0.8 + (rw.boss || 0) * 0.5 - m.risk * 0.06 + (id === 'treasureTrove' ? 0.12 : 0); };
  return cleanMods(MOD_IDS.slice().sort((a, b) => score(b) - score(a)), { ...run }).slice(0, max);
}
/** "Surprise me": a random valid set that fills the slots */
export function surpriseMods(run = {}, rng = Math.random) {
  const r = typeof rng === 'function' ? rng : () => rng.next(), ids = MOD_IDS.slice();
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  return cleanMods(ids, run);
}
