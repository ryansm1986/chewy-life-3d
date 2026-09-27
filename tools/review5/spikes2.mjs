import { open } from './lib.mjs';
// 90 s in the village with natural time; every frame >45 ms is logged with what happened in it (sim ticks, npc count
// changes, building count changes) and the durations of instrumented calls.
const start = +(process.argv[2] || 10.5);
const s = await open(`/?fresh&nointro&hour=${start}`, { wait: 3000 });
await s.ev(() => {
  window.__calls = []; const wrap = (obj, name, label) => { const f = obj[name]; if (typeof f !== 'function') return; obj[name] = function (...a) { const t = performance.now(); const r = f.apply(this, a); const d = performance.now() - t; if (d > 8) window.__calls.push([Math.round(t), label, +d.toFixed(1)]); return r; }; };
  wrap(G.sim, 'grow', 'sim.grow'); wrap(G.sim, 'simulate', 'sim.simulate'); wrap(G.sim, 'place', 'sim.place');
  if (G.villageLife) { for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(G.villageLife))) if (!['constructor'].includes(k) && typeof G.villageLife[k] === 'function') wrap(G.villageLife, k, 'life.' + k); }
  const eng = G.engine; if (eng.post) wrap(eng.post, 'render', 'post.render');
  window.__long = []; let last = performance.now(), n = G.npcs.length, b = G.state.village.buildings.length;
  const f = t => { const d = t - last; const nn = G.npcs.length, bb = G.state.village.buildings.length; if (d > 45) window.__long.push({ t: Math.round(t), d: +d.toFixed(1), h: +G.day.hour.toFixed(2), dn: nn - n, db: bb - b, calls: window.__calls.filter(c => c[0] > last - 5 && c[0] < t).map(c => c[1] + ':' + c[2]) }); n = nn; b = bb; last = t; requestAnimationFrame(f); }; requestAnimationFrame(f);
});
await s.sleep(90000);
const r = await s.ev(() => ({ long: window.__long, slowCalls: window.__calls.filter(c => c[2] > 20).slice(0, 20), hour: G.day.hour.toFixed(2) }));
console.log('from', start, 'to', r.hour, 'frames >45ms:', r.long.length);
for (const l of r.long) console.log(JSON.stringify(l));
console.log('calls >20ms', JSON.stringify(r.slowCalls));
await s.close();
