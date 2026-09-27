import { open } from './lib.mjs';
// Attribute the first-click stall: time nav.findPath cold, then a first real click, with programs before/after.
const s = await open('/?fresh&nointro&hour=10', { wait: 3500 });
const r = await s.ev(async () => {
  const { navFor } = await import('/src/core/nav.js');
  const nav = navFor(G.world); const P = G.player.pos;
  const I = G.engine.renderer.info;
  const out = { built: nav.built, regionsDirty: nav.regionsDirty, progs0: I.programs.length };
  let t = performance.now(); const p = nav.findPath(P.x, P.z, P.x + 6, P.z + 3); out.findPathMs = +(performance.now() - t).toFixed(1);
  t = performance.now(); nav.findPath(P.x, P.z, P.x - 6, P.z + 3); out.findPath2Ms = +(performance.now() - t).toFixed(1);
  return out;
});
console.log('cold nav', JSON.stringify(r));
const r2 = await s.ev(() => new Promise(res => { const I = G.engine.renderer.info; const p0 = I.programs.length; let mx = 0, last = performance.now(), k = 0; function f(t) { mx = Math.max(mx, t - last); last = t; if (++k < 40) requestAnimationFrame(f); else res({ mx: +mx.toFixed(1), newProgs: I.programs.length - p0, names: I.programs.slice(p0).map(p => p.name) }); } requestAnimationFrame(f); window.__p = true; }).then(x => x));
console.log('idle', JSON.stringify(r2));
const cur = await s.ev(() => { const v = G.player.pos.clone().project(G.engine.camera); return [Math.round((v.x * .5 + .5) * innerWidth), Math.round((-v.y * .5 + .5) * innerHeight)]; });
const pr = s.ev(() => new Promise(res => { const I = G.engine.renderer.info; const p0 = I.programs.length; let mx = 0, last = performance.now(), k = 0; function f(t) { mx = Math.max(mx, t - last); last = t; if (++k < 40) requestAnimationFrame(f); else res({ mx: +mx.toFixed(1), newProgs: I.programs.length - p0, names: I.programs.slice(p0).map(p => p.name + ':' + (p.cacheKey || '').slice(0, 40)) }); } requestAnimationFrame(f); }));
await s.page.mouse.move(cur[0] + 170, cur[1] + 50); await s.page.mouse.down(); await s.sleep(60); await s.page.mouse.up();
console.log('first click', JSON.stringify(await pr));
await s.close();
