import { open } from './lib.mjs';
const s = await open('/?fresh&nointro&hour=10', { wait: 2500 });
await s.ev(() => { G.state.flags.burrowTut = true; G.enterDungeon(15); });
await s.sleep(5000);
// find a walkable spot ~10-14 m from the boss where the straight line to the boss crosses a wall
const r = await s.ev(() => {
  const b = G.dungeon.boss, W = G.world;
  for (let a = 0; a < 64; a++) for (const R of [10, 12, 14]) {
    const x = b.pos.x + Math.cos(a / 64 * 6.283) * R, z = b.pos.z + Math.sin(a / 64 * 6.283) * R;
    if (!W.walkable(x, z)) continue;
    let blocked = false; for (let t = 0.05; t < 0.95; t += 0.02) if (!W.walkable(x + (b.pos.x - x) * t, z + (b.pos.z - z) * t)) { blocked = true; break; }
    if (blocked) { G.player.setPos(x, z); G.companion.setPos(x, z); return { x: +x.toFixed(1), z: +z.toFixed(1), R }; }
  }
  return null;
});
console.log('start', JSON.stringify(r));
await s.sleep(500);
await s.ev(() => { G.player.moveTarget = G.dungeon.boss.pos.clone(); });
for (let i = 0; i < 6; i++) { await s.sleep(1000); console.log('dist', await s.ev(() => +G.player.pos.distanceTo(G.dungeon.boss.pos).toFixed(1))); }
await s.snap('36_click_move_blocked');
await s.close();
