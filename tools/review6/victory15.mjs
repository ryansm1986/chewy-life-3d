import { open } from './lib.mjs';
// Oni Chef + Tamamo victory moments: bring the boss to 1 hp, land a real click, snap the victory frames.
for (const f of [15, 20]) {
  const s = await open('/?fresh&nointro&hour=10', { wait: 2500 });
  await s.ev(f => { G.state.flags.burrowTut = true; const P = G.state.player; P.lvl = 34; P.stats = { str: 120, dex: 80, vit: 300, ene: 100 }; G.actions.recompute(); P.life = null; G.enterDungeon(f); }, f);
  await s.sleep(5500);
  await s.ev(() => { if (G.ui.dlg.active) G.ui.dlg.finish(-1); const b = G.dungeon.boss; for (const m of G.dungeon.monsters) if (m !== b && m.pos.distanceTo(b.pos) < 16) { m.alive = false; m.rig?.root && (m.rig.root.visible = false); m.mesh && (m.mesh.visible = false); }
    G.player.setPos(b.pos.x + 2.2, b.pos.z + 2.2); G.engine.rig.focus.copy(G.player.pos); G.engine.rig.snap?.();
    window.__scr = (p, y = 0.8) => { const v = p.clone().setY(p.y + y).project(G.engine.camera); return [Math.round((v.x * .5 + .5) * innerWidth), Math.round((-v.y * .5 + .5) * innerHeight)]; }; });
  await s.sleep(1500);
  await s.ev(() => { const b = G.dungeon.boss; b.life = 5; });
  for (let i = 0; i < 10; i++) { const sc = await s.ev(() => G.dungeon.boss?.alive ? __scr(G.dungeon.boss.pos) : null); if (!sc) break; await s.page.mouse.move(sc[0], sc[1]); await s.page.mouse.down(); await s.sleep(300); await s.page.mouse.up(); await s.ev(() => { G.state.player.life = null; }); }
  for (let i = 0; i < 4; i++) { await s.sleep(i === 0 ? 300 : 900); await s.snap(`97_victory${f}_${i}`); }
  await s.sleep(2500); await s.snap(`97_victory${f}_loot`);
  await s.log('loot', () => G.dungeon.loot.list.map(l => l.d.item ? l.d.item.rarity + ':' + l.d.item.name : l.d.type));
  await s.close();
}
