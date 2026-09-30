import { open } from './lib.mjs';
const s = await open('/?fresh&nointro&hour=10', { wait: 3000 });
// pick the biggest tree colliders near the village and stand Chewy just "behind" them (away from camera)
const trees = await s.ev(() => G.world.veg.colliders.filter(c => c.r > 0.5).sort((a, b) => b.r - a.r).slice(0, 40).map(c => [c.x, c.z, c.r]));
console.log('trees', trees.length, JSON.stringify(trees.slice(0, 5)));
let k = 0;
for (const [x, z, r] of trees.slice(0, 12)) {
  // camera looks from +x+z; "behind" = -x-z
  const ok = await s.ev(([x, z, r]) => { const px = x - (r + 1.2) * 0.7, pz = z - (r + 1.2) * 0.7; if (G.world.walkable && G.world.walkable(px, pz) === false) return false; G.player.setPos(px, pz); G.companion.setPos(px - 1, pz - 0.5); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); return true; }, [x, z, r]);
  if (!ok) continue;
  await s.sleep(900);
  await s.snap('34_behind_tree_' + k);
  if (++k >= 3) break;
}
// walk with WASD & roll through the village, snap mid-roll
await s.ev(() => { const L = G.world.landmarks; G.player.setPos(L.plaza.x, L.plaza.z + 4); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); });
await s.sleep(600);
await s.page.keyboard.down('d'); await s.sleep(700); await s.key('Space'); await s.sleep(150); await s.snap('35_roll'); await s.sleep(600); await s.page.keyboard.up('d');
await s.page.keyboard.down('w'); await s.sleep(900); await s.snap('35b_walk'); await s.page.keyboard.up('w');
await s.close();
