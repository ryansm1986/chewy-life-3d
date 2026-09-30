import { open } from './lib.mjs';
// Characters at the real gameplay camera: default distance, close, walking/running cycle, Rosie + villagers.
const s = await open('/?fresh&nointro&hour=10', { wait: 3000 });
await s.log('cam', () => ({ dist: G.engine.rig.distTarget, min: G.engine.rig.minDist, max: G.engine.rig.maxDist, yaw: G.engine.rig.yaw }));
// stage: open plaza spot, Rosie + two villagers next to Chewy
await s.ev(() => {
  const L = G.world.landmarks; const x = L.plaza.x + 3, z = L.plaza.z + 5;
  G.player.setPos(x, z); G.companion.setPos(x + 1.4, z + 0.4);
  const r = G.npcs.find(n => n.id === 'rosie'); const others = G.npcs.filter(n => n.id !== 'rosie').slice(0, 3);
  window.__stage = [r, ...others];
  const spots = [[x - 1.6, z + 0.2], [x + 0.2, z - 1.8], [x - 2.4, z - 1.6], [x + 2.6, z - 1.4]];
  window.__stage.forEach((n, i) => { n.setPos ? n.setPos(spots[i][0], spots[i][1]) : n.pos.set(spots[i][0], n.pos.y, spots[i][1]); n.frozen = true; n.hold = true; if (n.routine) n.routine = null; });
  G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap();
});
await s.sleep(1500);
await s.snap('50_chars_default_cam');
await s.log('npc ids', () => window.__stage.map(n => n.id + '@' + n.pos.x.toFixed(1) + ',' + n.pos.z.toFixed(1)));
await s.ev(() => { G.engine.rig.distTarget = 11; G.engine.rig.snap(); });
await s.sleep(900);
await s.snap('50b_chars_close');
// face camera: turn all toward camera
await s.ev(() => { const c = G.engine.camera.position; for (const a of [G.player, G.companion, ...window.__stage]) { a.faceTo?.(c.x, c.z); if (a.rig?.root) a.rig.root.rotation.y = Math.atan2(c.x - a.pos.x, c.z - a.pos.z); } });
await s.sleep(500);
await s.snap('50c_chars_close_facing');
// walk cycle at default distance
await s.ev(() => { G.engine.rig.distTarget = 20; G.engine.rig.snap(); window.__stage.forEach(n => { n.frozen = false; n.hold = false; }); });
await s.sleep(600);
await s.page.keyboard.down('d');
for (let i = 0; i < 4; i++) { await s.sleep(160); await s.snap('51_walk_' + i); }
await s.page.keyboard.down('s');
await s.sleep(500); await s.snap('51_walk_diag');
await s.page.keyboard.up('s');
await s.page.keyboard.up('d');
await s.sleep(200);
// close walk
await s.ev(() => { G.engine.rig.distTarget = 10; });
await s.page.keyboard.down('a');
for (let i = 0; i < 3; i++) { await s.sleep(220); await s.snap('51b_walk_close_' + i); }
await s.page.keyboard.up('a');
await s.sleep(2200);
await s.snap('51c_idle_close');
await s.sleep(6000);
await s.snap('51d_idle_close_later');
await s.log('companion', () => ({ st: G.companion.state, anim: G.companion.anim.action?.name, d: +G.companion.pos.distanceTo(G.player.pos).toFixed(2), y: +G.companion.pos.y.toFixed(3), ground: +G.world.heightAt(G.companion.pos.x, G.companion.pos.z).toFixed(3) }));
await s.close();
