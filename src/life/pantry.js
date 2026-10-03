// The Pantry (docs/HOMESTEAD.md §1): one shared, unlimited counter map for everything the homestead loops make —
// seeds, crops, fish, forage and dishes. state.pantry = { [id]: qty } (household, lazy-init); state.pantryFound =
// { [id]: day } remembers first discoveries (the "New!" badge). Pure data + helpers: no DOM, no three.js (node tests).
//
// An entry: { id, kind: 'seed'|'crop'|'fish'|'forage'|'dish', name, jp, desc, icon, value, likedBy?, lovedBy?, food?,
//   crop? (seeds: the crop they grow), price? (seeds: the stall's price), rare? (fish / dishes: 0 common .. 3 legendary) }
// `value` is the coin worth; what a buyer pays is sellPrice(id, buyer) (specialists pay a premium: Rosie for dishes,
// Kero for fish, Usagi for crops). `icon` is the drawing key for life/pantryIcons.js (defaults to the id).

export const KINDS = ['seed', 'crop', 'fish', 'forage', 'dish'];
export const KIND_INFO = {
  seed: { name: 'Seeds', jp: 'たね', color: '#8fcf6a', one: 'Seed' },
  crop: { name: 'Crops', jp: 'やさい', color: '#ff9a3c', one: 'Crop' },
  fish: { name: 'Fish', jp: 'さかな', color: '#6ab8ff', one: 'Fish' },
  forage: { name: 'Forage', jp: 'さんさい', color: '#d8a04a', one: 'Forage' },
  dish: { name: 'Dishes', jp: 'りょうり', color: '#ff8fb0', one: 'Dish' },
};

// ------------------------------------------------------------------ crops (docs/HOMESTEAD.md §2)
// days: watered nights from planting to ripe (one stage per new day if watered). regrow: after a harvest the plant
// steps back this many days (strawberries keep fruiting). rank: the village rank at which Usagi's stall stocks the seed.
// color: the crop's paint (seed-packet band, marker flags, harvest sparkles).
export const CROPS = {
  turnip: { days: 2, rank: 1, color: '#f4e4f0', accent: '#c86aa8', yield: [1, 2] },
  carrot: { days: 3, rank: 1, color: '#ff8a3a', accent: '#5ab04a', yield: [1, 2] },
  cabbage: { days: 3, rank: 1, color: '#9ad872', accent: '#5aa84a', yield: [1, 1] },
  daikon: { days: 4, rank: 1, color: '#fbf6ee', accent: '#6ab04e', yield: [1, 2] },
  strawberry: { days: 4, rank: 2, regrow: 2, color: '#ff4a5e', accent: '#5aa84a', yield: [2, 3] },
  rice: { days: 5, rank: 2, color: '#f2d27a', accent: '#8fbf5a', yield: [2, 3] },
  pumpkin: { days: 6, rank: 3, color: '#ff9a3a', accent: '#6a8a3a', yield: [1, 1] },
  melon: { days: 6, rank: 3, color: '#b8e07a', accent: '#5a9a4a', yield: [1, 1] },
};
export const CROP_IDS = Object.keys(CROPS);

// ------------------------------------------------------------------ fish (fishing.js adds spots, hours, sizes)
// rare: 0 common, 1 uncommon, 2 rare, 3 legendary
const FISH = [
  ['crucian', 'Crucian Carp', 'ふな', 'A round, bronze pond fish. Grumpy, but means well.', 18, 0],
  ['koi', 'Koi', 'こい', 'A white koi with red patches. Kero knows every one by name.', 40, 1],
  ['goldKoi', 'Golden Koi', '金鯉', 'A koi that shines like a lucky coin. Only rises on warm nights.', 160, 2],
  ['ayu', 'Sweetfish', 'あゆ', 'A slim river fish that smells faintly of melon. Truly.', 30, 0],
  ['trout', 'Mountain Trout', 'やまめ', 'Olive and spotted, with little thumbprints down its side.', 34, 1],
  ['char', 'White-spotted Char', 'いわな', 'A shy fish of cold, clear water. Freckled all over.', 40, 1],
  ['seaBream', 'Sea Bream', 'たい', 'A rosy, celebratory fish. Every festival wants one.', 70, 1],
  ['mackerel', 'Mackerel', 'さば', 'Blue and green with wavy stripes, like the sea itself.', 28, 0],
  ['flounder', 'Flounder', 'かれい', 'Very flat. Both eyes on one side. Unbothered.', 38, 0],
  ['octopus', 'Octopus', 'たこ', 'Eight arms, zero patience. It waved at you.', 55, 1],
  ['salmon', 'Salmon', 'さけ', 'A strong swimmer. In winter it hides under the ice of the onsen pond.', 60, 1],
  ['loach', 'Pond Loach', 'どじょう', 'A wiggly little fish with whiskers. Tickles.', 24, 0],
  ['rainbowTrout', 'Rainbow Trout', 'にじます', 'A silver trout with a pink rainbow stripe.', 48, 1],
  ['pufferfish', 'Pufferfish', 'ふぐ', 'Puffs up when surprised. Please do not surprise it.', 90, 2],
  ['moonKoi', 'Moon Koi', '月鯉', 'A pale koi that glows like the full moon. A legend of the pond.', 600, 3],
];

// ------------------------------------------------------------------ dishes (cooking.js holds the recipes)
// food: heal = fraction of max life restored at once; buff = the Well Fed kind (meals.js); tier 1..3 = how strong; mins.
const DISHES = [
  ['grilledFish', 'Grilled Fish', '焼き魚', 'Salt, fire and a fresh catch. Simple and perfect.', 45, { heal: 0.35, buff: 'strong', tier: 1, mins: 8 }],
  ['roastedVeggies', 'Roasted Veggies', '焼き野菜', 'Sweet, smoky vegetables from the garden.', 70, { heal: 0.3, buff: 'hearty', tier: 1, mins: 8 }],
  ['misoSoup', 'Miso Soup', 'みそ汁', 'Warm miso with daikon and a little fish. A hug in a bowl.', 85, { heal: 0.45, buff: 'zen', tier: 1, mins: 10 }],
  ['carrotSoup', 'Carrot Soup', 'にんじんスープ', 'Velvety and orange. Usagi would hop for joy.', 80, { heal: 0.4, buff: 'swift', tier: 1, mins: 10 }],
  ['onigiri', 'Onigiri', 'おにぎり', 'A rice ball with a crispy nori belt. Adventure food!', 60, { heal: 0.3, buff: 'hearty', tier: 1, mins: 8 }],
  ['salmonOnigiri', 'Salmon Onigiri', '鮭おにぎり', 'A rice ball with flaky salmon tucked inside.', 130, { heal: 0.45, buff: 'strong', tier: 2, mins: 10 }],
  ['cabbageRolls', 'Cabbage Rolls', 'ロールキャベツ', 'Soft cabbage parcels simmered in a golden broth.', 110, { heal: 0.5, buff: 'hearty', tier: 2, mins: 12 }],
  ['pumpkinStew', 'Pumpkin Stew', 'かぼちゃの煮物', 'Sweet simmered pumpkin. Tastes like a cozy afternoon.', 130, { heal: 0.6, buff: 'hearty', tier: 2, mins: 12 }],
  ['strawberryMochi', 'Strawberry Mochi', 'いちご大福', 'A whole strawberry hugged by soft mochi. Rosie\'s favourite.', 90, { heal: 0.35, buff: 'lucky', tier: 1, mins: 10 }],
  ['honeyCake', 'Honey Cake', 'はちみつケーキ', 'A fluffy cake glazed with golden honey. Kuma approves.', 100, { heal: 0.5, buff: 'lucky', tier: 2, mins: 12 }],
  ['grilledTrout', 'Salt-Grilled Trout', '塩焼き', 'A whole trout grilled on a skewer by the fire.', 70, { heal: 0.45, buff: 'swift', tier: 2, mins: 10 }],
  ['melonBread', 'Melon Bread', 'メロンパン', 'A crunchy cookie-crust bun. Pan naps better after one.', 140, { heal: 0.45, buff: 'zen', tier: 2, mins: 12 }],
  ['sushiPlatter', 'Sushi Platter', 'お寿司', 'Three kinds of nigiri on a little wooden board.', 260, { heal: 0.7, buff: 'strong', tier: 3, mins: 15 }],
  ['fishermansFeast', "Fisherman's Feast", '漁師めし', 'A whole tray: grilled fish, rice, soup and pickles.', 320, { heal: 0.85, buff: 'hearty', tier: 3, mins: 15 }],
  ['moonKoiBento', 'Moon Koi Bento', '月見弁当', 'A legendary bento that glows faintly. You feel very lucky.', 1200, { heal: 1, buff: 'lucky', tier: 3, mins: 15 }, 3],
];

// ------------------------------------------------------------------ the table
const DEFS = {};
const def = (o) => { DEFS[o.id] = { icon: o.id, ...o }; };
const CROP_TEXT = {
  turnip: ['Turnip', 'かぶ', 'A round little turnip, white with a pink blush.', 20, 'Turnip Seeds', 'かぶの種', 10],
  carrot: ['Carrot', 'にんじん', 'Crunchy, orange and very good for ears.', 30, 'Carrot Seeds', 'にんじんの種', 15],
  cabbage: ['Cabbage', 'キャベツ', 'A crisp green head of cabbage. Leafy layers all the way down.', 32, 'Cabbage Seeds', 'キャベツの種', 16],
  daikon: ['Daikon', 'だいこん', 'A long, juicy white radish. Perfect in miso soup.', 42, 'Daikon Seeds', 'だいこんの種', 20],
  strawberry: ['Strawberry', 'いちご', 'Sweet, shiny and heart-shaped. The plant keeps on giving.', 26, 'Strawberry Runners', 'いちごの苗', 45],
  rice: ['Rice', 'お米', 'A sheaf of golden rice. The start of every onigiri.', 46, 'Rice Seedlings', '稲の苗', 22],
  pumpkin: ['Pumpkin', 'かぼちゃ', 'A big, ribbed kabocha. Heavy, sweet and very round.', 70, 'Pumpkin Seeds', 'かぼちゃの種', 35],
  melon: ['Melon', 'メロン', 'A netted melon, fragrant and fancy. Pan dreams of these.', 80, 'Melon Seeds', 'メロンの種', 40],
};
for (const id of CROP_IDS) {
  const [name, jp, desc, value, sName, sJp, price] = CROP_TEXT[id], C = CROPS[id];
  def({ id: id + 'Seed', kind: 'seed', crop: id, name: sName, jp: sJp, price, value: Math.round(price / 2), icon: 'seed:' + id,
    desc: C.regrow ? 'Plant in tilled soil and water it every day. The plant keeps on fruiting!' : 'Plant in tilled soil and water it every day. It grows a stage each night.' });
  def({ id, kind: 'crop', name, jp, desc, value });
}
for (const [id, name, jp, desc, value, rare] of FISH) def({ id, kind: 'fish', name, jp, desc, value, rare });
def({ id: 'honey', kind: 'forage', name: 'Honey', jp: 'はちみつ', desc: 'Golden and sticky. Kuma keeps a jar under every counter.', value: 30 });
def({ id: 'bamboo', kind: 'forage', name: 'Bamboo Shoot', jp: 'たけのこ', desc: 'A tender spring shoot from the bamboo groves. Pan\'s favourite snack.', value: 22 });
def({ id: 'shiitake', kind: 'forage', name: 'Shiitake', jp: 'しいたけ', desc: 'A plump brown mushroom that smells of the forest after rain.', value: 26 });
def({ id: 'seaweed', kind: 'forage', name: 'Nori Seaweed', jp: 'のり', desc: 'Crisp green seaweed from the tide pools. Wraps rice beautifully.', value: 18 });
for (const [id, name, jp, desc, value, food, rare] of DISHES) def({ id, kind: 'dish', name, jp, desc, value, food, rare: rare || (food.tier >= 3 ? 2 : food.tier - 1) });

// ------------------------------------------------------------------ villager tastes (story.js giftFlow, phase 3)
// liked (+8 hearts): the roster's `likes` ids, where 'fish' means any fish; loved (+16): a signature dish each
export const LOVED = { usagi: 'carrotSoup', rosie: 'strawberryMochi', kuma: 'honeyCake', kero: 'grilledTrout', pan: 'melonBread', mochi: 'sushiPlatter', kitsune: 'moonKoiBento' };
for (const [who, id] of Object.entries(LOVED)) (DEFS[id].lovedBy ||= []).push(who);
for (const [id, who] of [['carrot', 'usagi'], ['honey', 'kuma'], ['bamboo', 'pan']]) (DEFS[id].likedBy ||= []).push(who);
for (const d of Object.values(DEFS)) if (d.kind === 'fish') d.likedBy = ['mochi', 'kero'];

export const PANTRY = DEFS;
export const PANTRY_IDS = Object.keys(DEFS);
export const pantryDef = id => DEFS[id] || null;
export const isPantry = id => !!DEFS[id];
export const seedFor = crop => DEFS[crop + 'Seed'] || null;
export const RARE_NAMES = ['', 'Uncommon', 'Rare', 'Legendary'];
export const RARE_COLORS = ['#f4efe6', '#8fe0c0', '#ffd84a', '#c8a0ff'];

// ------------------------------------------------------------------ prices
// buyer: 'rosie' (the bakery: dishes ×1.25), 'kero' (the Fishing Hut: fish ×1.3), 'usagi' (the Seed Stall: crops ×1.25)
// and anyone else pays the plain worth. Seeds sell back for half their price.
export const BUYERS = { rosie: { dish: 1.25 }, kero: { fish: 1.3 }, usagi: { crop: 1.25, seed: 1 } };
export function sellPrice(id, buyer = null) {
  const d = DEFS[id]; if (!d) return 0;
  const k = BUYERS[buyer]?.[d.kind] ?? (buyer && d.kind === 'dish' && buyer !== 'rosie' ? 0.9 : 1);
  return Math.max(1, Math.round(d.value * k));
}

// ------------------------------------------------------------------ seed drops (the Burrow, the regions, chests)
// A short treasure roll layered on top of loot.js (kept out of rollDrops so its seeded tests stay put). Deeper floors
// and fancier chests favour the rarer seeds. rng: () => [0, 1).
const SEED_P = { normal: 0.035, champion: 0.12, unique: 0.22, boss: 0.6, chest0: 0.25, chest1: 0.4, chest2: 0.7 };
export function seedDrops(lvl = 1, rank = 'normal', rng = Math.random) {
  if (rng() >= (SEED_P[rank] ?? 0.03)) return [];
  const pool = CROP_IDS.map(id => ({ id, w: Math.max(0.15, 4 - Math.abs(CROPS[id].rank * 7 - lvl) / 6) }));
  let t = pool.reduce((a, p) => a + p.w, 0), x = rng() * t, pickId = pool[0].id;
  for (const p of pool) { x -= p.w; if (x <= 0) { pickId = p.id; break; } }
  const n = 1 + (rng() < (rank === 'boss' || rank === 'chest2' ? 0.8 : 0.3) ? 1 + Math.floor(rng() * 2) : 0);
  return [{ type: 'pantry', key: pickId + 'Seed', n }];
}

// Forage in the outdoor regions (cooking ingredients and gifts): each region's own find, now and then a jar of honey.
const FORAGE_BY_REGION = { bamboo: ['bamboo', 'bamboo', 'shiitake'], maple: ['shiitake', 'honey', 'shiitake'], tidepool: ['seaweed', 'seaweed', 'honey'], onsen: ['shiitake', 'honey', 'seaweed'] };
const FORAGE_P = { normal: 0.06, champion: 0.2, unique: 0.3, boss: 1, chest0: 0.45, chest1: 0.6, chest2: 0.85 };
export function forageDrops(region, rank = 'normal', rng = Math.random) {
  const pool = FORAGE_BY_REGION[region]; if (!pool || rng() >= (FORAGE_P[rank] ?? 0.05)) return [];
  const id = pool[Math.floor(rng() * pool.length) % pool.length];
  return [{ type: 'pantry', key: id, n: 1 + (rng() < (rank === 'boss' || rank === 'chest2' ? 0.7 : 0.25) ? 1 : 0) }];
}

// ------------------------------------------------------------------ the counter map (pure helpers; actions.js wraps them)
export const pantryOf = st => (st.pantry ||= {});
export const pantryCount = (st, id) => st?.pantry?.[id] || 0;
export function pantryHas(st, req) { for (const k in req) if (pantryCount(st, k) < (req[k] || 0)) return false; return true; }
/** Pantry contents as [{ id, n, def }] sorted by kind, rarity, value. kind: one kind or null for all. */
export function pantryList(st, kind = null) {
  const out = [];
  for (const [id, n] of Object.entries(st?.pantry || {})) { const d = DEFS[id]; if (d && n > 0 && (!kind || d.kind === kind)) out.push({ id, n, def: d }); }
  const ko = k => KINDS.indexOf(k);
  return out.sort((a, b) => ko(a.def.kind) - ko(b.def.kind) || (b.def.rare || 0) - (a.def.rare || 0) || a.def.value - b.def.value || a.id.localeCompare(b.id));
}
