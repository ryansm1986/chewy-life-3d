import { open } from './lib.mjs';
// Correlate long frames in the idle village with townsfolk spawns (npcs.length changes) and growth toasts.
const s = await open('/?fresh&nointro&hour=9', { wait: 2500 });
await s.ev(() => {
  window.__ev = []; let n = G.npcs.length; const raw = G.ui.toast; G.ui.toast = (t, o) => { window.__ev.push(['toast', Math.round(performance.now()), String(t).slice(0, 40)]); return raw(t, o); };
  window.__long = []; let last = performance.now(); const f = t => { const d = t - last; if (G.npcs.length !== n) { window.__ev.push(['npc+', Math.round(t), G.npcs.length]); n = G.npcs.length; } if (d > 16) window.__long.push([Math.round(t), +d.toFixed(1)]); last = t; requestAnimationFrame(f); }; requestAnimationFrame(f);
});
await s.sleep(45000);
const r = await s.ev(() => ({ long: window.__long, ev: window.__ev }));
console.log('long', JSON.stringify(r.long)); console.log('events', JSON.stringify(r.ev));
await s.close();
