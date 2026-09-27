import { open } from './lib.mjs';
// Short clicks (touchpad taps): does a press+release shorter than a frame still move Chewy / attack?
const s = await open('/?fresh&nointro&hour=10', { wait: 3000 });
for (const delay of [0, 5, 12, 40, 100]) {
  let moved = 0;
  for (let i = 0; i < 6; i++) {
    const before = await s.ev(() => [G.player.pos.x, G.player.pos.z]);
    const cur = await s.ev(() => { const v = G.player.pos.clone().project(G.engine.camera); return [Math.round((v.x * .5 + .5) * innerWidth), Math.round((-v.y * .5 + .5) * innerHeight)]; });
    const a = i * 1.047; const x = cur[0] + Math.cos(a) * 160, y = cur[1] + Math.sin(a) * 110;
    await s.page.mouse.move(x, y); await s.page.mouse.down(); if (delay) await s.sleep(delay); await s.page.mouse.up();
    await s.sleep(700);
    const after = await s.ev(() => [G.player.pos.x, G.player.pos.z]);
    if (Math.hypot(after[0] - before[0], after[1] - before[1]) > 0.3) moved++;
  }
  console.log('press duration', delay, 'ms -> moved', moved, '/ 6');
}
await s.close();
