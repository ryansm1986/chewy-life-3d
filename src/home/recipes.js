// The Workbench (docs/HOUSING.md §3): furniture recipes and the pure helpers the Workbench panel (ui/craft.js) and the
// crafting job (home/sources.js) use. Pure data + functions (node-tested in tools/test-rpg.mjs); the one exception is
// teachRecipe(G, …), which also tells the player (a toast, an event), but imports nothing from three.js or the DOM.
//
// A recipe: { out: furniture id, n: pieces made, mats: { material: n } (state.materials), pantry: { id: n }
// (state.pantry: crops, forage, fish), learn: 'start' | 'shop' | 'reward', rank? (the village rank from which Tanu sells
// its scroll), price? (the scroll's price), from? (who gives a 'reward' recipe: a villager's thank-you) }
//
// state.workbench = { known: { [recipe]: day learned }, crafted: { [recipe]: n } } (household, lazy-init; the 'start'
// recipes are known from the beginning).
import { Events } from '../core/events.js';
import { FURNITURE } from './furniture.js';

const R = (out, mats, o = {}) => ({ out, n: 1, mats, pantry: {}, learn: 'start', ...o });
export const RECIPES = {
  // ---- known from the start: simple wood, stone, petal and a little silk
  woodChair: R('woodChair', { wood: 6 }),
  sideTable: R('sideTable', { wood: 5, stone: 1 }),
  wallShelf: R('wallShelf', { wood: 4, petal: 1 }),
  flowerVase: R('flowerVase', { stone: 2, petal: 3 }),
  zabutonPink: R('zabutonPink', { silk: 1, petal: 2 }),
  // ---- scrolls from Tanu's Trinkets
  zabutonBlue: R('zabutonBlue', { silk: 1, petal: 1, stone: 1 }, { learn: 'shop', price: 90 }),
  ragRug: R('ragRug', { silk: 2, petal: 2 }, { learn: 'shop', price: 140 }),
  andonLamp: R('andonLamp', { wood: 4, lantern: 1, silk: 1 }, { learn: 'shop', price: 150 }),
  mushroomLamp: R('mushroomLamp', { lantern: 1 }, { pantry: { shiitake: 2 }, learn: 'shop', price: 130, rank: 2 }),
  bambooBench: R('bambooBench', { silk: 1, wood: 2 }, { pantry: { bamboo: 3 }, learn: 'shop', price: 170, rank: 2 }),
  pumpkinLamp: R('pumpkinLamp', { lantern: 1 }, { pantry: { pumpkin: 1 }, learn: 'shop', price: 160, rank: 3 }),
  melonStool: R('melonStool', { wood: 3 }, { pantry: { melon: 1 }, learn: 'shop', price: 140, rank: 3 }),
  // ---- a villager's thank-you (decorate requests: teachRecipe(G, id, { from }))
  catTower: R('catTower', { wood: 6, silk: 2 }, { learn: 'reward', from: 'mochi' }),
  fishTank: R('fishTank', { stone: 3, crystal: 2 }, { pantry: { crucian: 2 }, learn: 'reward', from: 'kero' }),
};
export const RECIPE_IDS = Object.keys(RECIPES);
export const START_RECIPES = RECIPE_IDS.filter(id => RECIPES[id].learn === 'start');
/** the recipe scrolls Tanu can sell → [{ id, price, rank }] */
export const SCROLLS = RECIPE_IDS.filter(id => RECIPES[id].learn === 'shop').map(id => ({ id, price: RECIPES[id].price || 120, rank: RECIPES[id].rank || 1 }));
/** the recipe that makes a furniture id (or null) */
export const recipeFor = out => RECIPE_IDS.find(id => RECIPES[id].out === out) || null;

// ------------------------------------------------------------------ the workbench state
export function workbenchOf(st) {
  const w = (st.workbench ||= {});
  w.known ||= {}; w.crafted ||= {};
  for (const id of START_RECIPES) if (!(id in w.known)) w.known[id] = 0;
  return w;
}
export const knowsRecipe = (st, id) => !!RECIPES[id] && (RECIPES[id].learn === 'start' || (!!st?.workbench?.known && id in st.workbench.known));
/** the recipes the household knows, in catalog order */
export const knownRecipes = st => RECIPE_IDS.filter(id => knowsRecipe(st, id));
/** Learn a recipe → true when it's new. */
export function learnRecipe(st, id, day = 1) {
  if (!RECIPES[id]) return false;
  const w = workbenchOf(st);
  if (id in w.known) return false;
  w.known[id] = day;
  return true;
}

// ------------------------------------------------------------------ ingredients
/** a recipe's ingredients → [{ kind: 'mat' | 'pantry', k, n }] (materials first) */
export function ingredientsOf(id) {
  const r = RECIPES[id]; if (!r) return [];
  return [...Object.entries(r.mats || {}).map(([k, n]) => ({ kind: 'mat', k, n })), ...Object.entries(r.pantry || {}).map(([k, n]) => ({ kind: 'pantry', k, n }))];
}
export const haveOf = (st, kind, k) => (kind === 'mat' ? st?.materials?.[k] || 0 : st?.pantry?.[k] || 0);
/** how many times the household could craft it with what it has (ignores whether it's known) */
export function maxCraft(st, id) {
  const ing = ingredientsOf(id); if (!ing.length) return 0;
  return Math.max(0, Math.min(...ing.map(e => Math.floor(haveOf(st, e.kind, e.k) / e.n))));
}
/** known, and the ingredients for n are there */
export const canCraft = (st, id, n = 1) => n >= 1 && knowsRecipe(st, id) && maxCraft(st, id) >= n;
/** what n crafts spend → { mats, pantry } */
export function craftCost(id, n = 1) {
  const r = RECIPES[id], mats = {}, pantry = {};
  if (!r) return { mats, pantry };
  for (const [k, v] of Object.entries(r.mats || {})) mats[k] = v * n;
  for (const [k, v] of Object.entries(r.pantry || {})) pantry[k] = v * n;
  return { mats, pantry };
}
/** where an unknown recipe comes from, for the "???" rows: → { how, who } */
export function recipeHint(id, names = {}) {
  const r = RECIPES[id];
  if (!r) return { how: '', who: null };
  if (r.learn === 'shop') return { how: 'Tanu sells this recipe', who: 'tanu' };
  if (r.learn === 'reward') return { how: r.from ? `${names[r.from] || r.from[0].toUpperCase() + r.from.slice(1)}'s thank-you` : "a villager's thank-you", who: r.from || null };
  return { how: 'Known from the start', who: null };
}

/** Teach the household a recipe (a scroll, a villager's thank-you) and tell the player. → true when it's new.
 *  o: { from: 'tanu' | a villager id | 'scroll', day, quiet } */
export function teachRecipe(G, id, o = {}) {
  const st = G.state, day = o.day ?? (G.day?.day || st.day || 1);
  if (!learnRecipe(st, id, day)) return false;
  const d = FURNITURE[RECIPES[id].out];
  Events.emit('workbench:learned', { id, from: o.from || null });
  if (!o.quiet) {
    G.ui?.toast?.(`New recipe: ${d?.name || id}!`, { icon: 'hammer', color: '#ffcf4a', sub: 'Make it at a workbench' });
    Events.emit('sfx', 'ui_quest');
  }
  return true;
}
