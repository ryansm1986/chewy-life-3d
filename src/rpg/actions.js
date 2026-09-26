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
import { starterItems, EQUIP_SLOT_ITEM, meetsReq, socketGem, POTIONS, targetSlot, SET_ITEMS } from './items.js';
import { uid as rid } from '../core/util.js';

export const INV_SIZE = 40;
export const STASH_SIZE = 60;
export const POTION_CAP = { heart: 15, zoom: 15, rejuv: 8 };
export const STAT_KEYS = ['str', 'dex', 'vit', 'ene'];
export const HOTBAR_SIZE = 6;

/** Fresh save, exactly per docs/ARCHITECTURE.md, with the starter Bone Sword (weapon) and Red Tennis Ball (weaponAlt). */
export function newGameState() {
  const { sword, ball } = starterItems();
  return {
    version: 1,
    player: {
      name: 'Chewy', lvl: 1, xp: 0, stats: { str: 10, dex: 10, vit: 12, ene: 8 }, statPts: 0, skillPts: 1,
      skills: { chomp: 1 }, hotbar: ['attack', 'chomp', null, null, null, null],
      life: null, zoom: null, activeWeapon: 0,
    },
    coins: 350,
    materials: { wood: 45, stone: 30, petal: 10, crystal: 1, bone: 2, mochi: 0, silk: 1, lantern: 2 },
    potions: { heart: 3, zoom: 2, rejuv: 0 },
    inventory: Array(INV_SIZE).fill(null),
    equipment: { weapon: sword, weaponAlt: ball, hat: null, outfit: null, collar: null, charm1: null, charm2: null, boots: null, paws: null },
    stash: Array(STASH_SIZE).fill(null),
    quests: { active: [], done: [] },
    friends: {},
    village: {},
    dungeon: { deepest: 0, waypoints: [1] },
    day: 1, hour: 8.5, flags: {},
  };
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
  function swapWeapons() {
    const p = S().player;
    p.activeWeapon = p.activeWeapon === 1 ? 0 : 1;
    emit('equip:changed', { slot: p.activeWeapon ? 'weaponAlt' : 'weapon', swap: true });
    recompute();
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
    if (touchesEquip) { emit('equip:changed', { slot: to.c === 'equip' ? to.i : from.i }); recompute(); }
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
    if (P.skills[id] === 1 && def.kind !== 'passive' && def.kind !== 'aura' && !P.hotbar.includes(id)) {
      const free = P.hotbar.findIndex((h, i) => i >= 1 && !h);
      if (free >= 0) { P.hotbar[free] = id; emit('hotbar:changed', { hotbar: P.hotbar }); }
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
    const prev = P.hotbar[slot];
    const at = skillId == null ? -1 : P.hotbar.indexOf(skillId);
    if (at >= 0 && at !== slot) P.hotbar[at] = prev ?? null; // swap
    P.hotbar[slot] = skillId ?? null;
    emit('hotbar:changed', { hotbar: P.hotbar });
    return true;
  }
  function addXp(n) {
    const P = S().player;
    if (P.lvl >= LEVEL_CAP || !(n > 0)) return 0;
    const gained = Math.max(1, Math.round(n * (1 + (d().xpBonus || 0) / 100)));
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
      emit('player:levelup', { lvl: P.lvl, from, gained: P.lvl - from });
    }
    return gained;
  }
  function addSkillPts(n = 1) { S().player.skillPts += n; emit('stats:changed', d()); }
  function addStatPts(n = 5) { S().player.statPts += n; emit('stats:changed', d()); }
  /** Refund every stat and skill point (Rosie's "Forget-Me-Not Tea"). */
  function respec() {
    const P = S().player;
    let sp = 0;
    for (const k of STAT_KEYS) { const base = { str: 10, dex: 10, vit: 12, ene: 8 }[k]; sp += P.stats[k] - base; P.stats[k] = base; }
    let kp = 0;
    for (const id in P.skills) kp += P.skills[id];
    P.skills = {};
    P.statPts += sp;
    P.skillPts += kp;
    P.hotbar = ['attack', null, null, null, null, null];
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

  const api = {
    // contract
    equip, unequip, swapWeapons, moveItem, dropItem, pickup, usePotion, sellItem, buyItem, learnSkill, addStat,
    setHotbar, addXp, addCoins, spendCoins, addMaterial, hasMaterials, spendMaterials, recompute,
    // extras
    tickRegen, activeHots, addPotion, heal, restoreZoom, spendZoom, damage, restoreAll, life, zoom,
    addSkillPts, addStatPts, respec, socket, getItem, firstFree, canEquip, equipProblem, setPieces,
  };
  if (G.state) recompute(true);
  return api;
}
