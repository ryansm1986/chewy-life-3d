import { open } from './lib.mjs';
const s = await open('/?fresh&nointro&noui&hour=10', { wait: 3500 });
await s.ev(() => { G.player.controlLocked = true; for (const n of G.npcs) n.visible = false; G.companion.rig.root.visible = false; });
await s.sleep(500);
await s.snap('42_wind_a');
await s.sleep(700);
await s.snap('42_wind_b');
await s.close();
