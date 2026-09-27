import { open } from './lib.mjs';
// Control + corner test with logging of the move order the click produced.
const s = await open('/?fresh&nointro&floor=7', { wait: 7000 });
await s.ev(() => { if (G.ui.dlg.active) G.ui.dlg.finish(-1); G.state.flags.burrowTut = true; for (const m of G.dungeon.monsters) { m.alive = false; m.world.scene.remove(m.model.root, m.shadow); } });
await s.sleep(500);
const p0 = await s.ev(() => [G.player.pos.x, G.player.pos.z]);
// control: click 200 px right of Chewy
const me = await s.ev(() => { const v = G.player.pos.clone().project(G.engine.camera); return [Math.round((v.x * .5 + .5) * innerWidth), Math.round((-v.y * .5 + .5) * innerHeight)]; });
console.log('chewy on screen', me);
for (const [dx, dy] of [[200, 0], [-200, 60], [0, 150], [250, -120]]) {
  const before = await s.ev(() => [G.player.pos.x.toFixed(2), G.player.pos.z.toFixed(2)]);
  const cur = await s.ev(() => { const v = G.player.pos.clone().project(G.engine.camera); return [Math.round((v.x * .5 + .5) * innerWidth), Math.round((-v.y * .5 + .5) * innerHeight)]; });
  const tgt = [cur[0] + dx, cur[1] + dy];
  await s.click(tgt[0], tgt[1]);
  await s.sleep(150);
  const mt = await s.ev(() => G.player.moveTarget ? [G.player.moveTarget.x.toFixed(2), G.player.moveTarget.z.toFixed(2)] : null);
  await s.sleep(2500);
  const after = await s.ev(() => [G.player.pos.x.toFixed(2), G.player.pos.z.toFixed(2)]);
  console.log('click', tgt, 'moveTarget', JSON.stringify(mt), 'from', before, 'to', after);
}
await s.snap('74b_pathing_control');
await s.close();
