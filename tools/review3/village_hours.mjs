import { open } from './lib.mjs';
const s = await open('/?fresh&nointro&hour=8', { wait: 4000 });
await s.log('fps morning', () => 0);
console.log('fps', JSON.stringify(await s.fps(3000)), 'stats', JSON.stringify(await s.stats()));
await s.log('toasts', () => [...document.querySelectorAll('[class*=toast]')].map(e => e.innerText).filter(Boolean));
await s.snap('05_hour_08');
for (const h of [12.5, 17.5, 19.3, 21.5]) {
  await s.ev(h => { G.day.hour = h; }, h);
  await s.sleep(2500);
  await s.snap('05_hour_' + String(h).replace('.', '_'));
  console.log('h', h, 'fps', JSON.stringify(await s.fps(2000)), JSON.stringify(await s.stats()));
}
// wide shot, zoomed out, golden hour
await s.ev(() => { G.day.hour = 17.6; G.engine.rig.distTarget = 60; });
await s.sleep(2500);
await s.snap('06_wide_golden');
console.log('wide fps', JSON.stringify(await s.fps(2000)), JSON.stringify(await s.stats()));
await s.ev(() => { G.day.hour = 21.8; });
await s.sleep(2500);
await s.snap('06b_wide_night');
await s.ev(() => { G.day.hour = 10; G.engine.rig.distTarget = 14; });
await s.sleep(2500);
await s.snap('06c_close_day');
// sim state and toasts while idle
await s.log('sim', () => ({ pop: G.sim.stats.population, S: Object.keys(G.sim.stats), bld: G.state.village.buildings.length, toasts: [...document.querySelectorAll('[class*=toast]')].map(e => e.innerText).filter(Boolean) }));
await s.close();
