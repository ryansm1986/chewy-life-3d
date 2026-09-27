import { open } from './lib.mjs';
const s = await open('/?fresh&nointro&hour=11', { wait: 3000 });
const r = await s.ev(() => {
  const sim = G.sim; const homes = G.state.village.buildings.filter(b => b.type === 'home');
  const out = { homes: homes.map(h => [h.x, h.z, h.level]).slice(0, 6), inspect: null };
  const h = homes[0]; out.inspect = sim.inspect?.(h.x, h.z);
  // try placing services near it (free)
  const placed = [];
  for (const t of ['well', 'park', 'bench', 'flowerBed', 'streetLamp', 'shrine']) {
    let ok = false;
    for (let rr = 2; rr < 9 && !ok; rr++) for (let a = 0; a < 16 && !ok; a++) { const x = Math.round(h.x + Math.cos(a / 16 * 6.283) * rr), z = Math.round(h.z + Math.sin(a / 16 * 6.283) * rr); if (sim.canPlace(t, x, z, 0).ok) { sim.place(t, x, z, 0, { free: true }); placed.push(t + '@' + x + ',' + z); ok = true; } }
  }
  out.placed = placed; out.home = [h.x, h.z];
  return out;
});
console.log(JSON.stringify(r).slice(0, 1500));
for (let i = 0; i < 20; i++) { await s.ev(() => { G.sim.tickT = 99; }); await s.sleep(500); }
await s.sleep(1500);
const after = await s.ev((hx) => { const b = G.state.village.buildings.find(b => b.x === hx[0] && b.z === hx[1]); return { level: b?.level, inspect: G.sim.inspect?.(hx[0], hx[1]), levels: G.state.village.buildings.filter(b => b.level > 1).map(b => b.type + 'L' + b.level) }; }, r.home);
console.log(JSON.stringify(after).slice(0, 1500));
await s.ev((hx) => { G.engine.rig.focus.set(hx[0], 0, hx[1]); G.player.setPos(hx[0] + 3, hx[1] + 3); G.engine.rig.snap?.(); G.engine.rig.distTarget = 18; }, r.home);
await s.sleep(1500);
await s.snap('48_levelup_home');
await s.close();
