// Build-time benchmark for the character kit: /?test=kitbench  (window.__bench = { cold per species, warm per spec })
import { buildHumanoid, buildBoston, CAST } from '../actors/charKit.js';
import { VILLAGERS, randomVillagerSpec } from '../actors/roster.js';
export default function () {
  const out = { cold: {}, warm: {} };
  const t = fn => { const t0 = performance.now(); const r = fn(); return [performance.now() - t0, r]; };
  for (const v of VILLAGERS) { const [ms, r] = t(() => buildHumanoid(v.spec)); out.cold[v.spec.species] = +ms.toFixed(1); r.dispose(); }
  { const [ms, r] = t(() => buildHumanoid(CAST.rosie)); out.cold.human = +ms.toFixed(1); r.dispose(); }
  { const [ms, r] = t(() => buildBoston()); out.cold.boston = +ms.toFixed(1); r.dispose(); }
  let rng = 1; const rand = () => (rng = (rng * 16807) % 2147483647) / 2147483647;
  const times = [];
  for (let i = 0; i < 24; i++) { const [ms, r] = t(() => buildHumanoid(randomVillagerSpec(rand))); times.push(ms); r.dispose(); }
  times.sort((a, b) => a - b);
  out.warm = { median: +times[12].toFixed(1), max: +times[23].toFixed(1), note: 'random townsfolk (first time for a species pays its sculpt)' };
  const r = buildHumanoid(VILLAGERS[0].spec); out.tris = r.skin.geometry.index.count / 3; r.dispose();
  window.__bench = out; window.__ready = true;
}
// per-part triangle counts: /?test=kitbench&parts[&id=kuma]
import { rawDisneyHumanoid, rawToyHumanoid, kitStyle } from '../actors/charKit.js';
if (new URLSearchParams(location.search).has('parts')) {
  const id = new URLSearchParams(location.search).get('id'), v = VILLAGERS.find(x => x.id === id) || VILLAGERS[0];
  const R = (kitStyle() === 'toy' ? rawToyHumanoid : rawDisneyHumanoid)(v.spec), out = {};
  R.root.traverse(o => { if (o.isMesh && o.geometry.index) out[o.name] = (out[o.name] || 0) + o.geometry.index.count / 3; });
  window.__parts = out;
}
