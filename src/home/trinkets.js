// Tanu's Trinkets (docs/HOUSING.md §3): the furniture shop's daily stock and Tanu's lines. Pure data + functions
// (node-tested in tools/test-rpg.mjs); the stall, the panel and the buying live in home/sources.js and ui/shop.js.
//
// The stock of a day: the always-available basics (both cushions, the side table, the pack photo, the basic wallpapers
// and floors: no limit), ~8 rotating pieces from the furniture and surfaces Tanu can sell at the village's rank
// (0 < shopRank <= rank; cheaper pieces turn up more often; 1-2 of each), and a couple of recipe scrolls for workbench
// recipes the household doesn't know yet. It's a pure function of (the state's known recipes, the day, the rank).
//
// state.trinkets = { day, rank, list: [{ id, kind: 'furniture' | 'scroll', price, stock (null = no limit), always? }],
//                    sold: { [id]: n } } (lazy; a new day or a new rank restocks, and what's sold today persists)
import { FURNITURE_IDS, SURFACE_IDS, SURFACES, itemDef, shopRank } from './furniture.js';
import { SCROLLS, knowsRecipe } from './recipes.js';

export const ALWAYS = ['zabutonPink', 'zabutonBlue', 'sideTable', 'packPhoto', 'wp_stripes', 'wp_dots', 'fl_walnut', 'fl_checker'];
export const DAILY = 8, DAILY_SCROLLS = 2;
const ORDER = new Map([...FURNITURE_IDS, ...SURFACE_IDS].map((id, i) => [id, i]));

// a small deterministic RNG (mulberry32) seeded from the day and the rank
function rngOf(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const seedOf = (day, rank, salt) => Math.imul((day | 0) + 7919, 2654435761) ^ Math.imul((rank | 0) + 31, 40503) ^ salt;
/** the pieces and surfaces that can rotate in at this rank (the always-available ones are never in the rotation) */
export function trinketPool(rank = 1) {
  return [...FURNITURE_IDS, ...SURFACE_IDS.filter(id => !SURFACES[id].free)].filter(id => { const r = shopRank(itemDef(id)); return r > 0 && r <= rank && !ALWAYS.includes(id); });
}
/** cheaper pieces turn up more often (a 60-coin cushion ~10x as often as a 700-coin hearth) */
export const stockWeight = price => Math.pow(200 / (Math.max(0, price) + 100), 1.25);
/** weighted picks without replacement */
function pickSome(items, n, rnd) {
  const left = items.slice(), out = [];
  while (out.length < n && left.length) {
    const tot = left.reduce((a, e) => a + e.w, 0);
    let x = rnd() * tot, i = 0;
    for (; i < left.length - 1; i++) { x -= left[i].w; if (x <= 0) break; }
    out.push(left.splice(i, 1)[0]);
  }
  return out;
}

/** The stock of a day → [{ id, kind, price, stock, always? }] (basics, the day's pieces, scrolls). Deterministic. */
export function trinketStock(st, day = 1, rank = 1) {
  rank = Math.max(1, rank | 0);
  const rnd = rngOf(seedOf(day, rank, 0x7a4e)), out = [];
  for (const id of ALWAYS) out.push({ id, kind: 'furniture', price: itemDef(id).price, stock: null, always: true });
  const pool = trinketPool(rank).map(id => ({ id, w: stockWeight(itemDef(id).price) }));
  const day8 = pickSome(pool, DAILY, rnd).sort((a, b) => ORDER.get(a.id) - ORDER.get(b.id)); // (catalog order on the shelf)
  for (const { id } of day8) { const p = itemDef(id).price; out.push({ id, kind: 'furniture', price: p, stock: 1 + (rnd() < (p <= 200 ? 0.55 : 0.25) ? 1 : 0) }); }
  const scrolls = SCROLLS.filter(s => s.rank <= rank && !knowsRecipe(st, s.id)).map(s => ({ ...s, w: 1 }));
  for (const s of pickSome(scrolls, DAILY_SCROLLS, rnd)) out.push({ id: 'recipe:' + s.id, recipe: s.id, kind: 'scroll', price: s.price, stock: 1 });
  return out;
}
/** today's stock, kept in state.trinkets (restocked on a new day or rank; what's sold today stays sold) */
export function trinketsOf(st, day = 1, rank = 1) {
  let T = st.trinkets;
  if (!T || T.day !== day || T.rank !== rank || !Array.isArray(T.list)) {
    const sold = T && T.day === day && T.sold ? T.sold : {};
    T = st.trinkets = { day, rank, list: trinketStock(st, day, rank), sold };
  }
  T.sold ||= {};
  return T;
}
/** how many are left of a stock entry today (Infinity for the always-available basics) */
export const stockLeft = (T, e) => (e.stock == null ? Infinity : Math.max(0, e.stock - (T.sold?.[e.id] || 0)));
/** mark one sold → false when there's none left */
export function sellOne(T, id) {
  const e = T.list.find(x => x.id === id); if (!e || stockLeft(T, e) <= 0) return false;
  if (e.stock != null) T.sold[id] = (T.sold[id] || 0) + 1;
  return true;
}
/** what Tanu pays for a piece from your storage: half its price */
export const buyBackPrice = id => { const d = itemDef(id); return d && !d.free ? Math.max(1, Math.floor((d.price || 0) / 2)) : 0; };

// ------------------------------------------------------------------ Tanu's lines (a cheeky merchant)
export const TANU = {
  greet: [
    "Welcome to Tanu's Trinkets! Everything's genuine. Mostly.",
    "Ah, Chewy! Fresh stock today — some of it only slightly haunted~",
    'Furniture, curios, the finest cushions on the island! Have a sniff around.',
    'Psst. Today only, a special price. For you. And everyone else.',
  ],
  greetNew: "New stock just came in! Some of it fell off a very respectable cart.",
  thanks: ["Pleasure doing business~ It's in your storage!", 'A fine choice! Your house will thank you.', 'Hehe, that coin jingle never gets old.', 'Sold! No refunds. Well… half refunds.', 'Good eye, pup. That one was going fast!'],
  thanksScroll: ['A recipe! Build it yourself, save a coin. I hate that I sold you this.', 'Hammer, saw, and a bit of patience. You can do it!'],
  sold: ['Ooh, I know just the buyer. Half price, as promised!', 'Hmm… a bit scratched. Still, a deal is a deal!', 'Into the back room it goes~', 'Coins for you, a treasure for me. Everyone wins!'],
  poor: ["Hmm, you're a few coins short… Tanu doesn't do IOUs. Anymore.", 'No coins, no cushion! Come back after a good dig~'],
  soldOut: "That one's gone, I'm afraid. Come back tomorrow — new stock every morning!",
  nothing: 'Nothing to sell? A shame. I was going to rob— er, reward you.',
};
