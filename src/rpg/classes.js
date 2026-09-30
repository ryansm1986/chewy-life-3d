// Playable hero classes (docs/HEROES.md). Each hero has its own progression (player + equipment in state.heroes[id]);
// the household (coins, bag, stash, materials, quests, village) is shared.

export const CLASSES = {
  chewy: {
    id: 'chewy', name: 'Chewy', title: 'Bone Sword Brawler', species: 'Chocolate lab mix',
    blurb: 'Chomps, spins and throws. Strength and Dexterity make him hit harder.',
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
};
export const HERO_IDS = Object.keys(CLASSES);
export const classOf = state => CLASSES[state?.player?.cls || state?.activeHero || 'chewy'] || CLASSES.chewy;
/** Which class may wield a weapon type ('sword' / 'ball' → Chewy, 'staff' → Moka). */
export const WEAPON_CLASS = { sword: 'chewy', ball: 'chewy', staff: 'moka' };
export const canWield = (cls, wtype) => !wtype || WEAPON_CLASS[wtype] === cls;
/** Villager / story lines are written to Chewy: address whoever is being played instead. */
export function heroText(s, state) {
  const C = classOf(state);
  if (C.id === 'chewy' || typeof s !== 'string') return s;
  return s.replace(/Chewy's/g, `${C.name}'s`).replace(/Chewy/g, C.name);
}
