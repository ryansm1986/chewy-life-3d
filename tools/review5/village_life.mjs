import { open } from './lib.mjs';
// Villager routines: what are they doing at several hours; do they walk through Chewy / each other; snapshots of activities.
const s = await open('/?fresh&nointro&hour=9', { wait: 3000 });
const census = () => s.ev(() => {
  const c = {}; for (const n of G.npcs) { const k = n.state + (n.act?.slot?.kind ? ':' + n.act.slot.kind : n.goal?.kind ? '>' + n.goal.kind : ''); c[k] = (c[k] || 0) + 1; }
  return { hour: +G.day.hour.toFixed(1), n: G.npcs.length, visible: G.npcs.filter(n => n.visible).length, c };
});
console.log(JSON.stringify(await census()));
// overlap monitor: Chewy stands still on the plaza; sample min distances for 40 s of game time at 1x
await s.ev(() => { const L = G.world.landmarks; G.player.setPos(L.plaza.x + 1, L.plaza.z + 2); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap();
  window.__ov = { pc: 1e9, npcPairs: 1e9, npcPairsCount: 0, pcCount: 0, samples: 0, shadowNpc: 1e9 };
  window.__ovT = setInterval(() => { const vs = G.npcs.filter(n => n.visible && !n.seated && n.state !== 'inside'); const p = G.player.pos; const o = window.__ov; o.samples++;
    for (const n of vs) { const d = Math.hypot(n.pos.x - p.x, n.pos.z - p.z); o.pc = Math.min(o.pc, d); if (d < 0.45) o.pcCount++; const ds = Math.hypot(n.pos.x - G.companion.pos.x, n.pos.z - G.companion.pos.z); o.shadowNpc = Math.min(o.shadowNpc, ds); }
    for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) { if (vs[i].chat && vs[i].chat === vs[j].chat) continue; const d = Math.hypot(vs[i].pos.x - vs[j].pos.x, vs[i].pos.z - vs[j].pos.z); o.npcPairs = Math.min(o.npcPairs, d); if (d < 0.4) o.npcPairsCount++; } }, 100); });
for (let i = 0; i < 4; i++) { await s.sleep(10000); await s.snap('70_life_' + i); console.log(JSON.stringify(await census())); }
await s.log('overlap', () => { clearInterval(window.__ovT); return window.__ov; });
// other hours
for (const h of [7, 12, 16, 19.5, 22.5, 1.5]) {
  await s.ev(h => { G.day.hour = h; }, h); await s.sleep(6000);
  console.log(JSON.stringify(await census()));
}
await s.ev(() => { G.day.hour = 19.6; G.engine.rig.distTarget = 30; }); await s.sleep(5000); await s.snap('70_life_evening_wide');
await s.ev(() => { G.day.hour = 22.8; }); await s.sleep(6000); await s.snap('70_life_night_wide');
await s.close();
