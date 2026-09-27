import { open } from './lib.mjs';
const s = await open('/?fresh&nointro&hour=9', { wait: 2000 });
await s.ev(() => { window.__t = []; const raw = G.ui.toast; G.ui.toast = (t, o) => { window.__t.push([Math.round(performance.now() / 1000), t]); return raw(t, o); }; window.__b = []; const rb = G.ui.banner.bind(G.ui); G.ui.banner = (a, b, o) => { window.__b.push([Math.round(performance.now() / 1000), a, b]); return rb(a, b, o); }; });
await s.sleep(75000);
await s.log('toasts in 75s', () => window.__t);
await s.log('banners', () => window.__b);
await s.log('pop', () => ({ pop: G.sim.stats.population, n: G.state.village.buildings.length, folk: G.npcs.length }));
await s.snap('37_after_idle');
await s.close();
