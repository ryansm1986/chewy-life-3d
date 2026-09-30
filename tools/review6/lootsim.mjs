import { open } from './lib.mjs';
// Monte-Carlo item rarity per rank at a few monster levels (uses the game's own rollDrops).
const s = await open('/?test=none', { wait: 500 });
const r = await s.ev(async () => {
  const L = await import('/src/rpg/loot.js');
  const out = {};
  for (const mlvl of [2, 10, 25]) for (const rank of ['normal', 'champion', 'unique']) {
    const c = { items: 0 }; const N = 4000;
    for (let i = 0; i < N; i++) { const d = L.rollDrops({ mlvl, rank, mf: 0, gf: 0, rng: Math.random }); for (const x of (d || [])) { const it = x.item || (x.kind === 'gear' ? x : null); const rar = it?.rarity || x.rarity; if (rar) { c[rar] = (c[rar] || 0) + 1; c.items++; } } }
    out[`L${mlvl} ${rank}`] = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, k === 'items' ? +(v / N).toFixed(3) : +(100 * v / N).toFixed(2) + '%/kill']));
  }
  return out;
});
for (const [k, v] of Object.entries(r || {})) console.log(k, JSON.stringify(v));
await s.close();
