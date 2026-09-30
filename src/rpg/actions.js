// Actions — every mutation of player / inventory / equipment / coins / materials goes through here and emits events.
//
// POTIONS & REGEN (design choice):
//   • state.player.life / .zoom hold CURRENT values; null means "full" (as in the contract).
//   • usePotion(key) decrements the belt and returns an effect object { key, life, zoom, over } (or null if not used):
//       heart → life = 25 + 30% lifeMax over 2.5 s     zoom → zoom = 15 + 35% zoomMax over 2.5 s
//       rejuv → 40% life + 40% zoom instantly (over = 0)
//     Heal-over-time is kept TRANSIENTLY inside the actions closure (not saved): call actions.tickRegen(dt) once per frame
//     from the game loop — it applies natural lifeRegen/zoomRegen (per-second values from derived) plus any active
//     potion HoTs, and writes state.player.life/zoom. actions.activeHots() lists running HoTs (for UI glows).
//   • Potions are not used when the relevant bar is already full (toast instead), like a considerate good boy.
//   • Belt caps: POTION_CAP (heart 15, zoom 15, rejuv 8).
//
// Container refs for moveItem/dropItem/sellItem: { c:'inv'|'stash', i:index } or { c:'equip', i:'weapon'|'weaponAlt'|'hat'|… }.
// pickup(x) accepts an Item OR any drop entry from loot.js ({type:'coins'|'item'|'potion'|'material'|'gem', …}).
// buyItem(item, price) accepts an Item or a potion descriptor { kind:'potion', key }.
// addXp emits ONE 'player:levelup' {lvl, from, gained} per call even on multi-level-ups (lvl = the new level).
// damage(n) emits 'player:dead' once when life reaches 0. Extra event: 'hotbar:changed' {hotbar}.
import { Events } from '../core/events.js';
import { computeStats, xpToNext, LEVEL_CAP } from './stats.js';
import { SKILLS, canLearn } from './skills.js';
import { starterItems, starterStaff, generateItem, EQUIP_SLOT_ITEM, meetsReq, socketGem, POTIONS, targetSlot, SET_ITEMS } from './items.js';
import { CLASSES, HERO_IDS, canWield } from './classes.js';
import { uid as rid } from '../core/util.js';

export const INV_SIZE = 40;
export const STASH_SIZE = 60;
export const POTION_CAP = { heart: 15, zoom: 15, rejuv: 8 };
export const STAT_KEYS = ['str', 'dex', 'vit', 'ene'];
export const HOTBAR_SIZE = 6;

const emptyEquipment = () => ({ weapon: null, weaponAlt: null, hat: null, outfit: null, collar: null, charm1: null, charm2: null, boots: null, paws: null });

/** A level-1 hero of class `id` with its starter kit → { player, equipment } (docs/HEROES.md §2). */
export function newHeroState(id) {
  const C = CLASSES[id] || CLASSES.chewy, S0 = C.starter;
  const equipment = emptyEquipment();
  if (C.id === 'moka') equipment.weapon = starterStaff();
  else { const { sword, ball } = starterItems(); equipment.weapon = sword; equipment.weaponAlt = ball; }
  return {
    player: {
      cls: C.id, name: C.name, lvl: 1, xp: 0, stats: { ...C.base }, statPts: 0, skillPts: 1,
      // starter skills: a free point in each weapon's bread-and-butter skill so every weapon set has a right-click
      skills: { ...S0.skills }, hotbar: [...S0.hotbar],
      life: null, zoom: null, activeWeapon: 0,
      mouseSets: S0.mouseSets.map(p => [...p]), // per weapon set [LMB, RMB] (see swapWeapons)
    },
    equipment,
  };
}

/** Fresh save, per docs/ARCHITECTURE.md + docs/HEROES.md: one progression per hero, one shared household.
 *  state.player / state.equipment are live references to the active hero's objects (see normalizeHeroes). */
export function newGameState() {
  const heroes = {};
  for (const id of HERO_IDS) heroes[id] = newHeroState(id);
  return {
    version: 2,
    activeHero: 'chewy',
    heroes,
    player: heroes.chewy.player,
    equipment: heroes.chewy.equipment,
    coins: 350,
    materials: { wood: 45, stone: 30, petal: 10, crystal: 1, bone: 2, mochi: 0, silk: 1, lantern: 2 },
    potions: { heart: 3, zoom: 2, rejuv: 0 },
    inventory: Array(INV_SIZE).fill(null),
    stash: Array(STASH_SIZE).fill(null),
    quests: { active: [], done: [] },
    friends: {},
    village: {},
    dungeon: { deepest: 0, waypoints: [1] },
    day: 1, hour: 8.5, flags: {},
  };
}

/** Make any save (v1: a single top-level Chewy; v2: state.heroes) consistent: every hero exists, and
 *  state.player / state.equipment point at the active hero's objects. Mutates and returns st. */
export function normalizeHeroes(st) {
  if (!st) return st;
  st.heroes = st.heroes || {};
  st.flags = st.flags || {};
  if (!HERO_IDS.includes(st.activeHero)) st.activeHero = 'chewy';
  // a top-level player (v1 saves, or in-memory state) is the active hero's live data
  if (st.player) st.heroes[st.activeHero] = { player: st.player, equipment: st.equipment || emptyEquipment() };
  for (const id of HERO_IDS) {
    const h = st.heroes[id] || (st.heroes[id] = newHeroState(id));
    h.equipment = Object.assign(h.equipment || {}, { ...emptyEquipment(), ...(h.equipment || {}) });
    h.player.cls = id;
    h.player.name = h.player.name || CLASSES[id].name;
  }
  st.player = st.heroes[st.activeHero].player;
  st.equipment = st.heroes[st.activeHero].equipment;
  st.version = Math.max(st.version || 1, 2);
  return st;
}
/** What goes into localStorage: everything except the live player/equipment aliases (they live in heroes). */
export function saveableState(st) {
  const { player, equipment, ...rest } = st;
  return rest;
}

const clone = o => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
const sameStack = (a, b) => a && b && a.stack && b.stack && a.kind === b.kind && a.base === b.base && (a.gemTier ?? -1) === (b.gemTier ?? -1);

export function createActions(G) {
  const S = () => G.state;
  const emit = (n, p) => Events.emit(n, p);
  const toast = (text, color = '#ff8fb0', icon) => emit('toast', { text, icon, color });
  const hots = []; // transient potion heal-over-time effects

  // ------------------------------------------------------------ containers
  const arr = c => (c === 'inv' ? S().inventory : c === 'stash' ? S().stash : null);
  function getItem(ref) {
    if (!ref) return null;
    if (ref.c === 'equip') return S().equipment[ref.i] || null;
    const a = arr(ref.c);
    return a ? a[ref.i] || null : null;
  }
  function setItem(ref, it) {
    if (ref.c === 'equip') S().equipment[ref.i] = it || null;
    else arr(ref.c)[ref.i] = it || null;
  }
  const firstFree = (c = 'inv') => arr(c).findIndex(x => !x);
  const d = () => G.derived || recompute(true);

  function recompute(silent) {
    G.derived = computeStats(S());
    const p = S().player;
    if (p.life != null) p.life = p.life >= G.derived.lifeMax ? null : Math.max(0, p.life);
    if (p.zoom != null) p.zoom = p.zoom >= G.derived.zoomMax ? null : Math.max(0, p.zoom);
    if (!silent) emit('stats:changed', G.derived);
    return G.derived;
  }

  /** Why can't this item go in that equipment slot? '' when it can. */
  function equipProblem(it, slot) {
    if (!it || it.kind !== 'gear') return "That doesn't go there!";
    if (EQUIP_SLOT_ITEM[slot] !== it.slot) return "That doesn't go there!";
    const r = it.req || {};
    const P = S().player, D = d();
    if (P.lvl < (r.lvl || 1)) return `Requires level ${r.lvl}`;
    if ((r.str || 0) > D.str) return `Requires ${r.str} Strength`;
    if ((r.dex || 0) > D.dex) return `Requires ${r.dex} Dexterity`;
    if ((r.ene || 0) > D.ene) return `Requires ${r.ene} Energy`;
    if (it.wtype && !canWield(P.cls || 'chewy', it.wtype)) return `That's ${CLASSES[it.wtype === 'staff' ? 'moka' : 'chewy'].name}'s — switch heroes to use it!`;
    return '';
  }
  const canEquip = (it, slot) => !equipProblem(it, slot || targetSlot(it, S()));

  // ------------------------------------------------------------ equipment
  function equip(invIdx) {
    const inv = S().inventory;
    const it = inv[invIdx];
    if (!it || it.kind !== 'gear') return false;
    const slot = targetSlot(it, S());
    const why = equipProblem(it, slot);
    if (why) { toast(why, '#ff6a5a'); return false; }
    const old = S().equipment[slot];
    S().equipment[slot] = it;
    inv[invIdx] = old || null;
    emit('inv:changed', { c: 'inv' });
    emit('equip:changed', { slot, item: it, old: old || null });
    recompute();
    if (slot === 'weapon' || slot === 'weaponAlt') refitSets();
    return true;
  }
  function unequip(slot) {
    const it = S().equipment[slot];
    if (!it) return false;
    const idx = firstFree('inv');
    if (idx < 0) { toast('Bag is full!', '#ff6a5a'); return false; }
    S().inventory[idx] = it;
    S().equipment[slot] = null;
    emit('inv:changed', { c: 'inv' });
    emit('equip:changed', { slot, item: null, old: it });
    recompute();
    return true;
  }
  // ------------------------------------------------------------ weapon sets (D2 style)
  // Each weapon set (0 = equipment.weapon, 1 = equipment.weaponAlt) remembers its own [LMB, RMB] skills in
  // player.mouseSets. The active set's pair is always live in hotbar[0..1] (so input / HUD keep reading the hotbar);
  // swapWeapons() files the live pair under the set being put away and brings the other set's pair in.
  // Keys 1–4 (hotbar[2..5]) are shared by both sets.
  const setWeaponType = i => (S().equipment[i ? 'weaponAlt' : 'weapon']?.wtype) || (S().player.cls === 'moka' ? 'staff' : i ? 'ball' : 'sword');
  const fitsSet = (id, i) => !id || id === 'attack' || !SKILLS[id]?.wep || SKILLS[id].wep === setWeaponType(i);
  const knows = id => S().player.skills[id] > 0 && SKILLS[id] && SKILLS[id].kind !== 'passive' && SKILLS[id].kind !== 'aura';
  /** Best right-click skill for a weapon set: the weapon's most-trained spammable skill, else its other actives. */
  function defaultRmb(i) {
    const P = S().player, wt = setWeaponType(i);
    const pref = wt === 'ball' ? ['throw', 'ricochet', 'multi', 'blaze', 'fetchstorm', 'decoy']
      : wt === 'staff' ? ['splash', 'kibble', 'feathers', 'moonbeam', 'constellation', 'whirlpool', 'shake', 'greatWave', 'meteor']
      : ['chomp', 'dig', 'whirl', 'bonestorm'];
    let best = null;
    pref.forEach((id, k) => { if (!knows(id)) return; const sc = (P.skills[id] || 0) * 10 - k * (k < 4 ? 1 : 25); if (!best || sc > best.sc) best = { id, sc }; });
    return best ? best.id : null;
  }
  function ensureMouseSets() {
    const P = S().player;
    const ok = s => Array.isArray(s) && s.length === 2;
    if (Array.isArray(P.mouseSets) && P.mouseSets.length === 2 && P.mouseSets.every(ok)) return P.mouseSets;
    // migrate an older save: the current pair stays on every set it suits; a set it doesn't suit gets sensible defaults
    const cur = [P.hotbar[0] ?? 'attack', P.hotbar[1] ?? null];
    P.mouseSets = [0, 1].map(i => (fitsSet(cur[0], i) && fitsSet(cur[1], i) ? [...cur] : ['attack', defaultRmb(i)]));
    const live = P.mouseSets[P.activeWeapon === 1 ? 1 : 0];
    P.hotbar[0] = live[0]; P.hotbar[1] = live[1];
    return P.mouseSets;
  }
  /** Saves from before the starter Throw: grant it once (Chomp's free twin) and fill any empty right-click with the
   *  set's best skill, so the ball set never swaps in with a dead RMB. */
  function migrateStarterSkills() {
    const st = S(), P = st.player, flags = st.flags || (st.flags = {});
    if (flags.starterThrow || (P.cls && P.cls !== 'chewy')) return;
    flags.starterThrow = true;
    if (!(P.skills.throw > 0)) P.skills.throw = 1;
    const sets = ensureMouseSets(), act = P.activeWeapon === 1 ? 1 : 0;
    for (const i of [0, 1]) {
      const pair = i === act ? [P.hotbar[0] ?? null, P.hotbar[1] ?? null] : sets[i];
      if (pair[1]) continue;
      const rmb = defaultRmb(i);
      if (!rmb) continue;
      sets[i] = [pair[0] ?? 'attack', rmb];
      if (i === act) P.hotbar[1] = rmb;
    }
  }
  /** A set whose weapon changed type (e.g. a ball equipped where the sword was) trades skills that no longer fit for defaults. */
  function refitSets() {
    const P = S().player, sets = ensureMouseSets(), act = P.activeWeapon === 1 ? 1 : 0;
    let changed = false;
    for (const i of [0, 1]) {
      if (!S().equipment[i ? 'weaponAlt' : 'weapon']) continue; // bare paws: keep what was bound
      const pair = i === act ? [P.hotbar[0] ?? null, P.hotbar[1] ?? null] : sets[i];
      const next = [fitsSet(pair[0], i) ? pair[0] : 'attack', fitsSet(pair[1], i) ? pair[1] : defaultRmb(i)];
      if (next[0] === pair[0] && next[1] === pair[1]) continue;
      changed = true; sets[i] = next;
      if (i === act) { P.hotbar[0] = next[0]; P.hotbar[1] = next[1]; }
    }
    if (changed) emit('hotbar:changed', { hotbar: P.hotbar });
  }
  const syncLiveSet = () => { const P = S().player, sets = ensureMouseSets(); sets[P.activeWeapon === 1 ? 1 : 0] = [P.hotbar[0] ?? null, P.hotbar[1] ?? null]; };
  function swapWeapons() {
    const p = S().player;
    const sets = ensureMouseSets();
    const from = p.activeWeapon === 1 ? 1 : 0, to = 1 - from;
    sets[from] = [p.hotbar[0] ?? null, p.hotbar[1] ?? null];
    p.activeWeapon = to;
    p.hotbar[0] = sets[to][0] ?? null; p.hotbar[1] = sets[to][1] ?? null;
    emit('equip:changed', { slot: p.activeWeapon ? 'weaponAlt' : 'weapon', swap: true });
    recompute();
    emit('hotbar:changed', { hotbar: p.hotbar, swap: true, set: to });
    return G.derived.weaponType;
  }

  function moveItem(from, to) {
    if (!from || !to) return false;
    if (from.c === to.c && from.i === to.i) return true;
    const a = getItem(from), b = getItem(to);
    if (!a) return false;
    if (to.c === 'equip') { const why = equipProblem(a, to.i); if (why) { toast(why, '#ff6a5a'); return false; } }
    if (from.c === 'equip' && b) { const why = equipProblem(b, from.i); if (why) { toast(why, '#ff6a5a'); return false; } }
    if (to.c !== 'equip' && from.c !== 'equip' && sameStack(a, b)) {
      b.qty = (b.qty || 1) + (a.qty || 1);
      setItem(from, null);
    } else {
      setItem(to, a);
      setItem(from, b);
    }
    const touchesEquip = from.c === 'equip' || to.c === 'equip';
    emit('inv:changed', { c: to.c });
    if (touchesEquip) { emit('equip:changed', { slot: to.c === 'equip' ? to.i : from.i }); recompute(); if ([from.i, to.i].some(k => k === 'weapon' || k === 'weaponAlt')) refitSets(); }
    return true;
  }
  function dropItem(from) {
    const it = getItem(from);
    if (!it) return null;
    setItem(from, null);
    emit('item:drop', { item: it });
    emit('inv:changed', { c: from.c });
    if (from.c === 'equip') { emit('equip:changed', { slot: from.i, item: null, old: it }); recompute(); }
    return it;
  }

  // ------------------------------------------------------------ pickup / belt
  function addPotion(key, n = 1) {
    if (!POTIONS[key]) return false;
    const pot = S().potions;
    const cur = pot[key] || 0;
    if (cur >= POTION_CAP[key]) { toast('Belt is full!', '#ff6a5a'); return false; }
    pot[key] = Math.min(POTION_CAP[key], cur + n);
    emit('potions:changed', { key, n: pot[key] });
    return true;
  }
  function pickup(x) {
    if (!x) return false;
    if (x.type && !x.kind) {
      switch (x.type) {
        case 'coins': addCoins(x.n); return true;
        case 'potion': return addPotion(x.key, x.n || 1);
        case 'material': addMaterial(x.key, x.n || 1); return true;
        case 'item': case 'gem': return pickup(x.item);
        default: return false;
      }
    }
    const it = x;
    if (it.kind === 'material') { addMaterial(it.key || it.base, it.qty || 1); emit('item:pickup', { item: it }); return true; }
    if (it.kind === 'potion') return addPotion(it.key, it.qty || 1);
    const inv = S().inventory;
    if (it.stack) {
      const same = inv.find(o => sameStack(o, it));
      if (same) { same.qty = (same.qty || 1) + (it.qty || 1); emit('item:pickup', { item: it }); emit('inv:changed', { c: 'inv' }); return true; }
    }
    const idx = firstFree('inv');
    if (idx < 0) { toast('Bag is full!', '#ff6a5a'); return false; }
    inv[idx] = it;
    emit('item:pickup', { item: it });
    emit('inv:changed', { c: 'inv' });
    return true;
  }

  // ------------------------------------------------------------ life / zoom
  const life = () => { const v = S().player.life; return v == null ? d().lifeMax : v; };
  const zoom = () => { const v = S().player.zoom; return v == null ? d().zoomMax : v; };
  function setLife(v) { const D = d(); S().player.life = v >= D.lifeMax ? null : Math.max(0, v); }
  function setZoom(v) { const D = d(); S().player.zoom = v >= D.zoomMax ? null : Math.max(0, v); }
  function heal(n) { if (life() <= 0) return 0; const before = life(); setLife(before + n); return life() - before; }
  function restoreZoom(n) { const before = zoom(); setZoom(before + n); return zoom() - before; }
  function spendZoom(n) { const z = zoom(); if (z < n) return false; setZoom(z - n); return true; }
  /** Apply already-mitigated damage. → { life, dead } (emits 'player:dead' once). */
  function damage(n) {
    const before = life();
    if (before <= 0) return { life: 0, dead: true };
    const v = Math.max(0, before - Math.max(0, n));
    setLife(v);
    if (v <= 0) { hots.length = 0; emit('player:dead', {}); return { life: 0, dead: true }; }
    return { life: v, dead: false };
  }
  /** Full restore (e.g. respawn in the village, drinking from the well). */
  function restoreAll() { S().player.life = null; S().player.zoom = null; hots.length = 0; }

  function usePotion(key) {
    const pot = S().potions;
    const def = POTIONS[key];
    if (!def) return null;
    if (!(pot[key] > 0)) { toast(`No ${def.name}s left!`, '#ff6a5a'); return null; }
    const D = d();
    const lf = life(), zm = zoom();
    if (lf <= 0) return null;
    const lifeFull = lf >= D.lifeMax, zoomFull = zm >= D.zoomMax;
    if ((key === 'heart' && lifeFull) || (key === 'zoom' && zoomFull) || (key === 'rejuv' && lifeFull && zoomFull)) {
      toast(key === 'zoom' ? 'Already full of zoomies!' : 'Already feeling great!', '#8fe0c0');
      return null;
    }
    pot[key]--;
    let fx;
    if (key === 'heart') fx = { key, life: Math.round(25 + 0.3 * D.lifeMax), zoom: 0, over: 2.5 };
    else if (key === 'zoom') fx = { key, life: 0, zoom: Math.round(15 + 0.35 * D.zoomMax), over: 2.5 };
    else fx = { key, life: Math.round(0.4 * D.lifeMax), zoom: Math.round(0.4 * D.zoomMax), over: 0 };
    if (fx.over > 0) hots.push({ key, lifeRate: fx.life / fx.over, zoomRate: fx.zoom / fx.over, t: fx.over, dur: fx.over });
    else { heal(fx.life); restoreZoom(fx.zoom); }
    emit('potions:changed', { key, n: pot[key] });
    return fx;
  }
  /** Call once per frame: natural regen + potion heal-over-time. */
  function tickRegen(dt) {
    const D = d();
    let lf = life(), zm = zoom();
    if (lf <= 0) return;
    lf += D.lifeRegen * dt;
    zm += D.zoomRegen * dt;
    for (let i = hots.length - 1; i >= 0; i--) {
      const h = hots[i];
      const k = Math.min(dt, h.t);
      lf += h.lifeRate * k; zm += h.zoomRate * k;
      h.t -= dt;
      if (h.t <= 0) hots.splice(i, 1);
    }
    setLife(lf); setZoom(zm);
  }
  const activeHots = () => hots.map(h => ({ key: h.key, t: h.t, dur: h.dur }));

  // ------------------------------------------------------------ economy
  function addCoins(n) {
    n = Math.round(n);
    S().coins = Math.max(0, S().coins + n);
    emit('coins:changed', { coins: S().coins, delta: n });
    return S().coins;
  }
  function spendCoins(n) {
    if (S().coins < n) { toast('Not enough coins!', '#ff6a5a'); return false; }
    addCoins(-n);
    return true;
  }
  function sellItem(from) {
    const it = getItem(from);
    if (!it) return 0;
    const v = (it.value || 1) * (it.qty || 1);
    setItem(from, null);
    emit('inv:changed', { c: from.c });
    if (from.c === 'equip') { emit('equip:changed', { slot: from.i, item: null, old: it }); recompute(); }
    addCoins(v);
    return v;
  }
  function buyItem(item, price) {
    if (!item) return false;
    price = Math.max(0, Math.round(price ?? item.price ?? 0));
    if (item.kind === 'potion' || item.type === 'potion') {
      const key = item.key;
      if ((S().potions[key] || 0) >= POTION_CAP[key]) { toast('Belt is full!', '#ff6a5a'); return false; }
      if (!spendCoins(price)) return false;
      return addPotion(key, 1);
    }
    const inv = S().inventory;
    if (firstFree('inv') < 0 && !(item.stack && inv.some(o => sameStack(o, item)))) { toast('Bag is full!', '#ff6a5a'); return false; }
    if (!spendCoins(price)) return false;
    const it = clone(item);
    delete it.price;
    it.uid = 'it' + rid() + 'b';
    return pickup(it);
  }
  function addMaterial(k, n = 1) {
    const m = S().materials;
    m[k] = Math.max(0, (m[k] || 0) + n);
    emit('materials:changed', { key: k, n: m[k], delta: n });
    return m[k];
  }
  function hasMaterials(cost) {
    if (!cost) return true;
    for (const k in cost) {
      const need = cost[k] || 0;
      if (k === 'coins') { if (S().coins < need) return false; }
      else if ((S().materials[k] || 0) < need) return false;
    }
    return true;
  }
  function spendMaterials(cost) {
    if (!hasMaterials(cost)) { toast('Not enough materials!', '#ff6a5a'); return false; }
    for (const k in cost) {
      const need = cost[k] || 0;
      if (!need) continue;
      if (k === 'coins') addCoins(-need);
      else S().materials[k] -= need;
    }
    emit('materials:changed', { cost });
    return true;
  }

  // ------------------------------------------------------------ progression
  function learnSkill(id) {
    const c = canLearn(id, S());
    if (!c.ok) { toast(c.why, '#ff6a5a'); return false; }
    const P = S().player;
    P.skills[id] = (P.skills[id] || 0) + 1;
    P.skillPts--;
    const def = SKILLS[id];
    if (P.skills[id] === 1 && def.kind !== 'passive' && def.kind !== 'aura') {
      const sets = ensureMouseSets(), act = P.activeWeapon === 1 ? 1 : 0;
      let changed = false;
      // a weapon skill fills the empty right-click of the set that holds that weapon (e.g. the ball set's RMB)
      const home = def.wep ? [act, 1 - act].find(i => setWeaponType(i) === def.wep) : undefined;
      if (home !== undefined && home !== act && !sets[home][1]) { sets[home][1] = id; changed = true; }
      if (!P.hotbar.includes(id)) {
        const free = P.hotbar.findIndex((h, i) => i >= 1 && !h && (i > 1 || fitsSet(id, act)));
        if (free >= 0) { P.hotbar[free] = id; changed = true; }
      }
      if (changed) { syncLiveSet(); emit('hotbar:changed', { hotbar: P.hotbar }); }
    }
    emit('skill:learned', { id, lvl: P.skills[id] });
    recompute();
    return true;
  }
  function addStat(key) {
    const P = S().player;
    if (!STAT_KEYS.includes(key) || P.statPts <= 0) return false;
    P.stats[key]++;
    P.statPts--;
    recompute();
    return true;
  }
  function setHotbar(slot, skillId) {
    const P = S().player;
    if (slot < 0 || slot >= HOTBAR_SIZE) return false;
    if (skillId != null && skillId !== 'attack') {
      const def = SKILLS[skillId];
      if (!def || !(P.skills[skillId] > 0) || def.kind === 'passive' || def.kind === 'aura') return false;
    }
    ensureMouseSets();
    const prev = P.hotbar[slot];
    const at = skillId == null ? -1 : P.hotbar.indexOf(skillId);
    if (at >= 0 && at !== slot) P.hotbar[at] = prev ?? null; // swap
    P.hotbar[slot] = skillId ?? null;
    syncLiveSet(); // LMB / RMB belong to the active weapon set
    emit('hotbar:changed', { hotbar: P.hotbar });
    return true;
  }
  /** The [LMB, RMB] skills of weapon set `i` (0 = main, 1 = alt); the active set reads live from the hotbar. */
  function mouseSet(i) {
    const P = S().player, sets = ensureMouseSets();
    return i === (P.activeWeapon === 1 ? 1 : 0) ? [P.hotbar[0] ?? null, P.hotbar[1] ?? null] : [...sets[i]];
  }
  /** Catch-up: a hero more than 2 levels below the highest (joined) hero earns double XP (docs/HEROES.md §2). */
  function catchUp() {
    const st = S(), P = st.player;
    let top = P.lvl;
    for (const id in st.heroes || {}) if (id === 'chewy' || st.flags?.[`${id}Joined`]) top = Math.max(top, st.heroes[id].player.lvl);
    return top - P.lvl > 2;
  }
  function addXp(n) {
    const P = S().player;
    if (P.lvl >= LEVEL_CAP || !(n > 0)) return 0;
    const gained = Math.max(1, Math.round(n * (1 + (d().xpBonus || 0) / 100) * (catchUp() ? 2 : 1)));
    const from = P.lvl;
    P.xp += gained;
    while (P.lvl < LEVEL_CAP && P.xp >= xpToNext(P.lvl)) {
      P.xp -= xpToNext(P.lvl);
      P.lvl++;
      P.statPts += 5;
      P.skillPts += 1;
    }
    if (P.lvl >= LEVEL_CAP) P.xp = 0;
    if (P.lvl > from) {
      P.life = null; P.zoom = null;
      recompute();
      emit('player:levelup', { lvl: P.lvl, from, gained: P.lvl - from, hero: P.cls || 'chewy', name: P.name || 'Chewy' });
    }
    return gained;
  }
  function addSkillPts(n = 1) { S().player.skillPts += n; emit('stats:changed', d()); }
  function addStatPts(n = 5) { S().player.statPts += n; emit('stats:changed', d()); }
  /** Refund every stat and skill point (Rosie's "Forget-Me-Not Tea"). */
  function respec() {
    const P = S().player;
    let sp = 0;
    const base0 = (CLASSES[P.cls] || CLASSES.chewy).base;
    for (const k of STAT_KEYS) { const base = base0[k]; sp += P.stats[k] - base; P.stats[k] = base; }
    let kp = 0;
    for (const id in P.skills) kp += P.skills[id];
    P.skills = {};
    P.statPts += sp;
    P.skillPts += kp;
    P.hotbar = ['attack', null, null, null, null, null];
    P.mouseSets = [['attack', null], ['attack', null]];
    emit('hotbar:changed', { hotbar: P.hotbar });
    recompute();
    return { statPts: sp, skillPts: kp };
  }
  /** Socket the gem at gemRef into the gear at itemRef (consumes one gem from the stack). */
  function socket(itemRef, gemRef) {
    const it = getItem(itemRef), gem = getItem(gemRef);
    const r = socketGem(it, gem);
    if (!r.ok) { toast(r.why, '#ff6a5a'); return false; }
    if ((gem.qty || 1) > 1) gem.qty--;
    else setItem(gemRef, null);
    emit('inv:changed', { c: gemRef.c });
    if (itemRef.c === 'equip') { emit('equip:changed', { slot: itemRef.i }); recompute(); }
    toast(`Socketed ${gem.name}!`, '#5ee07a');
    return true;
  }
  /** Count of equipped pieces of a set (for UI). */
  const setPieces = setId => Object.values(S().equipment).filter(e => e && e.setId === setId).map(e => SET_ITEMS[e.setPiece]?.id);

  // ------------------------------------------------------------ heroes (docs/HEROES.md)
  /** Make hero `id` the active one: state.player / state.equipment re-point at its objects. The hero being put away
   *  keeps its own progression; its current life/zoom reset to full (it goes home to rest). */
  function setActiveHero(id) {
    const st = S();
    if (!st.heroes?.[id] || st.activeHero === id) return false;
    syncLiveSet();
    const prev = st.player;
    prev.life = null; prev.zoom = null;
    hots.length = 0;
    st.activeHero = id;
    st.player = st.heroes[id].player;
    st.equipment = st.heroes[id].equipment;
    ensureMouseSets(); migrateStarterSkills();
    recompute(true);
    emit('hero:changed', { id, from: prev.cls || 'chewy' });
    emit('equip:changed', { slot: 'weapon', hero: true });
    emit('inv:changed', { c: 'inv' });
    emit('stats:changed', G.derived);
    emit('hotbar:changed', { hotbar: st.player.hotbar });
    return true;
  }
  /** A hero joining late starts near the pack's level (2 below the top hero), with those points to spend and a
   *  magic weapon of their class, so they are playable in the Burrow right away. */
  function prepareJoin(id) {
    const st = S(), h = st.heroes?.[id];
    if (!h) return 0;
    let top = 1;
    for (const k in st.heroes) if (k !== id && (k === 'chewy' || st.flags?.[`${k}Joined`])) top = Math.max(top, st.heroes[k].player.lvl);
    const lvl = Math.max(1, Math.min(LEVEL_CAP, top - 2));
    const P = h.player;
    if (P.lvl < lvl) {
      const up = lvl - P.lvl;
      P.lvl = lvl; P.xp = 0; P.statPts += up * 5; P.skillPts += up;
      const w = h.equipment.weapon;
      if (lvl >= 3 && w && w.rarity === 'normal') h.equipment.weapon = generateItem({ ilvl: lvl, slot: 'weapon', wtype: w.wtype, rarity: 'magic' });
    }
    return P.lvl;
  }

  const api = {
    // contract
    equip, unequip, swapWeapons, moveItem, dropItem, pickup, usePotion, sellItem, buyItem, learnSkill, addStat,
    setHotbar, addXp, addCoins, spendCoins, addMaterial, hasMaterials, spendMaterials, recompute,
    // extras
    tickRegen, activeHots, addPotion, heal, restoreZoom, spendZoom, damage, restoreAll, life, zoom,
    addSkillPts, addStatPts, respec, socket, getItem, firstFree, canEquip, equipProblem, setPieces,
    mouseSet, ensureMouseSets, setWeaponType,
    setActiveHero, prepareJoin, isCatchingUp: catchUp,
  };
  if (G.state) { normalizeHeroes(G.state); ensureMouseSets(); migrateStarterSkills(); recompute(true); }
  return api;
}
