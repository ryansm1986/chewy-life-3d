(async () => {
  const I = await import('/src/rpg/items.js');
  const L = await import('/src/rpg/loot.js');
  const p = G.player.pos.clone().add(new G.THREE.Vector3(1.5, 0, -1.5));
  const drops = [];
  for (const r of ['normal', 'magic', 'rare', 'unique', 'set', 'magic', 'rare']) drops.push({ type: 'item', item: I.generateItem({ ilvl: 20, rarity: r }) });
  drops.push({ type: 'coins', n: 57 }, { type: 'potion', key: 'heart' }, { type: 'material', key: 'crystal', n: 3 });
  G.dungeon.loot.drop(p, drops);
  // also fill the bag
  const inv = G.state.inventory;
  let k = 0;
  for (const r of ['unique', 'set', 'rare', 'rare', 'magic', 'magic', 'normal', 'unique', 'set', 'rare', 'magic', 'magic']) inv[k++] = I.generateItem({ ilvl: 24, rarity: r });
  for (let i = 0; i < 3; i++) inv[k++] = I.makeGem(I.GEM_TYPES[i % I.GEM_TYPES.length], 1);
  G.events.emit('inv:changed', {});
  return 'dropped ' + drops.length + ' / inv ' + k + ' names: ' + drops.filter(d => d.item).map(d => d.item.rarity + ':' + d.item.name).join(', ');
})()
