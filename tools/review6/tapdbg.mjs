import { open } from './lib.mjs';
// Why do 40-100 ms clicks not move Chewy? Log moveTarget / position / mouse state during and after one press.
const s = await open('/?fresh&nointro&hour=10', { wait: 3000 });
for (const delay of [0, 100, 100, 250]) {
  await s.ev(() => { window.__log = []; const t0 = performance.now(); const f = () => { __log.push([Math.round(performance.now() - t0), G.player.moveTarget ? 'MT' : '-', +G.player.pos.x.toFixed(2), +G.player.pos.z.toFixed(2), [...(G.Input?.mDown || [])].join('')]); if (performance.now() - t0 < 900) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  const cur = await s.ev(() => { const v = G.player.pos.clone().project(G.engine.camera); return [Math.round((v.x * .5 + .5) * innerWidth), Math.round((-v.y * .5 + .5) * innerHeight)]; });
  const x = cur[0] + 170, y = cur[1] + 40;
  const under = await s.ev(([x, y]) => document.elementFromPoint(x, y)?.tagName + '.' + document.elementFromPoint(x, y)?.className, [x, y]);
  await s.page.mouse.move(x, y); await s.page.mouse.down(); if (delay) await s.sleep(delay); await s.page.mouse.up();
  await s.sleep(1000);
  const L = await s.ev(() => __log);
  const moved = Math.hypot(L[L.length - 1][2] - L[0][2], L[L.length - 1][3] - L[0][3]).toFixed(2);
  console.log('delay', delay, 'under', under, 'moved', moved, 'frames', L.length, 'MT frames', L.filter(r => r[1] === 'MT').length, 'first rows', JSON.stringify(L.slice(0, 4)), 'mid', JSON.stringify(L.slice(10, 13)));
}
await s.close();
