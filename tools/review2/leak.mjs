import { open } from './lib.mjs';
const s = await open('/?fresh&nointro&hour=10', { wait: 3000 });
await s.ev(() => { G.state.flags.burrowTut = true; });
const mem = async (label) => {
  await s.page.evaluate(() => { if (window.gc) { gc(); gc(); } });
  await s.sleep(400);
  const r = await s.ev(() => ({ heapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1), geos: G.engine.renderer.info.memory.geometries, tex: G.engine.renderer.info.memory.textures, progs: G.engine.renderer.info.programs.length, villageChildren: G.village.world.scene.children.length, combatEnts: G.village.combat.entities.length }));
  console.log(label, JSON.stringify(r));
  return r;
};
await mem('start');
for (let i = 0; i < 10; i++) {
  await s.ev((f) => G.enterDungeon(f), 1 + (i % 6));
  await s.sleep(3500);
  // fight a bit
  await s.ev(() => { const P = G.state.player; for (let k = 0; k < 6; k++) { const m = G.dungeon.monsters.find(m => m.alive); if (!m) break; G.player.setPos(m.pos.x + 1.5, m.pos.z); G.state.player.zoom = null; G.skills.tryCast('chomp', m.pos.clone(), m); } });
  await s.sleep(1200);
  await s.ev(() => G.returnToVillage());
  await s.sleep(2500);
  if (i % 3 === 2 || i === 0) await mem('after trip ' + (i + 1));
}
await mem('end');
console.log('fps village after trips', JSON.stringify(await s.fps(2000)));
await s.close();
