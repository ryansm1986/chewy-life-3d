// The Home Rating (docs/HOUSING.md §4): 1-5 stars for a decorated room, and what would make it better. Pure (node-tested
// in tools/test-rpg.mjs): homeRating(interior, taste) where interior = { layout, wall, floor, items } (a building's
// saved b.interior) and taste = an owner's { style: [tags], likesFurniture: [ids] } (actors/roster.js `home`), or null.
//
// Points (100 in all):
//  - filled   20  enough furniture for the room's size (about one piece per 1.75 m² of floor), and a clutter penalty when
//                 floor pieces cover more than 55% of the floor
//  - variety  20  somewhere to sit, a table, a lamp, something on the walls, a rug, a plant
//  - sets     15  three pieces from one themed set (five for the full points; Cottage Basics: five for a third)
//  - lighting 10  a lamp (two for the full points)
//  - taste    25  pieces in the owner's style (their tags; 'cozy' is everyone's, so it doesn't count) and the pieces
//                 they love — what you bring: a villager's own furnishing (items marked `own`) doesn't count here
//  - finish   10  a wall item, a rug, and wallpaper or a floor of your choosing
import { FURNITURE, SURFACES, DEFAULT_WALL, DEFAULT_FLOOR } from './furniture.js';
import { LAYOUTS } from './rooms.js';

export const RATING_PARTS = { filled: 20, variety: 20, sets: 15, lighting: 10, taste: 25, finish: 10 };
export const STAR_AT = [0, 25, 50, 70, 88]; // the score each star (1-5) starts at
/** Chewy's cottage has no owner: it's rated for the pack's own taste (a bookworm and a fish-watcher at heart) */
export const COTTAGE_TASTE = { style: ['cute', 'sweet'], likesFurniture: ['bookshelf', 'armchair', 'fishTank', 'packPhoto'] };

const VARIETY = [
  ['seat', 'somewhere to sit', d => d.cat === 'seating'],
  ['table', 'a table', d => d.cat === 'table'],
  ['light', 'a lamp', d => !!d.light],
  ['wall', 'something on the walls', d => d.mount === 'wall'],
  ['rug', 'a rug', d => d.mount === 'rug'],
  ['plant', 'a plant', d => d.tags.includes('nature') && ['decor', 'tabletop'].includes(d.cat)],
];

/** floor cells of a layout (its rooms' areas) */
export function floorCells(layout) {
  const L = typeof layout === 'string' ? LAYOUTS[layout] : layout;
  return (L?.rooms || []).reduce((a, r) => a + r.w * r.d, 0) || 120;
}

/** → { score (0-100), stars (1-5), parts: { filled, variety, sets, lighting, taste, finish }, has: {...}, tips: [text] } */
export function homeRating(interior, T = null) {
  const items = (interior?.items || []).filter(it => FURNITURE[it.id]);
  const defs = items.map(it => FURNITURE[it.id]);
  const cells = floorCells(interior?.layout);
  const tips = [];
  // ---- filled: one "piece" per 7 cells (tabletop items and wall items count half), with clutter past 55% floor cover
  const pieces = defs.reduce((a, d) => a + (d.mount === 'table' || d.mount === 'wall' ? 0.5 : 1), 0);
  const want = Math.max(6, Math.round(cells / 7));
  let cover = 0;
  for (const it of items) { const d = FURNITURE[it.id]; if (it.mount === 'floor' && !d.walk) cover += d.size[0] * d.size[1]; }
  const coverFrac = cover / cells;
  let filled = RATING_PARTS.filled * Math.min(1, pieces / want);
  const clutter = Math.max(0, coverFrac - 0.55) * 80;
  filled = Math.max(0, filled - clutter);
  if (pieces < want * 0.75) tips.push({ k: 'more', text: 'more furniture', gain: RATING_PARTS.filled * (1 - pieces / want) });
  if (clutter > 2) tips.push({ k: 'clutter', text: 'a little more floor space (it feels cluttered)', gain: clutter });
  // ---- variety
  const has = {};
  for (const [k, , test] of VARIETY) has[k] = defs.some(test);
  const variety = RATING_PARTS.variety * VARIETY.filter(([k]) => has[k]).length / VARIETY.length;
  for (const [k, text] of VARIETY) if (!has[k]) tips.push({ k, text, gain: RATING_PARTS.variety / VARIETY.length });
  // ---- sets: distinct pieces per set
  const bySet = {};
  for (const d of defs) (bySet[d.set] ||= new Set()).add(d.id);
  let sets = 0, bestSet = null;
  for (const [s, ids] of Object.entries(bySet)) {
    const n = ids.size, v = s === 'basics' ? (n >= 5 ? 5 : 0) : n >= 5 ? RATING_PARTS.sets : n >= 3 ? 8 : n === 2 ? 3 : 0;
    if (v > sets) { sets = v; bestSet = s; }
  }
  if (sets < 8) tips.push({ k: 'set', text: 'three pieces from one themed set', gain: 8 - sets });
  else if (sets < RATING_PARTS.sets) tips.push({ k: 'set5', text: `two more ${bestSet} pieces`, gain: RATING_PARTS.sets - sets });
  // ---- lighting
  const lamps = defs.filter(d => d.light).length;
  const lighting = lamps >= 2 ? RATING_PARTS.lighting : lamps === 1 ? 6 : 0;
  if (lamps < 2 && has.light) tips.push({ k: 'light2', text: 'a second lamp', gain: RATING_PARTS.lighting - lighting });
  // ---- taste: pieces in the owner's style, and the ones they love
  let taste = 0, styled = 0, loved = 0;
  if (T) {
    const style = (T.style || []).filter(t => t !== 'cozy'), likes = new Set(T.likesFurniture || []);
    const brought = items.filter(it => !it.own).map(it => FURNITURE[it.id]); // (their own things are theirs already)
    styled = brought.filter(d => d.tags.some(t => style.includes(t))).length;
    loved = new Set(brought.filter(d => likes.has(d.id)).map(d => d.id)).size;
    taste = 15 * Math.min(1, styled / 8) + 10 * Math.min(1, loved / 3);
    if (styled < 8) tips.push({ k: 'style', text: `more ${style.slice(0, 2).join(' or ')} things`, gain: 15 * (1 - styled / 8), tag: style[0] });
    if (loved < 3) tips.push({ k: 'loved', text: 'one of their favourite pieces', gain: 10 * (1 - loved / 3) });
  } else taste = 12; // (no owner: a neutral half)
  // ---- finish: a wall item, a rug, your own wallpaper or floor
  const own = (interior?.wall && interior.wall !== DEFAULT_WALL && SURFACES[interior.wall]) || (interior?.floor && interior.floor !== DEFAULT_FLOOR && SURFACES[interior.floor]);
  const finish = (has.wall ? 4 : 0) + (has.rug ? 4 : 0) + (own ? 2 : 0);
  if (!own) tips.push({ k: 'surface', text: 'a new wallpaper or floor', gain: 2 });
  const parts = { filled, variety, sets, lighting, taste, finish };
  const score = Math.max(0, Math.min(100, Object.values(parts).reduce((a, v) => a + v, 0)));
  const stars = starsOf(score);
  tips.sort((a, b) => b.gain - a.gain);
  return { score: Math.round(score), stars, parts, has: { ...has, lamps, styled, loved, cover: +coverFrac.toFixed(2), pieces, want, bestSet }, tips: tips.map(t => t.text), tipKeys: tips.map(t => t.k) };
}
export const starsOf = score => (score >= STAR_AT[4] ? 5 : score >= STAR_AT[3] ? 4 : score >= STAR_AT[2] ? 3 : score >= STAR_AT[1] ? 2 : 1);
/** ★★★☆☆ */
export const starText = n => '★'.repeat(n) + '☆'.repeat(5 - n);

/** Does an interior meet a decorate request's needs? need = { tag?, n?, rug?, stars?, ids? (any one of), light? }
 *  → { ok, missing: [text] } (story.js 'decorate' steps; checked on the way out of the owner's home) */
export function meetsNeed(interior, need = {}, taste = null) {
  const items = (interior?.items || []).filter(it => FURNITURE[it.id]), defs = items.map(it => FURNITURE[it.id]);
  const missing = [];
  if (need.tag) { const n = defs.filter(d => d.tags.includes(need.tag)).length; if (n < (need.n || 1)) missing.push(`${(need.n || 1) - n} more ${need.tag} thing${(need.n || 1) - n > 1 ? 's' : ''}`); }
  if (need.rug && !defs.some(d => d.mount === 'rug')) missing.push('a rug');
  if (need.light && !defs.some(d => d.light)) missing.push('a lamp');
  if (need.ids && !defs.some(d => need.ids.includes(d.id))) missing.push(`a ${FURNITURE[need.ids[0]]?.name.toLowerCase() || 'special piece'}`);
  if (need.stars) { const r = homeRating(interior, taste); if (r.stars < need.stars) missing.push(`${need.stars} stars (it's ${r.stars} now)`); }
  return { ok: !missing.length, missing };
}
