// Cooking (docs/HOMESTEAD.md §4): the recipes, where each can be cooked, how each is learned, and the pure helpers the
// Cook panel (ui/cook.js) and the kitchen (life/kitchen.js) use. Pure data + functions (node-tested).
//
// state.cookbook = { known: { [recipe]: day learned }, cooked: { [recipe]: n }, quick: dish id (the G quick-meal) }
// (household, lazy-init). Recipes produce the dish of the same id (life/pantry.js holds the dishes' names, food, value).
//
// An ingredient: { k, n } where k is a pantry id ('rice'), 'fish' (any fish but the Moon Koi, cheapest first), 'crop'
// (any crop, cheapest first), or 'mat:<material>' (state.materials, e.g. 'mat:mochi').
import { PANTRY } from './pantry.js';

// stations: 'kitchen' (Chewy's cottage), 'campfire' (the Burrow / region camps: simple recipes only), 'oven' (Rosie's)
export const STATIONS = {
  kitchen: { name: "Chewy's Kitchen", jp: 'だいどころ', icon: 'home' },
  campfire: { name: 'Campfire', jp: 'たき火', icon: 'fire' },
  oven: { name: "Rosie's Oven", jp: 'オーブン', icon: 'shop' },
};

// learn: how it's learned — 'starter' | { from: villager, hearts: n } | { quest } | { book: price, rank? } | { request: villager }.
// Every recipe can also be discovered by cooking its exact ingredients in the Cook panel's "Try a mix".
export const RECIPES = {
  grilledFish: { ing: [{ k: 'fish', n: 1 }], at: ['kitchen', 'campfire'], learn: 'starter' },
  roastedVeggies: { ing: [{ k: 'crop', n: 2 }], at: ['kitchen', 'campfire'], learn: 'starter' },
  onigiri: { ing: [{ k: 'rice', n: 1 }], at: ['kitchen'], learn: 'starter' },
  salmonOnigiri: { ing: [{ k: 'rice', n: 1 }, { k: 'salmon', n: 1 }], at: ['kitchen'], learn: { book: 200 } },
  misoSoup: { ing: [{ k: 'daikon', n: 1 }, { k: 'fish', n: 1 }], at: ['kitchen'], learn: { request: 'kero', book: 150 } },
  carrotSoup: { ing: [{ k: 'carrot', n: 2 }], at: ['kitchen'], learn: { quest: 'firstSprouts', from: 'usagi', hearts: 3 } },
  cabbageRolls: { ing: [{ k: 'cabbage', n: 2 }, { k: 'carrot', n: 1 }], at: ['kitchen'], learn: { request: 'usagi', book: 180 } },
  pumpkinStew: { ing: [{ k: 'pumpkin', n: 1 }, { k: 'daikon', n: 1 }], at: ['kitchen'], learn: { request: 'kuma', book: 240 } },
  grilledTrout: { ing: [{ k: 'trout', n: 1 }], at: ['kitchen', 'campfire'], learn: { from: 'kero', hearts: 3 } },
  strawberryMochi: { ing: [{ k: 'strawberry', n: 1 }, { k: 'mat:mochi', n: 1 }], at: ['oven'], learn: { quest: 'tasteTest', from: 'rosie', hearts: 3 } },
  honeyCake: { ing: [{ k: 'honey', n: 1 }, { k: 'strawberry', n: 1 }], at: ['oven'], learn: { from: 'kuma', hearts: 3 } },
  melonBread: { ing: [{ k: 'melon', n: 1 }, { k: 'honey', n: 1 }], at: ['oven'], learn: { from: 'pan', hearts: 3 } },
  sushiPlatter: { ing: [{ k: 'rice', n: 1 }, { k: 'fish', n: 3 }], at: ['kitchen'], learn: { from: 'mochi', hearts: 3, request: 'mochi' } },
  fishermansFeast: { ing: [{ k: 'fish', n: 2 }, { k: 'rice', n: 1 }, { k: 'daikon', n: 1 }], at: ['kitchen'], learn: { request: 'tanu', book: 600, rank: 3 } },
  moonKoiBento: { ing: [{ k: 'moonKoi', n: 1 }, { k: 'rice', n: 2 }, { k: 'seaweed', n: 1 }], at: ['kitchen'], learn: { from: 'kitsune', hearts: 3 } },
};
export const RECIPE_IDS = Object.keys(RECIPES);
export const STARTERS = RECIPE_IDS.filter(id => RECIPES[id].learn === 'starter');
/** Rosie's cookbook pages for sale → [{ id, price, rank }] */
export const COOKBOOK = RECIPE_IDS.filter(id => RECIPES[id].learn.book).map(id => ({ id, price: RECIPES[id].learn.book, rank: RECIPES[id].learn.rank || 1 }));
/** what a villager teaches at `hearts` (their loved dish, mostly) and after a pantry request → { hearts: [ids], request: [ids] } */
export function teachesOf(who) {
  const out = { hearts: [], request: [] };
  for (const id of RECIPE_IDS) { const L = RECIPES[id].learn; if (L.from === who) out.hearts.push(id); if (L.request === who) out.request.push(id); }
  return out;
}

// ------------------------------------------------------------------ the cookbook state
export function cookbookOf(st) {
  const c = (st.cookbook ||= {});
  c.known ||= {}; c.cooked ||= {};
  for (const id of STARTERS) if (!(id in c.known)) c.known[id] = 0;
  return c;
}
export const knows = (st, id) => !!st?.cookbook?.known && id in st.cookbook.known;
/** Learn a recipe → true when it's new. */
export function learn(st, id, day = 1) { const c = cookbookOf(st); if (!RECIPES[id] || id in c.known) return false; c.known[id] = day; return true; }

// ------------------------------------------------------------------ ingredients
const isFish = id => PANTRY[id]?.kind === 'fish';
const isCrop = id => PANTRY[id]?.kind === 'crop';
/** the pantry ids a wildcard can use, cheapest first ('fish' never spends the Moon Koi) */
export function wildIds(k, st) {
  const P = st?.pantry || {};
  const ok = k === 'fish' ? id => isFish(id) && id !== 'moonKoi' : k === 'crop' ? isCrop : () => false;
  return Object.keys(P).filter(id => P[id] > 0 && ok(id)).sort((a, b) => PANTRY[a].value - PANTRY[b].value || a.localeCompare(b));
}
/** how many of an ingredient key the household has */
export function haveOf(st, k) {
  if (k.startsWith('mat:')) return st?.materials?.[k.slice(4)] || 0;
  if (k === 'fish' || k === 'crop') return wildIds(k, st).reduce((a, id) => a + st.pantry[id], 0);
  return st?.pantry?.[k] || 0;
}
/** Specific pantry ids are reserved first, so a wildcard never eats the salmon the recipe also names. */
function plan(st, ing, times) {
  const pantry = { ...(st?.pantry || {}) }, mats = {}, use = {};
  const take = (id, n) => { pantry[id] -= n; use[id] = (use[id] || 0) + n; };
  for (const { k, n } of ing) {
    if (k === 'fish' || k === 'crop') continue;
    const need = n * times;
    if (k.startsWith('mat:')) { const m = k.slice(4); if ((st?.materials?.[m] || 0) < need) return null; mats[m] = (mats[m] || 0) + need; continue; }
    if ((pantry[k] || 0) < need) return null;
    take(k, need);
  }
  for (const { k, n } of ing) {
    if (k !== 'fish' && k !== 'crop') continue;
    let need = n * times;
    for (const id of wildIds(k, { pantry })) { const t = Math.min(need, pantry[id]); if (t > 0) { take(id, t); need -= t; } if (!need) break; }
    if (need > 0) return null;
  }
  return { pantry: use, mats };
}
/** What cooking a recipe `times` times would spend → { pantry: {id: n}, mats: {k: n} } | null when short. */
export function spendFor(st, id, times = 1) { const R = RECIPES[id]; return R ? plan(st, R.ing, times) : null; }
/** How many times it can be cooked right now (capped at 99). */
export function maxCook(st, id) { let n = 0; while (n < 99 && spendFor(st, id, n + 1)) n++; return n; }
export const cookableAt = (id, station) => !!RECIPES[id]?.at.includes(station);

// ------------------------------------------------------------------ "Try a mix": discovery and sensible fallbacks
/** The ingredient keys a picked pantry / material id matches ('salmon' → ['salmon', 'fish']). */
function keysOf(id) { const out = [id]; if (isFish(id) && id !== 'moonKoi') out.push('fish'); if (isCrop(id)) out.push('crop'); return out; }
/** picks: { [pantry id | 'mat:x']: n } → the recipe these exact ingredients make at this station, or null.
 *  A recipe matches when every pick is used by exactly one of its ingredients and every ingredient is covered. */
export function matchMix(picks, station = 'kitchen') {
  const items = Object.entries(picks).filter(([, n]) => n > 0);
  if (!items.length) return null;
  const total = items.reduce((a, [, n]) => a + n, 0);
  // most specific first: named ingredients beat wildcards (rice + salmon is Salmon Onigiri, not Onigiri + Grilled Fish)
  const order = RECIPE_IDS.filter(id => cookableAt(id, station)).sort((a, b) => spec(b) - spec(a));
  for (const id of order) {
    const ing = RECIPES[id].ing;
    if (ing.reduce((a, x) => a + x.n, 0) !== total) continue;
    const left = Object.fromEntries(items);
    let ok = true;
    for (const { k, n } of ing.filter(x => x.k !== 'fish' && x.k !== 'crop')) { if ((left[k] || 0) < n) { ok = false; break; } left[k] -= n; }
    if (!ok) continue;
    for (const { k, n } of ing.filter(x => x.k === 'fish' || x.k === 'crop')) {
      let need = n;
      for (const [pid, m] of Object.entries(left)) { if (need && m > 0 && keysOf(pid).includes(k)) { const t = Math.min(need, m); left[pid] -= t; need -= t; } }
      if (need) { ok = false; break; }
    }
    if (ok && Object.values(left).every(v => v === 0)) return id;
  }
  return null;
}
const spec = id => RECIPES[id].ing.reduce((a, x) => a + (x.k === 'fish' || x.k === 'crop' ? 0 : 10) + x.n, 0);
/** A mix that matches nothing still makes something edible: fish → Grilled Fish, rice → Onigiri, crops → Roasted
 *  Veggies (the extras are spent too — a happy accident, not a waste). → recipe id | null (nothing edible). */
export function fallbackMix(picks) {
  const ids = Object.keys(picks).filter(k => picks[k] > 0);
  if (ids.some(isFish)) return 'grilledFish';
  if (ids.includes('rice')) return 'onigiri';
  if (ids.filter(isCrop).reduce((a, id) => a + picks[id], 0) >= 2) return 'roastedVeggies';
  return null;
}
/** A hint for a recipe the player doesn't know yet (the "???" rows). */
export function hintFor(id, names = {}) {
  const L = RECIPES[id].learn, R = RECIPES[id], who = w => names[w] || w;
  const parts = R.ing.map(x => (x.k === 'fish' ? 'fish' : x.k === 'crop' ? 'veggies' : x.k.startsWith('mat:') ? x.k.slice(4) : PANTRY[x.k]?.name.toLowerCase() || x.k));
  const how = L.quest === 'firstSprouts' ? `${who('usagi')} will share it with a new gardener` : L.quest === 'tasteTest' ? `${who('rosie')} teaches it to her taste-testers`
    : L.from ? `${who(L.from)} might teach you as a good friend` : L.book ? `a page in Rosie's cookbook` : L.request ? `${who(L.request)} knows it` : '';
  return { ingredients: parts, how };
}
