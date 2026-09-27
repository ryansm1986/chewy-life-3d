import { open } from './lib.mjs';
// Snap boss telegraphs (wind-up / blink wind-up) to judge readability against the arena floor.
const f = +(process.argv[2] || 20);
const s = await open('/?fresh&nointro&hour=10', { wait: 2500 });
await s.ev(f => { G.state.flags.burrowTut = true; const P = G.state.player; P.lvl = 34; P.stats = { str: 100, dex: 80, vit: 300, ene: 100 }; G.actions.recompute(); P.life = null; G.enterDungeon(f); }, f);
await s.sleep(5500);
await s.ev(() => { if (G.ui.dlg.active) G.ui.dlg.finish(-1); const b = G.dungeon.boss; for (const m of G.dungeon.monsters) if (m !== b && m.pos.distanceTo(b.pos) < 14) { m.alive = false; m.world.scene.remove(m.model.root, m.shadow); }
  let best = null; for (let a = 0; a < 48; a++) { const x = b.pos.x + Math.cos(a / 48 * 6.283) * 6, z = b.pos.z + Math.sin(a / 48 * 6.283) * 6; if (!G.world.walkable(x, z)) continue; const sc = (x - b.pos.x) + (z - b.pos.z); if (!best || sc > best.sc) best = { x, z, sc }; }
  G.player.setPos(best.x, best.z); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap(); });
const seen = new Set(); const t0 = Date.now();
while (Date.now() - t0 < 40000 && seen.size < 4) {
  const st = await s.ev(() => { G.state.player.life = null; return G.dungeon.boss?.state; });
  if (['windup', 'blinkwind', 'rest', 'cast'].includes(st) && !seen.has(st)) { seen.add(st); await s.sleep(st === 'windup' ? 250 : 200); await s.snap(`76_tele${f}_${st}`); }
  await s.sleep(60);
}
console.log('captured', [...seen]);
await s.close();
