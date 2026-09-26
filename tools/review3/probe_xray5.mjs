import { open } from './lib.mjs';
import path from 'node:path';
const s = await open('/?fresh&nointro&hour=12', { wait: 3000 });
await s.ev(() => { const c = G.companion; c.__u = c.update; c.update = function (dt) { }; G.player.controlLocked = true; c.setPos(59.1, 64.1); });
await s.sleep(500);
const clip = await s.ev(() => { const c = G.companion; const v = c.pos.clone().setY(c.pos.y + 0.25).project(G.engine.camera); return { x: Math.round((v.x * .5 + .5) * innerWidth) - 90, y: Math.round((-v.y * .5 + .5) * innerHeight) - 90, width: 180, height: 180 }; });
const OUT = 'C:/Users/there/AppData/Local/Temp/claude/D--projects-chewy-life-3d/8589dfce-d448-4273-9d64-a50029bd572d/scratchpad/review3';
const shot = async (n) => { await s.sleep(250); await s.page.screenshot({ path: path.join(OUT, 'p_x5_' + n + '.png'), clip }); };
await shot('a_base');
await s.ev(() => { G.companion.rig.xrayMat.visible = false; }); await shot('b_noxray'); await s.ev(() => { G.companion.rig.xrayMat.visible = true; });
// list top-level scene children
console.log(await s.ev(() => G.world.scene.children.map(o => (o.name || o.type) + (o.isMesh ? '[m]' : '') ).join(', ')));
const groups = await s.ev(() => G.world.scene.children.map((o, i) => [i, o.name || o.type]).filter(([i, n]) => !/Shadow|Chewy|Light|Camera/.test(n)));
// hide each top-level child one at a time, check if ghost persists (measure pale-blue pixel count via canvas readback not possible -> screenshot)
let k = 0;
for (const [i, n] of groups) {
  await s.ev(i => { G.world.scene.children[i].visible = false; }, i);
  await shot('c_' + (k++) + '_' + String(n).replace(/[^a-z0-9]/gi, '').slice(0, 20));
  await s.ev(i => { G.world.scene.children[i].visible = true; }, i);
}
await s.close();
