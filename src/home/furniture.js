// The furniture catalog (docs/HOUSING.md §2). Pure data, node-tested (tools/test-rpg.mjs): no three.js here.
// The models are built by src/home/furnitureModels.js (one builder per id) and cached / batched by furnitureMesh.js.
//
// An item: { id, name, jp, cat, size: [w, d] in 0.5 m cells, h (m), mount, surface?, walk?, use?, light?, tags, set,
//            price, desc }
//  - cat:     seating | table | bed | storage | kitchen | decor | light | wall | rug | tabletop  (surfaces are SURFACES)
//  - mount:   'floor' (stands on the floor, blocks it unless walk), 'rug' (lies under furniture), 'table' (sits on an
//             item's top: its `surface` height), 'wall' (on a back wall; size = [cells along the wall, cells tall]),
//             'ceiling' (hangs from the ceiling over a floor cell; never blocks the floor)
//  - surface: the top height of a table-like item that tabletop items can stand on
//  - walk:    low floor things (cushions) you can walk over (no collider)
//  - use:     a household job the item does when it's in Chewy's cottage: sleep | stash | cook | craft (an F
//             interactable; craft = the workbench)
//  - light:   { y, color, intensity, radius } a lamp's light-pool source (y above the item's base)
//  - tags:    cozy warm nature water lantern bookish sweet music retro festive elegant cute (villagers' tastes)
//  - set:     basics | tea | bamboo | maple | tide | onsen | festival
//  - shop:    the village rank from which Tanu's Trinkets can stock it (default: its set's SHOP_RANK); false = never
//             sold (found in the regions / the Burrow, or crafted at the workbench: home/finds.js, home/recipes.js)
//  - owner:   a villager whose home it was made for (their personality layout, home/defaults.js)
export const CELL = 0.5;

export const SETS = {
  basics: { name: 'Cottage Basics', jp: 'こや', color: '#ffb07a' },
  tea: { name: 'Tea House', jp: '茶屋', color: '#8fcf6a' },
  bamboo: { name: 'Bamboo Grove', jp: '竹林', color: '#7cc46a' },
  maple: { name: 'Maple Hollow', jp: '紅葉', color: '#ff8a5a' },
  tide: { name: 'Tidepool', jp: '磯', color: '#6ac0e8' },
  onsen: { name: 'Onsen Lodge', jp: '温泉', color: '#c3a0ff' },
  festival: { name: 'Festival', jp: '祭り', color: '#ff6f7f' },
};

export const CATS = {
  seating: { name: 'Seating', jp: '椅子', tab: 'furniture' },
  table: { name: 'Tables', jp: '机', tab: 'furniture' },
  bed: { name: 'Beds', jp: '寝床', tab: 'furniture' },
  storage: { name: 'Storage', jp: '収納', tab: 'furniture' },
  kitchen: { name: 'Kitchen', jp: '台所', tab: 'furniture' },
  decor: { name: 'Decor', jp: '飾り', tab: 'decor' },
  light: { name: 'Lights', jp: '灯り', tab: 'decor' },
  wall: { name: 'Wall', jp: '壁', tab: 'wall' },
  rug: { name: 'Rugs', jp: '敷物', tab: 'rug' },
  tabletop: { name: 'Tabletop', jp: '小物', tab: 'tabletop' },
};
// the decorate palette's tabs (ui/decorate.js), in order
export const TABS = [
  { id: 'all', name: 'All', glyph: 'sparkle', color: '#ff8fb0' },
  { id: 'furniture', name: 'Furniture', glyph: 'home', color: '#ffb07a' },
  { id: 'decor', name: 'Decor', glyph: 'decor', color: '#8fe0c0' },
  { id: 'wall', name: 'Wall', glyph: 'scroll', color: '#c3b3ff' },
  { id: 'rug', name: 'Rugs', glyph: 'sakura', color: '#ffbcd6' },
  { id: 'tabletop', name: 'Tabletop', glyph: 'gift', color: '#ffcf4a' },
  { id: 'surface', name: 'Wallpaper & Floors', glyph: 'craft', color: '#8fd0ff' },
];

const L = (y, color, intensity = 2.6, radius = 4.5) => ({ y, color, intensity, radius });
const def = (id, o) => ({ id, mount: 'floor', tags: [], set: 'basics', price: 100, h: 0.5, ...o });

export const FURNITURE = Object.fromEntries([
  // ---------------------------------------------------------------- Cottage Basics
  def('futonBed', { name: 'Cozy Futon Bed', jp: 'ふとん', cat: 'bed', size: [4, 3], h: 0.62, use: 'sleep', tags: ['cozy', 'warm'], price: 600, desc: 'A low wooden bed with a puffy patchwork futon. Perfect for naps.' }),
  def('pupBasket', { name: 'Pup Basket', jp: 'いぬかご', cat: 'bed', size: [2, 2], h: 0.42, tags: ['cozy', 'cute'], price: 180, desc: "A round woven basket with a bone-shaped pillow. Shadow's favourite spot." }),
  def('treasureChest', { name: 'Treasure Chest', jp: 'たからばこ', cat: 'storage', size: [2, 1], h: 0.62, use: 'stash', tags: ['cozy', 'retro'], price: 400, desc: 'Gold-banded and paw-locked. Everything inside is shared by the whole pack.' }),
  def('kitchenStove', { name: 'Kitchen Stove', jp: 'かまど', cat: 'kitchen', size: [2, 2], h: 1.15, use: 'cook', light: L(0.45, '#ff9a4a', 2.2, 3.5), tags: ['warm', 'cozy'], price: 650, desc: 'A chubby brick stove with a bubbling pot. Cook your crops and fish here.' }),
  def('kitchenCounter', { name: 'Kitchen Counter', jp: 'ながし', cat: 'kitchen', size: [2, 1], h: 0.86, surface: 0.86, tags: ['cozy'], price: 300, desc: 'A sturdy counter with cupboard doors and a chopping board. Things can sit on top.' }),
  def('chabudai', { name: 'Round Chabudai', jp: 'ちゃぶ台', cat: 'table', size: [2, 2], h: 0.36, surface: 0.36, tags: ['cozy', 'warm'], price: 260, desc: 'A low round table for tea, snacks and board games.' }),
  def('zabutonPink', { name: 'Pink Cushion', jp: 'ざぶとん', cat: 'seating', size: [1, 1], h: 0.13, walk: true, tags: ['cozy', 'cute'], price: 60, desc: 'A plump floor cushion with a tufted button.' }),
  def('zabutonBlue', { name: 'Indigo Cushion', jp: 'ざぶとん', cat: 'seating', size: [1, 1], h: 0.13, walk: true, tags: ['cozy'], price: 60, desc: 'A floor cushion in deep indigo with white stitching.' }),
  def('andonLamp', { name: 'Andon Lamp', jp: 'あんどん', cat: 'light', size: [1, 1], h: 0.86, light: L(0.55, '#ffc070', 3, 5), tags: ['lantern', 'warm'], price: 220, desc: 'A paper floor lamp in a wooden frame. Glows like a little moon.' }),
  def('paperPendant', { name: 'Paper Pendant', jp: 'ちょうちん', cat: 'light', mount: 'ceiling', size: [1, 1], h: 0.7, light: L(-0.15, '#ffd090', 3.2, 5.5), tags: ['lantern', 'cozy'], price: 200, desc: 'A round washi globe that hangs from the ceiling.' }),
  def('ragRug', { name: 'Rag Rug', jp: 'ラグ', cat: 'rug', mount: 'rug', size: [4, 4], h: 0.03, tags: ['cozy', 'warm'], price: 240, desc: 'A round braided rug in sunset stripes.' }),
  def('tileMat', { name: 'Kitchen Tiles', jp: 'タイル', cat: 'rug', mount: 'rug', size: [4, 3], h: 0.02, tags: ['cozy', 'retro'], price: 160, desc: 'A patch of mint and cream checker tiles for the kitchen corner.' }),
  def('bookshelf', { name: 'Bookshelf', jp: 'ほんだな', cat: 'storage', size: [2, 1], h: 1.6, tags: ['bookish', 'cozy'], price: 420, desc: 'Stuffed with storybooks, a globe and a sleepy plant.' }),
  def('tansu', { name: 'Tansu Chest', jp: 'たんす', cat: 'storage', size: [2, 1], h: 0.95, surface: 0.95, tags: ['elegant', 'retro'], price: 380, desc: 'A chest of drawers with iron pulls. Its top is a fine shelf.' }),
  def('wardrobe', { name: 'Wardrobe', jp: 'ようふくだんす', cat: 'storage', size: [2, 1], h: 1.75, tags: ['cozy'], price: 520, desc: 'A tall rounded wardrobe with a heart-shaped mirror.' }),
  def('woodTable', { name: 'Farmhouse Table', jp: 'テーブル', cat: 'table', size: [3, 2], h: 0.72, surface: 0.72, tags: ['cozy', 'warm'], price: 340, desc: 'A chunky plank table for big breakfasts.' }),
  def('sideTable', { name: 'Round Side Table', jp: 'サイドテーブル', cat: 'table', size: [1, 1], h: 0.55, surface: 0.55, tags: ['cozy'], price: 150, desc: 'Just the right height for a lamp or a cup of cocoa.' }),
  def('woodChair', { name: 'Wooden Chair', jp: 'いす', cat: 'seating', size: [1, 1], h: 0.86, tags: ['cozy'], price: 120, desc: 'A rounded chair with a heart cut into the back.' }),
  def('armchair', { name: 'Puffy Armchair', jp: 'ソファ', cat: 'seating', size: [2, 2], h: 0.86, tags: ['cozy', 'warm'], price: 380, desc: 'So squishy you sink right in. Mind the crumbs.' }),
  def('pottedFern', { name: 'Potted Fern', jp: 'しだ', cat: 'decor', size: [1, 1], h: 0.78, tags: ['nature'], price: 120, desc: 'A leafy fern in a glazed pot.' }),
  def('wallShelf', { name: 'Little Wall Shelf', jp: 'たな', cat: 'wall', mount: 'wall', size: [2, 1], h: 0.4, tags: ['cozy'], price: 160, desc: 'A small shelf of jam jars and a trailing plant.' }),
  def('plateRack', { name: 'Plate Rack', jp: 'しょっきだな', cat: 'wall', mount: 'wall', size: [2, 1], h: 0.42, tags: ['cozy', 'retro'], price: 150, desc: 'Painted plates and a row of mugs on hooks.' }),
  def('cuckooClock', { name: 'Cuckoo Clock', jp: 'はとどけい', cat: 'wall', mount: 'wall', size: [1, 2], h: 0.9, tags: ['retro', 'cute'], price: 280, desc: 'A little house-shaped clock with pine-cone weights.' }),
  def('packPhoto', { name: 'Pack Photo', jp: 'しゃしん', cat: 'wall', mount: 'wall', size: [1, 1], h: 0.42, tags: ['cute', 'cozy'], price: 90, desc: 'A crayon portrait of Chewy and Shadow in a wobbly frame.' }),
  def('teaSet', { name: 'Tea Set', jp: 'ちゃき', cat: 'tabletop', mount: 'table', size: [1, 1], h: 0.18, tags: ['cozy', 'warm'], price: 140, desc: 'A round teapot and two cups on a lacquer tray.' }),
  def('flowerVase', { name: 'Flower Vase', jp: 'かびん', cat: 'tabletop', mount: 'table', size: [1, 1], h: 0.42, tags: ['nature', 'sweet'], price: 110, desc: 'A sky-blue vase of pink tulips.' }),
  def('mushroomLamp', { name: 'Mushroom Lamp', jp: 'きのこランプ', cat: 'tabletop', mount: 'table', size: [1, 1], h: 0.38, light: L(0.28, '#ffb0a0', 2.2, 3.5), tags: ['cute', 'lantern'], price: 180, desc: 'A spotty toadstool that glows from the inside.' }),
  def('bookStack', { name: 'Book Stack', jp: 'ほん', cat: 'tabletop', mount: 'table', size: [1, 1], h: 0.22, tags: ['bookish'], price: 70, desc: 'A wobbly pile of well-loved books.' }),
  def('fruitBowl', { name: 'Fruit Bowl', jp: 'くだもの', cat: 'tabletop', mount: 'table', size: [1, 1], h: 0.2, tags: ['sweet'], price: 90, desc: 'Apples, a persimmon and a bunch of grapes.' }),
  def('succulent', { name: 'Little Succulent', jp: 'たにく', cat: 'tabletop', mount: 'table', size: [1, 1], h: 0.24, tags: ['nature', 'cute'], price: 70, desc: 'A chubby rosette in a polka-dot pot.' }),
  // (phase 2: the workbench, and pieces for the villagers' own homes)
  def('workbench', { name: 'Workbench', jp: 'さぎょうだい', cat: 'table', size: [3, 1], h: 1.3, surface: 0.88, use: 'craft', tags: ['cozy', 'retro'], price: 480, desc: 'A sturdy bench with a vice and a pegboard of tools. Craft furniture here.' }),
  def('melonStool', { name: 'Melon Stool', jp: 'メロンいす', cat: 'seating', size: [1, 1], h: 0.42, tags: ['cute', 'sweet'], price: 160, shop: false, desc: 'A round stool shaped like a slice of melon. Do not eat.' }),
  def('artEasel', { name: 'Art Easel', jp: 'イーゼル', cat: 'decor', size: [1, 1], h: 1.45, tags: ['cute', 'retro'], price: 300, owner: 'mochi', desc: 'A wooden easel with a half-finished sunrise. Purple, naturally.' }),
  def('paintPots', { name: 'Paint Pots', jp: 'えのぐ', cat: 'tabletop', mount: 'table', size: [1, 1], h: 0.2, tags: ['cute'], price: 90, owner: 'mochi', desc: 'Little jars of every colour, with brushes standing in a cup.' }),
  def('catTower', { name: 'Cat Tower', jp: 'キャットタワー', cat: 'decor', size: [1, 1], h: 1.5, tags: ['cute', 'cozy'], price: 320, shop: false, owner: 'mochi', desc: 'Carpeted platforms, a scratching post and a dangling pom-pom.' }),
  def('breadShelf', { name: 'Bread Shelf', jp: 'パンだな', cat: 'storage', size: [2, 1], h: 1.4, tags: ['warm', 'sweet'], price: 420, shop: 2, owner: 'kuma', desc: 'Baskets of melon-pan, a long loaf and a jar of honey.' }),
  def('flourSacks', { name: 'Flour Sacks', jp: 'こむぎこ', cat: 'decor', size: [1, 1], h: 0.6, tags: ['warm', 'cozy'], price: 110, owner: 'kuma', desc: 'Two plump sacks of flour and a wooden scoop.' }),
  def('napPillow', { name: 'Nap Pillow', jp: 'おひるねまくら', cat: 'seating', size: [2, 2], h: 0.42, tags: ['cozy', 'cute'], price: 260, owner: 'pan', desc: 'A huge squashy pillow made for very serious naps.' }),
  def('plantStand', { name: 'Plant Stand', jp: 'はなだい', cat: 'decor', size: [1, 1], h: 1.1, tags: ['nature', 'cute'], price: 240, owner: 'usagi', desc: 'Three tiers of little pots: herbs, a strawberry and a tiny cactus.' }),
  def('curioCabinet', { name: 'Curio Cabinet', jp: 'かざりだな', cat: 'storage', size: [2, 1], h: 1.55, tags: ['retro', 'elegant'], price: 560, shop: 2, owner: 'tanu', desc: 'A glass-fronted cabinet of oddities: a ship in a bottle, a geode, a tiny umbrella.' }),
  // ---------------------------------------------------------------- Tea House
  def('tatamiMat', { name: 'Tatami Mat', jp: 'たたみ', cat: 'rug', mount: 'rug', size: [4, 2], h: 0.04, set: 'tea', tags: ['elegant', 'nature'], price: 200, desc: 'A fresh-smelling woven mat with cloth borders.' }),
  def('byobu', { name: 'Folding Screen', jp: 'びょうぶ', cat: 'decor', size: [3, 1], h: 1.4, set: 'tea', tags: ['elegant'], price: 560, desc: 'Four panels of gold clouds and a sakura bough.' }),
  def('ikebana', { name: 'Ikebana Stand', jp: 'いけばな', cat: 'decor', size: [1, 1], h: 0.86, set: 'tea', tags: ['elegant', 'nature'], price: 300, desc: 'A careful arrangement of iris and willow on a black stand.' }),
  def('bonsaiStand', { name: 'Bonsai Stand', jp: 'ぼんさい', cat: 'decor', size: [1, 1], h: 0.92, set: 'tea', tags: ['nature', 'elegant'], price: 340, desc: 'A tiny old pine, older than the village.' }),
  def('hangingScroll', { name: 'Hanging Scroll', jp: 'かけじく', cat: 'wall', mount: 'wall', size: [1, 2], h: 0.95, set: 'tea', tags: ['elegant'], price: 240, desc: 'A crane flying past a full moon, in ink and gold.' }),
  def('irori', { name: 'Irori Hearth', jp: 'いろり', cat: 'decor', size: [2, 2], h: 1.2, set: 'tea', light: L(0.25, '#ff8a3a', 2.6, 4), tags: ['warm', 'cozy'], price: 700, desc: 'A sunken hearth with a kettle on a hook. Toasty.' }),
  def('kamidana', { name: 'Kamidana', jp: 'かみだな', cat: 'wall', mount: 'wall', size: [2, 1], h: 0.5, set: 'tea', tags: ['elegant'], price: 320, owner: 'kitsune', desc: 'A little wall shrine with a paper rope and two sakaki branches.' }),
  def('foxStatue', { name: 'Fox Statue', jp: 'きつねぞう', cat: 'decor', size: [1, 1], h: 0.8, set: 'tea', tags: ['elegant', 'festive'], price: 360, owner: 'kitsune', desc: 'A stone shrine fox with a red bib and a key in its mouth.' }),
  def('incenseBurner', { name: 'Incense Burner', jp: 'こうろ', cat: 'tabletop', mount: 'table', size: [1, 1], h: 0.22, set: 'tea', tags: ['elegant'], price: 150, owner: 'kitsune', desc: 'A three-legged bronze burner. A thread of smoke curls up.' }),
  // ---------------------------------------------------------------- Bamboo Grove
  def('bambooPlanter', { name: 'Bamboo Planter', jp: 'たけ', cat: 'decor', size: [1, 1], h: 1.7, set: 'bamboo', tags: ['nature'], price: 260, desc: 'Three fat stalks of lucky bamboo in a glazed pot of pebbles, like a tiny grove.' }),
  def('bambooBench', { name: 'Bamboo Bench', jp: 'たけのベンチ', cat: 'seating', size: [3, 1], h: 0.46, set: 'bamboo', tags: ['nature'], price: 280, desc: 'Lashed-together bamboo with a striped cushion.' }),
  def('bambooLantern', { name: 'Bamboo Lantern', jp: 'たけあかり', cat: 'light', size: [1, 1], h: 1.0, set: 'bamboo', light: L(0.5, '#ffd080', 2.8, 4.5), tags: ['lantern', 'nature'], price: 240, desc: 'A bamboo tube carved with little leaves that let the light out.' }),
  def('hangingPlanter', { name: 'Hanging Planter', jp: 'つりばち', cat: 'decor', mount: 'ceiling', size: [1, 1], h: 0.8, set: 'bamboo', tags: ['nature', 'cute'], price: 200, owner: 'usagi', desc: 'A woven basket of trailing ivy on a knotted rope.' }),
  def('pandaPlush', { name: 'Panda Plush', jp: 'パンダ', cat: 'tabletop', mount: 'table', size: [1, 1], h: 0.3, set: 'bamboo', tags: ['cute', 'cozy'], price: 140, shop: false, owner: 'pan', desc: 'A squishy panda hugging a bamboo shoot. Smells like naps.' }),
  // ---------------------------------------------------------------- Maple Hollow
  def('mapleRug', { name: 'Maple Leaf Rug', jp: 'もみじラグ', cat: 'rug', mount: 'rug', size: [3, 3], h: 0.03, set: 'maple', tags: ['nature', 'warm'], price: 220, desc: 'A big red maple leaf to wiggle your toes on.' }),
  def('acornStool', { name: 'Acorn Stool', jp: 'どんぐり', cat: 'seating', size: [1, 1], h: 0.44, set: 'maple', tags: ['cute', 'nature'], price: 150, desc: 'A stool shaped like a very large acorn, cap and all.' }),
  def('mapleWreath', { name: 'Maple Wreath', jp: 'リース', cat: 'wall', mount: 'wall', size: [1, 1], h: 0.45, set: 'maple', tags: ['nature', 'warm'], price: 140, desc: 'Red and gold leaves woven into a ring with a little bow.' }),
  def('pumpkinLamp', { name: 'Pumpkin Lamp', jp: 'かぼちゃランプ', cat: 'light', size: [1, 1], h: 0.5, set: 'maple', light: L(0.25, '#ffa040', 2.4, 4), tags: ['warm', 'cute', 'lantern'], price: 220, shop: false, desc: 'A carved pumpkin with a happy face and a candle inside.' }),
  // ---------------------------------------------------------------- Tidepool
  def('fishTank', { name: 'Fish Tank', jp: 'すいそう', cat: 'decor', size: [2, 1], h: 1.0, set: 'tide', light: L(0.75, '#7ad8ff', 1.8, 3), tags: ['water', 'nature'], price: 650, desc: 'Two goldfish, a little castle and a lot of bubbles.' }),
  def('shellLamp', { name: 'Shell Lamp', jp: 'かいランプ', cat: 'tabletop', mount: 'table', size: [1, 1], h: 0.34, set: 'tide', light: L(0.2, '#ffd8e8', 2, 3.2), tags: ['water', 'cute'], price: 200, desc: 'A pink scallop shell glowing softly.' }),
  def('waveRug', { name: 'Wave Rug', jp: 'せいがいは', cat: 'rug', mount: 'rug', size: [4, 3], h: 0.03, set: 'tide', tags: ['water'], price: 230, desc: 'Blue seigaiha waves, like standing in the sea.' }),
  def('glassFloats', { name: 'Glass Floats', jp: 'うき', cat: 'wall', mount: 'wall', size: [2, 1], h: 0.45, set: 'tide', tags: ['water', 'retro'], price: 180, desc: "A fisher's net with three glass floats caught in it." }),
  def('lilyTub', { name: 'Lily Tub', jp: 'すいれんばち', cat: 'decor', size: [2, 2], h: 0.55, set: 'tide', tags: ['water', 'nature'], price: 520, owner: 'kero', desc: 'A glazed tub of water lilies with two koi gliding under the pads.' }),
  def('frogFountain', { name: 'Frog Fountain', jp: 'かえるのいずみ', cat: 'tabletop', mount: 'table', size: [1, 1], h: 0.3, set: 'tide', tags: ['water', 'cute'], price: 180, shop: false, owner: 'kero', desc: 'A little stone frog spouting water into a shell.' }),
  // ---------------------------------------------------------------- Onsen Lodge
  def('onsenNoren', { name: 'Onsen Noren', jp: 'のれん', cat: 'wall', mount: 'wall', size: [2, 2], h: 0.95, set: 'onsen', tags: ['elegant', 'warm'], price: 200, desc: 'A curtain with the hot-spring mark ゆ. Smells faintly of cypress.' }),
  def('cypressBucket', { name: 'Cypress Bucket', jp: 'おけ', cat: 'decor', size: [1, 1], h: 0.5, set: 'onsen', tags: ['cozy', 'water'], price: 120, desc: 'A little bath stool with a wooden bucket and a folded towel.' }),
  // ---------------------------------------------------------------- Festival
  def('festivalLantern', { name: 'Festival Chochin', jp: 'まつりちょうちん', cat: 'light', mount: 'ceiling', size: [1, 1], h: 0.7, set: 'festival', light: L(-0.2, '#ff8a6a', 3, 5), tags: ['festive', 'lantern'], price: 160, desc: 'A red paper lantern straight from the summer festival.' }),
  def('taikoDrum', { name: 'Taiko Drum', jp: 'たいこ', cat: 'decor', size: [2, 2], h: 1.0, set: 'festival', tags: ['music', 'festive'], price: 480, desc: 'A big barrel drum on a stand, with two sticks. DON!' }),
  def('daruma', { name: 'Daruma', jp: 'だるま', cat: 'tabletop', mount: 'table', size: [1, 1], h: 0.3, set: 'festival', tags: ['festive', 'cute'], price: 120, desc: 'Paint in one eye when you make a wish.' }),
  def('goldfishBowl', { name: 'Goldfish Bowl', jp: 'きんぎょばち', cat: 'tabletop', mount: 'table', size: [1, 1], h: 0.3, set: 'festival', tags: ['water', 'festive'], price: 160, desc: 'A frilly glass bowl with one very proud goldfish.' }),
  def('tanukiStatue', { name: 'Tanuki Statue', jp: 'たぬきのおきもの', cat: 'decor', size: [1, 1], h: 0.85, set: 'festival', tags: ['festive', 'cute', 'retro'], price: 340, owner: 'tanu', desc: 'A round shigaraki tanuki with a straw hat and a flask. Tanu insists it is a portrait.' }),
  // the Burrow's oddities: never sold, only found (home/finds.js)
  def('luckyCat', { name: 'Lucky Cat', jp: 'まねきねこ', cat: 'tabletop', mount: 'table', size: [1, 1], h: 0.32, set: 'festival', tags: ['festive', 'cute'], price: 240, shop: false, owner: 'tanu', desc: 'A maneki-neko waving one paw. Brings coins. Probably.' }),
  def('yokaiLantern', { name: 'Yokai Lantern', jp: 'ちょうちんおばけ', cat: 'light', size: [1, 1], h: 1.2, set: 'festival', light: L(0.85, '#ffb060', 2.6, 4.5), tags: ['festive', 'lantern', 'retro'], price: 380, shop: false, desc: 'A paper lantern yokai on a stand. It winks when no one is looking.' }),
].map(d => [d.id, d]));
export const FURNITURE_IDS = Object.keys(FURNITURE);
// the village rank from which each set's pieces turn up at Tanu's Trinkets (an item's own `shop` wins)
export const SHOP_RANK = { basics: 1, tea: 2, bamboo: 2, maple: 2, tide: 3, onsen: 3, festival: 3 };
/** the rank from which Tanu can sell this item or surface, or 0 when it's never sold */
export const shopRank = d => (d.shop === false ? 0 : d.shop ?? SHOP_RANK[d.set] ?? 1);

// Wallpapers and floors (the Surfaces tab). `free` ones are always available; the others are kept in storage like
// furniture: applying one uses it and puts the old one back.
export const SURFACES = Object.fromEntries([
  { id: 'wp_plaster', kind: 'wall', name: 'Cream Plaster', jp: 'しっくい', free: true, tags: ['cozy'], set: 'basics', price: 0, desc: 'Soft cream plaster between honey timbers.' },
  { id: 'wp_stripes', kind: 'wall', name: 'Candy Stripes', jp: 'しましま', tags: ['sweet', 'cute'], set: 'basics', price: 180, desc: 'Pink and cream stripes, like a strawberry milk carton.' },
  { id: 'wp_dots', kind: 'wall', name: 'Polka Dots', jp: 'みずたま', tags: ['cute'], set: 'basics', price: 180, desc: 'Mint wallpaper with little white dots.' },
  { id: 'wp_sakura', kind: 'wall', name: 'Sakura Paper', jp: 'さくら', tags: ['sweet', 'nature'], set: 'tea', price: 240, desc: 'Washi paper sprinkled with cherry blossoms.' },
  { id: 'wp_asanoha', kind: 'wall', name: 'Hemp-Leaf Washi', jp: 'あさのは', tags: ['elegant'], set: 'tea', price: 240, desc: 'A star-like asanoha pattern on pale green paper.' },
  { id: 'wp_wood', kind: 'wall', name: 'Cedar Panels', jp: 'すぎいた', tags: ['warm', 'nature'], set: 'onsen', price: 260, desc: 'Warm cedar boards, like a mountain lodge.' },
  { id: 'wp_waves', kind: 'wall', name: 'Seigaiha Waves', jp: 'なみ', tags: ['water'], set: 'tide', price: 240, desc: 'Rolling blue waves from floor to ceiling.' },
  { id: 'wp_maple', kind: 'wall', name: 'Maple Leaves', jp: 'もみじ', tags: ['nature', 'warm'], set: 'maple', price: 240, desc: 'Falling red and gold leaves on cream.' },
  { id: 'fl_planks', kind: 'floor', name: 'Honey Planks', jp: 'いたのま', free: true, tags: ['cozy', 'warm'], set: 'basics', price: 0, desc: 'Warm golden floorboards.' },
  { id: 'fl_walnut', kind: 'floor', name: 'Walnut Planks', jp: 'くるみ', tags: ['elegant', 'warm'], set: 'basics', price: 220, desc: 'Dark polished boards that creak politely.' },
  { id: 'fl_tatami', kind: 'floor', name: 'Tatami Floor', jp: 'たたみ', tags: ['elegant', 'nature'], set: 'tea', price: 260, desc: 'Wall-to-wall tatami mats.' },
  { id: 'fl_checker', kind: 'floor', name: 'Checker Tiles', jp: 'チェック', tags: ['retro', 'cute'], set: 'basics', price: 220, desc: 'Strawberry and cream tiles.' },
  { id: 'fl_stone', kind: 'floor', name: 'River Stones', jp: 'いしだたみ', tags: ['water', 'nature'], set: 'onsen', price: 260, desc: 'Smooth grey pebbles set in mortar.' },
].map(d => [d.id, d]));
export const SURFACE_IDS = Object.keys(SURFACES);
export const DEFAULT_WALL = 'wp_plaster', DEFAULT_FLOOR = 'fl_planks';

/** anything the storage can hold (furniture and the non-free surfaces) */
export const storable = id => !!FURNITURE[id] || (!!SURFACES[id] && !SURFACES[id].free);
export const itemDef = id => FURNITURE[id] || SURFACES[id] || null;

/** footprint [w, d] in cells after a quarter-turn rotation (rot 0..3) */
export function footprint(d, rot = 0) {
  const [w, dd] = d.size || [1, 1];
  return rot % 2 ? [dd, w] : [w, dd];
}

/** state.furniture (household storage, lazy-init) */
export function furnitureOf(st) { return (st.furniture ||= {}); }
/** storage as a list for the UI: [{ id, def, n }] in catalog order (surfaces last); kind: null | a TABS id */
export function storageList(st, tab = null) {
  const s = st?.furniture || {};
  const out = [];
  for (const id of [...FURNITURE_IDS, ...SURFACE_IDS]) {
    const n = s[id] || 0, d = itemDef(id);
    if (n <= 0) continue;
    if (tab && tab !== 'all' && tabOf(d) !== tab) continue;
    out.push({ id, def: d, n });
  }
  return out;
}
export const tabOf = d => (d.kind ? 'surface' : CATS[d.cat]?.tab || 'decor');

// What a new household owns (state.furniture), on top of the cottage's own furnishing: enough to start decorating
// on day 1 (docs/HOUSING.md §7, "place a cushion from storage").
export const STARTER_STORAGE = { zabutonBlue: 1, pottedFern: 1, packPhoto: 1, flowerVase: 1, sideTable: 1, wp_stripes: 1, fl_checker: 1 };
