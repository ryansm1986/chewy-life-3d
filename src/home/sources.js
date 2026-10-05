// Getting furniture (docs/HOUSING.md §3): Tanu's Trinkets, the workbench and the finds. installFurnitureSources(G) is
// called by installHousing (home/housing.js) once the game is set up. It builds:
//  - Tanu's market stall on Market Street (an F interactable, a minimap dot: G.trinketStall) and G.openTrinkets():
//    the shop panel (ui/shop.js `furniture` goods + the furniture Sell tab) over today's stock (home/trinkets.js);
//  - G.openWorkbench(where) ('home': the cottage's workbench item, 'lumber': the Lumber workshop) → the Workbench panel
//    (ui/craft.js), and G.workbench.craft(id, n): the crafting moment (the hero hammers away, the materials are
//    spent, the piece goes to storage; 'furniture:changed' + 'furniture:crafted');
//  - G.teachRecipe(id, { from }) (recipe scrolls; a villager's thank-you), G.finds ({ force }: the next find roll is a
//    sure thing, for tests) and G.furnitureGain(id, n, { first, worldPos }) (the pickup toast of a find).
import * as THREE from 'three';
import { Events } from '../core/events.js';
import { instantiate } from '../world/buildings/kit.js';
import { trinketStallTemplate } from './stallModel.js';
import { itemDef, SETS, SURFACES } from './furniture.js';
import { surfaceSwatch } from './surfaces.js';
import { trinketsOf, stockLeft, sellOne, buyBackPrice, TANU } from './trinkets.js';
import { RECIPES, workbenchOf, knowsRecipe, maxCraft, craftCost, teachRecipe } from './recipes.js';
import { furnitureThumb } from '../ui/decorate.js';

// the stall: in the nook between the last shop lot on Market Street's north side and the market square, a step off
// the street, its front turned to the street and the camera (clear of the plots, the road and the square's banners)
export const TRINKET_STALL = { x: 154.6, z: 116.1, rot: 0.42 };
const pick = a => a[Math.floor(Math.random() * a.length)];
/** a piece the household has never had ("New!"): never found, and none in storage (the starter storage predates
 *  state.furnitureFound) */
export const isNewPiece = (st, id) => !st.furnitureFound?.[id] && !(st.furniture?.[id] > 0);
const wait = ms => new Promise(r => setTimeout(r, ms));
/** how long one crafting moment takes (n pieces at once take a little longer) */
export const craftTime = (n = 1) => 1700 + Math.min(900, (n - 1) * 150);

export function installFurnitureSources(G) {
  G.finds ||= { force: 0 };
  G.teachRecipe = (id, o) => teachRecipe(G, id, o);
  G.furnitureGain = (id, n, o) => furnitureGain(G, id, n, o);
  workbenchOf(G.state);
  addTrinketStall(G);
  installTrinkets(G);
  installWorkbench(G);
}

const today = G => G.day?.day || G.state.day || 1;
const rankOf = G => G.sim?.stats?.rank || 1;
const iconOf = (G, id) => (SURFACES[id] ? surfaceSwatch(id) : furnitureThumb(G, id, true));

/** a piece arrived in storage from the world (a find): a toast with its picture ("New!" the first time), fly to the bag */
export function furnitureGain(G, id, n = 1, { first = false, worldPos = null, sub = null } = {}) {
  const ui = G.ui, d = itemDef(id); if (!ui?.ready || !d) return;
  const icon = iconOf(G, id);
  ui.toast(`${d.name}${n > 1 ? ` ×${n}` : ''}${first ? ' <b class="t-new">New!</b>' : ''}`, { iconURL: icon, html: true, color: SETS[d.set]?.color || '#ffb07a', sub: sub || (first ? 'A rare find! Sent to your storage ♡' : 'Sent to your storage ♡') });
  let from = { x: innerWidth / 2, y: innerHeight / 2 };
  const cam = G.engine?.camera;
  if (cam && worldPos) { const p = new THREE.Vector3(worldPos.x, worldPos.y || 0, worldPos.z).project(cam); from = { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight }; }
  if (icon) ui.flyToBag?.(icon, from);
}

// ------------------------------------------------------------------ the stall
function addTrinketStall(G) {
  const W = G.village?.world; if (!W) return;
  const S = TRINKET_STALL, inst = instantiate(trinketStallTemplate()), g = inst.group;
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g); // (local: not placed yet)
  const y = W.heightAt(S.x, S.z);
  g.position.set(S.x, y, S.z); g.rotation.y = S.rot; g.name = 'trinketStall';
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  W.scene.add(g);
  const c = Math.cos(S.rot), s = Math.sin(S.rot);
  // its two paper lanterns and the lucky cat light up at night (light-pool sources, like a building's)
  g.updateMatrixWorld(true);
  const lights = (trinketStallTemplate().lights || []).map(l => W.lightPool?.addSource({ pos: l.pos.clone().applyMatrix4(g.matrixWorld), color: new THREE.Color(l.color), intensity: l.intensity ?? 3, radius: l.radius ?? 5, flicker: l.flicker ?? 0.3, nightOnly: l.nightOnly ?? true })).filter(Boolean);
  const toW = (lx, lz) => [S.x + lx * c + lz * s, S.z - lx * s + lz * c];
  // colliders: a row of circles across the stall's width, sized from the model (the final model may differ)
  const w = Math.max(0.6, box.max.x - box.min.x), d = Math.max(0.5, box.max.z - box.min.z), cx = (box.max.x + box.min.x) / 2, cz = (box.max.z + box.min.z) / 2;
  const r = Math.min(0.8, Math.max(0.4, d * 0.45)), n = Math.max(1, Math.round((w * 0.85) / (2 * r)));
  const cols = [];
  for (let i = 0; i < n; i++) { const lx = cx + (n === 1 ? 0 : (i / (n - 1) - 0.5) * (w * 0.85 - 2 * r)); const [x, z] = toW(lx, cz); cols.push(W.collision?.addCircle(x, z, r, 'stall')); } // (not a sim building: s5's collider audit counts those)
  const R = Math.max(w, d) / 2 + 0.5;
  W.veg?.clearRect?.(S.x - R - 1.2, S.z - R - 1.2, S.x + R + 1.2, S.z + R + 1.2, 0); // (lawn clumps are a metre across)
  // no lawn growing through the stall's floor: the ground under it is worn bare (terrain wear, like a yard's path)
  const tr = G.sim?.terrain || W.terrain;
  if (tr?.wear) {
    const N = Math.round(Math.sqrt(tr.wear.length));
    for (let zi = Math.floor(S.z - R - 1.5); zi <= Math.ceil(S.z + R + 1.5); zi++) for (let xi = Math.floor(S.x - R - 1.5); xi <= Math.ceil(S.x + R + 1.5); xi++) {
      const dx = xi + 0.5 - S.x, dz = zi + 0.5 - S.z, lx = dx * c - dz * s, lz = dx * s + dz * c; // (world → the stall's local frame)
      if (lx < box.min.x - 0.9 || lx > box.max.x + 0.9 || lz < box.min.z - 0.9 || lz > box.max.z + 1.4 || xi < 0 || zi < 0 || xi >= N || zi >= N) continue; // (a clump's blades reach ~1 m: a margin, more in front where shoppers stand)
      tr.wear[zi * N + xi] = Math.max(tr.wear[zi * N + xi], 255);
    }
    if (G.sim?.refreshTiles) G.sim.refreshTiles(); else tr.syncTiles?.();
  }
  const [px, pz] = toW(cx, box.max.z + 0.55);
  const pos = new THREE.Vector3(px, W.heightAt(px, pz), pz);
  W.interactables.push({ pos, radius: 1.3, label: "Tanu's Trinkets", onInteract: () => G.openTrinkets() });
  G.trinketStall = { pos, group: g, at: { x: S.x, z: S.z }, cols, lights };
}

// ------------------------------------------------------------------ the shop
function installTrinkets(G) {
  const S = () => G.state;
  /** today's stock (state.trinkets): restocked on a new day or village rank */
  G.trinkets = () => trinketsOf(S(), today(G), rankOf(G));
  const buy = e => {
    const st = S(), A = G.actions, T = G.trinkets(), s = T.list.find(x => x.id === e.furn);
    if (!s || stockLeft(T, s) <= 0) return { ok: false, say: TANU.soldOut, gone: true };
    if (s.kind === 'scroll' && knowsRecipe(st, s.recipe)) return { ok: false, say: 'You know that one already! Tanu never sells the same trick twice~', gone: true };
    if ((st.coins || 0) < s.price || !A.spendCoins(s.price)) return { ok: false, say: pick(TANU.poor) };
    sellOne(T, s.id);
    if (s.kind === 'scroll') {
      teachRecipe(G, s.recipe, { from: 'tanu' });
      Events.emit('trinkets:bought', { id: s.id, recipe: s.recipe, price: s.price });
      return { ok: true, scroll: true, left: stockLeft(T, s), say: pick(TANU.thanksScroll) };
    }
    const first = isNewPiece(st, s.id);
    A.addFurniture(s.id, 1, { src: 'shop' });
    Events.emit('trinkets:bought', { id: s.id, price: s.price });
    return { ok: true, first, left: stockLeft(T, s) };
  };
  const sell = id => {
    const A = G.actions, v = buyBackPrice(id);
    if (!v || !A.spendFurniture({ [id]: 1 }, { src: 'sell' })) return 0;
    A.addCoins(v);
    Events.emit('trinkets:sold', { id, coins: v });
    return v;
  };
  G.openTrinkets = (o = {}) => {
    if (!G.ui?.open) return false;
    const st = S(), fresh = st.trinkets?.day !== today(G), T = G.trinkets();
    const furniture = T.list.map(e => ({ id: e.id, price: e.price, stock: e.stock == null ? null : stockLeft(T, e), recipe: e.recipe || null, always: !!e.always })).filter(e => (e.stock == null || e.stock > 0) && !(e.recipe && knowsRecipe(st, e.recipe))); // (a scroll you've since learned elsewhere stays in the back)
    const h = G.day?.hour ?? 12;
    const greeting = h >= 21 || h < 6 ? "*yawn* Burning the midnight oil, Chewy? Quick, before Tanu nods off~" : fresh && st.flags?.trinketsSeen ? TANU.greetNew : pick(TANU.greet);
    (st.flags ||= {}).trinketsSeen = true;
    G.ui.open('shop', {
      name: "Tanu's Trinkets", jp: 'たぬき屋', keeper: 'tanu', portrait: G.portrait?.('tanu'), greeting,
      furniture, potions: [], stock: [], noBagSell: true, sellFurniture: true, tab: o.tab,
      thanks: TANU.thanks, sellThanks: TANU.sold, emptySell: TANU.nothing,
      onBuyFurniture: buy, onSellFurniture: sell, furnitureSellPrice: buyBackPrice,
    });
    G.ui.panels?.inventory?.setView?.('furniture', true); // (the storage beside the shop)
    Events.emit('sfx', 'ui_open');
    Events.emit('trinkets:open', { day: T.day, rank: T.rank });
    return true;
  };
}

// ------------------------------------------------------------------ the workbench
const WHERE = { home: ['Workbench', 'さぎょうだい'], lumber: ['Lumber Yard Workbench', 'もくざいば'] };
function installWorkbench(G) {
  const WB = G.workbench = {
    busy: false, where: null, at: null,
    /** One crafting moment (the Workbench panel awaits it) → { ok, id, out, n, first } | { fail } */
    async craft(id, n = 1) {
      const st = G.state, A = G.actions, R = RECIPES[id];
      if (WB.busy) return { fail: 'busy' };
      if (!R || !knowsRecipe(st, id)) return { fail: "You don't know that recipe yet!" };
      n = Math.min(Math.max(1, n | 0), maxCraft(st, id));
      if (n < 1) return { fail: 'Not enough materials!' };
      WB.busy = true;
      const P = G.player, dur = craftTime(n), at = P.pos.clone().add(new THREE.Vector3(Math.sin(P.facing) * 0.7, 0.75, Math.cos(P.facing) * 0.7));
      P.controlLocked = true; P.moveTarget = null; P.interactTarget = null;
      let on = true;
      const hammer = () => { if (!on) return; P.anim.play('till', { onEvent: ev => { if (!on) return; if (ev === 'chop' || ev === 'chop2') { Events.emit('sfx', 'build_place', { vol: 0.32, pitch: 1.35 }); G.vfx?.dust?.(at, { n: 2, color: '#f2d8a8', size: 0.18 }); } else if (ev === 'end') hammer(); } }); };
      hammer();
      try { await wait(dur); } finally { on = false; }
      if (P.anim.action?.name === 'till') P.anim.stop();
      // spend and make
      const cost = craftCost(id, n), hasP = Object.keys(cost.pantry).length;
      let ok = A.hasMaterials(cost.mats) && (!hasP || A.hasPantry(cost.pantry));
      if (ok) { ok = A.spendMaterials(cost.mats); if (ok && hasP) A.spendPantry(cost.pantry, { src: 'craft' }); }
      P.controlLocked = false; G.interactCooldown = performance.now() + 300;
      WB.busy = false;
      if (!ok) return { fail: 'Not enough materials!' };
      const out = R.out, made = n * (R.n || 1), first = isNewPiece(st, out);
      A.addFurniture(out, made, { src: 'craft' });
      const w = workbenchOf(st); w.crafted[id] = (w.crafted[id] || 0) + n;
      P.anim.play('clap');
      Events.emit('sfx', 'build_complete', { vol: 0.6 });
      G.vfx?.sparkle?.(at, { n: 14, color: '#ffe8a0', r: 0.45, rise: 0.9 });
      Events.emit('furniture:crafted', { id, out, n: made, first, where: WB.where });
      return { ok: true, id, out, n: made, first };
    },
  };
  G.openWorkbench = (where = 'home') => {
    if (!G.ui?.open) return false;
    workbenchOf(G.state);
    WB.where = WHERE[where] ? where : 'home';
    const [title, jp] = WHERE[WB.where];
    G.ui.open('craft', { where: WB.where, title, jp });
    Events.emit('sfx', 'ui_open');
    Events.emit('workbench:open', { where: WB.where });
    return true;
  };
}
