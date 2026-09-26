// Items — bases (normal / exceptional / elite), affixes, uniques, sets, treat gems, generation, tooltips, shop.
// Pure data + logic; no DOM. Item schema follows docs/ARCHITECTURE.md:
//   { uid, kind:'gear'|'gem'|'material'|'gift'|'key', base, slot, wtype?, rarity, name, ilvl, req:{lvl,str?,dex?},
//     dmg?, aspd?, def?, affixes:[{id,stat,value,text}], uniqueId?, setId?, sockets, gems:[], qty?, value, flavor?, icon:{shape,colors} }
// Extra item fields: tier (0 normal / 1 exceptional / 2 elite base), setPiece (set item id), gemType/gemTier (gems),
//   icon.variant (drawing variant for icons.js), affix.pct (enhanced-defense %), affix.gem (true for socketed gem mods).
// Enhanced Defense affixes are stored as a flat `def` bonus (value) plus `pct` for display, so every affix just adds
// `value` into derived[stat].
import { RNG, uid as rid } from '../core/util.js';
import { computeStats } from './stats.js';
import { SKILLS } from './skills.js';

// ================================================================== constants
export const RARITY = {
  normal: { name: 'Normal', color: '#f4efe6' },
  magic: { name: 'Magic', color: '#6ea8ff' },
  rare: { name: 'Rare', color: '#ffd84a' },
  unique: { name: 'Unique', color: '#ff9a3c' },
  set: { name: 'Set', color: '#5ee07a' },
};
export const SLOTS = ['weapon', 'hat', 'outfit', 'collar', 'charm', 'boots', 'paws'];
export const EQUIP_SLOTS = ['weapon', 'weaponAlt', 'hat', 'outfit', 'collar', 'charm1', 'charm2', 'boots', 'paws'];
/** equipment slot → item.slot */
export const EQUIP_SLOT_ITEM = { weapon: 'weapon', weaponAlt: 'weapon', hat: 'hat', outfit: 'outfit', collar: 'collar', charm1: 'charm', charm2: 'charm', boots: 'boots', paws: 'paws' };
export const SLOT_NAMES = { weapon: 'Weapon', hat: 'Hat', outfit: 'Outfit', collar: 'Collar', charm: 'Charm', boots: 'Boots', paws: 'Paws' };
export const TIER_NAMES = ['Normal', 'Exceptional', 'Elite'];
export const MATERIALS = {
  wood: { name: 'Wood', desc: 'Sturdy planks for building.' },
  stone: { name: 'Stone', desc: 'Smooth river stones.' },
  petal: { name: 'Sakura Petal', desc: 'Soft pink petals. Smell like spring.' },
  crystal: { name: 'Crystal', desc: 'A glittering burrow crystal.' },
  bone: { name: 'Bone', desc: 'A perfectly good bone. Do not chew. (Chew a little.)' },
  mochi: { name: 'Mochi', desc: 'Squishy slime mochi. Surprisingly useful.' },
  silk: { name: 'Silk', desc: 'Shimmering spider silk.' },
  lantern: { name: 'Lantern Glow', desc: 'A bottled wisp of lantern-ghost light.' },
};
export const POTIONS = {
  heart: { name: 'Heart Treat', desc: 'A pink heart cookie. Heals life over a few seconds.', price: 25, color: '#ff8fb0' },
  zoom: { name: 'Zoom Juice', desc: 'Fizzy blue juice. Restores zoom over a few seconds.', price: 30, color: '#6ec0ff' },
  rejuv: { name: 'Rejuvenation Jelly', desc: 'Wobbly purple jelly. Instantly restores 40% life and zoom.', price: 150, color: '#b88aff' },
};
const INK_COLORS = { white: '#f4efe6', blue: '#6ea8ff', grey: '#a89c94', red: '#ff6a5a', green: '#5ee07a', gold: '#ffd84a', orange: '#ff9a3c', flavor: '#e8c89a' };
export const TOOLTIP_COLORS = INK_COLORS;

// ================================================================== helpers
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
let uidN = 0;
const newUid = () => 'it' + rid() + (uidN++).toString(36);
/** Accepts an RNG instance, a () => [0,1) function, or nothing. Returns an RNG-like object. */
export function toRng(r) {
  if (r && typeof r.next === 'function' && typeof r.int === 'function') return r;
  const f = typeof r === 'function' ? r : Math.random;
  return {
    next: f,
    range: (a, b) => a + (b - a) * f(),
    int: (a, b) => Math.floor(a + (b - a + 1) * f()),
    pick: arr => arr[Math.floor(f() * arr.length)],
    chance: p => f() < p,
    weighted(list, k = 'w') { let t = 0; for (const it of list) t += it[k]; let x = f() * t; for (const it of list) { x -= it[k]; if (x <= 0) return it; } return list[list.length - 1]; },
  };
}
const ri = (rng, a, b) => (a >= b ? a : rng.int(a, b));

// ================================================================== bases
export const ITEM_BASES = {};
function addBase(id, o) {
  const tier = o.tier || 0;
  const reqLvl = tier === 0 ? Math.max(1, Math.floor(o.lvl * 0.5)) : o.lvl - (tier === 1 ? 2 : 3);
  ITEM_BASES[id] = { id, kind: 'gear', tier, ...o, req: { lvl: reqLvl, ...(o.req || {}) } };
}
const sword = (id, name, tier, lvl, dmg, aspd, req, sockets, variant, colors) => addBase(id, { name, slot: 'weapon', wtype: 'sword', tier, lvl, dmg, aspd, req, sockets, icon: { shape: 'sword', variant, colors } });
const ball = (id, name, tier, lvl, dmg, aspd, req, sockets, variant, colors) => addBase(id, { name, slot: 'weapon', wtype: 'ball', tier, lvl, dmg, aspd, req, sockets, icon: { shape: 'ball', variant, colors } });
const armor = (slot, id, name, tier, lvl, def, req, sockets, variant, colors) => addBase(id, { name, slot, tier, lvl, def, req, sockets, icon: { shape: slot, variant, colors } });
const jewel = (slot, id, name, tier, lvl, variant, colors) => addBase(id, { name, slot, tier, lvl, sockets: 0, icon: { shape: slot, variant, colors } });

// ---- Bone swords (str scaling) — [blade, grip, accent]
sword('chewStick', 'Chew Stick', 0, 1, [2, 5], 1.35, {}, 2, 'stick', ['#c98f5e', '#8a5a3a', '#7cc45a']);
sword('boneSword', 'Bone Sword', 0, 1, [3, 7], 1.15, {}, 2, 'bone', ['#f4e8cf', '#c23b3b', '#f2e4c6']);
sword('ribSabre', 'Rib Sabre', 0, 5, [4, 11], 1.25, { str: 14 }, 2, 'sabre', ['#f7ecd6', '#3f6fb0', '#f4c04a']);
sword('crunchyFemur', 'Crunchy Femur', 0, 9, [7, 15], 1.0, { str: 20 }, 3, 'club', ['#efdcb8', '#8a5a3a', '#d9c09a']);
sword('rawhideCleaver', 'Rawhide Cleaver', 0, 13, [8, 19], 1.1, { str: 25 }, 3, 'cleaver', ['#e8c89a', '#6b4a3a', '#c98f5e']);
sword('dinoBoneBlade', 'Dino Bone Blade', 1, 20, [14, 30], 1.1, { str: 40 }, 3, 'dino', ['#f1e2c2', '#3f8f8a', '#e8503a']);
sword('sharkToothSaber', 'Shark Tooth Saber', 1, 24, [13, 31], 1.3, { str: 38, dex: 30 }, 2, 'shark', ['#fbf6ee', '#2f4a7a', '#8fd0ff']);
sword('mammothTusk', 'Mammoth Tusk', 1, 28, [20, 40], 0.95, { str: 55 }, 3, 'tusk', ['#fff3e0', '#8a5a3a', '#c98f5e']);
sword('tRexCleaver', 'T-Rex Cleaver', 1, 33, [22, 46], 1.05, { str: 62 }, 3, 'trex', ['#eadbb8', '#5a3a5a', '#e8503a']);
sword('moonboneKatana', 'Moonbone Katana', 2, 40, [28, 54], 1.3, { str: 70, dex: 60 }, 3, 'katana', ['#e6f0ff', '#2c3a6a', '#8fd0ff']);
sword('dragonboneEdge', 'Dragonbone Edge', 2, 45, [34, 66], 1.1, { str: 85 }, 3, 'dragon', ['#fff0d0', '#8a2a3a', '#f4c04a']);
sword('kaijuFemur', 'Kaiju Femur', 2, 50, [42, 84], 0.95, { str: 110 }, 3, 'kaiju', ['#e2f0d8', '#3a5a3a', '#8fe0c0']);
sword('starboneOdachi', 'Starbone Odachi', 2, 55, [40, 78], 1.2, { str: 95, dex: 75 }, 3, 'odachi', ['#fff8e8', '#5a3a8a', '#ffcf4a']);
// ---- Balls (dex scaling) — [main, seam, accent]
ball('redTennisBall', 'Red Tennis Ball', 0, 1, [2, 6], 1.2, {}, 2, 'tennis', ['#e8362a', '#fff3e0', '#ff8a70']);
ball('squeakyBall', 'Squeaky Ball', 0, 4, [3, 9], 1.25, { dex: 12 }, 2, 'squeaky', ['#ff8fb0', '#fff3e0', '#ffcf4a']);
ball('bouncyBall', 'Bouncy Rubber Ball', 0, 8, [5, 12], 1.2, { dex: 18 }, 2, 'bouncy', ['#5aa8ff', '#ffe070', '#ffffff']);
ball('yarnBall', 'Yarn Ball', 0, 12, [6, 15], 1.3, { dex: 24 }, 3, 'yarn', ['#b88aff', '#8a5ad0', '#ffbcd6']);
ball('spikyBall', 'Spiky Ball', 1, 20, [11, 27], 1.15, { dex: 40 }, 3, 'spiky', ['#7cc45a', '#4f8f3a', '#ffe070']);
ball('kemariBall', 'Kemari Ball', 1, 24, [12, 26], 1.3, { dex: 45 }, 2, 'kemari', ['#fff6e8', '#e8503a', '#2f4a7a']);
ball('lanternBall', 'Lantern Ball', 1, 28, [16, 34], 1.2, { dex: 55 }, 3, 'lantern', ['#ffb04a', '#e8503a', '#fff3a0']);
ball('proBall', 'Pro Tour Ball', 1, 33, [18, 40], 1.2, { dex: 62 }, 3, 'tennis', ['#d4f05a', '#ffffff', '#a0c030']);
ball('cometBall', 'Comet Ball', 2, 40, [24, 50], 1.25, { dex: 72 }, 3, 'comet', ['#ff8a3a', '#fff3a0', '#ffcf4a']);
ball('meteorBall', 'Meteor Ball', 2, 45, [30, 62], 1.1, { str: 50, dex: 80 }, 3, 'meteor', ['#5a4a5a', '#ff6a2a', '#ffcf4a']);
ball('planetBall', 'Ringed Planet Ball', 2, 50, [34, 70], 1.2, { dex: 95 }, 3, 'planet', ['#8fd0ff', '#ffbcd6', '#ffffff']);
ball('supernovaBall', 'Supernova Ball', 2, 55, [36, 76], 1.3, { dex: 105 }, 3, 'nova', ['#c86aff', '#ffe0ff', '#ffcf4a']);
// ---- Hats — [main, band, accent]
armor('hat', 'strawHat', 'Straw Hat', 0, 1, [2, 4], {}, 1, 'straw', ['#f2d27a', '#e8503a', '#c9a24a']);
armor('hat', 'bandana', 'Bandana', 0, 3, [3, 5], {}, 1, 'bandana', ['#e8475c', '#ffffff', '#b8364a']);
armor('hat', 'knitBeanie', 'Knit Beanie', 0, 7, [5, 8], {}, 2, 'beanie', ['#6a9ae8', '#ffffff', '#4a72c0']);
armor('hat', 'kasa', 'Rice Kasa', 0, 12, [8, 12], { str: 18 }, 2, 'kasa', ['#e0c080', '#8a5a3a', '#b89a5a']);
armor('hat', 'kitsuneMask', 'Kitsune Mask', 1, 20, [14, 20], { dex: 30 }, 2, 'kitsune', ['#fffaf2', '#e8503a', '#f4c04a']);
armor('hat', 'kabuto', 'Kabuto', 1, 26, [20, 28], { str: 40 }, 2, 'kabuto', ['#4a4a6a', '#f4c04a', '#e8503a']);
armor('hat', 'tenguMask', 'Tengu Mask', 1, 32, [24, 34], { str: 45 }, 2, 'tengu', ['#e8503a', '#2c2c3a', '#f4c04a']);
armor('hat', 'shogunKabuto', 'Shogun Kabuto', 2, 42, [36, 48], { str: 70 }, 3, 'shogun', ['#2c3a6a', '#ffcf4a', '#e8503a']);
armor('hat', 'pawCrown', 'Crown of Paws', 2, 50, [44, 58], { str: 60 }, 3, 'crown', ['#ffcf4a', '#ff8fb0', '#8fd0ff']);
// ---- Outfits — [main, trim, accent]
armor('outfit', 'knitSweater', 'Knit Sweater', 0, 1, [4, 7], {}, 2, 'sweater', ['#e86a5a', '#fff3e0', '#ffcf4a']);
armor('outfit', 'happiCoat', 'Happi Coat', 0, 4, [6, 10], {}, 2, 'happi', ['#2f4a7a', '#fff3e0', '#e8503a']);
armor('outfit', 'rainPoncho', 'Rain Poncho', 0, 8, [9, 14], { str: 12 }, 2, 'poncho', ['#ffd23a', '#e8a82a', '#fff6c0']);
armor('outfit', 'gi', 'Training Gi', 0, 12, [12, 18], { str: 20 }, 3, 'gi', ['#2c3a6a', '#e8503a', '#fff3e0']);
armor('outfit', 'haori', 'Haori Jacket', 1, 20, [20, 30], { str: 35 }, 3, 'haori', ['#6e9a5a', '#fff3e0', '#f4c04a']);
armor('outfit', 'ninjaGarb', 'Ninja Garb', 1, 25, [24, 34], { dex: 35 }, 3, 'ninja', ['#3a3a4a', '#8a5ad0', '#e8503a']);
armor('outfit', 'samuraiArmor', 'Samurai Armor', 1, 30, [34, 46], { str: 55 }, 3, 'samurai', ['#b8364a', '#f4c04a', '#3a3a4a']);
armor('outfit', 'dragonKimono', 'Dragon Kimono', 2, 42, [48, 64], { str: 60 }, 3, 'kimono', ['#8a3ab8', '#ffcf4a', '#e8503a']);
armor('outfit', 'starYukata', 'Starlit Yukata', 2, 47, [54, 70], { str: 65 }, 3, 'yukata', ['#2f4a7a', '#ffcf4a', '#8fd0ff']);
armor('outfit', 'oniPlate', 'Oni Plate', 2, 53, [66, 86], { str: 100 }, 3, 'oni', ['#c83a3a', '#3a3a4a', '#ffcf4a']);
// ---- Collars (amulet-like: no defense, always magic+) — [band, tag, accent]
jewel('collar', 'leatherCollar', 'Leather Collar', 0, 1, 'bone', ['#b8743a', '#f2e4c6', '#6b4a3a']);
jewel('collar', 'bellCollar', 'Bell Collar', 0, 10, 'bell', ['#e8475c', '#ffcf4a', '#b8364a']);
jewel('collar', 'jeweledCollar', 'Jeweled Collar', 1, 22, 'jewel', ['#8a5ad0', '#6ae0ff', '#ffbcd6']);
jewel('collar', 'ropeCollar', 'Shimenawa Collar', 1, 30, 'rope', ['#e8d09a', '#ffffff', '#e8503a']);
jewel('collar', 'starCollar', 'Star Collar', 2, 40, 'star', ['#2f4a7a', '#ffcf4a', '#8fd0ff']);
jewel('collar', 'moonCollar', 'Moon Collar', 2, 50, 'moon', ['#3a3458', '#e6ecff', '#8fd0ff']);
// ---- Charms (ring-like: always magic+) — [main, cord, accent]
jewel('charm', 'omamori', 'Omamori', 0, 1, 'omamori', ['#e8503a', '#ffcf4a', '#fff3e0']);
jewel('charm', 'pawCharm', 'Paw Charm', 0, 8, 'paw', ['#ff8fb0', '#d8a83a', '#fff3e0']);
jewel('charm', 'luckyCat', 'Lucky Cat', 1, 20, 'cat', ['#fffaf2', '#e8503a', '#ffcf4a']);
jewel('charm', 'daruma', 'Daruma', 1, 28, 'daruma', ['#e8362a', '#fff3e0', '#ffcf4a']);
jewel('charm', 'magatama', 'Magatama', 2, 40, 'magatama', ['#5ac08a', '#d8a83a', '#c0ffe0']);
jewel('charm', 'moonCharm', 'Moon Charm', 2, 50, 'moon', ['#e6ecff', '#d8a83a', '#8fd0ff']);
// ---- Boots — [main, sole, accent]
armor('boots', 'booties', 'Booties', 0, 1, [1, 3], {}, 0, 'booties', ['#ff8fb0', '#ffffff', '#e86a8a']);
armor('boots', 'rainBoots', 'Rain Boots', 0, 6, [3, 6], {}, 0, 'rain', ['#ffd23a', '#e8a82a', '#ffffff']);
armor('boots', 'waraji', 'Straw Waraji', 0, 11, [5, 8], {}, 0, 'waraji', ['#e0c080', '#b89a5a', '#e8503a']);
armor('boots', 'ninjaTabi', 'Ninja Tabi', 1, 20, [10, 15], { dex: 30 }, 0, 'tabi', ['#3a3a4a', '#6a6a7a', '#e8503a']);
armor('boots', 'geta', 'Geta Clogs', 1, 27, [13, 19], { str: 35 }, 0, 'geta', ['#c98f5e', '#6b4a3a', '#e8503a']);
armor('boots', 'cloudGeta', 'Cloud Geta', 2, 42, [20, 28], { dex: 60 }, 0, 'cloud', ['#ffffff', '#8fd0ff', '#ffcf4a']);
armor('boots', 'cometSneakers', 'Comet Sneakers', 2, 50, [26, 34], { dex: 75 }, 0, 'sneaker', ['#6ac0ff', '#ffffff', '#ff8a3a']);
// ---- Paws (gloves) — [main, cuff, accent]
armor('paws', 'mittens', 'Mittens', 0, 1, [1, 3], {}, 0, 'mitten', ['#ff8a8a', '#ffffff', '#e86a6a']);
armor('paws', 'gardenGloves', 'Garden Gloves', 0, 6, [3, 6], {}, 0, 'glove', ['#7cc45a', '#fff3e0', '#f4c04a']);
armor('paws', 'ovenMitts', 'Oven Mitts', 0, 11, [5, 9], { str: 15 }, 0, 'oven', ['#ffcf4a', '#e8503a', '#fff3e0']);
armor('paws', 'tekko', 'Tekko Guards', 1, 21, [10, 15], { str: 30 }, 0, 'tekko', ['#5d6f9e', '#3a3a4a', '#d9d0c8']);
armor('paws', 'boxingPaws', 'Boxing Paws', 1, 28, [13, 19], { str: 45 }, 0, 'boxing', ['#e8362a', '#ffffff', '#b8263a']);
armor('paws', 'dragonClaws', 'Dragon Claws', 2, 43, [20, 28], { str: 60, dex: 50 }, 0, 'claw', ['#3f8f8a', '#f4c04a', '#fff3e0']);
armor('paws', 'kitsuneGauntlets', 'Kitsune Gauntlets', 2, 51, [25, 33], { dex: 80 }, 0, 'gauntlet', ['#fffaf2', '#e8503a', '#ffcf4a']);

export const GEAR_BASE_IDS = Object.keys(ITEM_BASES);

// ================================================================== treat gems
export const GEM_TIERS = ['Chipped', '', 'Perfect'];
export const GEM_TIER_LVL = [1, 12, 30];
export const GEMS = {
  ruby: { name: 'Ruby Jerky', colors: ['#e8364a', '#ff9aa8', '#8a1a2a'], weapon: { stat: 'fireDmg', v: [[2, 5], [5, 11], [10, 22]] }, armor: { stat: 'lifeMax', v: [10, 20, 35] } },
  blueberry: { name: 'Blueberry Gem', colors: ['#4a6ae8', '#a8c0ff', '#22307a'], weapon: { stat: 'frostDmg', v: [[1, 4], [4, 9], [8, 18]] }, armor: { stat: 'zoomMax', v: [10, 20, 35] } },
  lemon: { name: 'Lemon Drop', colors: ['#ffd83a', '#fff6b0', '#c89a10'], weapon: { stat: 'zapDmg', v: [[1, 8], [1, 16], [1, 32]] }, armor: { stat: 'dex', v: [3, 6, 10] } },
  cheese: { name: 'Stinky Cheese', colors: ['#ffc83a', '#fff0a0', '#b88a1a'], weapon: { stat: 'stinkDmg', v: [[2, 6], [5, 12], [10, 24]] }, armor: { stat: 'thorns', v: [4, 8, 15] } },
  diamond: { name: 'Diamond Biscuit', colors: ['#e8f4ff', '#ffffff', '#9ab8d8'], weapon: { stat: 'dmgPct', v: [8, 14, 22] }, armor: { stat: 'resAll', v: [5, 8, 12] } },
  topaz: { name: 'Honeycomb Topaz', colors: ['#ffa82a', '#ffe08a', '#b86a10'], weapon: { stat: 'gf', v: [15, 25, 40] }, armor: { stat: 'mf', v: [8, 16, 24] } },
};
export const GEM_TYPES = Object.keys(GEMS);
for (const t of GEM_TYPES) ITEM_BASES[t] = { id: t, kind: 'gem', name: GEMS[t].name, slot: null, tier: 0, lvl: 1, req: { lvl: 1 }, sockets: 0, icon: { shape: 'gem', variant: t, colors: GEMS[t].colors } };
/** Gems only socket into weapons, hats and outfits (D2 style). */
export const SOCKETABLE_SLOTS = ['weapon', 'hat', 'outfit'];

// ================================================================== stat text
const sgn = v => (v >= 0 ? '+' + v : '' + v);
const TREE_NAMES = { bone: 'Bone Arts', fetch: 'Fetch Mastery', spirit: 'Pack Spirit' };
export const STAT_TEXT = {
  str: v => `${sgn(v)} to Strength`, dex: v => `${sgn(v)} to Dexterity`, vit: v => `${sgn(v)} to Vitality`, ene: v => `${sgn(v)} to Energy`,
  lifeMax: v => `${sgn(v)} to Life`, zoomMax: v => `${sgn(v)} to Zoom`,
  lifeRegen: v => `Replenish Life ${sgn(v)} per second`, zoomRegen: v => `Regenerate Zoom ${v}%`,
  dmgMin: v => `${sgn(v)} to Minimum Damage`, dmgMax: v => `${sgn(v)} to Maximum Damage`,
  dmgPct: (v, a, it) => (it && it.slot === 'weapon' && !(a && a.gem) ? `${sgn(v)}% Enhanced Damage` : `${sgn(v)}% Damage`),
  atkSpeed: v => `${sgn(v)}% Increased Attack Speed`, castSpeed: v => `${sgn(v)}% Faster Bark Rate`, moveSpeed: v => `${sgn(v)}% Faster Zoomies (Run)`,
  crit: v => `${sgn(v)}% Critical Chomp Chance`, critDmg: v => `${sgn(v)}% Critical Chomp Damage`,
  def: (v, a) => (a && a.pct ? `${sgn(a.pct)}% Enhanced Defense` : `${sgn(v)} Defense`),
  block: v => `${sgn(v)}% Chance to Block`,
  resFire: v => `Fire Resist ${sgn(v)}%`, resFrost: v => `Frost Resist ${sgn(v)}%`, resZap: v => `Zap Resist ${sgn(v)}%`, resStink: v => `Stink Resist ${sgn(v)}%`,
  resAll: v => `All Resistances ${sgn(v)}%`,
  lifeSteal: v => `${v}% Life Stolen per Hit`, zoomSteal: v => `${v}% Zoom Stolen per Hit`,
  fireDmg: v => `Adds ${v[0]}-${v[1]} Fire Damage`, frostDmg: v => `Adds ${v[0]}-${v[1]} Frost Damage`,
  zapDmg: v => `Adds ${v[0]}-${v[1]} Zap Damage`, stinkDmg: v => `Adds ${v[0]}-${v[1]} Stink Damage`,
  mf: v => `${v}% Better Chance of Finding Magic Items`, gf: v => `${v}% Extra Coins from Yokai`,
  thorns: v => `Attackers Take ${v} Damage (Prickly!)`, allSkills: v => `${sgn(v)} to All Skills`,
  xpBonus: v => `${sgn(v)}% Experience Gained`, pierce: v => `Balls Pierce ${sgn(v)} ${Math.abs(v) === 1 ? 'Enemy' : 'Enemies'}`,
  cdr: v => `${v}% Faster Cooldowns`, lifeOnKill: v => `${sgn(v)} Life after each Kill`,
  shadowDmg: v => `Shadow Deals ${sgn(v)}% Damage`, shadowLife: v => `Shadow Gains ${sgn(v)}% Life`,
};
/** Human text for a stat/value pair (affix.text is pre-baked with this). */
export function statText(stat, value, affix, item) {
  if (stat.startsWith('treeSkills.')) return `${sgn(value)} to ${TREE_NAMES[stat.slice(11)]} Skills`;
  if (stat.startsWith('skillBonus.')) { const s = SKILLS[stat.slice(11)]; return `${sgn(value)} to ${s ? s.name : stat.slice(11)}`; }
  const f = STAT_TEXT[stat];
  return f ? f(value, affix, item) : `${stat} ${value}`;
}

// ================================================================== affixes
// Families: { id, type:'prefix'|'suffix', stat, slots, w (weight), mode?:'pct' (enhanced defense), wtype?, tiers }
// tiers: [id, name, lvl, min, max]  or for [min,max] damage stats: [id, name, lvl, [minLo,minHi], [maxLo,maxHi]]
const WEP = ['weapon'], ARM = ['hat', 'outfit', 'boots', 'paws'], JEW = ['collar', 'charm'];
const ALL = ['weapon', 'hat', 'outfit', 'collar', 'charm', 'boots', 'paws'];
const F = (id, type, stat, slots, tiers, extra = {}) => ({ id, type, stat, slots, tiers, w: 100, ...extra });
export const AFFIX_FAMILIES = [
  // ------------------------------------------------ prefixes
  F('ed', 'prefix', 'dmgPct', WEP, [['nibbly', 'Nibbly', 1, 10, 20], ['crunchy', 'Crunchy', 6, 21, 35], ['chompy', 'Chompy', 14, 36, 55], ['ferocious', 'Ferocious', 24, 56, 80], ['savage', 'Savage', 34, 81, 110], ['kaijus', "Kaiju's", 46, 111, 150]], { w: 140 }),
  F('dmgJewel', 'prefix', 'dmgPct', ['collar', 'charm', 'paws'], [['feisty', 'Feisty', 3, 5, 10], ['fierce', 'Fierce', 18, 11, 18], ['rowdy', 'Rowdy', 38, 19, 25]], { w: 70 }),
  F('maxDmg', 'prefix', 'dmgMax', ['weapon', 'collar', 'charm', 'paws'], [['pointy', 'Pointy', 1, 1, 3], ['sharp', 'Sharp', 10, 4, 8], ['serrated', 'Serrated', 24, 9, 15], ['toothsome', 'Toothsome', 40, 16, 25]]),
  F('edef', 'prefix', 'def', ARM, [['fluffy', 'Fluffy', 1, 15, 30], ['puffy', 'Puffy', 10, 31, 50], ['plush', 'Plush', 22, 51, 80], ['snuggly', 'Snuggly', 34, 81, 120], ['marshmallow', 'Marshmallow', 46, 121, 160]], { mode: 'pct', w: 140 }),
  F('flatDef', 'prefix', 'def', [...ARM, ...JEW], [['cozy', 'Cozy', 1, 3, 8], ['quilted', 'Quilted', 12, 9, 20], ['padded', 'Padded', 26, 21, 40], ['fortress', 'Fortress', 42, 41, 65]], { group: 'flatDef' }),
  F('fire', 'prefix', 'fireDmg', ['weapon', 'collar', 'charm', 'paws'], [['toasty', 'Toasty', 1, [1, 2], [3, 5]], ['spicy', 'Spicy', 12, [3, 6], [8, 14]], ['sizzling', 'Sizzling', 26, [8, 14], [18, 28]], ['volcanic', 'Volcanic', 42, [15, 25], [32, 50]]]),
  F('frost', 'prefix', 'frostDmg', ['weapon', 'collar', 'charm', 'paws'], [['chilly', 'Chilly', 1, [1, 2], [2, 4]], ['frosty', 'Frosty', 12, [3, 5], [6, 12]], ['brainFreeze', 'Brain-Freeze', 26, [7, 12], [15, 24]], ['glacial', 'Glacial', 42, [13, 22], [28, 44]]]),
  F('zap', 'prefix', 'zapDmg', ['weapon', 'collar', 'charm', 'paws'], [['staticky', 'Staticky', 1, [1, 1], [4, 7]], ['zappy', 'Zappy', 12, [1, 2], [12, 20]], ['thundering', 'Thundering', 26, [1, 4], [28, 44]], ['stormTossed', 'Storm-Tossed', 42, [2, 6], [50, 80]]]),
  F('stink', 'prefix', 'stinkDmg', ['weapon', 'collar', 'charm', 'paws'], [['whiffy', 'Whiffy', 1, [1, 3], [3, 6]], ['stinky', 'Stinky', 12, [4, 7], [9, 15]], ['pungent', 'Pungent', 26, [9, 15], [20, 30]], ['skunky', 'Skunky', 42, [16, 26], [34, 52]]]),
  F('resFire', 'prefix', 'resFire', [...ARM, ...JEW], [['heatproof', 'Heatproof', 1, 5, 10], ['fireproof', 'Fireproof', 14, 11, 20], ['lavaLicking', 'Lava-Licking', 30, 21, 30]]),
  F('resFrost', 'prefix', 'resFrost', [...ARM, ...JEW], [['woolly', 'Woolly', 1, 5, 10], ['fleecy', 'Fleecy', 14, 11, 20], ['yetis', "Yeti's", 30, 21, 30]]),
  F('resZap', 'prefix', 'resZap', [...ARM, ...JEW], [['grounded', 'Grounded', 1, 5, 10], ['rubbery', 'Rubbery', 14, 11, 20], ['lightningRod', 'Lightning-Rod', 30, 21, 30]]),
  F('resStink', 'prefix', 'resStink', [...ARM, ...JEW], [['freshened', 'Freshened', 1, 5, 10], ['minty', 'Minty', 14, 11, 20], ['lavender', 'Lavender', 30, 21, 30]]),
  F('resAll', 'prefix', 'resAll', [...ARM, ...JEW], [['sprinkled', 'Sprinkled', 8, 3, 6], ['rainbow', 'Rainbow', 24, 7, 12], ['unicorns', "Unicorn's", 44, 13, 20]], { w: 50 }),
  F('mf', 'prefix', 'mf', ALL, [['lucky', 'Lucky', 3, 5, 10], ['fourLeaf', 'Four-Leaf', 16, 11, 20], ['serendipitous', 'Serendipitous', 36, 21, 30]], { w: 70 }),
  F('gf', 'prefix', 'gf', ALL, [['shiny', 'Shiny', 1, 10, 25], ['jingly', 'Jingly', 16, 26, 50], ['piggyBank', 'Piggy-Bank', 34, 51, 80]], { w: 70 }),
  F('lifeSteal', 'prefix', 'lifeSteal', ['weapon', 'collar', 'charm', 'paws'], [['slobbery', 'Slobbery', 5, 2, 3], ['drooly', 'Drooly', 18, 4, 5], ['vampy', 'Vampy', 34, 6, 8]], { w: 60 }),
  F('zoomSteal', 'prefix', 'zoomSteal', ['weapon', 'collar', 'charm'], [['sippy', 'Sippy', 8, 2, 3], ['slurpy', 'Slurpy', 24, 4, 6]], { w: 50 }),
  F('zoomMax', 'prefix', 'zoomMax', ALL, [['zesty', 'Zesty', 1, 5, 10], ['peppy', 'Peppy', 12, 11, 20], ['hyper', 'Hyper', 28, 21, 35], ['caffeinated', 'Caffeinated', 44, 36, 50]]),
  F('treeBone', 'prefix', 'treeSkills.bone', ['weapon', 'hat', 'collar'], [['boneCrafters', "Bone-Crafter's", 8, 1, 1], ['boneSages', "Bone-Sage's", 36, 2, 2]], { w: 30, group: 'treeSkills' }),
  F('treeFetch', 'prefix', 'treeSkills.fetch', ['weapon', 'hat', 'collar'], [['fetchers', "Fetcher's", 8, 1, 1], ['fetchMasters', "Fetch-Master's", 36, 2, 2]], { w: 30, group: 'treeSkills' }),
  F('treeSpirit', 'prefix', 'treeSkills.spirit', ['weapon', 'hat', 'collar'], [['packLeaders', "Pack-Leader's", 8, 1, 1], ['alphas', "Alpha's", 36, 2, 2]], { w: 30, group: 'treeSkills' }),
  F('allSkills', 'prefix', 'allSkills', ['weapon', 'hat', 'collar'], [['goodest', 'Goodest', 30, 1, 1], ['bestest', 'Bestest', 50, 2, 2]], { w: 12, group: 'treeSkills' }),
  F('shadowDmg', 'prefix', 'shadowDmg', ['weapon', 'hat', 'collar', 'charm'], [['buddys', "Buddy's", 4, 10, 20], ['bestFriends', "Best-Friend's", 24, 21, 35]], { w: 60 }),
  // ------------------------------------------------ suffixes
  F('str', 'suffix', 'str', ALL, [['ofBulldog', 'of the Bulldog', 1, 1, 3], ['ofMastiff', 'of the Mastiff', 10, 4, 7], ['ofStBernard', 'of the St. Bernard', 24, 8, 12], ['ofKaiju', 'of the Kaiju', 42, 13, 18]]),
  F('dex', 'suffix', 'dex', ALL, [['ofFox', 'of the Fox', 1, 1, 3], ['ofGreyhound', 'of the Greyhound', 10, 4, 7], ['ofKitsune', 'of the Kitsune', 24, 8, 12], ['ofNineTails', 'of the Nine Tails', 42, 13, 18]]),
  F('vit', 'suffix', 'vit', ALL, [['ofTurtle', 'of the Turtle', 1, 1, 3], ['ofTanuki', 'of the Tanuki', 10, 4, 7], ['ofPanda', 'of the Panda', 24, 8, 12], ['ofMountain', 'of the Mountain', 42, 13, 18]]),
  F('ene', 'suffix', 'ene', ALL, [['ofOwl', 'of the Owl', 1, 1, 3], ['ofTengu', 'of the Tengu', 10, 4, 7], ['ofMoonRabbit', 'of the Moon Rabbit', 24, 8, 12], ['ofStars', 'of the Stars', 42, 13, 18]]),
  F('life', 'suffix', 'lifeMax', ALL, [['ofBellyRubs', 'of Belly Rubs', 1, 5, 10], ['ofCuddles', 'of Cuddles', 10, 11, 20], ['ofHugs', 'of Hugs', 22, 21, 35], ['ofGrandmasSoup', "of Grandma's Soup", 36, 36, 55], ['ofGreatSnuggle', 'of the Great Snuggle', 48, 56, 80]], { w: 140 }),
  F('regen', 'suffix', 'lifeRegen', [...ARM, ...JEW], [['ofNaps', 'of Naps', 3, 1, 2], ['ofLongNaps', 'of Long Naps', 18, 3, 4], ['ofHibernation', 'of Hibernation', 36, 5, 7]]),
  F('zoomRegen', 'suffix', 'zoomRegen', ALL, [['ofSnacks', 'of Snacks', 1, 10, 20], ['ofSecondBreakfast', 'of Second Breakfast', 18, 21, 40], ['ofBuffet', 'of the Buffet', 36, 41, 60]]),
  F('ias', 'suffix', 'atkSpeed', ['weapon', 'paws', 'collar', 'charm'], [['ofWagging', 'of Wagging', 1, 5, 10], ['ofWiggles', 'of Wiggles', 14, 11, 20], ['ofTailBlur', 'of the Tail Blur', 32, 21, 30]]),
  F('frw', 'suffix', 'moveSpeed', ['boots'], [['ofScampering', 'of Scampering', 1, 5, 10], ['ofZoomies', 'of Zoomies', 14, 11, 20], ['of3amZoomies', 'of the 3 A.M. Zoomies', 34, 21, 30]], { w: 180 }),
  F('frwCharm', 'suffix', 'moveSpeed', ['charm'], [['ofScurrying', 'of Scurrying', 6, 3, 6]], { w: 50 }),
  F('fcr', 'suffix', 'castSpeed', ['weapon', 'hat', 'collar', 'charm'], [['ofBarking', 'of Barking', 4, 5, 10], ['ofYapping', 'of Yapping', 20, 11, 20]]),
  F('crit', 'suffix', 'crit', ['weapon', 'paws', 'collar', 'charm', 'hat'], [['ofPouncing', 'of Pouncing', 2, 2, 4], ['ofHunt', 'of the Hunt', 16, 5, 7], ['ofWolf', 'of the Wolf', 32, 8, 10]]),
  F('critDmg', 'suffix', 'critDmg', ['weapon', 'paws', 'collar', 'charm'], [['ofFerocity', 'of Ferocity', 8, 10, 20], ['ofAlpha', 'of the Alpha', 24, 21, 35], ['ofMightyChomps', 'of Mighty Chomps', 40, 36, 50]]),
  F('thorns', 'suffix', 'thorns', ['hat', 'outfit', 'boots', 'paws'], [['ofPrickles', 'of Prickles', 1, 2, 5], ['ofHedgehog', 'of the Hedgehog', 14, 6, 12], ['ofPufferfish', 'of the Pufferfish', 32, 13, 25]]),
  F('block', 'suffix', 'block', ['outfit', 'paws'], [['ofHiding', 'of Hiding', 4, 3, 6], ['ofPillowFort', 'of the Pillow Fort', 20, 7, 12]], { w: 60 }),
  F('lok', 'suffix', 'lifeOnKill', ['weapon', 'collar', 'charm', 'paws'], [['ofTreats', 'of Treats', 1, 1, 3], ['ofBacon', 'of Bacon', 20, 4, 7], ['ofFeast', 'of the Feast', 38, 8, 12]]),
  F('pierce', 'suffix', 'pierce', WEP, [['ofPiercing', 'of Piercing', 8, 1, 1], ['ofSkewering', 'of Skewering', 30, 2, 2]], { w: 50, wtype: 'ball' }),
  F('cdr', 'suffix', 'cdr', ['hat', 'collar', 'charm'], [['ofPatience', 'of Patience', 10, 3, 6], ['ofZen', 'of Zen', 30, 7, 12]], { w: 40 }),
  F('shadowLife', 'suffix', 'shadowLife', ['collar', 'hat', 'outfit', 'charm'], [['ofFriendship', 'of Friendship', 4, 10, 20], ['ofLoyalty', 'of Loyalty', 24, 21, 35]], { w: 60 }),
  F('xp', 'suffix', 'xpBonus', ['collar', 'charm', 'hat'], [['ofLearning', 'of Learning', 6, 2, 4], ['ofWisdom', 'of Wisdom', 30, 5, 8]], { w: 40 }),
  F('minDmg', 'suffix', 'dmgMin', ['weapon', 'collar', 'charm', 'paws'], [['ofNibbling', 'of Nibbling', 1, 1, 2], ['ofGnawing', 'of Gnawing', 12, 3, 6], ['ofCrunching', 'of Crunching', 30, 7, 12]]),
];
for (const f of AFFIX_FAMILIES) f.group = f.group || f.stat + (f.mode ? ':' + f.mode : '');
/** Flat list of every named affix tier (for tests / wiki). */
export const AFFIXES = AFFIX_FAMILIES.flatMap(f => f.tiers.map(t => ({ id: t[0], name: t[1], lvl: t[2], family: f.id, type: f.type, stat: f.stat, slots: f.slots })));

// ================================================================== uniques
// stats: [stat, min, max] | [stat, [minLo,minHi], [maxLo,maxHi]] (damage ranges) | ['edef', min, max] (enhanced defense %)
const UQ = (id, name, base, lvl, stats, flavor, extra = {}) => ({ id, name, base, lvl, stats, flavor, w: 1, ...extra });
export const UNIQUES = Object.fromEntries([
  // bone swords
  UQ('grandpasStick', "Grandpa's Old Stick", 'chewStick', 5, [['dmgPct', 60, 90], ['treeSkills.bone', 1, 1], ['str', 4, 6], ['lifeOnKill', 2, 3]], 'It has been fetched ten thousand times.'),
  UQ('ribTickler', 'The Rib-Tickler', 'ribSabre', 9, [['dmgPct', 70, 100], ['atkSpeed', 20, 20], ['crit', 5, 7], ['gf', 25, 40]], 'Hehehe. Hehehehe. HEHEHE.'),
  UQ('couchLeg', 'The Couch Leg', 'crunchyFemur', 14, [['dmgPct', 90, 130], ['dmgMax', 5, 8], ['lifeSteal', 4, 5], ['str', 8, 8]], 'Mom noticed. Mom was not amused.', { colors: ['#b8743a', '#6b4a3a', '#e8c89a'] }),
  UQ('sundayRoast', 'The Sunday Roast', 'dinoBoneBlade', 23, [['dmgPct', 120, 160], ['fireDmg', [8, 12], [20, 28]], ['lifeSteal', 5, 6], ['lifeMax', 25, 35]], 'Still warm. Still delicious.', { colors: ['#f1d2a2', '#8a2a2a', '#ff8a3a'] }),
  UQ('sharkyMcChompface', 'Sharky McChompface', 'sharkToothSaber', 28, [['dmgPct', 140, 180], ['crit', 8, 10], ['critDmg', 30, 40], ['atkSpeed', 20, 20]], 'Just when you thought it was safe to go back in the bath.'),
  UQ('moonfang', 'Moonfang', 'moonboneKatana', 44, [['dmgPct', 180, 230], ['frostDmg', [18, 26], [40, 55]], ['zapDmg', [1, 3], [60, 90]], ['crit', 8, 10], ['allSkills', 1, 1]], 'Forged from a bone buried under a full moon.', { w: 0.6, colors: ['#dfe8ff', '#1e2448', '#b8a0ff'] }),
  UQ('kaijuWishbone', "Kaiju's Wishbone", 'kaijuFemur', 52, [['dmgPct', 220, 280], ['str', 15, 20], ['treeSkills.bone', 2, 2], ['critDmg', 40, 60], ['lifeOnKill', 10, 10]], 'Make a wish. Then smash.', { w: 0.5 }),
  // balls
  UQ('mrSqueakers', 'Mr. Squeakers', 'squeakyBall', 7, [['dmgPct', 80, 110], ['zapDmg', [1, 1], [14, 20]], ['castSpeed', 20, 20], ['pierce', 1, 1]], 'SQUEAK. SQUEAK. SQUEAK. SQUEAK.', { colors: ['#ffe070', '#ff8fb0', '#ff6a8a'] }),
  UQ('lastTennisBall', 'The Last Tennis Ball', 'bouncyBall', 15, [['dmgPct', 100, 140], ['pierce', 2, 2], ['mf', 25, 40], ['treeSkills.fetch', 1, 1], ['lifeOnKill', 3, 3]], 'Never lost. Always returns. Somehow.', { variant: 'tennis', colors: ['#d4f05a', '#ffffff', '#ffcf4a'] }),
  UQ('yarnOfFate', 'Yarn of Fate', 'yarnBall', 16, [['dmgPct', 90, 120], ['frostDmg', [3, 5], [9, 14]], ['cdr', 8, 8], ['zoomMax', 20, 30]], 'A cat left it here. It is ours now.', { colors: ['#ff6a8a', '#c8365a', '#ffe070'] }),
  UQ('neighboursBall', "The Neighbour's Ball", 'spikyBall', 24, [['dmgPct', 130, 170], ['gf', 50, 80], ['stinkDmg', [8, 12], [20, 30]], ['dex', 10, 10]], 'Finders keepers. That is the law.'),
  UQ('slobberComet', 'Slobber Comet', 'cometBall', 43, [['dmgPct', 170, 220], ['fireDmg', [15, 22], [35, 50]], ['lifeSteal', 5, 7], ['atkSpeed', 20, 20]], 'Launched at 88 mph. Returned considerably wetter.', { w: 0.7 }),
  UQ('universeSqueak', 'The Squeak Heard Round the Universe', 'supernovaBall', 56, [['allSkills', 2, 2], ['dmgPct', 200, 260], ['fireDmg', [20, 30], [45, 60]], ['zapDmg', [1, 5], [80, 120]], ['pierce', 2, 2]], 'The squeak that ended a galaxy.', { w: 0.4 }),
  // hats
  UQ('rosiesRibbon', "Rosie's Hair Ribbon", 'bandana', 6, [['allSkills', 1, 1], ['mf', 20, 30], ['lifeMax', 15, 20], ['lifeRegen', 2, 2]], '"For luck, Chewy!"', { variant: 'ribbon', colors: ['#ff6a9a', '#ffffff', '#e8365a'] }),
  UQ('shadowsBand', "Shadow's Bat-Ear Band", 'knitBeanie', 14, [['skillBonus.packcall', 3, 3], ['shadowDmg', 30, 50], ['shadowLife', 30, 50], ['resAll', 10, 10]], 'Boston terrier approved. Ears not included. Wait, they are.', { variant: 'batears', colors: ['#2b2632', '#6ac0ff', '#ffffff'] }),
  UQ('coneOfShame', 'The Cone of Shame', 'kasa', 20, [['edef', 100, 140], ['resAll', 20, 30], ['thorns', 15, 20], ['lifeRegen', 4, 5], ['moveSpeed', -10, -10]], 'You know what you did.', { variant: 'cone', colors: ['#f4f8ff', '#a8c0e0', '#6ea8ff'] }),
  UQ('foxfireMask', 'Foxfire Mask', 'kitsuneMask', 30, [['treeSkills.spirit', 2, 2], ['castSpeed', 20, 20], ['resFire', 25, 35], ['zoomMax', 30, 40]], 'Nine tails of trickery, one tail of wag.', { colors: ['#fffaf2', '#6a4ae8', '#8fd0ff'] }),
  UQ('shogunSnackHelm', "Shogun's Snack Helm", 'shogunKabuto', 46, [['treeSkills.bone', 2, 2], ['lifeMax', 50, 70], ['edef', 120, 160], ['crit', 5, 5], ['lifeOnKill', 6, 6]], 'Holds three rice balls. For emergencies.', { w: 0.6 }),
  // outfits
  UQ('bathTowelCape', 'The Bath Towel Cape', 'rainPoncho', 10, [['resAll', 12, 18], ['moveSpeed', 15, 15], ['dex', 6, 8], ['zoomRegen', 20, 20]], 'Escaped bath time. Wears the evidence.', { colors: ['#8fd0ff', '#ffffff', '#5aa8ff'] }),
  UQ('couchCushion', 'Couch Cushion Armor', 'gi', 13, [['lifeMax', 60, 80], ['edef', 100, 140], ['thorns', 10, 14], ['lifeRegen', 3, 4], ['moveSpeed', -10, -10]], 'Comfier than it looks.', { colors: ['#c8a078', '#8a5a3a', '#f2d2a0'] }),
  UQ('dragonDance', 'Dragon Dance Kimono', 'dragonKimono', 48, [['str', 10, 10], ['dex', 10, 10], ['vit', 10, 10], ['resFire', 30, 30], ['allSkills', 1, 1], ['edef', 100, 150]], 'Worn for exactly one festival. Legendary.', { w: 0.6 }),
  // collars
  UQ('grandmasCollar', "Grandma's Knitted Collar", 'leatherCollar', 10, [['lifeMax', 30, 40], ['resFrost', 25, 35], ['lifeRegen', 3, 3], ['xpBonus', 5, 5]], 'A little lumpy. Made with love.', { colors: ['#e86a8a', '#ffcf4a', '#ffffff'] }),
  UQ('mailmansNightmare', "Mailman's Nightmare", 'bellCollar', 18, [['dmgPct', 20, 30], ['castSpeed', 20, 20], ['critDmg', 20, 30], ['lifeMax', 25, 25]], 'The bark heard round the neighbourhood.', { colors: ['#3a3a4a', '#ffcf4a', '#e8503a'] }),
  UQ('goodestTag', "The Goodest Boy's Tag", 'starCollar', 42, [['allSkills', 2, 2], ['resAll', 20, 25], ['lifeMax', 50, 60], ['xpBonus', 10, 10]], "Who's a good boy? You are.", { w: 0.5, colors: ['#e8475c', '#ffcf4a', '#ffffff'] }),
  // charms
  UQ('baconCharm', 'Bacon Charm', 'omamori', 4, [['lifeSteal', 4, 6], ['vit', 6, 8], ['lifeOnKill', 4, 5]], 'Smells incredible. Do not eat.', { colors: ['#e86a5a', '#ffcf4a', '#ffd0b0'] }),
  UQ('sockThief', "The Sock Thief's Omamori", 'pawCharm', 12, [['mf', 30, 45], ['gf', 50, 70], ['dex', 5, 8]], 'Only ever takes left socks.', { colors: ['#6ea8ff', '#d8a83a', '#fff3e0'] }),
  UQ('borrowedCat', 'The Borrowed Lucky Cat', 'luckyCat', 26, [['mf', 20, 30], ['crit', 4, 6], ['lifeMax', 25, 35], ['gf', 40, 40]], 'Borrowed from the cat next door. Permanently.', { colors: ['#2b2632', '#ffcf4a', '#e8503a'] }),
  UQ('darumaPersist', 'Daruma of Persistence', 'daruma', 34, [['cdr', 10, 15], ['lifeRegen', 6, 8], ['resAll', 10, 15]], 'Falls down seven times, gets up eight.'),
  // boots
  UQ('muddyPaws', 'Muddy Paws', 'rainBoots', 9, [['moveSpeed', 25, 30], ['dex', 8, 10], ['resStink', 20, 30], ['edef', 40, 60]], 'Absolutely not allowed on the couch.', { colors: ['#8a5a36', '#5a3a1e', '#c98f5e'] }),
  UQ('zoomiesIncarnate', 'Zoomies Incarnate', 'geta', 32, [['moveSpeed', 35, 40], ['atkSpeed', 15, 20], ['zoomMax', 30, 40], ['dex', 12, 15]], '3 a.m. energy, bottled.', { colors: ['#ffcf4a', '#e8503a', '#fff3a0'] }),
  // paws
  UQ('bellyRubMittens', 'Belly-Rub Mittens', 'mittens', 3, [['lifeRegen', 1, 2], ['lifeMax', 10, 15], ['shadowLife', 15, 20]], 'Irresistible. Scientifically.', { colors: ['#ffbcd6', '#ffffff', '#ff8fb0'] }),
  UQ('ovenMittsOfLegend', 'Oven Mitts of Legend', 'ovenMitts', 14, [['fireDmg', [4, 6], [10, 14]], ['resFire', 25, 35], ['atkSpeed', 10, 10], ['lifeMax', 15, 20]], 'Can hold anything hot. Including grudges.'),
  UQ('kitsunesGrasp', "Kitsune's Grasp", 'kitsuneGauntlets', 53, [['crit', 8, 10], ['critDmg', 30, 50], ['dex', 15, 20], ['treeSkills.fetch', 2, 2]], 'Sly fingers, sly fox.', { w: 0.5 }),
].map(u => [u.id, u]));
export const UNIQUE_IDS = Object.keys(UNIQUES);

// ================================================================== sets
export const SETS = {
  goodBoy: {
    id: 'goodBoy', name: "Good Boy's Regalia", pieces: ['gbPartyHat', 'gbNameTag', 'gbSweater', 'gbBooties'],
    bonuses: [
      { n: 2, stats: [{ stat: 'lifeMax', value: 30 }] },
      { n: 3, stats: [{ stat: 'resAll', value: 15 }] },
      { n: 'full', stats: [{ stat: 'allSkills', value: 1 }, { stat: 'mf', value: 50 }, { stat: 'xpBonus', value: 5 }] },
    ],
  },
  moonlitRonin: {
    id: 'moonlitRonin', name: 'Moonlit Ronin', pieces: ['ronBlade', 'ronKasa', 'ronHaori', 'ronTekko', 'ronWaraji'],
    bonuses: [
      { n: 2, stats: [{ stat: 'crit', value: 5 }] },
      { n: 3, stats: [{ stat: 'atkSpeed', value: 20 }] },
      { n: 4, stats: [{ stat: 'treeSkills.bone', value: 2 }] },
      { n: 'full', stats: [{ stat: 'critDmg', value: 50 }, { stat: 'dmgPct', value: 60 }, { stat: 'lifeSteal', value: 5 }, { stat: 'resAll', value: 20 }] },
    ],
  },
  picnic: {
    id: 'picnic', name: 'Picnic Party', pieces: ['picBall', 'picOnigiri', 'picMittens'],
    bonuses: [
      { n: 2, stats: [{ stat: 'gf', value: 40 }, { stat: 'lifeRegen', value: 3 }] },
      { n: 'full', stats: [{ stat: 'lifeMax', value: 40 }, { stat: 'moveSpeed', value: 15 }, { stat: 'treeSkills.fetch', value: 1 }, { stat: 'mf', value: 25 }] },
    ],
  },
};
const SP = (id, setId, name, base, lvl, stats, extra = {}) => ({ id, setId, name, base, lvl, stats, ...extra });
export const SET_ITEMS = Object.fromEntries([
  SP('gbPartyHat', 'goodBoy', "Good Boy's Party Hat", 'knitBeanie', 18, [['lifeMax', 25, 25], ['mf', 15, 15], ['edef', 60, 60]], { variant: 'party', colors: ['#5aa8ff', '#ffcf4a', '#ff8fb0'] }),
  SP('gbNameTag', 'goodBoy', "Good Boy's Name Tag", 'bellCollar', 20, [['resAll', 10, 10], ['lifeRegen', 3, 3], ['shadowDmg', 20, 20]], { colors: ['#5aa8ff', '#ffcf4a', '#2f4a7a'] }),
  SP('gbSweater', 'goodBoy', "Good Boy's Sweater", 'knitSweater', 22, [['edef', 80, 80], ['vit', 10, 10], ['resFrost', 20, 20]], { colors: ['#5aa8ff', '#ffffff', '#ffcf4a'] }),
  SP('gbBooties', 'goodBoy', "Good Boy's Booties", 'rainBoots', 18, [['moveSpeed', 20, 20], ['resStink', 20, 20], ['edef', 50, 50]], { colors: ['#5aa8ff', '#2f4a7a', '#ffcf4a'] }),
  SP('ronBlade', 'moonlitRonin', "Ronin's Moonlit Blade", 'moonboneKatana', 44, [['dmgPct', 150, 150], ['frostDmg', [12, 12], [34, 34]], ['crit', 5, 5]], { colors: ['#e6f0ff', '#1e2448', '#c9b8ff'] }),
  SP('ronKasa', 'moonlitRonin', "Ronin's Straw Kasa", 'kasa', 46, [['def', 60, 60], ['dex', 15, 15], ['resFrost', 25, 25]], { colors: ['#c8b088', '#2c3a6a', '#8fd0ff'] }),
  SP('ronHaori', 'moonlitRonin', "Ronin's Moonlit Haori", 'dragonKimono', 48, [['edef', 120, 120], ['lifeMax', 50, 50], ['thorns', 15, 15]], { colors: ['#2c3a6a', '#d9e2ff', '#8fd0ff'] }),
  SP('ronTekko', 'moonlitRonin', "Ronin's Tekko", 'tekko', 45, [['atkSpeed', 20, 20], ['lifeSteal', 4, 4], ['edef', 80, 80]], { colors: ['#2c3a6a', '#1e1c24', '#d9e2ff'] }),
  SP('ronWaraji', 'moonlitRonin', "Ronin's Waraji", 'waraji', 44, [['moveSpeed', 30, 30], ['resFrost', 30, 30], ['def', 30, 30]], { colors: ['#c8b088', '#8a7a5a', '#2c3a6a'] }),
  SP('picBall', 'picnic', 'Picnic Squeaky', 'squeakyBall', 6, [['dmgPct', 60, 80], ['gf', 30, 30], ['lifeOnKill', 2, 2]], { colors: ['#ff6a5a', '#ffffff', '#ffcf4a'] }),
  SP('picOnigiri', 'picnic', 'Onigiri Omamori', 'omamori', 8, [['lifeMax', 20, 20], ['lifeRegen', 2, 2], ['vit', 4, 4]], { variant: 'onigiri', colors: ['#ffffff', '#2c3a2a', '#e8503a'] }),
  SP('picMittens', 'picnic', 'Picnic Mittens', 'gardenGloves', 7, [['atkSpeed', 10, 10], ['dex', 5, 5], ['edef', 50, 50]], { colors: ['#ff6a5a', '#ffffff', '#ffcf4a'] }),
].map(s => [s.id, s]));
export const SET_ITEM_IDS = Object.keys(SET_ITEMS);

// ================================================================== generation
const SLOT_WEIGHT = { weapon: 1.5, hat: 1, outfit: 1, boots: 0.9, paws: 0.9, collar: 0.45, charm: 0.65 };

/** Pick a base appropriate for ilvl (newer bases are likelier). */
export function pickBase(ilvl, slot, wtype, rng) {
  rng = toRng(rng);
  let slots = slot ? [slot] : SLOTS;
  const byslot = s => GEAR_BASE_IDS.map(id => ITEM_BASES[id]).filter(b => b.slot === s && b.lvl <= Math.max(1, ilvl) && (!wtype || b.wtype === wtype));
  slots = slots.filter(s => byslot(s).length);
  if (!slots.length) return ITEM_BASES[wtype === 'ball' ? 'redTennisBall' : 'boneSword'];
  const s = rng.weighted(slots.map(x => ({ x, w: SLOT_WEIGHT[x] || 1 }))).x;
  const cands = byslot(s).map(b => ({ b, w: 1 / (1 + Math.max(0, ilvl - b.lvl) / 8) }));
  return rng.weighted(cands).b;
}

/** D2-style rarity roll with diminishing magic find. rank: normal | champion | unique | boss */
export const RARITY_CHANCE = {
  normal: { unique: 0.010, set: 0.012, rare: 0.06, magic: 0.30 },
  champion: { unique: 0.020, set: 0.024, rare: 0.12, magic: 0.45 },
  unique: { unique: 0.035, set: 0.040, rare: 0.20, magic: 0.55 },
  boss: { unique: 0.080, set: 0.080, rare: 1.0, magic: 1.0 },
  chest: { unique: 0.015, set: 0.018, rare: 0.10, magic: 0.40 },
};
export const effectiveMF = mf => ({
  unique: (mf * 250) / (mf + 250), set: (mf * 500) / (mf + 500), rare: (mf * 600) / (mf + 600), magic: mf,
});
export function rollRarity(ilvl, mf = 0, rank = 'normal', rng) {
  rng = toRng(rng);
  const C = RARITY_CHANCE[rank] || RARITY_CHANCE.normal;
  const e = effectiveMF(Math.max(0, mf));
  const lvlK = 1 + Math.min(0.5, ilvl / 120); // deeper = slightly luckier
  if (rng.next() < C.unique * (1 + e.unique / 100) * lvlK) return 'unique';
  if (rng.next() < C.set * (1 + e.set / 100) * lvlK) return 'set';
  if (rng.next() < C.rare * (1 + e.rare / 100) * lvlK) return 'rare';
  if (rng.next() < C.magic * (1 + e.magic / 100)) return 'magic';
  return 'normal';
}

function rollTierValue(tier, rng) {
  if (Array.isArray(tier[3])) {
    const a = ri(rng, tier[3][0], tier[3][1]);
    return [a, Math.max(a + 1, ri(rng, tier[4][0], tier[4][1]))];
  }
  return ri(rng, tier[3], tier[4]);
}
function affixFromFamily(f, ilvl, item, rng) {
  const elig = f.tiers.filter(t => t[2] <= ilvl);
  if (!elig.length) return null;
  const tier = rng.weighted(elig.map((t, i) => ({ t, w: Math.pow(i + 1, 1.5) }))).t;
  const v = rollTierValue(tier, rng);
  const a = { id: tier[0], stat: f.stat, value: v, name: tier[1], type: f.type, lvl: tier[2] };
  if (f.mode === 'pct') { a.pct = v; a.value = Math.max(1, Math.round(((item.def || 1) * v) / 100)); }
  a.text = statText(a.stat, a.value, a, item);
  return a;
}
function eligibleFamilies(type, item, ilvl, used) {
  return AFFIX_FAMILIES.filter(f => f.type === type && f.slots.includes(item.slot) && !used.has(f.group) && f.tiers[0][2] <= ilvl && (!f.wtype || f.wtype === item.wtype));
}
function addRandomAffix(type, item, ilvl, used, rng) {
  const fams = eligibleFamilies(type, item, ilvl, used);
  if (!fams.length) return null;
  const f = rng.weighted(fams);
  used.add(f.group);
  const a = affixFromFamily(f, ilvl, item, rng);
  if (a) item.affixes.push(a);
  return a;
}

const RARE_A = ['Biscuit', 'Mochi', 'Grumble', 'Snuggle', 'Moon', 'Thunder', 'Bramble', 'Sunny', 'Shadow', 'Storm', 'Velvet', 'Crimson', 'Howl', 'Pudding',
  'Doom', 'Sprinkle', 'Wiggle', 'Maple', 'Tofu', 'Pickle', 'Noodle', 'Soot', 'Blossom', 'Pumpkin', 'Honey', 'Fuzz', 'Grim', 'Dango', 'Yuzu', 'Wasabi', 'Chaos', 'Nibble'];
const RARE_B = {
  sword: ['Chomper', 'Fang', 'Gnaw', 'Bonker', 'Cleaver', 'Tooth', 'Crunch', 'Snapper'],
  ball: ['Fetch', 'Bounce', 'Orb', 'Comet', 'Squeak', 'Sphere', 'Boing', 'Zoomer'],
  hat: ['Crown', 'Topper', 'Brow', 'Visage', 'Hood', 'Cap'], outfit: ['Coat', 'Shell', 'Wrap', 'Cozy', 'Robe', 'Hide'],
  collar: ['Chime', 'Loop', 'Promise', 'Tag', 'Choker', 'Ring'], charm: ['Trinket', 'Token', 'Wish', 'Spark', 'Knot', 'Omen'],
  boots: ['Stride', 'Tread', 'Pounce', 'Scamper', 'Trot', 'Hop'], paws: ['Grip', 'Swipe', 'Mitt', 'Clutch', 'Paw', 'Knuckle'],
};
/** Random rare name, e.g. "Biscuit Chomper". slot may be 'sword'|'ball' for weapons. */
export function rareName(rng, slot = 'charm') {
  rng = toRng(rng);
  const list = RARE_B[slot] || RARE_B.charm;
  return rng.pick(RARE_A) + ' ' + rng.pick(list);
}

function blankItem(base, rarity, ilvl, rng) {
  const it = {
    uid: newUid(), kind: 'gear', base: base.id, slot: base.slot, rarity, name: base.name, ilvl, tier: base.tier,
    req: { lvl: base.req.lvl }, affixes: [], sockets: 0, gems: [], value: 0,
    icon: { shape: base.icon.shape, variant: base.icon.variant, colors: base.icon.colors.slice() },
  };
  if (base.req.str) it.req.str = base.req.str;
  if (base.req.dex) it.req.dex = base.req.dex;
  if (base.wtype) { it.wtype = base.wtype; it.dmg = base.dmg.slice(); it.aspd = base.aspd; }
  if (base.def) it.def = ri(rng, base.def[0], base.def[1]);
  return it;
}
function finalize(it) {
  for (const a of it.affixes) if (a.lvl) it.req.lvl = Math.max(it.req.lvl, Math.max(1, Math.round(a.lvl * 0.85)));
  it.req.lvl = Math.min(it.req.lvl, 60);
  it.value = itemValue(it);
  return it;
}
function rollSockets(it, base, rng) {
  if (!base.sockets) return;
  const max = base.sockets;
  if (it.rarity === 'normal' && rng.chance(0.28)) it.sockets = ri(rng, 1, max);
  else if (it.rarity === 'magic' && rng.chance(0.12)) it.sockets = ri(rng, 1, Math.min(2, max));
  else if (it.rarity === 'rare' && rng.chance(0.05)) it.sockets = 1;
}

/**
 * Generate a random item. o = { ilvl, rarity?, slot?, wtype?, base?, mf?, rank?, rng? }
 * Unique/set rarities fall back to rare when nothing fits (D2 style). Collars/charms are never normal.
 */
export function generateItem(o = {}) {
  const rng = toRng(o.rng);
  const ilvl = clamp(Math.round(o.ilvl || 1), 1, 99);
  let rarity = o.rarity || rollRarity(ilvl, o.mf || 0, o.rank || 'normal', rng);
  if (rarity === 'unique' || rarity === 'set') {
    const pool = rarity === 'unique'
      ? UNIQUE_IDS.map(id => UNIQUES[id]).filter(u => u.lvl <= ilvl + 2)
      : SET_ITEM_IDS.map(id => SET_ITEMS[id]).filter(s => s.lvl <= ilvl + 2);
    const fit = pool.filter(u => { const b = ITEM_BASES[u.base]; return (!o.base || u.base === o.base) && (!o.slot || b.slot === o.slot) && (!o.wtype || b.wtype === o.wtype); });
    if (fit.length) {
      const pickU = rng.weighted(fit.map(u => ({ u, w: u.w || 1 }))).u;
      return rarity === 'unique' ? makeUnique(pickU.id, ilvl, rng) : makeSetItem(pickU.id, rng, ilvl);
    }
    rarity = 'rare';
  }
  const base = o.base ? ITEM_BASES[o.base] : pickBase(ilvl, o.slot, o.wtype, rng);
  if (!base || base.kind !== 'gear') throw new Error('generateItem: bad base ' + o.base);
  if (rarity === 'normal' && (base.slot === 'collar' || base.slot === 'charm')) rarity = 'magic';
  const it = blankItem(base, rarity, ilvl, rng);
  const used = new Set();
  if (rarity === 'magic') {
    const r = rng.next();
    const pre = r < 0.65 ? addRandomAffix('prefix', it, ilvl, used, rng) : null;
    const suf = r > 0.35 || !pre ? addRandomAffix('suffix', it, ilvl, used, rng) : null;
    it.name = (pre ? pre.name + ' ' : '') + base.name + (suf ? ' ' + suf.name : '');
  } else if (rarity === 'rare') {
    const n = ilvl < 15 ? ri(rng, 3, 4) : ilvl < 35 ? ri(rng, 3, 5) : ri(rng, 4, 6);
    const cnt = { prefix: 0, suffix: 0 };
    for (let i = 0; i < n; i++) {
      const type = cnt.prefix >= 3 ? 'suffix' : cnt.suffix >= 3 ? 'prefix' : rng.chance(0.5) ? 'prefix' : 'suffix';
      const other = type === 'prefix' ? 'suffix' : 'prefix';
      const a = addRandomAffix(type, it, ilvl, used, rng) || (cnt[other] < 3 ? addRandomAffix(other, it, ilvl, used, rng) : null);
      if (!a) break;
      cnt[a.type]++;
    }
    it.name = rareName(rng, base.wtype || base.slot);
  }
  rollSockets(it, base, rng);
  return finalize(it);
}

function fixedStatAffix(spec, item, rng, idPrefix) {
  const [stat, a, b] = spec;
  let aff;
  if (stat === 'edef') {
    const pct = ri(rng, a, b);
    aff = { id: idPrefix + ':edef', stat: 'def', value: Math.max(1, Math.round(((item.def || 1) * pct) / 100)), pct };
  } else if (Array.isArray(a)) {
    const lo = ri(rng, a[0], a[1]);
    aff = { id: idPrefix + ':' + stat, stat, value: [lo, Math.max(lo + 1, ri(rng, b[0], b[1]))] };
  } else {
    aff = { id: idPrefix + ':' + stat, stat, value: ri(rng, Math.min(a, b), Math.max(a, b)) };
  }
  aff.text = statText(aff.stat, aff.value, aff, item);
  return aff;
}

/** Build a unique by id. */
export function makeUnique(id, ilvl, rng) {
  rng = toRng(rng);
  const u = UNIQUES[id];
  if (!u) throw new Error('makeUnique: unknown ' + id);
  const base = ITEM_BASES[u.base];
  const it = blankItem(base, 'unique', Math.max(ilvl || u.lvl, u.lvl), rng);
  it.name = u.name;
  it.uniqueId = id;
  it.flavor = u.flavor;
  it.req.lvl = Math.max(it.req.lvl, u.lvl);
  if (u.colors) it.icon.colors = u.colors.slice();
  if (u.variant) it.icon.variant = u.variant;
  for (const s of u.stats) it.affixes.push(fixedStatAffix(s, it, rng, id));
  it.value = itemValue(it);
  return it;
}

/** Build a set piece by its piece id (e.g. 'gbPartyHat'). */
export function makeSetItem(id, rng, ilvl) {
  rng = toRng(rng);
  const s = SET_ITEMS[id];
  if (!s) throw new Error('makeSetItem: unknown ' + id);
  const base = ITEM_BASES[s.base];
  const it = blankItem(base, 'set', Math.max(ilvl || s.lvl, s.lvl), rng);
  it.name = s.name;
  it.setId = s.setId;
  it.setPiece = id;
  it.flavor = SETS[s.setId].name;
  it.req.lvl = Math.max(it.req.lvl, s.lvl);
  if (s.colors) it.icon.colors = s.colors.slice();
  if (s.variant) it.icon.variant = s.variant;
  for (const st of s.stats) it.affixes.push(fixedStatAffix(st, it, rng, id));
  it.value = itemValue(it);
  return it;
}

/** A treat gem. type: ruby|blueberry|lemon|cheese|diamond|topaz, tier 0 chipped / 1 normal / 2 perfect. */
export function makeGem(type, tier = 0) {
  const g = GEMS[type];
  if (!g) throw new Error('makeGem: unknown ' + type);
  tier = clamp(tier | 0, 0, 2);
  const it = {
    uid: newUid(), kind: 'gem', base: type, slot: null, rarity: 'normal', name: (GEM_TIERS[tier] ? GEM_TIERS[tier] + ' ' : '') + g.name,
    ilvl: GEM_TIER_LVL[tier], req: { lvl: GEM_TIER_LVL[tier] }, affixes: [], sockets: 0, gems: [], qty: 1, value: 0,
    gemType: type, gemTier: tier, stack: true, icon: { shape: 'gem', variant: type, colors: g.colors.slice(), tier },
  };
  it.value = itemValue(it);
  return it;
}
/** The mod a gem grants in a given item slot. */
export function gemEffect(type, tier, slot) {
  const g = GEMS[type];
  const e = slot === 'weapon' ? g.weapon : g.armor;
  const v = e.v[tier];
  return { stat: e.stat, value: Array.isArray(v) ? v.slice() : v };
}
/** Socket a gem into gear (mutates item). Consumes nothing — the caller removes one gem from its stack. → {ok, why} */
export function socketGem(item, gem) {
  if (!item || item.kind !== 'gear') return { ok: false, why: 'Only gear has sockets' };
  if (!gem || gem.kind !== 'gem') return { ok: false, why: 'That is not a gem' };
  if (!item.sockets) return { ok: false, why: 'No sockets' };
  if ((item.gems || []).length >= item.sockets) return { ok: false, why: 'All sockets are full' };
  const e = gemEffect(gem.gemType, gem.gemTier, item.slot);
  item.gems = item.gems || [];
  item.gems.push({ type: gem.gemType, tier: gem.gemTier, name: gem.name });
  const a = { id: 'gem:' + gem.gemType, stat: e.stat, value: e.value, gem: true };
  a.text = statText(a.stat, a.value, a, item);
  item.affixes.push(a);
  item.value = itemValue(item);
  return { ok: true, why: '' };
}

/** Starter kit: a plain Bone Sword and Red Tennis Ball. → { sword, ball } */
export function starterItems() {
  const rng = toRng(new RNG(7));
  const sword = blankItem(ITEM_BASES.boneSword, 'normal', 1, rng);
  const ball = blankItem(ITEM_BASES.redTennisBall, 'normal', 1, rng);
  finalize(sword); finalize(ball);
  return { sword, ball };
}

// ================================================================== value / shop
const RAR_MUL = { normal: 1, magic: 2.2, rare: 4.5, set: 8, unique: 10 };
/** Sell value in coins. (Shops sell at roughly 3.5x.) */
export function itemValue(it) {
  if (!it) return 0;
  if (it.kind === 'gem') return [12, 45, 160][it.gemTier || 0];
  if (it.kind !== 'gear') return it.value || 1;
  const b = ITEM_BASES[it.base] || { lvl: 1, tier: 0 };
  let v = (4 + b.lvl * 1.6 + b.tier * 10) * (RAR_MUL[it.rarity] || 1);
  v += it.affixes.filter(a => !a.gem).length * 3 * (1 + (it.ilvl || 1) / 20);
  v += (it.sockets || 0) * 5 + (it.gems || []).length * 10;
  return Math.max(1, Math.round(v));
}
export const buyPrice = it => (it.kind === 'potion' ? POTIONS[it.key].price : Math.round(itemValue(it) * 3.5 + 5));

/** Rosie's shop stock for a player level and a seed (e.g. the day number). Every item has .price. */
export function shopStock(lvl, seed = 1) {
  const rng = toRng(new RNG(((seed | 0) * 7919 + (lvl | 0) * 104729) >>> 0 || 1));
  const out = [];
  const ilvl = () => clamp(lvl + rng.int(-2, 3), 1, 60);
  const add = it => { it.price = buyPrice(it); out.push(it); };
  add(generateItem({ ilvl: ilvl(), slot: 'weapon', wtype: 'sword', rarity: rng.chance(0.5) ? 'magic' : 'normal', rng }));
  add(generateItem({ ilvl: ilvl(), slot: 'weapon', wtype: 'ball', rarity: rng.chance(0.5) ? 'magic' : 'normal', rng }));
  for (const slot of ['hat', 'outfit', 'boots', 'paws']) add(generateItem({ ilvl: ilvl(), slot, rarity: rng.chance(0.45) ? 'magic' : 'normal', rng }));
  add(generateItem({ ilvl: ilvl(), slot: rng.chance(0.5) ? 'collar' : 'charm', rarity: 'magic', rng }));
  add(generateItem({ ilvl: ilvl(), slot: 'charm', rarity: 'magic', rng }));
  for (let i = 0; i < 2; i++) add(generateItem({ ilvl: ilvl(), rarity: rng.chance(0.3) ? 'magic' : 'normal', rng }));
  if (lvl >= 5) add(generateItem({ ilvl: clamp(lvl + 2, 1, 60), rarity: 'rare', rng })); // featured
  add(makeGem(rng.pick(GEM_TYPES), lvl >= 30 && rng.chance(0.3) ? 1 : 0));
  add(makeGem(rng.pick(GEM_TYPES), 0));
  return out;
}

// ================================================================== tooltips
function speedLabel(a) { return a >= 1.3 ? 'Very Fast' : a >= 1.2 ? 'Fast' : a >= 1.05 ? 'Normal' : a >= 0.97 ? 'Slow' : 'Very Slow'; }
/** Weapon damage shown on the item (base + its own ED / flat adds, like D2). */
export function itemDamage(it) {
  if (!it.dmg) return null;
  let pct = 0, mn = 0, mx = 0;
  for (const a of it.affixes) { if (a.stat === 'dmgPct' && !a.gem) pct += a.value; if (a.stat === 'dmgMin') mn += a.value; if (a.stat === 'dmgMax') mx += a.value; }
  const lo = Math.round((it.dmg[0] + mn) * (1 + pct / 100)), hi = Math.round((it.dmg[1] + mx) * (1 + pct / 100));
  return [lo, Math.max(lo + 1, hi), pct || mn || mx];
}
export function itemKindName(it) {
  if (it.kind === 'gem') return 'Treat Gem';
  if (it.wtype === 'sword') return 'Bone Sword';
  if (it.wtype === 'ball') return 'Ball';
  return SLOT_NAMES[it.slot] || 'Item';
}
/** Does the player meet the item's requirements? */
export function meetsReq(it, state, derived) {
  if (!state) return true;
  const r = it.req || {};
  const lvl = state.player.lvl;
  const str = derived ? derived.str : state.player.stats.str;
  const dex = derived ? derived.dex : state.player.stats.dex;
  return lvl >= (r.lvl || 1) && str >= (r.str || 0) && dex >= (r.dex || 0);
}
/** Which equipment slot would this item go into (for compare / quick-equip)? */
export function targetSlot(it, state) {
  if (!it || it.kind !== 'gear') return null;
  if (it.slot === 'weapon') {
    // Keep the "one sword + one ball" loadout: replace the weapon of the same type (or fill an empty hand), else the active hand.
    const act = state && state.player.activeWeapon === 1 ? 'weaponAlt' : 'weapon';
    if (!state) return act;
    const other = act === 'weapon' ? 'weaponAlt' : 'weapon';
    const a = state.equipment[act], o = state.equipment[other];
    if (!a || a.wtype === it.wtype) return act;
    if (!o || o.wtype === it.wtype) return other;
    return act;
  }
  if (it.slot === 'charm') { const e = state ? state.equipment : {}; return !e.charm1 ? 'charm1' : !e.charm2 ? 'charm2' : 'charm1'; }
  return it.slot;
}

const CMP_KEYS = [
  ['dmgAvg', 'Damage', 1], ['aspd', 'Attacks/sec', 100], ['def', 'Defense', 1], ['lifeMax', 'Life', 1], ['zoomMax', 'Zoom', 1],
  ['crit', 'Crit Chance', 1, '%'], ['resFire', 'Fire Res', 1, '%'], ['resFrost', 'Frost Res', 1, '%'], ['resZap', 'Zap Res', 1, '%'],
  ['resStink', 'Stink Res', 1, '%'], ['moveSpeed', 'Zoomies', 1, '%'], ['lifeSteal', 'Life Steal', 1, '%'], ['mf', 'Magic Find', 1, '%'],
  ['allSkills', 'All Skills', 1], ['block', 'Block', 1, '%'], ['lifeRegen', 'Life Regen', 10],
];
/** Stat deltas of equipping `it` vs what's currently equipped. → [{text, delta}] */
export function compareItem(it, state) {
  if (!state || !it || it.kind !== 'gear') return [];
  const slot = targetSlot(it, state);
  if (!slot || state.equipment[slot] === it) return [];
  const cur = computeStats(state);
  const alt = computeStats({ ...state, equipment: { ...state.equipment, [slot]: it } });
  const out = [];
  for (const [k, label, prec, unit = ''] of CMP_KEYS) {
    const a = cur[k] || 0, b = alt[k] || 0;
    const dlt = Math.round((b - a) * prec) / prec;
    if (Math.abs(dlt) < 1 / prec / 2 || !isFinite(dlt)) continue;
    out.push({ text: `${dlt > 0 ? '+' : ''}${prec === 100 ? dlt.toFixed(2) : dlt}${unit} ${label}`, delta: dlt });
  }
  for (const e of ['fire', 'frost', 'zap', 'stink']) {
    const a = cur[e + 'Dmg'], b = alt[e + 'Dmg'];
    const dlt = Math.round((b[0] + b[1] - a[0] - a[1]) / 2);
    if (dlt) out.push({ text: `${dlt > 0 ? '+' : ''}${dlt} ${e[0].toUpperCase() + e.slice(1)} Dmg`, delta: dlt });
  }
  return out.slice(0, 10);
}

/**
 * Tooltip data for UI. → { title, titleColor, subtitle, lines:[{text,color,italic?,gap?}], req:[{text,met}], compare:[{text,delta}] }
 */
export function itemTooltip(it, state, derived) {
  const C = INK_COLORS;
  const lines = [];
  const L = (text, color = C.white, extra) => lines.push({ text, color, ...(extra || {}) });
  if (it.kind === 'gem') {
    const g = GEMS[it.gemType];
    L('Can be socketed into weapons, hats and outfits.', C.grey);
    const w = gemEffect(it.gemType, it.gemTier, 'weapon'), a = gemEffect(it.gemType, it.gemTier, 'hat');
    L('Weapon: ' + statText(w.stat, w.value, null, { slot: 'charm' }), C.blue);
    L('Hat / Outfit: ' + statText(a.stat, a.value, null, { slot: 'hat' }), C.blue);
    if (it.qty > 1) L(`Stack: ${it.qty}`, C.grey);
    L(`Sell value: ${it.value} coins`, C.grey, { gap: true });
    return { title: it.name, titleColor: g.colors[1] === '#ffffff' ? '#dff0ff' : g.colors[0], subtitle: 'Treat Gem', lines, req: reqLines(it, state, derived), compare: [] };
  }
  if (it.kind !== 'gear') {
    if (it.desc) L(it.desc, C.grey);
    if (it.qty > 1) L(`Stack: ${it.qty}`, C.grey);
    return { title: it.name, titleColor: C.white, subtitle: it.kind === 'key' ? 'Key Item' : it.kind === 'gift' ? 'Gift' : 'Item', lines, req: [], compare: [] };
  }
  const b = ITEM_BASES[it.base];
  const col = RARITY[it.rarity].color;
  const kind = itemKindName(it);
  const tierName = b.tier ? TIER_NAMES[b.tier] + ' ' : '';
  const subtitle = (it.rarity === 'rare' || it.rarity === 'unique' || it.rarity === 'set' ? b.name + ' · ' : '') + tierName + kind + (it.rarity !== 'normal' ? ` · ${RARITY[it.rarity].name}` : '');
  if (it.dmg) {
    const d = itemDamage(it);
    L(`${it.wtype === 'ball' ? 'Throw' : 'Swing'} Damage: ${d[0]} to ${d[1]}`, d[2] ? C.blue : C.white);
    L(`Attack Speed: ${speedLabel(it.aspd)} (${it.aspd.toFixed(2)}/s)`, C.white);
    L(it.wtype === 'ball' ? 'Thrown · bounces back to you · scales with Dexterity' : 'Melee · wide swing · scales with Strength', C.grey);
  }
  if (it.def) {
    let ed = 0; for (const a of it.affixes) if (a.stat === 'def') ed += a.value;
    L(`Defense: ${it.def + ed}`, ed ? C.blue : C.white);
  }
  const affColor = it.rarity === 'set' ? C.green : C.blue;
  const own = it.affixes.filter(a => !a.gem);
  const gemAff = it.affixes.filter(a => a.gem);
  let first = true;
  for (const a of own) { L(a.text, affColor, first ? { gap: true } : undefined); first = false; }
  for (const a of gemAff) L(a.text, C.blue);
  if (it.sockets) L(`Sockets: ${(it.gems || []).length} / ${it.sockets}` + ((it.gems || []).length ? '  (' + it.gems.map(g => g.name).join(', ') + ')' : ''), C.grey, { gap: true });
  if (it.setId) {
    const S = SETS[it.setId];
    const have = new Set();
    if (state) for (const k of EQUIP_SLOTS) { const e = state.equipment[k]; if (e && e.setId === it.setId) have.add(e.setPiece); }
    L(S.name, C.gold, { gap: true });
    for (const p of S.pieces) L('  ' + SET_ITEMS[p].name, have.has(p) ? C.green : C.grey);
    const n = have.size;
    for (const t of S.bonuses) {
      const need = t.n === 'full' ? S.pieces.length : t.n;
      for (const s of t.stats) L(`(${t.n === 'full' ? 'Full Set' : need + ' Items'}) ${statText(s.stat, s.value, null, it)}`, n >= need ? C.green : C.grey);
    }
  }
  if (it.flavor && it.rarity === 'unique') L(/^["“]/.test(it.flavor) ? it.flavor : `“${it.flavor}”`, C.flavor, { italic: true, gap: true });
  L(`Sell value: ${it.value} coins`, C.grey, { gap: true });
  return {
    title: it.name, titleColor: col, subtitle, lines,
    req: reqLines(it, state, derived),
    compare: state ? compareItem(it, state) : [],
  };
}
function reqLines(it, state, derived) {
  const r = it.req || {};
  const out = [];
  const lvl = state ? state.player.lvl : 99;
  const str = derived ? derived.str : state ? state.player.stats.str : 999;
  const dex = derived ? derived.dex : state ? state.player.stats.dex : 999;
  if ((r.lvl || 1) > 1) out.push({ text: `Required Level: ${r.lvl}`, met: lvl >= r.lvl });
  if (r.str) out.push({ text: `Required Strength: ${r.str}`, met: str >= r.str });
  if (r.dex) out.push({ text: `Required Dexterity: ${r.dex}`, met: dex >= r.dex });
  return out;
}
