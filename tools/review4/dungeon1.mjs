import { open } from './lib.mjs';
const s = await open('/?fresh&nointro&hour=10', { wait: 2500 });
await s.ev(() => {
  window.__scr = (p) => { const v = p.clone().setY(p.y + 0.5).project(G.engine.camera); return [Math.round((v.x * .5 + .5) * innerWidth), Math.round((-v.y * .5 + .5) * innerHeight)]; };
  window.__near = () => { let b = null, bd = 1e9; for (const m of (G.dungeon?.monsters || [])) { if (!m.alive) continue; const d = m.pos.distanceTo(G.player.pos); if (d < bd) { bd = d; b = m; } } return b; };
});
// walk to gate and press F
await s.ev(() => { const it = G.world.interactables.find(i => /Burrow/.test(i.label)); G.player.setPos(it.pos.x + 0.3, it.pos.z + 0.6); G.companion.setPos(it.pos.x + 1.5, it.pos.z + 1.2); });
await s.sleep(1500);
await s.snap('20_gate');
await s.ev(() => { G.interactCooldown = 0; });
await s.key('f');
for (let i = 0; i < 5; i++) { await s.sleep(160); await s.snap('20a_transition_' + i); }
await s.sleep(3500);
await s.snap('20b_floor1_tutorial');
await s.log('tut', () => ({ active: G.ui.dlg.active, lines: G.ui.dlg.lines?.map(l => l.text) }));
await s.skipDlg(); await s.sleep(800);
await s.snap('20c_floor1_start');
console.log('floor1 fps', JSON.stringify(await s.fps(2500)), JSON.stringify(await s.stats()));
await s.log('floor1', () => ({ mons: G.dungeon.monsters.length, alive: G.dungeon.monsters.filter(m => m.alive).length, names: [...new Set(G.dungeon.monsters.map(m => m.name))].slice(0, 20), theme: G.dungeon.theme.name }));
// approach nearest pack
await s.ev(() => { const m = __near(); const d = m.pos.clone().sub(G.player.pos).normalize(); const p = m.pos.clone().addScaledVector(d, -6); G.player.setPos(p.x, p.z); G.companion.setPos(p.x + 0.8, p.z + 0.6); });
await s.sleep(900);
await s.snap('21_pre_fight');
// hold LMB on nearest monster, re-aim as it moves
await s.page.mouse.down();
for (let i = 0; i < 24; i++) {
  const sc = await s.ev(() => { const m = __near(); return m ? __scr(m.pos) : null; });
  if (sc) await s.page.mouse.move(sc[0], sc[1]);
  await s.sleep(130);
  if (i % 6 === 3) await s.snap('21b_fight_lmb_' + i);
}
await s.page.mouse.up();
// RMB chomp
for (let i = 0; i < 10; i++) {
  const sc = await s.ev(() => { const m = __near(); return m ? __scr(m.pos) : null; });
  if (!sc) break;
  await s.page.mouse.move(sc[0], sc[1]); await s.page.mouse.down({ button: 'right' }); await s.sleep(120); await s.page.mouse.up({ button: 'right' });
  if (i === 1 || i === 4) await s.snap('21c_fight_rmb_' + i);
  await s.sleep(200);
}
await s.log('state', () => ({ life: G.state.player.life, lifeMax: G.derived.lifeMax, lvl: G.state.player.lvl, xp: G.state.player.xp, kills: G.story.uiList().map(q => q.steps.map(x => x.have + '/' + x.need).join()), loot: G.dungeon.loot.list.length }));
// swap to ball and throw
await s.key('x'); await s.sleep(500);
await s.snap('22_swap_ball');
await s.ev(() => { const m = __near(); if (!m) return; const d = m.pos.clone().sub(G.player.pos).normalize(); const p = m.pos.clone().addScaledVector(d, -7); G.player.setPos(p.x, p.z); });
await s.sleep(400);
await s.page.mouse.down();
for (let i = 0; i < 20; i++) {
  const sc = await s.ev(() => { const m = __near(); return m ? __scr(m.pos) : null; });
  if (sc) await s.page.mouse.move(sc[0], sc[1]);
  await s.sleep(110);
  if (i === 5 || i === 12) await s.snap('22b_ball_' + i);
}
await s.page.mouse.up();
await s.sleep(800);
await s.snap('22c_after');
await s.log('state2', () => ({ life: G.state.player.life, lvl: G.state.player.lvl, xp: G.state.player.xp, loot: G.dungeon.loot.list.map(l => l.d.type + ':' + (l.d.item?.rarity || l.d.item?.name || l.d.amount || '')).slice(0, 12) }));
await s.close();
