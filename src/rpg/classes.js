// Playable hero classes (docs/HEROES.md). Each hero has its own progression (player + equipment in state.heroes[id]);
// the household (coins, bag, stash, materials, quests, village) is shared.

export const CLASSES = {
  chewy: {
    id: 'chewy', name: 'Chewy', title: 'Bone Katana Samurai', species: 'Chocolate lab mix',
    blurb: 'Draw-cuts, battle cries and a trusty tennis ball. Strength and Dexterity make him hit harder.',
    color: '#e8475c', accent: '#2c3a6a',
    pron: { sub: 'he', obj: 'him', pos: 'his' }, garment: 'scarf',
    trees: ['bone', 'fetch', 'spirit'],
    weapons: ['sword', 'ball'],
    base: { str: 10, dex: 10, vit: 12, ene: 8 },
    life: (vit, lvl) => 40 + vit * 4 + lvl * 6,
    zoom: (ene, lvl) => 20 + ene * 2.5 + lvl * 2,
    // weapon type → the attribute that adds +1% damage per point
    dmgStat: { sword: 'str', ball: 'dex', staff: 'ene' },
    starter: { skills: { chomp: 1, throw: 1 }, hotbar: ['attack', 'chomp', null, null, null, null], mouseSets: [['attack', 'chomp'], ['attack', 'throw']] },
  },
  moka: {
    id: 'moka', name: 'Moka', title: 'Tidewater Mage', species: 'Boykin Spaniel',
    blurb: 'Splashes, starlight and duck-hunt tricks. Energy makes her spells hit harder.',
    color: '#2fb8a8', accent: '#9a7ae8',
    pron: { sub: 'she', obj: 'her', pos: 'her' }, garment: 'capelet',
    trees: ['tide', 'star', 'duck'],
    weapons: ['staff'],
    base: { str: 8, dex: 10, vit: 10, ene: 16 },
    life: (vit, lvl) => 34 + vit * 3.6 + lvl * 5,
    zoom: (ene, lvl) => 26 + ene * 3 + lvl * 2.6,
    dmgStat: { staff: 'ene', sword: 'str', ball: 'dex' },
    starter: { skills: { splash: 1 }, hotbar: ['attack', 'splash', null, null, null, null], mouseSets: [['attack', 'splash'], ['attack', 'splash']] },
  },
  // Poe, the black pug ninja (docs/POE.md): the giant bone fūma, ninjutsu and shadow steps. Dexterity powers the fūma
  // and her strikes (+1% damage per point, like Str for swords); Energy powers her jutsu instead (stats.js poePassives
  // sets d.jutsuMul). Fragile but evasive: a smaller life pool than Chewy's and a class dodge chance (Swift as Wind adds more).
  poe: {
    id: 'poe', name: 'Poe', title: 'Bamboo Shinobi', species: 'Pug',
    blurb: 'Fūma throws, smoke and shadow steps. Dexterity sharpens her fūma, Energy her jutsu.',
    color: '#5a8a4a', accent: '#d8b040',
    pron: { sub: 'she', obj: 'her', pos: 'her' }, garment: 'scarf',
    trees: ['shuriken', 'jutsu', 'shadow'],
    weapons: ['fuma'],
    base: { str: 8, dex: 16, vit: 10, ene: 12 },
    life: (vit, lvl) => 36 + vit * 3.8 + lvl * 5.5,
    zoom: (ene, lvl) => 24 + ene * 2.8 + lvl * 2.3,
    dmgStat: { fuma: 'dex', sword: 'str', ball: 'dex', staff: 'ene' },
    dodge: 5, // % (stats.js: d.dodge; combat.js hitPlayer rolls it before block)
    starter: { skills: { fumaThrow: 1 }, hotbar: ['attack', 'fumaThrow', null, null, null, null], mouseSets: [['attack', 'fumaThrow'], ['attack', 'fumaThrow']] },
  },
};
export const HERO_IDS = Object.keys(CLASSES);
/** Per-hero flavour for the panels and the hero wheel: the name in kana and the character sheet's class line. */
export const HERO_TEXT = {
  chewy: { jp: 'チューイ', motto: 'Pup of the Blossom Dojo' },
  moka: { jp: 'モカ', motto: 'Tidewater Mage of the Hollow' },
  poe: { jp: 'ポー', motto: 'Shinobi of the Bamboo Grove' },
};
export const classOf = state => CLASSES[state?.player?.cls || state?.activeHero || 'chewy'] || CLASSES.chewy;
/** Which class may wield a weapon type ('sword' / 'ball' → Chewy, 'staff' → Moka, 'fuma' → Poe). */
export const WEAPON_CLASS = { sword: 'chewy', ball: 'chewy', staff: 'moka', fuma: 'poe' };
export const canWield = (cls, wtype) => !wtype || WEAPON_CLASS[wtype] === cls;
/** Villager / story lines are written to Chewy: address whoever is being played instead. */
export function heroText(s, state) {
  const C = classOf(state);
  if (C.id === 'chewy' || typeof s !== 'string') return s;
  return s.replace(/\bChewy's\b/g, `${C.name}'s`).replace(/\bChewy\b/g, C.name);
}
