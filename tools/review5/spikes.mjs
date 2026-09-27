import { open } from './lib.mjs';
// Long-frame log in the village for 60 s, correlated with village growth toasts.
const s = await open('/?fresh&nointro&hour=9', { wait: 2500 });
await s.ev(() => {
  window.__ev = []; const raw = G.ui.toast; G.ui.toast = (t, o) => { window.__ev.push(['toast', Math.round(performance.now()), String(t).slice(0, 50)]); return raw(t, o); };
  window.__long = []; let last = performance.now(); const f = t => { const d = t - last; if (d > 16) window.__long.push([Math.round(t), +d.toFixed(1)]); last = t; requestAnimationFrame(f); }; requestAnimationFrame(f);
});
await s.sleep(60000);
const r = await s.ev(() => ({ long: window.__long, ev: window.__ev, n: G.state.village.buildings.length }));
console.log('long frames (>16ms):', r.long.length, JSON.stringify(r.long.slice(0, 40)));
console.log('events', JSON.stringify(r.ev));
await s.close();
