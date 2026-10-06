// Zone villages (docs/ZONES.md §2; ROADMAP Z-D1..D5). Pure data (node-tested in tools/test-rpg.mjs): the names, the
// buildings and where they stand round the square, the siege camps and who is caged in them, the siege captain and the
// named villagers. Names live here only, so the owner can rename a village or a villager in one place.
//
// The site is the recipe's layout.village ({ at: [x, z], r }: layoutGen plan.village) and everything else is placed
// relative to it in "screen polar" slots: a = degrees from screen-up (the game camera looks from +x / +z, so screen-up
// is world (-1, -1)/√2 and screen-right is (1, -1)/√2), d = metres from the square's centre. Tall things only stand on
// the far side (|a| ≤ ~85°); the camera side (|a| > 100°) gets low camps, fences and stalls (biomeKit.viewGuard's rule).
// Moving the site (phase F's terrain rework) moves the whole village.
//
//   VILLAGES[zone] = { id, zone, name, jp, sub, theme, ready, square: { r }, buildings: [{ id, kind, name, jp, a, d, w, dp,
//     keeper }], camps: [{ id, a, d, r, cage, kinds? }], captain: { id, a, d }, villagers: [{ id, name, role, home, camp?,
//     rescue?, spec, likes, lines }], folk: { n, seed } }
//   building kinds: elder | shop | inn | waypoint | dojo | craft (bamboo); teaHouse (maple); fishmonger, boatwright
//   (tidepool); bathhouse, smith (onsen)
//   villager roles: elder | shopkeeper | innkeeper | cook | sensei | craftsman | teaMaster | farmer | apprentice |
//   fishmonger | boatwright | deckhand | bathkeeper | smith (village.js poses, talk.js services)

/** the four standard buildings every village has, plus each zone's specials (docs/ZONES.md §2) */
export const STANDARD = ['elder', 'shop', 'inn', 'waypoint'];

const V = (o) => ({ ready: false, square: { r: 5.2 }, buildings: [], camps: [], villagers: [], folk: { n: 0, seed: 1 }, ...o });

export const VILLAGES = {
  bamboo: V({
    id: 'takemori', zone: 'bamboo', name: 'Takemori Village', jp: '竹守村', sub: 'The village of the bamboo keepers', theme: 'bamboo', ready: true,
    square: { r: 5.2 },
    buildings: [
      { id: 'elder', kind: 'elder', name: "Grandma Sasa's House", jp: '笹の家', a: 0, d: 9.4, keeper: 'tk_sasa' },
      { id: 'inn', kind: 'inn', name: 'Sasanoha Inn', jp: '笹の葉宿', a: -40, d: 9.6, keeper: 'tk_fuku' },
      { id: 'shop', kind: 'shop', name: "Chiku's General Store", jp: '竹屋', a: 39, d: 9.3, keeper: 'tk_chiku' },
      { id: 'dojo', kind: 'dojo', name: 'Kaze Ninja Dojo', jp: '風の道場', a: 78, d: 10.4, keeper: 'tk_kazemaru' },
      { id: 'craft', kind: 'craft', name: 'Bamboo Craftshop', jp: '竹細工', a: -73, d: 9.9, keeper: 'tk_takumi' },
      { id: 'waypoint', kind: 'waypoint', name: 'Waypoint Shrine', jp: '道祖神', a: -158.5, d: 8.2, face: 'camera' }, // (low, below the road, between the west camp and the garden; it faces the camera)
    ],
    // siege camps inside the village bounds: the two road barricades and the trampled garden on the camera side. Camp
    // pieces are screen offsets [u (m, screen-right), v (m, screen-up), yaw (degrees, 0 = along screen-right)] from the
    // square's centre: here the road crosses the village at v ≈ -2.1, so the barricades straddle it, the cages and tents
    // sit below it (camera side, low) and the banners above it
    camps: [
      { id: 'west', name: 'the west barricade', at: [-8.2, -4.7], r: 3.0, cage: 'tk_chiku', n: 5, saved: 'cart', pieces: { fire: [-8.0, -5.0], cage: [-6.6, -7.8, 0], tent: [-10.2, -7.4, 30], banner: [-5.7, -4.3], spikes: [-9.7, -2.2, 90] } },
      { id: 'east', name: 'the east barricade', at: [8.4, -4.7], r: 3.0, cage: 'tk_takumi', n: 5, saved: 'yard', pieces: { fire: [8.2, -5.0], cage: [6.8, -7.9, 0], tent: [10.3, -7.4, 150], banner: [5.9, -4.3], spikes: [9.9, -2.2, 90] } },
      { id: 'south', name: 'the trampled garden', at: [2.4, -9.0], r: 3.0, cage: 'tk_fuku', n: 6, saved: 'garden', pieces: { fire: [2.5, -8.8], cage: [0.0, -10.8, 0], tent: [4.9, -10.3, 180], banner: [1.0, -6.5] } },
    ],
    // the siege captain holds the square (captains.js: a bigger, named Kamaitachi with two signature moves)
    captain: { id: 'captainGaleclaw', a: 0, d: 0.6, ring: 5.0 },
    villagers: [
      { id: 'tk_sasa', name: 'Grandma Sasa', role: 'elder', home: 'elder', hide: 'elder',
        spec: { species: 'panda', voice: 0.78, fur: '#fbf8f2', fur2: '#ffffff', fur3: '#2c2830', iris: '#8a6a3a', blush: '#f0a0a4', scale: 0.92, chubby: 1.08,
          outfit: { top: 'kimono', topColor: '#7aa874', bottomColor: '#45563f', sash: '#e8c870', pleats: true, scarf: '#efe4cf', scarfStyle: 'kerchief' } },
        likes: ['bamboo', 'honey'], bio: 'The keeper of the grove. She remembers when the bamboo first sang.' },
      { id: 'tk_fuku', name: 'Okami Fuku', role: 'innkeeper', home: 'inn', camp: 'south',
        spec: { species: 'tanuki', voice: 0.95, fur: '#a8846e', fur2: '#f2e2d2', fur3: '#4a3a34', earColor: '#4a3a34', earInner: '#d9908a', nose: '#302622', iris: '#b8803a', blush: '#e2948e', chubby: 1.06,
          outfit: { top: 'kimono', topColor: '#d8705e', bottomColor: '#6a3a3a', sash: '#f4d27a', apron: '#fff6e8' } },
        likes: ['shiitake', 'mochi'], bio: 'Runs the Sasanoha Inn. Her futons are legendary; so is her nagging.' },
      { id: 'tk_chiku', name: 'Chiku', role: 'shopkeeper', home: 'shop', camp: 'west',
        spec: { species: 'bunny', voice: 1.5, fur: '#f4ead8', fur2: '#fffaf4', earColor: '#f4ead8', earInner: '#ffc4cc', nose: '#e88da4', iris: '#6a4a2a', blush: '#f3a1ac',
          outfit: { top: 'shirt', topColor: '#7cc0a0', bottomColor: '#4a6a5a', apron: '#f6e6c4', hat: 'bandana', hatColor: '#5a9a6a', bag: '#c8a060' } },
        likes: ['bamboo', 'petal'], bio: 'Sells a bit of everything. Counts bamboo shoots in her sleep.' },
      { id: 'tk_takumi', name: 'Takumi', role: 'craftsman', home: 'craft', camp: 'east',
        spec: { species: 'bear', voice: 0.72, fur: '#9a6a48', fur2: '#e2c09a', iris: '#4b2c20', nose: '#2d1b16', blush: '#e2a090', scale: 1.04, chubby: 1.1,
          outfit: { top: 'overalls', topColor: '#7a6a52', overallColor: '#7a6a52', strapColor: '#4a3a2a', shirt: '#e8dcc0', hat: 'headband', hatColor: '#3a5a8a', pouch: '#a87843' } },
        likes: ['wood', 'bamboo'], bio: 'Weaves baskets, lanterns and the odd suit of armour out of bamboo.' },
      { id: 'tk_kazemaru', name: 'Master Kazemaru', role: 'sensei', home: 'dojo', hide: 'dojo',
        spec: { species: 'fox', voice: 0.9, fur: '#e6e2ea', fur2: '#ffffff', earColor: '#d8d2de', earInner: '#c8b0c0', earTip: '#4a4656', nose: '#3a3442', iris: '#c8a040', blush: '#e8b0b8',
          outfit: { top: 'gi', topColor: '#34405e', bottomColor: '#232838', sash: '#1e1e28', hat: 'headband', hatColor: '#d84a3a' } },
        likes: ['crystal', 'silk'], bio: "Poe's old teacher. Moves without a sound and naps without shame." },
      // rescued from the Bamboo Depths (Fuku's quest): she lives at the inn afterwards
      { id: 'tk_kome', name: 'Kome', role: 'cook', home: 'inn', rescue: true,
        spec: { species: 'cat', voice: 1.3, fur: '#fff2e4', fur2: '#ffffff', fur3: '#e89a5a', earColor: '#e89a5a', earInner: '#ffb0c0', nose: '#cb7f86', iris: '#5aa86a', blush: '#f5a0ad',
          outfit: { top: 'kimono', topColor: '#f2b8c8', bottomColor: '#6a4a5a', sash: '#ffffff', apron: '#fff8ee', hat: 'headband', hatColor: '#ffffff' } },
        likes: ['fish', 'bamboo'], bio: "The inn's cook. Makes bamboo-shoot rice so good the yokai kidnapped her for it." },
    ],
    folk: { n: 3, seed: 7101 },
  }),
  // ---------------------------------------------------------------- Akane Hamlet (maple): the road climbs the screen
  // through the square (it enters at the camera side, leaves between the Elder's house and the tea house)
  maple: V({
    id: 'akane', zone: 'maple', name: 'Akane Hamlet', jp: '茜の里', sub: 'Red leaves and warm tea', theme: 'maple', ready: true,
    square: { r: 5.0 },
    buildings: [
      { id: 'elder', kind: 'elder', name: "Elder Kaede's House", jp: '楓の家', a: -36, d: 9.7, keeper: 'ak_kaede' },
      { id: 'teaHouse', kind: 'teaHouse', name: 'Momiji Tea House', jp: '紅葉茶屋', a: 50, d: 10.0, keeper: 'ak_ochiyo' },
      { id: 'inn', kind: 'inn', name: 'Kurikaze Inn', jp: '栗風亭', a: -77, d: 9.8, keeper: 'ak_yae' },
      { id: 'shop', kind: 'shop', name: "Benji's Sundries", jp: '紅葉堂', a: 90, d: 9.6, keeper: 'ak_benji' },
      { id: 'waypoint', kind: 'waypoint', name: 'Waypoint Shrine', jp: '道祖神', a: -150, d: 8.2, face: 'camera' },
    ],
    camps: [
      { id: 'west', name: 'the burned granary', at: [-7.6, -3.6], r: 3.0, cage: 'ak_benji', n: 5, saved: 'persimmons', pieces: { fire: [-7.4, -3.8], cage: [-6.0, -6.6, 0], tent: [-9.8, -5.8, 30], banner: [-5.2, -2.6] } },
      { id: 'east', name: 'the trampled tea garden', at: [8.4, -5.6], r: 3.0, cage: 'ak_ochiyo', n: 5, saved: 'harvest', pieces: { fire: [8.2, -5.8], cage: [6.6, -8.4, 0], tent: [10.6, -7.2, 150], banner: [6.4, -3.9] } },
      { id: 'south', name: 'the road barricade', at: [1.2, -9.0], r: 3.0, cage: 'ak_yae', n: 6, saved: 'stall', pieces: { fire: [3.4, -9.2], cage: [-1.8, -10.4, 0], tent: [5.6, -10.6, 180], banner: [-0.6, -7.4], spikes: [0.8, -8.0, 0] } },
    ],
    captain: { id: 'captainStrawgrin', a: 0, d: 0.6, ring: 5.0 },
    villagers: [
      { id: 'ak_kaede', name: 'Elder Kaede', role: 'elder', home: 'elder', hide: 'elder',
        spec: { species: 'fox', voice: 0.82, fur: '#d89a7a', fur2: '#fff4ec', earColor: '#c88468', earInner: '#f0c0b0', earTip: '#5a4040', nose: '#4a3434', iris: '#c89a4a', blush: '#e8a8a0', scale: 0.94,
          outfit: { top: 'kimono', topColor: '#9a3a2e', bottomColor: '#4a2a26', sash: '#e8c070', scarf: '#f2e6d4', scarfStyle: 'kerchief' } },
        likes: ['petal', 'honey'], bio: 'Has watched sixty autumns turn the hills red, and remembers every one.' },
      { id: 'ak_ochiyo', name: 'Ochiyo', role: 'teaMaster', home: 'teaHouse', camp: 'east',
        spec: { species: 'cat', voice: 1.2, fur: '#fff4ea', fur2: '#ffffff', fur3: '#3a3440', earColor: '#3a3440', earInner: '#ffb8c4', nose: '#cb7f86', iris: '#c8a040', blush: '#f5a0ad',
          outfit: { top: 'kimono', topColor: '#6a3a5a', bottomColor: '#3a2434', sash: '#e8b04a', apron: '#f6ead8' } },
        likes: ['honey', 'petal'], bio: 'Brews tea so calm it slows the falling leaves.' },
      { id: 'ak_benji', name: 'Benji', role: 'shopkeeper', home: 'shop', camp: 'west',
        spec: { species: 'tanuki', voice: 0.9, fur: '#9a7864', fur2: '#f0e0d0', fur3: '#4a3a34', earColor: '#4a3a34', earInner: '#d9908a', nose: '#302622', iris: '#c88a38', blush: '#d99089',
          outfit: { top: 'shirt', topColor: '#d8803a', bottomColor: '#5a4a3a', apron: '#f4e4c4', hat: 'leaf', hatColor: '#d8542e', bag: '#a87843' } },
        likes: ['coins', 'shiitake'], bio: 'Sells chestnuts, charms and "genuine" yokai repellent.' },
      { id: 'ak_yae', name: 'Okami Yae', role: 'innkeeper', home: 'inn', camp: 'south',
        spec: { species: 'bear', voice: 0.85, fur: '#b07a54', fur2: '#ecc8a0', iris: '#4b2c20', nose: '#2d1b16', blush: '#e2a090', scale: 1.02, chubby: 1.08,
          outfit: { top: 'kimono', topColor: '#c86a3a', bottomColor: '#5a3424', sash: '#ffe0a0', apron: '#fff4e4' } },
        likes: ['shiitake', 'honey'], bio: 'Her inn smells of roasted chestnuts and clean tatami.' },
      { id: 'ak_inaho', name: 'Inaho', role: 'farmer', home: 'elder', hide: 'elder',
        spec: { species: 'bunny', voice: 1.45, fur: '#e8d0b8', fur2: '#fff8f0', earColor: '#e8d0b8', earInner: '#ffc4cc', nose: '#e88da4', iris: '#6a4a2a', blush: '#f3a1ac',
          outfit: { top: 'overalls', topColor: '#6a8a3a', overallColor: '#6a8a3a', strapColor: '#4a5a2a', shirt: '#f4e8d0', hat: 'straw', hatColor: '#e8c870' } },
        likes: ['rice', 'carrot'], bio: "Elder Kaede's grandson. Tends the rice terraces and talks to the scarecrows (the friendly ones)." },
      // rescued from the Maple Roots (Ochiyo's quest): he lives at the tea house afterwards
      { id: 'ak_tobi', name: 'Tobi', role: 'apprentice', home: 'teaHouse', rescue: true,
        spec: { species: 'dog', voice: 1.25, fur: '#e8c89a', fur2: '#fff4ea', iris: '#5a3a2a', nose: '#3a2a26', blush: '#f0a8a0', scale: 0.92,
          outfit: { top: 'gi', topColor: '#4a6a8a', bottomColor: '#2a3a4a', sash: '#d8503a', hat: 'headband', hatColor: '#ffffff' } },
        likes: ['honey', 'fish'], bio: "Ochiyo's apprentice. Spills more tea than he serves." },
    ],
    folk: { n: 3, seed: 7201 },
  }),
  // ---------------------------------------------------------------- Shiokaze Port (tidepool): the bay is screen-left (the
  // pier and the boatyard), the road crosses the square diagonally from the bottom-left to the top-right
  tidepool: V({
    id: 'shiokaze', zone: 'tidepool', name: 'Shiokaze Port', jp: '潮風港', sub: 'Salt wind and fishing boats', theme: 'tidepool', ready: true,
    square: { r: 5.0 },
    buildings: [
      { id: 'elder', kind: 'elder', name: "Captain Kaizo's Lookout", jp: '望楼', a: 0, d: 9.4, keeper: 'sk_kaizo' },
      { id: 'fishmonger', kind: 'fishmonger', name: "Saba's Fish Market", jp: '魚市', a: 28, d: 11.0, keeper: 'sk_saba' },
      { id: 'boatwright', kind: 'boatwright', name: 'Funaki Boatyard', jp: '船大工', a: -90, d: 10.6, keeper: 'sk_funaki' },
      { id: 'inn', kind: 'inn', name: 'Shinju Inn', jp: '真珠屋', a: -36, d: 10.6, keeper: 'sk_shinju' },
      { id: 'shop', kind: 'shop', name: "Nami's Port Store", jp: '浜屋', a: 84, d: 9.6, keeper: 'sk_nami' },
      { id: 'waypoint', kind: 'waypoint', name: 'Waypoint Shrine', jp: '道祖神', a: 160, d: 8.2, face: 'camera' },
    ],
    camps: [
      { id: 'pier', name: 'the pier barricade', at: [-6.8, -3.0], r: 3.0, cage: 'sk_saba', n: 5, saved: 'nets', pieces: { fire: [-6.9, -2.8], cage: [-6.4, -5.6, 0], tent: [-8.0, -6.6, 30], banner: [-5.4, -1.0] } },
      { id: 'road', name: 'the road barricade', at: [-4.4, -7.4], r: 3.0, cage: 'sk_funaki', n: 6, saved: 'catch', pieces: { fire: [-2.6, -8.4], cage: [-6.2, -9.6, 0], tent: [-1.0, -10.6, 180], banner: [-4.8, -5.4], spikes: [-4.6, -6.4, -45] } },
      { id: 'yard', name: 'the stacked crates', at: [6.8, -4.6], r: 3.0, cage: 'sk_nami', n: 5, saved: 'crates', pieces: { fire: [6.6, -4.8], cage: [5.0, -7.4, 0], tent: [9.2, -6.6, 150], banner: [4.6, -3.0] } },
    ],
    captain: { id: 'captainBrineclaw', a: 0, d: 0.6, ring: 5.0 },
    villagers: [
      { id: 'sk_kaizo', name: 'Old Captain Kaizo', role: 'elder', home: 'elder', hide: 'elder',
        spec: { species: 'dog', voice: 0.74, fur: '#b8b0a8', fur2: '#f4f0ea', iris: '#3a5a7a', nose: '#2a2a30', blush: '#e0a8a0', scale: 0.98,
          outfit: { top: 'shirt', topColor: '#2e4a6e', bottomColor: '#3a3a4a', scarf: '#e8e0d0', scarfStyle: 'kerchief', hat: 'bandana', hatColor: '#c84a3a' } },
        likes: ['fish', 'stone'], bio: "Sailed every cove from here to the moon (he says). Keeps the port's logbook." },
      { id: 'sk_saba', name: 'Saba', role: 'fishmonger', home: 'fishmonger', camp: 'pier',
        spec: { species: 'cat', voice: 1.15, fur: '#8a8a9a', fur2: '#f4f4f8', fur3: '#4a4a5a', earColor: '#6a6a7a', earInner: '#ffb0c0', nose: '#cb7f86', iris: '#5ab0c0', blush: '#f5a0ad',
          outfit: { top: 'shirt', topColor: '#f4f0e8', bottomColor: '#2e5a7a', apron: '#4a8ab0', hat: 'bandana', hatColor: '#2e5a7a' } },
        likes: ['fish', 'seaweed'], bio: "Can tell a fish's mood from across the market." },
      { id: 'sk_funaki', name: 'Funaki', role: 'boatwright', home: 'boatwright', camp: 'road',
        spec: { species: 'bear', voice: 0.7, fur: '#7a5a44', fur2: '#d8b890', iris: '#3a2a20', nose: '#241a16', blush: '#d89a8a', scale: 1.06, chubby: 1.1,
          outfit: { top: 'overalls', topColor: '#4a6a7a', overallColor: '#4a6a7a', strapColor: '#2a3a44', shirt: '#e8e0d0', hat: 'headband', hatColor: '#e8c870', pouch: '#a87843' } },
        likes: ['wood', 'fish'], bio: 'Builds boats by ear: a good hull hums when you knock it.' },
      { id: 'sk_nami', name: 'Nami', role: 'shopkeeper', home: 'shop', camp: 'yard',
        spec: { species: 'bunny', voice: 1.55, fur: '#ffffff', fur2: '#fff8f4', earColor: '#ffffff', earInner: '#ffc0d0', nose: '#e88da4', iris: '#3a7a9a', blush: '#f3a1ac',
          outfit: { top: 'dress', topColor: '#5ac0c8', bottomColor: '#2e6a7a', apron: '#fff6e8', hat: 'flower', hatColor: '#ff8fb0' } },
        likes: ['seaweed', 'crystal'], bio: 'Runs the port store. Collects sea glass in every colour but green (she has enough green).' },
      { id: 'sk_shinju', name: 'Okami Shinju', role: 'innkeeper', home: 'inn', hide: 'inn',
        spec: { species: 'duck', voice: 1.3, fur: '#fff8ec', fur2: '#ffffff', iris: '#3a2a20', blush: '#f5b0a0',
          outfit: { top: 'kimono', topColor: '#3a7ab0', bottomColor: '#2a3a5a', sash: '#ffd24a', apron: '#fff8ee' } },
        likes: ['fish', 'silk'], bio: 'Her inn sways a little on its stilts. Guests say it rocks them to sleep.' },
      // rescued from the Tide Caves (Funaki's quest): he lives at the boatyard afterwards
      { id: 'sk_kaito', name: 'Kaito', role: 'deckhand', home: 'boatwright', rescue: true,
        spec: { species: 'fox', voice: 1.2, fur: '#ff9a4a', fur2: '#fff4e8', earColor: '#ff8a3a', earInner: '#ffbeac', earTip: '#493044', nose: '#493044', iris: '#3a8aa0', blush: '#ffa3a0', scale: 0.94,
          outfit: { top: 'shirt', topColor: '#ffffff', bottomColor: '#2e4a6e', scarf: '#e8503a', scarfStyle: 'ends' } },
        likes: ['fish', 'lantern'], bio: "Funaki's deckhand. Swears he saw Umibōzu wink." },
    ],
    folk: { n: 3, seed: 7301 },
  }),
  // ---------------------------------------------------------------- Yukimi Spa Village (onsen): the road runs across the
  // screen through the square; the hot springs steam behind the bathhouse at the top
  onsen: V({
    id: 'yukimi', zone: 'onsen', name: 'Yukimi Spa Village', jp: '雪見の湯', sub: 'Steam over the snow', theme: 'onsen', ready: true,
    square: { r: 5.0 },
    buildings: [
      { id: 'bathhouse', kind: 'bathhouse', name: 'Yukimi Bathhouse', jp: '雪見湯', a: 0, d: 8.0, keeper: 'yk_yuzu' }, // (top centre: the small spring steams behind it, the big one beside its bamboo screen)
      { id: 'elder', kind: 'elder', name: "Granny Shirayuki's Cottage", jp: '白雪庵', a: -38, d: 9.8, keeper: 'yk_shirayuki' },
      { id: 'inn', kind: 'inn', name: 'Ryokan Tsubaki', jp: '椿旅館', a: 48, d: 10.2, keeper: 'yk_tsubaki' },
      // the far side only fits three past the road and the springs: the low forge and shop stand by the two gates on the
      // camera side, fronts to the camera
      { id: 'smith', kind: 'smith', name: "Tetsu's Snow Forge", jp: '雪鉄の鍛冶', a: -100, d: 10.4, face: 'camera', keeper: 'yk_tetsu' },
      { id: 'shop', kind: 'shop', name: "Mikan's Warm Goods", jp: '蜜柑屋', a: 100, d: 10.2, face: 'camera', keeper: 'yk_mikan' },
      { id: 'waypoint', kind: 'waypoint', name: 'Waypoint Shrine', jp: '道祖神', a: -160, d: 9.6, face: 'camera' },
    ],
    camps: [
      { id: 'west', name: 'the woodshed barricade', at: [-6.4, -6.9], r: 2.5, cage: 'yk_tetsu', n: 5, saved: 'woodpile', pieces: { fire: [-6.3, -7.0], cage: [-6.9, -9.4, 0], tent: [-8.9, -7.4, 30], banner: [-5.0, -5.1], spikes: [-4.5, -6.6, 75] } },
      { id: 'east', name: 'the east barricade', at: [6.2, -6.6], r: 2.5, cage: 'yk_mikan', n: 5, saved: 'snowman', pieces: { fire: [6.1, -6.8], cage: [7.4, -9.0, 0], tent: [8.8, -6.8, 150], banner: [4.8, -5.0], spikes: [4.4, -6.5, 105] } },
      { id: 'south', name: 'the toppled bath buckets', at: [2.8, -9.8], r: 2.3, cage: 'yk_yuzu', n: 6, saved: 'buckets', pieces: { fire: [2.8, -9.6], cage: [0.6, -10.8, 0], tent: [4.6, -10.6, 180], banner: [1.6, -7.6] } },
    ],
    captain: { id: 'captainFrostbelly', a: 0, d: 0.6, ring: 5.0 },
    villagers: [
      { id: 'yk_shirayuki', name: 'Granny Shirayuki', role: 'elder', home: 'elder', hide: 'elder',
        spec: { species: 'bunny', voice: 1.05, fur: '#f6f4f8', fur2: '#ffffff', earColor: '#f0eef4', earInner: '#f0c0d0', nose: '#e8a0b0', iris: '#7a6aa0', blush: '#f0b0c0', scale: 0.9,
          outfit: { top: 'kimono', topColor: '#5a6aa8', bottomColor: '#2e3460', sash: '#e8e0f0', scarf: '#d84a5a', scarfStyle: 'kerchief' } },
        likes: ['crystal', 'honey'], bio: 'Has counted every snowfall since she was a kit. She is at 61,212.' },
      { id: 'yk_yuzu', name: 'Yuzu', role: 'bathkeeper', home: 'bathhouse', camp: 'south',
        spec: { species: 'tanuki', voice: 0.95, fur: '#b08a70', fur2: '#f6e6d6', fur3: '#4a3a34', earColor: '#4a3a34', earInner: '#d9908a', nose: '#302622', iris: '#c8a040', blush: '#f0a090', chubby: 1.12,
          outfit: { top: 'kimono', topColor: '#f0c040', bottomColor: '#a85a2a', sash: '#ffffff', hat: 'headband', hatColor: '#ffffff' } },
        likes: ['honey', 'shiitake'], bio: 'Keeps the baths at exactly the right temperature: "a little too hot".' },
      { id: 'yk_tetsu', name: 'Tetsu', role: 'smith', home: 'smith', camp: 'west',
        spec: { species: 'bear', voice: 0.66, fur: '#4a3a36', fur2: '#a88a70', iris: '#e0a040', nose: '#1a1414', blush: '#c88a7a', scale: 1.08, chubby: 1.06,
          outfit: { top: 'none', apron: '#6a4a3a', hat: 'headband', hatColor: '#e8503a', scarf: '#c8c0b0' } },
        likes: ['stone', 'crystal'], bio: 'Folds snow ore a hundred times. Talks to it a hundred and one.' },
      { id: 'yk_mikan', name: 'Mikan', role: 'shopkeeper', home: 'shop', camp: 'east',
        spec: { species: 'fox', voice: 1.3, fur: '#ffb060', fur2: '#fff4e8', earColor: '#ff9a4a', earInner: '#ffc8b0', earTip: '#5a3a3a', nose: '#4a3030', iris: '#4a8ad0', blush: '#ffa3a0',
          outfit: { top: 'shirt', topColor: '#e8503a', bottomColor: '#4a3a5a', scarf: '#ffffff', hat: 'beret', hatColor: '#e8503a' } },
        likes: ['honey', 'silk'], bio: 'Sells hand warmers, hot buns and very fluffy mittens.' },
      { id: 'yk_tsubaki', name: 'Okami Tsubaki', role: 'innkeeper', home: 'inn', hide: 'inn',
        spec: { species: 'cat', voice: 1.1, fur: '#3a3440', fur2: '#f4f0f4', fur3: '#fff4ea', earColor: '#3a3440', earInner: '#ffb0c0', nose: '#cb7f86', iris: '#e0b040', blush: '#f5a0ad',
          outfit: { top: 'kimono', topColor: '#b8243a', bottomColor: '#4a1a2a', sash: '#f0d8a0', apron: '#fff8ee' } },
        likes: ['silk', 'fish'], bio: "The ryokan's proprietress. Has never, ever been seen in a hurry." },
      // rescued from the Onsen Caverns (Tetsu's quest): he lives at the forge afterwards
      { id: 'yk_hokuto', name: 'Hokuto', role: 'apprentice', home: 'smith', rescue: true,
        spec: { species: 'panda', voice: 1.2, fur: '#fbf8f4', fur2: '#ffffff', fur3: '#29262d', iris: '#5a7ab0', nose: '#211d28', blush: '#f2a1a2', scale: 0.88,
          outfit: { top: 'overalls', topColor: '#7a8a9a', overallColor: '#7a8a9a', strapColor: '#4a5a6a', shirt: '#f0e8e0', hat: 'headband', hatColor: '#e8503a' } },
        likes: ['crystal', 'mochi'], bio: "Tetsu's apprentice. Hammers in time with his own hiccups." },
    ],
    folk: { n: 3, seed: 7401 },
  }),
};
export const VILLAGE_ZONES = Object.keys(VILLAGES);
/** The Waypoint Shrine's model slot (ROADMAP Z-D6): glb null = the kit waystone (art.js waystone, tinted per zone); a
 *  .glb path (public/models) = that model at every village's shrine slot (village.js placeShrineGlb), its materials
 *  named 'tint…' coloured per zone (WAYSTONE_TINTS); the kit's footprint, door and rune hook are kept either way. */
export const WAYSTONE = { glb: null, scale: 1, yaw: 0 };
export const WAYSTONE_TINTS = { bamboo: '#5a9a88', maple: '#c8402e', tidepool: '#3a8ab8', onsen: '#6a7ac8' };

/** every zone villager by id → { ...villager, zone } (story.js names them, the quests point at them) */
export const ZONE_NPCS = Object.fromEntries(Object.values(VILLAGES).flatMap(v => v.villagers.map(n => [n.id, { ...n, zone: v.zone, village: v.id }])));
export const zoneNpc = id => ZONE_NPCS[id] || null;
export const villageOf = zone => VILLAGES[zone] || null;
/** is this village built yet (its layout authored)? */
export const villageReady = zone => !!VILLAGES[zone]?.ready;

// ------------------------------------------------------------------ site geometry (pure)
const S2 = Math.SQRT1_2;
/** world offset of a screen-polar slot (a degrees from screen-up, d metres) → [dx, dz] */
export function slotOffset(a, d) {
  const r = a * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  // fwd (screen-up) = (-S2, -S2), right = (S2, -S2)
  return [d * (-S2 * c + S2 * s), d * (-S2 * c - S2 * s)];
}
/** world position of a screen offset from the square's centre: u metres screen-right, v metres screen-up */
export function screenAt(site, u, v) { return { x: site.x + S2 * u - S2 * v, z: site.z - S2 * u - S2 * v }; }
/** the world yaw that lays a model's local +x along a screen direction (deg: 0 = screen-right, 90 = screen-up) */
export const screenYaw = deg => (45 + deg) * Math.PI / 180;
/** the screen-polar slot of a world point → { a (degrees from screen-up), d } */
export function slotOf(site, x, z) {
  const dx = x - site.x, dz = z - site.z, d = Math.hypot(dx, dz);
  if (d < 1e-6) return { a: 0, d: 0 };
  const c = -(dx + dz) / (2 * S2 * d), s = (dx - dz) / (2 * S2 * d);
  return { a: Math.atan2(s, c) * 180 / Math.PI, d };
}
/** a slot's world position and the yaw that turns a front-facing (+z) model toward the square's centre */
export function slotAt(site, a, d) {
  const [dx, dz] = slotOffset(a, d), x = site.x + dx, z = site.z + dz;
  return { x, z, rot: d > 0.01 ? Math.atan2(-dx, -dz) : 0 };
}
