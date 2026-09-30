import { open } from './lib.mjs';
// Wind: two frames 400 ms apart with nothing else moving -> pixel diff shows what sways (grass, canopies, bamboo, petals).
const s = await open('/?fresh&nointro&noui&hour=10', { wait: 3500 });
await s.ev(() => { G.player.controlLocked = true; for (const n of G.npcs) { n.visible = false; if (n.rig?.root) n.rig.root.visible = false; } G.companion.rig.root.visible = false; const L = G.world.landmarks; G.player.setPos(L.plaza.x - 14, L.plaza.z + 10); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.distTarget = 16; G.engine.rig.snap(); });
await s.sleep(1500);
await s.snap('42_wind_a'); await s.sleep(400); await s.snap('42_wind_b');
await s.ev(() => { G.engine.rig.distTarget = 30; G.engine.rig.snap(); }); await s.sleep(1200);
await s.snap('42_wind_wide_a'); await s.sleep(400); await s.snap('42_wind_wide_b');
await s.close();
