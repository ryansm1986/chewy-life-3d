// Exterior styles (docs/HOUSING.md §6): what a player can choose for a house's outside, and the four style sets. Pure
// data (node-tested in tools/test-rpg.mjs); the house builders read the resolved style off the Builder (B.style, see
// styleOf below) and fall back to their variant's own look for any field that isn't set.
//
// b.style (saved on the building record) = { set?, roof?, roofType?, wall?, trim?, door?, doorColor?, window?, noren?,
//   norenSym?, fence?, fenceColor?, bunting? } — ids from the option lists below (missing = the variant's own choice).
// getTemplate(id, level, seed, style) caches per style hash (styleKey), so two houses with the same look share it.
export const ROOF_COLORS = {
  slate: { name: 'Slate Blue', c: '#5d6f9e' }, teal: { name: 'Teal', c: '#3f8f8a' }, terracotta: { name: 'Terracotta', c: '#d86a4a' },
  moss: { name: 'Moss', c: '#6e9a5a' }, plum: { name: 'Plum', c: '#8a5a8a' }, vermilion: { name: 'Vermilion', c: '#c8503a' },
  charcoal: { name: 'Charcoal', c: '#4e4e5c' }, sakura: { name: 'Sakura', c: '#d88aa8' }, honey: { name: 'Honey', c: '#c89a4a' },
  sea: { name: 'Sea Blue', c: '#4a86b8' },
};
export const ROOF_TYPES = { hip: { name: 'Hip' }, gable: { name: 'Gable' }, irimoya: { name: 'Irimoya' } };
export const WALLS = {
  cream: { name: 'Cream', c: '#fff3e0' }, peach: { name: 'Peach', c: '#ffe6d6' }, mint: { name: 'Mint', c: '#e8f5e4' },
  lavender: { name: 'Lavender', c: '#f0eaff' }, butter: { name: 'Butter', c: '#fff2c8' }, sky: { name: 'Sky', c: '#e4f0ff' },
  rose: { name: 'Rose', c: '#ffe2ea' }, linen: { name: 'Linen', c: '#f2eadc' },
};
export const TRIMS = {
  honey: { name: 'Honey Pine', c: '#c98f5e' }, timber: { name: 'Timber', c: '#8f6a52' }, dark: { name: 'Dark Cedar', c: '#5a3e30' },
  lacquer: { name: 'Red Lacquer', c: '#a0523a' }, white: { name: 'Whitewash', c: '#ece2d2' },
};
export const DOORS = { shoji: { name: 'Shoji' }, round: { name: 'Round' }, wood: { name: 'Wooden' }, lattice: { name: 'Lattice' } };
export const DOOR_COLORS = {
  natural: { name: 'Natural', c: '#c98f5e' }, red: { name: 'Red', c: '#c8503a' }, blue: { name: 'Blue', c: '#4a78b8' },
  green: { name: 'Green', c: '#5a9a6a' }, cream: { name: 'Cream', c: '#f6ead6' }, dark: { name: 'Dark', c: '#5a3e30' },
};
export const WINDOWS = { shoji: { name: 'Shoji' }, round: { name: 'Round' }, lattice: { name: 'Lattice' } };
export const NOREN = {
  indigo: { name: 'Indigo', c: '#2f4a7a' }, plum: { name: 'Plum', c: '#7a4a6a' }, pine: { name: 'Pine', c: '#3f6f5a' },
  rust: { name: 'Rust', c: '#8a5040' }, sakura: { name: 'Sakura', c: '#d86a90' }, none: { name: 'None', c: null },
};
export const NOREN_SYMBOLS = { sakura: { name: 'Sakura' }, leaf: { name: 'Leaf' }, flower: { name: 'Flower' }, heart: { name: 'Heart' }, paw: { name: 'Paw' }, wave: { name: 'Wave' } };
export const FENCES = { picket: { name: 'Picket' }, bamboo: { name: 'Bamboo' }, rail: { name: 'Rail' }, rope: { name: 'Rope' }, hedge: { name: 'Hedge' } };
export const FENCE_COLORS = {
  white: { name: 'White', c: '#fff6ea' }, natural: { name: 'Natural', c: '#c98f5e' }, dark: { name: 'Dark', c: '#6b4a3a' },
  sea: { name: 'Sea Blue', c: '#7ab0d8' }, pink: { name: 'Pink', c: '#ffbcd6' },
};

// every choosable field: its options, what a change costs, and the rank it unlocks at (per option)
export const FIELDS = {
  roof: { name: 'Roof colour', opts: ROOF_COLORS, cost: { coins: 60, stone: 2 } },
  roofType: { name: 'Roof shape', opts: ROOF_TYPES, cost: { coins: 120, wood: 6 }, lock: { irimoya: 2 } },
  wall: { name: 'Walls', opts: WALLS, cost: { coins: 40 } },
  trim: { name: 'Wood trim', opts: TRIMS, cost: { coins: 50, wood: 2 }, lock: { lacquer: 2 } },
  door: { name: 'Door', opts: DOORS, cost: { coins: 50, wood: 3 } },
  doorColor: { name: 'Door colour', opts: DOOR_COLORS, cost: { coins: 20 } },
  window: { name: 'Windows', opts: WINDOWS, cost: { coins: 40, wood: 2 } },
  noren: { name: 'Noren', opts: NOREN, cost: { coins: 30, silk: 1 } },
  norenSym: { name: 'Noren mark', opts: NOREN_SYMBOLS, cost: { coins: 15 } },
  fence: { name: 'Fence', opts: FENCES, cost: { coins: 50, wood: 4 }, lock: { rope: 2 } },
  fenceColor: { name: 'Fence colour', opts: FENCE_COLORS, cost: { coins: 20 } },
  bunting: { name: 'Festival bunting', opts: { on: { name: 'On' }, off: { name: 'Off' } }, cost: { coins: 40, silk: 1 }, lock: { on: 2 } },
};
export const FIELD_IDS = Object.keys(FIELDS);

// the four style sets (they set many fields at once) — docs/HOUSING.md §6
export const STYLE_SETS = {
  machiya: { name: 'Machiya', jp: '町家', desc: 'A Kyoto townhouse: charcoal tiles, dark cedar lattice, an indigo noren.', cost: { coins: 320, wood: 10, stone: 4 }, rank: 2,
    style: { roof: 'charcoal', roofType: 'gable', wall: 'linen', trim: 'dark', door: 'lattice', doorColor: 'dark', window: 'lattice', noren: 'indigo', norenSym: 'wave', fence: 'bamboo', fenceColor: 'natural' } },
  cottage: { name: 'Cottage', jp: 'こや', desc: 'Storybook cosy: terracotta, cream walls, a round door and a white picket fence.', cost: { coins: 240, wood: 8 }, rank: 1,
    style: { roof: 'terracotta', roofType: 'hip', wall: 'cream', trim: 'honey', door: 'round', doorColor: 'red', window: 'round', noren: 'none', fence: 'picket', fenceColor: 'white' } },
  teaHouse: { name: 'Tea House', jp: '茶屋', desc: 'Mossy irimoya eaves, shoji everywhere, a pine-green noren and a hedge.', cost: { coins: 300, wood: 10, petal: 2 }, rank: 2,
    style: { roof: 'moss', roofType: 'irimoya', wall: 'butter', trim: 'timber', door: 'shoji', doorColor: 'natural', window: 'shoji', noren: 'pine', norenSym: 'leaf', fence: 'hedge', fenceColor: 'natural' } },
  seaside: { name: 'Seaside', jp: '浜辺', desc: 'Breezy blues and whitewash, round windows and a rope fence.', cost: { coins: 280, wood: 8, stone: 2 }, rank: 2,
    style: { roof: 'sea', roofType: 'gable', wall: 'sky', trim: 'white', door: 'wood', doorColor: 'blue', window: 'round', noren: 'none', fence: 'rope', fenceColor: 'sea' } },
};
export const STYLE_SET_IDS = Object.keys(STYLE_SETS);

/** a style with only valid fields (unknown ids dropped); null when nothing is set */
export function cleanStyle(s) {
  if (!s || typeof s !== 'object') return null;
  const out = {};
  if (s.set && STYLE_SETS[s.set]) out.set = s.set;
  for (const k of FIELD_IDS) if (s[k] != null && FIELDS[k].opts[s[k]]) out[k] = s[k];
  return Object.keys(out).length ? out : null;
}
/** the style hash used in template cache keys ('' for the variant's own look) */
export function styleKey(s) {
  s = cleanStyle(s); if (!s) return '';
  return FIELD_IDS.filter(k => s[k] != null).map(k => `${k}=${s[k]}`).join(',');
}
/** a set's style (applying a set replaces every field it names; the bunting stays as it was) */
export function setStyle(id, prev = null) { const S = STYLE_SETS[id]; if (!S) return cleanStyle(prev); return cleanStyle({ ...(prev?.bunting ? { bunting: prev.bunting } : {}), ...S.style, set: id }); }
/** with one field changed (the set name is dropped once you go off-set) */
export function withField(s, k, v) {
  const out = { ...(cleanStyle(s) || {}) }; if (!FIELDS[k]) return cleanStyle(out);
  if (v == null) delete out[k]; else out[k] = v;
  if (out.set && STYLE_SETS[out.set] && STYLE_SETS[out.set].style[k] !== undefined && STYLE_SETS[out.set].style[k] !== v) delete out.set;
  // (parts that add up to a set exactly are that set again)
  if (!out.set) for (const id of STYLE_SET_IDS) if (FIELD_IDS.every(f => f === 'bunting' || (out[f] ?? null) === (STYLE_SETS[id].style[f] ?? null))) { out.set = id; break; }
  return cleanStyle(out);
}
/** the rank an option needs (1 = always) */
export const lockOf = (k, v) => FIELDS[k]?.lock?.[v] || 1;

/** For the builders: the resolved values of a style (hex colours, ids) with the variant's fallbacks.
 *  styleOf(B).roof(fallbackHex) → hex; .roofType(fb), .wall(fb), .trim(fb), .door(fb), .doorColor(fb), .window(fb),
 *  .noren(fb) (hex or null for none), .norenSym(fb), .fence(fb), .fenceColor(fb), .bunting → bool; .set → id | null;
 *  .any → is anything set at all */
export function styleOf(B) {
  const s = cleanStyle(B?.style) || {};
  const C = (tbl, k) => fb => (s[k] != null ? tbl[s[k]].c : fb);
  const I = k => fb => (s[k] != null ? s[k] : fb);
  return {
    any: Object.keys(s).length > 0, set: s.set || null, raw: s,
    roof: C(ROOF_COLORS, 'roof'), roofType: I('roofType'), wall: C(WALLS, 'wall'), trim: C(TRIMS, 'trim'),
    door: I('door'), doorColor: C(DOOR_COLORS, 'doorColor'), window: I('window'),
    noren: fb => (s.noren != null ? NOREN[s.noren].c : fb), norenSym: I('norenSym'),
    fence: I('fence'), fenceColor: C(FENCE_COLORS, 'fenceColor'), bunting: s.bunting === 'on',
  };
}
/** what changing a house from style a to style b costs (a set: its price; else the sum of the changed fields) */
export function remodelCost(a, b) {
  a = cleanStyle(a) || {}; b = cleanStyle(b) || {};
  if (b.set && b.set !== a.set && STYLE_SETS[b.set] && FIELD_IDS.every(k => b[k] === STYLE_SETS[b.set].style[k] || (k === 'bunting'))) {
    const c = { ...STYLE_SETS[b.set].cost };
    if ((b.bunting || null) !== (a.bunting || null)) for (const [k, n] of Object.entries(FIELDS.bunting.cost)) c[k] = (c[k] || 0) + n;
    return c;
  }
  const c = {};
  for (const k of FIELD_IDS) if ((a[k] ?? null) !== (b[k] ?? null)) for (const [m, n] of Object.entries(FIELDS[k].cost)) c[m] = (c[m] || 0) + n;
  return c;
}
