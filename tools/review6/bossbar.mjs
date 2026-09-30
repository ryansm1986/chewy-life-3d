import { open } from './lib.mjs';
// Boss bar fade + framing: stand on the camera side of the boss (boss projects near the top), wait, snap, read opacity.
const s = await open('/?fresh&nointro&hour=10', { wait: 2500 });
for (const f of [10, 20]) {
  await s.ev(f => { G.state.flags.burrowTut = true; const P = G.state.player; P.lvl = 34; P.stats = { str: 100, dex: 80, vit: 400, ene: 100 }; G.actions.recompute(); P.life = null; G.enterDungeon(f); }, f);
  await s.sleep(5500);
  await s.ev(() => { if (G.ui.dlg.active) G.ui.dlg.finish(-1); for (const m of G.dungeon.monsters) if (m !== G.dungeon.boss) { m.alive = false; m.rig?.root && (m.rig.root.visible = false); m.mesh && (m.mesh.visible = false); } });
  for (const r of [3.5, 6]) {
    await s.ev(r => { const b = G.dungeon.boss; b.aggro = true; const a = Math.PI / 4; for (let k = 0; k < 12; k++) { const x = b.pos.x + Math.cos(a) * (r + k * 0.3), z = b.pos.z + Math.sin(a) * (r + k * 0.3); if (G.world.walkable(x, z)) { G.player.setPos(x, z); break; } } G.state.player.life = null; }, r);
    await s.sleep(2200);
    const info = await s.ev(() => { const e = document.querySelector('.boss'); const cs = e && getComputedStyle(e); const b = G.dungeon.boss; const top = b.pos.clone().setY(b.pos.y + (b.rig?.height || b.height || 2.4)).project(G.engine.camera); const me = G.player.pos.clone().setY(1).project(G.engine.camera); return { barOpacity: cs && +cs.opacity, barRect: e && [Math.round(e.getBoundingClientRect().y), Math.round(e.getBoundingClientRect().bottom)], bossHeadY: Math.round((-top.y * .5 + .5) * innerHeight), chewyY: Math.round((-me.y * .5 + .5) * innerHeight), camDist: +G.engine.rig.dist?.toFixed?.(1) || G.engine.rig.distTarget }; });
    console.log('floor', f, 'r', r, JSON.stringify(info));
    await s.snap(`63_bossbar_f${f}_r${r}`);
  }
  await s.ev(() => G.returnToVillage()); await s.sleep(2500);
}
await s.close();
