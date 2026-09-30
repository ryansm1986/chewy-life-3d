import { open } from './lib.mjs';
// Natural time flow across dusk (lamps on) and dawn: long frames + shader program count, with the hour at each spike.
const start = +(process.argv[2] || 16.9), secs = +(process.argv[3] || 45);
const s = await open(`/?fresh&nointro&hour=${start}`, { wait: 3000 });
await s.ev(() => {
  window.__long = []; let last = performance.now(); const I = G.engine.renderer.info;
  const f = t => { const d = t - last; if (d > 20) window.__long.push([+G.day.hour.toFixed(2), +d.toFixed(1), I.programs.length]); last = t; requestAnimationFrame(f); }; requestAnimationFrame(f);
  window.__p0 = I.programs.length;
});
await s.sleep(secs * 1000);
const r = await s.ev(() => ({ hour: +G.day.hour.toFixed(2), long: window.__long, progs: [window.__p0, G.engine.renderer.info.programs.length] }));
console.log('from', start, 'to', r.hour, 'progs', JSON.stringify(r.progs), 'long frames >20ms:', JSON.stringify(r.long));
await s.close();
