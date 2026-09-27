import { open } from './lib.mjs';
// Leak check with village growth frozen: 16 round trips, heap/geos/tex every 4 trips.
const s = await open('/?fresh&nointro&hour=10', { wait: 3000 });
await s.ev(() => { G.state.flags.burrowTut = true; const grow = G.sim.grow.bind(G.sim); G.sim.grow = () => {}; window.__unfreeze = () => { G.sim.grow = grow; }; });
const mem = async (label) => {
  await s.page.evaluate(() => { if (window.gc) { gc(); gc(); } });
  await s.sleep(500);
  const r = await s.ev(() => ({ heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1), geos: G.engine.renderer.info.memory.geometries, tex: G.engine.renderer.info.memory.textures, progs: G.engine.renderer.info.programs.length, bld: G.state.village.buildings.length, npcs: G.npcs.length, domNodes: document.getElementsByTagName('*').length, bag: (G.state.inventory || []).filter(Boolean).length }));
  console.log(label, JSON.stringify(r));
  return r;
};
await mem('start');
for (let i = 0; i < 16; i++) {
  await s.ev((f) => G.enterDungeon(f), 1 + (i % 8));
  await s.sleep(3200);
  await s.ev(() => { for (let k = 0; k < 6; k++) { const m = G.dungeon.monsters.find(m => m.alive); if (!m) break; G.player.setPos(m.pos.x + 1.5, m.pos.z); G.state.player.zoom = null; G.state.player.life = null; if (G.skills.cds) G.skills.cds.chomp = 0; G.skills.tryCast('chomp', m.pos.clone(), m); } });
  await s.sleep(1000);
  await s.ev(() => G.returnToVillage());
  await s.sleep(2200);
  if (i % 4 === 3 || i === 0) await mem('after trip ' + (i + 1));
}
console.log('fps village after trips', JSON.stringify(await s.fps(2000)));
await s.close();
