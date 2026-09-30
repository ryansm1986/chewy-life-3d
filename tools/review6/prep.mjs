// browser-side: fill the bag with a spread of rarities
export const generateItemPrep = async () => {
  const I = await import('/src/rpg/items.js');
  const P = G.state.player; P.lvl = 24; G.actions.recompute();
  const list = [];
  for (const r of ['unique', 'set', 'rare', 'rare', 'magic', 'magic', 'magic', 'normal']) list.push(I.generateItem({ ilvl: 30, rarity: r }));
  list.push(I.makeGem(I.GEM_TYPES[0], 1)); list.push(I.makeGem(I.GEM_TYPES[2], 0));
  for (const it of list) G.actions.pickup(it);
  return list.map(i => i.rarity + ':' + i.name);
};
