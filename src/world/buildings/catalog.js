// BUILDINGS catalog: gameplay data for every placeable building / decoration.
//  { name, cat:'home'|'shop'|'craft'|'service'|'decor'|'special', size:[w,d] (level 1), sizes?:[[w,d] per level],
//    cost:{coins, wood, stone, petal, crystal, bone, mochi, silk, lantern}, levelCost?:[null, costL2, costL3],
//    levels, desc, cover?:{kind, r} (primary), covers?:[{kind, r}] (all), zone?:'R'|'C'|'W',
//    capacity?:[residents per level], jobs?:[workers per level], unique?, prebuilt?, variants? (names by seed) }
// Front/door faces +z; footprint centred on the model origin.

const cov = (...list) => ({ cover: { kind: list[0][0], r: list[0][1] }, covers: list.map(([kind, r]) => ({ kind, r })) });

export const BUILDINGS = {
  // ------------------------------------------------------------------ special / story
  townHall: {
    name: 'Blossom Hall', cat: 'special', size: [6, 4], levels: 1, unique: true, prebuilt: true,
    cost: { coins: 1000, wood: 60, stone: 40, lantern: 4 }, jobs: [2],
    desc: 'The heart of the village — the bell rings every morning and the mayor naps upstairs.',
  },
  chewyHouse: {
    name: "Chewy's Cottage", cat: 'special', size: [3, 3], levels: 1, unique: true, prebuilt: true,
    cost: { coins: 0 }, desc: "Home sweet home! There's a bone-shaped sign and a very important mailbox.",
  },
  rosieShop: {
    name: "Rosie's Treats", cat: 'special', size: [4, 3], levels: 1, unique: true, prebuilt: true,
    cost: { coins: 0 }, jobs: [1], desc: 'Cakes, candies and quests, served with a big smile and a red bow.',
  },
  boneSmith: {
    name: 'Bonesmith Forge', cat: 'special', size: [3, 3], levels: 1, unique: true,
    cost: { coins: 260, wood: 12, stone: 18, bone: 4 }, jobs: [1],
    desc: 'Clang, clang! The forge glows day and night, sharpening Bone Swords to a shine.',
  },
  dungeonGate: {
    name: 'The Burrow', cat: 'special', size: [4, 4], levels: 1, unique: true, prebuilt: true,
    cost: { coins: 0 }, ...cov(['light', 6]),
    desc: 'A vermilion torii before a mossy hill. Something purple and wiggly glows deep inside...',
  },
  bulletinBoard: {
    name: 'Notice Board', cat: 'special', size: [1, 1], levels: 1,
    cost: { coins: 25, wood: 4 }, desc: 'Lost mittens, found kittens and brand-new quests — pinned with love.',
  },
  // ------------------------------------------------------------------ zoned growth
  home: {
    name: 'Cozy Home', cat: 'home', zone: 'R', size: [2, 2], sizes: [[2, 2], [3, 3], [3, 3]], levels: 3,
    cost: { coins: 50, wood: 6 }, levelCost: [null, { coins: 120, wood: 12, stone: 4 }, { coins: 260, wood: 18, stone: 10, petal: 2 }],
    capacity: [2, 4, 6], variants: ['Tiny Cottage', 'Porch House', 'Blossom Villa'],
    desc: 'Villagers move in all by themselves when a home feels just right.',
  },
  shop: {
    name: 'Market Shop', cat: 'shop', zone: 'C', size: [2, 2], sizes: [[2, 2], [3, 3], [3, 3]], levels: 3,
    cost: { coins: 70, wood: 8 }, levelCost: [null, { coins: 160, wood: 14, stone: 4, silk: 1 }, { coins: 340, wood: 24, stone: 12, lantern: 2 }],
    jobs: [2, 3, 5],
    variants: { 1: ['Tea Stand', 'Onigiri Cart', 'Taiyaki Stall'], 2: ['Bakery', 'Café', 'Flower Shop', 'Toy Shop'], 3: ['Teahouse', 'Department Store'] },
    desc: 'From humble snack carts to a grand teahouse — shops grow with the village.',
  },
  // ------------------------------------------------------------------ workshops
  farm: {
    name: 'Veggie Patch', cat: 'craft', zone: 'W', size: [3, 3], levels: 2, jobs: [2, 3],
    cost: { coins: 80, wood: 6 }, levelCost: [null, { coins: 140, wood: 10, stone: 2 }],
    desc: 'Rows of round cabbages and cheeky carrots, guarded by a very polite scarecrow.',
  },
  lumber: {
    name: 'Lumber Workshop', cat: 'craft', zone: 'W', size: [3, 3], levels: 2, jobs: [2, 3],
    cost: { coins: 100, wood: 4, stone: 6 }, levelCost: [null, { coins: 180, wood: 8, stone: 8 }],
    desc: 'Sawdust, sweet cedar smell and neat stacks of logs. Produces wood.',
  },
  kiln: {
    name: 'Pottery Kiln', cat: 'craft', zone: 'W', size: [3, 3], levels: 2, jobs: [2, 3],
    cost: { coins: 140, stone: 16, wood: 4 }, levelCost: [null, { coins: 220, stone: 14, wood: 6, crystal: 1 }],
    desc: 'A toasty climbing kiln that turns clay into cups, bowls and stone bricks.',
  },
  fishingHut: {
    name: 'Fishing Hut', cat: 'craft', zone: 'W', size: [2, 3], levels: 2, jobs: [1, 2],
    cost: { coins: 90, wood: 10, silk: 1 }, levelCost: [null, { coins: 150, wood: 10, silk: 2 }],
    desc: 'Nets drying in the breeze and a bucket that is always suspiciously full.',
  },
  // ------------------------------------------------------------------ services (coverage)
  well: { name: 'Village Well', cat: 'service', size: [1, 1], levels: 1, cost: { coins: 40, stone: 6 }, ...cov(['water', 6]), desc: 'Cool, clear water with a little roof and a creaky bucket.' },
  waterTower: { name: 'Water Tower', cat: 'service', size: [2, 2], levels: 1, cost: { coins: 120, wood: 14, stone: 6 }, ...cov(['water', 12]), desc: 'A big wooden tank on tall legs keeps the whole neighbourhood splashy.' },
  stoneLantern: { name: 'Stone Lantern', cat: 'service', size: [1, 1], levels: 1, cost: { coins: 30, stone: 5 }, ...cov(['light', 5]), desc: 'A mossy tōrō that glows softly after sunset.' },
  streetLamp: { name: 'Lantern Post', cat: 'service', size: [1, 1], levels: 1, cost: { coins: 35, wood: 2, lantern: 1 }, ...cov(['light', 6]), desc: 'A cheerful paper lantern on a wooden post. Moths love it.' },
  park: { name: 'Pocket Park', cat: 'service', size: [3, 3], levels: 1, cost: { coins: 150, wood: 6, petal: 6 }, ...cov(['joy', 8]), jobs: [0], desc: 'Benches, a little sakura, flower beds and a pond full of lily pads.' },
  shrine: { name: 'Blossom Shrine', cat: 'service', size: [3, 3], levels: 1, cost: { coins: 300, wood: 20, stone: 10, lantern: 2, petal: 4 }, ...cov(['joy', 12]), jobs: [1], desc: 'Ring the bell, clap twice and make a wish for good snacks.' },
  onsen: { name: 'Hot Spring', cat: 'service', size: [4, 4], levels: 1, cost: { coins: 400, wood: 16, stone: 24, crystal: 2 }, ...cov(['joy', 10], ['health', 10]), jobs: [2], desc: 'Steamy, cozy and good for sore paws. Bamboo walls for privacy!' },
  clinic: { name: 'Paw Clinic', cat: 'service', size: [3, 3], levels: 1, cost: { coins: 320, wood: 18, stone: 10, mochi: 3 }, ...cov(['health', 10]), jobs: [2], desc: 'Bandages, warm tea and gentle hugs for every villager.' },
  school: { name: 'Village School', cat: 'service', size: [4, 3], levels: 1, cost: { coins: 380, wood: 26, stone: 10, silk: 2 }, ...cov(['learn', 12]), jobs: [2], desc: 'Reading, writing and advanced napping. The bell tower rings at noon.' },
  // ------------------------------------------------------------------ decor
  bench: { name: 'Park Bench', cat: 'decor', size: [1, 1], levels: 1, cost: { coins: 15, wood: 3 }, ...cov(['joy', 3]), desc: 'Perfect for sitting, snacking and people-watching.' },
  flowerBed: { name: 'Flower Bed', cat: 'decor', size: [1, 1], levels: 1, cost: { coins: 12, petal: 2 }, ...cov(['joy', 3]), desc: 'A tidy burst of colour. Bees approve.' },
  fountain: { name: 'Plaza Fountain', cat: 'decor', size: [2, 2], levels: 1, cost: { coins: 180, stone: 16, crystal: 1 }, ...cov(['joy', 6], ['water', 4]), desc: 'Sparkly water that makes the whole plaza feel fancy.' },
  sakuraPlanter: { name: 'Sakura Planter', cat: 'decor', size: [1, 1], levels: 1, cost: { coins: 30, stone: 2, petal: 3 }, ...cov(['joy', 4]), desc: 'A little cherry tree in a stone box, forever in bloom.' },
  miniTorii: { name: 'Mini Torii', cat: 'decor', size: [1, 1], levels: 1, cost: { coins: 40, wood: 4 }, ...cov(['joy', 4]), desc: 'A tiny gate for tiny wishes.' },
  koiStatue: { name: 'Koi Statue', cat: 'decor', size: [1, 1], levels: 1, cost: { coins: 90, stone: 8 }, ...cov(['joy', 5]), desc: 'A leaping stone koi. Rub its nose for luck!' },
  lanternString: { name: 'Lantern String', cat: 'decor', size: [2, 1], levels: 1, cost: { coins: 45, wood: 2, lantern: 2, silk: 1 }, ...cov(['light', 4], ['joy', 3]), desc: 'A row of paper lanterns swaying between two poles.' },
  fence: { name: 'Picket Fence', cat: 'decor', size: [1, 1], levels: 1, cost: { coins: 6, wood: 1 }, desc: 'Keeps the chickens honest. Runs along x; rotate to turn.' },
  bridge: { name: 'Arched Bridge', cat: 'decor', size: [3, 9], levels: 1, cost: { coins: 200, wood: 24, stone: 8 }, desc: 'A vermilion taiko bridge. Deck height: bridgeDeckHeight(localZ).' },
  chewyStatue: { name: 'Golden Bone Statue', cat: 'decor', size: [2, 2], levels: 1, cost: { coins: 250, stone: 20, bone: 8 }, ...cov(['joy', 8]), desc: 'A monument to the goodest boy and his greatest treasure.' },
};

export const CATEGORIES = { special: 'Landmarks', home: 'Homes', shop: 'Shops', craft: 'Workshops', service: 'Services', decor: 'Decor' };

// footprint for a given level
export function sizeOf(id, level = 1) {
  const b = BUILDINGS[id];
  return (b.sizes && b.sizes[Math.max(0, Math.min(b.sizes.length - 1, level - 1))]) || b.size;
}
